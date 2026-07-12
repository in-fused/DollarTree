-- Immediate core-access hardening. This migration intentionally limits its
-- policy cutover to the four identity/project catalog tables so the much
-- larger operational-table policy consolidation can be tested separately.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

revoke create on schema public from public, anon, authenticated;

create schema if not exists app_security;
revoke all on schema app_security from public, anon;
grant usage on schema app_security to authenticated;

create or replace function app_security.role_rank(p_role text)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select case lower(coalesce(p_role, ''))
    when 'owner' then 4
    when 'admin' then 3
    when 'editor' then 2
    when 'viewer' then 1
    else 0
  end
$$;

create or replace function app_security.current_global_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case lower(coalesce((
    select p.role
    from public.profiles p
    where p.user_id = (select auth.uid())
    limit 1
  ), 'viewer'))
    when 'owner' then 'owner'
    when 'admin' then 'admin'
    when 'editor' then 'editor'
    else 'viewer'
  end
$$;

create or replace function app_security.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and app_security.current_global_role() in ('owner', 'admin')
$$;

create or replace function app_security.has_project_role(
  p_project_id text,
  p_min_role text default 'viewer'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select
      (select auth.uid()) as user_id,
      app_security.current_global_role() as global_role
  )
  select
    caller.user_id is not null
    and p_project_id is not null
    and lower(coalesce(p_min_role, '')) in ('viewer', 'editor', 'admin')
    and (
      caller.global_role in ('owner', 'admin')
      or exists (
        select 1
        from public.project_memberships pm
        where pm.project_id = p_project_id
          and pm.user_id = caller.user_id
          and greatest(
            app_security.role_rank(pm.role),
            app_security.role_rank(caller.global_role)
          ) >= app_security.role_rank(p_min_role)
      )
    )
  from caller
$$;

