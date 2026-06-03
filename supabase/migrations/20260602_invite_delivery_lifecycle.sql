create extension if not exists pgcrypto;

create table if not exists public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(project_id) on delete cascade,
  email text,
  phone text,
  invite_target_type text not null default 'email',
  target_email text,
  target_phone text,
  role text not null default 'viewer',
  invited_by uuid references auth.users(id),
  accepted_by_user_id uuid references auth.users(id),
  status text not null default 'pending',
  delivery_channel text not null default 'email',
  delivery_status text not null default 'not_sent',
  delivery_provider text,
  provider_message_id text,
  delivery_error text,
  sent_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_invites add column if not exists id uuid default gen_random_uuid();
update public.project_invites set id = gen_random_uuid() where id is null;
alter table public.project_invites alter column id set default gen_random_uuid();
alter table public.project_invites alter column id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.project_invites'::regclass
      and contype = 'p'
  ) then
    alter table public.project_invites
      add constraint project_invites_pkey primary key (id);
  end if;
end $$;

alter table public.project_invites add column if not exists project_id text;
alter table public.project_invites add column if not exists email text;
alter table public.project_invites add column if not exists phone text;
alter table public.project_invites add column if not exists invite_target_type text default 'email';
alter table public.project_invites add column if not exists target_email text;
alter table public.project_invites add column if not exists target_phone text;
alter table public.project_invites add column if not exists role text default 'viewer';
alter table public.project_invites add column if not exists invited_by uuid references auth.users(id);
alter table public.project_invites add column if not exists accepted_by_user_id uuid references auth.users(id);
alter table public.project_invites add column if not exists status text default 'pending';
alter table public.project_invites add column if not exists delivery_channel text default 'email';
alter table public.project_invites add column if not exists delivery_status text default 'not_sent';
alter table public.project_invites add column if not exists delivery_provider text;
alter table public.project_invites add column if not exists provider_message_id text;
alter table public.project_invites add column if not exists delivery_error text;
alter table public.project_invites add column if not exists sent_at timestamptz;
alter table public.project_invites add column if not exists accepted_at timestamptz;
alter table public.project_invites add column if not exists revoked_at timestamptz;
alter table public.project_invites add column if not exists created_at timestamptz default now();
alter table public.project_invites add column if not exists updated_at timestamptz default now();

update public.project_invites
set
  target_email = nullif(lower(trim(coalesce(target_email, email))), ''),
  email = nullif(lower(trim(coalesce(email, target_email))), '')
where coalesce(target_email, email) is not null;

update public.project_invites
set
  target_phone = nullif(trim(coalesce(target_phone, phone)), ''),
  phone = nullif(trim(coalesce(phone, target_phone)), '')
where coalesce(target_phone, phone) is not null;

update public.project_invites
set invite_target_type = case
  when nullif(trim(coalesce(target_phone, phone)), '') is not null then 'phone'
  else 'email'
end
where invite_target_type is null
  or lower(invite_target_type) not in ('email', 'phone');

update public.project_invites
set role = case lower(trim(coalesce(role, 'viewer')))
  when 'admin' then 'admin'
  when 'editor' then 'editor'
  else 'viewer'
end;

update public.project_invites
set status = case
  when accepted_at is not null or accepted_by_user_id is not null or lower(trim(coalesce(status, ''))) = 'accepted' then 'accepted'
  when revoked_at is not null or lower(trim(coalesce(status, ''))) in ('revoked', 'canceled', 'cancelled') then 'revoked'
  else 'pending'
end;

update public.project_invites
set
  delivery_channel = case
    when lower(trim(coalesce(delivery_channel, ''))) = 'sms' or invite_target_type = 'phone' then 'sms'
    else 'email'
  end,
  delivery_status = case lower(trim(coalesce(delivery_status, 'not_sent')))
    when 'sent' then 'sent'
    when 'failed' then 'failed'
    when 'recorded_only' then 'recorded_only'
    when 'recorded-only' then 'recorded_only'
    else 'not_sent'
  end,
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, created_at, now());

