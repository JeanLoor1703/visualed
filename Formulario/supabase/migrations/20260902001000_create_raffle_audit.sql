-- Secure, auditable real raffles for the private VisuaLed CRM.
-- Demonstration raffles stay entirely in the browser and never write here.

create table if not exists public.raffles (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  campaign text not null default 'sorteo_un_mes_publicidad'
    check (campaign = 'sorteo_un_mes_publicidad'),
  mode text not null default 'real' check (mode = 'real'),
  status text not null default 'completed'
    check (status in ('running', 'completed', 'failed')),
  filter_coupon_percent smallint
    check (filter_coupon_percent is null or filter_coupon_percent in (10, 15, 20)),
  eligible_count integer not null default 0 check (eligible_count >= 0),
  winner_count smallint not null default 0 check (winner_count between 0 and 1),
  executed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create table if not exists public.raffle_entries (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete restrict,
  business_key text not null,
  ticket_code text not null,
  entry_number integer not null check (entry_number > 0),
  full_name text not null,
  business_name text not null,
  coupon_percent smallint not null check (coupon_percent in (10, 15, 20)),
  created_at timestamptz not null default timezone('utc', now()),
  unique (raffle_id, business_key),
  unique (raffle_id, ticket_code)
);

create table if not exists public.raffle_winners (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles(id) on delete cascade,
  entry_id uuid not null references public.raffle_entries(id) on delete restrict,
  position smallint not null check (position = 1),
  created_at timestamptz not null default timezone('utc', now()),
  unique (raffle_id, position),
  unique (raffle_id, entry_id)
);

create index if not exists raffles_created_at_idx on public.raffles (created_at desc);
create index if not exists raffle_entries_raffle_id_idx on public.raffle_entries (raffle_id, entry_number);
create index if not exists raffle_winners_raffle_id_idx on public.raffle_winners (raffle_id, position);

alter table public.raffles enable row level security;
alter table public.raffles force row level security;
alter table public.raffle_entries enable row level security;
alter table public.raffle_entries force row level security;
alter table public.raffle_winners enable row level security;
alter table public.raffle_winners force row level security;

revoke all on table public.raffles, public.raffle_entries, public.raffle_winners from public, anon, authenticated;
grant select on table public.raffles, public.raffle_entries, public.raffle_winners to authenticated;

create policy raffle_audit_member_read
on public.raffles
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

create policy raffle_entries_member_read
on public.raffle_entries
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

create policy raffle_winners_member_read
on public.raffle_winners
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

create or replace function public.execute_real_raffle(
  p_executed_by uuid,
  p_coupon_percent smallint default null,
  p_request_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_existing_raffle public.raffles;
  v_raffle_id uuid;
  v_eligible_count integer;
  v_random_bytes bytea;
  v_random_offset bigint;
  v_winner public.raffle_entries;
begin
  if p_coupon_percent is not null and p_coupon_percent not in (10, 15, 20) then
    raise exception using errcode = '22023', message = 'Invalid raffle filter';
  end if;

  if not exists (
    select 1
    from public.crm_members
    where user_id = p_executed_by
      and active is true
      and role in ('admin', 'agent')
  ) then
    raise exception using errcode = '42501', message = 'Raffle execution is not authorized';
  end if;

  select * into v_existing_raffle
  from public.raffles
  where request_id = p_request_id;

  if found then
    select entries.* into v_winner
    from public.raffle_winners winners
    join public.raffle_entries entries on entries.id = winners.entry_id
    where winners.raffle_id = v_existing_raffle.id
      and winners.position = 1;

    return jsonb_build_object(
      'raffle_id', v_existing_raffle.id,
      'eligible_count', v_existing_raffle.eligible_count,
      'winner', jsonb_build_object(
        'participant_id', v_winner.participant_id,
        'ticket_code', v_winner.ticket_code,
        'full_name', v_winner.full_name,
        'business_name', v_winner.business_name,
        'coupon_percent', v_winner.coupon_percent
      )
    );
  end if;

  with eligible as (
    select distinct on (
      lower(regexp_replace(btrim(participants.business_name), '\s+', ' ', 'g'))
    )
      participants.id,
      participants.full_name,
      participants.business_name,
      participants.coupon_percent,
      participants.created_at,
      lower(regexp_replace(btrim(participants.business_name), '\s+', ' ', 'g')) as business_key
    from public.participants
    where participants.campaign = 'sorteo_un_mes_publicidad'
      and participants.is_demo is false
      and participants.consent is true
      and btrim(participants.full_name) <> ''
      and btrim(participants.business_name) <> ''
      and btrim(participants.whatsapp) <> ''
      and btrim(participants.business_activity) <> ''
      and (p_coupon_percent is null or participants.coupon_percent = p_coupon_percent)
    order by
      lower(regexp_replace(btrim(participants.business_name), '\s+', ' ', 'g')),
      participants.created_at asc,
      participants.id asc
  )
  select count(*) into v_eligible_count from eligible;

  if v_eligible_count = 0 then
    raise exception using errcode = 'P0002', message = 'No eligible raffle participants';
  end if;

  insert into public.raffles (
    request_id, campaign, mode, status, filter_coupon_percent,
    eligible_count, winner_count, executed_by
  ) values (
    p_request_id, 'sorteo_un_mes_publicidad', 'real', 'running', p_coupon_percent,
    v_eligible_count, 1, p_executed_by
  )
  on conflict (request_id) do nothing
  returning id into v_raffle_id;

  if v_raffle_id is null then
    select * into v_existing_raffle from public.raffles where request_id = p_request_id;
    select entries.* into v_winner
    from public.raffle_winners winners
    join public.raffle_entries entries on entries.id = winners.entry_id
    where winners.raffle_id = v_existing_raffle.id and winners.position = 1;
    return jsonb_build_object(
      'raffle_id', v_existing_raffle.id,
      'eligible_count', v_existing_raffle.eligible_count,
      'winner', jsonb_build_object(
        'participant_id', v_winner.participant_id,
        'ticket_code', v_winner.ticket_code,
        'full_name', v_winner.full_name,
        'business_name', v_winner.business_name,
        'coupon_percent', v_winner.coupon_percent
      )
    );
  end if;

  insert into public.raffle_entries (
    raffle_id, participant_id, business_key, ticket_code, entry_number,
    full_name, business_name, coupon_percent, created_at
  )
  select
    v_raffle_id,
    eligible.id,
    eligible.business_key,
    'VL-' || lpad(row_number() over (order by eligible.created_at asc, eligible.id asc)::text, 4, '0'),
    row_number() over (order by eligible.created_at asc, eligible.id asc)::integer,
    eligible.full_name,
    eligible.business_name,
    eligible.coupon_percent,
    eligible.created_at
  from (
    select distinct on (
      lower(regexp_replace(btrim(participants.business_name), '\s+', ' ', 'g'))
    )
      participants.id,
      participants.full_name,
      participants.business_name,
      participants.coupon_percent,
      participants.created_at,
      lower(regexp_replace(btrim(participants.business_name), '\s+', ' ', 'g')) as business_key
    from public.participants
    where participants.campaign = 'sorteo_un_mes_publicidad'
      and participants.is_demo is false
      and participants.consent is true
      and btrim(participants.full_name) <> ''
      and btrim(participants.business_name) <> ''
      and btrim(participants.whatsapp) <> ''
      and btrim(participants.business_activity) <> ''
      and (p_coupon_percent is null or participants.coupon_percent = p_coupon_percent)
    order by
      lower(regexp_replace(btrim(participants.business_name), '\s+', ' ', 'g')),
      participants.created_at asc,
      participants.id asc
  ) as eligible;

  v_random_bytes := extensions.gen_random_bytes(4);
  v_random_offset := (
    get_byte(v_random_bytes, 0)::bigint * 16777216
    + get_byte(v_random_bytes, 1)::bigint * 65536
    + get_byte(v_random_bytes, 2)::bigint * 256
    + get_byte(v_random_bytes, 3)::bigint
  ) % v_eligible_count;

  select * into v_winner
  from public.raffle_entries
  where raffle_id = v_raffle_id
  order by entry_number
  offset v_random_offset
  limit 1;

  insert into public.raffle_winners (raffle_id, entry_id, position)
  values (v_raffle_id, v_winner.id, 1);

  update public.raffles
  set status = 'completed', completed_at = timezone('utc', now())
  where id = v_raffle_id;

  return jsonb_build_object(
    'raffle_id', v_raffle_id,
    'eligible_count', v_eligible_count,
    'winner', jsonb_build_object(
      'participant_id', v_winner.participant_id,
      'ticket_code', v_winner.ticket_code,
      'full_name', v_winner.full_name,
      'business_name', v_winner.business_name,
      'coupon_percent', v_winner.coupon_percent
    )
  );
end;
$function$;

revoke all on function public.execute_real_raffle(uuid, smallint, uuid) from public, anon, authenticated;
grant execute on function public.execute_real_raffle(uuid, smallint, uuid) to service_role;
