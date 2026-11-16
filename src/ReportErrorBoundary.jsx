import { Component } from 'react'

export default class ReportErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Report failed to render.', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <section aria-labelledby="report-error-title" className="panel report-error-page" role="alert">
        <div className="eyebrow"><span className="eyebrow-line" /> REPORT ERROR</div>
        <h1 id="report-error-title">This report could not be opened</h1>
        <p>
          An unexpected error occurred while displaying this report. Return to the report library and try opening it again.
        </p>
        <details>
          <summary>Error details</summary>
          <pre>{error.message}</pre>
        </details>
        <button className="button button-primary" onClick={this.props.onBack} type="button">
          ← Back to reports
        </button>
      </section>
    )
  }
}
