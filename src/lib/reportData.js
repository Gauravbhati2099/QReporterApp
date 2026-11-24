export function getDateBounds(rows) {
  let min = ''
  let max = ''
  for (const row of rows) {
    const date = row.date
    if (!date) continue
    if (!min || date < min) min = date
    if (!max || date > max) max = date
  }
  return { min, max }
}

export function getSummary(rows) {
  const groups = new Map()
  for (const row of rows) {
    const key = [row.salesOrganization, row.usage, row.currency].join('\u0000')
    const current = groups.get(key) ?? {
      salesOrganization: row.salesOrganization,
      usage: row.usage,
      currency: row.currency,
      count: 0,
      value: 0,
    }
    current.count += 1
    current.value += row.amount
    groups.set(key, current)
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.salesOrganization.localeCompare(b.salesOrganization, undefined, { numeric: true }) ||
      a.usage.localeCompare(b.usage) ||
      a.currency.localeCompare(b.currency),
  )
}

export function buildQuotationSummaryTables(rows) {
  const summary = getSummary(rows)
  return {
    quotations: summary,
    dateBounds: getDateBounds(rows),
    options: {
      organizations: [...new Set(rows.map((row) => row.salesOrganization))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      usages: [...new Set(rows.map((row) => row.usage))].sort(),
      currencies: [...new Set(rows.map((row) => row.currency))].sort(),
    },
    outliers: {
      iqr: [...getOutlierRows(rows)].map((row) => row.document),
      mad: [...getModifiedZScoreOutlierRows(rows)].map((row) => row.document),
    },
  }
}

function getQuantile(sortedValues, probability) {
  const position = (sortedValues.length - 1) * probability
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const fraction = position - lowerIndex
  return sortedValues[lowerIndex] + (sortedValues[upperIndex] - sortedValues[lowerIndex]) * fraction
}

function getMedian(sortedValues) {
  const middleIndex = Math.floor(sortedValues.length / 2)
  return sortedValues.length % 2 === 0
    ? (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2
    : sortedValues[middleIndex]
}

export function getOutlierRows(rows) {
  const rowsByCurrency = new Map()
  for (const row of rows) {
    if (!Number.isFinite(row.amount)) continue
    const currencyRows = rowsByCurrency.get(row.currency) ?? []
    currencyRows.push(row)
    rowsByCurrency.set(row.currency, currencyRows)
  }

  const outliers = new Set()
  for (const currencyRows of rowsByCurrency.values()) {
    const sortedValues = currencyRows.map((row) => row.amount).sort((a, b) => a - b)
    const firstQuartile = getQuantile(sortedValues, 0.25)
    const thirdQuartile = getQuantile(sortedValues, 0.75)
    const interquartileRange = thirdQuartile - firstQuartile
    const lowerFence = firstQuartile - 1.5 * interquartileRange
    const upperFence = thirdQuartile + 1.5 * interquartileRange

    for (const row of currencyRows) {
      if (
        (row.amount < lowerFence || row.amount > upperFence)
      ) {
        outliers.add(row)
      }
    }
  }
  return outliers
}

export function getPercentileBounds(rows, tailPercent) {
  const rowsByCurrency = new Map()
  for (const row of rows) {
    if (!Number.isFinite(row.amount)) continue
    const currencyRows = rowsByCurrency.get(row.currency) ?? []
    currencyRows.push(row)
    rowsByCurrency.set(row.currency, currencyRows)
  }

  const tailProbability = Math.min(Math.max(tailPercent, 0), 49) / 100
  const boundsByCurrency = new Map()
  for (const [currency, currencyRows] of rowsByCurrency) {
    const sortedValues = currencyRows.map((row) => row.amount).sort((a, b) => a - b)
    boundsByCurrency.set(currency, {
      lower: getQuantile(sortedValues, tailProbability),
      upper: getQuantile(sortedValues, 1 - tailProbability),
    })
  }
  return boundsByCurrency
}

export function getModifiedZScoreOutlierRows(rows) {
  const rowsByCurrency = new Map()
  for (const row of rows) {
    if (!Number.isFinite(row.amount)) continue
    const currencyRows = rowsByCurrency.get(row.currency) ?? []
    currencyRows.push(row)
    rowsByCurrency.set(row.currency, currencyRows)
  }

  const outliers = new Set()
  for (const currencyRows of rowsByCurrency.values()) {
    const sortedValues = currencyRows.map((row) => row.amount).sort((a, b) => a - b)
    const median = getMedian(sortedValues)
    const absoluteDeviations = sortedValues
      .map((value) => Math.abs(value - median))
      .sort((a, b) => a - b)
    const medianAbsoluteDeviation = getMedian(absoluteDeviations)
    if (medianAbsoluteDeviation === 0) continue

    for (const row of currencyRows) {
      const modifiedZScore =
        (0.6745 * Math.abs(row.amount - median)) / medianAbsoluteDeviation
      if (modifiedZScore > 3.5) outliers.add(row)
    }
  }
  return outliers
}

export function formatIndianAmount(amount) {
  const value = Number(amount) || 0
  const absolute = Math.abs(value)
  const unit = absolute >= 10_000_000 ? 10_000_000 : absolute >= 100_000 ? 100_000 : 0
  if (!unit) {
    return value.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }
  const suffix = unit === 10_000_000 ? ' Cr' : ' Lacs'
  return `${(value / unit).toLocaleString('en-IN', { maximumFractionDigits: 2 })}${suffix}`
}

export function formatMoney(amount, currency) {
  const value = Number(amount) || 0
  return currency === 'INR'
    ? `₹${formatIndianAmount(value)}`
    : `${value.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} ${currency}`
}

export function formatCount(count) {
  return Number(count).toLocaleString('en-IN')
}

export function formatDateLabel(value) {
  if (!value) {
    return '—'
  }
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
