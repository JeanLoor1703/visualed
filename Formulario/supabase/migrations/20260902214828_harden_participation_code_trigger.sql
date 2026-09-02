-- Keep OLD out of the INSERT branch so assignment is safe on every PostgreSQL version.
create or replace function private.assign_participation_code()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.is_demo is true then
    new.participation_code := null;
  elsif tg_op = 'INSERT' then
    new.participation_code := 'VL-' || lpad(nextval('public.participant_code_seq')::text, 3, '0');
  elsif old.is_demo is true then
    new.participation_code := 'VL-' || lpad(nextval('public.participant_code_seq')::text, 3, '0');
  else
    new.participation_code := old.participation_code;
  end if;

  return new;
end;
$function$;

revoke all on function private.assign_participation_code() from public, anon, authenticated;
