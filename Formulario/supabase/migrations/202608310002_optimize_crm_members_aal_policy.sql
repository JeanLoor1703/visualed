-- Retired by the passwordless email-code flow: email OTP is the only factor.

drop policy if exists "crm_members_require_aal2" on public.crm_members;
