-- =====================================================================
-- LOTE · Fase 1 (substitui o SOS Inventory)
-- Banco: Postgres no Supabase
-- Como usar: Supabase > SQL Editor > colar e rodar este arquivo inteiro.
--
-- Regra de ouro: toda tabela de dados tem org_id e Row Level Security.
-- Um usuário só enxerga as linhas das empresas de que é membro.
-- =====================================================================

-- ---------- Empresas e usuários (multi-tenant) ----------
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create type member_role as enum ('owner', 'admin', 'staff');

create table memberships (
  org_id   uuid not null references organizations(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  role     member_role not null default 'staff',
  primary key (org_id, user_id)
);

-- Usada por todas as políticas de segurança abaixo
create or replace function is_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.org_id = target_org and m.user_id = auth.uid()
  );
$$;

-- ---------- Cadastros ----------
create table suppliers (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  country     text,
  created_at  timestamptz not null default now()
);

-- Perfil de etiqueta: como reconhecer e interpretar a etiqueta de cada fornecedor
-- match: {"tipo":"gs1","prefixo_gtin":"9332218"}  ou  {"tipo":"regex","padrao":"^2\\d{12}$"}
-- rules: {"shelf_dias":140,"lote":"yyddd","peso_kg":[15,30]}
create table label_profiles (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  supplier_id  uuid not null references suppliers(id) on delete cascade,
  name         text not null,
  match        jsonb not null,
  rules        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create table products (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  supplier_id        uuid references suppliers(id),
  name               text not null,          -- "Picanha"
  sku                text,                   -- código interno
  gtin               text,                   -- (01) da etiqueta
  min_box_kg         numeric(8,3),           -- trava de leitura errada
  max_box_kg         numeric(8,3),
  default_price_kg   numeric(10,2),
  created_at         timestamptz not null default now(),
  unique (org_id, gtin)
);

create table locations (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references organizations(id) on delete cascade,
  name    text not null,                     -- "Câmara 1 · A3"
  unique (org_id, name)
);

create table customers (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  name            text not null,
  email           text,
  payment_terms   int not null default 30,   -- dias
  credit_limit    numeric(12,2),
  quickbooks_id   text,                      -- vínculo com o cliente no QuickBooks
  created_at      timestamptz not null default now()
);

-- Preço por kg específico de um cliente (sobrepõe o default_price_kg)
create table customer_prices (
  org_id       uuid not null references organizations(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete cascade,
  product_id   uuid not null references products(id) on delete cascade,
  price_kg     numeric(10,2) not null,
  primary key (customer_id, product_id)
);

-- ---------- Compras e recebimento ----------
create type po_status as enum ('draft', 'ordered', 'in_transit', 'partial', 'received', 'cancelled');

create table purchase_orders (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  number       text not null,                -- "PO-1042"
  supplier_id  uuid not null references suppliers(id),
  status       po_status not null default 'draft',
  eta          date,
  created_at   timestamptz not null default now(),
  unique (org_id, number)
);

create table purchase_order_lines (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  purchase_order_id  uuid not null references purchase_orders(id) on delete cascade,
  product_id         uuid not null references products(id),
  boxes_ordered      int not null,
  cost_per_kg        numeric(10,4) not null   -- landed cost entra aqui na fase seguinte
);

create table receipts (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  purchase_order_id  uuid references purchase_orders(id),
  received_at        timestamptz not null default now(),
  received_by        uuid references auth.users(id)
);

-- ---------- A caixa: unidade central do stock ----------
create type box_status as enum ('in_stock', 'reserved', 'shipped', 'blocked', 'written_off');

create table boxes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  product_id    uuid not null references products(id),
  supplier_id   uuid references suppliers(id),
  receipt_id    uuid references receipts(id),
  location_id   uuid references locations(id),
  gtin          text,
  serial        text,                        -- (21) da etiqueta
  net_weight_kg numeric(8,3) not null,       -- peso real da caixa
  lot           text,
  packed_on     date,
  use_by        date,
  cost_per_kg   numeric(10,4),
  status        box_status not null default 'in_stock',
  raw_barcode   text,                        -- código lido, para auditoria
  created_at    timestamptz not null default now(),
  unique (org_id, gtin, serial)              -- impede bipar a mesma caixa duas vezes
);

create index boxes_fefo on boxes (org_id, product_id, status, use_by);
create index boxes_lot  on boxes (org_id, lot);

-- Histórico de tudo que acontece com cada caixa (rastreabilidade e recall)
create type movement_type as enum ('received', 'moved', 'reserved', 'shipped', 'blocked', 'unblocked', 'written_off', 'returned');

create table stock_movements (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references organizations(id) on delete cascade,
  box_id       uuid not null references boxes(id) on delete cascade,
  type         movement_type not null,
  from_location uuid references locations(id),
  to_location   uuid references locations(id),
  ref_table    text,                         -- 'receipts', 'shipments'…
  ref_id       uuid,
  by_user      uuid references auth.users(id),
  at           timestamptz not null default now()
);

-- ---------- Vendas, expedição e invoice ----------
create type so_status as enum ('draft', 'confirmed', 'picking', 'shipped', 'invoiced', 'cancelled');

create table sales_orders (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  number       text not null,                -- "SO-2231"
  customer_id  uuid not null references customers(id),
  status       so_status not null default 'draft',
  delivery_on  date,
  created_at   timestamptz not null default now(),
  unique (org_id, number)
);

create table sales_order_lines (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  sales_order_id  uuid not null references sales_orders(id) on delete cascade,
  product_id      uuid not null references products(id),
  boxes_requested int not null,
  price_kg        numeric(10,2) not null
);

create table shipments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  sales_order_id  uuid not null references sales_orders(id),
  shipped_at      timestamptz,
  shipped_by      uuid references auth.users(id)
);

