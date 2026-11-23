import { useEffect, useRef, useState } from 'react'

export default function ReportExportMenu({ onPreview, onExportExcel, onExportCsv, onExportHtml }) {
  const menuRef = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    function closeOnOutsidePointer(event) {
      if (!menuRef.current?.contains(event.target)) menuRef.current.open = false
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [])

  function preview() {
    setError('')
    menuRef.current.open = false
    onPreview()
  }

  async function exportFile(action) {
    setError('')
    menuRef.current.open = false
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The report could not be exported.')
      menuRef.current.open = true
    }
  }

  return (
    <details className="report-export-menu" ref={menuRef}>
      <summary aria-label="Report export options" className="button button-outline print-button">
        Export <span aria-hidden="true" className="export-menu-caret" />
      </summary>
      <div className="report-export-popover">
        <button onClick={preview} type="button">Preview PDF</button>
        <button onClick={() => void exportFile(onExportExcel)} type="button">Export Excel (.xlsx)</button>
        <button onClick={() => void exportFile(onExportCsv)} type="button">Export CSV</button>
        {onExportHtml && <button onClick={() => void exportFile(onExportHtml)} type="button">Export HTML report</button>}
        {error && <span aria-live="polite" className="report-export-error" role="alert">{error}</span>}
      </div>
    </details>
  )
}
