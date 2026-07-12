-- Consolidate legacy/duplicate operational policies into one project-scoped
-- policy per command. This removes permissive policies that otherwise OR with
-- correct policies and bypass role enforcement.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if exists (
    select 1 from public.stores where project_id is null
    union all
    select 1 from public.store_status where project_id is null
    union all
    select 1 from public.store_notes where project_id is null
    union all
    select 1 from public.store_photos where project_id is null
    union all
    select 1 from public.routes where project_id is null
    union all
    select 1 from public.activity_events where project_id is null
  ) then
    raise exception 'Operational tables contain unscoped rows; aborting policy consolidation.';
  end if;
end
$$;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'stores',
        'store_status',
        'store_notes',
        'store_photos',
        'routes',
        'activity_events'
      )
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  end loop;
end
$$;

create policy stores_select_project_viewer
on public.stores for select
to authenticated
using (app_security.has_project_role(project_id, 'viewer'));

create policy stores_insert_project_admin
on public.stores for insert
to authenticated
with check (app_security.has_project_role(project_id, 'admin'));

create policy stores_update_project_admin
on public.stores for update
to authenticated
using (app_security.has_project_role(project_id, 'admin'))
with check (app_security.has_project_role(project_id, 'admin'));

create policy stores_delete_project_admin
on public.stores for delete
to authenticated
using (app_security.has_project_role(project_id, 'admin'));

create policy store_status_select_project_viewer
on public.store_status for select
to authenticated
using (app_security.has_project_role(project_id, 'viewer'));

create policy store_status_insert_project_editor
on public.store_status for insert
to authenticated
with check (app_security.has_project_role(project_id, 'editor'));

create policy store_status_update_project_editor
on public.store_status for update
to authenticated
using (app_security.has_project_role(project_id, 'editor'))
with check (app_security.has_project_role(project_id, 'editor'));

create policy store_status_delete_project_admin
on public.store_status for delete
to authenticated
using (app_security.has_project_role(project_id, 'admin'));

create policy store_notes_select_project_viewer
on public.store_notes for select
to authenticated
using (app_security.has_project_role(project_id, 'viewer'));

create policy store_notes_insert_project_editor
on public.store_notes for insert
to authenticated
with check (app_security.has_project_role(project_id, 'editor'));

create policy store_notes_update_project_editor
on public.store_notes for update
to authenticated
using (app_security.has_project_role(project_id, 'editor'))
with check (app_security.has_project_role(project_id, 'editor'));

create policy store_notes_delete_project_editor
on public.store_notes for delete
to authenticated
using (app_security.has_project_role(project_id, 'editor'));

create policy store_photos_select_project_viewer
on public.store_photos for select
to authenticated
using (app_security.has_project_role(project_id, 'viewer'));

create policy store_photos_insert_project_editor
on public.store_photos for insert
to authenticated
with check (app_security.has_project_role(project_id, 'editor'));

create policy store_photos_update_project_editor
on public.store_photos for update
to authenticated
using (app_security.has_project_role(project_id, 'editor'))
with check (app_security.has_project_role(project_id, 'editor'));

create policy store_photos_delete_project_admin
on public.store_photos for delete
to authenticated
using (app_security.has_project_role(project_id, 'admin'));

create policy routes_select_project_viewer
on public.routes for select
to authenticated
using (app_security.has_project_role(project_id, 'viewer'));

create policy routes_insert_project_editor
on public.routes for insert
to authenticated
with check (app_security.has_project_role(project_id, 'editor'));

create policy routes_update_project_editor
on public.routes for update
to authenticated
using (app_security.has_project_role(project_id, 'editor'))
with check (app_security.has_project_role(project_id, 'editor'));

create policy routes_delete_project_editor
on public.routes for delete
to authenticated
using (app_security.has_project_role(project_id, 'editor'));

create policy activity_events_select_project_viewer
on public.activity_events for select
to authenticated
using (app_security.has_project_role(project_id, 'viewer'));

create policy activity_events_insert_project_editor
on public.activity_events for insert
to authenticated
with check (
  app_security.has_project_role(project_id, 'editor')
  and (actor_user_id is null or actor_user_id = (select auth.uid()))
);

create policy activity_events_update_project_admin
on public.activity_events for update
to authenticated
using (app_security.has_project_role(project_id, 'admin'))
with check (app_security.has_project_role(project_id, 'admin'));

create policy activity_events_delete_project_admin
on public.activity_events for delete
to authenticated
using (app_security.has_project_role(project_id, 'admin'));

alter table public.stores enable row level security;
alter table public.stores force row level security;
alter table public.store_status enable row level security;
alter table public.store_status force row level security;
alter table public.store_notes enable row level security;
alter table public.store_notes force row level security;
alter table public.store_photos enable row level security;
alter table public.store_photos force row level security;
alter table public.routes enable row level security;
alter table public.routes force row level security;
alter table public.activity_events enable row level security;
alter table public.activity_events force row level security;

revoke all on table
  public.stores,
  public.store_status,
  public.store_notes,
  public.store_photos,
  public.routes,
  public.activity_events
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.stores,
  public.store_status,
  public.store_notes,
  public.store_photos,
  public.routes,
  public.activity_events
to authenticated;

revoke all on sequence public.store_notes_id_seq from public, anon, authenticated;
grant usage on sequence public.store_notes_id_seq to authenticated;

-- Storage object paths are project_id/store_id/file. Remove global-role and
-- anonymous bucket policies; retain one project-scoped policy per command.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'store_photos%'
  loop
    execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
  end loop;
end
$$;

create policy store_photos_read
on storage.objects for select
to authenticated
using (
  bucket_id = 'store-photos'
  and app_security.has_project_role(app_security.storage_project_id(name), 'viewer')
);

create policy store_photos_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'store-photos'
  and app_security.has_project_role(app_security.storage_project_id(name), 'editor')
);

create policy store_photos_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'store-photos'
  and app_security.has_project_role(app_security.storage_project_id(name), 'editor')
)
with check (
  bucket_id = 'store-photos'
  and app_security.has_project_role(app_security.storage_project_id(name), 'editor')
);

create policy store_photos_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'store-photos'
  and app_security.has_project_role(app_security.storage_project_id(name), 'admin')
);

alter view public.project_metrics_view set (security_invoker = true);
alter view public.region_metrics_view set (security_invoker = true);
alter view public.territory_metrics_view set (security_invoker = true);

revoke all on table public.store_status_pk_migration_audit_20260608
from public, anon, authenticated;
revoke all on sequence public.store_status_pk_migration_audit_20260608_id_seq
from public, anon, authenticated;
alter table public.store_status_pk_migration_audit_20260608 enable row level security;
alter table public.store_status_pk_migration_audit_20260608 force row level security;

alter function public.verify_pin(text) set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = '';
alter function public.current_user_project_role(text) set search_path = '';
alter function app_security.storage_project_id(text) set search_path = '';
alter function public.geocode_store(integer) set search_path = public, pg_temp;
revoke all on function public.geocode_store(integer) from public, anon, authenticated;

-- The operational-policy cutover removes the last direct policy references
-- to these legacy public predicates. Internal security-definer wrappers keep
-- owner execution and do not require caller grants.
revoke execute on function public.current_user_role() from authenticated;
revoke execute on function public.can_edit_project(text) from authenticated;
revoke execute on function public.can_view_project(text) from authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

commit;
