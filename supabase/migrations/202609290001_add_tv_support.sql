alter table public.diary_entries
  add column if not exists media_type text not null default 'movie'
  check (media_type in ('movie', 'tv'));

alter table public.watchlist_items
  add column if not exists media_type text not null default 'movie'
  check (media_type in ('movie', 'tv'));

-- A movie and a TV show can have the same numeric TMDB id.
alter table public.watchlist_items
  drop constraint if exists watchlist_items_user_id_tmdb_movie_id_key;

alter table public.watchlist_items
  drop constraint if exists watchlist_items_user_media_type_tmdb_movie_id_key;

alter table public.watchlist_items
  add constraint watchlist_items_user_media_type_tmdb_movie_id_key
  unique (user_id, media_type, tmdb_movie_id);
