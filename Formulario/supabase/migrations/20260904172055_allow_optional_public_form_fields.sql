-- Keep only the contact essentials mandatory on the public form.
alter table public.participants
  alter column business_name drop not null,
  alter column plan_interest drop not null,
  alter column coupon_percent drop not null;

alter table public.raffle_entries
  alter column coupon_percent drop not null;

create or replace function public.register_participant(
  p_full_name text,
  p_business_name text,
  p_whatsapp text,
  p_business_activity text,
  p_plan_interest text,
  p_source text,
  p_coupon_percent smallint,
  p_consent boolean,
  p_campaign text default 'sorteo_un_mes_publicidad'
)
returns table (participation_code text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if p_full_name is null
    or p_whatsapp is null
    or p_business_activity is null
    or char_length(btrim(p_full_name)) not between 3 and 120
    or p_whatsapp !~ '^09[0-9]{8}$'
    or char_length(btrim(p_business_activity)) not between 4 and 240
    or (
      nullif(btrim(p_business_name), '') is not null
      and char_length(btrim(p_business_name)) not between 2 and 160
    )
    or (
      nullif(btrim(p_plan_interest), '') is not null
      and p_plan_interest not in ('contactar', 'informacion', 'solo_sorteo')
    )
    or (
      nullif(btrim(p_source), '') is not null
      and p_source not in ('expoferia', 'ya_conocia', 'redes_sociales', 'recomendacion', 'otro')
    )
    or (p_coupon_percent is not null and p_coupon_percent not in (10, 15, 20))
    or p_consent is distinct from true
    or p_campaign is distinct from 'sorteo_un_mes_publicidad'
  then
    raise exception using errcode = '22023', message = 'Invalid participant data';
  end if;

  return query
  insert into public.participants (
    full_name,
    business_name,
    whatsapp,
    business_activity,
    plan_interest,
    source,
    coupon_percent,
    consent,
    campaign
  ) values (
    btrim(p_full_name),
    nullif(btrim(p_business_name), ''),
    p_whatsapp,
    btrim(p_business_activity),
    nullif(btrim(p_plan_interest), ''),
    nullif(btrim(p_source), ''),
    p_coupon_percent,
    p_consent,
    p_campaign
  )
  returning participants.participation_code;
end;
$function$;

revoke all on function public.register_participant(text, text, text, text, text, text, smallint, boolean, text)
  from public, anon, authenticated;
grant execute on function public.register_participant(text, text, text, text, text, text, smallint, boolean, text)
  to anon;

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

  with candidates as (
    select
      participants.id,
      participants.full_name,
      coalesce(nullif(btrim(participants.business_name), ''), 'Sin negocio registrado') as business_name,
      participants.coupon_percent,
      participants.participation_code,
      participants.created_at,
      coalesce(
        nullif(lower(regexp_replace(btrim(participants.business_name), '\s+', ' ', 'g')), ''),
        'participant:' || participants.id::text
      ) as business_key
    from public.participants
    where participants.campaign = 'sorteo_un_mes_publicidad'
      and participants.is_demo is false
      and participants.consent is true
      and btrim(participants.full_name) <> ''
      and btrim(participants.whatsapp) <> ''
      and btrim(participants.business_activity) <> ''
      and participants.participation_code is not null
      and (p_coupon_percent is null or participants.coupon_percent = p_coupon_percent)
  ),
  eligible as (
    select distinct on (business_key)
      id, full_name, business_name, coupon_percent,
      participation_code, created_at, business_key
    from candidates
    order by business_key, created_at asc, id asc
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

  with candidates as (
    select
      participants.id,
      participants.full_name,
      coalesce(nullif(btrim(participants.business_name), ''), 'Sin negocio registrado') as business_name,
      participants.coupon_percent,
      participants.participation_code,
      participants.created_at,
      coalesce(
        nullif(lower(regexp_replace(btrim(participants.business_name), '\s+', ' ', 'g')), ''),
        'participant:' || participants.id::text
      ) as business_key
    from public.participants
    where participants.campaign = 'sorteo_un_mes_publicidad'
      and participants.is_demo is false
      and participants.consent is true
      and btrim(participants.full_name) <> ''
      and btrim(participants.whatsapp) <> ''
      and btrim(participants.business_activity) <> ''
      and participants.participation_code is not null
      and (p_coupon_percent is null or participants.coupon_percent = p_coupon_percent)
  ),
  eligible as (
    select distinct on (business_key)
      id, full_name, business_name, coupon_percent,
      participation_code, created_at, business_key
    from candidates
    order by business_key, created_at asc, id asc
  )
  insert into public.raffle_entries (
    raffle_id, participant_id, business_key, ticket_code, entry_number,
    full_name, business_name, coupon_percent, created_at
  )
  select
    v_raffle_id,
    eligible.id,
    eligible.business_key,
    eligible.participation_code,
    row_number() over (order by eligible.created_at asc, eligible.id asc)::integer,
    eligible.full_name,
    eligible.business_name,
    eligible.coupon_percent,
    eligible.created_at
  from eligible;

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

revoke all on function public.execute_real_raffle(uuid, smallint, uuid)
  from public, anon, authenticated;
grant execute on function public.execute_real_raffle(uuid, smallint, uuid)
  to service_role;
