import type { DiaryEntry, Movie } from './supabase'

export type LibraryExport = {
  format: 'reelendar-library'
  version: 1
  exportedAt: string
  accountEmail: string | null
  diary: Array<{ watchedDate: string; entry: DiaryEntry }>
  watchlist: Movie[]
}

export function buildLibraryExport(
  entries: Record<string, DiaryEntry>,
  watchlist: Movie[],
  accountEmail: string | null,
  exportedAt = new Date().toISOString(),
): LibraryExport {
  return {
    format: 'reelendar-library',
    version: 1,
    exportedAt,
    accountEmail,
    diary: Object.entries(entries)
      .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
      .map(([watchedDate, entry]) => ({ watchedDate, entry })),
    watchlist: [...watchlist],
  }
}

export function downloadLibraryExport(library: LibraryExport) {
  const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `reelendar-export-${library.exportedAt.slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
