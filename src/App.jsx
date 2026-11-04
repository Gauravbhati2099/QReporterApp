import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BrowserRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import {
  formatCount,
  formatDateLabel,
  formatMoney,
  getDateBounds,
  getModifiedZScoreOutlierRows,
  getOutlierRows,
  getPercentileBounds,
  getSummary,
} from './lib/reportData'
import { readWorkbookInWorker } from './lib/workbookClient'
import {
  clearWorkbookData,
  createWorkbookFile,
  loadWorkbook,
  saveWorkbook,
} from './lib/workbookStorage'
import { useAppStore } from './store/useAppStore'
import './App.css'

const FILTERS = [
  { key: 'organizations', label: 'Sales Organization', rowKey: 'salesOrganization' },
  { key: 'usages', label: 'Usage group', rowKey: 'usage' },
  { key: 'currencies', label: 'Currency', rowKey: 'currency' },
]

const PREPROCESSING_STEPS = [
  {
    id: 'header-validation',
    label: 'Validate column mapping',
    description: 'Confirm the workbook contains the required SAP columns before analysis.',
  },
  {
    id: 'data-normalization',
    label: 'Normalize values',
    description: 'Clean date strings, currency text, and amount values into report-friendly formats.',
  },
  {
    id: 'duplicate-check',
    label: 'Remove duplicate or conflicting rows',
    description: 'Deduplicate repeated sales documents and block conflicting record values.',
  },
  {
    id: 'currency-conversion',
    label: 'Convert to INR',
    description: 'Apply the configured INR conversion rates for value comparisons and KPI totals.',
  },
  {
    id: 'outlier-filter',
    label: 'Detect outliers',
    description: 'Flag values outside IQR, MAD, or percentile ranges for review.',
  },
  {
    id: 'report-aggregation',
    label: 'Build summary tables',
    description: 'Group sales data by organization, usage, and currency for the final report.',
  },
]

const CHART_GROUPS = [
  { key: 'salesOrganization', label: 'Sales Organization' },
  { key: 'usage', label: 'Usage group' },
  { key: 'currency', label: 'Currency' },
]

function Icon({ name, size = 18 }) {
  const paths = {
    chart: <><rect x="3" y="12" width="4" height="9" rx="1" /><rect x="10" y="7" width="4" height="14" rx="1" /><rect x="17" y="3" width="4" height="18" rx="1" /></>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
    calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4 4" /></>,
    download: <><path d="M12 3v12m0 0 5-5m-5 5-5-5" /><path d="M5 20h14" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    moon: <><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" /></>,
    present: <><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3" /><path d="M8 12h8m-4-4v8" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    arrow: <><path d="M5 12h14m-7-7 7 7-7 7" /></>,
  }

  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
    >
      {paths[name]}
    </svg>
  )
}

function MultiSelect({ label, options, selected, onChange }) {
  const selectedCount = selected.length
  const summary =
    selectedCount === options.length
      ? 'All'
      : selectedCount === 0
        ? 'None'
        : `${selectedCount} selected`

  function toggle(value) {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    )
  }

  return (
    <details className="filter-menu">
      <summary>
        <span>{label}</span>
        <span className="filter-summary">{summary}</span>
        <span className="chevron" aria-hidden="true" />
      </summary>
      <div className="filter-popover">
        <div className="filter-popover-head">
          <strong>{label}</strong>
          <div className="filter-actions">
            <button type="button" onClick={() => onChange(options)}>Select all</button>
            <button type="button" onClick={() => onChange([])}>Clear</button>
          </div>
        </div>
        <div className="filter-options">
          {options.map((option) => (
            <label key={option} className="check-option">
              <input
                checked={selected.includes(option)}
                onChange={() => toggle(option)}
                type="checkbox"
                value={option}
              />
              <span>{option}</span>
              <span className="check-mark"><Icon name="check" size={13} /></span>
            </label>
          ))}
          {options.length === 0 && <span className="empty-options">No values available</span>}
        </div>
      </div>
    </details>
  )
}

function MetricChart({ title, subtitle, entries, metric, total, id }) {
  const denominator =
    metric === 'count'
      ? entries.reduce((sum, entry) => sum + entry.value, 0)
      : entries.reduce((sum, entry) => sum + Math.abs(entry.value), 0)
  const maximum = Math.max(0, ...entries.map((entry) => Math.abs(entry.value)))
  const sortedEntries = [...entries]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 7)

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span className="unit-tag">{metric === 'count' ? 'QUOTATIONS' : 'INR · LACS / CR'}</span>
      </div>
      <div className="chart-total">
        <span>{metric === 'count' ? formatCount(total) : formatMoney(total, 'INR')}</span>
        <small>{metric === 'count' ? 'unique sales documents' : 'converted value'}</small>
      </div>
      <div className="bar-list">
        {sortedEntries.map((entry, index) => {
          const share = denominator ? (Math.abs(entry.value) / denominator) * 100 : 0
          const width = maximum ? (Math.abs(entry.value) / maximum) * 100 : 0
          return (
            <div className="bar-entry" key={entry.label}>
              <div className="bar-meta">
                <span className="bar-label" title={entry.label}>
                  <i className={`legend-dot tone-${index}`} />
                  {entry.label}
                </span>
                <span className="bar-number">
                  {metric === 'count'
                    ? formatCount(entry.value)
                    : formatMoney(entry.value, 'INR')}
                  <small>{share.toFixed(1)}%</small>
                </span>
              </div>
              <div
                aria-label={`${entry.label}: ${metric === 'count' ? formatCount(entry.value) : formatMoney(entry.value, 'INR')}`}
                className="bar-track"
                role="img"
              >
                <span
                  className={`bar-fill tone-${index}`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          )
        })}
        {sortedEntries.length === 0 && <div className="chart-empty">No data for this selection.</div>}
      </div>
      <div className="chart-footnote">
        {metric === 'count'
          ? 'Share of selected quotations'
          : 'Share of absolute INR value · unconfigured currencies excluded'}
      </div>
      <span className="sr-only" id={`${id}-description`}>
        {title} grouped by the selected chart dimension.
      </span>
    </section>
  )
}

const PIE_COLORS = ['#4169e1', '#159777', '#7759cc', '#df8b36', '#d65773', '#398da8', '#78869c']

