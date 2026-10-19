-- =====================================================================
-- LOTE · 014 · histórico de alterações e fechamento do mês (fase 3)
-- Depende de 001 a 013.
--
-- 1. audit_log: quem criou, mudou ou apagou o quê, e quando. Gravado por gatilho,
--    ninguém escreve nem apaga pela API. Só donos e admins leem.
-- 2. Fechamento do mês: organizations.books_locked_until. Lançamentos com data até
--    esse dia não podem ser criados, mudados nem apagados. Correção entra com data nova
--    (ex.: credit note de hoje) ou um dono reabre o mês, com motivo registrado.
-- 3. post_document passa a refazer o lançamento só quando os valores mudam. Antes
--    qualquer alteração na invoice (ex.: status "paga") apagava e recriava o lançamento.
-- =====================================================================

-- ---------- 1. Histórico ----------
create table audit_log (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references organizations(id) on delete cascade,
  table_name  text not null,
  row_id      text,
  label       text,                    -- "INV-0003", "Picanha", email do membro…
  action      text not null check (action in ('insert', 'update', 'delete')),
  changed_by  uuid references auth.users(id) on delete set null,
  changed_at  timestamptz not null default now(),
  changes     jsonb not null,          -- insert/delete: a linha; update: {"coluna": [antes, depois]}
  note        text                     -- motivo, quando a ação pede (ex.: reabrir mês)
);
create index audit_log_org_time on audit_log(org_id, id desc);
create index audit_log_row on audit_log(table_name, row_id);

alter table audit_log enable row level security;
create policy audit_log_admin_read on audit_log for select using (is_admin(org_id));

-- Nome legível da linha, para o histórico não depender de a linha ainda existir
create or replace function audit_label(tbl text, r jsonb)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  return case tbl
    when 'memberships' then (select email from auth.users where id = (r->>'user_id')::uuid)
    when 'customer_prices' then
      (select c.name from customers c where c.id = (r->>'customer_id')::uuid) || ' · ' ||
      (select p.name from products p where p.id = (r->>'product_id')::uuid)
    when 'receipt_costs' then (select p.name from products p where p.id = (r->>'product_id')::uuid)
    when 'payments' then (select i.number from invoices i where i.id = (r->>'invoice_id')::uuid)
    when 'bill_payments' then
      (select coalesce(s.name, b.payee) from bills b left join suppliers s on s.id = b.supplier_id
        where b.id = (r->>'bill_id')::uuid)
    when 'boxes' then
      (select p.name from products p where p.id = (r->>'product_id')::uuid) || coalesce(' · lote ' || (r->>'lot'), '')
    when 'receipts' then coalesce(r->>'reference', to_char((r->>'received_at')::timestamptz, 'DD/MM/YYYY'))
    else coalesce(r->>'number', r->>'name', r->>'reference', r->>'description', r->>'payee', r->>'email')
  end;
end $$;

-- Gatilho genérico. Argumentos: colunas a ignorar (mudanças só nelas não entram no histórico).
create or replace function audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  ignored text[] := array['created_at', 'updated_at'] || coalesce(tg_argv::text[], '{}');
  diff jsonb := '{}';
  k text;
  target uuid := case when tg_table_name = 'organizations' then (r->>'id')::uuid else (r->>'org_id')::uuid end;
begin
  -- Empresa sendo apagada (cascata): não há onde registrar
  if not exists (select 1 from organizations where id = target) then return null; end if;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if not (k = any(ignored)) and (o->k) is distinct from (n->k) then
        diff := diff || jsonb_build_object(k, jsonb_build_array(o->k, n->k));
      end if;
    end loop;
    if diff = '{}' then return null; end if;
  else
    diff := jsonb_strip_nulls(r) - 'id' - 'org_id' - 'created_at';
  end if;

  insert into audit_log(org_id, table_name, row_id, label, action, changed_by, changes, note)
  values (
    target,
    tg_table_name,
    coalesce(r->>'id', r->>'user_id', (r->>'receipt_id') || ':' || (r->>'product_id'),
             (r->>'customer_id') || ':' || (r->>'product_id')),
    audit_label(tg_table_name, r),
    lower(tg_op),
    auth.uid(),
    diff,
    nullif(current_setting('lote.audit_note', true), '')
  );
  return null;
