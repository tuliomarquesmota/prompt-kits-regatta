-- =====================================================================
-- LOTE · 010 · relatórios: totais por conta e prévia do VAT (fase 3, parte 3)
-- Depende de 001 a 009.
-- As funções rodam com a permissão de quem chama (security invoker): o RLS
-- garante que cada um só soma os dados da própria empresa.
-- =====================================================================

-- Débitos e créditos por conta num período. date_from nulo = desde o começo (para o balanço).
create or replace function report_account_totals(target_org uuid, date_from date, date_to date)
returns table (account_id uuid, code text, name text, type account_type, system_key text, debit numeric, credit numeric)
language sql stable security invoker set search_path = public as $$
  select a.id, a.code, a.name, a.type, a.system_key,
         coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
    from accounts a
    left join journal_lines l on l.account_id = a.id
     and exists (
       select 1 from journal_entries e
        where e.id = l.entry_id
          and (date_from is null or e.entry_date >= date_from)
          and e.entry_date <= date_to)
   where a.org_id = target_org
   group by a.id, a.code, a.name, a.type, a.system_key
   order by a.code;
$$;

-- Somas para a declaração de VAT (as 9 caixas da HMRC), a partir dos documentos do período.
create or replace function report_vat(target_org uuid, date_from date, date_to date)
returns table (sales_net numeric, sales_vat numeric, credits_net numeric, credits_vat numeric,
               purchases_net numeric, purchases_vat numeric)
language sql stable security invoker set search_path = public as $$
  select
    (select coalesce(sum(total), 0) from invoices
      where org_id = target_org and status <> 'void' and issued_on between date_from and date_to),
    (select coalesce(sum(vat_total), 0) from invoices
      where org_id = target_org and status <> 'void' and issued_on between date_from and date_to),
    (select coalesce(sum(total), 0) from credit_notes
      where org_id = target_org and issued_on between date_from and date_to),
    (select coalesce(sum(vat_total), 0) from credit_notes
      where org_id = target_org and issued_on between date_from and date_to),
    (select coalesce(sum(net), 0) from bills
      where org_id = target_org and status <> 'void' and issued_on between date_from and date_to),
    (select coalesce(sum(vat_amount), 0) from bills
      where org_id = target_org and status <> 'void' and issued_on between date_from and date_to);
$$;

revoke execute on function report_account_totals(uuid, date, date) from public, anon;
revoke execute on function report_vat(uuid, date, date) from public, anon;
grant execute on function report_account_totals(uuid, date, date) to authenticated;
grant execute on function report_vat(uuid, date, date) to authenticated;
