import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ToastNotice } from './components/ToastNotice'
import { buildLibraryExport, downloadLibraryExport } from './lib/account'
import {
  addWatchlistItem,
  loadUserLibrary,
  migrateLocalLibrary,
  removeDiaryEntry,
  removeWatchlistItem,
  supabase,
  upsertDiaryEntry,
  type DiaryEntry,
  type Movie,
} from './lib/supabase'

type ViewMode = 'month' | 'year' | 'day'
type CalendarCell = { date: Date; key: string; isCurrentMonth: boolean }

const API_URL = '/api/tmdb'
const IMAGE_URL = 'https://image.tmdb.org/t/p/w500'
const ENTRIES_STORAGE_KEY = 'reelendar.entries.v1'
const WATCHLIST_STORAGE_KEY = 'reelendar.watchlist.v1'
const WATCHLIST_PAGE_SIZE = 5
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long' })
const fullDateFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function monthKey(date: Date) {
  return dateKey(date).slice(0, 7)
}

function tmdbUrl(endpoint: string, params: URLSearchParams) {
  const requestParams = new URLSearchParams(params)
  requestParams.set('endpoint', endpoint)
  return `${API_URL}?${requestParams}`
}

function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const storedValue = window.localStorage.getItem(key)
    return storedValue ? JSON.parse(storedValue) as T : fallback
  } catch {
    return fallback
  }
}

function getCalendarCells(viewDate: Date): CalendarCell[] {
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
  const mondayOffset = (firstDay.getDay() + 6) % 7
  const gridStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1 - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return { date, key: dateKey(date), isCurrentMonth: date.getMonth() === viewDate.getMonth() }
  })
}

function ArrowIcon({ direction }: { direction: 'left' | 'right' }) {
  return <span aria-hidden="true">{direction === 'left' ? '←' : '→'}</span>
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
}

function getProfileName(session: Session) {
  return String(
    session.user.user_metadata.display_name
    ?? session.user.user_metadata.full_name
    ?? session.user.email?.split('@')[0]
    ?? 'Profile',
  )
}

function ProfileAvatar({ session }: { session: Session }) {
  const name = getProfileName(session)
  const avatarUrl = String(session.user.user_metadata.avatar_url ?? session.user.user_metadata.picture ?? '')
  return <span className="profile-avatar" aria-hidden="true">
    {avatarUrl ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : name.charAt(0).toUpperCase()}
  </span>
}

