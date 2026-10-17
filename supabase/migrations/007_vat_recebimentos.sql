-- =====================================================================
-- LOTE · 007 · VAT por produto e contas a receber (base da fase 3)
-- Depende de 001 a 006.
-- Convenção: `total` das invoices e credit notes continua sendo o valor SEM VAT;
-- `vat_total` é o VAT; o cliente paga total + vat_total.
-- =====================================================================

-- ---------- VAT ----------
-- No Reino Unido: 0 (zero-rated, ex.: a maior parte da carne fresca), 5 (reduzida) ou 20 (padrão).
-- A taxa certa de cada produto é decisão do contador.
alter table products add column vat_rate numeric(5,2) not null default 0
  check (vat_rate in (0, 5, 20));

alter table invoice_lines add column vat_rate numeric(5,2) not null default 0;
alter table invoice_lines add column vat_amount numeric(12,2) not null default 0;
alter table invoices add column vat_total numeric(12,2) not null default 0;

alter table credit_note_lines add column vat_rate numeric(5,2) not null default 0;
alter table credit_note_lines add column vat_amount numeric(12,2) not null default 0;
alter table credit_notes add column vat_total numeric(12,2) not null default 0;

-- ---------- Pagamentos recebidos ----------
create table payments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  invoice_id  uuid not null references invoices(id),
  customer_id uuid not null references customers(id),
  amount      numeric(12,2) not null check (amount > 0),
  paid_on     date not null default current_date,
  method      text not null default 'transferencia',  -- transferencia, cartao, dinheiro, cheque, outro
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
alter table payments enable row level security;
create policy payments_member_access on payments
  for all using (is_member(org_id)) with check (is_member(org_id));

-- Saldo de cada invoice: valor com VAT − credit notes − pagamentos
create view invoice_balances with (security_invoker = true) as
select
  i.id, i.org_id, i.number, i.customer_id, c.name as customer, i.issued_on, i.due_on, i.status,
  i.total + i.vat_total as gross,
  coalesce(cn.credited, 0) as credited,
  coalesce(p.paid, 0) as paid,
  i.total + i.vat_total - coalesce(cn.credited, 0) - coalesce(p.paid, 0) as balance
from invoices i
join customers c on c.id = i.customer_id
left join (select invoice_id, sum(total + vat_total) as credited from credit_notes group by invoice_id) cn
  on cn.invoice_id = i.id
left join (select invoice_id, sum(amount) as paid from payments group by invoice_id) p
  on p.invoice_id = i.id
where i.status <> 'void';