alter table public.project_invites alter column invite_target_type set default 'email';
alter table public.project_invites alter column invite_target_type set not null;
alter table public.project_invites alter column role set default 'viewer';
alter table public.project_invites alter column role set not null;
alter table public.project_invites alter column status set default 'pending';
alter table public.project_invites alter column status set not null;
alter table public.project_invites alter column delivery_channel set default 'email';
alter table public.project_invites alter column delivery_channel set not null;
alter table public.project_invites alter column delivery_status set default 'not_sent';
alter table public.project_invites alter column delivery_status set not null;
alter table public.project_invites alter column created_at set default now();
alter table public.project_invites alter column created_at set not null;
alter table public.project_invites alter column updated_at set default now();
alter table public.project_invites alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_invites_target_type_check'
      and conrelid = 'public.project_invites'::regclass
  ) then
    alter table public.project_invites
      add constraint project_invites_target_type_check
      check (invite_target_type in ('email', 'phone'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'project_invites_role_check'
      and conrelid = 'public.project_invites'::regclass
  ) then
    alter table public.project_invites
      add constraint project_invites_role_check
      check (role in ('viewer', 'editor', 'admin'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'project_invites_status_check'
      and conrelid = 'public.project_invites'::regclass
  ) then
    alter table public.project_invites
      add constraint project_invites_status_check
      check (status in ('pending', 'accepted', 'revoked'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'project_invites_delivery_channel_check'
      and conrelid = 'public.project_invites'::regclass
  ) then
    alter table public.project_invites
      add constraint project_invites_delivery_channel_check
      check (delivery_channel in ('email', 'sms'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'project_invites_delivery_status_check'
      and conrelid = 'public.project_invites'::regclass
  ) then
    alter table public.project_invites
      add constraint project_invites_delivery_status_check
      check (delivery_status in ('sent', 'failed', 'recorded_only', 'not_sent'));
  end if;
end $$;

with ranked_email_invites as (
  select
    id,
    row_number() over (
      partition by project_id, lower(coalesce(target_email, email))
      order by created_at desc nulls last, id desc
    ) as row_number
  from public.project_invites
  where status = 'pending'
    and accepted_at is null
    and revoked_at is null
    and nullif(lower(coalesce(target_email, email)), '') is not null
)
update public.project_invites pi
set
  status = 'revoked',
  revoked_at = coalesce(pi.revoked_at, now()),
  updated_at = now()
from ranked_email_invites ranked
where pi.id = ranked.id
  and ranked.row_number > 1;

with ranked_phone_invites as (
  select
    id,
    row_number() over (
      partition by project_id, coalesce(target_phone, phone)
      order by created_at desc nulls last, id desc
    ) as row_number
  from public.project_invites
  where status = 'pending'
    and accepted_at is null
    and revoked_at is null
    and nullif(coalesce(target_phone, phone), '') is not null
)
update public.project_invites pi
set
  status = 'revoked',
  revoked_at = coalesce(pi.revoked_at, now()),
  updated_at = now()
from ranked_phone_invites ranked
where pi.id = ranked.id
  and ranked.row_number > 1;

do $$
declare
  legacy_constraint record;
  legacy_index record;
begin
  alter table public.project_invites drop constraint if exists project_invites_project_id_email_key;
  alter table public.project_invites drop constraint if exists project_invites_project_id_phone_key;
  alter table public.project_invites drop constraint if exists project_invites_project_id_target_email_key;
  alter table public.project_invites drop constraint if exists project_invites_project_id_target_phone_key;

  drop index if exists public.project_invites_project_id_email_key;
  drop index if exists public.project_invites_project_id_phone_key;
  drop index if exists public.project_invites_project_id_target_email_key;
  drop index if exists public.project_invites_project_id_target_phone_key;

  for legacy_constraint in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.project_invites'::regclass
      and con.contype = 'u'
      and exists (
        select 1
        from unnest(con.conkey) column_number
        join pg_attribute attr
          on attr.attrelid = con.conrelid
         and attr.attnum = column_number
        where attr.attname = 'project_id'
      )
      and exists (
        select 1
        from unnest(con.conkey) column_number
        join pg_attribute attr
          on attr.attrelid = con.conrelid
         and attr.attnum = column_number
        where attr.attname in ('email', 'target_email', 'phone', 'target_phone')
      )
      and not exists (
        select 1
        from unnest(con.conkey) column_number
        join pg_attribute attr
          on attr.attrelid = con.conrelid
         and attr.attnum = column_number
        where attr.attname not in (
          'project_id',
          'invite_target_type',
          'email',
          'target_email',
          'phone',
          'target_phone'
        )
      )
  loop
    execute format('alter table public.project_invites drop constraint if exists %I', legacy_constraint.conname);
  end loop;

  for legacy_index in
    select distinct idx.relname
    from pg_index i
    join pg_class tbl
      on tbl.oid = i.indrelid
    join pg_namespace ns
      on ns.oid = tbl.relnamespace
    join pg_class idx
      on idx.oid = i.indexrelid
    where ns.nspname = 'public'
      and tbl.relname = 'project_invites'
      and i.indisunique
      and i.indexprs is null
      and not exists (
        select 1
        from pg_constraint con
        where con.conindid = i.indexrelid
      )
      and exists (
        select 1
        from unnest(i.indkey) column_number
        join pg_attribute attr
          on attr.attrelid = i.indrelid
         and attr.attnum = column_number
        where attr.attname = 'project_id'
      )
      and exists (
        select 1
        from unnest(i.indkey) column_number
        join pg_attribute attr
          on attr.attrelid = i.indrelid
         and attr.attnum = column_number
        where attr.attname in ('email', 'target_email', 'phone', 'target_phone')
      )
      and not exists (
        select 1
        from unnest(i.indkey) column_number
        join pg_attribute attr
          on attr.attrelid = i.indrelid
         and attr.attnum = column_number
        where attr.attname not in (
          'project_id',
          'invite_target_type',
          'email',
          'target_email',
          'phone',
          'target_phone'
        )
      )
      and idx.relname not in (
        'project_invites_one_pending_email_per_project_idx',
        'project_invites_one_pending_phone_per_project_idx'
      )
  loop
    execute format('drop index if exists public.%I', legacy_index.relname);
  end loop;
end $$;

create index if not exists project_invites_project_id_created_idx
  on public.project_invites(project_id, created_at desc);

create index if not exists project_invites_status_idx
  on public.project_invites(status);

create unique index if not exists project_invites_one_pending_email_per_project_idx
  on public.project_invites(project_id, lower(coalesce(target_email, email)))
  where status = 'pending'
    and accepted_at is null
    and revoked_at is null
    and nullif(lower(coalesce(target_email, email)), '') is not null;

create unique index if not exists project_invites_one_pending_phone_per_project_idx
  on public.project_invites(project_id, coalesce(target_phone, phone))
  where status = 'pending'
    and accepted_at is null
    and revoked_at is null
    and nullif(coalesce(target_phone, phone), '') is not null;

create or replace function public.set_project_invites_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_project_invites_updated_at on public.project_invites;
create trigger set_project_invites_updated_at
before update on public.project_invites
for each row execute function public.set_project_invites_updated_at();

create or replace function public.prevent_pending_invite_after_acceptance()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_target_key text;
begin
  if new.status <> 'pending' or new.accepted_at is not null or new.revoked_at is not null then
    return new;
  end if;

  v_target_key := coalesce(
    lower(nullif(new.target_email, '')),
    lower(nullif(new.email, '')),
    nullif(new.target_phone, ''),
    nullif(new.phone, '')
  );

  if v_target_key is null then
    return new;
  end if;

  if exists (
    select 1
    from public.project_invites existing
    where existing.project_id = new.project_id
      and existing.id <> new.id
      and (
        existing.status = 'accepted'
        or existing.accepted_at is not null
        or existing.accepted_by_user_id is not null
      )
      and coalesce(
        lower(nullif(existing.target_email, '')),
        lower(nullif(existing.email, '')),
        nullif(existing.target_phone, ''),
        nullif(existing.phone, '')
      ) = v_target_key
  ) then
    raise exception 'This invite has already been accepted. The user may already be a member of this project.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_pending_invite_after_acceptance on public.project_invites;
create trigger prevent_pending_invite_after_acceptance
before insert or update on public.project_invites
for each row execute function public.prevent_pending_invite_after_acceptance();

create or replace function public.current_user_is_org_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and lower(coalesce(p.role, '')) in ('owner', 'admin')
  );
$$;

create or replace function public.current_user_is_project_admin(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_is_org_admin()
    or exists (
      select 1
      from public.project_memberships pm
      where pm.project_id = p_project_id
        and pm.user_id = auth.uid()
        and lower(coalesce(pm.role, '')) = 'admin'
    );
$$;

create or replace function public.project_invite_matches_current_user(
  p_email text,
  p_phone text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      (
        nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '') is not null
        and lower(trim(coalesce(p_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
      or exists (
        select 1
        from public.profiles p
        where p.user_id = auth.uid()
          and nullif(trim(coalesce(p.phone, '')), '') is not null
          and trim(coalesce(p_phone, '')) = trim(coalesce(p.phone, ''))
      )
    );
$$;

alter table public.project_invites enable row level security;

drop policy if exists project_invites_select_visible on public.project_invites;
create policy project_invites_select_visible
on public.project_invites
for select
to authenticated
using (
  public.current_user_is_project_admin(project_id)
  or public.project_invite_matches_current_user(
    coalesce(target_email, email),
    coalesce(target_phone, phone)
  )
);

drop policy if exists project_invites_insert_by_project_admin on public.project_invites;
create policy project_invites_insert_by_project_admin
on public.project_invites
for insert
to authenticated
with check (public.current_user_is_project_admin(project_id));

drop policy if exists project_invites_update_by_project_admin on public.project_invites;
create policy project_invites_update_by_project_admin
on public.project_invites
for update
to authenticated
using (public.current_user_is_project_admin(project_id))
with check (public.current_user_is_project_admin(project_id));

drop policy if exists project_invites_delete_by_project_admin on public.project_invites;
create policy project_invites_delete_by_project_admin
on public.project_invites
for delete
to authenticated
using (public.current_user_is_project_admin(project_id));

drop function if exists public.list_my_pending_project_invites();
create function public.list_my_pending_project_invites()
returns table (
  id uuid,
  project_id text,
  project_name text,
  email text,
  phone text,
  invite_target_type text,
  target_email text,
  target_phone text,
  role text,
  status text,
  delivery_channel text,
  delivery_status text,
  delivery_provider text,
  delivery_error text,
  sent_at timestamptz,
  created_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with visible_invites as (
    select
      pi.id,
      pi.project_id,
      p.name as project_name,
      pi.email,
      pi.phone,
      pi.invite_target_type,
      pi.target_email,
      pi.target_phone,
      pi.role,
      pi.status,
      pi.delivery_channel,
      pi.delivery_status,
      pi.delivery_provider,
      pi.delivery_error,
      pi.sent_at,
      pi.created_at,
      pi.accepted_at,
      pi.revoked_at,
      row_number() over (
        partition by
          pi.project_id,
          pi.invite_target_type,
          coalesce(lower(pi.target_email), lower(pi.email), pi.target_phone, pi.phone)
        order by pi.created_at desc, pi.id desc
      ) as row_number
    from public.project_invites pi
    left join public.projects p on p.project_id = pi.project_id
    where pi.status = 'pending'
      and pi.accepted_at is null
      and pi.revoked_at is null
      and public.project_invite_matches_current_user(
        coalesce(pi.target_email, pi.email),
        coalesce(pi.target_phone, pi.phone)
      )
  )
  select
    visible_invites.id,
    visible_invites.project_id,
    visible_invites.project_name,
    visible_invites.email,
    visible_invites.phone,
    visible_invites.invite_target_type,
    visible_invites.target_email,
    visible_invites.target_phone,
    visible_invites.role,
    visible_invites.status,
    visible_invites.delivery_channel,
    visible_invites.delivery_status,
    visible_invites.delivery_provider,
    visible_invites.delivery_error,
    visible_invites.sent_at,
    visible_invites.created_at,
    visible_invites.accepted_at,
    visible_invites.revoked_at
  from visible_invites
  where visible_invites.row_number = 1
  order by visible_invites.created_at desc;
$$;

drop function if exists public.org_list_project_invites();
create function public.org_list_project_invites()
returns table (
  id uuid,
  project_id text,
  project_name text,
  email text,
  phone text,
  invite_target_type text,
  target_email text,
  target_phone text,
  role text,
  status text,
  delivery_channel text,
  delivery_status text,
  delivery_provider text,
  delivery_error text,
  sent_at timestamptz,
  created_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_org_admin() then
    raise exception 'Organization admin access is required to view invites.';
  end if;

  return query
    with visible_invites as (
      select
        pi.id,
        pi.project_id,
        p.name as project_name,
        pi.email,
        pi.phone,
        pi.invite_target_type,
        pi.target_email,
        pi.target_phone,
        pi.role,
        pi.status,
        pi.delivery_channel,
        pi.delivery_status,
        pi.delivery_provider,
        pi.delivery_error,
        pi.sent_at,
        pi.created_at,
        pi.accepted_at,
        pi.revoked_at,
        row_number() over (
          partition by
            pi.project_id,
            pi.invite_target_type,
            coalesce(lower(pi.target_email), lower(pi.email), pi.target_phone, pi.phone)
          order by pi.created_at desc, pi.id desc
        ) as row_number
      from public.project_invites pi
      left join public.projects p on p.project_id = pi.project_id
      where pi.status = 'pending'
        and pi.accepted_at is null
        and pi.revoked_at is null
    )
    select
      visible_invites.id,
      visible_invites.project_id,
      visible_invites.project_name,
      visible_invites.email,
      visible_invites.phone,
      visible_invites.invite_target_type,
      visible_invites.target_email,
      visible_invites.target_phone,
      visible_invites.role,
      visible_invites.status,
      visible_invites.delivery_channel,
      visible_invites.delivery_status,
      visible_invites.delivery_provider,
      visible_invites.delivery_error,
      visible_invites.sent_at,
      visible_invites.created_at,
      visible_invites.accepted_at,
      visible_invites.revoked_at
    from visible_invites
    where visible_invites.row_number = 1
    order by visible_invites.created_at desc;
end;
$$;

drop function if exists public.accept_project_invite_v2(uuid);
create function public.accept_project_invite_v2(p_invite_id uuid)
returns table (
  project_id text,
  role text,
  invite_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.project_invites%rowtype;
  v_now timestamptz := now();
  v_existing_membership public.project_memberships%rowtype;
begin
  if v_user_id is null then
    raise exception 'Sign in is required to accept this invite.';
  end if;

  select *
  into v_invite
  from public.project_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'Invite is no longer available.';
  end if;

  if v_invite.accepted_at is not null or v_invite.accepted_by_user_id is not null or v_invite.status = 'accepted' then
    raise exception 'This invite has already been accepted.';
  end if;

  if v_invite.revoked_at is not null or v_invite.status = 'revoked' then
    raise exception 'This invite has been canceled.';
  end if;

  if not public.project_invite_matches_current_user(
    coalesce(v_invite.target_email, v_invite.email),
    coalesce(v_invite.target_phone, v_invite.phone)
  ) then
    raise exception 'This invite is for a different account.';
  end if;

  select *
  into v_existing_membership
  from public.project_memberships
  where project_memberships.project_id = v_invite.project_id
    and project_memberships.user_id = v_user_id
  limit 1
  for update;

  if found then
    update public.project_memberships
    set role = v_invite.role
    where project_memberships.project_id = v_invite.project_id
      and project_memberships.user_id = v_user_id;
  else
    insert into public.project_memberships (project_id, user_id, role)
    values (v_invite.project_id, v_user_id, v_invite.role);
  end if;

  update public.project_invites
  set
    status = 'accepted',
    accepted_at = v_now,
    accepted_by_user_id = v_user_id,
    revoked_at = null
  where id = v_invite.id;

  return query select v_invite.project_id, v_invite.role, v_invite.id;
end;
$$;

drop function if exists public.accept_project_invite(text);
create function public.accept_project_invite(project_id text)
returns table (
  accepted_project_id text,
  role text,
  invite_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  p_project_id alias for $1;
  v_invite_id uuid;
begin
  select pi.id
  into v_invite_id
  from public.project_invites pi
  where pi.project_id = p_project_id
    and pi.status = 'pending'
    and pi.accepted_at is null
    and pi.revoked_at is null
    and public.project_invite_matches_current_user(
      coalesce(pi.target_email, pi.email),
      coalesce(pi.target_phone, pi.phone)
    )
  order by pi.created_at desc, pi.id desc
  limit 1;

  if v_invite_id is null then
    raise exception 'Invite is no longer available.';
  end if;

  return query
    select accepted.project_id, accepted.role, accepted.invite_id
    from public.accept_project_invite_v2(v_invite_id) accepted;
end;
$$;

revoke all on function public.current_user_is_org_admin() from public;
revoke all on function public.current_user_is_project_admin(text) from public;
revoke all on function public.project_invite_matches_current_user(text, text) from public;
revoke all on function public.list_my_pending_project_invites() from public;
revoke all on function public.org_list_project_invites() from public;
revoke all on function public.accept_project_invite_v2(uuid) from public;
revoke all on function public.accept_project_invite(text) from public;

grant execute on function public.current_user_is_org_admin() to authenticated;
grant execute on function public.current_user_is_project_admin(text) to authenticated;
grant execute on function public.project_invite_matches_current_user(text, text) to authenticated;
grant execute on function public.list_my_pending_project_invites() to authenticated;
grant execute on function public.org_list_project_invites() to authenticated;
grant execute on function public.accept_project_invite_v2(uuid) to authenticated;
grant execute on function public.accept_project_invite(text) to authenticated;
