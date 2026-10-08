type Props = {
  day: Date
  today: Date
  language: 'en' | 'tr'
  summary: string
  hasEntry: (key: string) => boolean
  onSelect: (date: Date) => void
}

function keyOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function DayJournalHeader({ day, today, language, summary, hasEntry, onSelect }: Props) {
  const tr = language === 'tr'
  const locale = tr ? 'tr-TR' : 'en-US'
  const selectedKey = keyOf(day)
  const todayKey = keyOf(today)
  const start = new Date(day)
  start.setDate(day.getDate() - (day.getDay() + 6) % 7)
  const move = (amount: number) => {
    const next = new Date(day)
    next.setDate(day.getDate() + amount)
    if (keyOf(next) <= todayKey) onSelect(next)
  }

  return <>
    <header className="daily-heading">
      <div><p className="daily-eyebrow">{tr ? 'O GÜNÜN GÜNLÜĞÜ' : 'A DAY IN YOUR DIARY'}</p>
        <h2>{day.toLocaleDateString(locale, { day: 'numeric', month: 'long' })} <span>{day.getFullYear()}</span></h2>
        <p className="daily-summary">{day.toLocaleDateString(locale, { weekday: 'long' })} <span aria-hidden="true">·</span> {summary}</p>
      </div>
      <div className="daily-date-actions">
        <button type="button" onClick={() => move(-1)} aria-label={tr ? 'Önceki gün' : 'Previous day'}>←</button>
        <label className="daily-date-picker"><span>{tr ? 'Tarih seç' : 'Choose date'}</span><input type="date" aria-label={tr ? 'Tarih seç' : 'Choose date'} value={selectedKey} max={todayKey} onChange={(event) => {
          const value = event.target.value
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > todayKey) return
          const next = new Date(`${value}T12:00:00`)
          if (!Number.isNaN(next.getTime())) onSelect(next)
        }} /></label>
        <button type="button" onClick={() => move(1)} disabled={selectedKey >= todayKey} aria-label={tr ? 'Sonraki gün' : 'Next day'}>→</button>
        {selectedKey !== todayKey && <button className="daily-today" type="button" onClick={() => onSelect(today)}>{tr ? 'Bugün' : 'Today'}</button>}
      </div>
    </header>
    <nav className="daily-week" aria-label={tr ? 'Haftanın günleri' : 'Days of the week'}>
      {Array.from({ length: 7 }, (_, index) => {
        const date = new Date(start)
        date.setDate(start.getDate() + index)
        const key = keyOf(date)
        const recorded = hasEntry(key)
        return <button key={key} type="button" disabled={key > todayKey} aria-current={key === selectedKey ? 'date' : undefined} aria-label={`${date.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}${recorded ? tr ? ', kayıt var' : ', has an entry' : ''}`} onClick={() => onSelect(date)}>
          <span>{date.toLocaleDateString(locale, { weekday: 'short' })}</span><strong>{date.getDate()}</strong><i className={recorded ? 'has-entry' : ''} aria-hidden="true" />
        </button>
      })}
    </nav>
  </>
}
