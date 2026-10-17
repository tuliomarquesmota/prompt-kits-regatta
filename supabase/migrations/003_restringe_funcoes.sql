-- =====================================================================
-- LOTE · 003 · fecha funções internas para quem não fez login
-- Apontado pela verificação de segurança do Supabase (get_advisors).
-- Só a API de stock do site (public_stock) continua aberta, protegida pela chave.
-- =====================================================================

revoke execute on function create_organization(text) from public, anon;
revoke execute on function seed_label_profiles(uuid) from public, anon;
revoke execute on function create_api_key(uuid, text) from public, anon;
revoke execute on function is_member(uuid) from public, anon;

-- Função de gatilho: roda sozinha quando uma caixa entra; ninguém precisa chamá-la pela API
revoke execute on function log_box_received() from public, anon, authenticated;

grant execute on function create_organization(text) to authenticated;
grant execute on function seed_label_profiles(uuid) to authenticated;
grant execute on function create_api_key(uuid, text) to authenticated;
grant execute on function is_member(uuid) to authenticated;