end $$;

-- Documentos e dinheiro
create trigger invoices_audit after insert or update or delete on invoices for each row execute function audit_row();
create trigger credit_notes_audit after insert or update or delete on credit_notes for each row execute function audit_row();
create trigger payments_audit after insert or update or delete on payments for each row execute function audit_row();
create trigger bills_audit after insert or update or delete on bills for each row execute function audit_row();
create trigger bill_payments_audit after insert or update or delete on bill_payments for each row execute function audit_row();
create trigger sales_orders_audit after insert or update or delete on sales_orders for each row execute function audit_row();
create trigger manual_entries_audit after insert on journal_entries
  for each row when (new.source_table is null) execute function audit_row();
-- Cadastros e preços
create trigger customers_audit after insert or update or delete on customers for each row execute function audit_row();
create trigger suppliers_audit after insert or update or delete on suppliers for each row execute function audit_row();
create trigger products_audit after insert or update or delete on products for each row execute function audit_row();
create trigger customer_prices_audit after insert or update or delete on customer_prices for each row execute function audit_row();
create trigger accounts_audit after insert or update or delete on accounts for each row execute function audit_row();
create trigger organizations_audit after update on organizations for each row execute function audit_row();
create trigger memberships_audit after insert or update or delete on memberships for each row execute function audit_row();
-- Custo das entregas
create trigger receipts_audit after update or delete on receipts for each row execute function audit_row();
create trigger receipt_costs_audit after insert or update or delete on receipt_costs for each row execute function audit_row();
-- Caixas: só correções (peso, lote, validade, produto) e exclusões. Status e câmara já
-- ficam em stock_movements; o custo vem do lançamento de custo da entrega.
create trigger boxes_audit after update or delete on boxes
  for each row execute function audit_row('status', 'location_id', 'cost_per_kg');

