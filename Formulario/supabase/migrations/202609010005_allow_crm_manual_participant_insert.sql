-- Allow authorized CRM operators to add a participant through the same campaign fields.
-- Defaults keep status as nuevo and is_demo as false; no browser client can set either field.

grant insert (full_name, business_name, whatsapp, business_activity, plan_interest, source, coupon_percent, consent, campaign)
  on public.participants to authenticated;

create policy participants_crm_member_insert
on public.participants
for insert
to authenticated
with check (
  consent is true
  and is_demo is false
  and status = 'nuevo'
  and campaign = 'sorteo_un_mes_publicidad'
  and exists (
    select 1
    from public.crm_members
    where crm_members.user_id = (select auth.uid())
      and crm_members.active is true
      and crm_members.role in ('admin', 'agent')
  )
);
