export default function ReportNavigation({ reports, activeId, onSelect, placement = 'top' }) {
  const currentIndex = reports.findIndex((report) => report.id === activeId)
  if (currentIndex < 0) return null

  const previous = reports[currentIndex - 1]
  const next = reports[currentIndex + 1]
  const goTo = (report) => {
    if (!report) return
    onSelect(report)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <nav aria-label="Report navigation" className={`report-navigation report-navigation-${placement}`}>
      <button
        aria-label={previous ? `Previous report: ${previous.title}` : 'No previous report'}
        className="button button-outline report-navigation-button report-navigation-previous"
        disabled={!previous}
        onClick={() => goTo(previous)}
        type="button"
      >
        <span aria-hidden="true">‹</span>
        <span className="report-navigation-label">{previous ? `Previous · ${previous.title}` : 'Previous report'}</span>
      </button>
      <label className="report-chapter-select">
        <span className="sr-only">Select a report chapter</span>
        <select
          aria-label="Select a report chapter"
          onChange={(event) => {
            const selected = reports.find((report) => report.id === event.target.value)
            if (selected) goTo(selected)
          }}
          value={activeId}
        >
          {reports.map((report, index) => <option key={report.id} value={report.id}>
            {report.number ? `Report ${report.number} · ` : `${String(index + 1).padStart(2, '0')} · `}{report.title}
          </option>)}
        </select>
        <span aria-hidden="true" className="report-chapter-chevron">⌄</span>
      </label>
      <button
        aria-label={next ? `Next report: ${next.title}` : 'No next report'}
        className="button button-outline report-navigation-button report-navigation-next"
        disabled={!next}
        onClick={() => goTo(next)}
        type="button"
      >
        <span className="report-navigation-label">{next ? `Next · ${next.title}` : 'Next report'}</span>
        <span aria-hidden="true">›</span>
      </button>
    </nav>
  )
}
