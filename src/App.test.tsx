import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
  },
  loadUserLibrary: vi.fn(),
  migrateLocalLibrary: vi.fn(),
  addWatchlistItem: vi.fn(),
  removeDiaryEntry: vi.fn(),
  removeWatchlistItem: vi.fn(),
  upsertDiaryEntry: vi.fn(),
}))

function todayKey() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

describe('App view switching', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('reelendar.entries.v1', JSON.stringify({
      [todayKey()]: {
        movie: { id: 1, title: 'Today Film', original_title: 'Today Film', poster_path: '/poster.jpg', vote_average: 8 },
        comment: 'A note',
        rating: 4,
      },
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ results: [] }),
    }))
  })

  it('does not open the film modal when moving from the daily view to the yearly view', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: /^day$/i })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /^day$/i }))
    expect(screen.getByText('Today Film')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^year$/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
