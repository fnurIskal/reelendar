import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not open the film modal when moving from the daily view to the yearly view', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: /^day$/i })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /^day$/i }))
    expect(screen.getByText('Today Film')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^year$/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('debounces movie search, replaces it with a back action after selection, and closes after save', async () => {
    const movie = {
      id: 42,
      title: 'Debounced Film',
      original_title: 'Debounced Film',
      poster_path: '/debounced.jpg',
      release_date: '2026-05-04',
      vote_average: 7.8,
    }
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation((input) => Promise.resolve({
      ok: true,
      json: vi.fn().mockResolvedValue({ results: String(input).includes('search%2Fmovie') ? [movie] : [] }),
    } as unknown as Response))

    render(<App />)
    const emptyDay = await screen.findAllByRole('button', { name: /, add a film$/i })
    fireEvent.click(emptyDay[0])

    fireEvent.change(screen.getByRole('textbox', { name: 'Movie title' }), { target: { value: 'Debounced' } })
    const searchCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('search%2Fmovie')).length

    await new Promise((resolve) => window.setTimeout(resolve, 250))
    expect(searchCalls()).toBe(0)
    await waitFor(() => expect(searchCalls()).toBe(1), { timeout: 800 })

    fireEvent.click(await screen.findByRole('button', { name: /Debounced Film poster/i }))
    expect(screen.queryByRole('textbox', { name: 'Movie title' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back to search/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /save entry/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
