import { useEffect, useRef, useState } from 'react'

const PREVIEW_STYLES = `
  html, body { margin: 0; min-height: 100%; background: #e7e9ed; }
  body { padding: 24px; box-sizing: border-box; }
  @page { size: A4 landscape; margin: 0; }
  .print-preview-pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    min-width: 100%;
  }
  .print-preview-page-chart-grid {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    align-items: start;
    gap: 8px !important;
    margin-bottom: 8px;
  }
  .print-preview-page {
    position: relative;
    width: 1123px;
    height: 794px;
    flex: 0 0 auto;
    box-sizing: border-box;
    padding: 26px;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 2px 14px rgb(0 0 0 / 18%);
  }
  .print-preview-page-number {
    position: absolute;
    right: 26px;
    bottom: 14px;
    color: #777;
    font: 12px sans-serif;
  }
  .print-preview-page-content {
    width: 1071px;
    height: 742px;
    overflow: hidden;
    background: #fff;
  }
  .print-preview-scaled-shell {
    width: 1275px !important;
    zoom: 0.84;
    transform-origin: top left;
  }
  .app-shell, .app-shell.theme-dark {
    --page: #fff;
    --surface: #fff;
    --surface-soft: #f3f4f6;
    --text: #222;
    --text-strong: #111;
    --muted: #555;
    --border: #d3d5d8;
    --border-strong: #aeb2b8;
    width: 100% !important;
    min-height: 0 !important;
    padding: 0 !important;
    color: #111 !important;
    background: #fff !important;
  }
  .workspace, .app-shell.is-presenting .workspace {
    width: 100% !important;
    min-height: 0 !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  .topbar, .app-footer, .heading-actions, .procurement-detail-back,
  .procurement-filter-panel, .procurement-pagination,
  .filter-panel, .table-panel, .procurement-table-panel, .theme-menu,
  .local-badge, .chart-controls {
    display: none !important;
  }
  .app-shell.is-presenting .presentation-filters { display: flex !important; }
  .print-filter-summary { display: flex !important; }
  .page-heading { align-items: center !important; margin: 0 0 14px !important; }
  .page-heading h1 { margin: 4px 0 !important; font-size: 30px !important; }
  .app-shell.is-presenting .workspace {
    width: 100% !important;
    min-height: 0 !important;
    padding: 0 !important;
  }
  .app-shell.is-presenting .kpi-grid,
  .app-shell.is-presenting .procurement-kpi-grid {
    gap: 12px !important;
    margin: 12px 0 18px !important;
  }
  .app-shell.is-presenting .kpi-card,
  .app-shell.is-presenting .procurement-kpi {
    min-height: 0 !important;
    padding: 14px !important;
  }
  .app-shell.is-presenting .kpi-card > strong {
    margin-top: 10px !important;
    font-size: 30px !important;
  }
  .app-shell.is-presenting .pie-panel {
    min-height: 0 !important;
    padding: 14px !important;
  }
  .app-shell.is-presenting .pie-content {
    gap: 14px !important;
  }
  .app-shell.is-presenting .pie-legend-item {
    padding: 7px 8px !important;
  }
  .app-shell.is-presenting .pie-legend {
    gap: 5px !important;
  }
  .app-shell.is-presenting .chart-panel:not(.pie-panel) {
    padding: 12px !important;
  }
  .app-shell.is-presenting .bar-list {
    gap: 10px !important;
  }
  .app-shell.is-presenting .bar-track {
    height: 7px !important;
  }
  .print-preview-page-chart-grid > * {
    min-height: 0 !important;
    height: auto !important;
  }
  .app-shell.is-presenting .procurement-chart-grid .chart-panel {
    padding: 14px !important;
  }
  .panel, .chart-panel {
    color: #111 !important;
    background: #fff !important;
    box-shadow: none !important;
  }
  .procurement-report-detail > section,
  .procurement-report-header {
    margin-bottom: 12px;
  }
  .procurement-report-detail {
    display: block !important;
    gap: 0 !important;
    padding-bottom: 0 !important;
  }
  @media print {
    html, body {
      width: 1123px;
      height: auto;
      min-height: 0;
      padding: 0;
      background: #fff;
    }
    .print-preview-pages {
      align-items: flex-start;
      gap: 0;
      min-width: 0;
    }
    .print-preview-page {
      margin: 0;
      box-shadow: none;
      break-after: page;
      page-break-after: always;
    }
    .print-preview-page:last-child {
      break-after: auto;
      page-break-after: auto;
    }
    .print-preview-page-number { display: none; }
    .app-shell.is-presenting .presentation-filters { display: flex !important; }
  }
`

