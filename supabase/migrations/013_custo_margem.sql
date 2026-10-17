-- =====================================================================
-- LOTE · 013 · custo por caixa (landed cost) e margem
-- Depende de 001 a 012.
-- Custo da caixa = preço por kg do fornecedor para o produto
--                + custos extras da entrega (frete, porto, inspeção) rateados por kg.
-- É informação de gestão: a contabilidade continua lançando as compras como despesa
-- (método periódico) até o contador decidir outra coisa.
-- =====================================================================

alter table receipts add column reference text;                 -- ex.: "Container MSCU1234567"
alter table receipts add column extra_costs numeric(12,2) not null default 0 check (extra_costs >= 0);
alter table receipts add column costed_at timestamptz;

-- Preço por kg de cada produto numa entrega (da invoice do fornecedor)
create table receipt_costs (
  receipt_id  uuid not null references receipts(id) on delete cascade,
  product_id  uuid not null references products(id),
  org_id      uuid not null references organizations(id) on delete cascade,
  price_kg    numeric(10,4) not null check (price_kg >= 0),
  primary key (receipt_id, product_id)
);
alter table receipt_costs enable row level security;
create policy receipt_costs_member_access on receipt_costs
  for all using (is_member(org_id)) with check (is_member(org_id));

-- Resumo de cada entrega: caixas e kg por produto
create view receipt_products with (security_invoker = true) as
select b.receipt_id, b.org_id, b.product_id, p.name as product,
       count(*) as boxes, sum(b.net_weight_kg) as weight_kg,
       rc.price_kg
  from boxes b
  join products p on p.id = b.product_id
  left join receipt_costs rc on rc.receipt_id = b.receipt_id and rc.product_id = b.product_id
 where b.receipt_id is not null
 group by b.receipt_id, b.org_id, b.product_id, p.name, rc.price_kg;

-- Grava os preços da entrega e recalcula o custo de cada caixa.
-- prices: [{"product_id": "...", "price_kg": 9.80}, ...]
create or replace function set_receipt_costs(receipt uuid, prices jsonb, extras numeric, ref text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  item jsonb;
  total_kg numeric;
  extra_kg numeric;
begin
  select id, org_id into r from receipts where id = receipt for update;
  if r.id is null then raise exception 'Entrega não encontrada.'; end if;
  if not is_member(r.org_id) then raise exception 'Sem acesso a esta empresa.'; end if;
  if extras is null or extras < 0 then raise exception 'Custos extras inválidos.'; end if;

  for item in select * from jsonb_array_elements(coalesce(prices, '[]'::jsonb)) loop
    if (item->>'price_kg') is null or (item->>'price_kg')::numeric < 0 then
      raise exception 'Preço por kg inválido.';
    end if;
    insert into receipt_costs(receipt_id, product_id, org_id, price_kg)
    values (r.id, (item->>'product_id')::uuid, r.org_id, round((item->>'price_kg')::numeric, 4))
    on conflict (receipt_id, product_id) do update set price_kg = excluded.price_kg;
  end loop;

  select coalesce(sum(net_weight_kg), 0) into total_kg from boxes where receipt_id = r.id;
  extra_kg := case when total_kg > 0 then round(extras / total_kg, 4) else 0 end;

  update receipts set extra_costs = round(extras, 2), reference = nullif(trim(ref), ''), costed_at = now()
   where id = r.id;

  -- Caixas de produto sem preço ficam sem custo (null)
  update boxes b
     set cost_per_kg = rc.price_kg + extra_kg
    from receipt_costs rc
   where b.receipt_id = r.id and rc.receipt_id = r.id and rc.product_id = b.product_id;
end $$;

revoke execute on function set_receipt_costs(uuid, jsonb, numeric, text) from public, anon;
grant execute on function set_receipt_costs(uuid, jsonb, numeric, text) to authenticated;

-- Margem de cada venda: valor sem VAT − custo das caixas que saíram (e não voltaram)
create view sale_margins with (security_invoker = true) as
select i.id as invoice_id, i.org_id, i.number, i.issued_on, i.customer_id, c.name as customer,
       b.product_id, p.name as product,
       count(*) as boxes,
       sum(b.net_weight_kg) as weight_kg,
       round(sum(b.net_weight_kg * sb.price_kg), 2) as revenue,
       round(sum(b.net_weight_kg * b.cost_per_kg), 2) as cost,
       count(*) filter (where b.cost_per_kg is null) as boxes_without_cost
  from invoices i
  join customers c on c.id = i.customer_id
  join shipment_boxes sb on sb.shipment_id = i.shipment_id and sb.returned_at is null
  join boxes b on b.id = sb.box_id
  join products p on p.id = b.product_id
 where i.status <> 'void'
 group by i.id, i.org_id, i.number, i.issued_on, i.customer_id, c.name, b.product_id, p.name;

-- Valor do stock atual pelo custo de cada caixa
create view stock_value with (security_invoker = true) as
select org_id,
       round(coalesce(sum(net_weight_kg * cost_per_kg), 0), 2) as value,
       count(*) as boxes,
       count(*) filter (where cost_per_kg is null) as boxes_without_cost,
       coalesce(sum(net_weight_kg), 0) as weight_kg
  from boxes
 where status in ('in_stock', 'reserved', 'blocked')
 group by org_id;