create or replace function app_security.can_view_profile(p_target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and (
      p_target_user_id = (select auth.uid())
      or app_security.is_global_admin()
      or exists (
        select 1
        from public.project_memberships target_pm
        join public.project_memberships caller_pm
          on caller_pm.project_id = target_pm.project_id
         and caller_pm.user_id = (select auth.uid())
         and lower(caller_pm.role) = 'admin'
        where target_pm.user_id = p_target_user_id
      )
    )
$$;

create or replace function app_security.invite_matches_current_user(
  p_target_email text,
  p_target_phone text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = (select auth.uid())
      and (
        (
          nullif(lower(trim(coalesce(p_target_email, ''))), '') is not null
          and lower(trim(p_target_email)) = lower(trim(coalesce(u.email, '')))
        )
        or (
          public.dt_normalize_phone(p_target_phone) is not null
          and public.dt_normalize_phone(p_target_phone) = public.dt_normalize_phone(u.phone)
        )
      )
  )
$$;

alter function public.dt_normalize_phone(text) set search_path = '';

revoke all on all functions in schema app_security from public, anon, authenticated;
grant execute on function app_security.is_global_admin() to authenticated;
grant execute on function app_security.has_project_role(text, text) to authenticated;
grant execute on function app_security.can_view_profile(uuid) to authenticated;
grant execute on function app_security.invite_matches_current_user(text, text) to authenticated;
grant execute on function app_security.storage_project_id(text) to authenticated;

-- Remove the historical hard-coded email owner fallback. Authorization now
-- comes only from the role stored for the authenticated user.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select app_security.current_global_role()
$$;

create or replace function public.current_user_is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_security.is_global_admin()
$$;

-- Earlier repository snapshots declared these RPCs with different return
-- types/argument names. PostgreSQL cannot change either through CREATE OR
-- REPLACE, so drop the old signatures explicitly for deterministic replay.
drop function if exists public.list_my_pending_project_invites();

create or replace function public.list_my_pending_project_invites()
returns setof public.project_invites
language sql
stable
security definer
set search_path = ''
as $$
  select pi.*
  from public.project_invites pi
  where lower(coalesce(pi.status, 'pending')) = 'pending'
    and pi.accepted_at is null
    and pi.revoked_at is null
    and app_security.invite_matches_current_user(
      coalesce(pi.target_email, pi.email),
      pi.target_phone
    )
  order by pi.created_at desc
$$;

drop function if exists public.accept_project_invite_v2(uuid);

create or replace function public.accept_project_invite_v2(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.project_invites%rowtype;
  v_existing_role text;
begin
  if v_uid is null then
    raise exception 'Sign in is required.';
  end if;

  select pi.*
  into v_invite
  from public.project_invites pi
  where pi.id = p_invite_id
  for update;

  if not found or not app_security.invite_matches_current_user(
    coalesce(v_invite.target_email, v_invite.email),
    v_invite.target_phone
  ) then
    raise exception 'Invite is no longer available for this account.';
  end if;

  if v_invite.accepted_at is not null
     or v_invite.accepted_by_user_id is not null
     or lower(coalesce(v_invite.status, 'pending')) = 'accepted' then
    raise exception 'This invite has already been accepted.';
  end if;

  if v_invite.revoked_at is not null
     or lower(coalesce(v_invite.status, 'pending')) = 'revoked' then
    raise exception 'This invite has been canceled.';
  end if;

  if lower(coalesce(v_invite.status, 'pending')) <> 'pending' then
    raise exception 'Invite is no longer available.';
  end if;

  select pm.role
  into v_existing_role
  from public.project_memberships pm
  where pm.project_id = v_invite.project_id
    and pm.user_id = v_uid
  for update;

  if found then
    update public.project_memberships pm
    set role = case
          when app_security.role_rank(v_existing_role) >= app_security.role_rank(v_invite.role)
            then v_existing_role
          else v_invite.role
        end,
        updated_at = now()
    where pm.project_id = v_invite.project_id
      and pm.user_id = v_uid;
  else
    insert into public.project_memberships (
      project_id,
      user_id,
      role,
      created_by
    ) values (
      v_invite.project_id,
      v_uid,
      v_invite.role,
      coalesce(v_invite.invited_by, v_uid)
    );
  end if;

  update public.project_invites
  set status = 'accepted',
      accepted_at = now(),
      accepted_by_user_id = v_uid,
      revoked_at = null
  where id = v_invite.id;
end;
$$;

drop function if exists public.accept_project_invite(text);

create or replace function public.accept_project_invite(target_project_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required.';
  end if;

  select pi.id
  into v_invite_id
  from public.project_invites pi
  where pi.project_id = target_project_id
    and lower(coalesce(pi.status, 'pending')) = 'pending'
    and pi.accepted_at is null
    and pi.revoked_at is null
    and app_security.invite_matches_current_user(
      coalesce(pi.target_email, pi.email),
      pi.target_phone
    )
  order by pi.created_at desc
  limit 1;

  if v_invite_id is null then
    raise exception 'No active invite found for this account and project.';
  end if;

  perform public.accept_project_invite_v2(v_invite_id);
end;
$$;

do $$
begin
  if exists (
    select 1 from public.profiles
    where lower(coalesce(role, '')) not in ('viewer', 'editor', 'admin', 'owner')
  ) then
    raise exception 'profiles contains an unsupported role; aborting policy cutover.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (lower(role) in ('viewer', 'editor', 'admin', 'owner'))
      not valid;
  end if;
end
$$;

alter table public.profiles validate constraint profiles_role_check;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'projects', 'project_memberships', 'project_invites')
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  end loop;
end
$$;

create policy profiles_select_authorized
on public.profiles for select
to authenticated
using (app_security.can_view_profile(user_id));

create policy profiles_update_authorized
on public.profiles for update
to authenticated
using (
  user_id = (select auth.uid())
  or (select app_security.is_global_admin())
)
with check (
  user_id = (select auth.uid())
  or (select app_security.is_global_admin())
);

create policy projects_select_authorized
on public.projects for select
to authenticated
using (app_security.has_project_role(project_id, 'viewer'));

create policy projects_insert_global_admin
on public.projects for insert
to authenticated
with check ((select app_security.is_global_admin()));

create policy projects_update_project_admin
on public.projects for update
to authenticated
using (app_security.has_project_role(project_id, 'admin'))
with check (app_security.has_project_role(project_id, 'admin'));

create policy projects_delete_global_admin
on public.projects for delete
to authenticated
using ((select app_security.is_global_admin()));

create policy project_memberships_select_authorized
on public.project_memberships for select
to authenticated
using (
  user_id = (select auth.uid())
  or app_security.has_project_role(project_id, 'admin')
);

create policy project_memberships_insert_admin
on public.project_memberships for insert
to authenticated
with check (
  app_security.has_project_role(project_id, 'admin')
  and (created_by is null or created_by = (select auth.uid()) or (select app_security.is_global_admin()))
);

create policy project_memberships_update_admin
on public.project_memberships for update
to authenticated
using (app_security.has_project_role(project_id, 'admin'))
with check (app_security.has_project_role(project_id, 'admin'));

create policy project_memberships_delete_admin
on public.project_memberships for delete
to authenticated
using (app_security.has_project_role(project_id, 'admin'));

create policy project_invites_select_authorized
on public.project_invites for select
to authenticated
using (
  app_security.has_project_role(project_id, 'admin')
  or app_security.invite_matches_current_user(
    coalesce(target_email, email),
    target_phone
  )
);

create policy project_invites_insert_admin
on public.project_invites for insert
to authenticated
with check (
  app_security.has_project_role(project_id, 'admin')
  and (invited_by is null or invited_by = (select auth.uid()) or (select app_security.is_global_admin()))
);

create policy project_invites_update_admin
on public.project_invites for update
to authenticated
using (app_security.has_project_role(project_id, 'admin'))
with check (app_security.has_project_role(project_id, 'admin'));

create policy project_invites_delete_admin
on public.project_invites for delete
to authenticated
using (app_security.has_project_role(project_id, 'admin'));

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.projects enable row level security;
alter table public.projects force row level security;
alter table public.project_memberships enable row level security;
alter table public.project_memberships force row level security;
alter table public.project_invites enable row level security;
alter table public.project_invites force row level security;

revoke all on table
  public.profiles,
  public.projects,
  public.project_memberships,
  public.project_invites
from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, phone) on public.profiles to authenticated;

grant select, insert, update, delete
on public.projects, public.project_memberships, public.project_invites
to authenticated;

-- CREATE OR REPLACE preserves old ACLs. Remove inherited execution from every
-- public security-definer function, then expose only application RPCs and the
-- four legacy policy predicates that remain until the operational-table
-- policy consolidation is deployed.
do $$
declare
  function_row record;
begin
  for function_row in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute 'revoke all on function ' || function_row.signature || ' from public, anon, authenticated';
  end loop;
end
$$;

grant execute on function public.upsert_my_profile(text, text) to authenticated;
grant execute on function public.list_my_pending_project_invites() to authenticated;
grant execute on function public.accept_project_invite_v2(uuid) to authenticated;
grant execute on function public.accept_project_invite(text) to authenticated;
grant execute on function public.org_list_accounts() to authenticated;
grant execute on function public.org_list_project_invites() to authenticated;
grant execute on function public.org_update_global_role(uuid, text) to authenticated;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.can_edit_project(text) to authenticated;
grant execute on function public.can_view_project(text) to authenticated;

commit;
