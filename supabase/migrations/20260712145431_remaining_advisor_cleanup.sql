-- Finish low-risk advisor cleanup after the core and operational RLS cutovers.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create index if not exists project_invites_invited_by_idx
  on public.project_invites (invited_by);
create index if not exists project_memberships_created_by_idx
  on public.project_memberships (created_by);
create index if not exists project_share_links_created_by_idx
  on public.project_share_links (created_by);

drop policy if exists app_config_admin_write on public.app_config;
drop policy if exists app_config_read_all on public.app_config;

create policy app_config_global_admin
on public.app_config for all
to authenticated
using ((select app_security.is_global_admin()))
with check ((select app_security.is_global_admin()));

alter table public.app_config enable row level security;
alter table public.app_config force row level security;
revoke all on table public.app_config from public, anon, authenticated;
grant select, insert, update, delete on table public.app_config to authenticated;

drop policy if exists geocode_cache_insert on public.geocode_cache;
drop policy if exists geocode_cache_select on public.geocode_cache;
drop policy if exists geocode_cache_update on public.geocode_cache;

create policy geocode_cache_select_authenticated
on public.geocode_cache for select
to authenticated
using ((select auth.uid()) is not null);

create policy geocode_cache_insert_authenticated
on public.geocode_cache for insert
to authenticated
with check ((select auth.uid()) is not null);

create policy geocode_cache_update_authenticated
on public.geocode_cache for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

alter table public.geocode_cache enable row level security;
alter table public.geocode_cache force row level security;
revoke all on table public.geocode_cache from public, anon, authenticated;
grant select, insert, update on table public.geocode_cache to authenticated;

-- app_config no longer depends on this legacy exposed predicate.
revoke execute on function public.current_app_role() from authenticated;

commit;