export default function App() {
  const today = useMemo(() => new Date(), [])
  const todayKey = dateKey(today)
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [noteDate, setNoteDate] = useState<Date | null>(null)
  const [noteClosing, setNoteClosing] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Date | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [entries, setEntries] = useState<Record<string, DiaryEntry>>(() => readLocalStorage(ENTRIES_STORAGE_KEY, {}))
  const [watchlist, setWatchlist] = useState<Movie[]>(() => readLocalStorage(WATCHLIST_STORAGE_KEY, []))
  const [watchlistPage, setWatchlistPage] = useState(0)
  const [watchlistPickerOpen, setWatchlistPickerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [releases, setReleases] = useState<Movie[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Movie[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [ratingDraft, setRatingDraft] = useState(0)
  const [isSaved, setIsSaved] = useState(false)
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [cloudLoading, setCloudLoading] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [toastMessage, setToastMessage] = useState(() => window.sessionStorage.getItem('reelendar.auth-toast') ?? '')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const cells = useMemo(() => getCalendarCells(viewDate), [viewDate])
  const selectedKey = selectedDate ? dateKey(selectedDate) : null
  const selectedEntry = selectedKey ? entries[selectedKey] : undefined
  const noteEntry = noteDate ? entries[dateKey(noteDate)] : undefined
  const isCurrentMonth = monthKey(viewDate) === monthKey(today)
  const userId = session?.user.id
  const watchlistPageCount = Math.max(1, Math.ceil(watchlist.length / WATCHLIST_PAGE_SIZE))
  const currentWatchlistPage = Math.min(watchlistPage, watchlistPageCount - 1)
  const visibleWatchlist = watchlist.slice(currentWatchlistPage * WATCHLIST_PAGE_SIZE, (currentWatchlistPage + 1) * WATCHLIST_PAGE_SIZE)

  useEffect(() => {
    if (toastMessage) window.sessionStorage.removeItem('reelendar.auth-toast')
  }, [toastMessage])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'SIGNED_OUT') {
        setEntries({})
        setWatchlist([])
        setSyncMessage('Signed out. This device is now showing a private local diary.')
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) return
    let active = true

    async function syncLibrary() {
      try {
        const localEntries = readLocalStorage<Record<string, DiaryEntry>>(ENTRIES_STORAGE_KEY, {})
        const localWatchlist = readLocalStorage<Movie[]>(WATCHLIST_STORAGE_KEY, [])
        if (Object.keys(localEntries).length || localWatchlist.length) {
          await migrateLocalLibrary(userId!, localEntries, localWatchlist)
          window.localStorage.removeItem(ENTRIES_STORAGE_KEY)
          window.localStorage.removeItem(WATCHLIST_STORAGE_KEY)
        }
        const library = await loadUserLibrary(userId!)
        if (!active) return
        setEntries(library.entries)
        setWatchlist(library.watchlist)
        setSyncMessage('Your diary is synced.')
      } catch {
        if (active) setSyncMessage('Cloud sync failed. Your local data is still safe on this device.')
      } finally {
        if (active) setCloudLoading(false)
      }
    }

    void Promise.resolve().then(() => {
      if (!active) return
      setCloudLoading(true)
      setSyncMessage('Syncing your film diary…')
      return syncLibrary()
    })
    return () => { active = false }
  }, [userId])

  useEffect(() => {
    if (session === null) window.localStorage.setItem(ENTRIES_STORAGE_KEY, JSON.stringify(entries))
  }, [entries, session])

  useEffect(() => {
    if (session === null) window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist))
  }, [watchlist, session])

  useEffect(() => {
    if (selectedDate && !selectedEntry) searchInputRef.current?.focus()
  }, [selectedDate, selectedEntry])

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') closeDialog()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
    const last = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0)
    const params = new URLSearchParams({
      include_adult: 'false', include_video: 'false', language: 'en-US', page: '1',
      sort_by: 'popularity.desc', 'primary_release_date.gte': dateKey(first), 'primary_release_date.lte': dateKey(last),
    })
    fetch(tmdbUrl('discover/movie', params), {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Release list unavailable')))
      .then((data: { results: Movie[] }) => setReleases(data.results.filter((movie) => movie.poster_path).slice(0, 5)))
      .catch((requestError: Error) => { if (requestError.name !== 'AbortError') setReleases([]) })
    return () => controller.abort()
  }, [viewDate])

  function changeMonth(amount: number) {
    setViewDate((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + amount, 1)
      return next > new Date(today.getFullYear(), today.getMonth(), 1) ? current : next
    })
  }

  function selectMonth(value: string) {
    const [year, month] = value.split('-').map(Number)
    const next = new Date(year, month - 1, 1)
    if (next <= new Date(today.getFullYear(), today.getMonth(), 1)) setViewDate(next)
  }

  function goToToday() {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDate(today)
  }

  function changeView(mode: ViewMode) {
    if (mode === 'day') {
      if (!selectedDate) setSelectedDate(today)
    } else {
      setSelectedDate(null)
      setNoteDate(null)
      setNoteClosing(false)
    }
    setViewMode(mode)
  }

  function openDay(date: Date) {
    if (dateKey(date) > todayKey) return
    const entry = entries[dateKey(date)]
    if (entry && viewMode !== 'day') {
      if (noteDate && dateKey(noteDate) === dateKey(date) && !noteClosing) {
        closeNote()
      } else {
        setNoteDate(date)
        setNoteClosing(false)
      }
      return
    }
    setSelectedDate(date)
    setCommentDraft(entry?.comment ?? '')
    setRatingDraft(entry?.rating ?? 0)
    setIsSaved(false)
    setQuery('')
    setResults([])
    setError('')
  }

  function closeNote() {
    if (!noteDate || noteClosing) return
    setNoteClosing(true)
    window.setTimeout(() => {
      setNoteDate(null)
      setNoteClosing(false)
    }, 260)
  }

  function openEditor(date: Date) {
    const entry = entries[dateKey(date)]
    setSelectedDate(date)
    setCommentDraft(entry?.comment ?? '')
    setRatingDraft(entry?.rating ?? 0)
    setIsSaved(false)
    setNoteDate(null)
    setNoteClosing(false)
  }

  function closeDialog() {
    setSelectedDate(null)
    setWatchlistPickerOpen(false)
    setSettingsOpen(false)
    setQuery('')
    setResults([])
    setError('')
  }

  function exportLibrary() {
    const library = buildLibraryExport(entries, watchlist, session?.user.email ?? null)
    downloadLibraryExport(library)
    setSyncMessage('Your Reelendar data was exported as JSON.')
  }

  async function searchMovies(event: FormEvent) {
    event.preventDefault()
    const trimmedQuery = query.trim()
    if (!trimmedQuery) return
    setIsSearching(true)
    setError('')
    try {
      const params = new URLSearchParams({ query: trimmedQuery, include_adult: 'false', language: 'en-US' })
      const response = await fetch(tmdbUrl('search/movie', params), { headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error(`TMDB request failed (${response.status})`)
      const data = (await response.json()) as { results: Movie[] }
      const movies = data.results.filter((movie) => movie.poster_path).slice(0, 8)
      setResults(movies)
      if (!movies.length) setError(`No films found for “${trimmedQuery}”.`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not reach TMDB. Please try again.')
    } finally { setIsSearching(false) }
  }

  async function chooseMovie(movie: Movie) {
    if (!selectedKey) return
    const previousEntry = entries[selectedKey]
    const nextEntry = { movie, comment: previousEntry?.comment ?? '', rating: previousEntry?.rating ?? 0 }
    setCommentDraft(nextEntry.comment)
    setRatingDraft(nextEntry.rating)
    setIsSaved(false)
    setEntries((current) => ({ ...current, [selectedKey]: nextEntry }))
    setResults([])
    setQuery('')
    if (userId) {
      try {
        await upsertDiaryEntry(userId, selectedKey, nextEntry)
        setSyncMessage('Film saved to your diary.')
      } catch {
        setEntries((current) => {
          const next = { ...current }
          if (previousEntry) next[selectedKey] = previousEntry
          else delete next[selectedKey]
          return next
        })
        setSyncMessage('The film could not be saved. Please try again.')
      }
    }
  }

  async function saveJournalEntry() {
    if (!selectedKey || !entries[selectedKey]) return
    const previousEntry = entries[selectedKey]
    const nextEntry = { ...previousEntry, comment: commentDraft.trim(), rating: ratingDraft }
    setEntries((current) => ({ ...current, [selectedKey]: nextEntry }))
    setIsSaved(true)
    if (userId) {
      try {
        await upsertDiaryEntry(userId, selectedKey, nextEntry)
        setSyncMessage('Your note is synced.')
      } catch {
        setEntries((current) => ({ ...current, [selectedKey]: previousEntry }))
        setIsSaved(false)
        setSyncMessage('Your note could not be synced. Please try again.')
      }
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const targetKey = dateKey(deleteTarget)
    const previousEntry = entries[targetKey]
    setEntries((current) => {
      const next = { ...current }
      delete next[targetKey]
      return next
    })
    if (noteDate && dateKey(noteDate) === targetKey) {
      setNoteDate(null)
      setNoteClosing(false)
    }
    if (selectedKey === targetKey) closeDialog()
    setDeleteTarget(null)
    if (userId) {
      try {
        await removeDiaryEntry(userId, targetKey)
        setSyncMessage('Diary entry removed.')
      } catch {
        if (previousEntry) setEntries((current) => ({ ...current, [targetKey]: previousEntry }))
        setSyncMessage('The entry could not be removed. Please try again.')
      }
    }
  }

  async function toggleWatchlist(movie: Movie) {
    const previousWatchlist = watchlist
    const removing = watchlist.some((item) => item.id === movie.id)
    const nextWatchlist = removing
      ? watchlist.filter((item) => item.id !== movie.id)
      : [movie, ...watchlist]
    setWatchlist(nextWatchlist)
    if (!removing) setWatchlistPage(0)
    if (userId) {
      try {
        if (removing) await removeWatchlistItem(userId, movie.id)
        else await addWatchlistItem(userId, movie)
        setSyncMessage(removing ? 'Removed from your watchlist.' : 'Added to your watchlist.')
      } catch {
        setWatchlist(previousWatchlist)
        setSyncMessage('Your watchlist could not be synced. Please try again.')
      }
    }
  }

  function openWatchlistPicker() {
    setSelectedDate(null)
    setWatchlistPickerOpen(true)
    setQuery('')
    setResults([])
    setError('')
  }

  function renderCalendar() {
    return <section className="calendar-section" aria-label="Film calendar">
      <div className="calendar-toolbar">
        <div className="month-title">
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month"><ArrowIcon direction="left" /></button>
          <label className="month-picker-label">
            <span>{monthFormatter.format(viewDate)} <i>{viewDate.getFullYear()}</i></span>
            <input type="month" value={monthKey(viewDate)} max={monthKey(today)} onChange={(event) => selectMonth(event.target.value)} aria-label="Choose month" />
          </label>
          <button type="button" onClick={() => changeMonth(1)} disabled={isCurrentMonth} aria-label="Next month"><ArrowIcon direction="right" /></button>
        </div>
        <p>Click a past day to add a film</p>
      </div>
      <div className="weekday-row" aria-hidden="true">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">
        {cells.map((cell) => {
          const entry = entries[cell.key]
          const isToday = cell.key === todayKey
          const isFuture = cell.key > todayKey
          return <div className={`day-slot ${!cell.isCurrentMonth ? 'outside' : ''} ${entry ? 'has-film' : ''} ${isFuture ? 'future' : ''}`} key={cell.key}>
            <button className="day-cell" type="button" disabled={isFuture} onClick={() => openDay(cell.date)} aria-label={`${fullDateFormatter.format(cell.date)}${isFuture ? ', unavailable' : entry ? `, read note for ${entry.movie.title}` : ', add a film'}`}>
              {entry?.movie.poster_path && <img src={`${IMAGE_URL}${entry.movie.poster_path}`} alt="" loading="lazy" />}
              <span className={`day-number ${isToday ? 'today' : ''}`}>{cell.date.getDate()}</span>
              {!entry && cell.isCurrentMonth && !isFuture && <span className="add-hint">+</span>}
              {entry && <><span className="movie-title">{entry.movie.title}</span>{entry.comment && <span className="comment-dot" aria-label="Has a note" />}</>}
            </button>
            {entry && <button className="day-delete" type="button" onClick={() => setDeleteTarget(cell.date)} aria-label={`Delete ${entry.movie.title} from ${fullDateFormatter.format(cell.date)}`}>×</button>}
          </div>
        })}
      </div>
    </section>
  }

  function renderYear() {
    const yearEntries = Object.keys(entries).filter((key) => key.startsWith(String(viewDate.getFullYear()))).length
    return <section className="year-view" aria-label={`${viewDate.getFullYear()} yearly view`}>
      <header className="year-summary"><div><p>YEAR PLANNER</p><h2>{viewDate.getFullYear()}</h2></div><div><strong>{yearEntries}</strong><span>TOTAL FILMS</span></div></header>
      <div className="planner-days" aria-hidden="true"><span />{Array.from({ length: 31 }, (_, day) => <span key={day}>{day + 1}</span>)}</div>
      <div className="planner-grid">
        {Array.from({ length: 12 }, (_, month) => {
          const monthDate = new Date(viewDate.getFullYear(), month, 1)
          const daysInMonth = new Date(viewDate.getFullYear(), month + 1, 0).getDate()
          return <div className={`planner-month season-${month}`} key={month}>
            <button className="planner-month-name" type="button" onClick={() => { setViewDate(monthDate); setViewMode('month') }}>{monthFormatter.format(monthDate).slice(0, 3).toUpperCase()}</button>
            {Array.from({ length: 31 }, (_, index) => {
              const day = index + 1
              if (day > daysInMonth) return <span className="planner-day invalid" key={day} />
              const date = new Date(viewDate.getFullYear(), month, day)
              const key = dateKey(date)
              const entry = entries[key]
              const future = key > todayKey
              return <button className={`planner-day ${entry ? 'watched' : ''}`} key={day} type="button" disabled={future} aria-label={`${fullDateFormatter.format(date)}${entry ? `, ${entry.movie.title}` : ''}`} onClick={() => openDay(date)}>{entry && <span>{entry.rating ? `${entry.rating}✦` : '✦'}</span>}</button>
            })}
          </div>
        })}
      </div>
    </section>
  }

  function renderDay() {
    const day = selectedDate && dateKey(selectedDate) <= todayKey ? selectedDate : today
    const entry = entries[dateKey(day)]
    return <section className="day-view">
      <div className="day-view-date"><p>DAILY FRAME</p><h2>{fullDateFormatter.format(day)}</h2></div>
      {entry ? <div className="day-entry">
        <img src={`${IMAGE_URL}${entry.movie.poster_path}`} alt={`${entry.movie.title} poster`} />
        <div><p className="dialog-kicker">{entry.movie.release_date?.slice(0, 4)} · TMDB {entry.movie.vote_average.toFixed(1)}</p><h3>{entry.movie.title}</h3><JournalEditor comment={commentDraft} rating={ratingDraft} saved={isSaved} onComment={(value) => { setCommentDraft(value); setIsSaved(false) }} onRating={(value) => { setRatingDraft(value); setIsSaved(false) }} onSave={saveJournalEntry} /></div>
      </div> : <button className="empty-day" type="button" onClick={() => openDay(day)}>No film logged. Add one →</button>}
    </section>
  }

  return <main className="app-shell">
    <header className="site-header">
      <a className="brand" href="/" aria-label="Reelendar home"><img className="brand-mark" src="/assets/reelendar-icon.png" alt="" /><span>REELENDAR</span></a>
      <p className="header-note">YOUR YEAR IN FILM</p>
      <div className="header-actions">
        <button className="today-button" type="button" onClick={goToToday}>Jump to today</button>
        {session === undefined
          ? <span className="auth-loading">CONNECTING…</span>
          : session
            ? <button className="profile-button" type="button" onClick={() => setSettingsOpen(true)} title={session.user.email} aria-label={`Open profile for ${getProfileName(session)}`}>
              <ProfileAvatar session={session} />
              <span className="profile-copy"><strong>{getProfileName(session)}</strong><small>PROFILE</small></span>
            </button>
            : <button className="auth-button" type="button" onClick={() => window.location.assign('/login')}>SIGN IN</button>}
      </div>
    </header>

    {toastMessage && <ToastNotice message={toastMessage} onDismiss={() => setToastMessage('')} />}
    {syncMessage && <button className={`sync-status ${cloudLoading ? 'loading' : ''}`} type="button" onClick={() => setSyncMessage('')} aria-label={`${syncMessage} Dismiss`}>{syncMessage}</button>}

    <section className="hero" id="top">
      <div><p className="eyebrow"><span /> FILM DIARY · {viewDate.getFullYear()}</p><h1>What did you <em>watch?</em></h1></div>
      <div className="hero-copy"><div className="stats" aria-label="Calendar statistics"><span><strong>{Object.keys(entries).length}</strong> FILMS LOGGED</span><span><strong>{Object.keys(entries).length}</strong> DAYS REMEMBERED</span></div></div>
    </section>

    <nav className="view-switcher" aria-label="Calendar view">
      {(['month', 'year', 'day'] as ViewMode[]).map((mode) => <button key={mode} className={viewMode === mode ? 'active' : ''} onClick={() => changeView(mode)}>{mode}</button>)}
    </nav>

    <div className="dashboard-layout">
      <aside className="discovery-sidebar">
        <section><div className="sidebar-heading"><p>YOUR LIST</p><span>{watchlist.length}</span></div><div className="sidebar-title-row"><h2>Watchlist</h2><button type="button" onClick={openWatchlistPicker} aria-label="Add a film to watchlist">+</button></div>
          <div className="sidebar-list">{visibleWatchlist.map((movie) => <MovieLink key={movie.id} movie={movie} action={() => toggleWatchlist(movie)} />)}</div>
          {watchlist.length > WATCHLIST_PAGE_SIZE && <nav className="watchlist-pagination" aria-label="Watchlist pages">
            <button type="button" onClick={() => setWatchlistPage((page) => Math.max(0, page - 1))} disabled={currentWatchlistPage === 0}>PREV</button>
            <span>{String(currentWatchlistPage + 1).padStart(2, '0')} / {String(watchlistPageCount).padStart(2, '0')}</span>
            <button type="button" onClick={() => setWatchlistPage((page) => Math.min(watchlistPageCount - 1, page + 1))} disabled={currentWatchlistPage >= watchlistPageCount - 1}>NEXT</button>
          </nav>}
        </section>
        <section><div className="sidebar-heading"><p>IN CINEMAS</p><span>05</span></div><h2>This month</h2>
          <div className="sidebar-list">{releases.length ? releases.map((movie) => <MovieLink key={movie.id} movie={movie} />) : <p className="sidebar-empty">No release data available for this month.</p>}</div>
        </section>
      </aside>
      <div className="primary-view">{viewMode === 'month' ? renderCalendar() : viewMode === 'year' ? renderYear() : renderDay()}</div>
    </div>

    <footer><p>YOUR LIFE, <em>FRAME BY FRAME.</em></p><div className="footer-meta"><strong>DESIGNED &amp; BUILT BY FATMA NUR ISKAL</strong><span>Film data &amp; imagery by TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</span></div></footer>

    {noteDate && noteEntry && <aside className={`note-panel ${noteClosing ? 'closing' : ''}`} aria-live="polite">
      <div className="note-paper">
        <button className="note-close" type="button" onClick={closeNote} aria-label="Close note">×</button>
        <button className="note-edit" type="button" onClick={() => openEditor(noteDate)} aria-label={`Edit note for ${noteEntry.movie.title}`}>EDIT</button>
        <p className="note-date">{fullDateFormatter.format(noteDate).toUpperCase()}</p>
        <h2>{noteEntry.movie.title}</h2>
        <div className="note-rating" aria-label={`Your rating ${noteEntry.rating || 0} out of 5`}><span>{noteEntry.rating ? `${noteEntry.rating}/5` : 'NOT RATED'}</span>{noteEntry.rating > 0 && <strong>{Array.from({ length: 5 }, (_, index) => <i key={index} className={noteEntry.rating >= index + 1 ? 'full' : noteEntry.rating >= index + .5 ? 'half' : ''}>✦</i>)}</strong>}</div>
        <p className={`handwritten-note ${noteEntry.comment ? '' : 'empty'}`}>{noteEntry.comment || 'No note was written for this film.'}</p>
        <small>REELENDAR · DAILY NOTE</small>
      </div>
    </aside>}

    {selectedDate && viewMode !== 'day' && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog() }}>
      <section className="movie-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <button className="close-button" type="button" onClick={closeDialog} aria-label="Close dialog">×</button>
        <p className="dialog-kicker">{fullDateFormatter.format(selectedDate).toUpperCase()}</p>
        <h2 id="dialog-title">{selectedEntry ? selectedEntry.movie.title : 'Add a film'}</h2>
        {selectedEntry && <div className="selected-film-summary"><img src={`${IMAGE_URL}${selectedEntry.movie.poster_path}`} alt="" /><JournalEditor comment={commentDraft} rating={ratingDraft} saved={isSaved} onComment={(value) => { setCommentDraft(value); setIsSaved(false) }} onRating={(value) => { setRatingDraft(value); setIsSaved(false) }} onSave={saveJournalEntry} /></div>}
        <p className="dialog-intro">{selectedEntry ? 'Change the film or update your note.' : 'Search TMDB and choose the poster you want to remember this day by.'}</p>
        <form className="search-form" onSubmit={searchMovies}><SearchIcon /><input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a title…" aria-label="Movie title" /><button type="submit" disabled={isSearching || !query.trim()}>{isSearching ? 'Searching…' : 'Search'}</button></form>
        {error && <p className="status-message" role="alert">{error}</p>}
        <div className="movie-results" aria-live="polite">{results.map((movie) => <article key={movie.id} className="movie-card"><button type="button" className="movie-select" onClick={() => chooseMovie(movie)}><img src={`${IMAGE_URL}${movie.poster_path}`} alt={`${movie.title} poster`} /><span className="movie-card-copy"><strong>{movie.title}</strong><span>{movie.release_date?.slice(0, 4) || 'Year unknown'} · {movie.vote_average.toFixed(1)} ★</span></span></button><button className="watchlist-toggle" type="button" onClick={() => toggleWatchlist(movie)}>{watchlist.some((item) => item.id === movie.id) ? '− LIST' : '+ LIST'}</button></article>)}</div>
      </section>
    </div>}

    {deleteTarget && entries[dateKey(deleteTarget)] && <div className="dialog-backdrop confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null) }}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
        <p className="dialog-kicker">REMOVE ENTRY</p><h2 id="confirm-title">Are you sure?</h2><p id="confirm-description">This will remove <strong>{entries[dateKey(deleteTarget)].movie.title}</strong> and its journal note from {fullDateFormatter.format(deleteTarget)}.</p>
        <div><button type="button" onClick={() => setDeleteTarget(null)}>CANCEL</button><button className="confirm-delete" type="button" onClick={confirmDelete}>DELETE ENTRY</button></div>
      </section>
    </div>}

    {watchlistPickerOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog() }}>
      <section className="movie-dialog watchlist-dialog" role="dialog" aria-modal="true" aria-labelledby="watchlist-dialog-title">
        <button className="close-button" type="button" onClick={closeDialog} aria-label="Close dialog">×</button>
        <p className="dialog-kicker">YOUR NEXT FRAME</p><h2 id="watchlist-dialog-title">Add to watchlist</h2>
        <p className="dialog-intro">Search TMDB and keep films you want to watch close.</p>
        <form className="search-form" onSubmit={searchMovies}><SearchIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a title…" aria-label="Watchlist movie title" autoFocus /><button type="submit" disabled={isSearching || !query.trim()}>{isSearching ? 'Searching…' : 'Search'}</button></form>
        {error && <p className="status-message" role="alert">{error}</p>}
        <div className="watchlist-picker-results">{results.map((movie) => <button type="button" key={movie.id} className={watchlist.some((item) => item.id === movie.id) ? 'added' : ''} onClick={() => toggleWatchlist(movie)}><img src={`${IMAGE_URL}${movie.poster_path}`} alt="" /><span><strong>{movie.title}</strong><small>{watchlist.some((item) => item.id === movie.id) ? 'ADDED ✓' : '+ ADD TO LIST'}</small></span></button>)}</div>
      </section>
    </div>}

    {settingsOpen && session && <AccountSettings session={session} entries={entries} watchlist={watchlist} onClose={closeDialog} onExport={exportLibrary} />}

  </main>
}

