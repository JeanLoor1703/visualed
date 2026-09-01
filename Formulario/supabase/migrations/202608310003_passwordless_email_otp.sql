-- The CRM now authenticates with a one-time email code.
-- Keep the active, own-membership policy as the only browser read path.

drop policy if exists "crm_members_require_aal2" on public.crm_members;
