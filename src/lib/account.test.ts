import { describe, expect, it } from 'vitest'
import { buildLibraryExport } from './account'
import type { DiaryEntry, Movie } from './supabase'

const movie: Movie = {
  id: 42,
  title: 'Example Film',
  original_title: 'Example Film',
  poster_path: '/poster.jpg',
  release_date: '2026-09-10',
  vote_average: 8.2,
}

describe('buildLibraryExport', () => {
  it('creates a portable, date-ordered library document without mutating the watchlist', () => {
    const entry: DiaryEntry = { movie, comment: 'Stayed with me.', rating: 4.5 }
    const watchlist = [movie]
    const result = buildLibraryExport(
      { '2026-09-20': entry, '2026-09-10': entry },
      watchlist,
      'viewer@example.com',
      '2026-09-27T10:00:00.000Z',
    )

    expect(result.format).toBe('reelendar-library')
    expect(result.diary.map((item) => item.watchedDate)).toEqual(['2026-09-10', '2026-09-20'])
    expect(result.accountEmail).toBe('viewer@example.com')
    expect(result.watchlist).toEqual(watchlist)
    expect(result.watchlist).not.toBe(watchlist)
  })
})
