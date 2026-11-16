import { useEffect, useMemo, useState } from 'react'
import {
  getProcurementFieldLabel,
  getProcurementMeasure,
  getAvailableProcurementReports,
  PROCUREMENT_FILTERS,
  PROCUREMENT_REPORTS,
} from './lib/procurementReports'
import { formatCount } from './lib/reportData'

function getAvailableFilters(report, fields) {
  return PROCUREMENT_FILTERS.filter(
    ([field]) => report.filterFields.includes(field) && fields.has(field),
  )
}

function getReportDateField(report, fields) {
  if (report.dateField === false) return ''
  if (fields.has(report.dateField)) return report.dateField
  return ['miroPostingDate', 'grnDate', 'poDate', 'prDate'].find((field) => fields.has(field)) ?? ''
}

function getReportDisplayColumns(report, columns) {
  const calculatedFields = new Set([
    'orderedQuantity', 'receivedQuantity', 'pendingQuantity', 'fulfillmentRate', 'grnNumbers', 'grnCount',
    'miroNumbers', 'miroCount', 'tatStage', 'startDate', 'endDate', 'tatDays',
    'exceptionType', 'severity', 'issueDetails', 'poItemCount', 'grnValue', 'grnQuantity',
    'miroValue', 'gst', 'clearingDays',
  ])
  const selected = report.tableFields.flatMap((field) => {
    if (calculatedFields.has(field)) {
      return [{ key: field, field, label: getProcurementFieldLabel(field) }]
    }
    const column = columns.find((item) => item.field === field)
    return column ? [column] : []
  })
  const seen = new Set()
  const distinct = selected.filter((column) => {
    if (seen.has(column.field)) return false
    seen.add(column.field)
    return true
  })
  return distinct.slice(0, 20)
}

function matchesSearch(row, columns, search) {
  if (!search) return true
  const lower = search.toLowerCase()
  return columns.some((column) =>
    String(row[column.field] ?? row.sourceValues?.[column.sourceIndex] ?? '')
      .toLowerCase()
      .includes(lower),
  )
}

function getMetricValue(row, metric) {
  if (metric.key === 'gst') {
    return ['miroCgst', 'miroSgst', 'miroUgst', 'miroIgst']
      .reduce((sum, field) => sum + (Number(row[field]) || 0), 0)
  }
  if (metric.key === 'recordCount') return 1
  if (metric.key === 'poQuantity') return Number(row.poQuantity) || 0
  if (metric.key === 'tatDays') return Number(row.tatDays)
  if (metric.key === 'clearingDays') {
    if (!validDaysForRow(row)) return Number.NaN
    const start = Date.parse(`${row.miroPostingDate}T00:00:00Z`)
    const end = Date.parse(`${row.clearingDate}T00:00:00Z`)
    return (end - start) / 86_400_000
  }
  if (metric.key === 'grnCount') return Number(row.grnCount) || 0
  if (metric.key === 'miroCount') return Number(row.miroCount) || 0
  if (metric.key === 'poItemCount') return Number(row.poItemCount) || 0
  return getProcurementMeasure(row, metric.key)
}

function isMetricAvailable(metric, fields) {
  if (!metric.fields.length) return true
  if (metric.anyOf || metric.kind === 'distinct' && metric.fields.length === 2) {
    return metric.fields.some((field) => fields.has(field))
  }
  return metric.fields.every((field) => fields.has(field))
}

function getMetricTotal(rows, metric, fields) {
  if (metric.kind === 'distinct') {
    const distinctFields = metric.fields.filter(
      (field) => fields.has(field) || rows.some((row) => field in row),
    )
    const values = rows.map((row) => distinctFields.map((field) => row[field] ?? '').join('|'))
    return new Set(values.filter(Boolean)).size
  }
  const values = rows.map((row) => getMetricValue(row, metric)).filter(Number.isFinite)
  if (metric.kind === 'average') {
    const valid = metric.key === 'clearingDays'
      ? rows.filter(validDaysForRow).map((row) => getMetricValue(row, metric)).filter(Number.isFinite)
      : values.filter((value) => value >= 0)
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
  }
  return values.reduce((sum, value) => sum + value, 0)
}

function getCurrencyTotals(rows, metric, fields) {
  if (metric.kind !== 'currency') return [['', getMetricTotal(rows, metric, fields)]]
  const totals = new Map()
  for (const row of rows) {
    const currency = row.currency || row.conversionCurrency || 'Unspecified currency'
    totals.set(currency, (totals.get(currency) ?? 0) + getMetricValue(row, metric))
  }
  return [...totals.entries()]
}

