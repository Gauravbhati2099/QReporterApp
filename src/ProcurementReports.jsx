import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getProcurementFieldLabel,
  getProcurementMeasure,
  getAvailableProcurementReports,
  PROCUREMENT_FILTERS,
  PROCUREMENT_REPORTS,
} from './lib/procurementReports'
import { formatCount } from './lib/reportData'
import { getChartColor } from './lib/chartColors'
import { exportReportsToHtml, exportRowsToExcel } from './lib/reportExport'
import ReportExportMenu from './ReportExportMenu'
import ReportInsightsSummary from './ReportInsightsSummary'
import ReportNavigation from './ReportNavigation'

function getAvailableFilters(report, fields) {
  return PROCUREMENT_FILTERS.filter(
    ([field]) => report.filterFields.includes(field) && fields.has(field),
  )
}

function validDaysForRow(row) {
  const start = Date.parse(`${row.miroPostingDate ?? ''}T00:00:00Z`)
  const end = Date.parse(`${row.clearingDate ?? ''}T00:00:00Z`)
  return Boolean(row.miroPostingDate && row.clearingDate && Number.isFinite(start) && Number.isFinite(end) && end >= start)
}

function getFilterOptions(rows, field) {
  const options = new Map()
  for (const row of rows) {
    const value = String(row[field] ?? '').trim()
    if (!value) continue
    const option = options.get(value) ?? new Set()
    const descriptionFields = field === 'vendorId'
      ? ['vendorName']
      : ['poNumber', 'prNumber'].includes(field)
        ? ['materialDescription', 'materialGroupDescription', 'vendorName', 'material']
        : []
    for (const descriptionField of descriptionFields) {
      const description = String(row[descriptionField] ?? '').trim()
      if (description && description !== value) option.add(description)
    }
    options.set(value, option)
  }
  return [...options.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([value, descriptions]) => {
      const context = [...descriptions].slice(0, 3).join(' · ')
      return {
        value,
        label: context ? `${value} — ${context}` : value,
      }
    })
}

