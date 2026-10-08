import { createClient } from '@supabase/supabase-js'

export type MediaType = 'movie' | 'tv'

export type MediaItem = {
  id: number
  title: string
  original_title: string
  poster_path: string | null
  release_date?: string
  vote_average: number
  media_type?: MediaType
}

/** Kept as an alias so older imports and exported libraries remain compatible. */
export type Movie = MediaItem

export type DiaryEntry = { movie: MediaItem; comment: string; rating: number }

export type SeriesStatus = 'watching' | 'waiting' | 'completed' | 'dropped'

export type SeriesSeason = {
  season_number: number
  episode_count: number
  name: string
}

export type TvSeries = MediaItem & {
  media_type: 'tv'
  genres: Array<{ id: number; name: string }>
  episode_run_time: number[]
  number_of_seasons: number
  number_of_episodes: number
  seasons: SeriesSeason[]
  tmdb_status?: string
}

export type SeriesLibraryItem = {
  series: TvSeries
  status: SeriesStatus
  current_season: number
  current_episode: number
  note?: string
}

export type EpisodeEntry = {
  series: TvSeries
  season_number: number
  episode_number: number
  episode_name: string
  runtime: number | null
  note?: string
}

type DiaryRow = {
  watched_date: string
  tmdb_movie_id: number
  movie_title: string
  original_title: string | null
  poster_path: string | null
  release_date: string | null
  vote_average: number | null
  rating: number | null
  comment: string
  media_type: MediaType | null
}

type WatchlistRow = {
  tmdb_movie_id: number
  movie_title: string
  original_title: string | null
  poster_path: string | null
  release_date: string | null
  vote_average: number | null
  media_type: MediaType | null
}

type SeriesRow = {
  tmdb_series_id: number
  series_title: string
  original_title: string | null
  poster_path: string | null
  first_air_date: string | null
  vote_average: number | null
  tracking_status: SeriesStatus
  current_season: number
  current_episode: number
  series_data: TvSeries | null
  note: string | null
}

type EpisodeRow = {
  watched_date: string
  season_number: number
  episode_number: number
  episode_name: string
  runtime: number | null
  series_data: TvSeries
  note: string | null
}

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL
const supabasePublishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Supabase environment variables are missing.')
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

function movieFromRow(row: DiaryRow | WatchlistRow): MediaItem {
  return {
    id: row.tmdb_movie_id,
    title: row.movie_title,
    original_title: row.original_title ?? row.movie_title,
    poster_path: row.poster_path,
    release_date: row.release_date ?? undefined,
    vote_average: Number(row.vote_average ?? 0),
    media_type: row.media_type ?? 'movie',
  }
}

function movieColumns(movie: MediaItem) {
  return {
    tmdb_movie_id: movie.id,
    movie_title: movie.title,
    original_title: movie.original_title,
    poster_path: movie.poster_path,
    release_date: movie.release_date || null,
    vote_average: movie.vote_average,
    media_type: movie.media_type ?? 'movie',
  }
}

export async function loadUserLibrary(userId: string) {
  const [diaryResult, watchlistResult] = await Promise.all([
    supabase
      .from('diary_entries')
      .select('watched_date, tmdb_movie_id, movie_title, original_title, poster_path, release_date, vote_average, rating, comment, media_type')
      .eq('user_id', userId),
    supabase
      .from('watchlist_items')
      .select('tmdb_movie_id, movie_title, original_title, poster_path, release_date, vote_average, media_type')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ])

  if (diaryResult.error) throw diaryResult.error
  if (watchlistResult.error) throw watchlistResult.error

  const entries = Object.fromEntries((diaryResult.data as DiaryRow[]).map((row) => [
    row.watched_date,
    { movie: movieFromRow(row), comment: row.comment, rating: Number(row.rating ?? 0) },
  ]))

  return {
    entries: entries as Record<string, DiaryEntry>,
    watchlist: (watchlistResult.data as WatchlistRow[]).map(movieFromRow),
  }
}

export async function upsertDiaryEntry(userId: string, watchedDate: string, entry: DiaryEntry) {
  const { error } = await supabase.from('diary_entries').upsert({
    user_id: userId,
    watched_date: watchedDate,
    ...movieColumns(entry.movie),
    rating: entry.rating || null,
    comment: entry.comment,
  }, { onConflict: 'user_id,watched_date' })
  if (error) throw error
}

export async function removeDiaryEntry(userId: string, watchedDate: string) {
  const { error } = await supabase
    .from('diary_entries')
    .delete()
    .eq('user_id', userId)
    .eq('watched_date', watchedDate)
  if (error) throw error
}

export async function addWatchlistItem(userId: string, movie: MediaItem) {
  const { error } = await supabase.from('watchlist_items').upsert({
    user_id: userId,
    ...movieColumns(movie),
  }, { onConflict: 'user_id,media_type,tmdb_movie_id' })
  if (error) throw error
}

export async function removeWatchlistItem(userId: string, movieId: number, mediaType: MediaType) {
  const { error } = await supabase
    .from('watchlist_items')
    .delete()
    .eq('user_id', userId)
    .eq('tmdb_movie_id', movieId)
    .eq('media_type', mediaType)
  if (error) throw error
}

