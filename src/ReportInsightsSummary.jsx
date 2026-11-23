export default function ReportInsightsSummary({ kpis, chartRules, insights, decisionHelpers = [] }) {
  return (
    <section aria-label="Insights summary" className="panel report-insights-summary">
      <header className="report-insights-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> REPORT GUIDE</div>
          <h2>Insights summary</h2>
          <p>How to read the measurements and charts in this report.</p>
        </div>
      </header>
      <div className="report-insights-grid">
        <section aria-label="KPI definitions">
          <h3>KPI measurements</h3>
          <dl>
            {kpis.map((kpi) => (
              <div key={kpi.label}>
                <dt>{kpi.label}</dt>
                <dd>{kpi.definition}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section aria-label="Chart calculations">
          <h3>Graph calculations</h3>
          <ul>{chartRules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        </section>
        <section aria-label="Current report insights">
          <h3>Current insights</h3>
          <ul>{insights.map((insight) => <li key={insight}>{insight}</li>)}</ul>
        </section>
        <section aria-label="Decision support" className="report-decision-support">
          <h3>Decision support</h3>
          <ul>{decisionHelpers.map((helper) => <li key={helper}>{helper}</li>)}</ul>
        </section>
      </div>
    </section>
  )
}
