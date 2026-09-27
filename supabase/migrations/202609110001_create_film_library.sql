create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  watched_date date not null,
  tmdb_movie_id integer not null check (tmdb_movie_id > 0),
  movie_title text not null check (char_length(movie_title) between 1 and 300),
  original_title text check (original_title is null or char_length(original_title) <= 300),
  poster_path text,
  release_date date,
  vote_average numeric(3,1) check (vote_average is null or vote_average between 0 and 10),
  rating numeric(2,1) check (rating is null or (rating between 0.5 and 5.0 and rating * 2 = trunc(rating * 2))),
  comment text not null default '' check (char_length(comment) <= 2000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, watched_date)
);

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_movie_id integer not null check (tmdb_movie_id > 0),
  movie_title text not null check (char_length(movie_title) between 1 and 300),
  original_title text check (original_title is null or char_length(original_title) <= 300),
  poster_path text,
  release_date date,
  vote_average numeric(3,1) check (vote_average is null or vote_average between 0 and 10),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, tmdb_movie_id)
);

create index if not exists diary_entries_user_date_idx on public.diary_entries (user_id, watched_date desc);
create index if not exists watchlist_items_user_created_idx on public.watchlist_items (user_id, created_at desc);

drop trigger if exists diary_entries_set_updated_at on public.diary_entries;
create trigger diary_entries_set_updated_at before update on public.diary_entries
for each row execute function public.set_updated_at();

alter table public.diary_entries enable row level security;
alter table public.watchlist_items enable row level security;
revoke all on public.diary_entries from anon;
revoke all on public.watchlist_items from anon;
grant select, insert, update, delete on public.diary_entries to authenticated;
grant select, insert, update, delete on public.watchlist_items to authenticated;

drop policy if exists "Users can read own diary entries" on public.diary_entries;
create policy "Users can read own diary entries" on public.diary_entries for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own diary entries" on public.diary_entries;
create policy "Users can insert own diary entries" on public.diary_entries for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own diary entries" on public.diary_entries;
create policy "Users can update own diary entries" on public.diary_entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own diary entries" on public.diary_entries;
create policy "Users can delete own diary entries" on public.diary_entries for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own watchlist" on public.watchlist_items;
create policy "Users can read own watchlist" on public.watchlist_items for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own watchlist" on public.watchlist_items;
create policy "Users can insert own watchlist" on public.watchlist_items for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own watchlist" on public.watchlist_items;
create policy "Users can update own watchlist" on public.watchlist_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own watchlist" on public.watchlist_items;
create policy "Users can delete own watchlist" on public.watchlist_items for delete to authenticated using ((select auth.uid()) = user_id);
