import { memo, useEffect, useMemo, useRef, useState } from 'react'
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
} from './lib/reportData'
import {
  getAvailableProcurementReports,
  PROCUREMENT_REPORTS,
} from './lib/procurementReports'
import { readWorkbookInWorker } from './lib/workbookClient'
import {
  clearWorkbookData,
  createWorkbookFile,
  getCachedWorkbook,
  loadWorkbook,
  saveWorkbook,
} from './lib/workbookStorage'
import { getChartColor } from './lib/chartColors'
import { useAppStore } from './store/useAppStore'
import {
  ProcurementReportCatalog,
  ProcurementReportDashboard,
} from './ProcurementReports'
import PrintPreviewDialog from './PrintPreviewDialog'
import ReportErrorBoundary from './ReportErrorBoundary'
import ReportExportMenu from './ReportExportMenu'
import ReportInsightsSummary from './ReportInsightsSummary'
import ReportNavigation from './ReportNavigation'
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
        <div className="eyebrow"><span className="eyebrow-line" /> Procurement report</div>
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
      reportList={availableReports}
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
  { key: 'salesOrganizationName', codeKey: 'salesOrganization', label: 'Sales organization' },
  { key: 'salesDocumentTypeDescription', codeKey: 'salesDocumentType', label: 'Sales document type' },
  { key: 'soldToPartyName', label: 'Customer' },
  { key: 'salesOffice', label: 'Sales office' },
  { key: 'salesGroup', label: 'Sales group' },
  { key: 'salesDistrictName', codeKey: 'salesDistrict', label: 'Sales district' },
  { key: 'distributionChannelName', codeKey: 'distributionChannel', label: 'Distribution channel' },
  { key: 'divisionName', codeKey: 'division', label: 'Division' },
  { key: 'materialDescription', codeKey: 'material', label: 'Material' },
  { key: 'plant', label: 'Plant' },
  { key: 'overallStatusDescription', codeKey: 'overallStatus', label: 'Overall status' },
  { key: 'referenceStatusDescription', codeKey: 'referenceStatus', label: 'Reference status' },
  { key: 'orderReasonDescription', codeKey: 'orderReason', label: 'Order reason' },
  { key: 'rejectionReasonDescription', codeKey: 'rejectionReason', label: 'Rejection reason' },
  { key: 'createdBy', label: 'Created by' },
  { key: 'usage', label: 'Usage group' },
  { key: 'currency', label: 'Currency' },
]

const REPORT_CARDS = [
  {
    id: 'overview',
    title: 'Sales organization performance',
    description: 'Compare quotation volume and converted value by organization name and SAP code.',
    groupBy: 'salesOrganizationName',
    icon: 'chart',
  },
  {
    id: 'customer',
    title: 'Customer performance',
    description: 'Rank sold-to customers by quotation volume and converted INR value.',
    groupBy: 'soldToPartyName',
    icon: 'file',
  },
  {
    id: 'sales-district',
    title: 'Sales district',
    description: 'Compare quotations by district description and SAP district code, with Config and Manual value splits.',
    groupBy: 'salesDistrictName',
    icon: 'chart',
  },
  {
    id: 'distribution-channel',
    title: 'Distribution channel',
    description: 'Compare quotations by channel description and SAP channel code, with Config and Manual value splits.',
    groupBy: 'distributionChannelName',
    icon: 'chart',
  },
  {
    id: 'sales-office',
    title: 'Sales office',
    description: 'Compare quotation volume and converted INR value across sales offices.',
    groupBy: 'salesOffice',
    icon: 'chart',
  },
  {
    id: 'sales-group',
    title: 'Sales group',
    description: 'Compare quotation volume and converted INR value by responsible sales group.',
    groupBy: 'salesGroup',
    icon: 'chart',
  },
  {
    id: 'material',
    title: 'Material analysis',
    description: 'Compare quotations by material description and SAP material code, including Config and Manual splits.',
    groupBy: 'materialDescription',
    icon: 'file',
  },
  {
    id: 'plant',
    title: 'Plant analysis',
    description: 'Compare quoted work by supplying plant.',
    groupBy: 'plant',
    icon: 'chart',
  },
  {
    id: 'division',
    title: 'Division analysis',
    description: 'Compare quotations by division description and SAP division code.',
    groupBy: 'divisionName',
    icon: 'chart',
  },
  {
    id: 'document-type',
    title: 'Document type',
    description: 'Compare quotations by document type description and SAP type code.',
    groupBy: 'salesDocumentTypeDescription',
    icon: 'file',
  },
  {
    id: 'status',
    title: 'Status analysis',
    description: 'Review quotation volume and converted INR value by status description and SAP status code.',
    groupBy: 'overallStatusDescription',
    icon: 'check',
  },
  {
    id: 'order-reason',
    title: 'Order reason',
    description: 'Compare quotation volume and converted INR value by order reason description and SAP code.',
    groupBy: 'orderReasonDescription',
    icon: 'file',
  },
  {
    id: 'creator',
    title: 'Created by',
    description: 'Compare quotation volume and converted INR value by the SAP user who created each document.',
    groupBy: 'createdBy',
    icon: 'check',
  },
  {
    id: 'usage',
    title: 'Configurator vs Manual',
    description: 'Compare quotation volume and converted INR value for Config and Manual quotations.',
    groupBy: 'usage',
    icon: 'check',
  },
  {
    id: 'currency',
    title: 'Currency analysis',
    description: 'Compare quotation counts and original-currency totals, keeping different currencies separate.',
    groupBy: 'currency',
    icon: 'file',
  },
  {
    id: 'trend',
    title: 'Trend analysis',
    description: 'Track Config and Manual quotation volume and converted INR value across selectable time periods.',
    groupBy: 'trend',
    icon: 'chart',
  },
]

const QUOTATION_REQUIRED_COLUMNS = 'Sales Document, Created By, Sales Organization, Document Currency, Net Value (Header), Document Date'

