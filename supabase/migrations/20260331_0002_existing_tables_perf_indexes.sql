-- Performance/index migration for existing tables used by the app.
-- Non-destructive: indexes only, no uniqueness changes.

create index if not exists idx_workouts_user_date
  on public.workouts(user_id, workout_date desc);

create index if not exists idx_workouts_user_source_date
  on public.workouts(user_id, source, workout_date desc);

create index if not exists idx_workouts_user_garmin_activity
  on public.workouts(user_id, garmin_activity_id)
  where garmin_activity_id is not null;

create index if not exists idx_chat_messages_user_created
  on public.chat_messages(user_id, created_at desc);

create index if not exists idx_chat_messages_user_workout_created
  on public.chat_messages(user_id, workout_id, created_at desc);
