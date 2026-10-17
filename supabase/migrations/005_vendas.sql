-- =====================================================================
-- LOTE · 005 · vendas: pedido → expedição por scan → invoice pelo peso real
-- Depende de 001 a 004.
-- =====================================================================

-- ---------- Numeração dos documentos por empresa (SO-0001, INV-0001…) ----------
create table doc_counters (
  org_id  uuid not null references organizations(id) on delete cascade,
  kind    text not null,
  last    integer not null default 0,
  primary key (org_id, kind)
);
alter table doc_counters enable row level security;
create policy doc_counters_member_read on doc_counters for select using (is_member(org_id));

-- Uso interno das funções abaixo; ninguém chama direto pela API
create or replace function next_doc_number(target_org uuid, doc_kind text, prefix text)
returns text language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into doc_counters(org_id, kind, last) values (target_org, doc_kind, 1)
  on conflict (org_id, kind) do update set last = doc_counters.last + 1
  returning last into n;
  return prefix || lpad(n::text, 4, '0');
end $$;

-- ---------- Criar pedido de venda ----------
-- lines: [{"product_id": "...", "boxes": 3, "price_kg": 14.90}, ...]
-- O preço por kg de cada produto fica lembrado para o cliente (customer_prices).
create or replace function create_sales_order(
  target_org uuid, customer uuid, lines jsonb, delivery date default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  order_id uuid;
  line jsonb;
  pid uuid;
  qty integer;
  price numeric(10,2);
begin
  if not is_member(target_org) then raise exception 'Sem acesso a esta empresa.'; end if;
  if not exists (select 1 from customers where id = customer and org_id = target_org) then
    raise exception 'Cliente não encontrado.';
  end if;
  if lines is null or jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) = 0 then
    raise exception 'O pedido precisa de pelo menos um produto.';
  end if;

  insert into sales_orders(org_id, number, customer_id, status, delivery_on)
  values (target_org, next_doc_number(target_org, 'so', 'SO-'), customer, 'confirmed', delivery)
  returning id into order_id;

  for line in select * from jsonb_array_elements(lines) loop
    pid := (line->>'product_id')::uuid;
    qty := (line->>'boxes')::integer;
    price := (line->>'price_kg')::numeric;
    if not exists (select 1 from products where id = pid and org_id = target_org) then
      raise exception 'Produto não encontrado.';
    end if;
    if qty is null or qty <= 0 then raise exception 'Quantidade de caixas inválida.'; end if;
    if price is null or price < 0 then raise exception 'Preço por kg inválido.'; end if;

    insert into sales_order_lines(org_id, sales_order_id, product_id, boxes_requested, price_kg)
    values (target_org, order_id, pid, qty, price);

    insert into customer_prices(org_id, customer_id, product_id, price_kg)
    values (target_org, customer, pid, price)
    on conflict (customer_id, product_id) do update set price_kg = excluded.price_kg;
  end loop;

  return order_id;
end $$;

-- ---------- Expedir: as caixas bipadas saem do stock e a invoice é gerada ----------
-- Tudo numa transação: ou expede tudo, ou nada.
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

  -- Cada caixa: desta empresa, em stock, dentro da validade e de um produto do pedido
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

  -- Uma linha por produto: soma dos pesos reais × preço por kg, com os lotes para rastreabilidade
  insert into invoice_lines(org_id, invoice_id, product_id, boxes, weight_kg, price_kg, amount, lots)
  select o.org_id, v_invoice, b.product_id, count(*), sum(b.net_weight_kg), sb.price_kg,
         round(sum(b.net_weight_kg) * sb.price_kg, 2),
         array_remove(array_agg(distinct b.lot), null)
    from shipment_boxes sb join boxes b on b.id = sb.box_id
   where sb.shipment_id = v_shipment
   group by b.product_id, sb.price_kg;

  update invoices
     set total = (select coalesce(sum(amount), 0) from invoice_lines where invoice_lines.invoice_id = v_invoice)
   where id = v_invoice;

  update sales_orders set status = 'invoiced' where id = o.id;
  return v_invoice;
end $$;

-- Só usuários logados; a numeração é interna
revoke execute on function next_doc_number(uuid, text, text) from public, anon, authenticated;
revoke execute on function create_sales_order(uuid, uuid, jsonb, date) from public, anon;
revoke execute on function ship_order(uuid, uuid[]) from public, anon;
grant execute on function create_sales_order(uuid, uuid, jsonb, date) to authenticated;
grant execute on function ship_order(uuid, uuid[]) to authenticated;
