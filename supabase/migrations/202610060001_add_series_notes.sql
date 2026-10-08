alter table public.series_library_items
  add column if not exists note text not null default '';

alter table public.episode_entries
  add column if not exists note text not null default '';