export async function migrateLocalLibrary(
  userId: string,
  entries: Record<string, DiaryEntry>,
  watchlist: MediaItem[],
) {
  const diaryRows = Object.entries(entries).map(([watchedDate, entry]) => ({
    user_id: userId,
    watched_date: watchedDate,
    ...movieColumns(entry.movie),
    rating: entry.rating || null,
    comment: entry.comment,
  }))
  const watchlistRows = watchlist.map((movie) => ({ user_id: userId, ...movieColumns(movie) }))

  if (diaryRows.length) {
    const { error } = await supabase.from('diary_entries').upsert(diaryRows, { onConflict: 'user_id,watched_date' })
    if (error) throw error
  }
  if (watchlistRows.length) {
    const { error } = await supabase.from('watchlist_items').upsert(watchlistRows, { onConflict: 'user_id,media_type,tmdb_movie_id' })
    if (error) throw error
  }
}

export async function loadUserSeriesTracker(userId: string) {
  const [seriesResult, episodeResult] = await Promise.all([
    supabase.from('series_library_items')
      .select('tmdb_series_id, series_title, original_title, poster_path, first_air_date, vote_average, tracking_status, current_season, current_episode, series_data, note')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }),
    supabase.from('episode_entries')
      .select('watched_date, season_number, episode_number, episode_name, runtime, series_data, note')
      .eq('user_id', userId)
      .order('watched_date', { ascending: false }),
  ])
  if (seriesResult.error) throw seriesResult.error
  if (episodeResult.error) throw episodeResult.error

  const seriesLibrary = (seriesResult.data as SeriesRow[]).map((row) => ({
    series: row.series_data ?? {
      id: row.tmdb_series_id, title: row.series_title, original_title: row.original_title ?? row.series_title,
      poster_path: row.poster_path, release_date: row.first_air_date ?? undefined, vote_average: Number(row.vote_average ?? 0),
      media_type: 'tv' as const, genres: [], episode_run_time: [], number_of_seasons: 0, number_of_episodes: 0, seasons: [],
    },
    status: row.tracking_status,
    current_season: row.current_season,
    current_episode: row.current_episode,
    note: row.note ?? '',
  }))
  const episodeEntries: Record<string, EpisodeEntry[]> = {}
  for (const row of episodeResult.data as EpisodeRow[]) {
    const entry = { series: row.series_data, season_number: row.season_number, episode_number: row.episode_number, episode_name: row.episode_name, runtime: row.runtime, note: row.note ?? '' }
    episodeEntries[row.watched_date] = [...(episodeEntries[row.watched_date] ?? []), entry]
  }
  return { seriesLibrary, episodeEntries }
}

export async function upsertSeriesLibraryItem(userId: string, item: SeriesLibraryItem) {
  const { series } = item
  const { error } = await supabase.from('series_library_items').upsert({
    user_id: userId, tmdb_series_id: series.id, series_title: series.title, original_title: series.original_title,
    poster_path: series.poster_path, first_air_date: series.release_date || null, vote_average: series.vote_average,
    tracking_status: item.status, current_season: item.current_season, current_episode: item.current_episode, series_data: series, note: item.note ?? '',
  }, { onConflict: 'user_id,tmdb_series_id' })
  if (error) throw error
}

export async function removeSeriesLibraryItem(userId: string, seriesId: number) {
  const { error } = await supabase.from('series_library_items').delete().eq('user_id', userId).eq('tmdb_series_id', seriesId)
  if (error) throw error
}

export async function addEpisodeEntry(userId: string, watchedDate: string, entry: EpisodeEntry) {
  const { error } = await supabase.from('episode_entries').upsert({
    user_id: userId, watched_date: watchedDate, tmdb_series_id: entry.series.id, series_title: entry.series.title,
    season_number: entry.season_number, episode_number: entry.episode_number, episode_name: entry.episode_name,
    runtime: entry.runtime, series_data: entry.series, note: entry.note ?? '',
  }, { onConflict: 'user_id,watched_date,tmdb_series_id,season_number,episode_number' })
  if (error) throw error
}

export async function removeEpisodeEntry(userId: string, watchedDate: string, entry: EpisodeEntry) {
  const { error } = await supabase
    .from('episode_entries')
    .delete()
    .eq('user_id', userId)
    .eq('watched_date', watchedDate)
    .eq('tmdb_series_id', entry.series.id)
    .eq('season_number', entry.season_number)
    .eq('episode_number', entry.episode_number)
  if (error) throw error
}

export async function migrateLocalSeriesTracker(
  userId: string,
  seriesLibrary: SeriesLibraryItem[],
  episodeEntries: Record<string, EpisodeEntry[]>,
) {
  await Promise.all([
    ...seriesLibrary.map((item) => upsertSeriesLibraryItem(userId, item)),
    ...Object.entries(episodeEntries).flatMap(([watchedDate, entries]) => (
      entries.map((entry) => addEpisodeEntry(userId, watchedDate, entry))
    )),
  ])
}
