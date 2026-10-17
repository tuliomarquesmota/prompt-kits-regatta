-- =====================================================================
-- LOTE · 009 · livro contábil em partidas dobradas (fase 3, parte 2)
-- Depende de 001 a 008.
-- Regime de competência: a venda entra na data da invoice, a despesa na data da conta.
-- Cada documento gera um lançamento automático; se o documento muda, o lançamento é refeito.
--
--   Invoice ............ D Contas a receber (total c/ VAT) | C Vendas (sem VAT) + C VAT
--   Credit note ........ D Vendas + D VAT                  | C Contas a receber
--   Pagamento recebido . D Banco                           | C Contas a receber
--   Conta a pagar ...... D Despesa (sem VAT) + D VAT       | C Contas a pagar (total)
--   Pagamento feito .... D Contas a pagar                  | C Banco
-- =====================================================================

create table journal_entries (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  entry_date    date not null,
  description   text not null,
  source_table  text,              -- invoices, credit_notes, payments, bills, bill_payments; null = manual
  source_id     uuid,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  unique (source_table, source_id)
);

create table journal_lines (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  entry_id    uuid not null references journal_entries(id) on delete cascade,
  account_id  uuid not null references accounts(id),
  debit       numeric(12,2) not null default 0 check (debit >= 0),
  credit      numeric(12,2) not null default 0 check (credit >= 0),
  memo        text,
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);
create index journal_entries_org_date on journal_entries(org_id, entry_date);
create index journal_lines_entry on journal_lines(entry_id);
create index journal_lines_account on journal_lines(account_id);

-- Só leitura pela API: lançamentos entram pelas funções abaixo
alter table journal_entries enable row level security;
alter table journal_lines enable row level security;
create policy journal_entries_member_read on journal_entries for select using (is_member(org_id));
create policy journal_lines_member_read on journal_lines for select using (is_member(org_id));

