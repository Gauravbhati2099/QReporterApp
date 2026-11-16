export async function exportRowsToExcel(rows, columns, fileName) {
  const XLSX = await import('xlsx')
  const worksheet = XLSX.utils.aoa_to_sheet([
    columns.map(([label]) => label),
    ...rows.map((row) => columns.map(([, getValue]) => {
      const value = getValue(row)
      return typeof value === 'string' && /^[\s]*[=+\-@]/.test(value)
        ? `'${value}`
        : value ?? ''
    })),
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report')
  XLSX.writeFile(workbook, `${fileName}.xlsx`)
}
