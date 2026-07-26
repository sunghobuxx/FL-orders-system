alter table public.dispatch_job_items
  add column if not exists is_excluded boolean not null default false;

notify pgrst, 'reload schema';
