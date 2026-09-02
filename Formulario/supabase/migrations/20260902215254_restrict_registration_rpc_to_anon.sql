-- Only the public form needs this endpoint; CRM members use their existing table insert permission.
revoke execute on function public.register_participant(text, text, text, text, text, text, smallint, boolean, text)
  from authenticated;