function AccountSettings({ session, entries, watchlist, onClose, onExport }: {
  session: Session
  entries: Record<string, DiaryEntry>
  watchlist: Movie[]
  onClose: () => void
  onExport: () => void
}) {
  const [displayName, setDisplayName] = useState(String(session.user.user_metadata.display_name ?? ''))
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    const { error } = await supabase.auth.updateUser({ data: { display_name: displayName.trim() } })
    setSaving(false)
    setMessage(error ? error.message : 'Profile updated.')
  }

  async function signOut() {
    setSaving(true)
    const { error } = await supabase.auth.signOut()
    setSaving(false)
    if (error) setMessage(error.message)
    else onClose()
  }

  return <div className="dialog-backdrop settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="account-settings" role="dialog" aria-modal="true" aria-labelledby="account-settings-title">
      <button className="close-button" type="button" onClick={onClose} aria-label="Close account settings">×</button>
      <p className="dialog-kicker">ACCOUNT</p>
      <div className="account-identity">
        <ProfileAvatar session={session} />
        <div><h2 id="account-settings-title">{getProfileName(session)}</h2><p className="account-email">{session.user.email}</p></div>
      </div>

      <div className="account-summary" aria-label="Library summary">
        <span><strong>{Object.keys(entries).length}</strong> FILMS LOGGED</span>
        <span><strong>{watchlist.length}</strong> WATCHLIST</span>
      </div>

      <form className="account-profile-form" onSubmit={saveProfile}>
        <label><span>DISPLAY NAME</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} autoComplete="name" placeholder="Optional" /></label>
        <button type="submit" disabled={saving}>SAVE PROFILE</button>
      </form>

      {message && <p className="status-message" role="status">{message}</p>}

      <div className="account-data-actions">
        <div><strong>Export your data</strong><p>Download diary entries, ratings, notes and watchlist as a portable JSON file.</p></div>
        <button type="button" onClick={onExport}>EXPORT JSON</button>
      </div>
      <button className="account-sign-out" type="button" onClick={signOut} disabled={saving}>SIGN OUT</button>
    </section>
  </div>
}

