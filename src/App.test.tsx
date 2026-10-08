import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { supabase } from './lib/supabase'

vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
  loadUserLibrary: vi.fn(),
  loadUserSeriesTracker: vi.fn().mockResolvedValue({ seriesLibrary: [], episodeEntries: {} }),
  migrateLocalLibrary: vi.fn(),
  migrateLocalSeriesTracker: vi.fn(),
  addWatchlistItem: vi.fn(),
  addEpisodeEntry: vi.fn(),
  removeEpisodeEntry: vi.fn(),
  removeDiaryEntry: vi.fn(),
  removeWatchlistItem: vi.fn(),
  removeSeriesLibraryItem: vi.fn(),
  upsertDiaryEntry: vi.fn(),
  upsertSeriesLibraryItem: vi.fn(),
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
    expect(screen.queryByRole('button', { name: /jump to today/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^day$/i }))
    expect(screen.getByText('Today Film')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^year$/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('loads saved film notes and ratings in Day and preserves the selected day when dismissing overlays', async () => {
    render(<App />)
    await screen.findByRole('button', { name: 'SIGN IN' })
    fireEvent.click(screen.getByRole('button', { name: /^day$/i }))
    expect(screen.getByPlaceholderText(/after the credits/i)).toHaveValue('A note')
    expect(screen.getByRole('radio', { name: '4 out of 5' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    const date = screen.getByLabelText('Choose date') as HTMLInputElement
    const previousDate = date.value
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(date).toHaveValue(previousDate)
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.getByPlaceholderText(/after the credits/i)).toHaveValue('A note')
    fireEvent.change(screen.getByLabelText('Choose date'), { target: { value: '' } })
    expect(screen.getByLabelText('Choose date')).toHaveValue(todayKey())
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled()
    expect(within(screen.getByRole('navigation', { name: 'Days of the week' })).getAllByRole('button')).toHaveLength(7)
  })

  it('searches and saves a film directly from an empty Day', async () => {
    window.localStorage.removeItem('reelendar.entries.v1')
    vi.mocked(fetch).mockImplementation((input) => Promise.resolve({
      ok: true,
      json: async () => ({ results: String(input).includes('search%2Fmovie') ? [{ id: 77, title: 'Daily Film', poster_path: '/daily.jpg', vote_average: 8 }] : [] }),
    } as Response))
    render(<App />)
    await screen.findByRole('button', { name: 'SIGN IN' })
    fireEvent.click(screen.getByRole('button', { name: /^day$/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a film' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Movie title' }), { target: { value: 'Daily' } })
    fireEvent.click(await screen.findByRole('button', { name: /Daily Film/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/after the credits/i), { target: { value: 'A memorable day.' } })
    fireEvent.click(screen.getByRole('button', { name: 'SAVE ENTRY' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('reelendar.entries.v1')!)[todayKey()].comment).toBe('A memorable day.'))
  })

  it('groups daily episodes, saves inline notes, and undoes logging without losing earlier progress', async () => {
    const series = { id: 98, title: 'Severance', original_title: 'Severance', media_type: 'tv', poster_path: null, vote_average: 8, genres: [], episode_run_time: [45], number_of_seasons: 1, number_of_episodes: 9, seasons: [{ season_number: 1, episode_count: 9, name: 'Season 1' }] }
    localStorage.setItem('reelendar.series-library.v1', JSON.stringify([{ series, status: 'watching', current_season: 1, current_episode: 5 }]))
    localStorage.setItem('reelendar.episode-entries.v1', JSON.stringify({ [todayKey()]: [3, 4, 5].map((episode) => ({ series, season_number: 1, episode_number: episode, episode_name: `Episode ${episode}`, runtime: 45, note: '' })) }))
    render(<App />)
    await screen.findByRole('button', { name: 'SIGN IN' })
    fireEvent.click(screen.getByRole('button', { name: 'SERIES' }))
    fireEvent.click(screen.getByRole('button', { name: /^day$/i }))
    const journal = screen.getByRole('region', { name: 'Series day journal' })
    expect(within(journal).getAllByRole('article', { name: 'Severance' })).toHaveLength(1)
    fireEvent.click(within(journal).getByRole('button', { name: /S01 E03/ }))
    fireEvent.change(within(journal).getByRole('textbox'), { target: { value: 'A quiet revelation.' } })
    fireEvent.click(within(journal).getByRole('button', { name: /S01 E04/ }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('reelendar.episode-entries.v1')!)[todayKey()][0].note).toBe('A quiet revelation.'))
    fireEvent.click(within(journal).getByRole('button', { name: 'Watched S01 E06' }))
    fireEvent.click(await within(journal).findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(within(journal).getByRole('button', { name: 'Watched S01 E06' })).toBeEnabled())
    expect(JSON.parse(localStorage.getItem('reelendar.series-library.v1')!)[0].current_episode).toBe(5)
    expect(JSON.parse(localStorage.getItem('reelendar.episode-entries.v1')!)[todayKey()]).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    const selected = (screen.getByLabelText('Choose date') as HTMLInputElement).value
    fireEvent.pointerDown(within(journal).getByRole('button', { name: 'Watched S01 E06' }))
    expect(screen.getByLabelText('Choose date')).toHaveValue(selected)
  })

  it('opens the profile hub, changes its face, and switches language', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'token',
          refresh_token: 'refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'user-1', email: 'viewer@example.com', user_metadata: {} },
        },
      },
    } as never)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open profile' }))
    expect(screen.getByRole('dialog', { name: 'Your watch story' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.queryByText(/JSON/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sad' }))
    await waitFor(() => expect(supabase.auth.updateUser).toHaveBeenCalledWith({ data: { profile_face: 'sad', profile_color: '#aecbf3' } }))
    fireEvent.click(screen.getByRole('button', { name: 'TR' }))
    expect(screen.getByRole('heading', { name: 'İzleme hikâyen' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ÇIKIŞ YAP' }))
    expect(screen.getByRole('alertdialog', { name: 'Çıkış yapmak istiyor musun?' })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'VAZGEÇ' }))
    fireEvent.click(screen.getByRole('button', { name: 'HESABI SİL' }))
    expect(screen.getByRole('alertdialog', { name: 'Hesabın silinsin mi?' })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'VAZGEÇ' }))
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
    fireEvent.click(screen.getByRole('radio', { name: '4.5 out of 5' }))
    expect(screen.getByText('4.5/5')).toBeInTheDocument()
    expect(document.querySelectorAll<HTMLElement>('.rating-star-fill')[4]).toHaveStyle({ width: '50%' })

    fireEvent.click(screen.getByRole('button', { name: /save entry/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps TV shows in a separate series tracker and logs the next episode', async () => {
    const series = {
      id: 1396,
      name: 'Breaking Bad',
      original_name: 'Breaking Bad',
      poster_path: '/series.jpg',
      first_air_date: '2008-01-20',
      vote_average: 8.9,
    }
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation((input) => Promise.resolve({
      ok: true,
      json: vi.fn().mockResolvedValue(String(input).includes('tv%2F1396')
        ? { ...series, genres: [{ id: 18, name: 'Drama' }], episode_run_time: [48], number_of_seasons: 1, number_of_episodes: 7, seasons: [{ season_number: 1, episode_count: 7, name: 'Season 1' }], status: 'Ended' }
        : { results: String(input).includes('search%2Ftv') ? [series] : [] }),
    } as unknown as Response))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'SERIES' }))
    const seriesViews = screen.getByRole('navigation', { name: 'Series calendar view' })
    expect(within(seriesViews).getByRole('button', { name: 'month' })).toBeInTheDocument()
    expect(within(seriesViews).getByRole('button', { name: 'year' })).toBeInTheDocument()
    expect(within(seriesViews).getByRole('button', { name: 'day' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add series' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Series title' }), { target: { value: 'Breaking' } })

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('search%2Ftv'))).toBe(true), { timeout: 800 })
    fireEvent.click(await within(dialog).findByRole('button', { name: /Breaking Bad poster/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getAllByText('Breaking Bad').length).toBeGreaterThan(0)
    expect(screen.getByRole('option', { name: 'Dropped' })).toBeInTheDocument()
    const allSeriesGroup = screen.getByRole('button', { name: /All series/i })
    fireEvent.click(allSeriesGroup)
    expect(allSeriesGroup).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('option', { name: 'Dropped' })).not.toBeInTheDocument()
    fireEvent.click(allSeriesGroup)
    expect(allSeriesGroup).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Open details for Breaking Bad' }))
    const seriesDetail = screen.getByRole('dialog', { name: 'Breaking Bad' })
    expect(seriesDetail).toHaveFocus()
    expect(within(seriesDetail).queryByText(/AUTO-SAVE/i)).not.toBeInTheDocument()
    fireEvent.click(within(seriesDetail).getByRole('button', { name: /Upcoming/ }))
    expect(within(seriesDetail).getByText('A preview of your next episodes.')).toBeInTheDocument()
    const watchedOn = within(seriesDetail).getByLabelText('Watched on')
    fireEvent.change(watchedOn, { target: { value: '' } })
    expect(within(seriesDetail).getByRole('button', { name: /Mark as watched/ })).toBeDisabled()
    fireEvent.change(watchedOn, { target: { value: '2099-01-01' } })
    expect(within(seriesDetail).getByRole('button', { name: /Mark as watched/ })).toBeDisabled()
    fireEvent.change(watchedOn, { target: { value: todayKey() } })
    expect(within(seriesDetail).getByRole('button', { name: /Mark as watched/ })).toBeEnabled()
    const status = within(seriesDetail).getByRole('combobox', { name: 'STATUS' })
    fireEvent.change(status, { target: { value: 'dropped' } })
    expect(within(seriesDetail).getByText(/leave Continue Watching/i)).toBeInTheDocument()
    fireEvent.change(status, { target: { value: 'watching' } })
    fireEvent.change(within(seriesDetail).getByPlaceholderText(/series overall/i), { target: { value: 'A slow burn.' } })
    expect(within(seriesDetail).getByRole('status', { name: 'Saving' })).toBeInTheDocument()
    await waitFor(() => expect(within(seriesDetail).queryByRole('status', { name: 'Saving' })).not.toBeInTheDocument(), { timeout: 1500 })
    fireEvent.click(within(seriesDetail).getByRole('button', { name: 'Close series details' }))

    const days = screen.getAllByRole('button', { name: /0 episodes/i })
    fireEvent.click(days[0])
    expect(screen.getByRole('button', { name: 'Add new series' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'MARK WATCHED' }))
    expect(screen.getAllByText(/S1 E1/).length).toBeGreaterThan(0)
    expect(document.querySelector('.episode-calendar-event b')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close episode panel' }))
    screen.getByRole('button', { name: 'Open details for Breaking Bad' }).focus()
    fireEvent.click(screen.getByRole('button', { name: 'Open details for Breaking Bad' }))
    const updatedDetail = screen.getByRole('dialog', { name: 'Breaking Bad' })
    fireEvent.click(within(updatedDetail).getByRole('button', { name: '+ NOTE' }))
    const episodeNote = screen.getByPlaceholderText(/stayed with you from this episode/i)
    fireEvent.change(episodeNote, { target: { value: 'Great opening.' } })
    expect(within(screen.getByLabelText('Notes for Breaking Bad')).getByRole('status', { name: 'Saving' })).toBeInTheDocument()
    await waitFor(() => expect(within(screen.getByLabelText('Notes for Breaking Bad')).queryByRole('status', { name: 'Saving' })).not.toBeInTheDocument(), { timeout: 1500 })
    fireEvent.click(screen.getByRole('button', { name: 'Close series note' }))
    expect(within(updatedDetail).getByText('Great opening.')).toBeInTheDocument()
    fireEvent.click(within(updatedDetail).getByRole('button', { name: /Upcoming/ }))
    fireEvent.click(within(updatedDetail).getByRole('button', { name: /Mark as watched/ }))
    await waitFor(() => expect(within(updatedDetail).getByRole('button', { name: 'Watched 2' })).toHaveAttribute('aria-pressed', 'true'))
    expect(within(updatedDetail).getByRole('progressbar')).toHaveAttribute('value', '2')
    expect(within(updatedDetail).getByRole('heading', { name: 'S01 E03' })).toBeInTheDocument()
    fireEvent.click(within(updatedDetail).getByRole('button', { name: 'Close series details' }))
    expect(screen.getByRole('button', { name: 'Open details for Breaking Bad' })).toHaveFocus()
    fireEvent.click(screen.getAllByRole('button', { name: /1 episodes/i })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Remove Breaking Bad S1 E1' }))
    expect(screen.queryByRole('button', { name: 'Remove Breaking Bad S1 E1' })).not.toBeInTheDocument()
  })

  it('keeps several episodes readable on the same calendar day', async () => {
    const series = {
      id: 77,
      title: 'The Bear',
      original_title: 'The Bear',
      poster_path: '/bear.jpg',
      vote_average: 8.6,
      media_type: 'tv',
      genres: [],
      episode_run_time: [32],
      number_of_seasons: 3,
      number_of_episodes: 28,
      seasons: [{ season_number: 1, episode_count: 8, name: 'Season 1' }],
    }
    window.localStorage.setItem('reelendar.episode-entries.v1', JSON.stringify({
      [todayKey()]: Array.from({ length: 4 }, (_, index) => ({
        series,
        season_number: 1,
        episode_number: index + 1,
        episode_name: `Episode ${index + 1}`,
        runtime: 32,
      })),
    }))

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'SERIES' }))

    expect(screen.getByText('+1 MORE')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /4 episodes/i }))

    const episodePanel = screen.getByLabelText(/Episodes for/i)
    expect(within(episodePanel).getAllByText(/S1 E[1-4]/)).toHaveLength(4)

    fireEvent.pointerDown(document.body)
    expect(screen.queryByLabelText(/Episodes for/i)).not.toBeInTheDocument()
  })
})