const REPORT_DIMENSION_COLUMNS = {
  salesOrganizationName: 'Sales Organization Name / Sales Organization',
  soldToPartyName: 'Sold-To Party Name',
  salesDistrictName: 'Sales district name / Sales district',
  distributionChannelName: 'Distribution Channel Name / Distribution Channel',
  salesOffice: 'Sales office',
  salesGroup: 'Sales group',
  materialDescription: 'Material Description / Material',
  plant: 'Plant',
  divisionName: 'Division Name / Division',
  salesDocumentTypeDescription: 'Sales Document Type Description / Sales Document Type',
  overallStatusDescription: 'Overall Status Description / Overall Status',
  orderReasonDescription: 'Order Reason Description / Order Reason',
  createdBy: 'Created By',
  usage: 'Created By (classifies Config vs Manual)',
  currency: 'Document Currency',
  trend: 'Document Date, Created By',
}

const quotationReportTitle = (key) => REPORT_CARDS.find((report) => report.groupBy === key)?.title ?? 'Quotation report'

const TREND_INTERVALS = [
  { key: 'day', label: 'Daily', minimumDays: 1 },
  { key: 'week', label: 'Weekly', minimumDays: 8 },
  { key: 'month', label: 'Monthly', minimumDays: 32 },
  { key: 'quarter', label: 'Quarterly', minimumDays: 93 },
  { key: 'year', label: 'Yearly', minimumDays: 366 },
]

function getTrendSpanDays(rows) {
  const dates = rows.map((row) => row.date).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))).sort()
  if (!dates.length) return 0
  const start = Date.parse(`${dates[0]}T00:00:00Z`)
  const end = Date.parse(`${dates.at(-1)}T00:00:00Z`)
  return Math.floor((end - start) / 86_400_000) + 1
}

function getRecommendedTrendInterval(spanDays) {
  if (spanDays <= 14) return 'day'
  if (spanDays <= 90) return 'week'
  if (spanDays <= 730) return 'month'
  if (spanDays <= 1825) return 'quarter'
  return 'year'
}

function getTrendBucket(dateValue, interval, spanDays) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue ?? ''))) return null
  const [year, month, day] = dateValue.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (interval === 'day') {
    const axisLabel = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(spanDays > 365 ? { year: '2-digit' } : {}), timeZone: 'UTC' })
    return { key: dateValue, label: formatDateLabel(dateValue), axisLabel }
  }
  if (interval === 'week') {
    const mondayOffset = (date.getUTCDay() + 6) % 7
    date.setUTCDate(date.getUTCDate() - mondayOffset)
    const key = date.toISOString().slice(0, 10)
    const axisLabel = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(spanDays > 365 ? { year: '2-digit' } : {}), timeZone: 'UTC' })
    return { key, label: `Week of ${formatDateLabel(key)}`, axisLabel }
  }
  if (interval === 'quarter') {
    const quarter = Math.floor((month - 1) / 3) + 1
    const key = `${year}-Q${quarter}`
    return { key, label: `Q${quarter} ${year}`, axisLabel: `Q${quarter} '${String(year).slice(-2)}` }
  }
  if (interval === 'year') {
    const key = String(year)
    return { key, label: key, axisLabel: key }
  }
  const key = `${year}-${String(month).padStart(2, '0')}`
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const axisLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' })
  return { key, label, axisLabel }
}

function getTrendSortValue(point, key) {
  if (key === 'configCount') return point.CONFIGURATOR.count
  if (key === 'manualCount') return point.MANUAL.count
  if (key === 'configValue') return point.CONFIGURATOR.inr
  if (key === 'manualValue') return point.MANUAL.inr
  return point.key
}