function JournalEditor({ comment, rating, saved, onComment, onRating, onSave }: { comment: string; rating: number; saved: boolean; onComment: (value: string) => void; onRating: (value: number) => void; onSave: () => void }) {
  return <div className="journal-editor">
    <div className="rating-field"><span>YOUR RATING</span><div className="half-rating" role="radiogroup" aria-label="Your rating">{[1, 2, 3, 4, 5].map((value) => {
      const fill = rating >= value ? 100 : rating >= value - .5 ? 50 : 0
      return <span className="rating-star" key={value}><i aria-hidden="true">✦</i><i className="rating-star-fill" style={{ width: `${fill}%` }} aria-hidden="true">✦</i><button className="half-left" type="button" onClick={() => onRating(value - .5)} role="radio" aria-checked={rating === value - .5} aria-label={`${value - .5} out of 5`} /><button className="half-right" type="button" onClick={() => onRating(value)} role="radio" aria-checked={rating === value} aria-label={`${value} out of 5`} /></span>
    })}</div><strong>{rating ? `${rating}/5` : '—'}</strong></div>
    <label className="comment-field"><span>YOUR NOTE</span><textarea value={comment} onChange={(event) => onComment(event.target.value)} placeholder="What stayed with you after the credits?" maxLength={500} /><small>{comment.length}/500</small></label>
    <button className={`save-entry ${saved ? 'saved' : ''}`} type="button" onClick={onSave}>{saved ? 'SAVED ✓' : 'SAVE ENTRY'}</button>
  </div>
}

function MovieLink({ movie, action }: { movie: Movie; action?: () => void }) {
  return <article className="sidebar-movie"><a href={`https://www.themoviedb.org/movie/${movie.id}`} target="_blank" rel="noreferrer"><img src={`${IMAGE_URL}${movie.poster_path}`} alt="" /><span><strong>{movie.title}</strong><small>{movie.release_date?.slice(0, 4) || 'TBA'} · {movie.vote_average.toFixed(1)} ★</small></span></a>{action && <button type="button" onClick={action} aria-label={`Remove ${movie.title} from watchlist`}>×</button>}</article>
}
