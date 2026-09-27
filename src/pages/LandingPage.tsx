import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Movie } from '../lib/supabase'

const IMAGE_URL = 'https://image.tmdb.org/t/p/w500'

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date).toUpperCase()
}

function wordStyle(index: number) {
  return { '--word-index': index } as CSSProperties
}

function revealStyle(index: number) {
  return { '--reveal-delay': `${index * 70}ms` } as CSSProperties
}

function WordReveal({ text, start = 0 }: { text: string; start?: number }) {
  const words = text.split(' ')
  return words.map((word, index) => <span className="typed-word" style={wordStyle(start + index)} key={`${word}-${index}`}>
    {word}
  </span>)
}

function CalendarPreview() {
  const activeDays = new Set([5, 12, 18, 23, 27])
  return <div className="ritual-visual ritual-calendar" aria-hidden="true">
    <div className="ritual-ui-bar"><span>SEPTEMBER</span><i>2026</i></div>
    <div className="ritual-weekdays">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
    <div className="ritual-days">{Array.from({ length: 35 }, (_, index) => <i className={activeDays.has(index) ? 'watched' : ''} key={index}>{index > 2 && index < 33 ? index - 2 : ''}</i>)}</div>
  </div>
}

function NotePreview() {
  return <div className="ritual-visual ritual-note" aria-hidden="true">
    <div className="ritual-poster"><span>FILM</span><strong>MEMORY</strong></div>
    <div className="ritual-note-copy"><small>14 SEPTEMBER</small><strong>The film that stayed</strong><div className="ritual-stars">✦ ✦ ✦ ✦ <i>✦</i></div><p>Some stories end on screen.<br />This one followed me home.</p></div>
  </div>
}

function YearPreview() {
  return <div className="ritual-visual ritual-year" aria-hidden="true">
    <div className="ritual-ui-bar"><span>YOUR YEAR</span><i>24 FILMS</i></div>
    {['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL'].map((month, row) => <div className="ritual-year-row" key={month}><span>{month}</span>{Array.from({ length: 12 }, (_, column) => <i className={(row * 3 + column) % 7 === 0 || (row + column) % 11 === 0 ? 'watched' : ''} key={column} />)}</div>)}
  </div>
}

