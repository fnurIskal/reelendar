create table if not exists public.series_library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_series_id integer not null check (tmdb_series_id > 0),
  series_title text not null check (char_length(series_title) between 1 and 300),
  original_title text,
  poster_path text,
  first_air_date date,
  vote_average numeric(3,1) check (vote_average is null or vote_average between 0 and 10),
  tracking_status text not null default 'watching' check (tracking_status in ('watching', 'waiting', 'completed', 'dropped')),
  current_season integer not null default 1 check (current_season >= 0),
  current_episode integer not null default 0 check (current_episode >= 0),
  series_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, tmdb_series_id)
);

create table if not exists public.episode_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  watched_date date not null,
  tmdb_series_id integer not null check (tmdb_series_id > 0),
  series_title text not null check (char_length(series_title) between 1 and 300),
  season_number integer not null check (season_number >= 0),
  episode_number integer not null check (episode_number > 0),
  episode_name text not null default '',
  runtime integer check (runtime is null or runtime > 0),
  series_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, watched_date, tmdb_series_id, season_number, episode_number)
);

create index if not exists series_library_user_status_idx on public.series_library_items (user_id, tracking_status, updated_at desc);
create index if not exists episode_entries_user_date_idx on public.episode_entries (user_id, watched_date desc);

drop trigger if exists series_library_set_updated_at on public.series_library_items;
create trigger series_library_set_updated_at before update on public.series_library_items
for each row execute function public.set_updated_at();

alter table public.series_library_items enable row level security;
alter table public.episode_entries enable row level security;
revoke all on public.series_library_items from anon;
revoke all on public.episode_entries from anon;
grant select, insert, update, delete on public.series_library_items to authenticated;
grant select, insert, update, delete on public.episode_entries to authenticated;

create policy "Users manage own series" on public.series_library_items for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own episode entries" on public.episode_entries for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
