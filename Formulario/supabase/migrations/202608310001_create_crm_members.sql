-- VisuaLed CRM: private membership gate with mandatory AAL2.
-- Browser clients receive SELECT only; membership administration stays server-side.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create table public.crm_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  role text not null check (role in ('admin', 'agent', 'viewer')),
  active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.crm_members is 'Authorized VisuaLed CRM memberships. Managed only by trusted administrators.';
comment on column public.crm_members.role is 'CRM authorization role: admin, agent, or viewer.';

create trigger crm_members_set_updated_at
before update on public.crm_members
for each row
execute function private.set_updated_at();

alter table public.crm_members enable row level security;
alter table public.crm_members force row level security;

revoke all on table public.crm_members from public, anon, authenticated;
grant select on table public.crm_members to authenticated;

create policy "crm_members_select_own_active"
on public.crm_members
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and active is true
);
