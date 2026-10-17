-- =====================================================================
-- LOTE · 008 · plano de contas e contas a pagar (fase 3, parte 1)
-- Depende de 001 a 007.
-- O plano de contas vem com um padrão simples do Reino Unido; o contador ajusta.
-- =====================================================================

create type account_type as enum ('asset', 'liability', 'equity', 'income', 'expense');

create table accounts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  code        text not null,                 -- "4000"
  name        text not null,                 -- "Vendas"
  type        account_type not null,
  system_key  text,                          -- contas usadas nos lançamentos automáticos: bank, ar, ap, vat, sales…
  active      boolean not null default true,
  unique (org_id, code),
  unique (org_id, system_key)
);
alter table accounts enable row level security;
create policy accounts_member_access on accounts
  for all using (is_member(org_id)) with check (is_member(org_id));

-- Plano de contas padrão de uma empresa nova
create or replace function seed_accounts(target_org uuid)
returns void language sql security definer set search_path = public as $$
  insert into accounts(org_id, code, name, type, system_key) values
    (target_org, '1001', 'Stock de mercadoria',          'asset',     'inventory'),
    (target_org, '1100', 'Contas a receber (clientes)',  'asset',     'ar'),
    (target_org, '1200', 'Banco',                        'asset',     'bank'),
    (target_org, '2100', 'Contas a pagar (fornecedores)', 'liability', 'ap'),
    (target_org, '2200', 'VAT',                          'liability', 'vat'),
    (target_org, '3000', 'Capital dos sócios',           'equity',    'capital'),
    (target_org, '3100', 'Lucros acumulados',            'equity',    'retained'),
    (target_org, '4000', 'Vendas',                       'income',    'sales'),
    (target_org, '4900', 'Outras receitas',              'income',    null),
    (target_org, '5000', 'Compra de mercadoria',         'expense',   'purchases'),
    (target_org, '5100', 'Frete e importação',           'expense',   null),
    (target_org, '5200', 'Taxas de porto e inspeção',    'expense',   null),
    (target_org, '5300', 'Embalagens',                   'expense',   null),
    (target_org, '5400', 'Perdas e descartes',           'expense',   'write_off'),
    (target_org, '6000', 'Salários',                     'expense',   null),
    (target_org, '6100', 'Aluguel e câmara fria',        'expense',   null),
    (target_org, '6200', 'Energia',                      'expense',   null),
    (target_org, '6300', 'Veículos e combustível',       'expense',   null),
    (target_org, '6400', 'Software e assinaturas',       'expense',   null),
    (target_org, '6500', 'Taxas bancárias',              'expense',   null),
    (target_org, '6600', 'Contador e jurídico',          'expense',   null),
    (target_org, '6700', 'Seguros',                      'expense',   null),
    (target_org, '6900', 'Outras despesas',              'expense',   null)
  on conflict do nothing;
$$;
revoke execute on function seed_accounts(uuid) from public, anon, authenticated;

-- Toda empresa nova já nasce com o plano de contas
create or replace function organizations_seed_accounts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform seed_accounts(new.id);
  return new;
end $$;
create trigger organizations_accounts after insert on organizations
for each row execute function organizations_seed_accounts();

-- Empresas que já existem
select seed_accounts(id) from organizations;

-- ---------- Contas a pagar ----------
create type bill_status as enum ('open', 'paid', 'void');

create table bills (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  supplier_id  uuid references suppliers(id),
  payee        text,                          -- quem recebe, quando não é um fornecedor cadastrado (ex.: "British Gas")
  reference    text,                          -- número da conta/invoice do fornecedor
  account_id   uuid not null references accounts(id),
  description  text,
  issued_on    date not null default current_date,
  due_on       date,
  net          numeric(12,2) not null check (net >= 0),
  vat_rate     numeric(5,2) not null default 0,
  vat_amount   numeric(12,2) not null default 0 check (vat_amount >= 0),
  status       bill_status not null default 'open',
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  check (supplier_id is not null or payee is not null)
);

create table bill_payments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  bill_id     uuid not null references bills(id),
  amount      numeric(12,2) not null check (amount > 0),
  paid_on     date not null default current_date,
  method      text not null default 'transferencia',
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

alter table bills enable row level security;
alter table bill_payments enable row level security;
create policy bills_member_access on bills
  for all using (is_member(org_id)) with check (is_member(org_id));
create policy bill_payments_member_access on bill_payments
  for all using (is_member(org_id)) with check (is_member(org_id));

create view bill_balances with (security_invoker = true) as
select
  b.id, b.org_id, b.reference, b.issued_on, b.due_on, b.status, b.description,
  coalesce(s.name, b.payee) as payee,
  a.name as account,
  b.net + b.vat_amount as gross,
  coalesce(p.paid, 0) as paid,
  b.net + b.vat_amount - coalesce(p.paid, 0) as balance
from bills b
join accounts a on a.id = b.account_id
left join suppliers s on s.id = b.supplier_id
left join (select bill_id, sum(amount) as paid from bill_payments group by bill_id) p on p.bill_id = b.id
where b.status <> 'void';

-- Registra pagamento de uma conta. Quando o saldo zera, a conta vira 'paid'.
create or replace function record_bill_payment(
  bill_id uuid, amount numeric, paid_on date default current_date,
  method text default 'transferencia', note text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  b record;
  v_balance numeric(12,2);
  v_payment uuid;
begin
  select x.id, x.org_id, x.status into b from bills x where x.id = record_bill_payment.bill_id for update;
  if b.id is null then raise exception 'Conta não encontrada.'; end if;
  if not is_member(b.org_id) then raise exception 'Sem acesso a esta empresa.'; end if;
  if b.status = 'void' then raise exception 'Esta conta foi anulada.'; end if;
  if amount is null or amount <= 0 then raise exception 'Valor do pagamento inválido.'; end if;

  select balance into v_balance from bill_balances v where v.id = b.id;
  if round(amount, 2) > v_balance then
    raise exception 'O valor passa do saldo em aberto (£%). Confira o valor.', v_balance;
  end if;

  insert into bill_payments(org_id, bill_id, amount, paid_on, method, note, created_by)
  values (b.org_id, b.id, round(amount, 2), coalesce(paid_on, current_date),
          coalesce(nullif(trim(method), ''), 'transferencia'), nullif(trim(note), ''), auth.uid())
  returning id into v_payment;

  if v_balance - round(amount, 2) <= 0 then
    update bills set status = 'paid' where id = b.id;
  end if;
  return v_payment;
end $$;

revoke execute on function record_bill_payment(uuid, numeric, date, text, text) from public, anon;
grant execute on function record_bill_payment(uuid, numeric, date, text, text) to authenticated;
