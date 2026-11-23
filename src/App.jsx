import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BrowserRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
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
import {
  getAvailableProcurementReports,
  PROCUREMENT_REPORTS,
} from './lib/procurementReports'
import { readWorkbookInWorker } from './lib/workbookClient'
import {
  clearWorkbookData,
  createWorkbookFile,
  loadWorkbook,
  saveWorkbook,
} from './lib/workbookStorage'
import { useAppStore } from './store/useAppStore'
import {
  ProcurementReportCatalog,
  ProcurementReportDashboard,
} from './ProcurementReports'
import PrintPreviewDialog from './PrintPreviewDialog'
import ReportErrorBoundary from './ReportErrorBoundary'
import ReportExportMenu from './ReportExportMenu'
import ReportInsightsSummary from './ReportInsightsSummary'
import { exportReportsToHtml, exportRowsToExcel } from './lib/reportExport'
import './App.css'

const FILTERS = [
  { key: 'organizations', label: 'Sales Organization', rowKey: 'salesOrganization' },
  { key: 'usages', label: 'Usage group', rowKey: 'usage' },
  { key: 'currencies', label: 'Currency', rowKey: 'currency' },
]

function ProcurementReportRoute({ reports, columns, fileName, summaryTables, isPresenting, navigate, onPreviewPrint, onTogglePresentation }) {
  const { reportId } = useParams()
  const fields = new Set(columns.map((column) => column.field).filter(Boolean))
  const availableReports = getAvailableProcurementReports(reports, fields)
  const report = availableReports.find((item) => item.id === reportId)

  if (!report) {
    const knownReport = reports.find((item) => item.id === reportId)
    return (
      <section className="panel procurement-report-unavailable">
        <div className="eyebrow"><span className="eyebrow-line" /> PROCUREMENT REPORT</div>
        <h1>{knownReport?.title ?? 'Report unavailable'}</h1>
        <p>
          {knownReport
            ? 'This workbook is missing one or more fields required to build this report. Return to the report library to see which reports are supported.'
            : 'This report link is invalid or no longer available.'}
        </p>
        <button className="button button-primary" onClick={() => navigate('/reports')} type="button">Back to reports</button>
      </section>
    )
  }

  return (
    <ProcurementReportDashboard
      columns={columns}
      fileName={fileName}
      isPresenting={isPresenting}
      navigate={navigate}
      onPreviewPrint={onPreviewPrint}
      onTogglePresentation={onTogglePresentation}
      report={report}
      summaryTables={summaryTables}
    />
  )
}

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

const REPORT_CARDS = [
  {
    id: 'overview',
    title: 'Quotation overview',
    description: 'Review quotation volume, converted value, and organization performance.',
    groupBy: 'salesOrganization',
    icon: 'chart',
  },
  {
    id: 'usage',
    title: 'Config Usage Dashboard',
    description: 'Compare manual quotations with configurator-generated quotations.',
    groupBy: 'usage',
    icon: 'check',
  },
  {
    id: 'currency',
    title: 'Currency breakdown',
    description: 'Explore quotation volume and converted value across currencies.',
    groupBy: 'currency',
    icon: 'file',
  },
  {
    id: 'trend',
    title: 'Trend analysis',
    description: 'Track quotation volume and converted value across time brackets.',
    groupBy: 'trend',
    icon: 'chart',
  },
]

const TREND_INTERVALS = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
  { key: 'quarter', label: 'Quarterly' },
  { key: 'year', label: 'Yearly' },
  { key: 'custom', label: 'Custom range' },
]

function getTrendBucket(dateValue, interval) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue ?? ''))) return null
  const [year, month, day] = dateValue.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (interval === 'day') return { key: dateValue, label: formatDateLabel(dateValue) }
  if (interval === 'week') {
    const mondayOffset = (date.getUTCDay() + 6) % 7
    date.setUTCDate(date.getUTCDate() - mondayOffset)
    const key = date.toISOString().slice(0, 10)
    return { key, label: `Week of ${formatDateLabel(key)}` }
  }
  if (interval === 'quarter') {
    const quarter = Math.floor((month - 1) / 3) + 1
    const key = `${year}-Q${quarter}`
    return { key, label: `Q${quarter} ${year}` }
  }
  if (interval === 'year') {
    const key = String(year)
    return { key, label: key }
  }
  const key = `${year}-${String(month).padStart(2, '0')}`
  return { key, label: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }) }
}