function getComparisonSortValue(entry, key) {
  if (key === 'configCount') return entry.CONFIGURATOR.count
  if (key === 'manualCount') return entry.MANUAL.count
  if (key === 'configValue') return entry.CONFIGURATOR.inr
  if (key === 'manualValue') return entry.MANUAL.inr
  return entry.label
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
  const maximumAxisLabels = Math.max(2, Math.floor(plotWidth / 92))
  const axisLabelCount = Math.min(pointCount, maximumAxisLabels)
  const labelIndexes = axisLabelCount === 0
    ? []
    : axisLabelCount === 1
      ? [0]
    : [...new Set(Array.from({ length: axisLabelCount }, (_, index) => Math.round(index * (pointCount - 1) / (axisLabelCount - 1))))]
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
              return <text className="trend-axis-label" key={`${point.key}-${index}`} textAnchor={index === 0 ? 'start' : index === pointCount - 1 ? 'end' : 'middle'} x={x} y={height - 7}>{point.axisLabel ?? point.label}</text>
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

const PIE_LABEL_LIMIT = 10

function getTreemapTiles(entries, metric) {
  const ranked = [...entries]
    .map((entry) => ({
      ...entry,
      pieValue: metric === 'count' ? entry.count : Math.abs(entry.inr),
    }))
    .filter((entry) => entry.pieValue > 0)
    .sort((a, b) => b.pieValue - a.pieValue)
  const visible = ranked.slice(0, PIE_LABEL_LIMIT)
  const remainder = ranked.slice(PIE_LABEL_LIMIT)
  if (remainder.length) {
    visible.push({
      label: 'Other',
      count: remainder.reduce((sum, entry) => sum + entry.count, 0),
      inr: remainder.reduce((sum, entry) => sum + entry.inr, 0),
      pieValue: remainder.reduce((sum, entry) => sum + entry.pieValue, 0),
    })
  }
  return visible
}

function TreemapChart({ entries, metric, groupLabel }) {
  const tiles = getTreemapTiles(entries, metric)
  const total = tiles.reduce((sum, entry) => sum + entry.pieValue, 0)
  return (
    <div className="treemap" role="list" aria-label={`Treemap of ${metric === 'count' ? 'quotation count' : 'absolute converted INR value'} by ${groupLabel}`}>
      {tiles.map((tile, index) => {
        const share = total ? tile.pieValue / total : 0
        return (
          <div
            className="treemap-tile"
            key={tile.label}
            role="listitem"
            style={{ flexGrow: Math.max(share * 100, 8), '--pie-color': getChartColor(index) }}
            title={`${tile.label}: ${metric === 'count' ? formatCount(tile.count) : formatMoney(Math.abs(tile.inr), 'INR')} (${(share * 100).toFixed(1)}%)`}
          >
            <strong>{tile.label}</strong>
            <span>{metric === 'count' ? formatCount(tile.count) : formatMoney(Math.abs(tile.inr), 'INR')}</span>
            <small>{(share * 100).toFixed(1)}%</small>
          </div>
        )
      })}
    </div>
  )
}

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

const PieChart = memo(function PieChart({ entries, metric, groupLabel }) {
  const pieEntries = entries
    .map((entry) => ({
      ...entry,
      pieValue: metric === 'count' ? entry.count : Math.abs(entry.inr),
    }))
    .filter((entry) => entry.pieValue > 0)
  const total = pieEntries.reduce((sum, entry) => sum + entry.pieValue, 0)
  const useTreemap = pieEntries.length > PIE_LABEL_LIMIT
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
          {metric === 'count' ? 'Quotations' : 'Absolute INR · Lacs / Cr'}
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
      {useTreemap ? (
        <TreemapChart entries={entries} metric={metric} groupLabel={groupLabel} />
      ) : slices.length ? (
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
                style={{ '--pie-color': getChartColor(slice.index) }}
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
                  style={{ '--pie-color': getChartColor(slice.index) }}
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
})

const QUOTATION_BREAKDOWN_COLUMNS = [
  ['Report group', (row) => row.label],
  ['Config quotations', (row) => row.CONFIGURATOR.count],
  ['Manual quotations', (row) => row.MANUAL.count],
  ['Total quotations', (row) => row.count],
  ['Config value (INR)', (row) => row.CONFIGURATOR.inr],
  ['Manual value (INR)', (row) => row.MANUAL.inr],
  ['Total value (INR)', (row) => row.inr],
]

function makeCsv(rows, columns) {
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
  { key: 'customerReferenceHeader', label: 'Customer Reference' },
  { key: 'soldToPartyName', label: 'Customer' },
  { key: 'salesDocumentTypeDescription', label: 'Sales Document Type' },
  { key: 'salesDocumentItem', label: 'Item' },
  { key: 'validToDate', label: 'Valid-to date' },
  { key: 'materialDescription', label: 'Material Description' },
  { key: 'salesOffice', label: 'Sales office' },
  { key: 'salesGroup', label: 'Sales group' },
  { key: 'overallStatusDescription', label: 'Overall Status' },
  { key: 'referenceStatusDescription', label: 'Reference Status' },
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

function getWorkbookSelections(imported) {
  if (imported.datasetType === 'procurement') {
    return { organizations: [], usages: [], currencies: [] }
  }
  return imported.summaryTables?.options ?? {
    organizations: [...new Set(imported.rows.map((row) => row.salesOrganization))],
    usages: [...new Set(imported.rows.map((row) => row.usage))],
    currencies: [...new Set(imported.rows.map((row) => row.currency))],
  }
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
  const navigate = useNavigate()
  const location = useLocation()
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [trendInterval, setTrendInterval] = useState(null)
  const [trendUsageSelection, setTrendUsageSelection] = useState(['CONFIGURATOR', 'MANUAL'])
  const [selectedSteps, setSelectedSteps] = useState(() => PREPROCESSING_STEPS.map((step) => step.id))
  const [rawDataRows, setRawDataRows] = useState([])
  const [rawDataColumns, setRawDataColumns] = useState([])
  const [visibleRawDataCount, setVisibleRawDataCount] = useState(100)
  const [rawDataSearch, setRawDataSearch] = useState('')
  const [rawDataSort, setRawDataSort] = useState({ key: 'date', direction: 'desc' })
  const [rawDataSlicers, setRawDataSlicers] = useState({
    salesOrganization: '',
    usage: '',
    currency: '',
  })
  const [rawDataView, setRawDataView] = useState('raw')
  const [comparisonSearch, setComparisonSearch] = useState('')
  const [comparisonSort, setComparisonSort] = useState({ key: 'label', direction: 'asc' })
  const [trendSort, setTrendSort] = useState({ key: 'key', direction: 'asc' })
  const [visibleComparisonCount, setVisibleComparisonCount] = useState(50)
  const isRestoring = useAppStore((state) => state.isRestoring)
  const rows = useAppStore((state) => state.rows)
  const datasetType = useAppStore((state) => state.datasetType)
  const summaryTables = useAppStore((state) => state.summaryTables)
  const selections = useAppStore((state) => state.selections)
  const dateFrom = useAppStore((state) => state.dateFrom)
  const dateTo = useAppStore((state) => state.dateTo)
  const groupBy = useAppStore((state) => state.groupBy)
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
    const updateBackToTopVisibility = () => {
      const shouldShow = window.scrollY > 420
      setShowBackToTop((current) => current === shouldShow ? current : shouldShow)
    }
    updateBackToTopVisibility()
    window.addEventListener('scroll', updateBackToTopVisibility, { passive: true })
    return () => window.removeEventListener('scroll', updateBackToTopVisibility)
  }, [])

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

        let file
        let imported = getCachedWorkbook(savedWorkbook)
        if (!imported) {
          file = createWorkbookFile(savedWorkbook)
          imported = await readWorkbookInWorker(file)
          void saveWorkbook(file, imported.sheetName, imported.datasetType, imported).catch(() => {})
        }
        if (!active) return

        const importedBounds = imported.summaryTables?.dateBounds ?? getDateBounds(imported.rows)
        setRows(imported.rows)
        setDatasetType(imported.datasetType ?? savedWorkbook.datasetType ?? 'quotation')
        setSummaryTables(imported.summaryTables ?? null)
        setRawDataRows(imported.sourceRows ?? imported.rows)
        setRawDataColumns(imported.sourceColumns ?? [])
        setVisibleRawDataCount(100)
        setSelections(getWorkbookSelections(imported))
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

  const isRawDataRoute = location.pathname.startsWith('/raw-data')
  const needsQuotationAnalysis = datasetType !== 'procurement' && (
    location.pathname === '/dashboard' || (isRawDataRoute && rawDataView === 'processed')
  )
  const bounds = summaryTables?.dateBounds ?? getDateBounds(rows)
  const outlierRows = useMemo(
    () => needsQuotationAnalysis && outlierFilter === 'iqr'
      ? new Set(summaryTables?.outliers?.iqr ?? [...getOutlierRows(rows)].map((row) => row.document))
      : new Set(),
    [needsQuotationAnalysis, outlierFilter, rows, summaryTables],
  )
  const modifiedZScoreOutlierRows = useMemo(
    () => needsQuotationAnalysis && outlierFilter === 'mad'
      ? new Set(summaryTables?.outliers?.mad ?? [...getModifiedZScoreOutlierRows(rows)].map((row) => row.document))
      : new Set(),
    [needsQuotationAnalysis, outlierFilter, rows, summaryTables],
  )
  const percentileBounds = useMemo(
    () => needsQuotationAnalysis && outlierFilter === 'percentile' ? getPercentileBounds(rows, percentileTail) : new Map(),
    [needsQuotationAnalysis, outlierFilter, percentileTail, rows],
  )
  const options = useMemo(() => summaryTables?.options ?? {
    organizations: [...new Set(rows.map((row) => row.salesOrganization))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    usages: [...new Set(rows.map((row) => row.usage))].sort(),
    currencies: [...new Set(rows.map((row) => row.currency))].sort(),
  }, [rows, summaryTables])

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

  const rawDataOptions = useMemo(() => isRawDataRoute ? ({
    salesOrganization: [...new Set(rawDataRows.map((row) => row.salesOrganization).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    usage: [...new Set(rawDataRows.map((row) => row.usage).filter(Boolean))].sort(),
    currency: [...new Set(rawDataRows.map((row) => row.currency).filter(Boolean))].sort(),
  }) : { salesOrganization: [], usage: [], currency: [] }, [isRawDataRoute, rawDataRows])
  const displayedDataColumns = datasetType === 'procurement'
    ? rawDataView === 'raw' ? rawDataColumns : rawDataColumns.filter((column) => column.field)
    : rawDataView === 'raw' ? rawDataColumns : PROCESSED_DATA_COLUMNS

  const visibleRawRows = useMemo(() => {
    if (!isRawDataRoute) return []
    const query = rawDataSearch.trim().toLowerCase()
    const sourceColumn = rawDataColumns.find((column) => column.key === rawDataSort.key)
    return rawDataRows
      .filter((row) => {
        const matchesSalesOrganization = !rawDataSlicers.salesOrganization || row.salesOrganization === rawDataSlicers.salesOrganization
        const matchesUsage = !rawDataSlicers.usage || row.usage === rawDataSlicers.usage
        const matchesCurrency = !rawDataSlicers.currency || row.currency === rawDataSlicers.currency
        if (!matchesSalesOrganization || !matchesUsage || !matchesCurrency) return false
        if (!query) return true
        const searchableValues = [row.document, row.createdBy, row.salesOrganization, row.usage, row.currency, row.date, row.amount, row.inr]
        return searchableValues.some((value) => String(value ?? '').toLowerCase().includes(query)) ||
          row.sourceValues?.some((value) => value.toLowerCase().includes(query))
      })
      .sort((a, b) => {
        const direction = rawDataSort.direction === 'asc' ? 1 : -1
        const left = sourceColumn ? a.sourceValues?.[sourceColumn.sourceIndex] : a[rawDataSort.key]
        const right = sourceColumn ? b.sourceValues?.[sourceColumn.sourceIndex] : b[rawDataSort.key]
        return compareRawDataValues(left, right, rawDataSort.key) * direction
      })
  }, [isRawDataRoute, rawDataColumns, rawDataRows, rawDataSearch, rawDataSlicers, rawDataSort])

  const selectedRows = useMemo(() => {
    if (!needsQuotationAnalysis || dateError) return []
    const effectiveTo = dateTo || dateFrom
    return rows.filter(
      (row) =>
        selections.organizations.includes(row.salesOrganization) &&
        selections.usages.includes(row.usage) &&
        selections.currencies.includes(row.currency) &&
        (!dateFrom || row.date >= dateFrom) &&
        (!effectiveTo || row.date <= effectiveTo),
    )
  }, [dateError, dateFrom, dateTo, needsQuotationAnalysis, rows, selections])

  const filteredRows = useMemo(() => {
    if (outlierFilter === 'zero') return selectedRows.filter((row) => row.amount !== 0)
    if (outlierFilter === 'iqr') return selectedRows.filter((row) => !outlierRows.has(row.document))
    if (outlierFilter === 'mad') {
      return selectedRows.filter((row) => !modifiedZScoreOutlierRows.has(row.document))
    }
    if (outlierFilter === 'percentile') {
      return selectedRows.filter((row) => {
        const range = percentileBounds.get(row.currency)
        return !range || (row.amount >= range.lower && row.amount <= range.upper)
      })
    }
    return selectedRows
  }, [modifiedZScoreOutlierRows, outlierFilter, outlierRows, percentileBounds, selectedRows])
  const rawDataTableRows = rawDataView === 'raw' || datasetType === 'procurement' ? visibleRawRows : filteredRows
  const visibleDataTableRows = rawDataTableRows.slice(0, visibleRawDataCount)
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

  const kpis = useMemo(() => {
    const convertedRows = filteredRows.filter((row) => row.inr != null)
    return {
      quotations: filteredRows.length,
      organizations: new Set(filteredRows.map((row) => row.salesOrganization).filter(Boolean)).size,
      totalInr: convertedRows.reduce((sum, row) => sum + row.inr, 0),
      convertedCount: convertedRows.length,
      currencies: [...new Set(filteredRows.filter((row) => row.inr == null).map((row) => row.currency))],
    }
  }, [filteredRows])

  const reportSummary = useMemo(() => {
    const report = CHART_GROUPS.find((item) => item.key === groupBy)
    if (!report) return []
    const field = report.key
    const results = new Map()
    for (const row of filteredRows) {
      const code = report.codeKey ? String(row[report.codeKey] ?? '').trim() : ''
      const description = String(row[field] ?? '').trim()
      const label = description && code && description !== code ? `${description} (${code})` : description || code || 'Unspecified'
      const identity = code || label
      const entry = results.get(identity) ?? { label, code, count: 0, inr: 0, CONFIGURATOR: { count: 0, inr: 0 }, MANUAL: { count: 0, inr: 0 } }
      if (!entry.label || entry.label === entry.code) entry.label = label
      entry.count += 1
      entry[row.usage].count += 1
      if (row.inr != null) {
        entry.inr += row.inr
        entry[row.usage].inr += row.inr
      }
      results.set(identity, entry)
    }
    return [...results.values()].sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' }))
  }, [filteredRows, groupBy])
  const chartEntries = reportSummary
  const filteredComparisonRows = useMemo(() => {
    const query = comparisonSearch.trim().toLowerCase()
    const matches = query ? chartEntries.filter((entry) => entry.label.toLowerCase().includes(query)) : chartEntries
    return [...matches].sort((left, right) => {
      const a = getComparisonSortValue(left, comparisonSort.key)
      const b = getComparisonSortValue(right, comparisonSort.key)
      const result = typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' })
      return result * (comparisonSort.direction === 'asc' ? 1 : -1)
    })
  }, [chartEntries, comparisonSearch, comparisonSort])
  const visibleComparisonRows = filteredComparisonRows.slice(0, visibleComparisonCount)

  const trendSpanDays = useMemo(() => getTrendSpanDays(filteredRows), [filteredRows])
  const recommendedTrendInterval = getRecommendedTrendInterval(trendSpanDays)
  const availableTrendIntervals = useMemo(() => TREND_INTERVALS.map((interval) => ({
    ...interval,
    disabled: interval.key !== 'day' && trendSpanDays < interval.minimumDays,
  })), [trendSpanDays])
  const activeTrendInterval = availableTrendIntervals.find((interval) => interval.key === trendInterval && !interval.disabled)?.key
    ?? recommendedTrendInterval

  const trendRows = useMemo(() => {
    if (groupBy !== 'trend') return []
    const grouped = new Map()
    for (const row of filteredRows) {
      const bucket = getTrendBucket(row.date, activeTrendInterval, trendSpanDays)
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
  }, [activeTrendInterval, filteredRows, groupBy, trendSpanDays])
  const sortedTrendRows = useMemo(() => [...trendRows].sort((left, right) => {
    const a = getTrendSortValue(left, trendSort.key)
    const b = getTrendSortValue(right, trendSort.key)
    const result = typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' })
    return result * (trendSort.direction === 'asc' ? 1 : -1)
  }), [trendRows, trendSort])
  const trendSeries = useMemo(() => groupBy !== 'trend' ? [] : [
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
  ], [groupBy, trendRows, trendUsageSelection])
  const trendValueSeries = useMemo(() => groupBy !== 'trend' ? [] : [
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
  ], [groupBy, trendRows, trendUsageSelection])
  const trendInsights = useMemo(() => {
    if (groupBy !== 'trend') return {
      configShare: 0,
      valueShare: null,
      countDifference: 0,
      config: { count: 0, inr: 0, convertedCount: 0 },
      manual: { count: 0, inr: 0, convertedCount: 0 },
    }
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
  }, [groupBy, trendRows])
  const trendIntervalLabel = TREND_INTERVALS.find((item) => item.key === activeTrendInterval)?.label ?? 'Weekly'
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
        await saveWorkbook(file, imported.sheetName, imported.datasetType, imported)
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

      const importedBounds = imported.summaryTables?.dateBounds ?? getDateBounds(imported.rows)
      setRows(imported.rows)
      setDatasetType(imported.datasetType ?? 'quotation')
      setSummaryTables(imported.summaryTables ?? null)
      setRawDataRows(imported.sourceRows ?? imported.rows)
      setRawDataColumns(imported.sourceColumns ?? [])
      setVisibleRawDataCount(100)
      setRawDataSearch('')
      setRawDataSort({ key: 'date', direction: 'desc' })
      setRawDataSlicers({
        salesOrganization: '',
        usage: '',
        currency: '',
      })
      setRawDataView('raw')
      setSelections(getWorkbookSelections(imported))
      setTrendUsageSelection(['CONFIGURATOR', 'MANUAL'])
      setDateFrom(importedBounds.min)
      setDateTo(importedBounds.min === importedBounds.max ? '' : importedBounds.max)
      setFileInfo({
        name: file.name,
        size: file.size,
        sheet: imported.sheetName,
      })
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
    setOutlierFilter('all')
    setTrendUsageSelection(['CONFIGURATOR', 'MANUAL'])
  }

  function downloadCsv() {
    const rowsToExport = groupBy === 'trend' ? trendRows : reportSummary
    const columns = groupBy === 'trend' ? [
      ['Time bracket', (row) => row.label],
      ['Config quotations', (row) => row.CONFIGURATOR.count],
      ['Manual quotations', (row) => row.MANUAL.count],
      ['Config value (INR)', (row) => row.CONFIGURATOR.inr],
      ['Manual value (INR)', (row) => row.MANUAL.inr],
    ] : QUOTATION_BREAKDOWN_COLUMNS
    const blob = new Blob(['\ufeff', makeCsv(rowsToExport, columns)], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${groupBy}-quotation-report.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function downloadExcel() {
    const rowsToExport = groupBy === 'trend' ? trendRows : reportSummary
    const columns = groupBy === 'trend' ? [
      ['Time bracket', (row) => row.label],
      ['Config quotations', (row) => row.CONFIGURATOR.count],
      ['Manual quotations', (row) => row.MANUAL.count],
      ['Config value (INR)', (row) => row.CONFIGURATOR.inr],
      ['Manual value (INR)', (row) => row.MANUAL.inr],
    ] : QUOTATION_BREAKDOWN_COLUMNS
    await exportRowsToExcel(rowsToExport, columns, `${groupBy}-quotation-report`)
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
    setVisibleRawDataCount(100)
    setRawDataSearch('')
    setRawDataSort({ key: 'date', direction: 'desc' })
    setRawDataSlicers({ salesOrganization: '', usage: '', currency: '' })
    setRawDataView('raw')
    setSelections({ organizations: [], usages: [], currencies: [] })
    setDatasetType('quotation')
    setSummaryTables(null)
    setDateFrom('')
    setDateTo('')
    setGroupBy('salesOrganizationName')
    setQuery('')
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
          <button
            aria-checked={theme === 'dark'}
            aria-label={`Dark mode ${theme === 'dark' ? 'on' : 'off'}`}
            className={`theme-switch${theme === 'dark' ? ' is-dark' : ''}`}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            role="switch"
            type="button"
          >
            <Icon name="sun" size={15} />
            <span aria-hidden="true" className="theme-switch-track"><span /></span>
            <Icon name="moon" size={15} />
          </button>
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
                        <div className="eyebrow"><span className="eyebrow-line" /> Report library</div>
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
                            if (report.id === 'trend') setTrendInterval(null)
                            navigate('/dashboard')
                          }}
                          type="button"
                        >
                          <span className="report-card-topline">
                            <span className="report-card-icon"><Icon name={report.icon} size={20} /></span>
                            <span className="report-card-label">Report {String(index + 1).padStart(2, '0')}</span>
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
                            <span>{QUOTATION_REQUIRED_COLUMNS}</span>
                            <strong>Breakdown field</strong>
                            <span>{REPORT_DIMENSION_COLUMNS[report.groupBy] ?? 'Quotation dimension'}</span>
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
                    <ReportNavigation
                      activeId={groupBy}
                      onSelect={(item) => setGroupBy(item.id)}
                      reports={REPORT_CARDS.map((report) => ({ id: report.groupBy, title: report.title }))}
                    />
                    <section className="page-heading">
              <div>
                <div className="eyebrow">
                  <span className="eyebrow-line" />
                  {groupBy === 'trend'
                    ? 'Time series'
                    : `${quotationReportTitle(groupBy)} report`}
                </div>
                <h1>
                  {groupBy === 'trend'
                    ? 'Quotation trend analysis'
                    : quotationReportTitle(groupBy)}
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
                    title: groupBy === 'trend' ? 'Quotation trend analysis' : quotationReportTitle(groupBy),
                    subtitle: `${fileInfo?.name || 'Quotation workbook'} · ${filteredRows.length.toLocaleString('en-IN')} quotations matching the current filters.`,
                    fileName: 'quotation-report',
                    dashboard: {
                      reportTitle: groupBy === 'trend' ? 'Quotation trend analysis' : quotationReportTitle(groupBy),
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
                          `${formatCount(kpis.quotations)} unique quotations match the active filters for ${CHART_GROUPS.find((group) => group.key === groupBy)?.label.toLowerCase() ?? 'this report'}.`,
                          `${formatCount(kpis.convertedCount)} quotations (${conversionCoverage.toFixed(1)}%) contribute to converted INR value; the remainder have currencies without a configured rate.`,
                          ...(dominantCountGroup ? [`Highest quotation volume: ${dominantCountGroup.label} with ${formatCount(dominantCountGroup.count)} quotations (${countTotal ? (dominantCountGroup.count / countTotal * 100).toFixed(1) : '0.0'}% of the visible total).`] : []),
                          ...(dominantValueGroup ? [`Highest converted value: ${dominantValueGroup.label} at ${formatMoney(dominantValueGroup.inr, 'INR')}.`] : []),
                        ],
                      decisionHelpers: quotationDecisionHelpers,
                      tableTitle: groupBy === 'trend' ? 'Quotation trend by time bracket' : `${quotationReportTitle(groupBy)} breakdown`,
                      tableDescription: groupBy === 'trend'
                        ? `${trendRows.length.toLocaleString('en-IN')} ${trendIntervalLabel.toLowerCase()} brackets · Config and Manual compared side by side`
                        : `${reportSummary.length.toLocaleString('en-IN')} ${CHART_GROUPS.find((group) => group.key === groupBy)?.label.toLowerCase() ?? 'report'} groups · values include converted INR only.`,
                      rows: groupBy === 'trend' ? trendRows : reportSummary,
                      snapshot: {
                        type: 'quotations',
                        rows,
                        selections,
                        dateFrom,
                        dateTo,
                        groupBy,
                        outlierFilter,
                        percentileTail,
                        trendInterval: activeTrendInterval,
                        trendUsageSelection,
                        options,
                      },
                      columns: groupBy === 'trend' ? [
                        { label: 'Time bracket', getValue: (row) => row.label },
                        { label: 'Config quotations', getValue: (row) => formatCount(row.CONFIGURATOR.count) },
                        { label: 'Manual quotations', getValue: (row) => formatCount(row.MANUAL.count) },
                        { label: 'Config value (INR)', getValue: (row) => row.CONFIGURATOR.convertedCount ? formatMoney(row.CONFIGURATOR.inr, 'INR') : '—' },
                        { label: 'Manual value (INR)', getValue: (row) => row.MANUAL.convertedCount ? formatMoney(row.MANUAL.inr, 'INR') : '—' },
                      ] : QUOTATION_BREAKDOWN_COLUMNS.map(([label, getValue]) => ({
                        label,
                        getValue,
                      })),
                      rowLink: groupBy === 'trend' ? null : (row) => `${window.location.origin}/dashboard?groupBy=${encodeURIComponent(groupBy)}#${encodeURIComponent(row.label || '')}`,
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
                    <select aria-label="Time bracket" onChange={(event) => setTrendInterval(event.target.value)} value={activeTrendInterval}>
                      {availableTrendIntervals.map((interval) => <option disabled={interval.disabled} key={interval.key} value={interval.key}>
                        {interval.label}{interval.disabled ? ` (requires ${interval.minimumDays}+ days)` : ''}
                      </option>)}
                    </select>
                    <small>Suggested: {TREND_INTERVALS.find((interval) => interval.key === recommendedTrendInterval)?.label.toLowerCase()} for {trendSpanDays ? `${formatCount(trendSpanDays)} days of dated data` : 'the available dates'}.</small>
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
                <div className="kpi-topline"><span>Quotations</span><span className="kpi-icon kpi-blue"><Icon name="file" /></span></div>
                <strong>{formatCount(kpis.quotations)}</strong>
                <small>Unique SAP sales documents</small>
                <div className="kpi-accent accent-blue" />
              </article>
              <article className="panel kpi-card">
                <div className="kpi-topline"><span>Total value · INR</span><span className="kpi-icon kpi-green">₹</span></div>
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
                <div className="kpi-topline"><span>Sales organizations</span><span className="kpi-icon kpi-violet"><Icon name="chart" /></span></div>
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
                    <div><h2>Trend data</h2><p>One row per {trendIntervalLabel.toLowerCase()} bracket</p></div>
                    <span className="result-pill">{formatCount(trendRows.length)} brackets</span>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead><tr>{[
                        ['key', 'Time bracket', false],
                        ['configCount', 'Config quotations', true],
                        ['manualCount', 'Manual quotations', true],
                        ['configValue', 'Config value (INR)', true],
                        ['manualValue', 'Manual value (INR)', true],
                      ].map(([key, label, numeric]) => <th className={numeric ? 'align-right' : ''} key={key}>
                        <button aria-label={`Sort ${label} ${trendSort.key === key && trendSort.direction === 'asc' ? 'descending' : 'ascending'}`} className="sort-header" onClick={() => setTrendSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))} type="button">
                          {label}<span className="sort-indicator">{trendSort.key === key ? (trendSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </button>
                      </th>)}</tr></thead>
                      <tbody>
                        {sortedTrendRows.map((point) => <tr key={point.key}><td>{point.label}</td><td className="align-right">{formatCount(point.CONFIGURATOR.count)}</td><td className="align-right">{formatCount(point.MANUAL.count)}</td><td className="align-right">{point.CONFIGURATOR.convertedCount ? formatMoney(point.CONFIGURATOR.inr, 'INR') : '—'}</td><td className="align-right">{point.MANUAL.convertedCount ? formatMoney(point.MANUAL.inr, 'INR') : '—'}</td></tr>)}
                        {!trendRows.length && <tr><td className="empty-table" colSpan="5">No dated quotations match these filters.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="table-footer"><span><i className="footer-dot" /> Date brackets use the selected calendar interval</span><span>{formatCount(filteredRows.length)} quotations in view</span></div>
                </section>
              </>
            ) : <section className="charts-section">
              <div className="section-heading">
                <div><h2>{REPORT_CARDS.find((report) => report.groupBy === groupBy)?.title ?? 'Quotation report'}</h2><p>{REPORT_CARDS.find((report) => report.groupBy === groupBy)?.description ?? 'Quotation volume and converted value for the selected indicator'}</p></div>
              </div>
              <div className="chart-grid" aria-busy="false" aria-live="polite">
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
              </div>
            </section>}

            {groupBy !== 'trend' && <section className="panel table-panel">
              <div className="table-heading">
                <div><h2>Config vs Manual comparison</h2><p>{CHART_GROUPS.find((group) => group.key === groupBy)?.label} · quotation count and header value</p></div>
                <div className="table-tools">
                    <label className="summary-key-search">
                      <span className="sr-only">Search {CHART_GROUPS.find((group) => group.key === groupBy)?.label} summary</span>
                      <input aria-label={`Search ${CHART_GROUPS.find((group) => group.key === groupBy)?.label} summary`} onChange={(event) => {
                        setComparisonSearch(event.target.value)
                        setVisibleComparisonCount(50)
                      }} placeholder={`Search ${CHART_GROUPS.find((group) => group.key === groupBy)?.label.toLowerCase()}`} type="search" value={comparisonSearch} />
                    </label>
                    <span className="result-pill">{formatCount(visibleComparisonRows.length)} shown</span>
                </div>
              </div>
              <div className="table-scroll"><table>
                <thead><tr>{[
                  ['label', CHART_GROUPS.find((group) => group.key === groupBy)?.label ?? 'Report group', false],
                  ['configCount', 'Config quotations', true],
                  ['manualCount', 'Manual quotations', true],
                  ['configValue', 'Config value (INR)', true],
                  ['manualValue', 'Manual value (INR)', true],
                ].map(([key, label, numeric]) => <th className={numeric ? 'align-right' : ''} key={key}>
                  <button aria-label={`Sort ${label} ${comparisonSort.key === key && comparisonSort.direction === 'asc' ? 'descending' : 'ascending'}`} className="sort-header" onClick={() => setComparisonSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))} type="button">
                    {label}<span className="sort-indicator">{comparisonSort.key === key ? (comparisonSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </button>
                </th>)}</tr></thead>
                <tbody>{visibleComparisonRows.map((entry) => (
                  <tr key={entry.label}><td>{entry.label}</td><td className="align-right">{formatCount(entry.CONFIGURATOR.count)}</td><td className="align-right">{formatCount(entry.MANUAL.count)}</td><td className="align-right">{formatMoney(entry.CONFIGURATOR.inr, 'INR')}</td><td className="align-right">{formatMoney(entry.MANUAL.inr, 'INR')}</td></tr>
                ))}{!visibleComparisonRows.length && <tr><td className="empty-table" colSpan="5">No quotations match these filters.</td></tr>}</tbody>
              </table></div>
              {visibleComparisonCount < filteredComparisonRows.length && <div className="table-more"><span>Showing {formatCount(visibleComparisonRows.length)} of {formatCount(filteredComparisonRows.length)} groups</span><button className="button button-outline" onClick={() => setVisibleComparisonCount((count) => count + 50)} type="button">Show 50 more</button></div>}
            </section>}

            <ReportInsightsSummary
              reportTitle={groupBy === 'trend' ? 'Quotation trend analysis' : quotationReportTitle(groupBy)}
              chartRules={groupBy === 'trend'
                ? [
                  `The trend charts use ${trendIntervalLabel.toLowerCase()} date buckets and compare Config with Manual quotations.`,
                  'Quotation volume counts unique sales documents; value charts sum only rows with a configured INR conversion.',
                  'Config share and volume difference use the filtered time-series totals; value share uses converted INR totals only.',
                  'Every time bucket remains plotted; date labels are shortened and spaced to fit the chart width. Outlier thresholds are 1.5 × IQR, Modified Z-Score 3.5, or the selected percentile tails, calculated per currency.',
                ]
                : [
                  `Charts group the filtered quotations by ${CHART_GROUPS.find((group) => group.key === groupBy)?.label ?? groupBy}.`,
                  'Count charts show unique sales documents; value charts show converted INR amounts and omit unconverted currencies.',
                  'Pie percentages use the visible chart total as their denominator; value charts show converted INR and exclude currencies without a configured rate.',
                  'Outlier thresholds are 1.5 × IQR, Modified Z-Score 3.5, or the selected percentile tails, calculated per currency.',
                ]}
              insights={groupBy === 'trend'
                ? [
                  `Config represents ${trendInsights.configShare.toFixed(1)}% of filtered quotations (${formatCount(trendInsights.config.count)} Config and ${formatCount(trendInsights.manual.count)} Manual).`,
                  `Config minus Manual volume: ${trendInsights.countDifference > 0 ? '+' : ''}${formatCount(trendInsights.countDifference)} quotations.`,
                  `Config share of converted value: ${trendInsights.valueShare == null ? 'unavailable' : `${trendInsights.valueShare.toFixed(1)}%`}.`,
                ]
                : [
                  `${formatCount(kpis.quotations)} unique quotations match the active filters for ${CHART_GROUPS.find((group) => group.key === groupBy)?.label.toLowerCase() ?? 'this report'}.`,
                  `${formatCount(kpis.convertedCount)} quotations (${conversionCoverage.toFixed(1)}%) contribute to converted INR value; currencies without a configured rate are excluded.`,
                  ...(dominantCountGroup ? [`Highest quotation volume: ${dominantCountGroup.label} with ${formatCount(dominantCountGroup.count)} quotations (${countTotal ? (dominantCountGroup.count / countTotal * 100).toFixed(1) : '0.0'}% of the visible total).`] : ['No report groups are available for the current filters.']),
                  ...(dominantValueGroup ? [`Highest converted value: ${dominantValueGroup.label} at ${formatMoney(dominantValueGroup.inr, 'INR')}.`] : []),
                ]}
              decisionHelpers={quotationDecisionHelpers}
              kpis={[
                { label: 'Quotations', definition: 'Count of unique SAP sales documents after the active date, organization, usage, currency, and outlier filters.' },
                { label: 'Total value · INR', definition: 'Sum of net header values converted to INR using configured rates; unconverted currencies are excluded and listed on the KPI.' },
                { label: 'Sales organizations', definition: 'Distinct sales organizations among the filtered quotations.' },
              ]}
            />
                    <ReportNavigation
                      activeId={groupBy}
                      onSelect={(item) => setGroupBy(item.id)}
                      placement="bottom"
                      reports={REPORT_CARDS.map((report) => ({ id: report.groupBy, title: report.title }))}
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
                          {visibleDataTableRows.map((row, index) => (
                            <tr key={rawDataView === 'raw' ? `${row.document || 'row'}-${row.rowNumber ?? index}` : `${row.document}-${row.salesOrganization}-${row.usage}-${row.currency}-${index}`}>
                              {displayedDataColumns.map((column) => (
                                <td key={column.key}>
                                  {getDataCellValue(row, column, rawDataView, datasetType)}
                                </td>
                              ))}
                            </tr>
                          ))}
                          {rawDataTableRows.length === 0 && (
                            <tr><td className="empty-table" colSpan={displayedDataColumns.length}>No matching rows found.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {visibleDataTableRows.length < rawDataTableRows.length && (
                      <div className="table-more">
                        <span>Showing {formatCount(visibleDataTableRows.length)} of {formatCount(rawDataTableRows.length)} rows</span>
                        <button className="button button-outline" onClick={() => setVisibleRawDataCount((count) => count + 100)} type="button">Show 100 more</button>
                      </div>
                    )}
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
      {showBackToTop && <button
        aria-label="Back to top"
        className="back-to-top"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        title="Back to top"
        type="button"
      >
        <span aria-hidden="true">↑</span>
      </button>}
    </div>
  )
}

export default App
