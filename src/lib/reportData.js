export function getDateBounds(rows) {
  const dates = rows.map((row) => row.date).filter(Boolean).sort()
  return {
    min: dates[0] ?? '',
    max: dates.at(-1) ?? '',
  }
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