function UsageTrendChart({ title, subtitle, series, formatValue }) {
  const width = 760
  const height = 300
  const inset = { top: 18, right: 18, bottom: 34, left: 54 }
  const plotWidth = width - inset.left - inset.right
  const plotHeight = height - inset.top - inset.bottom
  const visibleSeries = series.filter((item) => item.visible !== false)
  const pointCount = Math.max(0, ...visibleSeries.map((item) => item.points.length))
  const maximum = Math.max(0, ...visibleSeries.flatMap((item) => item.points.map((point) => Number.isFinite(point.value) ? point.value : 0)))
  const labelIndexes = pointCount <= 8
    ? Array.from({ length: pointCount }, (_, index) => index)
    : [...new Set([0, Math.round((pointCount - 1) / 3), Math.round((pointCount - 1) * 2 / 3), pointCount - 1])]
  return (
    <article className="panel trend-chart-panel">
      <div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>
      <div className="trend-legend" aria-label="Usage series">
        {visibleSeries.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}
      </div>
      {pointCount ? (
        <div className="trend-chart-scroll">
          <svg aria-label={title} className="trend-line-chart" role="img" viewBox={`0 0 ${width} ${height}`}>
            {Array.from({ length: 5 }, (_, index) => {
              const y = inset.top + plotHeight * index / 4
              const value = maximum * (4 - index) / 4
              return <g key={index}><line className="trend-grid-line" x1={inset.left} x2={width - inset.right} y1={y} y2={y} /><text className="trend-axis-label" textAnchor="end" x={inset.left - 8} y={y + 4}>{formatValue(value)}</text></g>
            })}
            {visibleSeries.map((item) => {
              const validPoints = item.points.flatMap((point, index) => Number.isFinite(point.value) ? [{
                ...point,
                x: inset.left + (pointCount < 2 ? plotWidth / 2 : index / (pointCount - 1) * plotWidth),
                y: inset.top + plotHeight - (maximum ? point.value / maximum : 0) * plotHeight,
              }] : [])
              const path = validPoints.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
              return <g key={item.key}><path d={path} fill="none" stroke={item.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />{validPoints.map((point) => <circle cx={point.x} cy={point.y} fill={item.color} key={point.key} r="4"><title>{`${item.label} · ${point.label}: ${formatValue(point.value)}`}</title></circle>)}</g>
            })}
            {labelIndexes.map((index) => {
              const item = series.find((entry) => entry.points[index])
              const point = item?.points[index]
              if (!point) return null
              const x = inset.left + (pointCount < 2 ? plotWidth / 2 : index / (pointCount - 1) * plotWidth)
              return <text className="trend-axis-label" key={`${point.key}-${index}`} textAnchor={index === 0 ? 'start' : index === pointCount - 1 ? 'end' : 'middle'} x={x} y={height - 7}>{point.label}</text>
            })}
          </svg>
        </div>
      ) : <div className="chart-empty">No dated quotations match these filters.</div>}
    </article>
  )
}

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
  const menuRef = useRef(null)
  const selectedCount = selected.length
  const summary =
    selectedCount === options.length
      ? 'All'
      : selectedCount === 0
        ? 'None'
        : `${selectedCount} selected`

  useEffect(() => {
    function closeOnOutsidePointer(event) {
      if (!menuRef.current?.contains(event.target)) {
        menuRef.current.open = false
      }
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [])

  function toggle(value) {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    )
  }

  return (
    <details className="filter-menu" ref={menuRef}>
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

const SUMMARY_EXPORT_COLUMNS = [
  ['Sales Organization', (row) => row.salesOrganization],
  ['Usage group', (row) => row.usage],
  ['Currency', (row) => row.currency],
  ['Quotations', (row) => row.count],
  ['Total value (original currency)', (row) => row.value],
]

function makeCsv(rows) {
  const columns = SUMMARY_EXPORT_COLUMNS
  const escapeCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  return [
    columns.map(([label]) => escapeCell(label)).join(','),
    ...rows.map((row) => columns.map(([, getValue]) => escapeCell(getValue(row))).join(',')),
  ].join('\r\n')
}

function compareRawDataValues(left, right, key) {
  const numericKeys = new Set(['amount', 'inr'])

  if (numericKeys.has(key)) {
    const parseNumericCell = (value) => {
      if (typeof value === 'number') return value
      const text = String(value ?? '').replace(/[,\s₹$€£]/g, '')
      return Number(text)
    }
    const leftNumber = parseNumericCell(left)
    const rightNumber = parseNumericCell(right)
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber
    }
  }

  const leftText = String(left ?? '')
  const rightText = String(right ?? '')
  return leftText.localeCompare(rightText, undefined, { numeric: true, sensitivity: 'base' })
}

const PROCESSED_DATA_COLUMNS = [
  { key: 'document', label: 'Sales document' },
  { key: 'createdBy', label: 'Created By' },
  { key: 'salesOrganization', label: 'Sales Organization' },
  { key: 'usage', label: 'Usage group' },
  { key: 'currency', label: 'Currency' },
  { key: 'date', label: 'Date' },
  { key: 'amount', label: 'Amount' },
  { key: 'inr', label: 'INR' },
]

function getDataCellValue(row, column, view, datasetType) {
  if (view === 'raw') {
    return row.sourceValues?.[column.sourceIndex] ?? '—'
  }
  if (datasetType === 'procurement') {
    const value = column.field
      ? row[column.field]
      : row.sourceValues?.[column.sourceIndex]
    return value == null || value === '' ? '—' : String(value)
  }
  if (column.key === 'amount') {
    return Number.isFinite(row.amount) ? formatMoney(row.amount, row.currency) : '—'
  }
  if (column.key === 'inr') {
    return row.inr != null ? formatMoney(row.inr, 'INR') : '—'
  }
  return row[column.key] || '—'
}

function summarizeSelectedValues(selected, options) {
  if (selected.length === options.length) return 'All'
  return selected.length ? selected.join(', ') : 'None'
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
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false)
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false)
  const [trendInterval, setTrendInterval] = useState('month')
  const [trendUsageSelection, setTrendUsageSelection] = useState(['CONFIGURATOR', 'MANUAL'])
  const [selectedSteps, setSelectedSteps] = useState(() => PREPROCESSING_STEPS.map((step) => step.id))
  const [rawDataRows, setRawDataRows] = useState([])
  const [rawDataColumns, setRawDataColumns] = useState([])
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
  const datasetType = useAppStore((state) => state.datasetType)
  const summaryTables = useAppStore((state) => state.summaryTables)
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
  const setDatasetType = useAppStore((state) => state.setDatasetType)
  const setSummaryTables = useAppStore((state) => state.setSummaryTables)
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
        setDatasetType(imported.datasetType ?? savedWorkbook.datasetType ?? 'quotation')
        setSummaryTables(imported.summaryTables ?? null)
        setRawDataRows(imported.sourceRows ?? imported.rows)
        setRawDataColumns(imported.sourceColumns ?? [])
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
    setDatasetType,
    setSummaryTables,
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
    if ((rows.length > 0 || datasetType === 'procurement') && location.pathname === '/') {
      navigate('/reports', { replace: true })
    }
  }, [datasetType, location.pathname, navigate, rows.length])

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
    salesOrganization: [...new Set(rawDataRows.map((row) => row.salesOrganization).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    usage: [...new Set(rawDataRows.map((row) => row.usage).filter(Boolean))].sort(),
    currency: [...new Set(rawDataRows.map((row) => row.currency).filter(Boolean))].sort(),
  }), [rawDataRows])
  const displayedDataColumns = datasetType === 'procurement'
    ? rawDataView === 'raw' ? rawDataColumns : rawDataColumns.filter((column) => column.field)
    : rawDataView === 'raw' ? rawDataColumns : PROCESSED_DATA_COLUMNS

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
          sourceValues: row.sourceValues?.join(' '),
        }).some((value) => String(value).toLowerCase().includes(query))

        const matchesSalesOrganization = !rawDataSlicers.salesOrganization || row.salesOrganization === rawDataSlicers.salesOrganization
        const matchesUsage = !rawDataSlicers.usage || row.usage === rawDataSlicers.usage
        const matchesCurrency = !rawDataSlicers.currency || row.currency === rawDataSlicers.currency

        return matchesQuery && matchesSalesOrganization && matchesUsage && matchesCurrency
      })
      .sort((a, b) => {
        const direction = rawDataSort.direction === 'asc' ? 1 : -1
        const sourceColumn = rawDataColumns.find((column) => column.key === rawDataSort.key)
        const left = sourceColumn ? a.sourceValues?.[sourceColumn.sourceIndex] : a[rawDataSort.key]
        const right = sourceColumn ? b.sourceValues?.[sourceColumn.sourceIndex] : b[rawDataSort.key]
        return compareRawDataValues(left, right, rawDataSort.key) * direction
      })
  }, [rawDataColumns, rawDataRows, rawDataSearch, rawDataSlicers, rawDataSort])

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

  const trendRows = useMemo(() => {
    const grouped = new Map()
    for (const row of filteredRows) {
      const bucket = getTrendBucket(row.date, trendInterval === 'custom' ? 'day' : trendInterval)
      if (!bucket) continue
      const point = grouped.get(bucket.key) ?? {
        ...bucket,
        CONFIGURATOR: { count: 0, inr: 0, convertedCount: 0 },
        MANUAL: { count: 0, inr: 0, convertedCount: 0 },
      }
      const usage = row.usage === 'CONFIGURATOR' ? 'CONFIGURATOR' : 'MANUAL'
      point[usage].count += 1
      if (row.inr != null) {
        point[usage].inr += row.inr
        point[usage].convertedCount += 1
      }
      grouped.set(bucket.key, point)
    }
    return [...grouped.values()].sort((left, right) => left.key.localeCompare(right.key))
  }, [filteredRows, trendInterval])
  const trendSeries = useMemo(() => [
    {
      key: 'CONFIGURATOR',
      label: 'Config',
      color: '#3455a6',
      visible: trendUsageSelection.includes('CONFIGURATOR'),
      points: trendRows.map((point) => ({ key: point.key, label: point.label, value: point.CONFIGURATOR.count })),
    },
    {
      key: 'MANUAL',
      label: 'Manual',
      color: '#ba6037',
      visible: trendUsageSelection.includes('MANUAL'),
      points: trendRows.map((point) => ({ key: point.key, label: point.label, value: point.MANUAL.count })),
    },
  ], [trendRows, trendUsageSelection])
  const trendValueSeries = useMemo(() => [
    {
      key: 'CONFIGURATOR',
      label: 'Config',
      color: '#3455a6',
      visible: trendUsageSelection.includes('CONFIGURATOR'),
      points: trendRows.map((point) => ({ key: point.key, label: point.label, value: point.CONFIGURATOR.convertedCount ? point.CONFIGURATOR.inr : Number.NaN })),
    },
    {
      key: 'MANUAL',
      label: 'Manual',
      color: '#ba6037',
      visible: trendUsageSelection.includes('MANUAL'),
      points: trendRows.map((point) => ({ key: point.key, label: point.label, value: point.MANUAL.convertedCount ? point.MANUAL.inr : Number.NaN })),
    },
  ], [trendRows, trendUsageSelection])
  const trendInsights = useMemo(() => {
    const totals = trendRows.reduce((result, point) => {
      for (const usage of ['CONFIGURATOR', 'MANUAL']) {
        result[usage].count += point[usage].count
        result[usage].inr += point[usage].inr
        result[usage].convertedCount += point[usage].convertedCount
      }
      return result
    }, {
      CONFIGURATOR: { count: 0, inr: 0, convertedCount: 0 },
      MANUAL: { count: 0, inr: 0, convertedCount: 0 },
    })
    const total = totals.CONFIGURATOR.count + totals.MANUAL.count
    const configShare = total ? totals.CONFIGURATOR.count / total * 100 : 0
    const valueShare = totals.CONFIGURATOR.inr + totals.MANUAL.inr
      ? totals.CONFIGURATOR.inr / (totals.CONFIGURATOR.inr + totals.MANUAL.inr) * 100
      : null
    return {
      configShare,
      valueShare,
      countDifference: totals.CONFIGURATOR.count - totals.MANUAL.count,
      config: totals.CONFIGURATOR,
      manual: totals.MANUAL,
    }
  }, [trendRows])
  const trendIntervalLabel = trendInterval === 'custom'
    ? `Custom range (${dateFrom ? formatDateLabel(dateFrom) : 'start'}${dateTo ? ` – ${formatDateLabel(dateTo)}` : ''})`
    : TREND_INTERVALS.find((item) => item.key === trendInterval)?.label ?? 'Monthly'

  const countTotal = chartEntries.reduce((sum, entry) => sum + entry.count, 0)
  const inrTotal = chartEntries.reduce((sum, entry) => sum + entry.inr, 0)
  const dominantCountGroup = [...chartEntries].sort((left, right) => right.count - left.count)[0]
  const dominantValueGroup = [...chartEntries].sort((left, right) => Math.abs(right.inr) - Math.abs(left.inr))[0]
  const conversionCoverage = kpis.quotations ? kpis.convertedCount / kpis.quotations * 100 : 0
  const quotationDecisionHelpers = groupBy === 'trend'
    ? [
      `Config is ${trendInsights.configShare.toFixed(1)}% of dated filtered quotation volume (${formatCount(trendInsights.config.count)} of ${formatCount(trendInsights.config.count + trendInsights.manual.count)}). Review whether the mix matches the team’s adoption target.`,
      `${formatCount(kpis.convertedCount)} of ${formatCount(kpis.quotations)} quotations (${conversionCoverage.toFixed(1)}%) contribute to converted INR trends; investigate unconverted currencies before comparing value trends.`,
    ]
    : [
      ...(dominantCountGroup
        ? [`${dominantCountGroup.label} has the highest volume: ${formatCount(dominantCountGroup.count)} quotations (${countTotal ? (dominantCountGroup.count / countTotal * 100).toFixed(1) : '0.0'}%). Use it as the first segment to review.`]
        : []),
      ...(dominantValueGroup
        ? [`${dominantValueGroup.label} has the highest converted INR value (${formatMoney(dominantValueGroup.inr, 'INR')}); verify the conversion rate and underlying documents before acting.`]
        : []),
      `${formatCount(kpis.convertedCount)} of ${formatCount(kpis.quotations)} quotations (${conversionCoverage.toFixed(1)}%) contribute to the INR total. Resolve unconverted currencies before using value rankings for decisions.`,
    ]

  async function handleFiles(fileList) {
    const file = fileList?.[0]
    if (!file || isRestoring) return

    setError('')
    setStatus('')
    setIsReading(true)
    try {
      const imported = await readWorkbookInWorker(file)
      try {
        await saveWorkbook(file, imported.sheetName, imported.datasetType)
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
      setDatasetType(imported.datasetType ?? 'quotation')
      setSummaryTables(imported.summaryTables ?? null)
      setRawDataRows(imported.sourceRows ?? imported.rows)
      setRawDataColumns(imported.sourceColumns ?? [])
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
      setTrendUsageSelection(['CONFIGURATOR', 'MANUAL'])
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
        `${formatCount(imported.rows.length)} ${
          imported.datasetType === 'procurement' ? 'procurement source row(s)' : 'quotation(s)'
        } loaded and saved in this browser${
          imported.repeatedItemRows
            ? ` · ${formatCount(imported.repeatedItemRows)} repeated item row(s) excluded`
            : ''
        }. Previous workbook replaced.`,
      )
      navigate('/reports')
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
    setTrendUsageSelection(['CONFIGURATOR', 'MANUAL'])
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

  async function downloadExcel() {
    await exportRowsToExcel(tableRows, SUMMARY_EXPORT_COLUMNS, 'quotation-summary')
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
    setRawDataColumns([])
    setRawDataSearch('')
    setRawDataSort({ key: 'date', direction: 'desc' })
    setRawDataSlicers({ salesOrganization: '', usage: '', currency: '' })
    setRawDataView('raw')
    setSelections({ organizations: [], usages: [], currencies: [] })
    setDatasetType('quotation')
    setSummaryTables(null)
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
          <a className="brand" href="#" aria-label="Config Usage Dashboard home">
            <span className="brand-mark"><Icon name="chart" size={20} /></span>
            <span className="brand-name">Config Usage Dashboard</span>
          </a>
          {(rows.length > 0 || datasetType === 'procurement') && (
            <nav aria-label="Main pages" className="topbar-nav">
              <NavLink className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`} to="/reports">Reports</NavLink>
              {datasetType !== 'procurement' && (
                <>
                  <NavLink className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`} to="/dashboard">Dashboard</NavLink>
                  <NavLink className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`} to="/steps">Processing steps</NavLink>
                </>
              )}
              <NavLink className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`} to="/raw-data">Raw data</NavLink>
            </nav>
          )}
        </div>
        <div className="topbar-actions">
          {(rows.length > 0 || datasetType === 'procurement') && (
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

      <main className={`workspace${location.pathname === '/' ? ' welcome-workspace' : ''}${location.pathname !== '/' && location.pathname !== '/reports' && location.pathname !== '/reports/' ? ' compact-workspace' : ''}`}>
        {isRestoring ? (
          <section aria-live="polite" className="panel restore-card">
            Restoring the saved workbook from this browser…
          </section>
        ) : (
          <ReportErrorBoundary key={location.pathname} onBack={() => navigate('/reports')}>
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
                    <div className="eyebrow"><span className="eyebrow-line" /> Quotation & procurement reporting</div>
                    <h1>Reports for your<br /><span>SAP workbook.</span></h1>
                    <p>
                      Turn an SAP quotation or procurement workbook into interactive reports.
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
                      <span className="file-note">XLSX format · quotation or procurement · saved on this device</span>
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
                      <div className="floating-stat stat-one"><span className="stat-dot blue" /> Workbook <strong>SAP</strong></div>
                      <div className="floating-stat stat-two"><span className="stat-dot green" /> Reports <strong>Auto-detected</strong></div>
                    </div>
                    <div className="drop-target">
                      <span className="drop-icon"><Icon name="file" size={20} /></span>
                      <span><strong>Drop your workbook here</strong><small>Use the Upload workbook button above to browse</small></span>
                    </div>
                    <div className="requirements">
                      <span>Supported workbook types · detected automatically</span>
                      <div className="workbook-requirement-list">
                        <p>
                          <b>Quotation reports</b>
                          <span>Sales document · Sales Organization · Document Date · Document Currency · Net Value (Header) · Created By</span>
                        </p>
                        <p>
                          <b>Procurement MIS</b>
                          <span>Plant · Vendor or Name · PO no. · PO Item No. · add PR / GRN / MIRO / GST / payment / logistics fields to unlock matching reports</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              }
            />
            <Route
              path="/reports"
              element={
                datasetType === 'procurement' ? (
                  <ProcurementReportCatalog
                    columns={rawDataColumns}
                    fileName={fileInfo?.name}
                    navigate={navigate}
                    sourceRowCount={summaryTables?.sourceRecordCount ?? rows.length}
                    summaryTables={summaryTables}
                  />
                ) : rows.length ? (
                  <section aria-labelledby="report-selection-title" className="report-selection">
                    <div className="report-selection-heading">
                      <div>
                        <div className="eyebrow"><span className="eyebrow-line" /> REPORT LIBRARY</div>
                        <h1 id="report-selection-title">Choose a report</h1>
                        <p>
                          Explore different views of {fileInfo?.name || 'your quotation workbook'}.
                          {' '}Choose a report to get started.
                        </p>
                      </div>
                      <div className="report-selection-summary">
                        <span>Loaded dataset</span>
                        <strong>{formatCount(rows.length)} quotations</strong>
                        <small>{formatCount(options.organizations.length)} sales organizations</small>
                      </div>
                    </div>
                    <div className="report-card-grid">
                      {REPORT_CARDS.map((report, index) => (
                        <button
                          className={`report-card report-card-${report.id}`}
                          key={report.id}
                          onClick={() => {
                            setGroupBy(report.groupBy)
                            if (report.id === 'trend') setTrendInterval('month')
                            navigate('/dashboard')
                          }}
                          type="button"
                        >
                          <span className="report-card-topline">
                            <span className="report-card-icon"><Icon name={report.icon} size={20} /></span>
                            <span className="report-card-label">REPORT 0{index + 1}</span>
                          </span>
                          <span className="report-card-copy">
                            <strong>{report.title}</strong>
                            <span>{report.description}</span>
                          </span>
                          <span className="report-card-meta">
                            {report.id === 'trend'
                              ? `${formatCount(rows.filter((row) => row.date).length)} dated quotations · Config vs Manual`
                              : report.id === 'overview'
                              ? `${formatCount(options.organizations.length)} organizations · ${formatCount(options.currencies.length)} currencies`
                              : report.id === 'usage'
                                ? `${formatCount(options.usages.length)} usage groups · ${formatCount(rows.length)} quotations`
                                : `${formatCount(options.currencies.length)} currencies · ${formatCount(rows.length)} quotations`}
                          </span>
                          <span className="report-required-columns">
                            <strong>Required columns</strong>
                            {report.id === 'overview'
                              ? 'Sales Organization, Usage group, Currency, Net Value (Header)'
                              : report.id === 'usage'
                                ? 'Usage group, Sales Organization, Currency, Net Value (Header)'
                                : 'Currency, Net Value (Header), Sales Organization'}
                          </span>
                          <span className="report-card-action">
                            Open report <Icon name="arrow" size={16} />
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="report-selection-note">
                      Reports are generated in your browser from the currently loaded workbook.
                    </p>
                  </section>
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/reports/:reportId"
              element={
                datasetType === 'procurement' ? (
                  <ProcurementReportRoute
                    columns={rawDataColumns}
                    fileName={fileInfo?.name}
                    isPresenting={isPresenting}
                    navigate={navigate}
                    onPreviewPrint={() => setIsPrintPreviewOpen(true)}
                    onTogglePresentation={togglePresentationMode}
                    reports={PROCUREMENT_REPORTS}
                    summaryTables={summaryTables}
                  />
                ) : <Navigate to="/reports" replace />
              }
            />
            <Route
              path="/dashboard"
              element={
                datasetType !== 'procurement' && rows.length ? (
                  <>
                    <section className="page-heading">
              <div>
                <div className="eyebrow">
                  <span className="eyebrow-line" />
                  {groupBy === 'trend'
                    ? 'TIME SERIES'
                    : groupBy === 'usage'
                    ? 'USAGE ANALYSIS'
                    : groupBy === 'currency'
                      ? 'CURRENCY ANALYSIS'
                      : 'SALES OVERVIEW'}
                </div>
                <h1>
                  {groupBy === 'trend'
                    ? 'Quotation trend analysis'
                    : groupBy === 'usage'
                    ? 'Config Usage Dashboard'
                    : groupBy === 'currency'
                      ? 'Currency breakdown'
                      : 'Quotation overview'}
                </h1>
                <p className="page-subtitle">
                  {dateFrom
                    ? dateTo
                      ? `${formatDateLabel(dateFrom)} — ${formatDateLabel(dateTo)}`
                      : `${formatDateLabel(dateFrom)} · single day`
                    : 'All available dates'}
                  {fileInfo && <span className="source-name"><Icon name="file" size={14} />{fileInfo.name}</span>}
                </p>
                <div className="print-filter-summary">
                  <strong>Applied filters:</strong>
                  <span>
                    Date range: {dateFrom
                      ? `${formatDateLabel(dateFrom)}${dateTo ? ` — ${formatDateLabel(dateTo)}` : ' (single day)'}`
                      : dateTo
                        ? `Through ${formatDateLabel(dateTo)}`
                        : 'All available dates'}
                  </span>
                  <span>Sales organization: {summarizeSelectedValues(selections.organizations, options.organizations)}</span>
                  <span>{groupBy === 'trend' ? 'Compare usage: ' : 'Usage group: '}{summarizeSelectedValues(selections.usages, options.usages)}</span>
                  <span>Currency: {summarizeSelectedValues(selections.currencies, options.currencies)}</span>
                  <span>
                    Outlier filter: {({
                      all: 'Include all values',
                      zero: 'Exclude zero-value quotations',
                      iqr: 'Exclude 1.5 IQR outliers',
                      mad: 'Exclude Modified Z-Score (MAD) outliers',
                      percentile: `Percentile range (${percentileTail}%–${100 - percentileTail}%)`,
                    })[outlierFilter]}
                  </span>
                </div>
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
                <ReportExportMenu
                  onExportCsv={downloadCsv}
                  onExportExcel={downloadExcel}
                  onExportHtml={() => exportReportsToHtml({
                    title: groupBy === 'trend' ? 'Quotation trend analysis' : groupBy === 'usage' ? 'Config Usage Dashboard' : groupBy === 'currency' ? 'Currency breakdown' : 'Quotation overview',
                    subtitle: `${fileInfo?.name || 'Quotation workbook'} · ${filteredRows.length.toLocaleString('en-IN')} quotations matching the current filters.`,
                    fileName: 'quotation-report',
                    dashboard: {
                      reportTitle: groupBy === 'trend' ? 'Quotation trend analysis' : groupBy === 'usage' ? 'Config Usage Dashboard' : groupBy === 'currency' ? 'Currency breakdown' : 'Quotation overview',
                      category: 'Quotation analysis',
                      number: REPORT_CARDS.findIndex((item) => item.groupBy === groupBy) + 1,
                      filters: [
                        `Date range: ${dateFrom ? `${formatDateLabel(dateFrom)}${dateTo ? ` — ${formatDateLabel(dateTo)}` : ' (single day)'}` : dateTo ? `Through ${formatDateLabel(dateTo)}` : 'All available dates'}`,
                        `Sales organization: ${summarizeSelectedValues(selections.organizations, options.organizations)}`,
                        `${groupBy === 'trend' ? 'Compare usage' : 'Usage group'}: ${groupBy === 'trend' ? trendUsageSelection.map((usage) => usage === 'CONFIGURATOR' ? 'Config' : 'Manual').join(', ') || 'None' : summarizeSelectedValues(selections.usages, options.usages)}`,
                        `Currency: ${summarizeSelectedValues(selections.currencies, options.currencies)}`,
                        `Outlier filter: ${{ all: 'Include all values', zero: 'Exclude zero-value quotations', iqr: 'Exclude 1.5 IQR outliers', mad: 'Exclude Modified Z-Score (MAD) outliers', percentile: `Percentile range (${percentileTail}%–${100 - percentileTail}%)` }[outlierFilter]}`,
                      ],
                      kpis: [
                        { label: 'Quotations', value: formatCount(kpis.quotations), description: 'Unique SAP sales documents' },
                        { label: 'Total value · INR', value: formatMoney(kpis.totalInr, 'INR'), description: `${formatCount(kpis.convertedCount)} converted${kpis.currencies.length ? ` · not converted: ${kpis.currencies.join(', ')}` : ''}` },
                        { label: 'Sales organizations', value: formatCount(kpis.organizations), description: 'Distinct organizations in selection' },
                      ],
                      quotationCharts: groupBy === 'trend' ? null : {
                        dimension: CHART_GROUPS.find((group) => group.key === groupBy)?.label,
                        countTotal: formatCount(countTotal),
                        valueTotal: formatMoney(inrTotal, 'INR'),
                        entries: chartEntries.map((entry) => ({
                          label: entry.label,
                          count: entry.count,
                          value: entry.inr,
                          countLabel: formatCount(entry.count),
                          valueLabel: formatMoney(entry.inr, 'INR'),
                        })),
                      },
                      trendCharts: groupBy === 'trend' ? {
                        interval: trendIntervalLabel,
                        series: trendSeries.map((item) => ({ ...item, points: item.points.map((point) => ({ ...point, valueLabel: formatCount(point.value) })) })),
                        valueSeries: trendValueSeries.map((item) => ({ ...item, points: item.points.map((point) => ({ ...point, valueLabel: Number.isFinite(point.value) ? formatMoney(point.value, 'INR') : 'No converted data' })) })),
                        insights: [
                          `Config share of quotations: ${trendInsights.configShare.toFixed(1)}% (${formatCount(trendInsights.config.count)} Config and ${formatCount(trendInsights.manual.count)} Manual).`,
                          `Config share of converted INR value: ${trendInsights.valueShare == null ? 'unavailable' : `${trendInsights.valueShare.toFixed(1)}%`}.`,
                          `Volume difference: ${trendInsights.countDifference > 0 ? '+' : ''}${formatCount(trendInsights.countDifference)} Config minus Manual.`,
                        ],
                      } : null,
                      insights: groupBy === 'trend'
                        ? []
                        : [
                          `${formatCount(kpis.quotations)} quotations match the active filters; ${formatCount(kpis.organizations)} sales organizations are represented.`,
                          `${formatCount(kpis.convertedCount)} quotations (${conversionCoverage.toFixed(1)}%) have a configured INR conversion.`,
                          ...(dominantCountGroup ? [`Largest volume group: ${dominantCountGroup.label}, ${formatCount(dominantCountGroup.count)} quotations.`] : []),
                          ...(dominantValueGroup ? [`Largest converted value group: ${dominantValueGroup.label}, ${formatMoney(dominantValueGroup.inr, 'INR')}.`] : []),
                        ],
                      decisionHelpers: quotationDecisionHelpers,
                      tableTitle: groupBy === 'trend' ? 'Trend data' : 'Original-currency breakdown',
                      tableDescription: groupBy === 'trend'
                        ? `${trendRows.length.toLocaleString('en-IN')} ${trendIntervalLabel.toLowerCase()} brackets · Config and Manual compared side by side`
                        : `${tableRows.length.toLocaleString('en-IN')} rows · totals are separated by currency.`,
                      rows: groupBy === 'trend' ? trendRows : tableRows,
                      snapshot: {
                        type: 'quotations',
                        rows,
                        selections,
                        dateFrom,
                        dateTo,
                        groupBy,
                        outlierFilter,
                        percentileTail,
                        trendInterval,
                        trendUsageSelection,
                        options,
                      },
                      columns: groupBy === 'trend' ? [
                        { label: 'Time bracket', getValue: (row) => row.label },
                        { label: 'Config quotations', getValue: (row) => formatCount(row.CONFIGURATOR.count) },
                        { label: 'Manual quotations', getValue: (row) => formatCount(row.MANUAL.count) },
                        { label: 'Config value (INR)', getValue: (row) => row.CONFIGURATOR.convertedCount ? formatMoney(row.CONFIGURATOR.inr, 'INR') : '—' },
                        { label: 'Manual value (INR)', getValue: (row) => row.MANUAL.convertedCount ? formatMoney(row.MANUAL.inr, 'INR') : '—' },
                      ] : SUMMARY_EXPORT_COLUMNS.map(([label, getValue]) => ({
                        label,
                        getValue: (row) => label === 'Total value (original currency)' ? formatExactMoney(getValue(row), row.currency) : getValue(row),
                      })),
                      rowLink: groupBy === 'trend' ? null : (row) => `${window.location.origin}/dashboard?groupBy=${encodeURIComponent(groupBy)}#${encodeURIComponent(row.salesOrganization || row.usage || row.currency || '')}`,
                      metrics: [],
                    },
                  })}
                  onPreview={() => setIsPrintPreviewOpen(true)}
                />
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

            <section aria-label="Presentation filters" className="presentation-filters">
              <MultiSelect
                label="Sales Organization"
                onChange={(values) =>
                  setSelections((current) => ({ ...current, organizations: values }))
                }
                options={options.organizations}
                selected={selections.organizations}
              />
              <label className="outlier-filter">
                <span>Outlier filter</span>
                <select
                  aria-label="Presentation outlier filter"
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
                {FILTERS.filter((filter) => groupBy !== 'trend' || filter.key !== 'usages').map((filter) => (
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
                {groupBy === 'trend' && (
                  <MultiSelect
                    label="Compare usage"
                    onChange={(values) => setTrendUsageSelection(values)}
                    options={['CONFIGURATOR', 'MANUAL'].filter((usage) => options.usages.includes(usage))}
                    selected={trendUsageSelection.filter((usage) => options.usages.includes(usage))}
                  />
                )}
                {groupBy === 'trend' && (
                  <label className="outlier-filter trend-interval-control">
                    <span>Time bracket</span>
                    <select onChange={(event) => setTrendInterval(event.target.value)} value={trendInterval}>
                      {TREND_INTERVALS.map((interval) => <option key={interval.key} value={interval.key}>{interval.label}</option>)}
                    </select>
                  </label>
                )}
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

            {groupBy === 'trend' ? (
              <>
                <section aria-label="Quotation trends" className="charts-section trend-section">
                  <div className="section-heading">
                    <div><h2>Quotation activity over time</h2><p>{trendIntervalLabel} totals for the active report filters</p></div>
                    <span className="result-pill">{formatCount(trendRows.length)} time brackets</span>
                  </div>
                  <div className="trend-chart-grid">
                    <UsageTrendChart
                      formatValue={(value) => formatCount(value)}
                      series={trendSeries}
                      title="Quotation volume"
                      subtitle="Compare Config and Manual quotations in each time bracket"
                    />
                    <UsageTrendChart
                      formatValue={(value) => formatMoney(value, 'INR')}
                      series={trendValueSeries}
                      title="Converted quotation value"
                      subtitle="Compare converted INR value for Config and Manual quotations"
                    />
                  </div>
                </section>
                <section className="trend-insights-grid" aria-label="Config and Manual insights">
                  <article className="panel trend-insight-card"><span>Config share of quotations</span><strong>{trendInsights.configShare.toFixed(1)}%</strong><small>{formatCount(trendInsights.config.count)} Config · {formatCount(trendInsights.manual.count)} Manual</small></article>
                  <article className="panel trend-insight-card"><span>Config share of converted value</span><strong>{trendInsights.valueShare == null ? '—' : `${trendInsights.valueShare.toFixed(1)}%`}</strong><small>{trendInsights.config.convertedCount ? formatMoney(trendInsights.config.inr, 'INR') : 'No Config conversions'} · {trendInsights.manual.convertedCount ? formatMoney(trendInsights.manual.inr, 'INR') : 'No Manual conversions'}</small></article>
                  <article className="panel trend-insight-card"><span>Volume difference</span><strong>{trendInsights.countDifference > 0 ? '+' : ''}{formatCount(trendInsights.countDifference)}</strong><small>Config minus Manual across the selected time range</small></article>
                </section>
                <section className="panel table-panel trend-table-panel">
                  <div className="table-heading">
                    <div><h2>Trend data</h2><p>One row per {TREND_INTERVALS.find((item) => item.key === trendInterval)?.label.toLowerCase()} bracket</p></div>
                    <span className="result-pill">{formatCount(trendRows.length)} brackets</span>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Time bracket</th><th className="align-right">Config quotations</th><th className="align-right">Manual quotations</th><th className="align-right">Config value (INR)</th><th className="align-right">Manual value (INR)</th></tr></thead>
                      <tbody>
                        {trendRows.map((point) => <tr key={point.key}><td>{point.label}</td><td className="align-right">{formatCount(point.CONFIGURATOR.count)}</td><td className="align-right">{formatCount(point.MANUAL.count)}</td><td className="align-right">{point.CONFIGURATOR.convertedCount ? formatMoney(point.CONFIGURATOR.inr, 'INR') : '—'}</td><td className="align-right">{point.MANUAL.convertedCount ? formatMoney(point.MANUAL.inr, 'INR') : '—'}</td></tr>)}
                        {!trendRows.length && <tr><td className="empty-table" colSpan="5">No dated quotations match these filters.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="table-footer"><span><i className="footer-dot" /> Date brackets use the selected calendar interval</span><span>{formatCount(filteredRows.length)} quotations in view</span></div>
                </section>
              </>
            ) : <section className="charts-section">
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
            </section>}

            {groupBy !== 'trend' && <section className="panel table-panel">
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
            </section>}
            <ReportInsightsSummary
              chartRules={groupBy === 'trend'
                ? [
                  `The trend charts use ${trendIntervalLabel.toLowerCase()} date buckets and compare Config with Manual quotations.`,
                  'Quotation volume counts unique sales documents; value charts sum only rows with a configured INR conversion.',
                  'Config share and volume difference use the filtered time-series totals; value share uses converted INR totals only.',
                  'For more than 8 time buckets, the line chart labels 4 dates while retaining every plotted point. Outlier thresholds are 1.5 × IQR, Modified Z-Score 3.5, or the selected percentile tails, calculated per currency.',
                ]
                : [
                  `Charts group the filtered quotations by ${CHART_GROUPS.find((group) => group.key === groupBy)?.label ?? groupBy}.`,
                  'Count charts show unique sales documents; value charts show converted INR amounts and omit unconverted currencies.',
                  'Pie percentages use the visible chart total as their denominator; the currency table keeps original-currency totals separate.',
                  'Outlier thresholds are 1.5 × IQR, Modified Z-Score 3.5, or the selected percentile tails, calculated per currency.',
                ]}
              insights={groupBy === 'trend'
                ? [
                  `Config represents ${trendInsights.configShare.toFixed(1)}% of filtered quotations (${formatCount(trendInsights.config.count)} Config and ${formatCount(trendInsights.manual.count)} Manual).`,
                  `Config minus Manual volume: ${trendInsights.countDifference > 0 ? '+' : ''}${formatCount(trendInsights.countDifference)} quotations.`,
                  `Config share of converted value: ${trendInsights.valueShare == null ? 'unavailable' : `${trendInsights.valueShare.toFixed(1)}%`}.`,
                ]
                : [
                  `${formatCount(kpis.quotations)} unique quotations match the active filters.`,
                  `${formatCount(kpis.convertedCount)} quotations contribute to the INR total; currencies without a configured rate are excluded from that total.`,
                  `${formatCount(kpis.organizations)} distinct sales organizations are represented.`,
                ]}
              decisionHelpers={quotationDecisionHelpers}
              kpis={[
                { label: 'Quotations', definition: 'Count of unique SAP sales documents after the active date, organization, usage, currency, and outlier filters.' },
                { label: 'Total value · INR', definition: 'Sum of net header values converted to INR using configured rates; unconverted currencies are excluded and listed on the KPI.' },
                { label: 'Sales organizations', definition: 'Distinct sales organizations among the filtered quotations.' },
              ]}
            />
                  </>
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/steps"
              element={
                datasetType !== 'procurement' && rows.length ? (
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
                (datasetType === 'procurement' || rows.length) ? (
                  <section className="panel preview-panel page-section">
                    <div className="table-heading">
                      <div>
                        <h2>{datasetType === 'procurement' ? 'Procurement workbook data' : 'Workbook data'}</h2>
                        <p>
                          {datasetType === 'procurement'
                            ? 'Inspect the original procurement workbook or its normalized fields.'
                            : 'Compare the original workbook with the processed quotation dataset.'}
                        </p>
                      </div>
                      <span className="result-pill">
                        {rawDataView === 'raw'
                          ? `${formatCount(visibleRawRows.length)} / ${formatCount(rawDataRows.length)} rows`
                          : `${formatCount(datasetType === 'procurement' ? visibleRawRows.length : filteredRows.length)} processed rows`}
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
                            aria-label={datasetType === 'procurement' ? 'Filter by plant' : 'Filter by sales organization'}
                            onChange={(event) => setRawDataSlicers((current) => ({ ...current, salesOrganization: event.target.value }))}
                            value={rawDataSlicers.salesOrganization}
                          >
                            <option value="">{datasetType === 'procurement' ? 'All plants' : 'All organizations'}</option>
                            {rawDataOptions.salesOrganization.map((value) => (
                              <option key={value} value={value}>{value}</option>
                            ))}
                          </select>
                          <select
                            aria-label={datasetType === 'procurement' ? 'Filter by material group' : 'Filter by usage group'}
                            onChange={(event) => setRawDataSlicers((current) => ({ ...current, usage: event.target.value }))}
                            value={rawDataSlicers.usage}
                          >
                            <option value="">{datasetType === 'procurement' ? 'All material groups' : 'All usages'}</option>
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
                            {displayedDataColumns.map((column) => (
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
                          {(rawDataView === 'raw' || datasetType === 'procurement' ? visibleRawRows : filteredRows).map((row, index) => (
                            <tr key={rawDataView === 'raw' ? `${row.document || 'row'}-${row.rowNumber ?? index}` : `${row.document}-${row.salesOrganization}-${row.usage}-${row.currency}-${index}`}>
                              {displayedDataColumns.map((column) => (
                                <td key={column.key}>
                                  {getDataCellValue(row, column, rawDataView, datasetType)}
                                </td>
                              ))}
                            </tr>
                          ))}
                          {((rawDataView === 'raw' || datasetType === 'procurement' ? visibleRawRows : filteredRows).length === 0) && (
                            <tr><td className="empty-table" colSpan={displayedDataColumns.length}>No matching rows found.</td></tr>
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
          </ReportErrorBoundary>
        )}

        {(status || error) && (
          <div aria-live="polite" className={`toast ${error ? 'toast-error' : ''}`}>
            <span className="toast-icon"><Icon name={error ? 'close' : 'check'} size={15} /></span>
            <span>{error || status}</span>
            {error && <button aria-label="Dismiss error" onClick={() => setError('')} type="button"><Icon name="close" size={14} /></button>}
          </div>
        )}

        <footer className="app-footer">
          <span><b>Config Usage Dashboard</b> · SAP reporting</span>
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
      <PrintPreviewDialog
        onClose={() => setIsPrintPreviewOpen(false)}
        open={isPrintPreviewOpen}
      />
    </div>
  )
}

export default App
