-- VisuaLed campaign registrations consumed by the private CRM.
-- Public visitors may insert validated form fields, but can never read records.

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 3 and 120),
  business_name text not null check (char_length(btrim(business_name)) between 2 and 160),
  whatsapp text not null check (whatsapp ~ '^09[0-9]{8}$'),
  business_activity text not null check (char_length(btrim(business_activity)) between 4 and 240),
  plan_interest text not null check (plan_interest in ('contactar', 'informacion', 'solo_sorteo')),
  source text check (source is null or source in ('expoferia', 'ya_conocia', 'redes_sociales', 'recomendacion', 'otro')),
  coupon_percent smallint not null check (coupon_percent in (10, 15, 20)),
  consent boolean not null check (consent is true),
  campaign text not null default 'sorteo_un_mes_publicidad' check (campaign = 'sorteo_un_mes_publicidad'),
  status text not null default 'nuevo' check (status in ('nuevo', 'por_contactar', 'contactado', 'calificado')),
  is_demo boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.participants is 'Campaign registrations submitted through the VisuaLed public form.';
comment on column public.participants.is_demo is 'True only for clearly identified CRM demonstration rows.';

create index participants_created_at_idx on public.participants (created_at desc);
create index participants_status_idx on public.participants (status);
create index participants_plan_interest_idx on public.participants (plan_interest);

create trigger participants_set_updated_at
before update on public.participants
for each row
execute function private.set_updated_at();

alter table public.participants enable row level security;
alter table public.participants force row level security;

revoke all on table public.participants from public, anon, authenticated;
grant insert (full_name, business_name, whatsapp, business_activity, plan_interest, source, coupon_percent, consent, campaign)
  on public.participants to anon;
grant select on public.participants to authenticated;
grant update (status) on public.participants to authenticated;

create policy participants_public_form_insert
on public.participants
for insert
to anon
with check (
  consent is true
  and is_demo is false
  and status = 'nuevo'
  and campaign = 'sorteo_un_mes_publicidad'
);

create policy participants_crm_member_read
on public.participants
for select
to authenticated
using (
  exists (
    select 1
    from public.crm_members
    where crm_members.user_id = (select auth.uid())
      and crm_members.active is true
  )
);

create policy participants_crm_member_update_status
on public.participants
for update
to authenticated
using (
  exists (
    select 1
    from public.crm_members
    where crm_members.user_id = (select auth.uid())
      and crm_members.active is true
  )
)
with check (
  exists (
    select 1
    from public.crm_members
    where crm_members.user_id = (select auth.uid())
      and crm_members.active is true
  )
);

insert into public.participants (
  full_name, business_name, whatsapp, business_activity,
  plan_interest, source, coupon_percent, consent, status, is_demo
)
select *
from (
  values
    ('G. Olbori', 'Olbori Studio', '0990000101', 'Diseño y comunicación visual', 'contactar', 'otro', 10, true, 'nuevo', true),
    ('Ulisa Castro', 'Castro Creativa', '0990000102', 'Productos personalizados para emprendedores', 'informacion', 'redes_sociales', 15, true, 'nuevo', true),
    ('Kaya', 'Kaya', '0990000103', 'Servicios para pequeños negocios', 'solo_sorteo', 'recomendacion', 20, true, 'nuevo', true)
) as seed(full_name, business_name, whatsapp, business_activity, plan_interest, source, coupon_percent, consent, status, is_demo)
where not exists (
  select 1 from public.participants existing
  where lower(existing.full_name) = lower(seed.full_name)
    and existing.is_demo is true
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'participants'
  ) then
    alter publication supabase_realtime add table public.participants;
  end if;
end
$$;
