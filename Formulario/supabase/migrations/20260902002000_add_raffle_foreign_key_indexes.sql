create index if not exists raffle_entries_participant_id_idx
  on public.raffle_entries (participant_id);

create index if not exists raffle_winners_entry_id_idx
  on public.raffle_winners (entry_id);

create index if not exists raffles_executed_by_idx
  on public.raffles (executed_by);
