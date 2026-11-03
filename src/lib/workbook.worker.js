import { readQuotationWorkbook } from './workbookParser'

self.onmessage = async (event) => {
  try {
    const result = await readQuotationWorkbook(event.data)
    self.postMessage({ result })
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'The workbook could not be loaded.',
    })
  }
}