function SearchableMultiSelect({ label, options, selected, onChange }) {
  const menuRef = useRef(null)
  const [query, setQuery] = useState('')
  const selectedValues = selected ?? []
  const optionValues = options.map((option) => option.value)
  const summary = selected === undefined || (options.length > 0 && optionValues.every((value) => selectedValues.includes(value)))
    ? 'All'
    : selectedValues.length
      ? `${selectedValues.length} selected`
      : 'None'
  const visibleOptions = options.filter((option) =>
    `${option.value} ${option.label}`.toLowerCase().includes(query.trim().toLowerCase()),
  )

  useEffect(() => {
    function closeOnOutsidePointer(event) {
      if (!menuRef.current?.contains(event.target)) menuRef.current.open = false
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [])

  function toggle(value) {
    const current = selected === undefined ? optionValues : selectedValues
    onChange(
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    )
  }

  return (
    <details className="filter-menu procurement-filter-menu" ref={menuRef}>
      <summary>
        <span>{label}</span>
        <span className="filter-summary">{summary}</span>
        <span aria-hidden="true" className="chevron" />
      </summary>
      <div className="filter-popover procurement-filter-popover">
        <div className="filter-popover-head">
          <strong>{label}</strong>
          <div className="filter-actions">
            <button onClick={() => onChange(optionValues)} type="button">Select all</button>
            <button onClick={() => onChange([])} type="button">Clear</button>
          </div>
        </div>
        <input
          aria-label={`Search ${label}`}
          className="procurement-filter-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${label.toLowerCase()}`}
          type="search"
          value={query}
        />
        <div className="filter-options">
          {visibleOptions.map((option) => (
            <label className="check-option" key={option.value}>
              <input
                checked={selected === undefined || selectedValues.includes(option.value)}
                onChange={() => toggle(option.value)}
                type="checkbox"
                value={option.value}
              />
              <span>{option.label}</span>
              <span aria-hidden="true" className="check-mark">✓</span>
            </label>
          ))}
          {visibleOptions.length === 0 && <span className="empty-options">No matching values</span>}
        </div>
      </div>
    </details>
  )
}

function getReportDateField(report, fields, rows) {
  if (report.dateField === false) return ''
  const candidates = [...new Set([
    report.dateField,
    'miroPostingDate', 'miroDocumentDate', 'invoiceDate', 'grnDate', 'poDate',
    'prDate', 'vendorFinalizationDate', 'certificateDate', 'clearingDate', 'dueDate', 'date',
  ])].filter((field) => fields.has(field))
  return candidates.find((field) =>
    rows.some((row) => /^\d{4}-\d{2}(?:-\d{2})?$/.test(String(row[field] ?? ''))),
  ) ?? candidates[0] ?? ''
}

function getDateInputValue(value, boundary) {
  if (!/^\d{4}-\d{2}$/.test(value)) return value
  const [year, month] = value.split('-').map(Number)
  const day = boundary === 'end' ? new Date(year, month, 0).getDate() : 1
  return `${value}-${String(day).padStart(2, '0')}`
}

function matchesReportFilters(row, filterOptions, filters, dateField, dateFrom, dateTo, tatStageFilter) {
  if (!filterOptions.every(([field]) =>
    filters[field] === undefined || filters[field].includes(String(row[field] ?? '')),
  )) {
    return false
  }
  if (tatStageFilter && row.tatStage !== tatStageFilter) return false
  if (!dateField) return true

  const date = String(row[dateField] ?? '')
  const month = /^\d{4}-\d{2}$/.test(date)
  const from = month ? dateFrom.slice(0, 7) : dateFrom
  const to = month ? dateTo.slice(0, 7) : dateTo
  return (!from || date >= from) && (!to || date <= to)
}

function countDistinctValues(rows, fields) {
  const values = rows.map((row) =>
    fields.map((field) => String(row[field] ?? '').trim()).find(Boolean) ?? '',
  )
  return new Set(values.filter(Boolean)).size
}

function countGrnDocuments(rows) {
  const documents = new Set()
  for (const row of rows) {
    const values = String(row.grnNumbers ?? row.grnNumber ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    for (const value of values) documents.add(value)
  }
  return documents.size
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
    const currency = row.currency || row.conversionCurrency || 'INR'
    totals.set(currency, (totals.get(currency) ?? 0) + getMetricValue(row, metric))
  }
  return [...totals.entries()]
}

function formatMetric(value, metric, currency = '') {
  if (value == null || !Number.isFinite(value)) return '—'
  if (metric.kind === 'currency') {
    return `${currency ? `${currency} ` : ''}${value.toLocaleString('en-IN', {
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
      ? row.currency || row.conversionCurrency || 'INR'
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

function getReportTableTitle(report) {
  const titles = {
    'procurement-overview': 'Purchase order items',
    'supplier-performance': 'Supplier performance records',
    'order-fulfillment': 'PO and receipt items',
    'invoice-tax': 'Invoice and tax records',
    'data-quality': 'Data quality exceptions',
    'tat-analysis': 'Turnaround stage intervals',
  }
  return titles[report.id] ?? `${report.title} details`
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
        .map(([type, count]) => `${type}: ${formatCount(count)} of ${formatCount(rows.length)} exceptions (${(count / rows.length * 100).toFixed(1)}%) need review.`)
      : ['No configured data-quality exceptions were found in the uploaded records.']
  }
  if (report.id === 'order-fulfillment') {
    const relevant = rows.filter((row) => Number(row.orderedQuantity ?? row.poQuantity) > 0)
    const pending = relevant.filter((row) => Number(row.pendingQuantity) > 0)
    const excess = relevant.filter((row) => Number(row.pendingQuantity) < 0)
    const orderedQuantity = relevant.reduce((sum, row) => sum + Number(row.orderedQuantity ?? row.poQuantity), 0)
    const pendingQuantity = pending.reduce((sum, row) => sum + Number(row.pendingQuantity), 0)
    return [
      `${formatCount(pending.length)} of ${formatCount(relevant.length)} PO items (${relevant.length ? (pending.length / relevant.length * 100).toFixed(1) : '0.0'}%) have ${formatCount(pendingQuantity)} pending units against ${formatCount(orderedQuantity)} ordered units (${orderedQuantity ? (pendingQuantity / orderedQuantity * 100).toFixed(1) : '0.0'}% pending).`,
      `${formatCount(excess.length)} items have net receipts above ordered quantity; quantify and reconcile these exceptions before closing the order.`,
      'Receipt quantity is net of recognized reversal and return movements; confirm movement conventions for this extract.',
    ]
  }
  if (report.id === 'invoice-tax') {
    const cleared = rows.filter((row) => row.clearingDate || row.clearingDocumentNumber).length
    const open = rows.length - cleared
    return [
      `This selection has ${formatCount(rows.length)} MIRO records: ${formatCount(cleared)} cleared (${(cleared / rows.length * 100).toFixed(1)}%) and ${formatCount(open)} without a clearing reference (${(open / rows.length * 100).toFixed(1)}%).`,
      'GST totals use uploaded MIRO tax fields and remain separate by source currency; compare within currency before reconciling.',
      'Clearing time uses valid posting-to-clearing date pairs. Check open records against due date and payment status; a blank clearing reference alone does not prove an invoice is overdue.',
    ]
  }
  if (report.id === 'tat-analysis') {
    const invalid = rows.filter((row) => Number(row.tatDays) < 0).length
    const validDays = rows.map((row) => Number(row.tatDays)).filter((days) => Number.isFinite(days) && days >= 0).sort((left, right) => left - right)
    const percentile = (fraction) => validDays.length ? validDays[Math.min(validDays.length - 1, Math.ceil(validDays.length * fraction) - 1)] : null
    const median = percentile(0.5)
    const p90 = percentile(0.9)
    const stages = [...new Set(rows.map((row) => row.tatStage).filter(Boolean))]
    const insights = [
      `${formatCount(validDays.length)} of ${formatCount(rows.length)} stage intervals have valid non-negative durations; median is ${median == null ? 'unavailable' : `${median.toFixed(1)} days`} and the 90th percentile is ${p90 == null ? 'unavailable' : `${p90.toFixed(1)} days`}.`,
      stages.length
        ? `Stages measured: ${stages.join(', ')}.`
        : 'No complete linked date pairs were found for the selected filters.',
      `${formatCount(invalid)} stage(s) have an end date earlier than the start date and should be checked.`,
      'Compare the median and 90th percentile with your internal stage targets; investigate the longest intervals first.',
    ]
    if (!fields.has('vendorFinalizationDate')) {
      insights.splice(2, 0, 'PO-to-vendor-finalization TAT is not calculated because no vendor confirmation/finalization date column was recognized.')
    }
    return insights
  }
  return [
    `${formatCount(rows.length)} ${getReportLevelLabel(report)} records match the active filters.`,
    'Currency values remain grouped by source currency. Prioritize the largest supplier/material/plant groups for review, then validate document linkage before changing purchasing decisions.',
  ]
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
              <span className="report-required-columns">
                <strong>Required columns</strong>
                {[
                  ...report.requiredFields.map(getProcurementFieldLabel),
                  ...report.anyOfFields.map((group) => `one of: ${group.map(getProcurementFieldLabel).join(' / ')}`),
                ].join(' · ') || 'No specific source columns'}
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
    const currency = entry.currency || 'INR'
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
                      <i className="legend-dot" style={{ backgroundColor: getChartColor(index) }} />
                      {entry.label}
                    </span>
                    <span className="bar-number">{formatMetric(entry.value, metric, currency)}</span>
                  </div>
                  <div className="bar-track" role="img" aria-label={`${entry.label}: ${formatMetric(entry.value, metric, currency)}`}>
                    <span className="bar-fill" style={{ width: `${maximum ? Math.max(2, Math.abs(entry.value) / maximum * 100) : 0}%`, backgroundColor: getChartColor(index) }} />
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

function getProcurementPieSlices(entries) {
  const total = entries.reduce((sum, entry) => sum + Math.abs(entry.value), 0)
  let angle = -90

  return entries
    .filter((entry) => Number.isFinite(entry.value) && Math.abs(entry.value) > 0)
    .map((entry, index, availableEntries) => {
      const value = Math.abs(entry.value)
      const share = total ? value / total : 0
      const nextAngle = angle + share * 360
      const start = {
        x: 110 + 94 * Math.cos((angle * Math.PI) / 180),
        y: 110 + 94 * Math.sin((angle * Math.PI) / 180),
      }
      const end = {
        x: 110 + 94 * Math.cos((nextAngle * Math.PI) / 180),
        y: 110 + 94 * Math.sin((nextAngle * Math.PI) / 180),
      }
      const path = availableEntries.length === 1
        ? 'M 110 16 A 94 94 0 1 1 110 204 A 94 94 0 1 1 110 16 Z'
        : `M 110 110 L ${start.x} ${start.y} A 94 94 0 ${share > 0.5 ? 1 : 0} 1 ${end.x} ${end.y} Z`

      angle = nextAngle
      return { ...entry, path, share, value }
    })
}

function ProcurementPieChart({ entries, metric, dimension }) {
  const series = metric.kind === 'currency'
    ? groupByCurrency(entries)
    : [['', entries]]

  return (
    <section className={`panel chart-panel pie-panel procurement-pie-panel pie-panel-${metric.kind}`}>
      <div className="panel-heading">
        <div>
          <h2>Distribution by {getProcurementFieldLabel(dimension)}</h2>
          <p>Share of the selected measure for each group</p>
        </div>
      </div>
      {series.map(([currency, currencyEntries]) => {
        const slices = getProcurementPieSlices(currencyEntries)
        const total = slices.reduce((sum, slice) => sum + slice.value, 0)
        return (
          <div className="procurement-pie-series" key={currency || 'all'}>
            {currency && <h3>{currency}</h3>}
            <div className="chart-total pie-total">
              <span>{formatMetric(total, metric, currency)}</span>
              <small>Total {metric.label.toLowerCase()}</small>
            </div>
            {slices.length ? (
              <div className="pie-content">
                <svg
                  aria-label={`Pie chart of ${metric.label.toLowerCase()} share by ${getProcurementFieldLabel(dimension)}`}
                  className="pie-visual"
                  role="img"
                  viewBox="0 0 220 220"
                >
                  {slices.map((slice, index) => (
                    <path
                      aria-label={`${slice.label}: ${formatMetric(slice.value, metric, currency)}, ${(slice.share * 100).toFixed(1)}%`}
                      className="pie-slice"
                      d={slice.path}
                      key={slice.label}
                      style={{ '--pie-color': getChartColor(index) }}
                    >
                      <title>{`${slice.label}: ${(slice.share * 100).toFixed(1)}%`}</title>
                    </path>
                  ))}
                </svg>
                <div
                  aria-label={`Legend by ${getProcurementFieldLabel(dimension)}`}
                  className="pie-legend"
                  role="list"
                >
                  {slices.map((slice, index) => (
                    <div className="pie-legend-item" key={slice.label} role="listitem">
                      <i
                        aria-hidden="true"
                        className="pie-legend-dot"
                        style={{ '--pie-color': getChartColor(index) }}
                      />
                      <span className="pie-legend-label" title={slice.label}>{slice.label}</span>
                      <span className="pie-legend-value">
                        {formatMetric(slice.value, metric, currency)}
                        <small>{(slice.share * 100).toFixed(1)}%</small>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="chart-empty">No positive values to display.</div>
            )}
          </div>
        )
      })}
      {!entries.length && <div className="chart-empty">No data for this selection.</div>}
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

export function ProcurementReportDashboard({ report, reportList, summaryTables, columns, navigate, fileName, isPresenting, onPreviewPrint, onTogglePresentation }) {
  const rows = useMemo(
    () => summaryTables?.[report.summaryTable] ?? [],
    [report.summaryTable, summaryTables],
  )
  const fieldSet = useMemo(
    () => new Set(columns.map((column) => column.field).filter(Boolean)),
    [columns],
  )
  const dateField = report.id === 'tat-analysis' ? 'startDate' : getReportDateField(report, fieldSet, rows)
  const filterOptions = useMemo(
    () => getAvailableFilters(report, fieldSet).filter(([field]) => !(report.id === 'procurement-overview' && field === 'currency')),
    [fieldSet, report],
  )
  const filterChoices = useMemo(
    () => new Map(filterOptions.map(([field]) => [field, getFilterOptions(rows, field)])),
    [filterOptions, rows],
  )
  const dateBounds = useMemo(() => {
    const dates = rows
      .map((row) => String(row[dateField] ?? ''))
      .filter((value) => /^\d{4}-\d{2}(?:-\d{2})?$/.test(value))
      .sort()
    return { min: dates[0] ?? '', max: dates.at(-1) ?? '' }
  }, [dateField, rows])
  const [filters, setFilters] = useState({})
  const [tatStageFilter, setTatStageFilter] = useState('')
  const [dateFrom, setDateFrom] = useState(null)
  const [dateTo, setDateTo] = useState(null)
  const selectedDateFrom = dateFrom ?? dateBounds.min
  const selectedDateTo = dateTo ?? dateBounds.max
  const [sort, setSort] = useState({ field: displayColumns?.[0]?.field ?? '', direction: 'asc' })
  const [linkedRowKey, setLinkedRowKey] = useState('')
  const [chartDimension, setChartDimension] = useState(report.dimension)
  const [chartMetric, setChartMetric] = useState(report.metric)
  const [visibleTableCount, setVisibleTableCount] = useState(50)
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
    return rows.filter((row) =>
      matchesReportFilters(
        row,
        filterOptions,
        filters,
        dateField,
        selectedDateFrom,
        selectedDateTo,
        tatStageFilter,
      ),
    )
  }, [dateField, filterOptions, filters, rows, selectedDateFrom, selectedDateTo, tatStageFilter])
  const filteredPoGrnRows = useMemo(
    () => (summaryTables?.poGrnMiro ?? []).filter((row) =>
      matchesReportFilters(
        row,
        filterOptions,
        filters,
        dateField,
        selectedDateFrom,
        selectedDateTo,
        tatStageFilter,
      ),
    ),
    [dateField, filterOptions, filters, selectedDateFrom, selectedDateTo, summaryTables, tatStageFilter],
  )
  const sourceRows = filteredSourceRows
  const displayColumns = useMemo(
    () => getReportDisplayColumns(report, columns),
    [columns, report],
  )
  const metricRows = sourceRows
  const tableRows = metricRows
  const orderedRows = useMemo(() => {
    if (!sort.field) return tableRows
    const direction = sort.direction === 'asc' ? 1 : -1
    return [...tableRows].sort((a, b) => {
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
  }, [tableRows, sort])
  useEffect(() => {
    const syncLinkedRow = () => setLinkedRowKey(decodeURIComponent(window.location.hash.slice(1)))
    syncLinkedRow()
    window.addEventListener('hashchange', syncLinkedRow)
    return () => window.removeEventListener('hashchange', syncLinkedRow)
  }, [])
  useEffect(() => {
    if (!linkedRowKey) return
    const matchIndex = orderedRows.findIndex((row) =>
      [row.poNumber, row.prNumber, row.grnNumber, row.miroNumber, row.invoiceNumber]
        .some((value) => String(value ?? '') === linkedRowKey),
    )
    if (matchIndex >= 0) setVisibleTableCount((count) => Math.max(count, matchIndex + 1))
  }, [linkedRowKey, orderedRows])
  const visibleRows = orderedRows.slice(0, visibleTableCount)
  const metricKpis = report.metrics
    .filter((metric) => isMetricAvailable(metric, metricFields))
    .filter((metric) => !(report.id === 'procurement-overview' && metric.key === 'poTotal'))
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
  const overviewKpis = report.id === 'procurement-overview'
    ? [
      { key: 'po-count', label: 'Purchase orders', value: countDistinctValues(metricRows, ['poNumber']), description: 'Distinct PO numbers in the selected date range.' },
      ...(fieldSet.has('prNumber')
        ? [{ key: 'pr-count', label: 'Purchase requisitions', value: countDistinctValues(metricRows, ['prNumber']), description: 'Distinct PR numbers in the selected date range.' }]
        : []),
      { key: 'vendor-count', label: 'Vendors', value: countDistinctValues(metricRows, ['vendorId', 'vendorName']), description: 'Distinct vendors in the selected date range.' },
      ...(fieldSet.has('materialGroup') || fieldSet.has('material')
        ? [{
          key: 'material-count',
          label: 'Material types',
          value: countDistinctValues(metricRows, [fieldSet.has('materialGroup') ? 'materialGroup' : 'material']),
          description: fieldSet.has('materialGroup') ? 'Distinct material groups in the selected date range.' : 'Distinct materials in the selected date range.',
        }]
        : []),
      ...(fieldSet.has('grnNumber')
        ? [{ key: 'grn-count', label: 'GRN documents', value: countGrnDocuments(filteredPoGrnRows), description: 'Distinct GRN documents linked to matching purchase orders.' }]
        : []),
    ].map((kpi) => ({
      ...kpi,
      metric: { kind: 'count' },
      currency: '',
    }))
    : null
  const displayedKpis = overviewKpis ?? metricKpis.filter((kpi) => !(
    report.id === 'procurement-overview' && kpi.metric.key === 'poTotal'
  ))
  const printDateRange = !dateField || (!selectedDateFrom && !selectedDateTo)
    ? 'All available dates'
    : selectedDateFrom && selectedDateTo
      ? `${formatReportDate(selectedDateFrom)} — ${formatReportDate(selectedDateTo)}`
      : selectedDateFrom
        ? `From ${formatReportDate(selectedDateFrom)}`
        : `Through ${formatReportDate(selectedDateTo)}`
  const printActiveFilters = filterOptions.flatMap(([field, label]) => {
    const selected = filters[field]
    if (selected === undefined) return []
    const availableValues = [...new Set(rows.map((row) => String(row[field] ?? '')).filter(Boolean))]
    if (selected.length === availableValues.length && availableValues.every((value) => selected.includes(value))) return []
    return [`${label}: ${selected.length ? selected.join(', ') : 'None'}`]
  })
  const printFilterSummary = [
    `Date${dateField ? ` (${getProcurementFieldLabel(dateField)})` : ''}: ${printDateRange}`,
    ...(report.id === 'tat-analysis' && tatStageFilter ? [`Stage: ${tatStageFilter}`] : []),
    ...printActiveFilters,
  ]
  const chartData = getMetricGroups(metricRows, activeMetric, activeDimension)
  const insights = getReportInsights(report, metricRows, fieldSet)
  const insightKpis = displayedKpis.map((kpi) => {
    let definition = kpi.description
    if (!definition && report.id === 'tat-analysis' && kpi.metric.key === 'recordCount') {
      definition = 'Unique linked stage intervals with both dates; a document can count in multiple stages.'
    } else if (!definition && report.id === 'tat-analysis' && kpi.metric.key === 'tatDays') {
      definition = 'Elapsed calendar days across completed intervals; negative intervals are excluded.'
    } else if (!definition && kpi.metric.kind === 'currency') {
      definition = `Sum of ${kpi.label.toLowerCase()} in ${kpi.currency} at ${getReportLevelLabel(report)}; source currency is retained without conversion.`
    } else if (!definition && kpi.metric.kind === 'distinct') {
      const dimensions = kpi.metric.fields.map(getProcurementFieldLabel).join(' or ')
      definition = `Distinct ${dimensions || kpi.label.toLowerCase()} values among filtered ${getReportLevelLabel(report)} records.`
    } else if (!definition && kpi.metric.kind === 'average') {
      definition = kpi.metric.key === 'clearingDays'
        ? 'Mean calendar days between valid MIRO posting and clearing dates; incomplete or reversed date pairs are excluded.'
        : `Mean ${kpi.label.toLowerCase()} across valid filtered ${getReportLevelLabel(report)} records.`
    } else if (!definition && kpi.metric.kind === 'count') {
      definition = `Count of ${getReportLevelLabel(report)} records represented by the active filters.`
    } else if (!definition) {
      definition = `Sum of ${kpi.label.toLowerCase()} across filtered ${getReportLevelLabel(report)} records; blank values do not contribute.`
    }
    return { label: `${kpi.label}${kpi.currency ? ` · ${kpi.currency}` : ''}`, definition }
  })
  const chartRules = [
    `The selected measure (${activeMetric.label}) is grouped by ${getProcurementFieldLabel(activeDimension)} after the report filters are applied.`,
    activeMetric.kind === 'average'
      ? 'Average charts use valid non-negative values; clearing time requires valid posting and clearing dates.'
      : activeMetric.kind === 'distinct'
        ? 'Distinct counts deduplicate the selected identifier within each group.'
        : 'Count measures count report-level records; additive measures sum their available field values.',
    activeMetric.kind === 'currency'
      ? 'Currency groups stay separate, and each currency shows up to 8 groups ranked by absolute value; pie shares use the displayed groups as the denominator.'
      : 'Charts show up to 8 groups ranked by absolute measure value; pie shares use the displayed groups as the denominator.',
    ...(report.id === 'tat-analysis'
      ? ['Turnaround time uses elapsed calendar days between each stage start and end; intervals with missing or negative durations are excluded.']
      : []),
  ]
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
  const decisionHelpers = []
  const topChartGroup = chartData[0]
  if (topChartGroup) {
    if (activeMetric.kind === 'distinct') {
      decisionHelpers.push(
        `${formatCount(countDistinctValues(metricRows, activeMetric.fields))} distinct ${activeMetric.label.toLowerCase()} are present in the filtered records. Use the report table to inspect the underlying identifiers before prioritizing follow-up.`,
      )
    } else if (activeMetric.kind === 'average') {
      const validValues = metricRows.map((row) => getMetricValue(row, activeMetric)).filter((value) => Number.isFinite(value) && value >= 0)
      const overallAverage = validValues.length ? validValues.reduce((sum, value) => sum + value, 0) / validValues.length : null
      decisionHelpers.push(
        `Highest group: ${topChartGroup.label} at ${formatMetric(topChartGroup.value, activeMetric)}${overallAverage == null ? '' : ` versus ${formatMetric(overallAverage, activeMetric)} overall`}. Compare it with the team’s service target and inspect the underlying documents.`,
      )
    } else {
      const relevantRows = activeMetric.kind === 'currency'
        ? metricRows.filter((row) => (row.currency || row.conversionCurrency || 'INR') === topChartGroup.currency)
        : metricRows
      const total = relevantRows.reduce((sum, row) => {
        const value = getMetricValue(row, activeMetric)
        return Number.isFinite(value) ? sum + Math.abs(value) : sum
      }, 0)
      const share = total ? Math.abs(topChartGroup.value) / total * 100 : null
      decisionHelpers.push(
        `Largest group: ${topChartGroup.label}${topChartGroup.currency ? ` (${topChartGroup.currency})` : ''} at ${formatMetric(topChartGroup.value, activeMetric, topChartGroup.currency)}${share == null ? '' : `, ${share.toFixed(1)}% of the filtered total`}. Review this group first and verify its source documents.`,
      )
    }
  }
  if (report.id === 'order-fulfillment' && fulfillment) {
    const completionRate = fulfillment.averageCompletionRate
    decisionHelpers.push(
      `${formatCount(fulfillment.notReceivedCount)} items have no net receipt; overall quantity completion is ${completionRate == null ? 'unavailable' : `${completionRate.toFixed(1)}%`}. Start with the highest pending quantities and confirm expected delivery dates.`,
    )
  } else if (report.id === 'invoice-tax' && settlement) {
    const clearedRate = metricRows.length ? settlement.clearedCount / metricRows.length * 100 : 0
    decisionHelpers.push(
      `Average clearing time is ${settlement.averageClearingDays == null ? 'unavailable' : `${settlement.averageClearingDays.toFixed(1)} days`} across valid date pairs; ${clearedRate.toFixed(1)}% have a clearing reference. Review the oldest open invoices against due dates and payment status.`,
    )
  } else if (report.id === 'tat-analysis') {
    decisionHelpers.push('Use the 90th percentile and longest completed intervals to prioritize bottleneck investigation; compare against your organization’s SLA before escalating.')
  } else if (report.id === 'data-quality') {
    decisionHelpers.push('Resolve the most frequent exception class first, then reprocess the workbook and confirm that the exception count falls.')
  } else if (topChartGroup) {
    decisionHelpers.push('Use the ranked group as a review queue; confirm currency, PO/GRN/MIRO linkage, and business context before taking action.')
  }

  useEffect(() => {
    setChartDimension(report.dimension)
    setChartMetric(report.metric)
    setDateFrom(null)
    setDateTo(null)
    setSort({ field: '', direction: 'asc' })
  }, [report.id, report.dimension, report.metric])

  function toggleSort(field) {
    setSort((current) => ({
      field,
      direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  async function exportExcel() {
    const exportColumns = displayColumns.map((column) => [
      column.label,
      (row) => formatTableValue(
        row[column.field] ?? row.sourceValues?.[column.sourceIndex],
        column.field,
      ),
    ])
    await exportRowsToExcel(orderedRows, exportColumns, report.id)
  }

  return (
    <section className="procurement-report-detail">
      <ReportNavigation
        activeId={report.id}
        onSelect={(item) => navigate(`/reports/${item.id}`)}
        reports={reportList}
      />
      <header className="page-heading procurement-report-header">
        <div className="procurement-report-title">
          <div className="eyebrow">
            <span className="eyebrow-line" />
            {report.category} · Report {report.number}
          </div>
          <h1>{report.title}</h1>
          <p className="page-subtitle">
            {report.description}
            <span className="source-name">
              Source: {fileName || 'Procurement data'} · Refreshed {new Date().toLocaleDateString('en-IN')}
            </span>
          </p>
          <div className="print-filter-summary">
            <strong>Applied filters:</strong>
            {printFilterSummary.map((filter) => <span key={filter}>{filter}</span>)}
          </div>
        </div>
        <div className="heading-actions procurement-detail-back">
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
          <ReportExportMenu
            onExportCsv={() => exportRows(orderedRows, displayColumns, report)}
            onExportExcel={exportExcel}
            onExportHtml={() => exportReportsToHtml({
              title: report.title,
              subtitle: `${report.description} · ${fileName || 'Procurement data'}. Includes all rows matching the active report filters.`,
              fileName: report.id,
              dashboard: {
                reportTitle: report.title,
                category: report.category,
                number: report.number,
                dateRange: printDateRange,
                filters: printFilterSummary,
                kpis: displayedKpis.filter((kpi) => !(
                  report.id === 'order-fulfillment' &&
                  ['poQuantity', 'receivedQuantity', 'pendingQuantity'].includes(kpi.metric.key)
                )).map((kpi) => ({
                  label: `${kpi.label}${kpi.currency ? ` · ${kpi.currency}` : ''}`,
                  value: formatMetric(kpi.value, kpi.metric, kpi.currency),
                  description: report.id === 'tat-analysis' && kpi.metric.key === 'recordCount'
                    ? 'Unique linked stage intervals with both dates; a document can count in multiple stages.'
                    : report.id === 'tat-analysis' && kpi.metric.key === 'tatDays'
                      ? 'Elapsed calendar days across completed intervals; negative intervals are excluded.'
                      : kpi.metric.kind === 'currency'
                        ? 'Source currency; not converted'
                        : kpi.description ?? 'Based on filtered summary rows',
                })),
                chart: {
                  heading: report.id === 'tat-analysis' ? 'Stage turnaround analysis' : 'Performance breakdown',
                  description: report.id === 'tat-analysis'
                    ? 'Compare elapsed calendar days across stages or available groups.'
                    : 'Compare the selected measure across available groups.',
                  title: `${activeMetric.label} by ${getProcurementFieldLabel(activeDimension).toLowerCase()}`,
                  subtitle: `Ranked by ${getProcurementFieldLabel(activeDimension)}`,
                  metricLabel: activeMetric.label,
                  metricKind: activeMetric.kind,
                  dimensionLabel: getProcurementFieldLabel(activeDimension),
                  entries: chartData.map((entry) => ({
                    ...entry,
                    formatted: formatMetric(entry.value, activeMetric, entry.currency),
                  })),
                  stages: report.id === 'tat-analysis' ? getTatStageSummaries(metricRows).map((stage) => ({
                    ...stage,
                    medianLabel: formatMetric(stage.median, { kind: 'average' }),
                    averageLabel: formatMetric(stage.average, { kind: 'average' }),
                  })) : [],
                },
                insights,
                decisionHelpers,
                tableTitle: getReportTableTitle(report),
                tableDescription: `${orderedRows.length.toLocaleString('en-IN')} rows · ${getReportLevelLabel(report)} · ${printFilterSummary.join(' · ')}`,
                columns: [
                  ...displayColumns.map((column) => ({
                    label: column.label,
                    key: column.field,
                    getValue: (row) => formatTableValue(row[column.field] ?? row.sourceValues?.[column.sourceIndex], column.field),
                    getLink: (row) => {
                      const key = row.poNumber ?? row.prNumber ?? row.grnNumber ?? row.miroNumber ?? row.invoiceNumber
                      return key ? `${window.location.origin}/reports/${report.id}#${encodeURIComponent(key)}` : `${window.location.origin}/reports/${report.id}`
                    },
                  })),
                  ...(report.id === 'pending-grn-report' ? [{ label: 'Pending quantity', getValue: (row) => formatCount(row.pendingQuantity) }] : []),
                ],
                rows: orderedRows,
                snapshot: {
                  type: 'procurement',
                  reportId: report.id,
                  rows,
                  grnRows: summaryTables?.poGrnMiro ?? [],
                  filters: filterOptions.map(([field, label]) => ({
                    key: field,
                    label,
                    values: getFilterOptions(rows, field).map((option) => option.value),
                    selected: filters[field] ?? getFilterOptions(rows, field).map((option) => option.value),
                  })),
                  dateField,
                  dateFrom: selectedDateFrom,
                  dateTo: selectedDateTo,
                  tatStageFilter,
                  tatStageOptions,
                  chartMetric: activeMetric,
                  chartMetrics,
                  chartDimension: activeDimension,
                  chartDimensions,
                  metricFields: [...metricFields],
                  kpis: displayedKpis.filter((kpi) => !(
                    report.id === 'order-fulfillment' &&
                    ['poQuantity', 'receivedQuantity', 'pendingQuantity'].includes(kpi.metric.key)
                  )).map((kpi) => ({ ...kpi, metric: { ...kpi.metric } })),
                  columns: [
                    ...displayColumns.map((column) => ({
                      label: column.label,
                      key: column.field,
                      sourceIndex: column.sourceIndex,
                    })),
                    ...(report.id === 'pending-grn-report' ? [{ label: 'Pending quantity', key: 'pendingQuantity' }] : []),
                  ],
                  tableTitle: getReportTableTitle(report),
                  tableDescription: `${getReportLevelLabel(report)} · ${printFilterSummary.join(' · ')}`,
                },
                rowLink: (row) => {
                  const key = row.poNumber ?? row.prNumber ?? row.grnNumber ?? row.miroNumber ?? row.invoiceNumber
                  return `${window.location.origin}/reports/${report.id}${key ? `#${encodeURIComponent(key)}` : ''}`
                },
                metrics: (report.id === 'order-fulfillment' && fulfillment
                  ? [
                    ['Fully received items', formatCount(fulfillment.fullyReceivedCount)],
                    ['Partially received items', formatCount(fulfillment.partiallyReceivedCount)],
                    ['Not received items', formatCount(fulfillment.notReceivedCount)],
                    ['Average item completion', fulfillment.averageCompletionRate == null ? '—' : `${fulfillment.averageCompletionRate.toFixed(1)}%`],
                    ['Net pending quantity', formatCount(fulfillment.pendingQuantity)],
                  ]
                  : report.id === 'invoice-tax' && settlement
                    ? [
                      ['Cleared invoices', formatCount(settlement.clearedCount)],
                      ['Open invoices', formatCount(settlement.openCount)],
                      ['Average clearing time', settlement.averageClearingDays == null ? '—' : `${settlement.averageClearingDays.toFixed(1)} days`],
                    ] : []),
              },
            })}
            onPreview={onPreviewPrint}
          />
        </div>
      </header>

      <section aria-label="Report filters" className="panel filter-panel procurement-filter-panel">
        <div className="filter-panel-title">
          <div className="filter-title-mark"><span /><span /><span /></div>
          <div>
            <h2>Filters</h2>
            <p>{report.id === 'tat-analysis' ? 'Refine the stage report' : 'Refine this report'}</p>
          </div>
        </div>
        <div className="filter-controls procurement-filter-grid">
          {report.id === 'tat-analysis' && (
            <label className="date-filter procurement-stage-filter">
              <span>TAT stage</span>
              <select
                onChange={(event) => {
                  setTatStageFilter(event.target.value)
                }}
                value={tatStageFilter}
              >
                <option value="">All stages</option>
                {tatStageOptions.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
              </select>
            </label>
          )}
          {filterOptions.map(([field, label]) => {
            const values = filterChoices.get(field) ?? []
            return (
              <SearchableMultiSelect
                key={field}
                label={label}
                onChange={(selected) => {
                  setFilters((current) => ({ ...current, [field]: selected }))
                }}
                options={values}
                selected={filters[field]}
              />
            )
          })}
          {dateField && (
            <>
              <label className="date-filter">
                <span>From</span>
                <span className="date-input">
                  <input onChange={(event) => setDateFrom(event.target.value)} type="date" value={getDateInputValue(selectedDateFrom, 'start')} />
                </span>
              </label>
              <label className="date-filter">
                <span>To</span>
                <span className="date-input">
                  <input onChange={(event) => setDateTo(event.target.value)} type="date" value={getDateInputValue(selectedDateTo, 'end')} />
                </span>
              </label>
            </>
          )}
          <button
            className="reset-button"
            onClick={() => {
              setFilters({})
              setTatStageFilter('')
              setDateFrom(null)
              setDateTo(null)
            }}
            type="button"
          >
            Clear filters
          </button>
        </div>
      </section>

      <section aria-label="Report KPIs" className="kpi-grid procurement-kpi-grid">
        {displayedKpis.filter((kpi) => !(
          report.id === 'order-fulfillment' &&
          ['poQuantity', 'receivedQuantity', 'pendingQuantity'].includes(kpi.metric.key)
        )).map((kpi) => (
          <article className="panel kpi-card procurement-kpi" key={kpi.key}>
            <span>{kpi.label}{kpi.currency ? ` · ${kpi.currency}` : ''}</span>
            <strong>{formatMetric(kpi.value, kpi.metric, kpi.currency)}</strong>
            <small>
              {report.id === 'tat-analysis' && kpi.metric.key === 'recordCount'
                ? 'Unique linked stage intervals with both dates; a document can count in multiple stages.'
                : report.id === 'tat-analysis' && kpi.metric.key === 'tatDays'
                  ? 'Elapsed calendar days across completed intervals; negative intervals are excluded.'
                : kpi.metric.kind === 'currency'
                  ? 'Source currency; not converted'
                  : kpi.description ?? 'Based on filtered summary rows'}
            </small>
          </article>
        ))}
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
        <div className={`chart-grid procurement-chart-grid has-pie${report.id === 'tat-analysis' ? ' is-tat' : ''}`}>
          <ProcurementBarChart
            entries={chartData}
            metric={activeMetric}
            subtitle={`Ranked by ${getProcurementFieldLabel(activeDimension)}`}
            title={`${activeMetric.label} by ${getProcurementFieldLabel(activeDimension).toLowerCase()}`}
          />
          <ProcurementPieChart
            dimension={activeDimension}
            entries={chartData}
            metric={activeMetric}
          />
          {report.id === 'tat-analysis' && <ProcurementTatStageFlow rows={metricRows} />}
        </div>
      </section>

      <section aria-label="Detailed transaction data" className="panel table-panel procurement-table-panel">
        <div className="procurement-section-heading table-heading">
          <div><h2>{getReportTableTitle(report)}</h2><p>{formatCount(orderedRows.length)} matching {getReportLevelLabel(report)} records</p></div>
        </div>
        <div className="table-scroll procurement-table-scroll">
          <table>
            <thead>
              <tr>
                {displayColumns.map((column) => (
                  <th className={['poTotal', 'miroValue', 'grnValue', 'poQuantity', 'orderedQuantity', 'receivedQuantity', 'pendingQuantity', 'gst', 'clearingDays', 'tatDays'].includes(column.field) ? 'align-right' : ''} key={`${column.key}-${column.sourceIndex}`}>
                    <button className="sort-header" onClick={() => toggleSort(column.field ?? column.key)} type="button">
                      {column.label}
                      {sort.field === (column.field ?? column.key) && <span>{sort.direction === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  </th>
                ))}
                {report.id === 'pending-grn-report' && <th><button className="sort-header" onClick={() => toggleSort('pendingQuantity')} type="button" aria-label={`Sort pending quantity ${sort.field === 'pendingQuantity' && sort.direction === 'asc' ? 'descending' : 'ascending'}`}>Pending quantity{sort.field === 'pendingQuantity' && <span>{sort.direction === 'asc' ? '↑' : '↓'}</span>}</button></th>}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => {
                const rowKey = [row.poNumber, row.prNumber, row.grnNumber, row.miroNumber, row.invoiceNumber]
                  .find((value) => String(value ?? '') === linkedRowKey)
                return (
                <tr key={`${row.rowNumber}-${index}`} id={rowKey ? encodeURIComponent(linkedRowKey) : undefined} className={rowKey ? 'linked-report-row' : undefined}>
                  {displayColumns.map((column) => (
                    <td key={`${column.key}-${column.sourceIndex}`}>
                      {String(formatTableValue(row[column.field] ?? row.sourceValues?.[column.sourceIndex], column.field))}
                    </td>
                  ))}
                  {report.id === 'pending-grn-report' && <td>{formatCount(row.pendingQuantity)}</td>}
                </tr>
              )})}
              {visibleRows.length === 0 && (
                <tr><td className="empty-table" colSpan={displayColumns.length + (report.id === 'pending-grn-report' ? 1 : 0)}>No records match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer procurement-table-footer">
          <span><i className="footer-dot" /> {getReportLevelLabel(report)} · calculated fields are shown where available</span>
          <span>{formatCount(orderedRows.length)} matching rows</span>
        </div>
        {visibleTableCount < orderedRows.length && <div className="procurement-pagination"><span>Showing {formatCount(visibleRows.length)} of {formatCount(orderedRows.length)} rows</span><button className="button button-outline" onClick={() => setVisibleTableCount((count) => count + 50)} type="button">Show 50 more</button></div>}
      </section>

      <ReportInsightsSummary
        chartRules={chartRules}
        decisionHelpers={decisionHelpers}
        insights={insights}
        kpis={insightKpis}
      />
      {(report.id === 'order-fulfillment' || report.id === 'invoice-tax') && <section className="procurement-insights panel">
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
      </section>}
      <ReportNavigation
        activeId={report.id}
        onSelect={(item) => navigate(`/reports/${item.id}`)}
        placement="bottom"
        reports={reportList}
      />
    </section>
  )
}