-- Conta pelo papel no plano (bank, ar, ap, vat, sales…)
create or replace function account_for(target_org uuid, key text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from accounts where org_id = target_org and system_key = key;
$$;

-- Linha de lançamento; valor negativo vira o lado oposto; zero não grava
create or replace function add_journal_line(entry uuid, target_org uuid, account uuid, amount numeric, side text, memo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v numeric(12,2) := round(coalesce(amount, 0), 2);
begin
  if v = 0 then return; end if;
  if account is null then raise exception 'Conta contábil não encontrada no plano de contas.'; end if;
  if v < 0 then
    v := -v;
    side := case side when 'D' then 'C' else 'D' end;
  end if;
  insert into journal_lines(org_id, entry_id, account_id, debit, credit, memo)
  values (target_org, entry, account, case when side = 'D' then v else 0 end, case when side = 'C' then v else 0 end, memo);
end $$;

-- Refaz o lançamento automático de um documento
create or replace function post_document(src text, doc uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  d record;
  e uuid;
begin
  delete from journal_entries where source_table = src and source_id = doc;

  if src = 'invoices' then
    select i.org_id, i.issued_on as dt, 'Invoice ' || i.number || ' · ' || c.name as txt,
           i.total as net, i.vat_total as vat, i.status
      into d from invoices i join customers c on c.id = i.customer_id where i.id = doc;
    if d.org_id is null or d.status = 'void' or d.net + d.vat = 0 then return; end if;
    insert into journal_entries(org_id, entry_date, description, source_table, source_id)
    values (d.org_id, d.dt, d.txt, src, doc) returning id into e;
    perform add_journal_line(e, d.org_id, account_for(d.org_id, 'ar'), d.net + d.vat, 'D');
    perform add_journal_line(e, d.org_id, account_for(d.org_id, 'sales'), d.net, 'C');
    perform add_journal_line(e, d.org_id, account_for(d.org_id, 'vat'), d.vat, 'C');

  elsif src = 'credit_notes' then
    select n.org_id, n.issued_on as dt, 'Credit note ' || n.number || ' · ' || c.name as txt,
           n.total as net, n.vat_total as vat
      into d from credit_notes n join customers c on c.id = n.customer_id where n.id = doc;
    if d.org_id is null or d.net + d.vat = 0 then return; end if;
    insert into journal_entries(org_id, entry_date, description, source_table, source_id)
    values (d.org_id, d.dt, d.txt, src, doc) returning id into e;
    perform add_journal_line(e, d.org_id, account_for(d.org_id, 'sales'), d.net, 'D');
    perform add_journal_line(e, d.org_id, account_for(d.org_id, 'vat'), d.vat, 'D');
    perform add_journal_line(e, d.org_id, account_for(d.org_id, 'ar'), d.net + d.vat, 'C');

  elsif src = 'payments' then
    select p.org_id, p.paid_on as dt, 'Recebimento · ' || i.number || ' · ' || c.name as txt, p.amount
      into d from payments p join invoices i on i.id = p.invoice_id join customers c on c.id = p.customer_id
     where p.id = doc;
    if d.org_id is null then return; end if;
    insert into journal_entries(org_id, entry_date, description, source_table, source_id)
    values (d.org_id, d.dt, d.txt, src, doc) returning id into e;
    perform add_journal_line(e, d.org_id, account_for(d.org_id, 'bank'), d.amount, 'D');
    perform add_journal_line(e, d.org_id, account_for(d.org_id, 'ar'), d.amount, 'C');

  elsif src = 'bills' then
    select b.org_id, b.issued_on as dt, b.account_id,
           'Conta · ' || coalesce(s.name, b.payee) || coalesce(' · ' || b.reference, '') as txt,
           b.net, b.vat_amount as vat, b.status
      into d from bills b left join suppliers s on s.id = b.supplier_id where b.id = doc;
    if d.org_id is null or d.status = 'void' or d.net + d.vat = 0 then return; end if;
    insert into journal_entries(org_id, entry_date, description, source_table, source_id)
    values (d.org_id, d.dt, d.txt, src, doc) returning id into e;
    perform add_journal_line(e, d.org_id, d.account_id, d.net, 'D');
    perform add_journal_line(e, d.org_id, account_for(d.org_id, 'vat'), d.vat, 'D');
    perform add_journal_line(e, d.org_id, account_for(d.org_id, 'ap'), d.net + d.vat, 'C');

  elsif src = 'bill_payments' then
    select p.org_id, p.paid_on as dt, 'Pagamento · ' || coalesce(s.name, b.payee) as txt, p.amount
      into d from bill_payments p join bills b on b.id = p.bill_id left join suppliers s on s.id = b.supplier_id
     where p.id = doc;
    if d.org_id is null then return; end if;
    insert into journal_entries(org_id, entry_date, description, source_table, source_id)
    values (d.org_id, d.dt, d.txt, src, doc) returning id into e;
    perform add_journal_line(e, d.org_id, account_for(d.org_id, 'ap'), d.amount, 'D');
    perform add_journal_line(e, d.org_id, account_for(d.org_id, 'bank'), d.amount, 'C');
  end if;
end $$;

-- Gatilhos: cada documento novo ou alterado refaz seu lançamento
create or replace function journal_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform post_document(tg_table_name, new.id);
  return new;
end $$;

create trigger invoices_journal after insert or update on invoices
for each row execute function journal_sync();
create trigger credit_notes_journal after insert or update on credit_notes
for each row execute function journal_sync();
create trigger payments_journal after insert or update on payments
for each row execute function journal_sync();
create trigger bills_journal after insert or update on bills
for each row execute function journal_sync();
create trigger bill_payments_journal after insert or update on bill_payments
for each row execute function journal_sync();

-- Lançamento manual (saldo inicial, aporte dos sócios, ajuste do contador). Só dono ou admin.
-- lines: [{"account_id": "...", "debit": 100, "credit": 0, "memo": "..."}, ...]
create or replace function post_manual_entry(target_org uuid, entry_date date, description text, lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  e uuid;
  l jsonb;
  dr numeric(12,2) := 0;
  cr numeric(12,2) := 0;
  acc uuid;
  dv numeric(12,2);
  cv numeric(12,2);
begin
  if not is_admin(target_org) then raise exception 'Apenas donos e admins fazem lançamentos manuais.'; end if;
  if coalesce(trim(description), '') = '' then raise exception 'Escreva uma descrição para o lançamento.'; end if;
  if lines is null or jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) < 2 then
    raise exception 'O lançamento precisa de pelo menos duas linhas.';
  end if;

  insert into journal_entries(org_id, entry_date, description, created_by)
  values (target_org, coalesce(entry_date, current_date), trim(description), auth.uid())
  returning id into e;

  for l in select * from jsonb_array_elements(lines) loop
    acc := (l->>'account_id')::uuid;
    dv := round(coalesce((l->>'debit')::numeric, 0), 2);
    cv := round(coalesce((l->>'credit')::numeric, 0), 2);
    if not exists (select 1 from accounts where id = acc and org_id = target_org) then
      raise exception 'Conta não encontrada.';
    end if;
    if dv < 0 or cv < 0 or (dv > 0 and cv > 0) or (dv = 0 and cv = 0) then
      raise exception 'Cada linha precisa de um valor só, no débito ou no crédito.';
    end if;
    insert into journal_lines(org_id, entry_id, account_id, debit, credit, memo)
    values (target_org, e, acc, dv, cv, nullif(trim(l->>'memo'), ''));
    dr := dr + dv;
    cr := cr + cv;
  end loop;

  if dr <> cr then
    raise exception 'Débitos (£%) e créditos (£%) precisam ser iguais.', dr, cr;
  end if;
  return e;
end $$;

-- Lançamentos dos documentos que já existem
do $$
declare r record;
begin
  for r in select 'invoices' as t, id from invoices union all
           select 'credit_notes', id from credit_notes union all
           select 'payments', id from payments union all
           select 'bills', id from bills union all
           select 'bill_payments', id from bill_payments loop
    perform post_document(r.t, r.id);
  end loop;
end $$;

revoke execute on function account_for(uuid, text) from public, anon, authenticated;
revoke execute on function add_journal_line(uuid, uuid, uuid, numeric, text, text) from public, anon, authenticated;
revoke execute on function post_document(text, uuid) from public, anon, authenticated;
revoke execute on function post_manual_entry(uuid, date, text, jsonb) from public, anon;
grant execute on function post_manual_entry(uuid, date, text, jsonb) to authenticated;
