create extension if not exists pgcrypto;

create table if not exists public.project_share_links (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(project_id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  access_count integer not null default 0,
  scope text not null default 'overview',
  label text
);

alter table public.project_share_links enable row level security;

create index if not exists project_share_links_project_id_idx
  on public.project_share_links(project_id);

create index if not exists project_share_links_expires_at_idx
  on public.project_share_links(expires_at);

create index if not exists project_share_links_active_idx
  on public.project_share_links(project_id, expires_at)
  where revoked_at is null;