function getPrintUnits(contentRoot, previewDocument) {
  return [...contentRoot.children]
    .filter((element) => previewDocument.defaultView.getComputedStyle(element).display !== 'none')
    .flatMap((element) => {
      if (!element.matches('.charts-section')) {
        return [{ element, type: 'normal' }]
      }

      const heading = element.querySelector('.section-heading')
      const chartGrid = element.querySelector('.chart-grid, .procurement-chart-grid')
      const charts = chartGrid ? [...chartGrid.children] : []
      return [
        ...(heading ? [{ element: heading, type: 'normal' }] : []),
        ...Array.from({ length: Math.ceil(charts.length / 2) }, (_, index) => ({
          elements: charts.slice(index * 2, index * 2 + 2),
          type: 'chart-row',
          gridClassName: chartGrid.className,
        })),
      ]
    })
}

export default function PrintPreviewDialog({ open, onClose }) {
  const frameRef = useRef(null)
  const closeButtonRef = useRef(null)
  const previousFocusRef = useRef(null)
  const [pageCount, setPageCount] = useState(0)
  const [previewError, setPreviewError] = useState('')

  function printPreview() {
    const previewWindow = frameRef.current?.contentWindow
    if (!previewWindow || !pageCount) {
      setPreviewError('The print pages are still being prepared. Please wait and try again.')
      return
    }
    previewWindow.focus()
    previewWindow.print()
  }

  useEffect(() => {
    if (!open) return undefined

    let cancelled = false
    previousFocusRef.current = document.activeElement
    const resetFrame = window.requestAnimationFrame(() => {
      if (!cancelled) {
        setPageCount(0)
        setPreviewError('')
      }
    })
    const sourceShell = document.querySelector('.app-shell')
    const sourceWorkspace = document.querySelector('.workspace')
    const previewDocument = frameRef.current?.contentDocument
    if (!sourceShell || !sourceWorkspace || !previewDocument) {
      window.requestAnimationFrame(() => {
        if (!cancelled) setPreviewError('Unable to prepare the report preview. Close this window and try again.')
      })
    } else {
      previewDocument.open()
      previewDocument.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>')
      previewDocument.close()

      const stylesheetLoads = [...document.querySelectorAll('link[rel="stylesheet"]')].map((stylesheet) => new Promise((resolve, reject) => {
        const copy = previewDocument.createElement('link')
        copy.rel = 'stylesheet'
        copy.href = stylesheet.href
        copy.onload = resolve
        copy.onerror = () => reject(new Error('Report styles could not be loaded for the preview.'))
        previewDocument.head.appendChild(copy)
      }))
      document.querySelectorAll('style').forEach((stylesheet) => {
        const copy = previewDocument.createElement('style')
        copy.textContent = stylesheet.textContent
        previewDocument.head.appendChild(copy)
      })
      const previewStyles = previewDocument.createElement('style')
      previewStyles.textContent = PREVIEW_STYLES
      previewDocument.head.appendChild(previewStyles)

      async function renderPages() {
        try {
          await Promise.all(stylesheetLoads)
          if (cancelled) return

          const measurement = previewDocument.createElement('div')
          measurement.className = 'print-preview-measure'
          measurement.style.cssText = 'position:absolute;left:-100000px;top:0;width:1071px;visibility:hidden;'
          const measureShell = previewDocument.createElement('div')
          measureShell.className = sourceShell.className
          measureShell.classList.add('is-presenting')
          measureShell.classList.add('print-preview-scaled-shell')
          const measureWorkspace = sourceWorkspace.cloneNode(true)
          measureShell.appendChild(measureWorkspace)
          measurement.appendChild(measureShell)
          previewDocument.body.appendChild(measurement)

          await new Promise((resolve) => previewDocument.defaultView.requestAnimationFrame(resolve))
          if (cancelled) return

          const reportDetail = measureWorkspace.querySelector('.procurement-report-detail')
          const contentRoot = reportDetail ?? measureWorkspace
          const printUnits = getPrintUnits(contentRoot, previewDocument)
          const contentHeight = 742
          const pages = [[]]
          let currentHeight = 0

          for (const unit of printUnits) {
            const blockHeight = unit.type === 'chart-row'
              ? Math.max(...unit.elements.map((element) => element.getBoundingClientRect().height)) + 12
              : (() => {
                const style = previewDocument.defaultView.getComputedStyle(unit.element)
                return unit.element.getBoundingClientRect().height +
                  (Number.parseFloat(style.marginTop) || 0) +
                  (Number.parseFloat(style.marginBottom) || 0)
              })()
            if (pages.at(-1).length && currentHeight + blockHeight > contentHeight) {
              pages.push([])
              currentHeight = 0
            }
            pages.at(-1).push(unit)
            currentHeight += blockHeight
          }

          const pageList = previewDocument.createElement('div')
          pageList.className = 'print-preview-pages'
          pages.forEach((blocks, index) => {
            const page = previewDocument.createElement('article')
            page.className = 'print-preview-page'
            page.setAttribute('aria-label', `Print page ${index + 1} of ${pages.length}`)
            const pageContent = previewDocument.createElement('div')
            pageContent.className = 'print-preview-page-content'
            const pageShell = previewDocument.createElement('div')
            pageShell.className = sourceShell.className
            pageShell.classList.add('is-presenting')
            pageShell.classList.add('print-preview-scaled-shell')
            const pageWorkspace = sourceWorkspace.cloneNode(false)
            pageShell.appendChild(pageWorkspace)
            let pageRoot = pageWorkspace
            if (reportDetail) {
              const pageDetail = reportDetail.cloneNode(false)
              pageWorkspace.appendChild(pageDetail)
              pageRoot = pageDetail
            }

            blocks.forEach((unit) => {
              if (unit.type !== 'chart-row') {
                pageRoot.appendChild(unit.element.cloneNode(true))
                return
              }
              const chartGrid = previewDocument.createElement('div')
              chartGrid.className = `${unit.gridClassName} print-preview-page-chart-grid`
              unit.elements.forEach((element) => chartGrid.appendChild(element.cloneNode(true)))
              pageRoot.appendChild(chartGrid)
            })

            if (printUnits.length === 0) {
              pageRoot.textContent = 'No printable report content is available.'
            }
            pageContent.appendChild(pageShell)
            page.appendChild(pageContent)
            const pageNumber = previewDocument.createElement('span')
            pageNumber.className = 'print-preview-page-number'
            pageNumber.textContent = `Page ${index + 1} of ${pages.length}`
            page.appendChild(pageNumber)
            pageList.appendChild(page)
          })

          measurement.remove()
          previewDocument.body.appendChild(pageList)
          if (!cancelled) setPageCount(Math.max(1, pages.length))
        } catch (error) {
          if (!cancelled) {
            const message = error instanceof Error ? error.message : 'The report preview could not be rendered.'
            previewDocument.body.textContent = message
            setPreviewError(message)
          }
        }
      }

      void renderPages()
    }

    closeButtonRef.current?.focus()

    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(resetFrame)
      window.removeEventListener('keydown', closeOnEscape)
      previousFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div aria-labelledby="print-preview-title" aria-modal="true" className="print-preview-overlay" role="dialog">
      <section className="print-preview-dialog">
        <header className="print-preview-toolbar">
          <div>
            <h2 id="print-preview-title">PDF preview</h2>
            <p role={previewError ? 'alert' : undefined}>
              {previewError || (pageCount
                ? `Review all ${pageCount} landscape A4 page${pageCount === 1 ? '' : 's'} before printing or saving as PDF.`
                : 'Preparing the print pages…')}
            </p>
          </div>
          <div className="print-preview-actions">
            <button className="button button-outline" onClick={onClose} ref={closeButtonRef} type="button">
              Close
            </button>
            <button className="button button-primary" disabled={!pageCount || Boolean(previewError)} onClick={printPreview} type="button">
              Print / Save PDF
            </button>
          </div>
        </header>
        <iframe className="print-preview-frame" ref={frameRef} title="Filtered report PDF preview" />
      </section>
    </div>
  )
}