-- Registra um pagamento. Quando o saldo chega a zero, a invoice vira 'paid'.
create or replace function record_payment(
  invoice_id uuid, amount numeric, paid_on date default current_date,
  method text default 'transferencia', note text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv record;
  v_balance numeric(12,2);
  v_payment uuid;
begin
  select i.id, i.org_id, i.customer_id, i.status into inv
    from invoices i where i.id = record_payment.invoice_id for update;
  if inv.id is null then raise exception 'Invoice não encontrada.'; end if;
  if not is_member(inv.org_id) then raise exception 'Sem acesso a esta empresa.'; end if;
  if inv.status = 'void' then raise exception 'Esta invoice foi anulada.'; end if;
  if amount is null or amount <= 0 then raise exception 'Valor do pagamento inválido.'; end if;

  select balance into v_balance from invoice_balances b where b.id = inv.id;
  if round(amount, 2) > v_balance then
    raise exception 'O valor passa do saldo em aberto (£%). Confira o valor.', v_balance;
  end if;

  insert into payments(org_id, invoice_id, customer_id, amount, paid_on, method, note, created_by)
  values (inv.org_id, inv.id, inv.customer_id, round(amount, 2), coalesce(paid_on, current_date),
          coalesce(nullif(trim(method), ''), 'transferencia'), nullif(trim(note), ''), auth.uid())
  returning id into v_payment;

  if v_balance - round(amount, 2) <= 0 then
    update invoices set status = 'paid' where id = inv.id;
  end if;
  return v_payment;
end $$;

-- ---------- Expedir: agora com VAT por linha ----------
create or replace function ship_order(order_id uuid, box_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  o record;
  ids uuid[];
  valid_count integer;
  v_shipment uuid;
  v_invoice uuid;
  terms integer;
begin
  select id, org_id, customer_id, status into o from sales_orders where id = order_id for update;
  if o.id is null then raise exception 'Pedido não encontrado.'; end if;
  if not is_member(o.org_id) then raise exception 'Sem acesso a esta empresa.'; end if;
  if o.status not in ('confirmed', 'picking') then raise exception 'Este pedido já foi expedido ou cancelado.'; end if;

  ids := array(select distinct unnest(box_ids));
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'Bipe pelo menos uma caixa.'; end if;

  select count(*) into valid_count
    from boxes b
   where b.id = any(ids)
     and b.org_id = o.org_id
     and b.status = 'in_stock'
     and (b.use_by is null or b.use_by >= current_date)
     and b.product_id in (select product_id from sales_order_lines where sales_order_id = o.id);
  if valid_count <> array_length(ids, 1) then
    raise exception 'Alguma caixa não pode sair: já foi vendida, está vencida, bloqueada ou não é de um produto do pedido. Atualize a tela e bipe de novo.';
  end if;

  insert into shipments(org_id, sales_order_id, shipped_at, shipped_by)
  values (o.org_id, o.id, now(), auth.uid())
  returning id into v_shipment;

  insert into shipment_boxes(shipment_id, box_id, org_id, price_kg)
  select v_shipment, b.id, o.org_id, l.price_kg
    from boxes b
    join lateral (
      select price_kg from sales_order_lines
       where sales_order_id = o.id and product_id = b.product_id
       order by price_kg desc limit 1
    ) l on true
   where b.id = any(ids);

  insert into stock_movements(org_id, box_id, type, from_location, ref_table, ref_id, by_user)
  select o.org_id, b.id, 'shipped', b.location_id, 'shipments', v_shipment, auth.uid()
    from boxes b where b.id = any(ids);

  update boxes set status = 'shipped' where id = any(ids);

  select payment_terms into terms from customers where id = o.customer_id;

  insert into invoices(org_id, number, customer_id, shipment_id, issued_on, due_on, status)
  values (o.org_id, next_doc_number(o.org_id, 'inv', 'INV-'), o.customer_id, v_shipment,
          current_date, current_date + coalesce(terms, 30), 'draft')
  returning id into v_invoice;

  insert into invoice_lines(org_id, invoice_id, product_id, boxes, weight_kg, price_kg, amount, lots, vat_rate, vat_amount)
  select o.org_id, v_invoice, g.product_id, g.boxes, g.weight_kg, g.price_kg, g.amount, g.lots,
         g.vat_rate, round(g.amount * g.vat_rate / 100, 2)
    from (
      select b.product_id, count(*) as boxes, sum(b.net_weight_kg) as weight_kg, sb.price_kg,
             round(sum(b.net_weight_kg) * sb.price_kg, 2) as amount,
             array_remove(array_agg(distinct b.lot), null) as lots,
             p.vat_rate
        from shipment_boxes sb
        join boxes b on b.id = sb.box_id
        join products p on p.id = b.product_id
       where sb.shipment_id = v_shipment
       group by b.product_id, sb.price_kg, p.vat_rate
    ) g;

  update invoices
     set total = (select coalesce(sum(amount), 0) from invoice_lines l where l.invoice_id = v_invoice),
         vat_total = (select coalesce(sum(vat_amount), 0) from invoice_lines l where l.invoice_id = v_invoice)
   where id = v_invoice;

  update sales_orders set status = 'invoiced' where id = o.id;
  return v_invoice;
end $$;

-- ---------- Devolução: VAT com a mesma taxa da venda ----------
create or replace function return_boxes(invoice_id uuid, box_ids uuid[], reason text, restock boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv record;
  ids uuid[];
  valid_count integer;
  v_credit uuid;
begin
  select i.id, i.org_id, i.customer_id, i.shipment_id into inv
    from invoices i where i.id = return_boxes.invoice_id for update;
  if inv.id is null then raise exception 'Invoice não encontrada.'; end if;
  if not is_member(inv.org_id) then raise exception 'Sem acesso a esta empresa.'; end if;

  ids := array(select distinct unnest(box_ids));
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'Escolha pelo menos uma caixa.'; end if;

  select count(*) into valid_count
    from shipment_boxes sb
   where sb.shipment_id = inv.shipment_id and sb.box_id = any(ids) and sb.returned_at is null;
  if valid_count <> array_length(ids, 1) then
    raise exception 'Alguma caixa não é desta invoice ou já foi devolvida. Atualize a tela e tente de novo.';
  end if;

  insert into credit_notes(org_id, number, invoice_id, customer_id, reason, restocked, created_by)
  values (inv.org_id, next_doc_number(inv.org_id, 'cn', 'CN-'), inv.id, inv.customer_id,
          nullif(trim(reason), ''), restock, auth.uid())
  returning id into v_credit;

  insert into credit_note_lines(org_id, credit_note_id, product_id, boxes, weight_kg, price_kg, amount, lots, box_ids,
                                vat_rate, vat_amount)
  select inv.org_id, v_credit, g.product_id, g.boxes, g.weight_kg, g.price_kg, g.amount, g.lots, g.box_ids,
         g.vat_rate, round(g.amount * g.vat_rate / 100, 2)
    from (
      select b.product_id, count(*) as boxes, sum(b.net_weight_kg) as weight_kg, sb.price_kg,
             round(sum(b.net_weight_kg) * sb.price_kg, 2) as amount,
             array_remove(array_agg(distinct b.lot), null) as lots,
             array_agg(b.id) as box_ids,
             coalesce((select il.vat_rate from invoice_lines il
                        where il.invoice_id = inv.id and il.product_id = b.product_id limit 1), 0) as vat_rate
        from shipment_boxes sb join boxes b on b.id = sb.box_id
       where sb.shipment_id = inv.shipment_id and sb.box_id = any(ids)
       group by b.product_id, sb.price_kg
    ) g;

  update credit_notes
     set total = (select coalesce(sum(amount), 0) from credit_note_lines l where l.credit_note_id = v_credit),
         vat_total = (select coalesce(sum(vat_amount), 0) from credit_note_lines l where l.credit_note_id = v_credit)
   where id = v_credit;

  update shipment_boxes set returned_at = now()
   where shipment_id = inv.shipment_id and box_id = any(ids);

  insert into stock_movements(org_id, box_id, type, ref_table, ref_id, by_user)
  select inv.org_id, b.id, 'returned', 'credit_notes', v_credit, auth.uid()
    from boxes b where b.id = any(ids);

  if restock then
    update boxes
       set status = case when use_by is not null and use_by < current_date then 'blocked'::box_status
                         else 'in_stock'::box_status end
     where id = any(ids);
  else
    insert into stock_movements(org_id, box_id, type, ref_table, ref_id, by_user)
    select inv.org_id, b.id, 'written_off', 'credit_notes', v_credit, auth.uid()
      from boxes b where b.id = any(ids);
    update boxes set status = 'written_off' where id = any(ids);
  end if;

  -- Se a credit note zerou o saldo, a invoice está quitada
  if (select balance from invoice_balances where id = inv.id) <= 0 then
    update invoices set status = 'paid' where id = inv.id;
  end if;

  return v_credit;
end $$;

revoke execute on function record_payment(uuid, numeric, date, text, text) from public, anon;
grant execute on function record_payment(uuid, numeric, date, text, text) to authenticated;
