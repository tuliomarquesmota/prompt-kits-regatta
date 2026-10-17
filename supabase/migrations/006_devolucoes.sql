-- =====================================================================
-- LOTE · 006 · cancelar pedido e devolução de caixas com credit note
-- Depende de 001 a 005.
-- No Reino Unido a invoice emitida não se apaga: devolução gera credit note.
-- =====================================================================

-- ---------- Caixa devolvida pode sair de novo ----------
-- Antes: uma caixa só aparecia uma vez em shipment_boxes. Agora a trava vale só
-- para saídas que não foram devolvidas.
alter table shipment_boxes add column returned_at timestamptz;
alter table shipment_boxes drop constraint shipment_boxes_box_id_key;
create unique index shipment_boxes_active_box on shipment_boxes(box_id) where returned_at is null;

-- ---------- Credit notes ----------
create table credit_notes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  number         text not null,                -- "CN-0001"
  invoice_id     uuid not null references invoices(id),
  customer_id    uuid not null references customers(id),
  issued_on      date not null default current_date,
  reason         text,
  restocked      boolean not null,             -- caixas voltaram para o stock?
  total          numeric(12,2) not null default 0,
  status         invoice_status not null default 'draft',
  quickbooks_id  text,
  synced_at      timestamptz,
  created_by     uuid references auth.users(id),
  unique (org_id, number)
);

create table credit_note_lines (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  credit_note_id  uuid not null references credit_notes(id) on delete cascade,
  product_id      uuid not null references products(id),
  boxes           int not null,
  weight_kg       numeric(10,3) not null,
  price_kg        numeric(10,2) not null,
  amount          numeric(12,2) not null,
  lots            text[],
  box_ids         uuid[] not null                -- caixas exatas devolvidas
);

alter table credit_notes enable row level security;
alter table credit_note_lines enable row level security;
create policy credit_notes_member_access on credit_notes
  for all using (is_member(org_id)) with check (is_member(org_id));
create policy credit_note_lines_member_access on credit_note_lines
  for all using (is_member(org_id)) with check (is_member(org_id));

-- ---------- Cancelar pedido que ainda não saiu ----------
create or replace function cancel_order(order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select id, org_id, status into o from sales_orders where id = order_id for update;
  if o.id is null then raise exception 'Pedido não encontrado.'; end if;
  if not is_member(o.org_id) then raise exception 'Sem acesso a esta empresa.'; end if;
  if o.status = 'cancelled' then return; end if;
  if o.status not in ('draft', 'confirmed', 'picking') then
    raise exception 'Este pedido já foi expedido. Para desfazer, faça uma devolução na invoice.';
  end if;
  update sales_orders set status = 'cancelled' where id = o.id;
end $$;

-- ---------- Devolver caixas de uma invoice ----------
-- restock = true: a caixa volta para o stock (bloqueada se já venceu).
-- restock = false: a caixa é descartada (written_off).
-- O valor usa o mesmo preço por kg da venda e o peso real de cada caixa.
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

  -- Cada caixa: saiu nesta invoice e ainda não foi devolvida
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

  insert into credit_note_lines(org_id, credit_note_id, product_id, boxes, weight_kg, price_kg, amount, lots, box_ids)
  select inv.org_id, v_credit, b.product_id, count(*), sum(b.net_weight_kg), sb.price_kg,
         round(sum(b.net_weight_kg) * sb.price_kg, 2),
         array_remove(array_agg(distinct b.lot), null),
         array_agg(b.id)
    from shipment_boxes sb join boxes b on b.id = sb.box_id
   where sb.shipment_id = inv.shipment_id and sb.box_id = any(ids)
   group by b.product_id, sb.price_kg;

  update credit_notes
     set total = (select coalesce(sum(amount), 0) from credit_note_lines l where l.credit_note_id = v_credit)
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

  return v_credit;
end $$;

revoke execute on function cancel_order(uuid) from public, anon;
revoke execute on function return_boxes(uuid, uuid[], text, boolean) from public, anon;
grant execute on function cancel_order(uuid) to authenticated;
grant execute on function return_boxes(uuid, uuid[], text, boolean) to authenticated;
