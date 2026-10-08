import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ToastNotice } from './components/ToastNotice'
import { DayJournalHeader } from './components/DayJournalHeader'
import {
  addWatchlistItem,
  addEpisodeEntry,
  loadUserLibrary,
  loadUserSeriesTracker,
  migrateLocalLibrary,
  migrateLocalSeriesTracker,
  removeDiaryEntry,
  removeEpisodeEntry,
  removeWatchlistItem,
  removeSeriesLibraryItem,
  supabase,
  upsertDiaryEntry,
  upsertSeriesLibraryItem,
  type DiaryEntry,
  type EpisodeEntry,
  type MediaItem,
  type MediaType,
  type SeriesLibraryItem,
  type SeriesStatus,
  type TvSeries,
} from './lib/supabase'

type ViewMode = 'month' | 'year' | 'day'
type AppLanguage = 'en' | 'tr'
type ProfileTab = 'overview' | 'notes' | 'settings'
type ProfileEmotion = 'sad' | 'disgusted' | 'happy' | 'angry'
type AccountConfirmation = 'signout' | 'delete'
type CalendarCell = { date: Date; key: string; isCurrentMonth: boolean }
type TmdbResult = {
  id: number
  title?: string
  original_title?: string
  release_date?: string
  name?: string
  original_name?: string
  first_air_date?: string
  poster_path: string | null
  vote_average: number
}
type TmdbSeriesDetails = TmdbResult & {
  genres?: Array<{ id: number; name: string }>
  episode_run_time?: number[]
  number_of_seasons?: number
  number_of_episodes?: number
  seasons?: Array<{ season_number: number; episode_count: number; name: string }>
  status?: string
}
type MovieAnalyticsDetail = {
  runtime?: number
  genres?: Array<{ id: number; name: string }>
}

const API_URL = '/api/tmdb'
const IMAGE_URL = 'https://image.tmdb.org/t/p/w500'
const ENTRIES_STORAGE_KEY = 'reelendar.entries.v1'
const WATCHLIST_STORAGE_KEY = 'reelendar.watchlist.v1'
const SERIES_LIBRARY_STORAGE_KEY = 'reelendar.series-library.v1'
const EPISODE_ENTRIES_STORAGE_KEY = 'reelendar.episode-entries.v1'
const LANGUAGE_STORAGE_KEY = 'reelendar.language.v1'
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long' })
const fullDateFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
const PROFILE_FACES = [
  { emotion: 'sad', label: 'Sad', color: '#aecbf3' },
  { emotion: 'disgusted', label: 'Disgusted', color: '#c7ddb2' },
  { emotion: 'happy', label: 'Happy', color: '#f8d368' },
  { emotion: 'angry', label: 'Angry', color: '#ef746d' },
] as const

const APP_COPY = {
  en: {
    films: 'FILMS', series: 'SERIES', profile: 'PROFILE', signIn: 'SIGN IN',
    month: 'month', year: 'year', day: 'day', filmDiary: 'FILM DIARY', seriesDiary: 'SERIES DIARY',
    filmQuestion: <>What did you <em>watch?</em></>, seriesQuestion: <>Where did you <em>leave off?</em></>,
    filmsLogged: 'FILMS LOGGED', daysRemembered: 'DAYS REMEMBERED', episodesLogged: 'EPISODES LOGGED', seriesTracked: 'SERIES TRACKED',
    yourList: 'YOUR LIST', watchlist: 'Watchlist', inCinemas: 'IN CINEMAS', thisMonth: 'This month',
  },
  tr: {
    films: 'FİLMLER', series: 'DİZİLER', profile: 'PROFİL', signIn: 'GİRİŞ YAP',
    month: 'ay', year: 'yıl', day: 'gün', filmDiary: 'FİLM GÜNLÜĞÜ', seriesDiary: 'DİZİ GÜNLÜĞÜ',
    filmQuestion: <>Ne <em>izledin?</em></>, seriesQuestion: <>Nerede <em>kaldın?</em></>,
    filmsLogged: 'FİLM KAYDI', daysRemembered: 'HATIRLANAN GÜN', episodesLogged: 'BÖLÜM KAYDI', seriesTracked: 'TAKİP EDİLEN DİZİ',
    yourList: 'LİSTEN', watchlist: 'İzleme listesi', inCinemas: 'VİZYONDA', thisMonth: 'Bu ay',
  },
} as const

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

function normalizeTmdbItem(item: TmdbResult, mediaType: MediaType): MediaItem {
  return {
    id: item.id,
    title: mediaType === 'tv' ? item.name ?? item.original_name ?? 'Untitled series' : item.title ?? item.original_title ?? 'Untitled film',
    original_title: mediaType === 'tv' ? item.original_name ?? item.name ?? '' : item.original_title ?? item.title ?? '',
    poster_path: item.poster_path,
    release_date: mediaType === 'tv' ? item.first_air_date : item.release_date,
    vote_average: Number(item.vote_average ?? 0),
    media_type: mediaType,
  }
}

function mediaKey(item: MediaItem) {
  return `${item.media_type ?? 'movie'}:${item.id}`
}

function mediaLabel(item: MediaItem) {
  return item.media_type === 'tv' ? 'Series' : 'Film'
}

const SERIES_STATUS_LABELS: Record<SeriesStatus, string> = {
  watching: 'Watching', waiting: 'Waiting for season', completed: 'Completed', dropped: 'Dropped',
}

const SERIES_STATUS_META: Record<SeriesStatus, { icon: string; tone: string }> = {
  watching: { icon: '▶', tone: 'cyan' },
  waiting: { icon: '◌', tone: 'violet' },
  completed: { icon: '✓', tone: 'green' },
  dropped: { icon: '⊘', tone: 'red' },
}

function nextEpisode(item: SeriesLibraryItem) {
  const seasons = item.series.seasons.filter((season) => season.season_number > 0).sort((a, b) => a.season_number - b.season_number)
  const currentSeason = seasons.find((season) => season.season_number === item.current_season) ?? seasons[0]
  if (!currentSeason) return { season: Math.max(1, item.current_season), episode: item.current_episode + 1 }
  if (item.current_episode < currentSeason.episode_count) return { season: currentSeason.season_number, episode: item.current_episode + 1 }
  const following = seasons.find((season) => season.season_number > currentSeason.season_number)
  return following ? { season: following.season_number, episode: 1 } : null
}

function watchedEpisodeCount(item: SeriesLibraryItem) {
  return item.series.seasons
    .filter((season) => season.season_number > 0 && season.season_number < item.current_season)
    .reduce((sum, season) => sum + season.episode_count, 0) + item.current_episode
}