-- Quais caixas exatas saíram em cada expedição (scan na saída)
create table shipment_boxes (
  shipment_id  uuid not null references shipments(id) on delete cascade,
  box_id       uuid not null references boxes(id),
  org_id       uuid not null references organizations(id) on delete cascade,
  price_kg     numeric(10,2) not null,
  primary key (shipment_id, box_id),
  unique (box_id)                            -- uma caixa só sai uma vez
);

create type invoice_status as enum ('draft', 'sent', 'paid', 'void');

create table invoices (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  number          text not null,
  customer_id     uuid not null references customers(id),
  shipment_id     uuid references shipments(id),
  issued_on       date not null default current_date,
  due_on          date,
  total           numeric(12,2) not null default 0,
  status          invoice_status not null default 'draft',
  quickbooks_id   text,                      -- preenchido quando sincroniza
  synced_at       timestamptz,
  unique (org_id, number)
);

create table invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  invoice_id   uuid not null references invoices(id) on delete cascade,
  product_id   uuid not null references products(id),
  boxes        int not null,
  weight_kg    numeric(10,3) not null,       -- soma dos pesos reais das caixas
  price_kg     numeric(10,2) not null,
  amount       numeric(12,2) not null,
  lots         text[]                        -- lotes na linha, para rastreabilidade
);

-- ---------- Segurança: Row Level Security em todas as tabelas ----------
do $$
declare t text;
begin
  foreach t in array array[
    'suppliers','label_profiles','products','locations','customers','customer_prices',
    'purchase_orders','purchase_order_lines','receipts','boxes','stock_movements',
    'sales_orders','sales_order_lines','shipments','shipment_boxes','invoices','invoice_lines'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all using (is_member(org_id)) with check (is_member(org_id))',
      t || '_member_access', t);
  end loop;
end $$;

alter table organizations enable row level security;
create policy organizations_member_read on organizations
  for select using (is_member(id));

alter table memberships enable row level security;
create policy memberships_self_read on memberships
  for select using (user_id = auth.uid() or is_member(org_id));

-- ---------- Visões úteis ----------
-- Stock atual por produto, com a próxima validade (FEFO)
create view stock_summary with (security_invoker = true) as
select
  b.org_id,
  b.product_id,
  p.name                         as product,
  count(*)                       as boxes,
  sum(b.net_weight_kg)           as total_kg,
  min(b.use_by)                  as next_use_by,
  sum(b.net_weight_kg * coalesce(b.cost_per_kg, 0)) as stock_value
from boxes b
join products p on p.id = b.product_id
where b.status = 'in_stock'
group by b.org_id, b.product_id, p.name;

-- Recall: para um lote, quais clientes receberam caixas dele
create view lot_trace with (security_invoker = true) as
select
  b.org_id, b.lot, b.serial, b.net_weight_kg,
  c.name   as customer,
  so.number as sales_order,
  s.shipped_at
from boxes b
join shipment_boxes sb on sb.box_id = b.id
join shipments s       on s.id = sb.shipment_id
join sales_orders so   on so.id = s.sales_order_id
join customers c       on c.id = so.customer_id;
