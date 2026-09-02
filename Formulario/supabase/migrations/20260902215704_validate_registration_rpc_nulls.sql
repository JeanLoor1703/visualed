-- Reject incomplete RPC calls before inserting, so invalid requests never consume a code.
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
    or p_business_name is null
    or p_whatsapp is null
    or p_business_activity is null
    or p_plan_interest is null
    or p_coupon_percent is null
    or char_length(btrim(p_full_name)) not between 3 and 120
    or char_length(btrim(p_business_name)) not between 2 and 160
    or p_whatsapp !~ '^09[0-9]{8}$'
    or char_length(btrim(p_business_activity)) not between 4 and 240
    or p_plan_interest not in ('contactar', 'informacion', 'solo_sorteo')
    or (p_source is not null and p_source not in ('expoferia', 'ya_conocia', 'redes_sociales', 'recomendacion', 'otro'))
    or p_coupon_percent not in (10, 15, 20)
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
    btrim(p_business_name),
    p_whatsapp,
    btrim(p_business_activity),
    p_plan_interest,
    p_source,
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
