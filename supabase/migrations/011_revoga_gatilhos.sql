-- =====================================================================
-- LOTE · 011 · funções de gatilho não podem ser chamadas pela API
-- Elas só rodam dentro dos gatilhos; o aviso de segurança do Supabase apontou.
-- =====================================================================
revoke execute on function journal_sync() from public, anon, authenticated;
revoke execute on function organizations_seed_accounts() from public, anon, authenticated;