-- Histórico com o nome de quem fez. Paginado pelo id (mais recentes primeiro).
create or replace function list_audit(target_org uuid, before_id bigint default null, max_rows int default 50)
returns table(id bigint, table_name text, row_id text, label text, action text, changed_at timestamptz,
              changes jsonb, note text, who text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin(target_org) then raise exception 'Apenas donos e admins veem o histórico.'; end if;
  return query
    select a.id, a.table_name, a.row_id, a.label, a.action, a.changed_at, a.changes, a.note,
           coalesce(nullif(u.raw_user_meta_data->>'name', ''), u.email::text, 'Sistema')
      from audit_log a left join auth.users u on u.id = a.changed_by
     where a.org_id = target_org and (before_id is null or a.id < before_id)
     order by a.id desc
     limit least(greatest(coalesce(max_rows, 50), 1), 200);
end $$;

-- ---------- 2. Fechamento do mês ----------
alter table organizations add column books_locked_until date;

-- A data de fechamento só muda pelas funções close_books e reopen_books
create or replace function organizations_lock_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.books_locked_until is distinct from old.books_locked_until
     and coalesce(current_setting('lote.books', true), '') <> 'on' then
    raise exception 'Use Finanças → Livro → Fechar mês para fechar ou reabrir.';
  end if;
  return new;
end $$;
create trigger organizations_lock_guard before update on organizations
  for each row execute function organizations_lock_guard();

-- Lançamentos com data no período fechado não entram, não mudam e não saem
create or replace function journal_period_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lim date;
  hit date;
begin
  select books_locked_until into lim from organizations
   where id = case when tg_op = 'DELETE' then old.org_id else new.org_id end;
  if lim is null then return case when tg_op = 'DELETE' then old else new end; end if;

  if tg_op = 'INSERT' and new.entry_date <= lim then hit := new.entry_date;
  elsif tg_op = 'DELETE' and old.entry_date <= lim then hit := old.entry_date;
  elsif tg_op = 'UPDATE' and new.entry_date is distinct from old.entry_date
        and least(new.entry_date, old.entry_date) <= lim then hit := least(new.entry_date, old.entry_date);
  end if;

  if hit is not null then
    raise exception 'O livro está fechado até %. Nada com data até esse dia pode mudar (data do lançamento: %). Lance a correção com data de hoje ou peça a um dono para reabrir o mês.',
      to_char(lim, 'DD/MM/YYYY'), to_char(hit, 'DD/MM/YYYY');
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger journal_entries_period_guard before insert or update or delete on journal_entries
  for each row execute function journal_period_guard();

-- Fecha o livro até o último dia de um mês que já terminou. Só dono ou admin.
create or replace function close_books(target_org uuid, until date)
returns void language plpgsql security definer set search_path = public as $$
declare cur date;
begin
  if not is_admin(target_org) then raise exception 'Apenas donos e admins fecham o mês.'; end if;
  if until is null or until <> (date_trunc('month', until) + interval '1 month - 1 day')::date then
    raise exception 'Escolha o último dia de um mês.';
  end if;
  if until >= current_date then raise exception 'Só dá para fechar um mês que já terminou.'; end if;
  select books_locked_until into cur from organizations where id = target_org;
  if cur is not null and until <= cur then
    raise exception 'Este mês já está fechado (livro fechado até %).', to_char(cur, 'DD/MM/YYYY');
  end if;
  perform set_config('lote.books', 'on', true);
  perform set_config('lote.audit_note', '', true);
  update organizations set books_locked_until = until where id = target_org;
end $$;

-- Reabre: volta a data de fechamento para "until", um fim de mês anterior (null abre tudo).
-- Motivo obrigatório; fica no histórico.
create or replace function reopen_books(target_org uuid, until date, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare cur date;
begin
  if not is_admin(target_org) then raise exception 'Apenas donos e admins reabrem o mês.'; end if;
  if coalesce(trim(reason), '') = '' then raise exception 'Escreva o motivo para reabrir.'; end if;
  select books_locked_until into cur from organizations where id = target_org;
  if cur is null then raise exception 'Nenhum mês está fechado.'; end if;
  if until is not null and (until >= cur or until <> (date_trunc('month', until) + interval '1 month - 1 day')::date) then
    raise exception 'Data inválida para reabrir.';
  end if;
  perform set_config('lote.books', 'on', true);
  perform set_config('lote.audit_note', trim(reason), true);
  update organizations set books_locked_until = until where id = target_org;
  perform set_config('lote.audit_note', '', true);
end $$;

-- ---------- 3. Lançamento automático só muda quando o valor muda ----------
create or replace function journal_line_json(account uuid, amount numeric, side text)
returns jsonb language plpgsql immutable as $$
declare v numeric(12,2) := round(coalesce(amount, 0), 2);
begin
  if v = 0 then return null; end if;
  if account is null then raise exception 'Conta contábil não encontrada no plano de contas.'; end if;
  if v < 0 then
    v := -v;
    side := case side when 'D' then 'C' else 'D' end;
  end if;
  return jsonb_build_object('a', account, 'd', case when side = 'D' then v else 0 end,
                            'c', case when side = 'C' then v else 0 end);
end $$;

create or replace function post_document(src text, doc uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  d record;
  want jsonb[];
  want_sorted jsonb;
  have_sorted jsonb;
  cur journal_entries;
  e uuid;
  l jsonb;
begin
  -- 1. O lançamento que o documento pede agora (want vazio = nenhum lançamento)
  if src = 'invoices' then
    select i.org_id, i.issued_on as dt, 'Invoice ' || i.number || ' · ' || c.name as txt,
           i.total as net, i.vat_total as vat, i.status
      into d from invoices i join customers c on c.id = i.customer_id where i.id = doc;
    if d.org_id is not null and d.status <> 'void' and d.net + d.vat <> 0 then
      want := array[journal_line_json(account_for(d.org_id, 'ar'), d.net + d.vat, 'D'),
                    journal_line_json(account_for(d.org_id, 'sales'), d.net, 'C'),
                    journal_line_json(account_for(d.org_id, 'vat'), d.vat, 'C')];
    end if;

  elsif src = 'credit_notes' then
    select n.org_id, n.issued_on as dt, 'Credit note ' || n.number || ' · ' || c.name as txt,
           n.total as net, n.vat_total as vat
      into d from credit_notes n join customers c on c.id = n.customer_id where n.id = doc;
    if d.org_id is not null and d.net + d.vat <> 0 then
      want := array[journal_line_json(account_for(d.org_id, 'sales'), d.net, 'D'),
                    journal_line_json(account_for(d.org_id, 'vat'), d.vat, 'D'),
                    journal_line_json(account_for(d.org_id, 'ar'), d.net + d.vat, 'C')];
    end if;

  elsif src = 'payments' then
    select p.org_id, p.paid_on as dt, 'Recebimento · ' || i.number || ' · ' || c.name as txt, p.amount
      into d from payments p join invoices i on i.id = p.invoice_id join customers c on c.id = p.customer_id
     where p.id = doc;
    if d.org_id is not null then
      want := array[journal_line_json(account_for(d.org_id, 'bank'), d.amount, 'D'),
                    journal_line_json(account_for(d.org_id, 'ar'), d.amount, 'C')];
    end if;

  elsif src = 'bills' then
    select b.org_id, b.issued_on as dt, b.account_id,
           'Conta · ' || coalesce(s.name, b.payee) || coalesce(' · ' || b.reference, '') as txt,
           b.net, b.vat_amount as vat, b.status
      into d from bills b left join suppliers s on s.id = b.supplier_id where b.id = doc;
    if d.org_id is not null and d.status <> 'void' and d.net + d.vat <> 0 then
      want := array[journal_line_json(d.account_id, d.net, 'D'),
                    journal_line_json(account_for(d.org_id, 'vat'), d.vat, 'D'),
                    journal_line_json(account_for(d.org_id, 'ap'), d.net + d.vat, 'C')];
    end if;

  elsif src = 'bill_payments' then
    select p.org_id, p.paid_on as dt, 'Pagamento · ' || coalesce(s.name, b.payee) as txt, p.amount
      into d from bill_payments p join bills b on b.id = p.bill_id left join suppliers s on s.id = b.supplier_id
     where p.id = doc;
    if d.org_id is not null then
      want := array[journal_line_json(account_for(d.org_id, 'ap'), d.amount, 'D'),
                    journal_line_json(account_for(d.org_id, 'bank'), d.amount, 'C')];
    end if;
  end if;

  select coalesce(jsonb_agg(x order by x::text), '[]') into want_sorted
    from unnest(coalesce(want, '{}')) x where x is not null;

  -- 2. O que já está no livro
  select * into cur from journal_entries where source_table = src and source_id = doc;
  if cur.id is not null then
    select coalesce(jsonb_agg(x order by x::text), '[]') into have_sorted
      from (select jsonb_build_object('a', account_id, 'd', debit, 'c', credit) x
              from journal_lines where entry_id = cur.id) s;
    -- Mesmos valores e mesma data: no máximo atualiza a descrição (permitido em mês fechado)
    if want_sorted <> '[]' and cur.entry_date = d.dt and have_sorted = want_sorted then
      if cur.description is distinct from d.txt then
        update journal_entries set description = d.txt where id = cur.id;
      end if;
      return;
    end if;
    delete from journal_entries where id = cur.id;
  end if;

  -- 3. Grava o novo lançamento
  if want_sorted = '[]' then return; end if;
  insert into journal_entries(org_id, entry_date, description, source_table, source_id)
  values (d.org_id, d.dt, d.txt, src, doc) returning id into e;
  for l in select * from jsonb_array_elements(want_sorted) loop
    insert into journal_lines(org_id, entry_id, account_id, debit, credit)
    values (d.org_id, e, (l->>'a')::uuid, (l->>'d')::numeric, (l->>'c')::numeric);
  end loop;
end $$;

-- ---------- Permissões ----------
revoke execute on function audit_label(text, jsonb) from public, anon, authenticated;
revoke execute on function audit_row() from public, anon, authenticated;
revoke execute on function organizations_lock_guard() from public, anon, authenticated;
revoke execute on function journal_period_guard() from public, anon, authenticated;
revoke execute on function journal_line_json(uuid, numeric, text) from public, anon, authenticated;
revoke execute on function post_document(text, uuid) from public, anon, authenticated;
revoke execute on function list_audit(uuid, bigint, int) from public, anon;
revoke execute on function close_books(uuid, date) from public, anon;
revoke execute on function reopen_books(uuid, date, text) from public, anon;
grant execute on function list_audit(uuid, bigint, int) to authenticated;
grant execute on function close_books(uuid, date) to authenticated;
grant execute on function reopen_books(uuid, date, text) to authenticated;
