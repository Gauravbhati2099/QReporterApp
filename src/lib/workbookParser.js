import * as XLSX from 'xlsx'
import { buildQuotationSummaryTables } from './reportData'
import {
  getProcurementField,
  getProcurementRowDate,
  isProcurementHeaderRow,
  buildProcurementSummaryTables,
  normalizeProcurementCell,
} from './procurementReports'

export const CONFIGURATOR_ID = '12MM102101'


export const EXCHANGE_RATES = Object.freeze({
  // Base currency
  INR: 1,

  // Major currencies
  USD: 94.84,
  EUR: 106.19,
  GBP: 127.22,
  AED: 25.82,
  RUB: 1.16,

  // North America
  CAD: 67.91,
  MXN: 5.08,

  // Asia Pacific
  AUD: 66.34,
  NZD: 53.34,
  JPY: 0.60,
  CNY: 14.25,
  SGD: 74.11,
  HKD: 12.08,
  KRW: 0.0704,
  MYR: 23.25,
  THB: 2.81,
  IDR: 0.00522,
  PHP: 1.49,
  VND: 0.00369,
  BDT: 0.76,
  PKR: 0.34,
  NPR: 0.63,
  LKR: 0.29,

  // Europe
  CHF: 115.68,
  SEK: 9.68,
  NOK: 10.20,
  DKK: 14.18,
  PLN: 24.00,
  CZK: 4.35,
  HUF: 0.29,
  TRY: 1.90,

  // Middle East
  SAR: 25.82,
  QAR: 26.00,
  KWD: 307.40,
  BHD: 251.00,
  OMR: 233.00,
  JOD: 134.00,
  ILS: 30.00,

  // Africa
  ZAR: 5.70,
  EGP: 1.71,
  KES: 0.73,
  NGN: 0.066,

  // South America
  BRL: 17.22,
  ARS: 5.95,
  CLP: 0.092,
  COP: 0.030
});


const REQUIRED_COLUMNS = {
  document: ['salesdocument', 'Sales document'],
  createdBy: ['createdby', 'Created By'],
  salesOrganization: ['salesorganization', 'Sales Organization'],
  currency: ['documentcurrency', 'Document Currency'],
  amount: ['netvalueheader', 'Net Value (Header)'],
  date: ['documentdate', 'Document Date'],
}

const QUOTATION_DETAIL_FIELDS = [
  ['customerReferenceHeader', ['customerreferenceheader', 'Customer Reference (Header)']],
  ['soldToPartyName', ['soldtopartyname', 'Sold-To Party Name']],
  ['salesDocumentType', ['salesdocumenttype', 'Sales Document Type']],
  ['salesDocumentItem', ['salesdocumentitem', 'Sales Document Item']],
  ['validToDate', ['validtodate', 'Valid-to date']],
  ['orderQuantityItem', ['orderquantityitem', 'Order Quantity (Item)']],
  ['materialDescription', ['materialdescription', 'Material Description']],
  ['orderReason', ['orderreason', 'Order Reason']],
  ['orderReasonDescription', ['orderreasondescription', 'Order Reason Description']],
  ['time', ['time', 'Time']],
  ['billingBlock', ['billingblock', 'Billing Block']],
  ['deliveryBlock', ['deliveryblock', 'Delivery Block']],
  ['netValueItem', ['netvalueitem', 'Net Value (Item)']],
  ['material', ['material', 'Material']],
  ['plant', ['plant', 'Plant']],
  ['salesOffice', ['salesoffice', 'Sales office']],
  ['salesGroup', ['salesgroup', 'Sales group']],
  ['salesDistrict', ['salesdistrict', 'Sales district']],
  ['salesDistrictName', ['salesdistrictname', 'Sales district name']],
  ['distributionChannel', ['distributionchannel', 'Distribution Channel']],
  ['division', ['division', 'Division']],
  ['overallStatus', ['overallstatus', 'Overall Status']],
  ['referenceStatus', ['referencestatus', 'Reference Status']],
  ['rejectionReason', ['reasonforrejection', 'Reason for Rejection']],
  ['rejectionReasonDescription', ['rejectionreasondescription', 'Rejection Reason Description']],
  ['confirmedQuantityItem', ['confirmedquantityitem', 'Confirmed Quantity (Item)']],
  ['deliveryDate', ['deliverydate', 'Delivery Date']],
  ['goodsIssueDate', ['goodsissuedate', 'Goods Issue Date']],
  ['materialAvailabilityDate', ['materialavailabilitydate', 'Material Availability Date']],
  ['personnelNumber', ['personnelnumber', 'Personnel Number']],
  ['partnerName', ['partnername', 'Partner Name']],
  ['overallStatusDescription', ['overallstatusdescription', 'Overall Status Description']],
  ['salesOrganizationName', ['salesorganizationname', 'Sales Organization Name']],
  ['distributionChannelName', ['distributionchannelname', 'Distribution Channel Name']],
  ['divisionName', ['divisionname', 'Division Name']],
  ['salesDocumentTypeDescription', ['salesdocumenttypedescription', 'Sales Document Type Description']],
]