function getPieSlices(entries, total, metric) {
  let angle = -90

  return entries.map((entry, index) => {
    const share = entry.pieValue / total
    const nextAngle = angle + share * 360
    const start = {
      x: 110 + 94 * Math.cos((angle * Math.PI) / 180),
      y: 110 + 94 * Math.sin((angle * Math.PI) / 180),
    }
    const end = {
      x: 110 + 94 * Math.cos((nextAngle * Math.PI) / 180),
      y: 110 + 94 * Math.sin((nextAngle * Math.PI) / 180),
    }
    const path = entries.length === 1
      ? null
      : `M 110 110 L ${start.x} ${start.y} A 94 94 0 ${share > 0.5 ? 1 : 0} 1 ${end.x} ${end.y} Z`

    angle = nextAngle

    return {
      ...entry,
      index,
      path,
      share,
      valueLabel:
        metric === 'count'
          ? formatCount(entry.count)
          : formatMoney(Math.abs(entry.inr), 'INR'),
    }
  })
}

function PieChart({ entries, metric, groupLabel }) {
  const pieEntries = entries
    .map((entry) => ({
      ...entry,
      pieValue: metric === 'count' ? entry.count : Math.abs(entry.inr),
    }))
    .filter((entry) => entry.pieValue > 0)
  const total = pieEntries.reduce((sum, entry) => sum + entry.pieValue, 0)
  const slices = getPieSlices(pieEntries, total, metric)

  return (
    <section className={`panel chart-panel pie-panel pie-panel-${metric}`}>
      <div className="panel-heading">
        <div>
          <h2>{metric === 'count' ? 'Quotation count' : 'Converted INR value'}</h2>
          <p>
            {metric === 'count' ? 'Unique sales documents' : 'Absolute converted value'} by {groupLabel}
          </p>
        </div>
        <span className="unit-tag">
          {metric === 'count' ? 'QUOTATIONS' : 'ABSOLUTE INR · LACS / CR'}
        </span>
      </div>
      <div className="chart-total pie-total">
        <span>
          {metric === 'count' ? formatCount(total) : formatMoney(total, 'INR')}
        </span>
        <small>
          {metric === 'count' ? 'unique sales documents' : 'absolute converted value'}
        </small>
      </div>
      {slices.length ? (
        <div className="pie-content">
          <svg
            aria-label={`Pie chart of ${metric === 'count' ? 'quotation count' : 'absolute converted INR value'} by ${groupLabel}`}
            className="pie-visual"
            role="img"
            viewBox="0 0 220 220"
          >
            {slices.map((slice) => (
              <path
                aria-label={`${slice.label}: ${slice.valueLabel}, ${(slice.share * 100).toFixed(1)}%`}
                className="pie-slice"
                d={
                  slice.path ??
                  'M 110 16 A 94 94 0 1 1 110 204 A 94 94 0 1 1 110 16 Z'
                }
                key={slice.label}
                style={{ '--pie-color': PIE_COLORS[slice.index % PIE_COLORS.length] }}
              >
                <title>
                  {slice.label}: {slice.valueLabel} ({(slice.share * 100).toFixed(1)}%)
                </title>
              </path>
            ))}
          </svg>
          <div
            aria-label={`Legend and data labels by ${groupLabel}`}
            className="pie-legend"
            role="list"
          >
            {slices.map((slice) => (
              <div
                className="pie-legend-item"
                key={slice.label}
                role="listitem"
              >
                <i
                  aria-hidden="true"
                  className="pie-legend-dot"
                  style={{ '--pie-color': PIE_COLORS[slice.index % PIE_COLORS.length] }}
                />
                <span className="pie-legend-label" title={slice.label}>{slice.label}</span>
                <span className="pie-legend-value">
                  {slice.valueLabel}
                  <small>{(slice.share * 100).toFixed(1)}%</small>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="chart-empty">No data for this selection.</div>
      )}
      {metric === 'value' && (
        <div className="chart-footnote">
          Pie size and shares use absolute converted INR value; unknown currencies are excluded.
        </div>
      )}
    </section>
  )
}

function formatExactMoney(amount, currency) {
  if (currency === 'INR') {
    return `₹${Number(amount).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} INR`
  }
  return `${Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`
}

function makeCsv(rows) {
  const columns = [
    ['Sales Organization', (row) => row.salesOrganization],
    ['Usage group', (row) => row.usage],
    ['Currency', (row) => row.currency],
    ['Quotations', (row) => row.count],
    ['Total value (original currency)', (row) => row.value],
  ]
  const escapeCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  return [
    columns.map(([label]) => escapeCell(label)).join(','),
    ...rows.map((row) => columns.map(([, getValue]) => escapeCell(getValue(row))).join(',')),
  ].join('\r\n')
}

function compareRawDataValues(left, right, key) {
  const numericKeys = new Set(['amount', 'inr'])

  if (numericKeys.has(key)) {
    const leftNumber = Number(left)
    const rightNumber = Number(right)
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber
    }
  }

  const leftText = String(left ?? '')
  const rightText = String(right ?? '')
  return leftText.localeCompare(rightText, undefined, { numeric: true, sensitivity: 'base' })
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

function AppShell() {
  const inputRef = useRef(null)
  const themeMenuRef = useRef(null)
  const themeButtonRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false)
  const [selectedSteps, setSelectedSteps] = useState(() => PREPROCESSING_STEPS.map((step) => step.id))
  const [rawDataRows, setRawDataRows] = useState([])
  const [rawDataSearch, setRawDataSearch] = useState('')
  const [rawDataSort, setRawDataSort] = useState({ key: 'date', direction: 'desc' })
  const [rawDataSlicers, setRawDataSlicers] = useState({
    salesOrganization: '',
    usage: '',
    currency: '',
  })
  const [rawDataView, setRawDataView] = useState('raw')
  const isRestoring = useAppStore((state) => state.isRestoring)
  const rows = useAppStore((state) => state.rows)
  const selections = useAppStore((state) => state.selections)
  const dateFrom = useAppStore((state) => state.dateFrom)
  const dateTo = useAppStore((state) => state.dateTo)
  const groupBy = useAppStore((state) => state.groupBy)
  const query = useAppStore((state) => state.query)
  const tableFilters = useAppStore((state) => state.tableFilters)
  const outlierFilter = useAppStore((state) => state.outlierFilter)
  const percentileTail = useAppStore((state) => state.percentileTail)
  const theme = useAppStore((state) => state.theme)
  const fileInfo = useAppStore((state) => state.fileInfo)
  const status = useAppStore((state) => state.status)
  const error = useAppStore((state) => state.error)
  const isReading = useAppStore((state) => state.isReading)
  const dragging = useAppStore((state) => state.dragging)
  const isPresenting = useAppStore((state) => state.isPresenting)
  const setIsRestoring = useAppStore((state) => state.setIsRestoring)
  const setRows = useAppStore((state) => state.setRows)
  const setSelections = useAppStore((state) => state.setSelections)
  const setDateFrom = useAppStore((state) => state.setDateFrom)
  const setDateTo = useAppStore((state) => state.setDateTo)
  const setGroupBy = useAppStore((state) => state.setGroupBy)
  const setQuery = useAppStore((state) => state.setQuery)
  const setTableFilters = useAppStore((state) => state.setTableFilters)
  const setOutlierFilter = useAppStore((state) => state.setOutlierFilter)
  const setPercentileTail = useAppStore((state) => state.setPercentileTail)
  const setTheme = useAppStore((state) => state.setTheme)
  const setFileInfo = useAppStore((state) => state.setFileInfo)
  const setStatus = useAppStore((state) => state.setStatus)
  const setError = useAppStore((state) => state.setError)
  const setIsReading = useAppStore((state) => state.setIsReading)
  const setDragging = useAppStore((state) => state.setDragging)
  const setIsPresenting = useAppStore((state) => state.setIsPresenting)

  useEffect(() => {
    if (!isThemeMenuOpen) return undefined

    function handlePointerDown(event) {
      if (!themeMenuRef.current?.contains(event.target)) setIsThemeMenuOpen(false)
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsThemeMenuOpen(false)
        themeButtonRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isThemeMenuOpen])

  function togglePreprocessingStep(stepId) {
    setSelectedSteps((current) =>
      current.includes(stepId)
        ? current.filter((id) => id !== stepId)
        : [...current, stepId],
    )
  }

  useEffect(() => {
    let active = true

    async function restoreSavedWorkbook() {
      try {
        const savedWorkbook = await loadWorkbook()
        if (!savedWorkbook) return

        const file = createWorkbookFile(savedWorkbook)
        const imported = await readWorkbookInWorker(file)
        if (!active) return

        const importedBounds = getDateBounds(imported.rows)
        setRows(imported.rows)
        setRawDataRows(imported.sourceRows ?? imported.rows)
        setSelections({
          organizations: [...new Set(imported.rows.map((row) => row.salesOrganization))],
          usages: [...new Set(imported.rows.map((row) => row.usage))],
          currencies: [...new Set(imported.rows.map((row) => row.currency))],
        })
        setDateFrom(importedBounds.min)
        setDateTo(importedBounds.min === importedBounds.max ? '' : importedBounds.max)
        setFileInfo({
          name: savedWorkbook.name,
          size: savedWorkbook.size,
          sheet: savedWorkbook.sheetName,
        })
        setStatus('Saved workbook restored from this browser.')
        navigate('/dashboard', { replace: true })
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error
              ? `Could not restore the saved workbook: ${caught.message}`
              : 'Could not restore the saved workbook from this browser.',
          )
        }
      } finally {
        if (active) setIsRestoring(false)
      }
    }

    void restoreSavedWorkbook()
    return () => {
      active = false
    }
  }, [
    setDateFrom,
    setDateTo,
    setError,
    setFileInfo,
    setIsRestoring,
    setRows,
    setSelections,
    setStatus,
  ])

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') setIsPresenting(false)
    }

    function handleFullscreenChange() {
      if (!document.fullscreenElement) setIsPresenting(false)
    }

    window.addEventListener('keydown', handleEscape)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      window.removeEventListener('keydown', handleEscape)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [setIsPresenting])

  useEffect(() => {
    if (rows.length > 0 && location.pathname === '/') {
      navigate('/dashboard', { replace: true })
    }
  }, [location.pathname, navigate, rows.length])

  const bounds = useMemo(() => getDateBounds(rows), [rows])
  const outlierRows = useMemo(() => getOutlierRows(rows), [rows])
  const modifiedZScoreOutlierRows = useMemo(
    () => getModifiedZScoreOutlierRows(rows),
    [rows],
  )
  const percentileBounds = useMemo(
    () => getPercentileBounds(rows, percentileTail),
    [percentileTail, rows],
  )
  const options = useMemo(
    () => ({
      organizations: [...new Set(rows.map((row) => row.salesOrganization))].sort(
        (a, b) => a.localeCompare(b, undefined, { numeric: true }),
      ),
      usages: [...new Set(rows.map((row) => row.usage))].sort(),
      currencies: [...new Set(rows.map((row) => row.currency))].sort(),
    }),
    [rows],
  )

  const dateError = useMemo(() => {
    if (!rows.length) return ''
    if (dateFrom && (dateFrom < bounds.min || dateFrom > bounds.max)) {
      return `Choose a start date between ${formatDateLabel(bounds.min)} and ${formatDateLabel(bounds.max)}.`
    }
    if (dateTo && (dateTo < bounds.min || dateTo > bounds.max)) {
      return `Choose an end date between ${formatDateLabel(bounds.min)} and ${formatDateLabel(bounds.max)}.`
    }
    if (dateFrom && dateTo && dateTo < dateFrom) {
      return 'The end date must be on or after the start date.'
    }
    return ''
  }, [bounds.max, bounds.min, dateFrom, dateTo, rows.length])

  const rawDataOptions = useMemo(() => ({
    salesOrganization: [...new Set(rawDataRows.map((row) => row.salesOrganization))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    usage: [...new Set(rawDataRows.map((row) => row.usage))].sort(),
    currency: [...new Set(rawDataRows.map((row) => row.currency))].sort(),
  }), [rawDataRows])

  const visibleRawRows = useMemo(() => {
    const query = rawDataSearch.trim().toLowerCase()
    return [...rawDataRows]
      .filter((row) => {
        const matchesQuery = !query || Object.values({
          document: row.document,
          createdBy: row.createdBy,
          salesOrganization: row.salesOrganization,
          usage: row.usage,
          currency: row.currency,
          date: row.date,
          amount: String(row.amount),
          inr: row.inr != null ? String(row.inr) : '',
        }).some((value) => String(value).toLowerCase().includes(query))

        const matchesSalesOrganization = !rawDataSlicers.salesOrganization || row.salesOrganization === rawDataSlicers.salesOrganization
        const matchesUsage = !rawDataSlicers.usage || row.usage === rawDataSlicers.usage
        const matchesCurrency = !rawDataSlicers.currency || row.currency === rawDataSlicers.currency

        return matchesQuery && matchesSalesOrganization && matchesUsage && matchesCurrency
      })
      .sort((a, b) => {
        const direction = rawDataSort.direction === 'asc' ? 1 : -1
        return compareRawDataValues(a[rawDataSort.key], b[rawDataSort.key], rawDataSort.key) * direction
      })
  }, [rawDataRows, rawDataSearch, rawDataSlicers, rawDataSort])

  const selectedRows = useMemo(() => {
    if (dateError) return []
    const effectiveTo = dateTo || dateFrom
    return rows.filter(
      (row) =>
        selections.organizations.includes(row.salesOrganization) &&
        selections.usages.includes(row.usage) &&
        selections.currencies.includes(row.currency) &&
        (!dateFrom || row.date >= dateFrom) &&
        (!effectiveTo || row.date <= effectiveTo),
    )
  }, [dateError, dateFrom, dateTo, rows, selections])

  const filteredRows = useMemo(() => {
    if (outlierFilter === 'zero') return selectedRows.filter((row) => row.amount !== 0)
    if (outlierFilter === 'iqr') return selectedRows.filter((row) => !outlierRows.has(row))
    if (outlierFilter === 'mad') {
      return selectedRows.filter((row) => !modifiedZScoreOutlierRows.has(row))
    }
    if (outlierFilter === 'percentile') {
      return selectedRows.filter((row) => {
        const range = percentileBounds.get(row.currency)
        return !range || (row.amount >= range.lower && row.amount <= range.upper)
      })
    }
    return selectedRows
  }, [modifiedZScoreOutlierRows, outlierFilter, outlierRows, percentileBounds, selectedRows])

  const percentileRangeSummary = useMemo(() => {
    if (outlierFilter !== 'percentile') return ''
    const retainedRanges = new Map()
    for (const row of filteredRows) {
      const current = retainedRanges.get(row.currency) ?? { lower: row.amount, upper: row.amount }
      current.lower = Math.min(current.lower, row.amount)
      current.upper = Math.max(current.upper, row.amount)
      retainedRanges.set(row.currency, current)
    }

    return [...new Set(selectedRows.map((row) => row.currency))]
      .sort()
      .map((currency) => {
        const range = percentileBounds.get(currency)
        if (!range) return ''
        const keptRange = retainedRanges.has(currency)
          ? `${formatMoney(retainedRanges.get(currency).lower, currency)}–${formatMoney(retainedRanges.get(currency).upper, currency)}`
          : 'no quotations retained'
        return `${currency} kept ${keptRange} (limits ${formatMoney(range.lower, currency)}–${formatMoney(range.upper, currency)})`
      })
      .filter(Boolean)
      .join(' · ')
  }, [filteredRows, outlierFilter, percentileBounds, selectedRows])

  const summary = useMemo(() => getSummary(filteredRows), [filteredRows])
  const tableRows = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase()
    return summary.filter((row) => {
      const values = {
        salesOrganization: row.salesOrganization,
        usage: row.usage,
        currency: row.currency,
        count: formatCount(row.count),
        value: formatMoney(row.value, row.currency),
      }
      return (
        (!lowerQuery ||
          Object.values(values).some((value) => value.toLowerCase().includes(lowerQuery))) &&
        Object.entries(tableFilters).every(
          ([key, value]) => !value || values[key] === value,
        )
      )
    })
  }, [query, summary, tableFilters])

  const kpis = useMemo(() => {
    const convertedRows = filteredRows.filter((row) => row.inr != null)
    return {
      quotations: filteredRows.length,
      totalInr: convertedRows.reduce((sum, row) => sum + row.inr, 0),
      organizations: new Set(filteredRows.map((row) => row.salesOrganization)).size,
      convertedCount: convertedRows.length,
      currencies: [...new Set(filteredRows.filter((row) => row.inr == null).map((row) => row.currency))],
    }
  }, [filteredRows])

  const chartEntries = useMemo(() => {
    const groups = new Map()
    for (const row of filteredRows) {
      const label = String(row[groupBy])
      const current = groups.get(label) ?? { label, count: 0, inr: 0 }
      current.count += 1
      if (row.inr != null) current.inr += row.inr
      groups.set(label, current)
    }
    return [...groups.values()]
  }, [filteredRows, groupBy])

  const countTotal = chartEntries.reduce((sum, entry) => sum + entry.count, 0)
  const inrTotal = chartEntries.reduce((sum, entry) => sum + entry.inr, 0)

  async function handleFiles(fileList) {
    const file = fileList?.[0]
    if (!file || isRestoring) return

    setError('')
    setStatus('')
    setIsReading(true)
    try {
      const imported = await readWorkbookInWorker(file)
      try {
        await saveWorkbook(file, imported.sheetName)
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'QuotaExceededError') {
          throw new Error(
            'Browser storage is full. The previous saved workbook was kept; clear site storage or upload a smaller workbook.',
            { cause: caught },
          )
        }
        throw new Error(
          `The workbook was read but could not be saved in this browser: ${
            caught instanceof Error ? caught.message : 'unknown storage error'
          }`,
          { cause: caught },
        )
      }

      const importedBounds = getDateBounds(imported.rows)
      setRows(imported.rows)
      setRawDataRows(imported.sourceRows ?? imported.rows)
      setRawDataSearch('')
      setRawDataSort({ key: 'date', direction: 'desc' })
      setRawDataSlicers({
        salesOrganization: '',
        usage: '',
        currency: '',
      })
      setRawDataView('raw')
      setSelections({
        organizations: [...new Set(imported.rows.map((row) => row.salesOrganization))],
        usages: [...new Set(imported.rows.map((row) => row.usage))],
        currencies: [...new Set(imported.rows.map((row) => row.currency))],
      })
      setDateFrom(importedBounds.min)
      setDateTo(importedBounds.min === importedBounds.max ? '' : importedBounds.max)
      setFileInfo({
        name: file.name,
        size: file.size,
        sheet: imported.sheetName,
      })
      setTableFilters({})
      setOutlierFilter('all')
      setQuery('')
      setStatus(
        `${formatCount(imported.rows.length)} quotation(s) loaded and saved in this browser${
          imported.repeatedItemRows
            ? ` · ${formatCount(imported.repeatedItemRows)} repeated item row(s) excluded`
            : ''
        }. Previous workbook replaced.`,
      )
      navigate('/dashboard')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The workbook could not be loaded.')
    } finally {
      setIsReading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function resetFilters() {
    setSelections({
      organizations: options.organizations,
      usages: options.usages,
      currencies: options.currencies,
    })
    setDateFrom(bounds.min)
    setDateTo(bounds.max === bounds.min ? '' : bounds.max)
    setQuery('')
    setTableFilters({})
    setOutlierFilter('all')
  }

  function downloadCsv() {
    const blob = new Blob(['\ufeff', makeCsv(tableRows)], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'quotation-summary.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function clearLocalData() {
    const confirmed = window.confirm(
      'Clear the saved workbook and all local report data from this browser? This cannot be undone.',
    )
    if (!confirmed) return

    try {
      await clearWorkbookData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The local data could not be cleared.')
      return
    }

    setRows([])
    setRawDataRows([])
    setRawDataSearch('')
    setRawDataSort({ key: 'date', direction: 'desc' })
    setRawDataSlicers({ salesOrganization: '', usage: '', currency: '' })
    setRawDataView('raw')
    setSelections({ organizations: [], usages: [], currencies: [] })
    setDateFrom('')
    setDateTo('')
    setGroupBy('salesOrganization')
    setQuery('')
    setTableFilters({})
    setOutlierFilter('all')
    setPercentileTail(5)
    setFileInfo(null)
    setStatus('Local workbook data cleared from this browser.')
    setError('')
    setIsReading(false)
    navigate('/')
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    void handleFiles(event.dataTransfer.files)
  }

  async function togglePresentationMode() {
    if (isPresenting) {
      setIsPresenting(false)
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen()
        } catch (caught) {
          setError(
            caught instanceof Error
              ? `Presentation layout ended, but full screen could not close: ${caught.message}`
              : 'Presentation layout ended, but full screen could not close.',
          )
        }
      }
      return
    }

    setIsPresenting(true)
    if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen()
      } catch {
        setStatus('Presentation layout is on. Press F11 to fill the screen.')
      }
    } else {
      setStatus('Presentation layout is on. Press F11 to fill the screen.')
    }
  }

  return (
    <div className={`app-shell theme-${theme}${isPresenting ? ' is-presenting' : ''}`}>
      <header className="topbar">
        <div className="topbar-left">
          <a className="brand" href="#" aria-label="QReport home">
            <span className="brand-mark"><Icon name="chart" size={20} /></span>
            <span className="brand-name">qreport<span>er</span></span>
          </a>
          {rows.length > 0 && (
            <nav aria-label="Main pages" className="topbar-nav">
              <NavLink className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`} to="/dashboard">Dashboard</NavLink>
              <NavLink className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`} to="/steps">Processing steps</NavLink>
              <NavLink className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`} to="/raw-data">Raw data</NavLink>
            </nav>
          )}
        </div>
        <div className="topbar-actions">
          {rows.length > 0 && (
            <>
              <button
                className="button button-outline"
                disabled={isReading || isRestoring}
                onClick={() => inputRef.current?.click()}
                type="button"
              >
                <Icon name="upload" size={16} />
                <span>Replace workbook</span>
              </button>
              <button
                className="button button-danger button-outline"
                disabled={isReading || isRestoring}
                onClick={clearLocalData}
                type="button"
              >
                Clear saved data
              </button>
            </>
          )}
          <div className="theme-menu" ref={themeMenuRef}>
            <button
              aria-controls="theme-options"
              aria-expanded={isThemeMenuOpen}
              aria-haspopup="menu"
              aria-label={`Color theme: ${theme}`}
              className="theme-toggle"
              onClick={() => setIsThemeMenuOpen((isOpen) => !isOpen)}
              ref={themeButtonRef}
              type="button"
            >
              <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={17} />
            </button>
            {isThemeMenuOpen && (
              <div className="theme-popover" id="theme-options" role="menu" aria-label="Color theme">
                {['light', 'dark'].map((option) => (
                  <button
                    aria-checked={theme === option}
                    className={`theme-option${theme === option ? ' is-selected' : ''}`}
                    key={option}
                    onClick={() => {
                      setTheme(option)
                      setIsThemeMenuOpen(false)
                    }}
                    role="menuitemradio"
                    type="button"
                  >
                    <Icon name={option === 'dark' ? 'moon' : 'sun'} size={16} />
                    <span>{option === 'dark' ? 'Dark mode' : 'Light mode'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="local-badge"><span /> Saved locally</div>
        </div>
      </header>

      <main className="workspace">
        {isRestoring ? (
          <section aria-live="polite" className="panel restore-card">
            Restoring the saved workbook from this browser…
          </section>
        ) : (
          <Routes>
            <Route
              path="/"
              element={
                <section
                  className={`welcome-screen ${dragging ? 'is-dragging' : ''}`}
                  onDragEnter={(event) => {
                    event.preventDefault()
                    setDragging(true)
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false)
                  }}
                  onDrop={handleDrop}
                >
                  <div className="welcome-copy">
                    <div className="eyebrow"><span className="eyebrow-line" /> QUOTATION INTELLIGENCE</div>
                    <h1>Your sales data,<br /><span>finally in focus.</span></h1>
                    <p>
                      Turn an SAP quotation workbook into an interactive report.
                      Your workbook stays in this browser — nothing is sent to a server.
                    </p>
                    <div className="welcome-actions">
                      <button
                        className="button button-primary button-large"
                        disabled={isReading || isRestoring}
                        onClick={() => inputRef.current?.click()}
                        type="button"
                      >
                        <Icon name="upload" size={18} />
                        {isReading ? 'Reading workbook…' : 'Upload workbook'}
                        {!isReading && <Icon name="arrow" size={16} />}
                      </button>
                      <span className="file-note">XLSX format · saved on this device</span>
                    </div>
                  </div>
                  <div className="upload-card">
                    <div className="upload-illustration">
                      <div className="illustration-sheet">
                        <span className="sheet-fold" />
                        <div className="sheet-grid">
                          <i /><i /><i /><i /><i /><i /><i /><i /><i />
                        </div>
                      </div>
                      <div className="floating-stat stat-one"><span className="stat-dot blue" /> Sales Org <strong>2070</strong></div>
                      <div className="floating-stat stat-two"><span className="stat-dot green" /> Quotations <strong>3,265</strong></div>
                    </div>
                    <button
                      className="drop-target"
                      disabled={isReading}
                      onClick={() => inputRef.current?.click()}
                      type="button"
                    >
                      <span className="drop-icon"><Icon name="file" size={20} /></span>
                      <span><strong>Drop your workbook here</strong><small>or browse files on your device</small></span>
                      <Icon name="arrow" size={16} />
                    </button>
                    <div className="requirements">
                      <span>Required columns</span>
                      <div className="required-chips">
                        {['Sales document', 'Sales Organization', 'Document Date', 'Document Currency', 'Net Value (Header)', 'Created By'].map((column) => (
                          <span key={column}><Icon name="check" size={12} />{column}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              }
            />
            <Route
              path="/dashboard"
              element={
                rows.length ? (
                  <>
                    <section className="page-heading">
              <div>
                <div className="eyebrow"><span className="eyebrow-line" /> SALES OVERVIEW</div>
                <h1>Quotation dashboard</h1>
                <p className="page-subtitle">
                  {dateFrom
                    ? dateTo
                      ? `${formatDateLabel(dateFrom)} — ${formatDateLabel(dateTo)}`
                      : `${formatDateLabel(dateFrom)} · single day`
                    : 'All available dates'}
                  {fileInfo && <span className="source-name"><Icon name="file" size={14} />{fileInfo.name}</span>}
                </p>
              </div>
              <div className="heading-actions">
                <button
                  aria-pressed={isPresenting}
                  className={`button ${isPresenting ? 'button-outline' : 'button-primary'} presentation-button`}
                  onClick={() => void togglePresentationMode()}
                  type="button"
                >
                  <Icon name="present" size={16} />
                  {isPresenting ? 'Exit presentation' : 'Present'}
                </button>
                <button className="button button-outline" onClick={downloadCsv} type="button">
                  <Icon name="download" size={16} /> Export CSV
                </button>
                <button
                  className="button button-primary"
                  disabled={isReading || isRestoring}
                  onClick={() => inputRef.current?.click()}
                  type="button"
                >
                  <Icon name="upload" size={16} /> Replace workbook
                </button>
              </div>
            </section>

            <section aria-label="Dashboard filters" className="panel filter-panel">
              <div className="filter-panel-title">
                <div className="filter-title-mark"><span /><span /><span /></div>
                <div><h2>Filters</h2><p>Refine your report</p></div>
              </div>
              <div className="filter-controls">
                <label className="date-filter">
                  <span>From</span>
                  <span className="date-input">
                    <Icon name="calendar" size={15} />
                    <input
                      aria-label="From date"
                      max={bounds.max || undefined}
                      min={bounds.min || undefined}
                      onChange={(event) => setDateFrom(event.target.value)}
                      type="date"
                      value={dateFrom}
                    />
                  </span>
                </label>
                <label className="date-filter">
                  <span>To</span>
                  <span className="date-input">
                    <Icon name="calendar" size={15} />
                    <input
                      aria-label="To date"
                      max={bounds.max || undefined}
                      min={bounds.min || undefined}
                      onChange={(event) => setDateTo(event.target.value)}
                      type="date"
                      value={dateTo}
                    />
                  </span>
                </label>
                {FILTERS.map((filter) => (
                  <MultiSelect
                    key={filter.key}
                    label={filter.label}
                    onChange={(values) =>
                      setSelections((current) => ({ ...current, [filter.key]: values }))
                    }
                    options={options[filter.key]}
                    selected={selections[filter.key]}
                  />
                ))}
                <label className="outlier-filter">
                  <span>Outlier filter</span>
                  <select
                    aria-label="Outlier filter"
                    onChange={(event) => setOutlierFilter(event.target.value)}
                    value={outlierFilter}
                  >
                    <option value="all">With outlier (include all)</option>
                    <option value="zero">Without 0 value quotations</option>
                    <option value="iqr">Without 1.5 IQR outliers</option>
                    <option value="mad">Without Modified Z-Score (MAD) outliers</option>
                    <option value="percentile">Percentile range</option>
                  </select>
                  {outlierFilter === 'percentile' && (
                    <span className="percentile-control">
                      <input
                        aria-label="Percent excluded from each percentile tail"
                        max="49"
                        min="0"
                        onChange={(event) => {
                          const value = Number(event.target.value)
                          if (event.target.value !== '' && Number.isFinite(value) && value >= 0 && value <= 49) {
                            setPercentileTail(value)
                          }
                        }}
                        step="0.5"
                        type="number"
                        value={percentileTail}
                      />
                      <span>%</span>
                    </span>
                  )}
                </label>
                <button className="reset-button" onClick={resetFilters} type="button">
                  <Icon name="close" size={14} /> Reset
                </button>
              </div>
              <div aria-live="polite" className="filter-feedback">
                {dateError ? (
                  <span className="error-inline">{dateError}</span>
                ) : (
                  <span>{formatCount(filteredRows.length)} quotations in view</span>
                )}
                {outlierFilter !== 'all' && !dateError && (
                  <span>
                    {formatCount(selectedRows.length - filteredRows.length)} quotation(s) excluded
                    {outlierFilter === 'iqr'
                      ? ' · 1.5×IQR per currency'
                      : outlierFilter === 'mad'
                        ? ' · Modified Z-Score, 3.5 cutoff per currency'
                        : ' · zero value'}
                  </span>
                )}
                {outlierFilter === 'percentile' && !dateError && (
                  <span className="percentile-range">
                    Excluded below {percentileTail}th / above {100 - percentileTail}th percentile
                    {percentileRangeSummary ? ` · value range: ${percentileRangeSummary}` : ''}
                  </span>
                )}
                {!dateError && !dateTo && dateFrom && <span className="single-day-hint">Blank To date shows one day</span>}
              </div>
            </section>

            <section aria-label="Quotation totals" className="kpi-grid">
              <article className="panel kpi-card">
                <div className="kpi-topline"><span>QUOTATIONS</span><span className="kpi-icon kpi-blue"><Icon name="file" /></span></div>
                <strong>{formatCount(kpis.quotations)}</strong>
                <small>Unique SAP sales documents</small>
                <div className="kpi-accent accent-blue" />
              </article>
              <article className="panel kpi-card">
                <div className="kpi-topline"><span>TOTAL VALUE · INR</span><span className="kpi-icon kpi-green">₹</span></div>
                <strong title={`₹${kpis.totalInr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>
                  {formatMoney(kpis.totalInr, 'INR')}
                </strong>
                <small>
                  {formatCount(kpis.convertedCount)} converted
                  {kpis.currencies.length > 0 && ` · not converted: ${kpis.currencies.join(', ')}`}
                </small>
                <div className="kpi-accent accent-green" />
              </article>
              <article className="panel kpi-card">
                <div className="kpi-topline"><span>SALES ORGANIZATIONS</span><span className="kpi-icon kpi-violet"><Icon name="chart" /></span></div>
                <strong>{formatCount(kpis.organizations)}</strong>
                <small>Distinct organizations in selection</small>
                <div className="kpi-accent accent-violet" />
              </article>
            </section>

            <section className="charts-section">
              <div className="section-heading">
                <div><h2>Performance breakdown</h2><p>Quotation volume and converted value across your selection</p></div>
                <div className="chart-controls">
                  <label className="group-select">
                    <span>Group charts by</span>
                    <select onChange={(event) => setGroupBy(event.target.value)} value={groupBy}>
                      {CHART_GROUPS.map((group) => <option key={group.key} value={group.key}>{group.label}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              <div className="chart-grid">
                <PieChart
                  entries={chartEntries}
                  groupLabel={CHART_GROUPS.find((group) => group.key === groupBy)?.label}
                  metric="count"
                />
                <PieChart
                  entries={chartEntries}
                  groupLabel={CHART_GROUPS.find((group) => group.key === groupBy)?.label}
                  metric="value"
                />
                <MetricChart
                  entries={chartEntries.map((entry) => ({ label: entry.label, value: entry.count }))}
                  id="count-chart"
                  metric="count"
                  subtitle={`Share of quotations by ${CHART_GROUPS.find((group) => group.key === groupBy)?.label}`}
                  title="Quotation volume"
                  total={countTotal}
                />
                <MetricChart
                  entries={chartEntries.map((entry) => ({ label: entry.label, value: entry.inr }))}
                  id="value-chart"
                  metric="value"
                  subtitle={`INR converted value by ${CHART_GROUPS.find((group) => group.key === groupBy)?.label}`}
                  title="Quotation value"
                  total={inrTotal}
                />
              </div>
            </section>

            <section className="panel table-panel">
              <div className="table-heading">
                <div><h2>Original-currency breakdown</h2><p>Totals stay separated by currency · exact values shown on hover</p></div>
                <div className="table-tools">
                  <label className="search-box">
                    <Icon name="search" size={16} />
                    <input
                      aria-label="Search summary"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search breakdown"
                      type="search"
                      value={query}
                    />
                  </label>
                  <span className="result-pill">{formatCount(tableRows.length)} rows</span>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        ['salesOrganization', 'Sales Organization'],
                        ['usage', 'Usage group'],
                        ['currency', 'Currency'],
                        ['count', 'Quotations'],
                        ['value', 'Total value'],
                      ].map(([key, label]) => {
                        const values = [...new Set(summary.map((row) =>
                          key === 'count'
                            ? formatCount(row.count)
                            : key === 'value'
                              ? formatMoney(row.value, row.currency)
                              : String(row[key]),
                        ))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                        return (
                          <th key={key} className={key === 'count' || key === 'value' ? 'align-right' : ''}>
                            <span>{label}</span>
                            <select
                              aria-label={`Filter table by ${label}`}
                              onChange={(event) =>
                                setTableFilters((current) => ({ ...current, [key]: event.target.value }))
                              }
                              value={tableFilters[key] ?? ''}
                            >
                              <option value="">All</option>
                              {values.map((value) => <option key={value} value={value}>{value}</option>)}
                            </select>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row) => (
                      <tr key={`${row.salesOrganization}-${row.usage}-${row.currency}`}>
                        <td><span className="org-cell"><i />{row.salesOrganization}</span></td>
                        <td><span className={`usage-pill ${row.usage.toLowerCase()}`}>{row.usage}</span></td>
                        <td><span className="currency-cell">{row.currency}</span></td>
                        <td className="align-right">{formatCount(row.count)}</td>
                        <td
                          className="align-right value-cell"
                          title={formatExactMoney(row.value, row.currency)}
                        >
                          {formatMoney(row.value, row.currency)}
                        </td>
                      </tr>
                    ))}
                    {tableRows.length === 0 && (
                      <tr><td className="empty-table" colSpan="5">No summary rows match these filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <span><i className="footer-dot" /> One row per Sales document · repeated item lines excluded</span>
                <span>INR amounts shown in Lacs / Cr <b>ⓘ</b></span>
              </div>
            </section>
                  </>
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/steps"
              element={
                rows.length ? (
                  <section className="panel pipeline-panel page-section">
                    <div className="section-heading">
                      <div>
                        <h2>Processing pipeline</h2>
                        <p>Select the preprocessing steps you want to review before the report is generated.</p>
                      </div>
                      <span className="result-pill">{selectedSteps.length} selected</span>
                    </div>
                    <div className="pipeline-content">
                      <div className="precheck-list">
                        {PREPROCESSING_STEPS.map((step) => (
                          <label className="precheck-item" key={step.id}>
                            <input
                              checked={selectedSteps.includes(step.id)}
                              onChange={() => togglePreprocessingStep(step.id)}
                              type="checkbox"
                            />
                            <span className="precheck-copy">
                              <strong>{step.label}</strong>
                              <small>{step.description}</small>
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="pipeline-summary">
                        <h3>Active steps</h3>
                        {selectedSteps.length > 0 ? (
                          <ul>
                            {selectedSteps.map((stepId) => (
                              <li key={stepId}>{PREPROCESSING_STEPS.find((step) => step.id === stepId)?.label}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>No preprocessing steps selected.</p>
                        )}
                      </div>
                    </div>
                  </section>
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/raw-data"
              element={
                rows.length ? (
                  <section className="panel preview-panel page-section">
                    <div className="table-heading">
                      <div>
                        <h2>Workbook data</h2>
                        <p>Compare the original workbook with the processed quotation dataset.</p>
                      </div>
                      <span className="result-pill">
                        {rawDataView === 'raw'
                          ? `${formatCount(visibleRawRows.length)} / ${formatCount(rawDataRows.length)} rows`
                          : `${formatCount(filteredRows.length)} processed rows`}
                      </span>
                    </div>
                    <div className="raw-data-toolbar">
                      <div className="view-toggle" role="tablist" aria-label="Data view selector">
                        <button
                          className={rawDataView === 'raw' ? 'is-active' : ''}
                          onClick={() => setRawDataView('raw')}
                          type="button"
                        >
                          Raw workbook
                        </button>
                        <button
                          className={rawDataView === 'processed' ? 'is-active' : ''}
                          onClick={() => setRawDataView('processed')}
                          type="button"
                        >
                          Processed data
                        </button>
                      </div>
                      <div className="raw-data-tools">
                        <label className="search-box">
                          <Icon name="search" size={16} />
                          <input
                            aria-label="Search raw data"
                            onChange={(event) => setRawDataSearch(event.target.value)}
                            placeholder="Search rows"
                            type="search"
                            value={rawDataSearch}
                          />
                        </label>
                        <div className="raw-data-slicers">
                          <select
                            aria-label="Filter by sales organization"
                            onChange={(event) => setRawDataSlicers((current) => ({ ...current, salesOrganization: event.target.value }))}
                            value={rawDataSlicers.salesOrganization}
                          >
                            <option value="">All organizations</option>
                            {rawDataOptions.salesOrganization.map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </select>
                          <select
                            aria-label="Filter by usage group"
                            onChange={(event) => setRawDataSlicers((current) => ({ ...current, usage: event.target.value }))}
                            value={rawDataSlicers.usage}
                          >
                            <option value="">All usages</option>
                            {rawDataOptions.usage.map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </select>
                          <select
                            aria-label="Filter by currency"
                            onChange={(event) => setRawDataSlicers((current) => ({ ...current, currency: event.target.value }))}
                            value={rawDataSlicers.currency}
                          >
                            <option value="">All currencies</option>
                            {rawDataOptions.currency.map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </select>
                        </div>
                        <button
                          className="button button-outline"
                          onClick={() => {
                            setRawDataSearch('')
                            setRawDataSlicers({ salesOrganization: '', usage: '', currency: '' })
                          }}
                          type="button"
                        >
                          Clear filters
                        </button>
                      </div>
                    </div>
                    <div className="table-scroll preview-scroll raw-data-grid">
                      <table>
                        <thead>
                          <tr>
                            {[
                              { key: 'document', label: 'Sales document' },
                              { key: 'createdBy', label: 'Created By' },
                              { key: 'salesOrganization', label: 'Sales Organization' },
                              { key: 'usage', label: 'Usage group' },
                              { key: 'currency', label: 'Currency' },
                              { key: 'date', label: 'Date' },
                              { key: 'amount', label: 'Amount' },
                              { key: 'inr', label: 'INR' },
                            ].map((column) => (
                              <th key={column.key}>
                                <button
                                  className="sort-header"
                                  onClick={() =>
                                    setRawDataSort((current) => ({
                                      key: column.key,
                                      direction: current.key === column.key && current.direction === 'asc' ? 'desc' : 'asc',
                                    }))
                                  }
                                  type="button"
                                >
                                  <span>{column.label}</span>
                                  {rawDataSort.key === column.key && (
                                    <span className="sort-indicator">{rawDataSort.direction === 'asc' ? '↑' : '↓'}</span>
                                  )}
                                </button>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(rawDataView === 'raw' ? visibleRawRows : filteredRows).map((row, index) => (
                            <tr key={rawDataView === 'raw' ? `${row.document || 'row'}-${row.rowNumber ?? index}` : `${row.document}-${row.salesOrganization}-${row.usage}-${row.currency}-${index}`}>
                              <td>{row.document || '—'}</td>
                              <td>{row.createdBy || '—'}</td>
                              <td>{row.salesOrganization || '—'}</td>
                              <td>{row.usage || '—'}</td>
                              <td>{row.currency || '—'}</td>
                              <td>{row.date || '—'}</td>
                              <td>{Number.isFinite(row.amount) ? formatMoney(row.amount, row.currency) : '—'}</td>
                              <td>{row.inr != null ? formatMoney(row.inr, 'INR') : '—'}</td>
                            </tr>
                          ))}
                          {((rawDataView === 'raw' ? visibleRawRows : filteredRows).length === 0) && (
                            <tr><td className="empty-table" colSpan="8">No matching rows found.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}

        {(status || error) && (
          <div aria-live="polite" className={`toast ${error ? 'toast-error' : ''}`}>
            <span className="toast-icon"><Icon name={error ? 'close' : 'check'} size={15} /></span>
            <span>{error || status}</span>
            {error && <button aria-label="Dismiss error" onClick={() => setError('')} type="button"><Icon name="close" size={14} /></button>}
          </div>
        )}

        <footer className="app-footer">
          <span><b>qreporter</b> · SAP quotation analytics</span>
          <span><i /> Your spreadsheet stays on this device</span>
        </footer>
      </main>

      <input
        aria-label="Upload an XLSX workbook"
        className="visually-hidden"
        onChange={(event) => void handleFiles(event.target.files)}
        ref={inputRef}
        type="file"
      />
    </div>
  )
}

export default App
