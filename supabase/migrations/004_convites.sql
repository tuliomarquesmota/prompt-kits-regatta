-- =====================================================================
-- LOTE · 004 · equipe: convidar pessoas para a mesma empresa
-- O dono ou admin convida um email. Quando a pessoa entra com esse email
-- (já confirmado), vira membro da empresa automaticamente.
-- Depende de 003_restringe_funcoes.sql.
-- =====================================================================

create table invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  email        text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  role         member_role not null default 'staff',
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  unique (org_id, email)
);

alter table invitations enable row level security;
-- Membros veem os convites da empresa; criar e apagar só pelas funções abaixo
create policy invitations_member_read on invitations for select using (is_member(org_id));

-- O usuário logado é dono ou admin desta empresa?
create or replace function is_admin(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.org_id = target_org and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  );
$$;

-- Convida um email. Se já existe conta confirmada com esse email, entra na hora.
-- Devolve 'adicionado' ou 'convidado'.
create or replace function invite_member(target_org uuid, member_email text, member_role member_role default 'staff')
returns text language plpgsql security definer set search_path = public as $$
declare
  clean text := lower(btrim(member_email));
  existing uuid;
begin
  if not is_admin(target_org) then raise exception 'Apenas donos e admins convidam pessoas.'; end if;
  if member_role = 'owner' and not exists (
    select 1 from memberships where org_id = target_org and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Apenas donos podem convidar outro dono.';
  end if;

  select id into existing from auth.users
   where lower(email) = clean and email_confirmed_at is not null;

  if existing is not null then
    insert into memberships(org_id, user_id, role) values (target_org, existing, member_role)
    on conflict (org_id, user_id) do update set role = excluded.role;
    insert into invitations(org_id, email, role, invited_by, accepted_at)
    values (target_org, clean, member_role, auth.uid(), now())
    on conflict (org_id, email) do update set role = excluded.role, accepted_at = now();
    return 'adicionado';
  end if;

  insert into invitations(org_id, email, role, invited_by)
  values (target_org, clean, member_role, auth.uid())
  on conflict (org_id, email) do update set role = excluded.role, accepted_at = null;
  return 'convidado';
end $$;

-- Chamada no login: aceita os convites pendentes do email do usuário (só se o email foi confirmado).
-- Devolve quantas empresas foram adicionadas.
create or replace function accept_invitations()
returns integer language plpgsql security definer set search_path = public as $$
declare
  me_email text;
  n integer := 0;
  inv record;
begin
  select lower(email) into me_email from auth.users
   where id = auth.uid() and email_confirmed_at is not null;
  if me_email is null then return 0; end if;

  for inv in
    select id, org_id, role from invitations where email = me_email and accepted_at is null
  loop
    insert into memberships(org_id, user_id, role) values (inv.org_id, auth.uid(), inv.role)
    on conflict (org_id, user_id) do nothing;
    update invitations set accepted_at = now() where id = inv.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Lista a equipe (membros e convites pendentes). Só para membros da empresa.
create or replace function list_team(target_org uuid)
returns table(kind text, id uuid, email text, role member_role, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(target_org) then raise exception 'Sem acesso a esta empresa.'; end if;
  return query
    select 'membro'::text, m.user_id, u.email::text, m.role, m.user_id = auth.uid()
      from memberships m join auth.users u on u.id = m.user_id
     where m.org_id = target_org
    union all
    select 'convite'::text, i.id, i.email, i.role, false
      from invitations i
     where i.org_id = target_org and i.accepted_at is null
    order by 1 desc, 3;
end $$;

-- Remove um membro. A empresa nunca fica sem dono.
create or replace function remove_member(target_org uuid, member_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare target_role member_role;
begin
  if not is_admin(target_org) then raise exception 'Apenas donos e admins removem pessoas.'; end if;
  select role into target_role from memberships where org_id = target_org and user_id = member_id;
  if target_role is null then return; end if;
  if target_role = 'owner' then
    if not exists (select 1 from memberships where org_id = target_org and user_id = auth.uid() and role = 'owner') then
      raise exception 'Apenas donos removem outro dono.';
    end if;
    if (select count(*) from memberships where org_id = target_org and role = 'owner') <= 1 then
      raise exception 'A empresa precisa de pelo menos um dono.';
    end if;
  end if;
  delete from memberships where org_id = target_org and user_id = member_id;
  delete from invitations i using auth.users u
   where i.org_id = target_org and u.id = member_id and i.email = lower(u.email);
end $$;

-- Cancela um convite que ainda não foi aceito
create or replace function cancel_invitation(invitation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare target_org uuid;
begin
  select org_id into target_org from invitations where id = invitation_id and accepted_at is null;
  if target_org is null then return; end if;
  if not is_admin(target_org) then raise exception 'Apenas donos e admins cancelam convites.'; end if;
  delete from invitations where id = invitation_id;
end $$;

-- Só usuários logados chamam estas funções
revoke execute on function is_admin(uuid) from public, anon;
revoke execute on function invite_member(uuid, text, member_role) from public, anon;
revoke execute on function accept_invitations() from public, anon;
revoke execute on function list_team(uuid) from public, anon;
revoke execute on function remove_member(uuid, uuid) from public, anon;
revoke execute on function cancel_invitation(uuid) from public, anon;
grant execute on function is_admin(uuid) to authenticated;
grant execute on function invite_member(uuid, text, member_role) to authenticated;
grant execute on function accept_invitations() to authenticated;
grant execute on function list_team(uuid) to authenticated;
grant execute on function remove_member(uuid, uuid) to authenticated;
grant execute on function cancel_invitation(uuid) to authenticated;