function upcomingEpisodes(item: SeriesLibraryItem, limit = 8) {
  const seasons = item.series.seasons.filter((season) => season.season_number > 0).sort((a, b) => a.season_number - b.season_number)
  const episodes: Array<{ season: number; episode: number }> = []
  let seasonNumber = item.current_season
  let episodeNumber = item.current_episode + 1

  while (episodes.length < limit) {
    const season = seasons.find((value) => value.season_number === seasonNumber)
    if (!season) break
    if (episodeNumber <= season.episode_count) {
      episodes.push({ season: seasonNumber, episode: episodeNumber })
      episodeNumber += 1
      continue
    }
    const nextSeason = seasons.find((value) => value.season_number > seasonNumber)
    if (!nextSeason) break
    seasonNumber = nextSeason.season_number
    episodeNumber = 1
  }
  return episodes
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

function isProfileEmotion(value: unknown): value is ProfileEmotion {
  return PROFILE_FACES.some((profile) => profile.emotion === value)
}

function EmotionFace({ emotion }: { emotion: ProfileEmotion }) {
  if (emotion === 'sad') return <svg className="emotion-face" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M10 18c3-4 6-5 9-3M38 18c-3-4-6-5-9-3M15 22c0 3 2 5 4 5s4-2 4-5M25 22c0 3 2 5 4 5s4-2 4-5M15 38c5-7 13-7 18 0" /></svg>
  if (emotion === 'disgusted') return <svg className="emotion-face" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="m10 15 10 5M38 15l-10 5M12 24h9M27 24h9M15 27c1 2 4 2 5 0M28 27c1 2 4 2 5 0M14 37c4-5 7 4 11-1 4-4 6 3 9 0" /></svg>
  if (emotion === 'happy') return <svg className="emotion-face" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M11 17c3-4 6-5 9-2M37 17c-3-4-6-5-9-2M13 25c3-5 7-5 10 0M25 25c3-5 7-5 10 0M14 31c5 8 15 8 20 0" /></svg>
  return <svg className="emotion-face" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="m10 16 11 6M38 16l-11 6M14 25c2-2 5-2 7 0M27 25c2-2 5-2 7 0M15 38c5-7 13-7 18 0" /></svg>
}

function ProfileAvatar({ session, emotion, color }: { session: Session; emotion?: ProfileEmotion; color?: string }) {
  const metadataEmotion = session.user.user_metadata.profile_face
  const selectedEmotion = emotion ?? (isProfileEmotion(metadataEmotion) ? metadataEmotion : PROFILE_FACES[0].emotion)
  const selectedColor = color ?? String(session.user.user_metadata.profile_color ?? PROFILE_FACES[0].color)
  return <span className="profile-avatar" style={{ backgroundColor: selectedColor }} aria-hidden="true"><EmotionFace emotion={selectedEmotion} /></span>
}

function SaveIndicator({ saving, failed = false }: { saving: boolean; failed?: boolean }) {
  if (!saving && !failed) return null
  return <span className={`save-indicator ${saving ? 'is-saving' : 'has-error'}`} role="status" aria-label={saving ? 'Saving' : 'Save failed'}><i aria-hidden="true">{failed ? '!' : ''}</i></span>
}

function formatHours(minutes: number, language: AppLanguage) {
  if (minutes <= 0) return '—'
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return language === 'tr' ? `${hours} sa ${remainingMinutes} dk` : `${hours}h ${remainingMinutes}m`
}

function SeriesStatusPicker({ value, onChange, label, compact = false }: {
  value: SeriesStatus
  onChange: (status: SeriesStatus) => void
  label: string
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const statuses: SeriesStatus[] = ['watching', 'waiting', 'completed', 'dropped']

  useEffect(() => {
    if (!open) return
    function closePicker(event: PointerEvent) {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closePicker)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closePicker)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return <div className={`series-status-picker ${compact ? 'compact' : ''}`} ref={pickerRef} data-status={value}>
    <select className="status-native-select" value={value} aria-label={label} onChange={(event) => onChange(event.target.value as SeriesStatus)} tabIndex={-1}>
      {statuses.map((status) => <option key={status} value={status}>{SERIES_STATUS_LABELS[status]}</option>)}
    </select>
    <button className="series-status-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className={`status-badge tone-${SERIES_STATUS_META[value].tone}`}><i aria-hidden="true">{SERIES_STATUS_META[value].icon}</i>{SERIES_STATUS_LABELS[value]}</span>
      <span className="status-chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div className="series-status-menu" role="listbox" aria-label={label}>
      {statuses.map((status) => <button key={status} type="button" role="option" aria-selected={value === status} onClick={() => { onChange(status); setOpen(false) }}>
        <span className={`status-badge tone-${SERIES_STATUS_META[status].tone}`}><i aria-hidden="true">{SERIES_STATUS_META[status].icon}</i>{SERIES_STATUS_LABELS[status]}</span>
        {value === status && <b aria-hidden="true">✓</b>}
      </button>)}
    </div>}
  </div>
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
  const [contentMode, setContentMode] = useState<MediaType>('movie')
  const [language, setLanguage] = useState<AppLanguage>(() => readLocalStorage<AppLanguage>(LANGUAGE_STORAGE_KEY, 'en'))
  const [entries, setEntries] = useState<Record<string, DiaryEntry>>(() => readLocalStorage(ENTRIES_STORAGE_KEY, {}))
  const [watchlist, setWatchlist] = useState<MediaItem[]>(() => readLocalStorage(WATCHLIST_STORAGE_KEY, []))
  const [watchlistPickerOpen, setWatchlistPickerOpen] = useState(false)
  const [seriesLibrary, setSeriesLibrary] = useState<SeriesLibraryItem[]>(() => readLocalStorage(SERIES_LIBRARY_STORAGE_KEY, []))
  const [episodeEntries, setEpisodeEntries] = useState<Record<string, EpisodeEntry[]>>(() => readLocalStorage(EPISODE_ENTRIES_STORAGE_KEY, {}))
  const [seriesFilter, setSeriesFilter] = useState<SeriesStatus | 'all' | null>('all')
  const [seriesDayDate, setSeriesDayDate] = useState<Date | null>(null)
  const [seriesDayAdding, setSeriesDayAdding] = useState(false)
  const [seriesPickerOpen, setSeriesPickerOpen] = useState(false)
  const [seriesPickerTarget, setSeriesPickerTarget] = useState<'library' | 'watchlist'>('library')
  const [selectedSeriesId, setSelectedSeriesId] = useState<number | null>(null)
  const [seriesNoteDraft, setSeriesNoteDraft] = useState('')
  const [seriesNoteSaving, setSeriesNoteSaving] = useState(false)
  const [seriesNoteFeedback, setSeriesNoteFeedback] = useState('')
  const [episodeListView, setEpisodeListView] = useState<'watched' | 'upcoming'>('watched')
  const [seriesLogging, setSeriesLogging] = useState(false)
  const [seriesPosterFailed, setSeriesPosterFailed] = useState(false)
  const seriesDialogRef = useRef<HTMLElement>(null)
  const [episodeNoteTarget, setEpisodeNoteTarget] = useState<{ watchedDate: string; index: number } | null>(null)
  const [episodeNoteDraft, setEpisodeNoteDraft] = useState('')
  const [episodeNoteMode, setEpisodeNoteMode] = useState<'episode' | 'series'>('episode')
  const [episodeNoteFeedback, setEpisodeNoteFeedback] = useState('')
  const [dayUndo, setDayUndo] = useState<{ key: string; entry: EpisodeEntry; previousItem: SeriesLibraryItem } | null>(null)
  const [episodeMutationPending, setEpisodeMutationPending] = useState(false)
  const episodeMutationRef = useRef(false)
  const [seriesLogDate, setSeriesLogDate] = useState(todayKey)
  const [seriesQuery, setSeriesQuery] = useState('')
  const [seriesResults, setSeriesResults] = useState<MediaItem[]>([])
  const [seriesSearching, setSeriesSearching] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [releases, setReleases] = useState<MediaItem[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MediaItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showMovieSearch, setShowMovieSearch] = useState(false)
  const [error, setError] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [ratingDraft, setRatingDraft] = useState(0)
  const [isSaved, setIsSaved] = useState(false)
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [cloudLoading, setCloudLoading] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [toastMessage, setToastMessage] = useState(() => window.sessionStorage.getItem('reelendar.auth-toast') ?? '')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const seriesDayPopoverRef = useRef<HTMLElement>(null)
  const searchRequestIdRef = useRef(0)
  const seriesSearchRequestIdRef = useRef(0)
  const seriesNoteSaveVersionRef = useRef(0)
  const episodeNoteSaveVersionRef = useRef(0)

  const cells = useMemo(() => getCalendarCells(viewDate), [viewDate])
  const selectedKey = selectedDate ? dateKey(selectedDate) : null
  const selectedEntry = selectedKey ? entries[selectedKey] : undefined
  const noteEntry = noteDate ? entries[dateKey(noteDate)] : undefined
  const isCurrentMonth = monthKey(viewDate) === monthKey(today)
  const userId = session?.user.id
  const movieWatchlist = watchlist.filter((item) => item.media_type !== 'tv')
  const seriesWatchlist = watchlist.filter((item) => item.media_type === 'tv')
  const selectedSeriesItem = selectedSeriesId === null ? null : seriesLibrary.find((item) => item.series.id === selectedSeriesId) ?? null
  const activeEpisodeNoteEntry = episodeNoteTarget ? episodeEntries[episodeNoteTarget.watchedDate]?.[episodeNoteTarget.index] ?? null : null
  const activeNoteSeriesItem = activeEpisodeNoteEntry
    ? seriesLibrary.find((item) => item.series.id === activeEpisodeNoteEntry.series.id) ?? null
    : selectedSeriesItem
  const copy = APP_COPY[language]

  useEffect(() => {
    if (!dayUndo || episodeMutationPending) return
    const timer = window.setTimeout(() => setDayUndo(null), 8000)
    return () => window.clearTimeout(timer)
  }, [dayUndo, episodeMutationPending])

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, JSON.stringify(language))
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    if (selectedSeriesId === null) return
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    seriesDialogRef.current?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = previousOverflow
      previousFocus?.focus({ preventScroll: true })
    }
  }, [selectedSeriesId])

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
        setSeriesLibrary([])
        setEpisodeEntries({})
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
        const localWatchlist = readLocalStorage<MediaItem[]>(WATCHLIST_STORAGE_KEY, [])
        const localSeriesLibrary = readLocalStorage<SeriesLibraryItem[]>(SERIES_LIBRARY_STORAGE_KEY, [])
        const localEpisodeEntries = readLocalStorage<Record<string, EpisodeEntry[]>>(EPISODE_ENTRIES_STORAGE_KEY, {})
        if (Object.keys(localEntries).length || localWatchlist.length) {
          await migrateLocalLibrary(userId!, localEntries, localWatchlist)
          window.localStorage.removeItem(ENTRIES_STORAGE_KEY)
          window.localStorage.removeItem(WATCHLIST_STORAGE_KEY)
        }
        if (localSeriesLibrary.length || Object.keys(localEpisodeEntries).length) {
          await migrateLocalSeriesTracker(userId!, localSeriesLibrary, localEpisodeEntries)
          window.localStorage.removeItem(SERIES_LIBRARY_STORAGE_KEY)
          window.localStorage.removeItem(EPISODE_ENTRIES_STORAGE_KEY)
        }
        const [library, seriesTracker] = await Promise.all([loadUserLibrary(userId!), loadUserSeriesTracker(userId!)])
        if (!active) return
        setEntries(library.entries)
        setWatchlist(library.watchlist)
        setSeriesLibrary(seriesTracker.seriesLibrary)
        setEpisodeEntries(seriesTracker.episodeEntries)
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
      setSyncMessage('Syncing your watch diary…')
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
    if (session === null) window.localStorage.setItem(SERIES_LIBRARY_STORAGE_KEY, JSON.stringify(seriesLibrary))
  }, [seriesLibrary, session])

  useEffect(() => {
    if (session === null) window.localStorage.setItem(EPISODE_ENTRIES_STORAGE_KEY, JSON.stringify(episodeEntries))
  }, [episodeEntries, session])

  useEffect(() => {
    const noteEditorIsOpen = selectedSeriesId !== null || (episodeNoteTarget !== null && episodeNoteMode === 'series')
    if (!noteEditorIsOpen || !activeNoteSeriesItem) return
    const nextNote = seriesNoteDraft.trim()
    if (nextNote === (activeNoteSeriesItem.note ?? '')) return
    const timer = window.setTimeout(() => {
      const saveVersion = ++seriesNoteSaveVersionRef.current
      const previous = activeNoteSeriesItem
      const updated = { ...activeNoteSeriesItem, note: nextNote }
      setSeriesNoteSaving(true)
      setSeriesLibrary((current) => current.map((item) => item.series.id === updated.series.id ? updated : item))
      void (async () => {
        try {
          if (userId) await upsertSeriesLibraryItem(userId, updated)
          if (saveVersion === seriesNoteSaveVersionRef.current) setSeriesNoteFeedback('Saved automatically')
        } catch {
          setSeriesLibrary((current) => current.map((item) => item.series.id === previous.series.id && item.note === nextNote ? previous : item))
          if (saveVersion === seriesNoteSaveVersionRef.current) setSeriesNoteFeedback('Could not save. Keep typing to retry.')
        } finally {
          if (saveVersion === seriesNoteSaveVersionRef.current) setSeriesNoteSaving(false)
        }
      })()
    }, 650)
    return () => window.clearTimeout(timer)
  }, [seriesNoteDraft, selectedSeriesId, episodeNoteTarget, episodeNoteMode, activeNoteSeriesItem, userId])

  useEffect(() => {
    if (!episodeNoteTarget || !activeEpisodeNoteEntry) return
    const nextNote = episodeNoteDraft.trim()
    if (nextNote === (activeEpisodeNoteEntry.note ?? '')) return
    const timer = window.setTimeout(() => {
      const { watchedDate, index } = episodeNoteTarget
      const saveVersion = ++episodeNoteSaveVersionRef.current
      const previousEntries = episodeEntries
      const updatedEntry = { ...activeEpisodeNoteEntry, note: nextNote }
      const updatedDay = episodeEntries[watchedDate].map((entry, entryIndex) => entryIndex === index ? updatedEntry : entry)
      setEpisodeEntries((current) => ({ ...current, [watchedDate]: updatedDay }))
      void (async () => {
        try {
          if (userId) await addEpisodeEntry(userId, watchedDate, updatedEntry)
          if (saveVersion === episodeNoteSaveVersionRef.current) setEpisodeNoteFeedback('Saved automatically')
        } catch {
          setEpisodeEntries((current) => {
            const currentEntryAtIndex = current[watchedDate]?.[index]
            return currentEntryAtIndex?.note === nextNote ? previousEntries : current
          })
          if (saveVersion === episodeNoteSaveVersionRef.current) setEpisodeNoteFeedback('Could not save. Keep typing to retry.')
        }
      })()
    }, 650)
    return () => window.clearTimeout(timer)
  }, [episodeNoteDraft, episodeNoteTarget, activeEpisodeNoteEntry, episodeEntries, userId])

  useEffect(() => {
    if (selectedDate && showMovieSearch) searchInputRef.current?.focus()
  }, [selectedDate, showMovieSearch, viewMode])

  useEffect(() => {
    const searchIsVisible = (Boolean(selectedDate) && showMovieSearch) || watchlistPickerOpen
    const trimmedQuery = query.trim()
    if (!searchIsVisible || trimmedQuery.length < 2) return

    const requestId = ++searchRequestIdRef.current
    const controller = new AbortController()
    const debounceTimer = window.setTimeout(async () => {
      setIsSearching(true)
      setError('')
      try {
        const params = new URLSearchParams({ query: trimmedQuery, include_adult: 'false', language: 'en-US' })
        const response = await fetch(tmdbUrl('search/movie', params), {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        })
        if (!response.ok) throw new Error(`TMDB request failed (${response.status})`)
        const data = (await response.json()) as { results: TmdbResult[] }
        if (searchRequestIdRef.current !== requestId) return
        const items = data.results
          .filter((item) => item.poster_path)
          .slice(0, 8)
          .map((item) => normalizeTmdbItem(item, 'movie'))
        setResults(items)
        if (!items.length) setError(`No films found for “${trimmedQuery}”.`)
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name === 'AbortError') return
        if (searchRequestIdRef.current === requestId) {
          setError(requestError instanceof Error ? requestError.message : 'Could not reach TMDB. Please try again.')
        }
      } finally {
        if (searchRequestIdRef.current === requestId) setIsSearching(false)
      }
    }, 400)

    return () => {
      window.clearTimeout(debounceTimer)
      controller.abort()
    }
  }, [query, selectedDate, showMovieSearch, viewMode, watchlistPickerOpen])

  useEffect(() => {
    const trimmedQuery = seriesQuery.trim()
    if (!seriesPickerOpen || trimmedQuery.length < 2) return
    const requestId = ++seriesSearchRequestIdRef.current
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSeriesSearching(true)
      try {
        const params = new URLSearchParams({ query: trimmedQuery, include_adult: 'false', language: 'en-US' })
        const response = await fetch(tmdbUrl('search/tv', params), { signal: controller.signal })
        if (!response.ok) throw new Error('Series search unavailable')
        const data = (await response.json()) as { results: TmdbResult[] }
        if (seriesSearchRequestIdRef.current === requestId) {
          setSeriesResults(data.results.filter((item) => item.poster_path).slice(0, 8).map((item) => normalizeTmdbItem(item, 'tv')))
        }
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name !== 'AbortError') setError(requestError.message)
      } finally {
        if (seriesSearchRequestIdRef.current === requestId) setSeriesSearching(false)
      }
    }, 400)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [seriesPickerOpen, seriesQuery])

  useEffect(() => {
    if (!seriesDayDate || viewMode === 'day') return

    function closeSeriesDayOnOutsidePress(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      if (seriesDayPopoverRef.current?.contains(target) || target.closest('.day-cell')) return
      setSeriesDayDate(null)
      setSeriesDayAdding(false)
    }

    document.addEventListener('pointerdown', closeSeriesDayOnOutsidePress)
    return () => document.removeEventListener('pointerdown', closeSeriesDayOnOutsidePress)
  }, [seriesDayDate, viewMode])

  useEffect(() => {
    const controller = new AbortController()
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
    const last = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0)
    const params = new URLSearchParams({
      include_adult: 'false', language: 'en-US', page: '1', sort_by: 'popularity.desc',
      'primary_release_date.gte': dateKey(first), 'primary_release_date.lte': dateKey(last), include_video: 'false',
    })
    fetch(tmdbUrl('discover/movie', params), {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Release list unavailable')))
      .then((data: { results: TmdbResult[] }) => setReleases(data.results.filter((item) => item.poster_path).slice(0, 5).map((item) => normalizeTmdbItem(item, 'movie'))))
      .catch((requestError: Error) => { if (requestError.name !== 'AbortError') setReleases([]) })
    return () => controller.abort()
  }, [viewDate])

  function changeMonth(amount: number) {
    setSeriesDayDate(null)
    setSeriesDayAdding(false)
    setViewDate((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + amount, 1)
      return next > new Date(today.getFullYear(), today.getMonth(), 1) ? current : next
    })
  }

  function selectMonth(value: string) {
    const [year, month] = value.split('-').map(Number)
    const next = new Date(year, month - 1, 1)
    if (next <= new Date(today.getFullYear(), today.getMonth(), 1)) {
      setSeriesDayDate(null)
      setSeriesDayAdding(false)
      setViewDate(next)
    }
  }

  function changeView(mode: ViewMode) {
    flushEpisodeNote()
    setEpisodeNoteTarget(null)
    if (contentMode === 'tv') {
      setViewMode(mode)
      setSeriesDayDate(mode === 'day' ? seriesDayDate ?? today : null)
      setSeriesDayAdding(false)
      setSelectedDate(null)
      return
    }
    if (mode === 'day') {
      openEditor(selectedDate ?? today)
    } else {
      setSelectedDate(null)
      setNoteDate(null)
      setNoteClosing(false)
    }
    setViewMode(mode)
  }

  function openDay(date: Date) {
    if (dateKey(date) > todayKey) return
    if (contentMode === 'tv') {
      setSeriesDayDate(date)
      setSeriesDayAdding(!(episodeEntries[dateKey(date)]?.length))
      setSelectedDate(null)
      return
    }
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
    setShowMovieSearch(!entry)
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
    setShowMovieSearch(false)
    setNoteDate(null)
    setNoteClosing(false)
  }

  function closeDialog() {
    flushEpisodeNote()
    flushSeriesNote()
    if (viewMode !== 'day') setSelectedDate(null)
    setWatchlistPickerOpen(false)
    setSettingsOpen(false)
    if (viewMode !== 'day') setSeriesDayDate(null)
    setSeriesDayAdding(false)
    setSeriesPickerOpen(false)
    setSeriesPickerTarget('library')
    setSelectedSeriesId(null)
    setSeriesNoteDraft('')
    setEpisodeNoteTarget(null)
    setEpisodeNoteDraft('')
    setEpisodeNoteMode('episode')
    setEpisodeNoteFeedback('')
    setSeriesQuery('')
    setSeriesResults([])
    setShowMovieSearch(false)
    setQuery('')
    setResults([])
    setError('')
  }

  function changeContentMode(mode: MediaType) {
    if (mode === contentMode) return
    flushEpisodeNote()
    flushSeriesNote()
    setDayUndo(null)
    setContentMode(mode)
    setSelectedDate(null)
    setSeriesDayDate(null)
    setSeriesDayAdding(false)
    setSelectedSeriesId(null)
    setEpisodeNoteTarget(null)
    setNoteDate(null)
    setViewMode('month')
  }

  async function addSeriesToLibrary(result: MediaItem) {
    setSeriesSearching(true)
    try {
      const params = new URLSearchParams({ language: 'en-US' })
      const response = await fetch(tmdbUrl(`tv/${result.id}`, params))
      if (!response.ok) throw new Error('Series details unavailable')
      const detail = (await response.json()) as TmdbSeriesDetails
      const base = normalizeTmdbItem(detail, 'tv')
      const series: TvSeries = {
        ...base, media_type: 'tv', genres: detail.genres ?? [], episode_run_time: detail.episode_run_time ?? [],
        number_of_seasons: detail.number_of_seasons ?? 0, number_of_episodes: detail.number_of_episodes ?? 0,
        seasons: detail.seasons ?? [], tmdb_status: detail.status,
      }
      const firstSeason = series.seasons.find((season) => season.season_number > 0)?.season_number ?? 1
      const item: SeriesLibraryItem = { series, status: 'watching', current_season: firstSeason, current_episode: 0, note: '' }
      setSeriesLibrary((current) => [item, ...current.filter((entry) => entry.series.id !== series.id)])
      if (userId) await upsertSeriesLibraryItem(userId, item)
      setSeriesPickerOpen(false)
      setSeriesQuery('')
      setSeriesResults([])
      setSyncMessage('Series added to your tracker.')
    } catch {
      setSyncMessage('The series could not be added. Please try again.')
    } finally {
      setSeriesSearching(false)
    }
  }

  async function updateSeriesStatus(item: SeriesLibraryItem, status: SeriesStatus) {
    const nextItem = { ...item, status }
    setSeriesLibrary((current) => current.map((entry) => entry.series.id === item.series.id ? nextItem : entry))
    if (userId) {
      try { await upsertSeriesLibraryItem(userId, nextItem) }
      catch { setSeriesLibrary((current) => current.map((entry) => entry.series.id === item.series.id ? item : entry)) }
    }
  }

  async function removeTrackedSeries(item: SeriesLibraryItem) {
    setSeriesLibrary((current) => current.filter((entry) => entry.series.id !== item.series.id))
    if (userId) {
      try { await removeSeriesLibraryItem(userId, item.series.id) }
      catch { setSeriesLibrary((current) => [item, ...current]) }
    }
  }

  async function markNextEpisode(item: SeriesLibraryItem, watchedOn: Date | null = seriesDayDate) {
    if (!watchedOn || episodeMutationRef.current) return
    const next = nextEpisode(item)
    if (!next) {
      await updateSeriesStatus(item, 'completed')
      return
    }
    const entry: EpisodeEntry = {
      series: item.series, season_number: next.season, episode_number: next.episode,
      episode_name: `Episode ${next.episode}`, runtime: item.series.episode_run_time[0] ?? null, note: '',
    }
    const key = dateKey(watchedOn)
    episodeMutationRef.current = true
    setEpisodeMutationPending(true)
    setDayUndo(null)
    setEpisodeEntries((current) => ({ ...current, [key]: [...(current[key] ?? []), entry] }))
    setSeriesDayAdding(false)
    const updated = { ...item, current_season: next.season, current_episode: next.episode }
    setSeriesLibrary((current) => current.map((value) => value.series.id === item.series.id ? updated : value))
    try {
      if (userId) await Promise.all([addEpisodeEntry(userId, key, entry), upsertSeriesLibraryItem(userId, updated)])
      if (viewMode === 'day') setDayUndo({ key, entry, previousItem: item })
    } catch {
      setSyncMessage('Episode could not be synced.')
    } finally {
      episodeMutationRef.current = false
      setEpisodeMutationPending(false)
    }
  }

  async function removeLoggedEpisode(watchedDate: Date, target: EpisodeEntry, targetIndex: number, restoreItem?: SeriesLibraryItem) {
    const key = dateKey(watchedDate)
    const previousEntries = episodeEntries
    const previousLibrary = seriesLibrary
    const remainingForDay = (episodeEntries[key] ?? []).filter((_, index) => index !== targetIndex)
    const nextEntries = { ...episodeEntries }
    if (remainingForDay.length) nextEntries[key] = remainingForDay
    else delete nextEntries[key]

    const remainingForSeries = Object.values(nextEntries).flat().filter((entry) => entry.series.id === target.series.id)
    const latest = remainingForSeries.reduce<EpisodeEntry | null>((current, entry) => {
      if (!current) return entry
      const currentOrder = current.season_number * 10000 + current.episode_number
      const entryOrder = entry.season_number * 10000 + entry.episode_number
      return entryOrder > currentOrder ? entry : current
    }, null)
    const currentItem = seriesLibrary.find((item) => item.series.id === target.series.id)
    const firstSeason = target.series.seasons.find((season) => season.season_number > 0)?.season_number ?? 1
    const updatedItem = restoreItem ?? (currentItem ? {
      ...currentItem,
      status: currentItem.status === 'completed' ? 'watching' as const : currentItem.status,
      current_season: latest?.season_number ?? firstSeason,
      current_episode: latest?.episode_number ?? 0,
    } : null)

    setEpisodeEntries(nextEntries)
    if (!remainingForDay.length) setSeriesDayAdding(true)
    if (updatedItem) setSeriesLibrary((current) => current.map((item) => item.series.id === updatedItem.series.id ? updatedItem : item))

    if (userId) {
      let removedFromCloud = false
      try {
        await removeEpisodeEntry(userId, key, target)
        removedFromCloud = true
        if (updatedItem) await upsertSeriesLibraryItem(userId, updatedItem)
        setSyncMessage('Episode removed from this day.')
      } catch {
        if (removedFromCloud) {
          try { await addEpisodeEntry(userId, key, target) }
          catch { /* The next full sync will reconcile this rare partial failure. */ }
        }
        setEpisodeEntries(previousEntries)
        setSeriesLibrary(previousLibrary)
        setSeriesDayAdding(false)
        setSyncMessage('The episode could not be removed. Please try again.')
      }
    }
  }

  async function undoDayEpisode() {
    if (!dayUndo || episodeMutationRef.current) return
    const { key, entry, previousItem } = dayUndo
    const index = (episodeEntries[key] ?? []).findIndex((value) => value.series.id === entry.series.id && value.season_number === entry.season_number && value.episode_number === entry.episode_number)
    if (index < 0) { setDayUndo(null); return }
    flushEpisodeNote()
    setEpisodeNoteTarget(null)
    episodeMutationRef.current = true
    setEpisodeMutationPending(true)
    setDayUndo(null)
    try { await removeLoggedEpisode(new Date(`${key}T12:00:00`), entry, index, previousItem) }
    finally { episodeMutationRef.current = false; setEpisodeMutationPending(false) }
  }

  async function chooseMovie(movie: MediaItem) {
    if (!selectedKey) return
    const previousEntry = entries[selectedKey]
    const nextEntry = { movie, comment: previousEntry?.comment ?? '', rating: previousEntry?.rating ?? 0 }
    setCommentDraft(nextEntry.comment)
    setRatingDraft(nextEntry.rating)
    setIsSaved(false)
    setEntries((current) => ({ ...current, [selectedKey]: nextEntry }))
    setResults([])
    setQuery('')
    setShowMovieSearch(false)
    if (userId) {
      try {
        await upsertDiaryEntry(userId, selectedKey, nextEntry)
        setSyncMessage(`${mediaLabel(movie)} saved to your diary.`)
      } catch {
        setEntries((current) => {
          const next = { ...current }
          if (previousEntry) next[selectedKey] = previousEntry
          else delete next[selectedKey]
          return next
        })
        setSyncMessage(`The ${mediaLabel(movie).toLowerCase()} could not be saved. Please try again.`)
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
        if (viewMode !== 'day') closeDialog()
      } catch {
        setEntries((current) => ({ ...current, [selectedKey]: previousEntry }))
        setIsSaved(false)
        setSyncMessage('Your note could not be synced. Please try again.')
      }
    } else if (viewMode !== 'day') {
      closeDialog()
    }
  }

  function updateSearchQuery(value: string) {
    setQuery(value)
    if (value.trim().length < 2) {
      searchRequestIdRef.current += 1
      setResults([])
      setError('')
      setIsSearching(false)
    }
  }

  function returnToMovieSearch() {
    setShowMovieSearch(true)
    setQuery('')
    setResults([])
    setError('')
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

  async function toggleWatchlist(movie: MediaItem) {
    const previousWatchlist = watchlist
    const removing = watchlist.some((item) => mediaKey(item) === mediaKey(movie))
    const nextWatchlist = removing
      ? watchlist.filter((item) => mediaKey(item) !== mediaKey(movie))
      : [movie, ...watchlist]
    setWatchlist(nextWatchlist)
    if (userId) {
      try {
        if (removing) await removeWatchlistItem(userId, movie.id, movie.media_type ?? 'movie')
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
    setShowMovieSearch(false)
    setQuery('')
    setResults([])
    setError('')
  }

  function openSeriesPicker(target: 'library' | 'watchlist' = 'library') {
    setSeriesPickerTarget(target)
    setSeriesPickerOpen(true)
    setSeriesQuery('')
    setSeriesResults([])
    setError('')
  }

  function openSeriesDetail(item: SeriesLibraryItem) {
    setSelectedSeriesId(item.series.id)
    setSeriesNoteDraft(item.note ?? '')
    setEpisodeNoteTarget(null)
    setEpisodeNoteDraft('')
    setSeriesLogDate(todayKey)
    setEpisodeListView('watched')
    setSeriesNoteFeedback('')
    setSeriesPosterFailed(false)
  }

  function openEpisodeNote(watchedDate: string, index: number, entry: EpisodeEntry) {
    setEpisodeNoteTarget({ watchedDate, index })
    setEpisodeNoteDraft(entry.note ?? '')
    setEpisodeNoteMode('episode')
    setEpisodeNoteFeedback('')
    const item = seriesLibrary.find((value) => value.series.id === entry.series.id)
    setSeriesNoteDraft(item?.note ?? '')
    setSeriesNoteFeedback('')
  }

  function flushSeriesNote() {
    if (!activeNoteSeriesItem) return
    const nextNote = seriesNoteDraft.trim()
    if (nextNote === (activeNoteSeriesItem.note ?? '')) return
    const saveVersion = ++seriesNoteSaveVersionRef.current
    const previous = activeNoteSeriesItem
    const updated = { ...activeNoteSeriesItem, note: nextNote }
    setSeriesLibrary((current) => current.map((item) => item.series.id === updated.series.id ? updated : item))
    if (!userId) return
    void upsertSeriesLibraryItem(userId, updated).catch(() => {
      setSeriesLibrary((current) => current.map((item) => item.series.id === previous.series.id && item.note === nextNote ? previous : item))
      if (saveVersion === seriesNoteSaveVersionRef.current) setSyncMessage('The series note could not be synced.')
    })
  }

  function flushEpisodeNote() {
    if (!episodeNoteTarget || !activeEpisodeNoteEntry) return
    const { watchedDate, index } = episodeNoteTarget
    const nextNote = episodeNoteDraft.trim()
    if (nextNote === (activeEpisodeNoteEntry.note ?? '')) return
    const saveVersion = ++episodeNoteSaveVersionRef.current
    const previousEntries = episodeEntries
    const updatedEntry = { ...activeEpisodeNoteEntry, note: nextNote }
    const updatedDay = episodeEntries[watchedDate].map((entry, entryIndex) => entryIndex === index ? updatedEntry : entry)
    setEpisodeEntries((current) => ({ ...current, [watchedDate]: updatedDay }))
    if (!userId) return
    void addEpisodeEntry(userId, watchedDate, updatedEntry).catch(() => {
      setEpisodeEntries((current) => {
        const currentEntryAtIndex = current[watchedDate]?.[index]
        return currentEntryAtIndex?.note === nextNote ? previousEntries : current
      })
      if (saveVersion === episodeNoteSaveVersionRef.current) setSyncMessage('The episode note could not be synced.')
    })
  }

  const closeEverythingOnEscape = useEffectEvent(() => closeDialog())

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') closeEverythingOnEscape()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  function renderCalendar() {
    return <section className="calendar-section" aria-label="Watch diary calendar">
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

  function renderSeriesCalendar() {
    const monthEpisodes = Object.entries(episodeEntries)
      .filter(([key]) => key.startsWith(monthKey(viewDate)))
      .reduce((total, [, episodes]) => total + episodes.length, 0)
    const activeDays = Object.entries(episodeEntries).filter(([key, episodes]) => key.startsWith(monthKey(viewDate)) && episodes.length).length
    const selectedSeriesDayKey = seriesDayDate ? dateKey(seriesDayDate) : null
    return <section className="series-activity" aria-label="Series episode calendar">
      <div className="series-calendar-toolbar">
        <div className="series-month-title">
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month"><ArrowIcon direction="left" /></button>
          <label className="series-month-picker">
            <span>{monthFormatter.format(viewDate).toUpperCase()} <i>{viewDate.getFullYear()}</i></span>
            <input type="month" value={monthKey(viewDate)} max={monthKey(today)} onChange={(event) => selectMonth(event.target.value)} aria-label="Choose month" />
          </label>
          <button type="button" onClick={() => changeMonth(1)} disabled={isCurrentMonth} aria-label="Next month"><ArrowIcon direction="right" /></button>
        </div>
        <div className="series-calendar-summary"><p><strong>{monthEpisodes}</strong> EPISODES <i>·</i> <strong>{activeDays}</strong> DAYS</p></div>
      </div>
      <div className="weekday-row" aria-hidden="true">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">{cells.map((cell, cellIndex) => {
        const episodes = episodeEntries[cell.key] ?? []
        const isToday = cell.key === todayKey
        const isFuture = cell.key > todayKey
        const isSelected = selectedSeriesDayKey === cell.key
        const visibleEpisodes = episodes.slice(0, 3)
        const panelFacesLeft = cellIndex % 7 >= 4
        const panelAlignsBottom = cellIndex >= 28
        return <div className={`day-slot ${!cell.isCurrentMonth ? 'outside' : ''} ${episodes.length ? 'has-episodes' : ''} ${isFuture ? 'future' : ''} ${isSelected ? 'selected' : ''}`} key={cell.key}>
          <button className="day-cell" type="button" disabled={isFuture} onClick={() => openDay(cell.date)} aria-label={`${fullDateFormatter.format(cell.date)}, ${episodes.length} episodes`}>
            <span className={`day-number ${isToday ? 'today' : ''}`}>{cell.date.getDate()}</span>
            {episodes.length > 0 ? <span className="episode-calendar-stack">{visibleEpisodes.map((entry, index) => <span className="episode-calendar-event" key={`${entry.series.id}-${entry.season_number}-${entry.episode_number}-${index}`}>
              {entry.series.poster_path ? <img src={`${IMAGE_URL}${entry.series.poster_path}`} alt="" /> : <i />}
              <span className="episode-calendar-copy"><strong>{entry.series.title}</strong><small>S{String(entry.season_number).padStart(2, '0')} E{String(entry.episode_number).padStart(2, '0')}</small></span>
            </span>)}{episodes.length > 3 && <span className="episode-overflow">+{episodes.length - 3} MORE</span>}</span> : cell.isCurrentMonth && !isFuture ? <span className="add-hint">+</span> : null}
          </button>
          {isSelected && seriesDayDate && <aside ref={seriesDayPopoverRef} className={`series-day-popover ${panelFacesLeft ? 'faces-left' : ''} ${panelAlignsBottom ? 'aligns-bottom' : ''}`} aria-label={`Episodes for ${fullDateFormatter.format(seriesDayDate)}`} onClick={(event) => event.stopPropagation()}>
            <div className="series-popover-frame">
              <div className="series-popover-header"><p>{fullDateFormatter.format(seriesDayDate).toUpperCase()}</p><button type="button" onClick={() => { setSeriesDayDate(null); setSeriesDayAdding(false) }} aria-label="Close episode panel">×</button></div>
              {episodes.length ? <div className="series-popover-episodes">{episodes.map((entry, index) => <article key={`${entry.series.id}-${entry.season_number}-${entry.episode_number}-${index}`}><button className="series-popover-note-trigger" type="button" onClick={() => openEpisodeNote(cell.key, index, entry)} aria-label={`Open note for ${entry.series.title} S${entry.season_number} E${entry.episode_number}`}><img src={`${IMAGE_URL}${entry.series.poster_path}`} alt="" /><span><strong>{entry.series.title}</strong><span>S{entry.season_number} E{entry.episode_number} · {entry.episode_name}</span></span></button><button className="remove-episode-entry" type="button" onClick={() => removeLoggedEpisode(seriesDayDate, entry, index)} aria-label={`Remove ${entry.series.title} S${entry.season_number} E${entry.episode_number}`}>×</button></article>)}</div> : <p className="series-popover-empty">Nothing logged yet. Choose the next episode below.</p>}
              {!seriesDayAdding && episodes.length > 0 && <button className="add-another-episode" type="button" onClick={() => setSeriesDayAdding(true)}><span>＋</span> ADD ANOTHER</button>}
              {seriesDayAdding && <div className="series-popover-actions">{seriesLibrary.filter((item) => item.status === 'watching').map((item) => {
                const next = nextEpisode(item)
                return <article key={item.series.id}><img src={`${IMAGE_URL}${item.series.poster_path}`} alt="" /><div><strong>{item.series.title}</strong><span>{next ? `S${String(next.season).padStart(2, '0')}E${String(next.episode).padStart(2, '0')}` : 'All caught up'}</span></div><button type="button" onClick={() => markNextEpisode(item)} disabled={!next}>{next ? 'MARK WATCHED' : 'DONE'}</button></article>
              })}<button className="add-series-from-day" type="button" onClick={() => openSeriesPicker('library')} aria-label="Add new series"><span>＋</span> ADD NEW SERIES</button></div>}
            </div>
          </aside>}
        </div>
      })}</div>
    </section>
  }

  function renderSeriesYear() {
    const year = viewDate.getFullYear()
    const yearEpisodes = Object.entries(episodeEntries)
      .filter(([key]) => key.startsWith(String(year)))
      .reduce((total, [, episodes]) => total + episodes.length, 0)
    return <section className="year-view series-year-view" aria-label={`${year} series yearly view`}>
      <header className="year-summary"><div><p>EPISODE YEAR</p><h2>{year}</h2></div><div><strong>{yearEpisodes}</strong><span>EPISODES WATCHED</span></div></header>
      <div className="planner-days" aria-hidden="true"><span />{Array.from({ length: 31 }, (_, day) => <span key={day}>{day + 1}</span>)}</div>
      <div className="planner-grid">{Array.from({ length: 12 }, (_, month) => {
        const monthDate = new Date(year, month, 1)
        const daysInMonth = new Date(year, month + 1, 0).getDate()
        return <div className={`planner-month season-${month}`} key={month}>
          <button className="planner-month-name" type="button" onClick={() => { setViewDate(monthDate); setViewMode('month') }}>{monthFormatter.format(monthDate).slice(0, 3).toUpperCase()}</button>
          {Array.from({ length: 31 }, (_, index) => {
            const day = index + 1
            if (day > daysInMonth) return <span className="planner-day invalid" key={day} />
            const date = new Date(year, month, day)
            const key = dateKey(date)
            const episodes = episodeEntries[key] ?? []
            const future = key > todayKey
            return <button className={`planner-day ${episodes.length ? 'watched series-watched' : ''}`} key={day} type="button" disabled={future} aria-label={`${fullDateFormatter.format(date)}, ${episodes.length} episodes`} onClick={() => { setSeriesDayDate(date); setViewMode('day') }}>{episodes.length > 0 && <span>{episodes.length}</span>}</button>
          })}
        </div>
      })}</div>
    </section>
  }

  function renderSeriesDay() {
    const day = seriesDayDate && dateKey(seriesDayDate) <= todayKey ? seriesDayDate : today
    const key = dateKey(day)
    const episodes = episodeEntries[key] ?? []
    const tr = language === 'tr'
    const groups = new Map<number, { series: TvSeries; entries: Array<{ entry: EpisodeEntry; index: number }> }>()
    episodes.forEach((entry, index) => {
      if (!groups.has(entry.series.id)) groups.set(entry.series.id, { series: entry.series, entries: [] })
      groups.get(entry.series.id)!.entries.push({ entry, index })
    })
    const remaining = seriesLibrary.filter((item) => item.status === 'watching' && !groups.has(item.series.id))
    const code = (season: number, episode: number) => `S${String(season).padStart(2, '0')} E${String(episode).padStart(2, '0')}`
    const selectDay = (date: Date) => { flushEpisodeNote(); setEpisodeNoteTarget(null); setSeriesDayDate(date) }
    const nextButton = (item: SeriesLibraryItem) => {
      const next = nextEpisode(item)
      return next ? <button className="daily-next" type="button" disabled={episodeMutationPending} onClick={() => { flushEpisodeNote(); setEpisodeNoteTarget(null); void markNextEpisode(item, day) }}>
        <span aria-hidden="true">＋</span>{tr ? `${code(next.season, next.episode)}’yı izledim` : `Watched ${code(next.season, next.episode)}`}
      </button> : <span className="daily-caught-up">{tr ? 'Tüm bölümler izlendi' : 'All caught up'}</span>
    }
    return <section className="daily-journal" aria-label={tr ? 'Dizi günlüğü' : 'Series day journal'}>
      <DayJournalHeader day={day} today={today} language={language} summary={tr ? `${episodes.length} bölüm · ${groups.size} dizi` : `${episodes.length} episodes · ${groups.size} series`} hasEntry={(date) => Boolean(episodeEntries[date]?.length)} onSelect={selectDay} />
      <div className="daily-content">
        {dayUndo?.key === key && <div className="daily-undo" role="status"><span>{dayUndo.entry.series.title} · {code(dayUndo.entry.season_number, dayUndo.entry.episode_number)} {tr ? 'eklendi' : 'logged'}</span><button type="button" disabled={episodeMutationPending} onClick={() => void undoDayEpisode()}>{tr ? 'Geri al' : 'Undo'}</button></div>}
        {!episodes.length && <div className="daily-empty"><span className="daily-empty-symbol" aria-hidden="true">＋</span><h3>{tr ? 'Bugünün hikâyesi henüz boş.' : 'A little space for your watch story.'}</h3><p>{tr ? 'İzlediğin bir bölümü ekleyerek bu günü hatırla.' : 'Remember this day with an episode you watched.'}</p>{!remaining.length && <button className="daily-primary" type="button" onClick={() => openSeriesPicker()}>{tr ? 'Dizi ekle' : 'Add a series'} <span aria-hidden="true">＋</span></button>}</div>}
        <div className="daily-series-list">{Array.from(groups.values()).map((group) => {
          const item = seriesLibrary.find((value) => value.series.id === group.series.id)
          const active = group.entries.find(({ index }) => episodeNoteTarget?.watchedDate === key && episodeNoteTarget.index === index)
          return <article className="daily-series-card" key={group.series.id} aria-label={group.series.title}>
            <div className="daily-series-title"><JournalPoster item={group.series} /><div><p className="daily-eyebrow">{tr ? 'İZLENDİ' : 'WATCHED'}</p><h3>{group.series.title}</h3><p>{group.entries.length} {tr ? 'bölüm' : 'episodes'}</p></div></div>
            <div className="daily-episode-chips">{group.entries.map(({ entry, index }) => <button type="button" key={index} aria-expanded={active?.index === index} aria-controls={active?.index === index ? `day-note-${group.series.id}` : undefined} onClick={() => { flushEpisodeNote(); if (active?.index === index) setEpisodeNoteTarget(null); else openEpisodeNote(key, index, entry) }}><span aria-hidden="true">✓</span>{code(entry.season_number, entry.episode_number)}{entry.note && <i aria-label={tr ? 'Not var' : 'Has a note'} />}</button>)}</div>
            {active && <div className="daily-inline-note" id={`day-note-${group.series.id}`}><label><span>{code(active.entry.season_number, active.entry.episode_number)} · {tr ? 'BÖLÜM NOTUN' : 'YOUR EPISODE NOTE'}</span><textarea autoFocus value={episodeNoteDraft} onBlur={flushEpisodeNote} onChange={(event) => { setEpisodeNoteDraft(event.target.value); setEpisodeNoteFeedback('Saving…') }} placeholder={tr ? 'Bu bölümden aklında ne kaldı?' : 'What stayed with you from this episode?'} /></label><div><span role="status">{episodeNoteFeedback === 'Saving…' ? tr ? 'Kaydediliyor…' : 'Saving…' : episodeNoteFeedback.startsWith('Could not') ? tr ? 'Kaydedilemedi. Yeniden dene.' : 'Could not save. Try again.' : tr ? 'Otomatik kaydedilir' : 'Saves automatically'}</span><button className="daily-remove" type="button" disabled={episodeMutationPending} onClick={() => { setEpisodeNoteTarget(null); setDayUndo(null); void removeLoggedEpisode(day, active.entry, active.index) }}>{tr ? 'Bu kaydı kaldır' : 'Remove this entry'}</button></div></div>}
            {item && <footer className="daily-card-footer">{nextButton(item)}</footer>}
          </article>
        })}</div>
        {remaining.length > 0 && <section className="daily-continue"><div className="daily-section-heading"><h3>{tr ? 'Kaldığın yerden' : 'Pick up where you left off'}</h3><span>{tr ? 'BU GÜNE EKLE' : 'LOG FOR THIS DAY'}</span></div>{remaining.map((item) => <article key={item.series.id}><JournalPoster item={item.series} /><div><h4>{item.series.title}</h4>{nextButton(item)}</div></article>)}</section>}
      </div>
    </section>
  }

  function renderSeriesDetail() {
    if (!selectedSeriesItem) return null
    const item = selectedSeriesItem
    const history = Object.entries(episodeEntries).flatMap(([watchedDate, entries]) => entries.map((entry, index) => ({ watchedDate, entry, index })))
      .filter(({ entry }) => entry.series.id === item.series.id)
      .sort((a, b) => b.watchedDate.localeCompare(a.watchedDate) || b.entry.season_number - a.entry.season_number || b.entry.episode_number - a.entry.episode_number)
    const upcoming = upcomingEpisodes(item)
    const next = nextEpisode(item)
    const watched = watchedEpisodeCount(item)
    const total = item.series.seasons.filter((season) => season.season_number > 0).reduce((sum, season) => sum + season.episode_count, 0) || item.series.number_of_episodes
    const progress = total > 0 ? Math.min(100, Math.round(watched / total * 100)) : 0
    const noteChanged = seriesNoteDraft.trim() !== (item.note ?? '')
    const validLogDate = /^\d{4}-\d{2}-\d{2}$/.test(seriesLogDate) && seriesLogDate <= todayKey && !Number.isNaN(new Date(`${seriesLogDate}T12:00:00`).getTime())
    const episodeCode = (season: number, episode: number) => `S${String(season).padStart(2, '0')} E${String(episode).padStart(2, '0')}`
    return <div className="dialog-backdrop series-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog() }}>
      <section ref={seriesDialogRef} tabIndex={-1} className="series-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="series-detail-title" onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled)'))
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }}>
        <div className="series-detail-topbar"><span>YOUR SERIES JOURNAL</span><button className="series-detail-close" type="button" onClick={closeDialog} aria-label="Close series details">×</button></div>
        <div className="series-detail-content">
          <header className="series-detail-hero">
            <div className="series-detail-poster">{item.series.poster_path && !seriesPosterFailed ? <img src={`${IMAGE_URL}${item.series.poster_path}`} alt="" onError={() => setSeriesPosterFailed(true)} /> : <span aria-hidden="true">{item.series.title.slice(0, 2).toUpperCase()}</span>}</div>
            <div className="series-detail-summary">
              <p className="dialog-kicker">SERIES DETAILS</p><h2 id="series-detail-title">{item.series.title}</h2>
              <p className="series-detail-meta">{[item.series.release_date?.slice(0, 4), `${item.series.number_of_seasons || item.series.seasons.length} seasons`, ...item.series.genres.slice(0, 2).map((genre) => genre.name)].filter(Boolean).join(' · ')}</p>
              <div className="series-progress-heading"><span><strong>{watched}</strong>{total > 0 ? ` / ${total}` : ''} episodes watched</span>{total > 0 && <span>{progress}%</span>}</div>
              {total > 0 && <progress className="series-progress" value={Math.min(watched, total)} max={total} aria-label="Series watch progress" />}
            </div>
            <div className="series-detail-status"><div className="series-status-control"><span>STATUS</span><SeriesStatusPicker value={item.status} onChange={(status) => updateSeriesStatus(item, status)} label="STATUS" /></div>{item.status === 'dropped' && <small className="series-status-help">Dropped series stay in Library but leave Continue Watching.</small>}</div>
          </header>
          <section className="series-next-card" aria-label="Log next episode">
            <div className="series-next-icon" aria-hidden="true">{next ? '▷' : '✓'}</div>
            <div className="series-next-copy"><p>{next ? 'UP NEXT' : 'ALL CAUGHT UP'}</p><h3>{next ? episodeCode(next.season, next.episode) : 'Every episode, checked off.'}</h3><span>{next ? `Season ${next.season} · Episode ${next.episode}${item.series.episode_run_time[0] ? ` · ${item.series.episode_run_time[0]} min` : ''}` : 'Your watch history and notes are right here.'}</span></div>
            {next && <div className="series-detail-log"><label><span>WATCHED ON</span><input type="date" aria-label="Watched on" value={seriesLogDate} max={todayKey} onChange={(event) => setSeriesLogDate(event.target.value)} /></label>
              <button type="button" disabled={seriesLogging || (item.status === 'watching' && !validLogDate)} onClick={async () => {
                setSeriesLogging(true)
                try {
                  if (item.status !== 'watching') await updateSeriesStatus(item, 'watching')
                  else { await markNextEpisode(item, new Date(`${seriesLogDate}T12:00:00`)); setEpisodeListView('watched') }
                } finally { setSeriesLogging(false) }
              }}>{seriesLogging ? 'Saving…' : item.status !== 'watching' ? 'Resume watching' : <><span aria-hidden="true">✓</span> Mark as watched</>}</button>
            </div>}
          </section>
          <div className="series-detail-columns">
            <section className="series-episodes-panel" aria-label="Episodes">
              <div className="series-episode-tabs" role="group" aria-label="Episode list"><button type="button" aria-pressed={episodeListView === 'watched'} onClick={() => setEpisodeListView('watched')}>Watched <span>{history.length}</span></button><button type="button" aria-pressed={episodeListView === 'upcoming'} onClick={() => setEpisodeListView('upcoming')}>Upcoming <span>{upcoming.length}</span></button></div>
              <p className="series-list-caption">{episodeListView === 'watched' ? 'Your watch history, most recent first.' : 'A preview of your next episodes.'}</p>
              {episodeListView === 'watched' ? history.length ? <div className="series-history-list">{history.map(({ watchedDate, entry, index }) => {
                const editing = episodeNoteTarget?.watchedDate === watchedDate && episodeNoteTarget.index === index
                return <article key={`${watchedDate}-${entry.season_number}-${entry.episode_number}-${index}`}><span className="series-watched-check" aria-hidden="true">✓</span><div className="series-history-copy"><strong>{episodeCode(entry.season_number, entry.episode_number)}</strong><span>{entry.episode_name} <i>·</i> <time dateTime={watchedDate}>{new Date(`${watchedDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</time></span></div><button type="button" aria-expanded={editing} onClick={() => openEpisodeNote(watchedDate, index, entry)}>{entry.note ? 'EDIT NOTE' : '+ NOTE'}</button>{entry.note && <p>{entry.note}</p>}</article>
              })}</div> : <div className="series-detail-empty"><strong>Your story starts here.</strong><p>Mark your first episode as watched to start your journal.</p></div> : upcoming.length ? <div className="series-upcoming-list">{upcoming.map((episode, index) => <article className={index === 0 ? 'next' : ''} key={`${episode.season}-${episode.episode}`}><span aria-hidden="true">{index === 0 ? '▷' : String(index + 1).padStart(2, '0')}</span><div><strong>{episodeCode(episode.season, episode.episode)}</strong><small>Season {episode.season} · Episode {episode.episode}</small></div>{index === 0 && <b>UP NEXT</b>}</article>)}</div> : <div className="series-detail-empty"><strong>You're all caught up.</strong><p>No more episodes to watch right now.</p></div>}
            </section>
            <section className="series-general-note" aria-labelledby="series-note-label"><div className="series-note-heading"><span aria-hidden="true">✎</span><h3 id="series-note-label">Series notes</h3><SaveIndicator saving={seriesNoteSaving || seriesNoteFeedback === 'Saving…' || noteChanged} failed={seriesNoteFeedback.startsWith('Could not')} /></div><p>Your thoughts on the bigger picture.</p><textarea aria-labelledby="series-note-label" value={seriesNoteDraft} onChange={(event) => { setSeriesNoteDraft(event.target.value); setSeriesNoteFeedback('Saving…') }} placeholder="What do you think about the series overall?" /></section>
          </div>
        </div>
      </section>
    </div>
  }
  function renderSeriesDashboard() {
    const statuses: SeriesStatus[] = ['watching', 'waiting', 'completed', 'dropped']
    const watching = seriesLibrary.filter((item) => item.status === 'watching')
    const filters: Array<{ value: SeriesStatus | 'all'; label: string; count: number }> = [
      { value: 'all', label: 'All series', count: seriesLibrary.length },
      ...statuses.map((status) => ({ value: status, label: SERIES_STATUS_LABELS[status], count: seriesLibrary.filter((item) => item.status === status).length })),
    ]
    const renderSeriesItems = (items: SeriesLibraryItem[]) => items.length ? <div className="series-compact-list">{items.map((item) => {
      const next = nextEpisode(item)
      return <article key={item.series.id}><img src={`${IMAGE_URL}${item.series.poster_path}`} alt="" /><div><strong>{item.series.title}</strong><small>{next ? `NEXT · S${String(next.season).padStart(2, '0')} E${String(next.episode).padStart(2, '0')}` : `${watchedEpisodeCount(item)} EPISODES · COMPLETE`}</small></div><SeriesStatusPicker compact value={item.status} onChange={(status) => updateSeriesStatus(item, status)} label={`Status for ${item.series.title}`} /><button type="button" onClick={() => removeTrackedSeries(item)} aria-label={`Remove ${item.series.title}`}>×</button></article>
    })}</div> : <p className="series-filter-empty">No series in this status.</p>
    return <div className="series-dashboard">
      <aside className="series-sidebar">
        <section className="series-sidebar-section"><div className="series-sidebar-label"><p>CONTINUE WATCHING</p><span>{watching.length}</span></div>
          {watching.length ? <div className="series-continue-list">{watching.map((item) => {
            const next = nextEpisode(item)
            return <button type="button" key={item.series.id} onClick={() => openSeriesDetail(item)} aria-label={`Open details for ${item.series.title}`}><img src={`${IMAGE_URL}${item.series.poster_path}`} alt="" /><span><strong>{item.series.title}</strong><small>{next ? `S${String(next.season).padStart(2, '0')} E${String(next.episode).padStart(2, '0')}` : 'ALL CAUGHT UP'}</small></span><i>›</i></button>
          })}</div> : <button className="series-sidebar-empty" type="button" onClick={() => openSeriesPicker('library')}>Add a series to begin →</button>}
        </section>
        <section className="series-sidebar-section series-watchlist"><div className="series-sidebar-label"><p>WATCHLIST</p><button type="button" onClick={() => openSeriesPicker('watchlist')} aria-label="Add series to watchlist">＋</button></div>
          {seriesWatchlist.length ? <div className="sidebar-list series-watchlist-list">{seriesWatchlist.map((series) => <MovieLink key={mediaKey(series)} movie={series} action={() => toggleWatchlist(series)} />)}</div> : <button className="series-sidebar-empty" type="button" onClick={() => openSeriesPicker('watchlist')}>Add something to watch later →</button>}
        </section>
        <section className="series-sidebar-section series-library-compact"><div className="series-sidebar-label"><p>LIBRARY</p><button type="button" onClick={() => openSeriesPicker('library')} aria-label="Add series">＋ ADD SERIES</button></div>
          <div className="series-status-list" role="group" aria-label="Filter series library">{filters.map((filter) => {
            const isActive = seriesFilter === filter.value
            const items = filter.value === 'all' ? seriesLibrary : seriesLibrary.filter((item) => item.status === filter.value)
            const statusMeta = filter.value === 'all' ? { icon: '▦', tone: 'neutral' } : SERIES_STATUS_META[filter.value]
            return <div className="series-status-group" key={filter.value}><button type="button" className={isActive ? 'active' : ''} aria-expanded={isActive} onClick={() => setSeriesFilter((current) => current === filter.value ? null : filter.value)}><span className={`status-category tone-${statusMeta.tone}`}><i aria-hidden="true">{statusMeta.icon}</i>{filter.label}</span><strong>{filter.count}</strong></button>{isActive && renderSeriesItems(items)}</div>
          })}</div>
        </section>
      </aside>
      {viewMode === 'month' ? renderSeriesCalendar() : viewMode === 'year' ? renderSeriesYear() : renderSeriesDay()}
    </div>
  }

  function renderYear() {
    const yearEntries = Object.keys(entries).filter((key) => key.startsWith(String(viewDate.getFullYear()))).length
    return <section className="year-view" aria-label={`${viewDate.getFullYear()} yearly view`}>
      <header className="year-summary"><div><p>YEAR PLANNER</p><h2>{viewDate.getFullYear()}</h2></div><div><strong>{yearEntries}</strong><span>TOTAL ENTRIES</span></div></header>
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
    const tr = language === 'tr'
    return <section className="daily-journal" aria-label={tr ? 'Film günlüğü' : 'Film day journal'}>
      <DayJournalHeader day={day} today={today} language={language} summary={entry ? tr ? '1 film kaydı' : '1 film remembered' : tr ? 'Henüz film eklenmedi' : 'An unwritten day'} hasEntry={(key) => Boolean(entries[key])} onSelect={openEditor} />
      <div className="daily-content">
        {entry ? <article className="daily-film"><JournalPoster key={entry.movie.id} item={entry.movie} /><div className="daily-film-copy"><p className="daily-eyebrow">{tr ? 'GÜNÜN FİLMİ' : 'THE FILM OF THE DAY'}</p><h3>{entry.movie.title}</h3><p className="daily-film-meta">{entry.movie.release_date?.slice(0, 4)} · TMDB {entry.movie.vote_average.toFixed(1)}</p><JournalEditor language={language} comment={commentDraft} rating={ratingDraft} saved={isSaved} onComment={(value) => { setCommentDraft(value); setIsSaved(false) }} onRating={(value) => { setRatingDraft(value); setIsSaved(false) }} onSave={saveJournalEntry} /></div></article>
        : <><div className="daily-empty"><span className="daily-empty-symbol" aria-hidden="true">＋</span><h3>{tr ? 'Bu güne bir film bırak.' : 'Give this day a film to remember.'}</h3><p>{tr ? 'Bir film, birkaç kelime. Hatırlamak için yeterli.' : 'A film, a few words. Something to look back on.'}</p><button className="daily-primary" type="button" onClick={() => openDay(day)}>{tr ? 'Film ekle' : 'Add a film'} <span aria-hidden="true">＋</span></button></div>
        {showMovieSearch && <div className="daily-search"><div className="search-form" role="search"><SearchIcon /><input ref={searchInputRef} value={query} onChange={(event) => updateSearchQuery(event.target.value)} placeholder={tr ? 'Film ara…' : 'Search films…'} aria-label={tr ? 'Film adı' : 'Movie title'} /><span className="search-form-status" role="status">{isSearching ? tr ? 'ARANIYOR…' : 'SEARCHING…' : query.trim().length < 2 ? tr ? 'EN AZ 2 KARAKTER' : 'TYPE 2+ CHARACTERS' : tr ? 'SONUÇLAR' : 'RESULTS'}</span></div>{error && <p role="alert">{error}</p>}<div className="daily-watchlist" aria-live="polite">{results.map((movie) => <button type="button" key={mediaKey(movie)} onClick={() => void chooseMovie(movie)}><JournalPoster item={movie} /><strong>{movie.title}</strong><small>{movie.release_date?.slice(0, 4)}</small></button>)}</div></div>}
        {movieWatchlist.length > 0 && <section className="daily-watchlist-section"><div className="daily-section-heading"><h3>{tr ? 'İzleme listenden' : 'From your watchlist'}</h3><span>{tr ? 'BİRİNİ İZLEDİN Mİ?' : 'WATCHED ONE OF THESE?'}</span></div><div className="daily-watchlist">{movieWatchlist.slice(0, 4).map((movie) => <button type="button" key={mediaKey(movie)} aria-label={tr ? `${movie.title} filmini bu güne ekle` : `Log ${movie.title} for this day`} onClick={() => void chooseMovie(movie)}><JournalPoster item={movie} /><strong>{movie.title}</strong><small>{movie.release_date?.slice(0, 4)}</small></button>)}</div></section>}</>}
      </div>
    </section>
  }

  return <main className="app-shell">
    <header className="site-header">
      <a className="brand" href="/" aria-label="Reelendar home"><img className="brand-mark" src="/assets/reelendar-icon.png" alt="" /><span>REELENDAR</span></a>
      <MediaModeToggle value={contentMode} onChange={changeContentMode} language={language} />
      <div className="header-actions">
        {session === undefined
          ? <span className="auth-loading">CONNECTING…</span>
          : session
            ? <button className="profile-button" type="button" onClick={() => setSettingsOpen(true)} title={session.user.email} aria-label="Open profile">
              <ProfileAvatar session={session} />
            </button>
            : <button className="auth-button" type="button" onClick={() => window.location.assign('/login')}>{copy.signIn}</button>}
      </div>
    </header>

    {toastMessage && <ToastNotice message={toastMessage} onDismiss={() => setToastMessage('')} />}
    {syncMessage && <button className={`sync-status ${cloudLoading ? 'loading' : ''}`} type="button" onClick={() => setSyncMessage('')} aria-label={`${syncMessage} Dismiss`}>{syncMessage}</button>}

    <div className="mode-content" key={contentMode}>
    <section className={`hero ${contentMode === 'tv' ? 'series-hero' : ''}`} id="top">
      {contentMode === 'movie'
        ? <><div><p className="eyebrow"><span /> {copy.filmDiary} · {viewDate.getFullYear()}</p><h1>{copy.filmQuestion}</h1></div><nav className="view-switcher hero-view-switcher" aria-label="Film calendar view">{(['month', 'year', 'day'] as ViewMode[]).map((mode) => <button key={mode} className={viewMode === mode ? 'active' : ''} onClick={() => changeView(mode)}>{copy[mode]}</button>)}</nav><div className="hero-copy"><div className="stats" aria-label="Calendar statistics"><span><strong>{Object.keys(entries).length}</strong> {copy.filmsLogged}</span><span><strong>{Object.keys(entries).length}</strong> {copy.daysRemembered}</span></div></div></>
        : <><div><p className="eyebrow"><span /> {copy.seriesDiary} · {viewDate.getFullYear()}</p><h1>{copy.seriesQuestion}</h1></div><nav className="view-switcher hero-view-switcher" aria-label="Series calendar view">{(['month', 'year', 'day'] as ViewMode[]).map((mode) => <button key={mode} className={viewMode === mode ? 'active' : ''} onClick={() => changeView(mode)}>{copy[mode]}</button>)}</nav><div className="hero-copy"><div className="stats" aria-label="Series statistics"><span><strong>{Object.values(episodeEntries).flat().length}</strong> {copy.episodesLogged}</span><span><strong>{seriesLibrary.length}</strong> {copy.seriesTracked}</span></div></div></>}
    </section>

    <div className={`dashboard-layout ${contentMode === 'tv' ? 'series-layout' : ''}`}>
      {contentMode === 'movie' && <aside className="discovery-sidebar">
        <section><div className="sidebar-heading"><p>{copy.yourList}</p><span>{movieWatchlist.length}</span></div><div className="sidebar-title-row"><h2>{copy.watchlist}</h2><button type="button" onClick={openWatchlistPicker} aria-label="Add a title to watchlist">+</button></div>
          <div className="sidebar-list film-watchlist-list">{movieWatchlist.map((movie) => <MovieLink key={mediaKey(movie)} movie={movie} action={() => toggleWatchlist(movie)} />)}</div>
        </section>
        <section><div className="sidebar-heading"><p>{copy.inCinemas}</p><span>05</span></div><h2>{copy.thisMonth}</h2>
          <div className="sidebar-list">{releases.length ? releases.map((movie) => <MovieLink key={mediaKey(movie)} movie={movie} />) : <p className="sidebar-empty">No release data available for this month.</p>}</div>
        </section>
      </aside>}
      <div className="primary-view">{contentMode === 'tv' ? renderSeriesDashboard() : viewMode === 'month' ? renderCalendar() : viewMode === 'year' ? renderYear() : renderDay()}</div>
    </div>
    </div>

    <footer><p>YOUR LIFE, <em>FRAME BY FRAME.</em></p><div className="footer-meta"><strong>DESIGNED &amp; BUILT BY FATMA NUR ISKAL</strong><span>Film and TV data &amp; imagery by TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</span></div></footer>

    {noteDate && noteEntry && <aside className={`note-panel ${noteClosing ? 'closing' : ''}`} aria-live="polite">
      <div className="note-paper">
        <button className="note-close" type="button" onClick={closeNote} aria-label="Close note">×</button>
        <button className="note-edit" type="button" onClick={() => openEditor(noteDate)} aria-label={`Edit note for ${noteEntry.movie.title}`}>EDIT</button>
        <p className="note-date">{fullDateFormatter.format(noteDate).toUpperCase()}</p>
        <h2>{noteEntry.movie.title}</h2>
        <div className="note-rating" aria-label={`Your rating ${noteEntry.rating || 0} out of 5`}><span>{noteEntry.rating ? `${noteEntry.rating}/5` : 'NOT RATED'}</span>{noteEntry.rating > 0 && <strong>{Array.from({ length: 5 }, (_, index) => <i key={index} className={noteEntry.rating >= index + 1 ? 'full' : noteEntry.rating >= index + .5 ? 'half' : ''}>✦</i>)}</strong>}</div>
        <p className={`handwritten-note ${noteEntry.comment ? '' : 'empty'}`}>{noteEntry.comment || 'No note was written for this title.'}</p>
        <small>REELENDAR · DAILY NOTE</small>
      </div>
    </aside>}

    {episodeNoteTarget && activeEpisodeNoteEntry && !(viewMode === 'day' && selectedSeriesId === null) && <aside className="note-panel series-note-paper-panel" aria-live="polite" aria-label={`Notes for ${activeEpisodeNoteEntry.series.title}`}>
      <div className="note-paper series-note-paper">
        <button className="note-close" type="button" onClick={() => { flushEpisodeNote(); flushSeriesNote(); setEpisodeNoteTarget(null); setEpisodeNoteFeedback('') }} aria-label="Close series note">×</button>
        <p className="note-date">{new Date(`${episodeNoteTarget.watchedDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</p>
        <h2>{activeEpisodeNoteEntry.series.title}</h2>
        <p className="series-note-episode-code">S{String(activeEpisodeNoteEntry.season_number).padStart(2, '0')} E{String(activeEpisodeNoteEntry.episode_number).padStart(2, '0')} · {activeEpisodeNoteEntry.episode_name}</p>
        <div className="series-note-tabs" role="group" aria-label="Choose note scope">
          <button type="button" aria-pressed={episodeNoteMode === 'episode'} onClick={() => { flushSeriesNote(); setEpisodeNoteMode('episode') }}>EPISODE NOTE</button>
          <button type="button" aria-pressed={episodeNoteMode === 'series'} disabled={!activeNoteSeriesItem} onClick={() => { flushEpisodeNote(); setEpisodeNoteMode('series'); setSeriesNoteDraft(activeNoteSeriesItem?.note ?? '') }}>SERIES NOTE</button>
        </div>
        {episodeNoteMode === 'episode'
          ? <label className="series-paper-field"><span>WHAT DID YOU THINK?</span><textarea value={episodeNoteDraft} onChange={(event) => { setEpisodeNoteDraft(event.target.value); setEpisodeNoteFeedback('Saving…') }} placeholder="Write what stayed with you from this episode…" autoFocus /><SaveIndicator saving={episodeNoteFeedback === 'Saving…'} failed={episodeNoteFeedback.startsWith('Could not')} /></label>
          : <label className="series-paper-field"><span>THE BIGGER PICTURE</span><textarea value={seriesNoteDraft} onChange={(event) => { setSeriesNoteDraft(event.target.value); setSeriesNoteFeedback('Saving…') }} placeholder="What do you think about the series overall?" autoFocus /><SaveIndicator saving={seriesNoteSaving || seriesNoteFeedback === 'Saving…'} failed={seriesNoteFeedback.startsWith('Could not')} /></label>}
        <small>REELENDAR · SERIES NOTES</small>
      </div>
    </aside>}

    {selectedDate && viewMode !== 'day' && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog() }}>
      <section className="movie-dialog add-media-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <button className="close-button" type="button" onClick={closeDialog} aria-label="Close dialog">×</button>
        <div className="picker-heading"><span aria-hidden="true">{showMovieSearch ? '＋' : '✦'}</span><div><p className="dialog-kicker">{fullDateFormatter.format(selectedDate).toUpperCase()}</p><h2 id="dialog-title">{showMovieSearch ? selectedEntry ? 'Choose another title' : 'Add to your diary' : selectedEntry?.movie.title}</h2></div></div>
        {selectedEntry && !showMovieSearch && <><div className="selected-film-summary"><img src={`${IMAGE_URL}${selectedEntry.movie.poster_path}`} alt="" /><JournalEditor comment={commentDraft} rating={ratingDraft} saved={isSaved} onComment={(value) => { setCommentDraft(value); setIsSaved(false) }} onRating={(value) => { setRatingDraft(value); setIsSaved(false) }} onSave={saveJournalEntry} /></div><button className="movie-search-back" type="button" onClick={returnToMovieSearch}>← BACK TO SEARCH</button></>}
        {showMovieSearch && <><p className="dialog-intro">Search TMDB and choose the poster you want to remember this day by.</p><div className="search-form" role="search"><SearchIcon /><input ref={searchInputRef} value={query} onChange={(event) => updateSearchQuery(event.target.value)} placeholder="Search films…" aria-label="Movie title" /><span className="search-form-status" aria-live="polite">{isSearching ? 'SEARCHING…' : query.trim().length < 2 ? 'TYPE 2+ CHARACTERS' : 'AUTO SEARCH'}</span></div>{error && <p className="status-message" role="alert">{error}</p>}<div className="movie-results" aria-live="polite">{results.map((movie) => <article key={mediaKey(movie)} className="movie-card"><button type="button" className="movie-select" onClick={() => chooseMovie(movie)}><img src={`${IMAGE_URL}${movie.poster_path}`} alt={`${movie.title} poster`} /><span className="movie-card-copy"><strong>{movie.title}</strong><span>{movie.release_date?.slice(0, 4) || 'Year unknown'} · {movie.vote_average.toFixed(1)} ★</span></span></button><button className="watchlist-toggle" type="button" onClick={() => toggleWatchlist(movie)}>{watchlist.some((item) => mediaKey(item) === mediaKey(movie)) ? '− LIST' : '+ LIST'}</button></article>)}</div></>}
      </section>
    </div>}

    {deleteTarget && entries[dateKey(deleteTarget)] && <div className="dialog-backdrop confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null) }}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
        <p className="dialog-kicker">REMOVE ENTRY</p><h2 id="confirm-title">Are you sure?</h2><p id="confirm-description">This will remove <strong>{entries[dateKey(deleteTarget)].movie.title}</strong> and its journal note from {fullDateFormatter.format(deleteTarget)}.</p>
        <div><button type="button" onClick={() => setDeleteTarget(null)}>CANCEL</button><button className="confirm-delete" type="button" onClick={confirmDelete}>DELETE ENTRY</button></div>
      </section>
    </div>}

    {watchlistPickerOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog() }}>
      <section className="movie-dialog watchlist-dialog add-media-dialog" role="dialog" aria-modal="true" aria-labelledby="watchlist-dialog-title">
        <button className="close-button" type="button" onClick={closeDialog} aria-label="Close dialog">×</button>
        <div className="picker-heading"><span aria-hidden="true">＋</span><div><p className="dialog-kicker">YOUR NEXT FRAME</p><h2 id="watchlist-dialog-title">Add to watchlist</h2></div></div>
        <p className="dialog-intro">Search TMDB and keep films or series you want to watch close.</p>
        <div className="search-form" role="search"><SearchIcon /><input value={query} onChange={(event) => updateSearchQuery(event.target.value)} placeholder="Search films…" aria-label="Watchlist movie title" autoFocus /><span className="search-form-status" aria-live="polite">{isSearching ? 'SEARCHING…' : query.trim().length < 2 ? 'TYPE 2+ CHARACTERS' : 'AUTO SEARCH'}</span></div>
        {error && <p className="status-message" role="alert">{error}</p>}
        <div className="watchlist-picker-results">{results.map((movie) => <button type="button" key={mediaKey(movie)} className={watchlist.some((item) => mediaKey(item) === mediaKey(movie)) ? 'added' : ''} onClick={() => toggleWatchlist(movie)}><img src={`${IMAGE_URL}${movie.poster_path}`} alt="" /><span><strong>{movie.title}</strong><small>{watchlist.some((item) => mediaKey(item) === mediaKey(movie)) ? 'ADDED ✓' : `+ ADD ${mediaLabel(movie).toUpperCase()}`}</small></span></button>)}</div>
      </section>
    </div>}

    {seriesPickerOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog() }}>
      <section className="movie-dialog series-picker-dialog add-media-dialog" role="dialog" aria-modal="true" aria-labelledby="series-picker-title">
        <button className="close-button" type="button" onClick={closeDialog} aria-label="Close dialog">×</button>
        <div className="picker-heading"><span aria-hidden="true">＋</span><div><p className="dialog-kicker">{seriesPickerTarget === 'watchlist' ? 'SERIES WATCHLIST' : 'SERIES LIBRARY'}</p><h2 id="series-picker-title">{seriesPickerTarget === 'watchlist' ? 'Add to watchlist' : 'Add a series'}</h2></div></div>
        <p className="dialog-intro">{seriesPickerTarget === 'watchlist' ? 'Save a series for later without adding it to your active tracker.' : 'Add a show once, then log each episode on the day you watched it.'}</p>
        <div className="search-form" role="search"><SearchIcon /><input value={seriesQuery} onChange={(event) => setSeriesQuery(event.target.value)} placeholder="Search series…" aria-label="Series title" autoFocus /><span className="search-form-status">{seriesSearching ? 'SEARCHING…' : 'TMDB'}</span></div>
        {error && <p className="status-message" role="alert">{error}</p>}
        <div className="movie-results">{seriesResults.map((series) => {
          const isWatchlisted = watchlist.some((item) => mediaKey(item) === mediaKey(series))
          return <article className="movie-card" key={series.id}><button className="movie-select" type="button" onClick={() => seriesPickerTarget === 'watchlist' ? toggleWatchlist(series) : addSeriesToLibrary(series)}><img src={`${IMAGE_URL}${series.poster_path}`} alt={`${series.title} poster`} /><span className="movie-card-copy"><strong>{series.title}</strong><span>{series.release_date?.slice(0, 4) || 'Year unknown'} · {series.vote_average.toFixed(1)} ★</span></span></button>{seriesPickerTarget === 'library' && <button className="watchlist-toggle" type="button" onClick={() => toggleWatchlist(series)}>{isWatchlisted ? '− WATCHLIST' : '+ WATCHLIST'}</button>}</article>
        })}</div>
      </section>
    </div>}

    {renderSeriesDetail()}

    {settingsOpen && session && <AccountSettings session={session} entries={entries} watchlist={watchlist} seriesLibrary={seriesLibrary} episodeEntries={episodeEntries} language={language} onLanguageChange={setLanguage} onClose={closeDialog} />}

  </main>
}