const CONSISTENCY_FIELDS = [
  'salesOrganization',
  'currency',
  'createdBy',
  'amount',
  'date',
]

const normalizeHeader = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const asText = (value) => String(value ?? '').trim()

function parseAmount(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Number.NaN
  }

  const text = asText(value)
  const isParenthesized = /^\(.*\)$/.test(text)
  const cleaned = text.replace(/[(),₹$€£\s]/g, '').replace(/,/g, '')
  const amount = Number(cleaned)
  return Number.isFinite(amount) ? (isParenthesized ? -amount : amount) : Number.NaN
}

function formatDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return ''
  }
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

function parseDate(value, date1904 = false) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value, { date1904 })
    return parsed ? formatDate(parsed.y, parsed.m, parsed.d) : ''
  }

  const text = asText(value)
  const isoDate = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (isoDate) {
    return formatDate(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]))
  }

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime())
    ? ''
    : formatDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate())
}

function findHeaderRow(matrix) {
  const requiredNames = Object.values(REQUIRED_COLUMNS).map(([normalized]) => normalized)
  return matrix.findIndex(
    (row, index) =>
      index < 30 &&
      requiredNames.every((name) => row.some((cell) => normalizeHeader(cell) === name)),
  )
}

function buildColumnPositions(headers) {
  const positions = {}
  const missing = []

  for (const [field, [normalized, label]] of Object.entries(REQUIRED_COLUMNS)) {
    const position = headers.findIndex((header) => normalizeHeader(header) === normalized)
    if (position < 0) {
      missing.push(label)
    } else {
      positions[field] = position
    }
  }

  for (const [field, [normalized]] of QUOTATION_DETAIL_FIELDS) {
    const position = headers.findIndex((header) => normalizeHeader(header) === normalized)
    if (position >= 0) positions[field] = position
  }

  if (missing.length) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`)
  }
  return positions
}

function parseRows(matrix, sheet, headerIndex, positions, sourceColumns, date1904) {
  const records = new Map()
  const sourceRows = []
  let validSourceRows = 0

  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const cells = matrix[index] ?? []
    const value = (field) => cells[positions[field]]
    const document = asText(value('document'))
    const rowNumber = index + 1
    const sourceValues = sourceColumns.map((_, column) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: index, c: column })]
      return String(cell?.w ?? cell?.v ?? '')
    })

    if (!document) {
      if (sourceValues.some((cell) => cell.trim() !== '')) {
        sourceRows.push({ rowNumber, sourceValues })
      }
      continue
    }

    const salesOrganization = asText(value('salesOrganization'))
    const createdBy = asText(value('createdBy'))
    const currency = asText(value('currency')).toUpperCase()
    const amount = parseAmount(value('amount'))
    const date = parseDate(value('date'), date1904)

    if (!salesOrganization || !Number.isFinite(amount) || !date || !currency) {
      throw new Error(
        `Invalid Sales Organization, amount, date, or currency on spreadsheet row ${rowNumber}.`,
      )
    }

    const record = {
      document,
      salesOrganization,
      createdBy,
      usage: createdBy === CONFIGURATOR_ID ? 'CONFIGURATOR' : 'MANUAL',
      currency,
      date,
      amount,
      inr: EXCHANGE_RATES[currency] == null ? null : amount * EXCHANGE_RATES[currency],
    }
    const itemRecord = { ...record }
    for (const [field] of QUOTATION_DETAIL_FIELDS) {
      const columnIndex = positions[field]
      if (columnIndex != null) itemRecord[field] = asText(cells[columnIndex])
    }
    const sourceRow = {
      document,
      createdBy,
      salesOrganization,
      usage: record.usage,
      currency,
      date,
      amount,
      inr: record.inr,
      rowNumber,
      sourceValues,
    }
    sourceRows.push(sourceRow)
    const previous = records.get(document)

    if (previous) {
      const conflict = CONSISTENCY_FIELDS.find((field) => previous[field] !== record[field])
      if (conflict) {
        const label = REQUIRED_COLUMNS[conflict]?.[1] ?? conflict
        throw new Error(
          `Conflicting ${label} values were found for Sales document ${document}.`,
        )
      }
    } else {
      records.set(document, { ...record, ...itemRecord })
    }
    validSourceRows += 1
  }

  if (!records.size) {
    throw new Error('No valid quotation rows were found below the column headers.')
  }

  return {
    rows: [...records.values()],
    validSourceRows,
    repeatedItemRows: validSourceRows - records.size,
    sourceRows,
  }
}

export async function readQuotationWorkbook(file) {
  if (!file || file.size === 0) {
    throw new Error('Choose a non-empty XLSX workbook.')
  }

  const bytes = await file.arrayBuffer()
  const signature = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength))
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
    throw new Error('This file is not an XLSX-format workbook.')
  }

  let workbook
  try {
    workbook = XLSX.read(bytes, { type: 'array', cellDates: false })
  } catch {
    throw new Error('The XLSX workbook could not be opened. Check the file and try again.')
  }

  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : null
  if (!sheet) {
    throw new Error('The XLSX workbook does not contain a worksheet.')
  }

  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: true,
  })
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904)
  const getDisplayValue = (row, column) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })]
    return cell?.w ?? cell?.v ?? ''
  }
  const headerIndex = findHeaderRow(matrix)
  if (headerIndex < 0) {
    const procurementHeaderIndex = matrix.findIndex(
      (row, index) => index < 30 && isProcurementHeaderRow(row),
    )
    if (procurementHeaderIndex >= 0) {
      const sourceHeaders = matrix[procurementHeaderIndex] ?? []
      const displayHeaders = sourceHeaders.map((_, column) => getDisplayValue(procurementHeaderIndex, column))
      const sourceColumns = sourceHeaders.map((header, index) => ({
        key: `source-${index}`,
        field: getProcurementField(header),
        label: asText(displayHeaders[index] ?? header) || `Column ${index + 1}`,
        sourceIndex: index,
      }))
      const rows = []

      for (let index = procurementHeaderIndex + 1; index < matrix.length; index += 1) {
        const cells = matrix[index] ?? []
        const sourceValues = sourceColumns.map((_, column) => String(getDisplayValue(index, column) ?? ''))
        if (!sourceValues.some((value) => value.trim())) continue

        const row = { rowNumber: index + 1, sourceValues }
        for (const column of sourceColumns) {
          if (!column.field) continue
          const value = normalizeProcurementCell(
            column.field,
            cells[column.sourceIndex],
            date1904,
          )
          if (value !== '' && (row[column.field] == null || row[column.field] === '')) {
            row[column.field] = value
          }
        }
        row.vendorName ||= row.miroVendorName || ''
        row.gstin ||= row.miroGstin || ''
        row.pan ||= row.miroPan || ''
        row.salesOrganization = String(row.plant ?? '')
        row.document = String(row.poNumber ?? row.prNumber ?? row.grnNumber ?? row.rowNumber)
        row.usage = String(row.materialGroup ?? 'Procurement')
        row.currency = String(row.currency || row.conversionCurrency || 'INR')
        row.date = getProcurementRowDate(row)
        row.amount = Number(row.poTotal ?? row.grnValue ?? row.miroValue) || 0
        row.inr = null
        rows.push(row)
      }

      if (!rows.length) {
        throw new Error('No procurement records were found below the column headers.')
      }

      return {
        rows,
        validSourceRows: rows.length,
        repeatedItemRows: 0,
        sourceRows: rows,
        summaryTables: buildProcurementSummaryTables(
          rows,
          new Set(sourceColumns.map((column) => column.field).filter(Boolean)),
        ),
        sourceColumns,
        datasetType: 'procurement',
        fileName: file.name,
        fileSize: file.size,
        sheetName,
      }
    }

    throw new Error(
      `Could not identify a supported workbook. Quotation reports require ${Object.values(REQUIRED_COLUMNS)
        .map(([, label]) => label)
        .join(', ')}. Procurement MIS requires Plant, Vendor (or Name), PO no., and PO Item No.; add PR, GRN, MIRO, GST, and payment columns for additional reports.`,
    )
  }

  const positions = buildColumnPositions(matrix[headerIndex])
  const fieldByPosition = new Map(
    Object.entries(positions).map(([field, position]) => [position, field]),
  )
  const sourceHeaders = matrix[headerIndex].map((_, column) => getDisplayValue(headerIndex, column))
  const sourceColumns = matrix[headerIndex].map((header, index) => ({
    key: fieldByPosition.get(index) ?? `source-${index}`,
    label: asText(sourceHeaders[index] ?? header) || `Column ${index + 1}`,
    sourceIndex: index,
  }))
  const parsed = parseRows(
    matrix,
    sheet,
    headerIndex,
    positions,
    sourceColumns,
    date1904,
  )

  return {
    ...parsed,
    summaryTables: buildQuotationSummaryTables(parsed.rows),
    sourceColumns,
    fileName: file.name,
    fileSize: file.size,
    sheetName,
    datasetType: 'quotation',
  }
}
