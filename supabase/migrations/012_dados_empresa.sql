-- =====================================================================
-- LOTE · 012 · dados da empresa para a invoice (VAT invoice do Reino Unido)
-- Depende de 001 a 011.
-- A invoice com VAT precisa mostrar: nome e endereço de quem vende, número de VAT,
-- nome e endereço do cliente. Os dados do banco ajudam o cliente a pagar.
-- =====================================================================

alter table organizations add column legal_name text;          -- "SA Global Meat Ltd"
alter table organizations add column company_number text;      -- Companies House
alter table organizations add column vat_number text;          -- "GB123456789"
alter table organizations add column address text;             -- várias linhas
alter table organizations add column email text;
alter table organizations add column phone text;
alter table organizations add column bank_name text;
alter table organizations add column bank_account_name text;
alter table organizations add column sort_code text;           -- "12-34-56"
alter table organizations add column account_number text;      -- "12345678"
alter table organizations add column invoice_notes text;       -- texto livre no rodapé da invoice

-- Só dono e admin mudam os dados da empresa
create policy organizations_admin_update on organizations
  for update using (is_admin(id)) with check (is_admin(id));

-- Endereço do cliente (obrigatório na VAT invoice)
alter table customers add column address text;