function AccountSettings({ session, entries, watchlist, seriesLibrary, episodeEntries, language, onLanguageChange, onClose }: {
  session: Session
  entries: Record<string, DiaryEntry>
  watchlist: MediaItem[]
  seriesLibrary: SeriesLibraryItem[]
  episodeEntries: Record<string, EpisodeEntry[]>
  language: AppLanguage
  onLanguageChange: (language: AppLanguage) => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview')
  const [analyticsMode, setAnalyticsMode] = useState<MediaType>('movie')
  const [noteFilter, setNoteFilter] = useState<'all' | MediaType>('all')
  const [movieDetails, setMovieDetails] = useState<Record<number, MovieAnalyticsDetail>>({})
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const initialEmotion = isProfileEmotion(session.user.user_metadata.profile_face) ? session.user.user_metadata.profile_face : PROFILE_FACES[0].emotion
  const [selectedEmotion, setSelectedEmotion] = useState<ProfileEmotion>(initialEmotion)
  const [selectedColor, setSelectedColor] = useState(String(session.user.user_metadata.profile_color ?? PROFILE_FACES[0].color))
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmation, setConfirmation] = useState<AccountConfirmation | null>(null)
  const currentYear = new Date().getFullYear()
  const locale = language === 'tr' ? 'tr-TR' : 'en-US'
  const labels = language === 'tr' ? {
    profile: 'PROFİL MERKEZİ', title: 'İzleme hikâyen', overview: 'Genel bakış', notes: 'Tüm notlar', settings: 'Ayarlar',
    films: 'Filmler', series: 'Diziler', thisYear: 'BU YIL', totalHours: 'TOPLAM SÜRE', topGenre: 'EN ÇOK İZLENEN TÜR', average: 'ORTALAMA PUAN', activeDays: 'AKTİF GÜN',
    episodes: 'BÖLÜM', tracked: 'TAKİP EDİLEN', completed: 'TAMAMLANAN', watchlist: 'İZLEME LİSTESİ', noData: 'Bu görünüm için henüz yeterli veri yok.',
    noNotes: 'Henüz kaydedilmiş bir not yok.', appearance: 'Profil simgesi', appearanceHint: 'Seni temsil eden yüzü ve yumuşak rengi seç.',
    language: 'Dil', signOut: 'ÇIKIŞ YAP', delete: 'HESABI SİL', confirmDelete: 'HESABI KALICI OLARAK SİL', confirmSignOut: 'ÇIKIŞ YAP', cancel: 'VAZGEÇ',
    signOutTitle: 'Çıkış yapmak istiyor musun?', signOutDescription: 'Bu cihazdaki oturumun kapatılacak.', deleteTitle: 'Hesabın silinsin mi?', deleteDescription: 'Hesabınla birlikte buluttaki film, dizi ve notların kalıcı olarak silinecek.',
  } : {
    profile: 'PROFILE HOME', title: 'Your watch story', overview: 'Overview', notes: 'All notes', settings: 'Settings',
    films: 'Films', series: 'Series', thisYear: 'THIS YEAR', totalHours: 'TOTAL WATCH TIME', topGenre: 'MOST WATCHED GENRE', average: 'AVERAGE RATING', activeDays: 'ACTIVE DAYS',
    episodes: 'EPISODES', tracked: 'TRACKED', completed: 'COMPLETED', watchlist: 'WATCHLIST', noData: 'There is not enough data for this view yet.',
    noNotes: 'No notes have been saved yet.', appearance: 'Profile icon', appearanceHint: 'Pick the face and soft color that feels like you.',
    language: 'Language', signOut: 'SIGN OUT', delete: 'DELETE ACCOUNT', confirmDelete: 'DELETE ACCOUNT PERMANENTLY', confirmSignOut: 'SIGN OUT', cancel: 'CANCEL',
    signOutTitle: 'Sign out?', signOutDescription: 'Your session on this device will end.', deleteTitle: 'Delete your account?', deleteDescription: 'Your account, films, series, and notes in the cloud will be permanently deleted.',
  }

  useEffect(() => {
    const movieIds = [...new Set(Object.values(entries).map((entry) => entry.movie.id))]
    if (!movieIds.length) return
    const controller = new AbortController()
    void Promise.resolve().then(() => setAnalyticsLoading(true))
    void Promise.all(movieIds.map(async (movieId) => {
      const params = new URLSearchParams({ language: 'en-US' })
      const response = await fetch(tmdbUrl(`movie/${movieId}`, params), { signal: controller.signal })
      if (!response.ok) return [movieId, {}] as const
      return [movieId, await response.json() as MovieAnalyticsDetail] as const
    })).then((details) => setMovieDetails(Object.fromEntries(details))).catch((requestError: Error) => {
      if (requestError.name !== 'AbortError') setMovieDetails({})
    }).finally(() => setAnalyticsLoading(false))
    return () => controller.abort()
  }, [entries])

  const filmEntries = Object.entries(entries)
  const yearFilmEntries = filmEntries.filter(([date]) => date.startsWith(String(currentYear)))
  const allEpisodes = Object.entries(episodeEntries).flatMap(([date, episodes]) => episodes.map((entry) => ({ date, entry })))
  const yearEpisodes = allEpisodes.filter(({ date }) => date.startsWith(String(currentYear)))
  const filmMinutes = yearFilmEntries.reduce((total, [, entry]) => total + Number(movieDetails[entry.movie.id]?.runtime ?? 0), 0)
  const seriesMinutes = yearEpisodes.reduce((total, { entry }) => total + Number(entry.runtime ?? 0), 0)
  const ratedFilms = filmEntries.map(([, entry]) => entry.rating).filter((rating) => rating > 0)
  const averageRating = ratedFilms.length ? (ratedFilms.reduce((total, rating) => total + rating, 0) / ratedFilms.length).toFixed(1) : '—'
  const completedSeries = seriesLibrary.filter((item) => item.status === 'completed').length

  function topGenre(counts: Record<string, number>) {
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
  }

  const filmGenreCounts = filmEntries.reduce<Record<string, number>>((counts, [, entry]) => {
    for (const genre of movieDetails[entry.movie.id]?.genres ?? []) counts[genre.name] = (counts[genre.name] ?? 0) + 1
    return counts
  }, {})
  const seriesGenreCounts = allEpisodes.reduce<Record<string, number>>((counts, { entry }) => {
    for (const genre of entry.series.genres ?? []) counts[genre.name] = (counts[genre.name] ?? 0) + 1
    return counts
  }, {})

  const notes = [
    ...filmEntries.filter(([, entry]) => entry.comment).map(([date, entry]) => ({ id: `film-${date}`, type: 'movie' as const, date, title: entry.movie.title, meta: entry.rating ? `${entry.rating}/5` : '', note: entry.comment })),
    ...allEpisodes.filter(({ entry }) => entry.note).map(({ date, entry }, index) => ({ id: `episode-${date}-${index}`, type: 'tv' as const, date, title: entry.series.title, meta: `S${String(entry.season_number).padStart(2, '0')} E${String(entry.episode_number).padStart(2, '0')}`, note: entry.note ?? '' })),
    ...seriesLibrary.filter((item) => item.note).map((item) => ({ id: `series-${item.series.id}`, type: 'tv' as const, date: '', title: item.series.title, meta: language === 'tr' ? 'Genel dizi notu' : 'Series note', note: item.note ?? '' })),
  ].filter((note) => noteFilter === 'all' || note.type === noteFilter).sort((a, b) => b.date.localeCompare(a.date))

  async function chooseAvatar(emotion: ProfileEmotion, color: string) {
    setSelectedEmotion(emotion)
    setSelectedColor(color)
    setSaving(true)
    setMessage('')
    const { error } = await supabase.auth.updateUser({ data: { profile_face: emotion, profile_color: color } })
    setSaving(false)
    if (error) setMessage(error.message)
  }

  async function signOut() {
    setSaving(true)
    const { error } = await supabase.auth.signOut()
    setSaving(false)
    if (error) setMessage(error.message)
    else onClose()
    setConfirmation(null)
  }

  async function deleteAccount() {
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch('/api/account', { method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` } })
      const data = await response.json() as { message?: string }
      if (!response.ok) throw new Error(data.message || 'Account deletion failed.')
      await supabase.auth.signOut()
      window.location.assign('/')
    } catch (requestError) {
      setMessage(requestError instanceof Error ? requestError.message : 'Account deletion failed.')
      setSaving(false)
      setConfirmation(null)
    }
  }

  const filmStats = [
    { value: yearFilmEntries.length, label: labels.thisYear },
    { value: analyticsLoading ? '…' : formatHours(filmMinutes, language), label: labels.totalHours },
    { value: analyticsLoading ? '…' : topGenre(filmGenreCounts), label: labels.topGenre },
    { value: averageRating, label: labels.average },
    { value: new Set(filmEntries.map(([date]) => date)).size, label: labels.activeDays },
    { value: watchlist.filter((item) => (item.media_type ?? 'movie') === 'movie').length, label: labels.watchlist },
  ]
  const seriesStats = [
    { value: yearEpisodes.length, label: labels.episodes },
    { value: formatHours(seriesMinutes, language), label: labels.totalHours },
    { value: topGenre(seriesGenreCounts), label: labels.topGenre },
    { value: seriesLibrary.length, label: labels.tracked },
    { value: completedSeries, label: labels.completed },
    { value: watchlist.filter((item) => item.media_type === 'tv').length, label: labels.watchlist },
  ]
  const activeStats = analyticsMode === 'movie' ? filmStats : seriesStats

  return <div className="dialog-backdrop settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="account-settings profile-hub" role="dialog" aria-modal="true" aria-labelledby="account-settings-title">
      <button className="close-button" type="button" onClick={onClose} aria-label="Close profile">×</button>
      <header className="profile-hub-header">
        <ProfileAvatar session={session} emotion={selectedEmotion} color={selectedColor} />
        <div><p className="dialog-kicker">{labels.profile}</p><h2 id="account-settings-title">{labels.title}</h2><p className="account-email">{session.user.email}</p></div>
      </header>
      <nav className="profile-tabs" aria-label="Profile sections">{(['overview', 'notes', 'settings'] as ProfileTab[]).map((tab) => <button type="button" key={tab} aria-pressed={activeTab === tab} onClick={() => setActiveTab(tab)}>{labels[tab]}</button>)}</nav>

      {activeTab === 'overview' && <section className="profile-overview">
        <div className="profile-media-switch" role="group" aria-label="Choose analysis type"><button type="button" aria-pressed={analyticsMode === 'movie'} onClick={() => setAnalyticsMode('movie')}>{labels.films}</button><button type="button" aria-pressed={analyticsMode === 'tv'} onClick={() => setAnalyticsMode('tv')}>{labels.series}</button></div>
        <div className="analysis-grid">{activeStats.map((stat, index) => <article className={index === 0 ? 'featured' : ''} key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></article>)}</div>
        {analyticsMode === 'movie' && !filmEntries.length && <p className="profile-empty">{labels.noData}</p>}
        {analyticsMode === 'tv' && !allEpisodes.length && <p className="profile-empty">{labels.noData}</p>}
        <div className="profile-balance"><span>{labels.films}<strong>{filmEntries.length}</strong></span><i style={{ '--film-share': `${filmEntries.length + allEpisodes.length ? Math.round(filmEntries.length / (filmEntries.length + allEpisodes.length) * 100) : 50}%` } as CSSProperties} /><span>{labels.series}<strong>{allEpisodes.length}</strong></span></div>
      </section>}

      {activeTab === 'notes' && <section className="profile-notes">
        <div className="note-filter" role="group" aria-label="Filter notes"><button type="button" aria-pressed={noteFilter === 'all'} onClick={() => setNoteFilter('all')}>ALL</button><button type="button" aria-pressed={noteFilter === 'movie'} onClick={() => setNoteFilter('movie')}>{labels.films.toUpperCase()}</button><button type="button" aria-pressed={noteFilter === 'tv'} onClick={() => setNoteFilter('tv')}>{labels.series.toUpperCase()}</button></div>
        {notes.length ? <div className="profile-note-list">{notes.map((note) => <article key={note.id}><span className={`note-type ${note.type}`} aria-hidden="true">{note.type === 'movie' ? 'F' : 'S'}</span><div><header><strong>{note.title}</strong><span>{note.meta}{note.date ? ` · ${new Date(`${note.date}T12:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</span></header><p>{note.note}</p></div></article>)}</div> : <p className="profile-empty">{labels.noNotes}</p>}
      </section>}

      {activeTab === 'settings' && <section className="profile-settings">
        <div className="settings-section"><div className="settings-copy"><strong>{labels.appearance}</strong><p>{labels.appearanceHint}</p></div><div className="avatar-picker">{PROFILE_FACES.map((avatar) => <button type="button" key={avatar.emotion} className={selectedEmotion === avatar.emotion && selectedColor === avatar.color ? 'active' : ''} style={{ backgroundColor: avatar.color }} onClick={() => chooseAvatar(avatar.emotion, avatar.color)} aria-label={avatar.label}><EmotionFace emotion={avatar.emotion} /></button>)}</div></div>
        <div className="settings-row"><div><strong>{labels.language}</strong><p>Türkçe / English</p></div><div className="language-switch" role="group" aria-label="Language"><button type="button" aria-pressed={language === 'tr'} onClick={() => onLanguageChange('tr')}>TR</button><button type="button" aria-pressed={language === 'en'} onClick={() => onLanguageChange('en')}>EN</button></div></div>
        <div className="settings-row"><div><strong>{session.user.email}</strong><p>{language === 'tr' ? 'Bu cihazdaki oturumunu kapat.' : 'End your session on this device.'}</p></div><button className="settings-action secondary" type="button" onClick={() => setConfirmation('signout')} disabled={saving}>{labels.signOut}</button></div>
        <div className="settings-row account-delete-row"><div><strong>{labels.delete}</strong><p>{language === 'tr' ? 'Hesabını ve buluttaki Reelendar verilerini kalıcı olarak kaldır.' : 'Permanently remove your account and cloud Reelendar data.'}</p></div><button className="account-delete" type="button" onClick={() => setConfirmation('delete')} disabled={saving}>{labels.delete}</button></div>
      </section>}
      {message && <p className="status-message" role="status">{message}</p>}
      {saving && <SaveIndicator saving />}
    </section>
    {confirmation && <div className="dialog-backdrop account-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setConfirmation(null) }}>
      <section className="confirm-dialog account-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="account-confirm-title" aria-describedby="account-confirm-description">
        <p className="dialog-kicker">{confirmation === 'delete' ? labels.delete : labels.signOut}</p>
        <h2 id="account-confirm-title">{confirmation === 'delete' ? labels.deleteTitle : labels.signOutTitle}</h2>
        <p id="account-confirm-description">{confirmation === 'delete' ? labels.deleteDescription : labels.signOutDescription}</p>
        <div><button type="button" onClick={() => setConfirmation(null)} disabled={saving}>{labels.cancel}</button><button className={confirmation === 'delete' ? 'confirm-delete' : 'confirm-signout'} type="button" onClick={confirmation === 'delete' ? deleteAccount : signOut} disabled={saving}>{confirmation === 'delete' ? labels.confirmDelete : labels.confirmSignOut}</button></div>
      </section>
    </div>}
  </div>
}

function JournalPoster({ item }: { item: MediaItem }) {
  const [failed, setFailed] = useState(false)
  return <span className="daily-poster">{item.poster_path && !failed ? <img src={`${IMAGE_URL}${item.poster_path}`} alt={`${item.title} poster`} onError={() => setFailed(true)} /> : <span aria-hidden="true">{item.title.slice(0, 2).toUpperCase()}</span>}</span>
}

function JournalEditor({ comment, rating, saved, onComment, onRating, onSave, language = 'en' }: { language?: AppLanguage; comment: string; rating: number; saved: boolean; onComment: (value: string) => void; onRating: (value: number) => void; onSave: () => void }) {
  return <div className="journal-editor">
    <div className="rating-field"><span>{language === 'tr' ? 'PUANIN' : 'YOUR RATING'}</span><div className="half-rating" role="radiogroup" aria-label="Your rating">{[1, 2, 3, 4, 5].map((value) => {
      const fill = rating >= value ? 100 : rating >= value - .5 ? 50 : 0
      return <span className="rating-star" key={value}><i aria-hidden="true">✦</i><i className="rating-star-fill" style={{ width: `${fill}%` }} aria-hidden="true">✦</i><button className="half-left" type="button" onClick={() => onRating(value - .5)} role="radio" aria-checked={rating === value - .5} aria-label={`${value - .5} out of 5`} /><button className="half-right" type="button" onClick={() => onRating(value)} role="radio" aria-checked={rating === value} aria-label={`${value} out of 5`} /></span>
    })}</div><strong>{rating ? `${rating}/5` : '—'}</strong></div>
    <label className="comment-field"><span>{language === 'tr' ? 'NOTUN' : 'YOUR NOTE'}</span><textarea value={comment} onChange={(event) => onComment(event.target.value)} placeholder={language === 'tr' ? 'Bu filmden aklında ne kaldı?' : 'What stayed with you after the credits?'} maxLength={500} /><small>{comment.length}/500</small></label>
    <button className={`save-entry ${saved ? 'saved' : ''}`} type="button" onClick={onSave}>{saved ? language === 'tr' ? 'KAYDEDİLDİ ✓' : 'SAVED ✓' : language === 'tr' ? 'KAYDET' : 'SAVE ENTRY'}</button>
  </div>
}

function MediaModeToggle({ value, onChange, language }: { value: MediaType; onChange: (value: MediaType) => void; language: AppLanguage }) {
  return <div className={`media-mode-toggle ${value === 'tv' ? 'is-series' : ''}`} role="group" aria-label="Choose diary type">
    <span className="reel-disc" aria-hidden="true"><i /><i /><i /><i /></span>
    <button type="button" className={value === 'movie' ? 'active' : ''} aria-pressed={value === 'movie'} onClick={() => onChange('movie')}>{APP_COPY[language].films}</button>
    <button type="button" className={value === 'tv' ? 'active' : ''} aria-pressed={value === 'tv'} onClick={() => onChange('tv')}>{APP_COPY[language].series}</button>
  </div>
}

function MovieLink({ movie, action }: { movie: MediaItem; action?: () => void }) {
  const mediaType = movie.media_type ?? 'movie'
  return <article className="sidebar-movie"><a href={`https://www.themoviedb.org/${mediaType}/${movie.id}`} target="_blank" rel="noreferrer"><img src={`${IMAGE_URL}${movie.poster_path}`} alt="" /><span><strong>{movie.title}</strong><small>{mediaLabel(movie)} · {movie.release_date?.slice(0, 4) || 'TBA'} · {movie.vote_average.toFixed(1)} ★</small></span></a>{action && <button type="button" onClick={action} aria-label={`Remove ${movie.title} from watchlist`}>×</button>}</article>
}