function formatMetric(value, metric, currency = '') {
  if (value == null || !Number.isFinite(value)) return '—'
  if (metric.kind === 'currency') {
    return `${currency && currency !== 'Unspecified currency' ? `${currency} ` : ''}${value.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }
  if (metric.kind === 'average') return `${value.toFixed(1)} days`
  if (metric.kind === 'percentage') return `${value.toFixed(1)}%`
  return formatCount(value)
}

function formatReportDate(value) {
  if (/^\d{4}-\d{2}$/.test(String(value ?? ''))) {
    const [year, month] = value.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
  }
  return String(value ?? '')
}

function getMetricChoices(report, fields, rows) {
  const summarizedFields = new Set(fields)
  if (report.summaryTable === 'tatEvents' && rows.some((row) => Number.isFinite(row.tatDays))) {
    summarizedFields.add('tatDays')
    summarizedFields.add('tatStage')
  }
  if (report.summaryTable === 'qualityExceptions') summarizedFields.add('exceptionType')
  return report.metrics.filter((metric) =>
    isMetricAvailable(metric, summarizedFields),
  )
}

function getMetricGroups(rows, metric, dimension) {
  const groups = new Map()
  for (const row of rows) {
    const value = getMetricValue(row, metric)
    if (!Number.isFinite(value) || metric.kind === 'average' && value < 0) continue
    const label = String(row[dimension] ?? 'Unspecified')
    const currency = metric.kind === 'currency'
      ? row.currency || row.conversionCurrency || 'Unspecified currency'
      : ''
    const key = `${label}|${currency}`
    const current = groups.get(key) ?? {
      label,
      currency,
      value: 0,
      count: 0,
    }
    if (metric.kind === 'average' && metric.key === 'clearingDays' && !validDaysForRow(row)) continue
    current.value += value
    current.count += 1
    groups.set(key, current)
  }
  const grouped = [...groups.values()].map((group) => ({
    ...group,
    value: metric.kind === 'average' && group.count ? group.value / group.count : group.value,
  }))
  if (metric.kind !== 'currency') {
    return grouped
      .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
      .slice(0, 8)
  }
  const byCurrency = new Map()
  for (const group of grouped) {
    const items = byCurrency.get(group.currency) ?? []
    items.push(group)
    byCurrency.set(group.currency, items)
  }
  return [...byCurrency.values()].flatMap((items) =>
    items.sort((left, right) => Math.abs(right.value) - Math.abs(left.value)).slice(0, 8),
  )
}

function getReportLevelLabel(report) {
  if (report.summaryTable === 'qualityExceptions') return 'exception level'
  if (report.summaryTable === 'tatEvents') return 'stage interval level'
  if (report.summaryTable === 'vendorPerformance') return 'vendor and currency level'
  if (report.summaryTable === 'poGrnMiro') return 'PO item level'
  if (report.summaryTable === 'poItems') return 'PO item level'
  if (report.summaryTable === 'miroDocuments') return 'MIRO document level'
  if (['purchaseByMaterial', 'purchaseByMaterialGroup', 'purchaseByPlant', 'purchaseByVendor'].includes(report.summaryTable)) {
    return 'group summary level'
  }
  return `${report.transaction.toUpperCase()} document level`
}

function getReportInsights(report, rows, fields) {
  if (!rows.length) {
    return ['No source records match the selected filters. Clear filters or choose a wider date range.']
  }
  if (report.id === 'data-quality') {
    const issues = new Map()
    for (const row of rows) issues.set(row.exceptionType, (issues.get(row.exceptionType) ?? 0) + 1)
    return issues.size
      ? [...issues.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 4)
        .map(([type, count]) => `${type}: ${formatCount(count)} record(s) to review.`)
      : ['No configured data-quality exceptions were found in the uploaded records.']
  }
  if (report.id === 'order-fulfillment') {
    const pending = rows.filter((row) => row.pendingQuantity > 0).length
    const excess = rows.filter((row) => row.pendingQuantity < 0).length
    return [
      `${formatCount(pending)} PO item(s) have pending GRN quantity; ${formatCount(excess)} show net receipts above the order quantity.`,
      'Receipt quantity is net of recognized reversal and return movements; confirm movement conventions for this extract.',
    ]
  }
  if (report.id === 'invoice-tax') {
    return [
      'GST totals use the uploaded MIRO tax amount fields and remain grouped by source currency.',
      'Clearing time is derived from valid posting and clearing dates; imported day totals are omitted because they can be stale or inconsistent.',
      'Blank clearing references are not treated as confirmed unpaid invoices.',
    ]
  }
  if (report.id === 'tat-analysis') {
    const invalid = rows.filter((row) => row.tatDays < 0).length
    const stages = [...new Set(rows.map((row) => row.tatStage).filter(Boolean))]
    const insights = [
      'Turnaround time is elapsed calendar days between the displayed stage start and end dates.',
      stages.length
        ? `Stages measured: ${stages.join(', ')}.`
        : 'No complete linked date pairs were found for the selected filters.',
      `${formatCount(invalid)} stage(s) have an end date earlier than the start date and should be checked.`,
    ]
    if (!fields.has('vendorFinalizationDate')) {
      insights.splice(2, 0, 'PO-to-vendor-finalization TAT is not calculated because no vendor confirmation/finalization date column was recognized.')
    }
    return insights
  }
  return ['Values are calculated from the imported PO-item summaries; currencies are kept separate.']
}

function exportRows(rows, columns, report) {
  const cell = (value) => {
    const text = String(value ?? '')
    const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text
    return `"${safeText.replace(/"/g, '""')}"`
  }
  const content = [
    columns.map((column) => cell(column.label)).join(','),
    ...rows.map((row) =>
      columns
        .map((column) => cell(formatTableValue(row[column.field] ?? row.sourceValues?.[column.sourceIndex], column.field)))
        .join(','),
    ),
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${report.id}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

function formatTableValue(value, field) {
  if (value == null || value === '') return ''
  if (['poDate', 'grnDate', 'invoiceDate', 'miroDocumentDate', 'miroPostingDate', 'clearingDate', 'startDate', 'endDate'].includes(field)) {
    return formatReportDate(value)
  }
  if (field === 'tatDays' || field === 'clearingDays') return Number.isFinite(Number(value)) ? Number(value).toFixed(1) : ''
  if (['poQuantity', 'orderedQuantity', 'receivedQuantity', 'pendingQuantity', 'grnQuantity', 'miroQuantity'].includes(field)) {
    return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-IN', { maximumFractionDigits: 3 }) : value
  }
  return value
}

export function ProcurementReportCatalog({ summaryTables, sourceRowCount, columns, fileName, navigate }) {
  const fields = useMemo(
    () => new Set(columns.map((column) => column.field).filter(Boolean)),
    [columns],
  )
  const [query, setQuery] = useState('')
  const availableReports = useMemo(
    () => getAvailableProcurementReports(PROCUREMENT_REPORTS, fields),
    [fields],
  )
  const filteredReports = useMemo(() => {
    const search = query.trim().toLowerCase()
    return availableReports.filter((report) =>
      !search ||
      `${report.number} ${report.title} ${report.description} ${report.tags.join(' ')}`
        .toLowerCase()
        .includes(search),
    )
  }, [availableReports, query])

  return (
    <section aria-labelledby="procurement-library-title" className="report-selection procurement-library">
      <div className="report-selection-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> Procurement MIS</div>
          <h1 id="procurement-library-title">Procurement report library</h1>
          <p>
            Six focused reports built from {fileName || 'your procurement workbook'}.
            Only reports supported by the uploaded columns are shown.
          </p>
        </div>
        <div className="report-selection-summary">
          <span>Loaded procurement data</span>
          <strong>{formatCount(sourceRowCount)} source rows</strong>
          <small>{formatCount(columns.length)} source columns · stored locally</small>
        </div>
      </div>

      <label className="report-search">
        <span className="sr-only">Search reports</span>
        <input
          aria-label="Search reports"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search reports or tags"
          type="search"
          value={query}
        />
      </label>

      <div aria-live="polite" className="report-results-count">
        Showing {filteredReports.length} of {availableReports.length} supported reports
      </div>
      <div className="report-card-grid procurement-report-grid">
        {filteredReports.map((report) => {
          return (
            <article className="report-card procurement-report-card" key={report.id}>
              <span className="report-card-topline">
                <span className="report-card-number">{report.number}</span>
                <span className="report-card-label">{report.category}</span>
              </span>
              <span className="report-card-copy">
                <strong>{report.title}</strong>
                <span>{report.description}</span>
              </span>
              <span className="procurement-report-tags">
                {report.tags.map((item) => <span key={item}>{item}</span>)}
              </span>
              <span className="report-readiness">
                {formatCount(summaryTables?.[report.summaryTable]?.length ?? 0)} summarized records
              </span>
              <button
                className="report-card-action"
                onClick={() => navigate(`/reports/${report.id}`)}
                type="button"
              >
                View report <span aria-hidden="true">→</span>
              </button>
            </article>
          )
        })}
        {filteredReports.length === 0 && (
          <p className="report-empty">
            {availableReports.length === 0
              ? 'No reports are supported by this workbook. Add PO, GRN, MIRO, or date fields to unlock applicable reports.'
              : 'No reports match your search.'}
          </p>
        )}
      </div>
      <p className="report-selection-note">
        KPIs and charts use import-time document summaries. Values in different currencies are never added together.
      </p>
    </section>
  )
}

const TAT_STAGE_ORDER = [
  'PR to PO',
  'PO to vendor finalization',
  'PO to GRN/MRN',
  'GRN/MRN to MIRO invoice',
  'MIRO invoice to clearing',
]

function groupByCurrency(entries) {
  const groups = new Map()
  for (const entry of entries) {
    const currency = entry.currency || 'Unspecified currency'
    const items = groups.get(currency) ?? []
    items.push(entry)
    groups.set(currency, items)
  }
  return [...groups.entries()]
}

function ProcurementBarChart({ title, subtitle, entries, metric }) {
  const series = metric.kind === 'currency'
    ? groupByCurrency(entries)
    : [['', entries]]
  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div><h2>{title}</h2><p>{subtitle}</p></div>
      </div>
      {series.map(([currency, currencyEntries]) => {
        const maximum = Math.max(...currencyEntries.map((entry) => Math.abs(entry.value)), 0)
        return (
          <div className="procurement-chart-series" key={currency || 'all'}>
            {currency && <h3>{currency}</h3>}
            <div className="bar-list">
              {currencyEntries.map((entry, index) => (
                <div className="bar-entry" key={entry.label}>
                  <div className="bar-meta">
                    <span className="bar-label" title={entry.label}>
                      <i className={`legend-dot tone-${index}`} />
                      {entry.label}
                    </span>
                    <span className="bar-number">{formatMetric(entry.value, metric, currency)}</span>
                  </div>
                  <div className="bar-track" role="img" aria-label={`${entry.label}: ${formatMetric(entry.value, metric, currency)}`}>
                    <span className={`bar-fill tone-${index}`} style={{ width: `${maximum ? Math.max(2, Math.abs(entry.value) / maximum * 100) : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {!entries.length && <div className="chart-empty">No data for this selection.</div>}
      {metric.kind === 'currency' && (
        <div className="chart-footnote">Each currency has its own scale; values are not converted or compared across currencies.</div>
      )}
    </section>
  )
}

function getTatStageSummaries(rows) {
  const groups = new Map()
  for (const row of rows) {
    const days = Number(row.tatDays)
    if (!row.tatStage || !Number.isFinite(days) || days < 0) continue
    const values = groups.get(row.tatStage) ?? []
    values.push(days)
    groups.set(row.tatStage, values)
  }
  return TAT_STAGE_ORDER.flatMap((stage) => {
    const values = groups.get(stage)
    if (!values?.length) return []
    const ordered = [...values].sort((a, b) => a - b)
    const middle = Math.floor(ordered.length / 2)
    const median = ordered.length % 2
      ? ordered[middle]
      : (ordered[middle - 1] + ordered[middle]) / 2
    return [{
      stage,
      count: values.length,
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
      median,
    }]
  })
}

function ProcurementTatStageFlow({ rows }) {
  const stages = getTatStageSummaries(rows)
  const averageMetric = { kind: 'average' }
  return (
    <section className="panel chart-panel procurement-stage-panel">
      <div className="panel-heading">
        <div><h2>Stage sequence</h2><p>Median duration and completed intervals</p></div>
      </div>
      {stages.length ? (
        <ol className="procurement-stage-flow">
          {stages.map((stage, index) => (
            <li key={stage.stage}>
              <span className="procurement-stage-marker">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{stage.stage}</strong>
                <small>{formatCount(stage.count)} intervals · median {formatMetric(stage.median, averageMetric)}</small>
              </div>
              <span className="procurement-stage-average">
                <small>Average</small>
                {formatMetric(stage.average, averageMetric)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="chart-empty">No completed intervals match these filters.</div>
      )}
    </section>
  )
}

export function ProcurementReportDashboard({ report, summaryTables, columns, navigate, fileName, isPresenting, onTogglePresentation }) {
  const rows = useMemo(
    () => summaryTables?.[report.summaryTable] ?? [],
    [report.summaryTable, summaryTables],
  )
  const fieldSet = useMemo(
    () => new Set(columns.map((column) => column.field).filter(Boolean)),
    [columns],
  )
  const dateField = report.id === 'tat-analysis' ? 'startDate' : getReportDateField(report, fieldSet)
  const filterOptions = useMemo(() => getAvailableFilters(report, fieldSet), [fieldSet, report])
  const [filters, setFilters] = useState({})
  const [tatStageFilter, setTatStageFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [tableFilters, setTableFilters] = useState({})
  const [sort, setSort] = useState({ field: '', direction: 'asc' })
  const [chartDimension, setChartDimension] = useState(report.dimension)
  const [chartMetric, setChartMetric] = useState(report.metric)
  const [page, setPage] = useState(0)
  const availableMetrics = useMemo(
    () => getMetricChoices(report, fieldSet, rows),
    [fieldSet, report, rows],
  )
  const metricFields = useMemo(() => {
    const fields = new Set(fieldSet)
    if (report.summaryTable === 'tatEvents' && rows.some((row) => Number.isFinite(row.tatDays))) {
      fields.add('tatDays')
      fields.add('tatStage')
    }
    if (report.summaryTable === 'qualityExceptions') fields.add('exceptionType')
    return fields
  }, [fieldSet, report.summaryTable, rows])
  const activeMetric =
    availableMetrics.find((metric) => metric.key === chartMetric) ??
    availableMetrics[0] ??
    { key: 'recordCount', label: 'Records', kind: 'count', fields: [] }
  const chartMetrics = availableMetrics.filter((metric) => metric.kind !== 'distinct')
  const derivedDimensions = report.summaryTable === 'qualityExceptions'
    ? new Set(['exceptionType', 'severity'])
    : report.summaryTable === 'tatEvents'
      ? new Set(['tatStage'])
      : new Set()
  const chartDimensions = report.chartDimensions
    .map((field) => field === 'vendorName' && !fieldSet.has(field) ? 'vendorId' : field)
    .filter((field) => fieldSet.has(field) || derivedDimensions.has(field))
  const activeDimension = chartDimensions.includes(chartDimension)
    ? chartDimension
    : chartDimensions[0] ?? report.dimension
  const tatStageOptions = report.id === 'tat-analysis'
    ? [...new Set(rows.map((row) => row.tatStage).filter(Boolean))]
      .sort((left, right) => TAT_STAGE_ORDER.indexOf(left) - TAT_STAGE_ORDER.indexOf(right))
    : []
  const filteredSourceRows = useMemo(() => {
    let filtered = rows.filter((row) =>
      filterOptions.every(([field]) => !filters[field] || String(row[field] ?? '') === filters[field]),
    )
    if (tatStageFilter) {
      filtered = filtered.filter((row) => row.tatStage === tatStageFilter)
    }
    if (dateField) {
      filtered = filtered.filter((row) => {
        const date = String(row[dateField] ?? '')
        const month = /^\d{4}-\d{2}$/.test(date)
        const from = month ? dateFrom.slice(0, 7) : dateFrom
        const to = month ? dateTo.slice(0, 7) : dateTo
        return (!from || date >= from) && (!to || date <= to)
      })
    }
    return filtered
  }, [dateField, dateFrom, dateTo, filterOptions, filters, rows, tatStageFilter])
  const sourceRows = filteredSourceRows
  const displayColumns = useMemo(
    () => getReportDisplayColumns(report, columns),
    [columns, report],
  )
  const metricRows = sourceRows
  const tableRows = useMemo(
    () => metricRows.filter((row) => displayColumns.every((column) =>
      !tableFilters[column.field] || String(row[column.field] ?? row.sourceValues?.[column.sourceIndex] ?? '') === tableFilters[column.field],
    )),
    [displayColumns, metricRows, tableFilters],
  )
  const searchedRows = useMemo(
    () => tableRows.filter((row) => matchesSearch(row, displayColumns, search)),
    [displayColumns, search, tableRows],
  )
  const orderedRows = useMemo(() => {
    if (!sort.field) return searchedRows
    const direction = sort.direction === 'asc' ? 1 : -1
    return [...searchedRows].sort((a, b) => {
      const left = a[sort.field] ?? ''
      const right = b[sort.field] ?? ''
      const leftNumber = Number(left)
      const rightNumber = Number(right)
      const result =
        left !== '' && right !== '' && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
          ? leftNumber - rightNumber
          : String(left).localeCompare(String(right), undefined, { numeric: true })
      return result * direction
    })
  }, [searchedRows, sort])
  const pageSize = 15
  const pageCount = Math.max(1, Math.ceil(orderedRows.length / pageSize))
  const visiblePage = Math.min(page, pageCount - 1)
  const pageRows = orderedRows.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize)
  useEffect(() => {
    if (page !== visiblePage) setPage(visiblePage)
  }, [page, visiblePage])
  const metricKpis = report.metrics
    .filter((metric) => isMetricAvailable(metric, metricFields))
    .flatMap((metric) => {
      if (metric.kind === 'currency') {
        return getCurrencyTotals(metricRows, metric, metricFields).map(([currency, value]) => ({
          key: `${metric.key}-${currency}`,
          label: metric.label,
          value,
          metric,
          currency,
        }))
      }
      return [{
        key: metric.key,
        label: metric.label,
        value: getMetricTotal(metricRows, metric, metricFields),
        metric,
        currency: '',
      }]
    })
  const chartData = getMetricGroups(metricRows, activeMetric, activeDimension)
  const insights = getReportInsights(report, metricRows, fieldSet)
  const fulfillment = report.id === 'order-fulfillment'
    ? (() => {
      const relevant = metricRows.filter((row) => Number(row.orderedQuantity) > 0)
      const orderedTotal = relevant.reduce((sum, row) => sum + Number(row.orderedQuantity), 0)
      const receivedTotal = relevant.reduce((sum, row) => sum + Number(row.receivedQuantity || 0), 0)
      return {
        fullyReceivedCount: relevant.filter((row) => Number(row.pendingQuantity) <= 0).length,
        partiallyReceivedCount: relevant.filter((row) => Number(row.receivedQuantity) > 0 && Number(row.pendingQuantity) > 0).length,
        notReceivedCount: relevant.filter((row) => Number(row.receivedQuantity) <= 0).length,
        averageCompletionRate: orderedTotal ? (receivedTotal / orderedTotal) * 100 : null,
        pendingQuantity: relevant.reduce((sum, row) => sum + Math.max(0, Number(row.pendingQuantity) || 0), 0),
        excessQuantity: relevant.reduce((sum, row) => sum + Math.max(0, -(Number(row.pendingQuantity) || 0)), 0),
      }
    })()
    : null
  const settlement = report.id === 'invoice-tax'
    ? (() => {
      const relevant = metricRows
      const validDays = relevant.map((row) => {
        const start = Date.parse(`${row.miroPostingDate}T00:00:00Z`)
        const end = Date.parse(`${row.clearingDate}T00:00:00Z`)
        return row.miroPostingDate && row.clearingDate && Number.isFinite(start) && Number.isFinite(end) && end >= start
          ? (end - start) / 86_400_000
          : null
      }).filter((value) => value != null)
      return {
        clearedCount: relevant.filter((row) => row.clearingDate || row.clearingDocumentNumber).length,
        openCount: relevant.filter((row) => !row.clearingDate && !row.clearingDocumentNumber).length,
        averageClearingDays: validDays.length ? validDays.reduce((sum, value) => sum + value, 0) / validDays.length : null,
      }
    })()
    : null

  useEffect(() => {
    setChartDimension(report.dimension)
    setChartMetric(report.metric)
    setPage(0)
    setSearch('')
    setTableFilters({})
    setSort({ field: '', direction: 'asc' })
  }, [report.id, report.dimension, report.metric])

  function toggleSort(field) {
    setPage(0)
    setSort((current) => ({
      field,
      direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  return (
    <section className="procurement-report-detail">
      <div className="procurement-detail-back">
        <button className="button button-outline" onClick={() => navigate('/reports')} type="button">
          ← Back to reports
        </button>
        <button
          aria-pressed={isPresenting}
          className={`button ${isPresenting ? 'button-outline' : 'button-primary'} presentation-button`}
          onClick={() => void onTogglePresentation()}
          type="button"
        >
          {isPresenting ? 'Exit presentation' : 'Present'}
        </button>
        <button className="button button-outline" onClick={() => window.print()} type="button">
          Print report
        </button>
        <button
          className="button button-primary"
          disabled={!displayColumns.length}
          onClick={() => exportRows(orderedRows, displayColumns, report)}
          type="button"
        >
          Export Excel-compatible CSV
        </button>
      </div>
      <header className="procurement-report-header">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> {report.category}</div>
          <p className="procurement-report-number">Report {report.number} · {report.tags.join(' · ')}</p>
          <h1>{report.title}</h1>
          <p>{report.description}</p>
        </div>
        <div className="report-selection-summary">
          <span>Source workbook</span>
          <strong>{fileName || 'Procurement data'}</strong>
          <small>Refreshed {new Date().toLocaleDateString('en-IN')}</small>
        </div>
      </header>

      <section aria-label="Report KPIs" className="procurement-kpi-grid">
        {metricKpis.filter((kpi) => !(
          report.id === 'order-fulfillment' &&
          ['poQuantity', 'receivedQuantity', 'pendingQuantity'].includes(kpi.metric.key)
        )).map((kpi) => (
          <article className="panel procurement-kpi" key={kpi.key}>
            <span>{kpi.label}{kpi.currency ? ` · ${kpi.currency}` : ''}</span>
            <strong>{formatMetric(kpi.value, kpi.metric, kpi.currency)}</strong>
            <small>
              {report.id === 'tat-analysis' && kpi.metric.key === 'recordCount'
                ? 'Unique linked stage intervals with both dates; a document can count in multiple stages.'
                : report.id === 'tat-analysis' && kpi.metric.key === 'tatDays'
                  ? 'Elapsed calendar days across completed intervals; negative intervals are excluded.'
                : kpi.metric.kind === 'currency'
                  ? 'Source currency; not converted'
                  : 'Based on filtered summary rows'}
            </small>
          </article>
        ))}
      </section>

      <section aria-label="Report filters" className="panel procurement-filter-panel">
        <div className="procurement-section-heading">
          <div>
            <h2>Filters</h2>
            <p>
              {report.id === 'tat-analysis'
                ? 'Select a stage to focus the KPIs, chart, table, and insights.'
                : 'Only fields available in this workbook are shown.'}
            </p>
          </div>
          <button
            className="button button-outline"
            onClick={() => {
              setFilters({})
              setTatStageFilter('')
              setDateFrom('')
              setDateTo('')
              setPage(0)
            }}
            type="button"
          >
            Clear filters
          </button>
        </div>
        <div className="procurement-filter-grid">
          {report.id === 'tat-analysis' && (
            <label>
              <span>TAT stage</span>
              <select
                onChange={(event) => {
                  setTatStageFilter(event.target.value)
                  setPage(0)
                }}
                value={tatStageFilter}
              >
                <option value="">All stages</option>
                {tatStageOptions.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
              </select>
            </label>
          )}
          {filterOptions.map(([field, label]) => {
            const values = [...new Set(rows.map((row) => String(row[field] ?? '')).filter(Boolean))]
              .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            return (
              <label key={field}>
                <span>{label}</span>
                <select
                  onChange={(event) => {
                    setFilters((current) => ({ ...current, [field]: event.target.value }))
                    setPage(0)
                  }}
                  value={filters[field] ?? ''}
                >
                  <option value="">All</option>
                  {values.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            )
          })}
          {dateField && (
            <>
              <label><span>From date</span><input onChange={(event) => { setDateFrom(event.target.value); setPage(0) }} type="date" value={dateFrom} /></label>
              <label><span>To date</span><input onChange={(event) => { setDateTo(event.target.value); setPage(0) }} type="date" value={dateTo} /></label>
            </>
          )}
        </div>
      </section>

      <section aria-label="Visual analysis" className="charts-section">
        <div className="section-heading">
          <div>
            <h2>{report.id === 'tat-analysis' ? 'Stage turnaround analysis' : 'Performance breakdown'}</h2>
            <p>
              {report.id === 'tat-analysis'
                ? 'Compare elapsed calendar days across stages or available groups.'
                : 'Compare the selected measure across available groups.'}
            </p>
          </div>
          <div className="chart-controls">
            {chartMetrics.length > 1 && (
              <label className="group-select">
                <span>Measure</span>
                <select
                  onChange={(event) => setChartMetric(event.target.value)}
                  value={activeMetric.key}
                >
                  {chartMetrics.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
                </select>
              </label>
            )}
            {chartDimensions.length > 1 && (
              <label className="group-select">
                <span>Group by</span>
                <select
                  onChange={(event) => setChartDimension(event.target.value)}
                  value={activeDimension}
                >
                  {chartDimensions.map((field) => (
                    <option key={field} value={field}>{getProcurementFieldLabel(field)}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
        <div className={`chart-grid procurement-chart-grid${report.id === 'tat-analysis' ? ' is-tat' : ''}`}>
          <ProcurementBarChart
            entries={chartData}
            metric={activeMetric}
            subtitle={`Ranked by ${getProcurementFieldLabel(activeDimension)}`}
            title={`${activeMetric.label} by ${getProcurementFieldLabel(activeDimension).toLowerCase()}`}
          />
          {report.id === 'tat-analysis' && <ProcurementTatStageFlow rows={metricRows} />}
        </div>
      </section>

      <section aria-label="Detailed transaction data" className="panel procurement-table-panel">
        <div className="procurement-section-heading">
          <div><h2>Report summary table</h2><p>{formatCount(orderedRows.length)} rows · {getReportLevelLabel(report)}</p></div>
          <label className="search-box">
            <input
              aria-label="Search report rows"
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(0)
              }}
              placeholder="Search rows"
              type="search"
              value={search}
            />
          </label>
        </div>
        <div className="table-scroll procurement-table-scroll">
          <table>
            <thead>
              <tr>
                {displayColumns.map((column) => (
                  <th className={['poTotal', 'miroValue', 'grnValue', 'poQuantity', 'orderedQuantity', 'receivedQuantity', 'pendingQuantity', 'gst', 'clearingDays', 'tatDays'].includes(column.field) ? 'align-right' : ''} key={`${column.key}-${column.sourceIndex}`}>
                    <span className="procurement-column-label">
                      <button className="sort-header" onClick={() => toggleSort(column.field ?? column.key)} type="button">
                        {column.label}
                        {sort.field === column.field && <span>{sort.direction === 'asc' ? '↑' : '↓'}</span>}
                      </button>
                    </span>
                    <select
                      aria-label={`Filter table by ${column.label}`}
                      onChange={(event) => {
                        setTableFilters((current) => ({ ...current, [column.field]: event.target.value }))
                        setPage(0)
                      }}
                      value={tableFilters[column.field] ?? ''}
                    >
                      <option value="">All</option>
                      {[...new Set(metricRows.map((row) => String(row[column.field] ?? row.sourceValues?.[column.sourceIndex] ?? '')).filter(Boolean))]
                        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                        .map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </th>
                ))}
                {report.id === 'pending-grn-report' && <th>Pending quantity</th>}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, index) => (
                <tr key={`${row.rowNumber}-${index}`}>
                  {displayColumns.map((column) => (
                    <td key={`${column.key}-${column.sourceIndex}`}>
                      {String(formatTableValue(row[column.field] ?? row.sourceValues?.[column.sourceIndex], column.field))}
                    </td>
                  ))}
                  {report.id === 'pending-grn-report' && <td>{formatCount(row.pendingQuantity)}</td>}
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr><td className="empty-table" colSpan={displayColumns.length + (report.id === 'pending-grn-report' ? 1 : 0)}>No records match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer procurement-table-footer">
          <span><i className="footer-dot" /> {getReportLevelLabel(report)} · calculated fields are shown where available</span>
          <span>{formatCount(orderedRows.length)} matching rows</span>
        </div>
        <div className="procurement-pagination">
          <span>Page {visiblePage + 1} of {pageCount}</span>
          <div>
            <button className="button button-outline" disabled={page === 0} onClick={() => setPage((value) => value - 1)} type="button">Previous</button>
            <button className="button button-outline" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)} type="button">Next</button>
          </div>
        </div>
      </section>

      <section className="panel procurement-insights">
        <div className="procurement-section-heading">
          <div><h2>Business insights & recommended checks</h2><p>Observations below are generated from the current workbook and filters.</p></div>
        </div>
        <ul>{insights.map((insight) => <li key={insight}>{insight}</li>)}</ul>
        {report.id === 'order-fulfillment' && fulfillment && (
          <div className="procurement-analytics-strip" aria-label="Receipt completion analytics">
            <div><span>Fully received items</span><strong>{formatCount(fulfillment.fullyReceivedCount)}</strong></div>
            <div><span>Partially received items</span><strong>{formatCount(fulfillment.partiallyReceivedCount)}</strong></div>
            <div><span>Not received items</span><strong>{formatCount(fulfillment.notReceivedCount)}</strong></div>
            <div><span>Average item completion</span><strong>{fulfillment.averageCompletionRate == null ? '—' : `${fulfillment.averageCompletionRate.toFixed(1)}%`}</strong></div>
            <div><span>Net pending quantity</span><strong>{formatCount(fulfillment.pendingQuantity)}</strong></div>
          </div>
        )}
        {report.id === 'invoice-tax' && settlement && (
          <div className="procurement-analytics-strip" aria-label="Invoice settlement analytics">
            <div><span>Cleared invoices</span><strong>{formatCount(settlement.clearedCount)}</strong></div>
            <div><span>Open invoices</span><strong>{formatCount(settlement.openCount)}</strong></div>
            <div><span>Average clearing time</span><strong>{settlement.averageClearingDays == null ? '—' : `${settlement.averageClearingDays.toFixed(1)} days`}</strong></div>
          </div>
        )}
        <p className="procurement-insight-note">
          Blank MIRO fields are treated as missing linkage, not as confirmed unpaid invoices.
          Reconcile movement types, reversals, returns, and document-level keys with your SAP configuration before acting.
        </p>
      </section>
    </section>
  )
}
