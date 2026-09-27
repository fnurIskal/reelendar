import { createClient } from '@supabase/supabase-js'

export type Movie = {
  id: number
  title: string
  original_title: string
  poster_path: string | null
  release_date?: string
  vote_average: number
}

export type DiaryEntry = { movie: Movie; comment: string; rating: number }

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
}

type WatchlistRow = {
  tmdb_movie_id: number
  movie_title: string
  original_title: string | null
  poster_path: string | null
  release_date: string | null
  vote_average: number | null
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

function movieFromRow(row: DiaryRow | WatchlistRow): Movie {
  return {
    id: row.tmdb_movie_id,
    title: row.movie_title,
    original_title: row.original_title ?? row.movie_title,
    poster_path: row.poster_path,
    release_date: row.release_date ?? undefined,
    vote_average: Number(row.vote_average ?? 0),
  }
}

function movieColumns(movie: Movie) {
  return {
    tmdb_movie_id: movie.id,
    movie_title: movie.title,
    original_title: movie.original_title,
    poster_path: movie.poster_path,
    release_date: movie.release_date || null,
    vote_average: movie.vote_average,
  }
}

export async function loadUserLibrary(userId: string) {
  const [diaryResult, watchlistResult] = await Promise.all([
    supabase
      .from('diary_entries')
      .select('watched_date, tmdb_movie_id, movie_title, original_title, poster_path, release_date, vote_average, rating, comment')
      .eq('user_id', userId),
    supabase
      .from('watchlist_items')
      .select('tmdb_movie_id, movie_title, original_title, poster_path, release_date, vote_average')
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

export async function addWatchlistItem(userId: string, movie: Movie) {
  const { error } = await supabase.from('watchlist_items').upsert({
    user_id: userId,
    ...movieColumns(movie),
  }, { onConflict: 'user_id,tmdb_movie_id' })
  if (error) throw error
}

export async function removeWatchlistItem(userId: string, movieId: number) {
  const { error } = await supabase
    .from('watchlist_items')
    .delete()
    .eq('user_id', userId)
    .eq('tmdb_movie_id', movieId)
  if (error) throw error
}

export async function migrateLocalLibrary(
  userId: string,
  entries: Record<string, DiaryEntry>,
  watchlist: Movie[],
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
    const { error } = await supabase.from('watchlist_items').upsert(watchlistRows, { onConflict: 'user_id,tmdb_movie_id' })
    if (error) throw error
  }
}
