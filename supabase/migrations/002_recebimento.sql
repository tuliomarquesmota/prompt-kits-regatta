-- =====================================================================
-- LOTE · 002 · recebimento, empresas, perfis de etiqueta e API de stock
-- Rodar depois do 001_schema.sql
-- =====================================================================

-- ---------- Criar empresa (o usuário que cria vira dono) ----------
create or replace function create_organization(org_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'login necessário'; end if;
  insert into organizations(name) values (org_name) returning id into new_id;
  insert into memberships(org_id, user_id, role) values (new_id, auth.uid(), 'owner');
  return new_id;
end $$;
grant execute on function create_organization(text) to authenticated;

-- ---------- Cada caixa nova gera o movimento "recebida" ----------
create or replace function log_box_received()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into stock_movements(org_id, box_id, type, to_location, ref_table, ref_id, by_user)
  values (new.org_id, new.id, 'received', new.location_id, 'receipts', new.receipt_id, auth.uid());
  return new;
end $$;

drop trigger if exists boxes_received on boxes;
create trigger boxes_received after insert on boxes
for each row execute function log_box_received();

-- ---------- Perfis de etiqueta de exemplo ----------
-- Formato do campo match:
--   GS1:   {"tipo":"gs1","prefixo_gtin":"9332218"}
--   Molde: {"tipo":"molde","chave":"liffey","padrao":"^\\d{10}$","produto":[0,4],"peso":[4,8],"casas":2,"serial_itf":true}
-- Formato do campo rules:
--   {"shelf_dias":140,"lote":{"regra":"aaddd"},"peso_kg":[10,35]}
--   lote.regra: "ai10" (vem no código), "aaddd" (ano+dia do ano), "ddd" (prefixo + dia do ano)
create or replace function seed_label_profiles(target_org uuid)
returns void language plpgsql security definer set search_path = public as $$
declare teys uuid; sff uuid; liffey uuid;
begin
  if not is_member(target_org) then raise exception 'sem acesso a esta empresa'; end if;

  insert into suppliers(org_id, name, country) values (target_org, 'Teys Australia', 'AU') returning id into teys;
  insert into suppliers(org_id, name, country) values (target_org, 'Silver Fern Farms', 'NZ') returning id into sff;
  insert into suppliers(org_id, name, country) values (target_org, 'Liffey Meats', 'IE') returning id into liffey;

  insert into label_profiles(org_id, supplier_id, name, match, rules) values
  (target_org, teys, 'Teys · GS1',
    '{"tipo":"gs1","prefixo_gtin":"9332218"}',
    '{"shelf_dias":140,"lote":{"regra":"aaddd"},"peso_kg":[10,35]}'),
  (target_org, sff, 'Silver Fern · GS1',
    '{"tipo":"gs1","prefixo_gtin":"9418220"}',
    '{"shelf_dias":120,"lote":{"regra":"ddd","prefixo":"BG"},"peso_kg":[10,35]}'),
  (target_org, liffey, 'Liffey · código próprio',
    '{"tipo":"molde","chave":"liffey","padrao":"^\\d{10}$","produto":[0,4],"peso":[4,8],"casas":2,"serial_itf":true}',
    '{"peso_kg":[5,35]}');

  insert into products(org_id, supplier_id, name, gtin, min_box_kg, max_box_kg) values
  (target_org, teys,   'Oyster Blade',     '99332218350849', 15, 30),
  (target_org, teys,   'Inside (topside)', '99332218350528', 12, 30),
  (target_org, sff,    'PS-D Rump',        '99418220391152', 15, 30),
  (target_org, liffey, 'Rumps Caps',       'liffey:5300',    15, 30)
  on conflict (org_id, gtin) do nothing;

  insert into locations(org_id, name) values
  (target_org, 'Câmara 1'), (target_org, 'Câmara 2'), (target_org, 'Doca de recebimento')
  on conflict do nothing;
end $$;
grant execute on function seed_label_profiles(uuid) to authenticated;

-- ---------- API de stock para os sites (substitui a API do SOS) ----------
-- O site consulta com uma chave; guardamos só o hash da chave.
create table api_keys (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,                  -- "Site SA Global Meat"
  key_hash    text not null unique,
  created_at  timestamptz not null default now(),
  last_used   timestamptz,
  revoked     boolean not null default false
);
alter table api_keys enable row level security;
create policy api_keys_member_read on api_keys for select using (is_member(org_id));

-- Cria uma chave e devolve o texto dela UMA vez (depois só existe o hash)
create or replace function create_api_key(target_org uuid, key_name text)
returns text language plpgsql security definer set search_path = public as $$
declare plain text;
begin
  if not exists (select 1 from memberships m where m.org_id = target_org and m.user_id = auth.uid() and m.role in ('owner','admin')) then
    raise exception 'apenas donos e admins criam chaves';
  end if;
  plain := 'lote_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into api_keys(org_id, name, key_hash) values (target_org, key_name, encode(sha256(convert_to(plain, 'UTF8')), 'hex'));
  return plain;
end $$;
grant execute on function create_api_key(uuid, text) to authenticated;

-- Stock disponível por produto, para quem tem uma chave válida
create or replace function public_stock(api_key text)
returns table(product text, sku text, gtin text, boxes bigint, total_kg numeric, next_use_by date)
language plpgsql security definer set search_path = public as $$
declare target_org uuid;
begin
  update api_keys set last_used = now()
   where key_hash = encode(sha256(convert_to(api_key, 'UTF8')), 'hex') and not revoked
  returning org_id into target_org;
  if target_org is null then raise exception 'chave inválida' using errcode = '28000'; end if;

  return query
  select p.name, p.sku, p.gtin, count(b.id), coalesce(sum(b.net_weight_kg), 0), min(b.use_by)
  from products p
  left join boxes b on b.product_id = p.id and b.status = 'in_stock'
                   and (b.use_by is null or b.use_by >= current_date)
  where p.org_id = target_org
  group by p.id, p.name, p.sku, p.gtin
  order by p.name;
end $$;
revoke all on function public_stock(text) from public;
grant execute on function public_stock(text) to anon, authenticated;