export function LandingPage() {
  const today = useMemo(() => new Date(), [])
  const [releases, setReleases] = useState<Movie[]>([])

  useEffect(() => {
    const controller = new AbortController()
    const first = new Date(today.getFullYear(), today.getMonth(), 1)
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    const params = new URLSearchParams({
      endpoint: 'discover/movie',
      include_adult: 'false',
      include_video: 'false',
      language: 'en-US',
      page: '1',
      sort_by: 'popularity.desc',
      'primary_release_date.gte': dateKey(first),
      'primary_release_date.lte': dateKey(last),
    })

    fetch(`/api/tmdb?${params}`, { signal: controller.signal, headers: { accept: 'application/json' } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Release list unavailable')))
      .then((data: { results: Movie[] }) => setReleases(data.results.filter((movie) => movie.poster_path).slice(0, 8)))
      .catch((error: Error) => { if (error.name !== 'AbortError') setReleases([]) })

    return () => controller.abort()
  }, [today])

  useEffect(() => {
    const items = document.querySelectorAll<HTMLElement>('.scroll-reveal')
    if (!('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('is-visible'))
      return
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' })

    items.forEach((item) => observer.observe(item))
    return () => observer.disconnect()
  }, [])

  const posterLoop = releases.length ? [...releases, ...releases] : []

  return <main className="landing-shell">
    <header className="landing-header">
      <a className="brand" href="/" aria-label="Reelendar home"><span className="brand-mark" aria-hidden="true">R</span><span>REELENDAR</span></a>
      <p>YOUR LIFE, FRAME BY FRAME</p>
      <nav aria-label="Primary navigation">
        <a className="landing-sign-in" href="/login">SIGN IN</a>
        <a className="landing-header-cta" href="/app">OPEN DIARY</a>
      </nav>
    </header>

    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-copy">
        <p className="landing-kicker"><span /> <WordReveal text="A PRIVATE FILM DIARY" /></p>
        <h1 id="landing-title" aria-label="Remember your year in film.">
          <span aria-hidden="true"><span className="typed-word" style={wordStyle(4)}>Remember</span><span className="typed-word" style={wordStyle(5)}>your</span><span className="typed-word" style={wordStyle(6)}>year</span><br /><span className="typed-word" style={wordStyle(7)}>in</span><em className="typed-word" style={wordStyle(8)}>film.</em></span>
        </h1>
        <p className="landing-intro"><WordReveal text="Turn every film you watch into a moment worth keeping. A quiet, cinematic calendar for your ratings, notes and memories." start={9} /></p>
        <div className="landing-actions">
          <a className="primary-cta" href="/app">START YOUR DIARY</a>
          <a className="text-cta" href="#how-it-works">SEE HOW IT WORKS</a>
        </div>
        <p className="local-first-note"><i aria-hidden="true" /> No account needed. Start locally, sync when you are ready.</p>
      </div>

      <div className="release-showcase" aria-label={`${monthLabel(today)} releases`}>
        <div className="release-label"><span>NOW PLAYING</span><strong>{monthLabel(today)} · {today.getFullYear()}</strong></div>
        <div className={`poster-window ${posterLoop.length ? '' : 'is-loading'}`}>
          {posterLoop.length ? <div className="poster-track">
            {posterLoop.map((movie, index) => <article className="release-poster" key={`${movie.id}-${index}`} aria-hidden={index >= releases.length}>
              <img src={`${IMAGE_URL}${movie.poster_path}`} alt={index < releases.length ? `${movie.title} poster` : ''} loading={index < 4 ? 'eager' : 'lazy'} />
              <div><strong>{movie.title}</strong><span>{movie.release_date?.slice(0, 4) || today.getFullYear()}</span></div>
            </article>)}
          </div> : <div className="poster-skeletons" aria-hidden="true">{Array.from({ length: 16 }, (_, index) => <span key={index} />)}</div>}
          <div className="poster-fade poster-fade-left" aria-hidden="true" />
          <div className="poster-fade poster-fade-right" aria-hidden="true" />
        </div>
        <p className="release-caption"><span>01</span> This month, waiting to become a memory.</p>
      </div>
    </section>

    <section className="landing-features" id="how-it-works" aria-labelledby="features-title">
      <div className="features-heading scroll-reveal"><p>THE RITUAL</p><h2 id="features-title">A home for every<br /><em>story you watch.</em></h2></div>
      <div className="feature-grid">
        <article className="scroll-reveal" style={revealStyle(0)}><span>01</span><CalendarPreview /><h3>Log the moment</h3><p>Place every film on the day you watched it and let your year reveal itself.</p></article>
        <article className="scroll-reveal" style={revealStyle(1)}><span>02</span><NotePreview /><h3>Keep what lingered</h3><p>Add a rating and a private note for the thought that stayed after the credits.</p></article>
        <article className="scroll-reveal" style={revealStyle(2)}><span>03</span><YearPreview /><h3>See the whole year</h3><p>Move between daily, monthly and yearly views without losing the thread.</p></article>
      </div>
    </section>

    <section className="landing-final-cta scroll-reveal">
      <p>YOUR NEXT FRAME IS WAITING</p>
      <h2>Begin with the last film<br />you <em>remember.</em></h2>
      <a className="primary-cta" href="/app">OPEN YOUR DIARY</a>
    </section>

    <footer className="landing-footer scroll-reveal">
      <a className="brand" href="/"><span className="brand-mark" aria-hidden="true">R</span><span>REELENDAR</span></a>
      <span>Film data &amp; imagery by TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
    </footer>
  </main>
}
