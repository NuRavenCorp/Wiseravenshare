import React, { useEffect, useMemo, useState } from 'react';
import { siteAuditCrawlerService } from '../Services/siteAuditCrawlerService';

const STATUS_NAMES = {
  0: 'Pending',
  1: 'Running',
  2: 'Paused',
  3: 'Completed',
  4: 'Failed',
  5: 'Cancelled'
};

const ISSUE_SEVERITY_NAMES = { 0: 'Info', 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' };
const ISSUE_CATEGORY_NAMES = {
  0: 'SEO',
  1: 'Performance',
  2: 'Accessibility',
  3: 'Security',
  4: 'Content',
  5: 'Links',
  6: 'Mobile',
  7: 'Structured Data',
  8: 'Server Config',
  9: 'UX',
  10: 'Best Practices',
  11: 'Legal'
};

const scoreColor = (score) => {
  if (score >= 90) return '#10b981';
  if (score >= 75) return '#84cc16';
  if (score >= 60) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
};

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const readAverageResponseMs = (pages, metrics) => {
  const pageValues = (pages || []).map((row) => toNumber(row?.responseTimeMs)).filter((value) => value > 0);
  if (pageValues.length > 0) {
    return pageValues.reduce((sum, value) => sum + value, 0) / pageValues.length;
  }

  const metricValues = (metrics || [])
    .filter((metric) => {
      const key = String(metric?.metricKey || '').toLowerCase();
      return key.includes('response') || key.includes('latency') || key.includes('load');
    })
    .map((metric) => toNumber(metric?.value))
    .filter((value) => value > 0);

  if (metricValues.length === 0) {
    return 0;
  }

  return metricValues.reduce((sum, value) => sum + value, 0) / metricValues.length;
};

const summarizeIssues = (issues) => {
  const severityCounts = { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0 };
  const categoryCounts = new Map();

  for (const issue of issues || []) {
    const severity = ISSUE_SEVERITY_NAMES[issue?.severity] || String(issue?.severity || 'Info');
    const category = ISSUE_CATEGORY_NAMES[issue?.category] || String(issue?.category || 'Other');

    severityCounts[severity] = (severityCounts[severity] || 0) + 1;
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  }

  const topCategories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, count]) => ({ category, count }));

  return { severityCounts, topCategories };
};

const buildActions = ({ selectedJob, issues, pages, metrics }) => {
  const actions = [];
  const { severityCounts, topCategories } = summarizeIssues(issues);
  const pageRows = pages || [];
  const failedPages = pageRows.filter((page) => toNumber(page?.statusCode) >= 400).length;
  const avgResponse = readAverageResponseMs(pageRows, metrics);

  if (severityCounts.Critical > 0) {
    actions.push({
      priority: 'P0',
      title: 'Fix critical crawler findings first',
      detail: `${severityCounts.Critical} critical issues detected. Prioritize security, legal, and accessibility blockers before shipping new content.`
    });
  }

  if (severityCounts.High > 0) {
    actions.push({
      priority: 'P1',
      title: 'Create a high-severity sprint',
      detail: `${severityCounts.High} high-severity issues are reducing site trust and ranking. Assign owners per category this week.`
    });
  }

  if (failedPages > 0) {
    actions.push({
      priority: 'P1',
      title: 'Repair failing URLs and redirects',
      detail: `${failedPages} crawled pages returned 4xx/5xx responses. Repair these routes and re-run crawl verification.`
    });
  }

  if (avgResponse > 1200) {
    actions.push({
      priority: 'P2',
      title: 'Reduce page response time',
      detail: `Average response time is ${Math.round(avgResponse)} ms. Optimize largest templates, media payloads, and backend endpoints.`
    });
  }

  if (topCategories.length > 0) {
    const leader = topCategories[0];
    actions.push({
      priority: 'P2',
      title: `Target ${leader.category} as the main quality bottleneck`,
      detail: `${leader.category} contributes ${leader.count} findings in this crawl and is the highest-impact category to improve next.`
    });
  }

  if (actions.length === 0 && selectedJob) {
    actions.push({
      priority: 'P3',
      title: 'Maintain current quality baseline',
      detail: 'No urgent findings were detected in the selected crawl. Keep weekly audit cadence and monitor performance drift.'
    });
  }

  return actions;
};

const CrawlerMetricsInsightsPage = () => {
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [issues, setIssues] = useState([]);
  const [pages, setPages] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) || null,
    [jobs, selectedJobId]
  );

  const kpis = useMemo(() => {
    if (!selectedJob) {
      return null;
    }

    const failedPages = (pages || []).filter((page) => toNumber(page?.statusCode) >= 400).length;
    const avgResponseMs = readAverageResponseMs(pages, metrics);
    const { severityCounts, topCategories } = summarizeIssues(issues);

    return {
      failedPages,
      avgResponseMs,
      severityCounts,
      topCategories
    };
  }, [selectedJob, pages, metrics, issues]);

  const actions = useMemo(
    () => buildActions({ selectedJob, issues, pages, metrics }),
    [selectedJob, issues, pages, metrics]
  );

  const refresh = async () => {
    setLoading(true);
    setError('');

    try {
      const jobRows = await siteAuditCrawlerService.getJobs(true);
      const normalizedJobs = Array.isArray(jobRows) ? jobRows : [];
      setJobs(normalizedJobs);

      const nextJobId = selectedJobId || normalizedJobs[0]?.id || '';
      setSelectedJobId(nextJobId);

      if (!nextJobId) {
        setIssues([]);
        setPages([]);
        setMetrics([]);
        return;
      }

      const [issueRows, pageRows, metricRows] = await Promise.all([
        siteAuditCrawlerService.getIssues(nextJobId, { pageSize: 250 }),
        siteAuditCrawlerService.getPages(nextJobId, { pageSize: 250 }),
        siteAuditCrawlerService.getMetrics(nextJobId)
      ]);

      setIssues(Array.isArray(issueRows) ? issueRows : []);
      setPages(Array.isArray(pageRows) ? pageRows : []);
      setMetrics(Array.isArray(metricRows) ? metricRows : []);
    } catch (err) {
      setError(err?.message || 'Unable to load crawler metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!selectedJobId) {
      return;
    }

    const loadForJob = async () => {
      setLoading(true);
      setError('');
      try {
        const [issueRows, pageRows, metricRows] = await Promise.all([
          siteAuditCrawlerService.getIssues(selectedJobId, { pageSize: 250 }),
          siteAuditCrawlerService.getPages(selectedJobId, { pageSize: 250 }),
          siteAuditCrawlerService.getMetrics(selectedJobId)
        ]);

        setIssues(Array.isArray(issueRows) ? issueRows : []);
        setPages(Array.isArray(pageRows) ? pageRows : []);
        setMetrics(Array.isArray(metricRows) ? metricRows : []);
      } catch (err) {
        setError(err?.message || 'Unable to load selected crawl details.');
      } finally {
        setLoading(false);
      }
    };

    loadForJob();
  }, [selectedJobId]);

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <section style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: 'var(--card-bg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ marginTop: 0, marginBottom: '6px' }}>Crawler Metrics Insights</h2>
            <div style={{ color: 'var(--light-color)', fontSize: '13px' }}>
              Admin insights page for turning crawler output into prioritized action plans.
            </div>
          </div>
          <button className="input" style={{ width: 'auto', cursor: 'pointer' }} onClick={refresh}>
            Refresh
          </button>
        </div>

        <div style={{ marginTop: '12px', maxWidth: '520px' }}>
          <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '6px' }}>Crawl Job</div>
          <select className="input" value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)}>
            {jobs.length === 0 ? <option value="">No jobs available</option> : null}
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.jobName} - {STATUS_NAMES[job.status] || job.status}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? (
        <div style={{ border: '1px solid #dc2626', borderRadius: '10px', padding: '12px', background: 'rgba(220,38,38,0.15)' }}>
          {error}
        </div>
      ) : null}

      {selectedJob ? (
        <>
          <section style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: 'var(--card-bg)' }}>
            <h3 style={{ marginTop: 0 }}>Executive Summary</h3>
            <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <MetricCard label="Overall Health" value={Math.round(toNumber(selectedJob.overallHealthScore))} color={scoreColor(Math.round(toNumber(selectedJob.overallHealthScore)))} />
              <MetricCard label="Pages Crawled" value={toNumber(selectedJob.pagesCrawled)} />
              <MetricCard label="Issues Found" value={toNumber(selectedJob.issuesFound)} />
              <MetricCard label="Failed Pages" value={kpis?.failedPages || 0} color={(kpis?.failedPages || 0) > 0 ? '#ef4444' : '#10b981'} />
              <MetricCard label="Avg Response (ms)" value={Math.round(kpis?.avgResponseMs || 0)} color={(kpis?.avgResponseMs || 0) > 1200 ? '#f97316' : '#10b981'} />
              <MetricCard label="Job Status" value={STATUS_NAMES[selectedJob.status] || selectedJob.status} />
            </div>
          </section>

          <section style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: 'var(--card-bg)' }}>
            <h3 style={{ marginTop: 0 }}>Actionable Recommendations</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              {actions.map((action) => (
                <div key={`${action.priority}-${action.title}`} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '4px' }}>{action.priority}</div>
                  <div style={{ fontWeight: 700 }}>{action.title}</div>
                  <div style={{ color: 'var(--light-color)', marginTop: '4px', fontSize: '14px' }}>{action.detail}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: 'var(--card-bg)' }}>
            <h3 style={{ marginTop: 0 }}>Issue Hotspots</h3>
            <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
                <h4 style={{ marginTop: 0, marginBottom: '8px' }}>Severity Breakdown</h4>
                {['Critical', 'High', 'Medium', 'Low', 'Info'].map((severity) => (
                  <div key={severity} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span>{severity}</span>
                    <strong>{kpis?.severityCounts?.[severity] || 0}</strong>
                  </div>
                ))}
              </div>

              <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
                <h4 style={{ marginTop: 0, marginBottom: '8px' }}>Top Categories</h4>
                {(kpis?.topCategories || []).map((entry) => (
                  <div key={entry.category} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span>{entry.category}</span>
                    <strong>{entry.count}</strong>
                  </div>
                ))}
                {(kpis?.topCategories || []).length === 0 ? <div style={{ color: 'var(--light-color)', fontSize: '13px' }}>No issue categories detected.</div> : null}
              </div>
            </div>
          </section>

          <section style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: 'var(--card-bg)' }}>
            <h3 style={{ marginTop: 0 }}>Recent Metrics Stream ({metrics.length})</h3>
            <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#101a33' }}>
                  <tr>
                    <th style={cellHead}>Timestamp</th>
                    <th style={cellHead}>Category</th>
                    <th style={cellHead}>Metric</th>
                    <th style={cellHead}>Value</th>
                    <th style={cellHead}>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((metric) => (
                    <tr key={metric.id} style={{ borderTop: '1px solid rgba(148,163,184,0.25)' }}>
                      <td style={cellBody}>{metric.recordedAt ? new Date(metric.recordedAt).toLocaleString() : '--'}</td>
                      <td style={cellBody}>{metric.category || '--'}</td>
                      <td style={cellBody}>{metric.metricKey || '--'}</td>
                      <td style={cellBody}>{toNumber(metric.value)}</td>
                      <td style={cellBody}>{metric.unit || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {loading ? <div style={{ color: 'var(--light-color)' }}>Loading crawler analytics...</div> : null}
    </div>
  );
};

const MetricCard = ({ label, value, color = 'var(--text-color)' }) => (
  <div style={{ border: '1px solid rgba(148,163,184,0.35)', borderRadius: '10px', padding: '10px' }}>
    <div style={{ fontSize: '11px', color: 'var(--light-color)', textTransform: 'uppercase' }}>{label}</div>
    <div style={{ fontWeight: 700, color }}>{value}</div>
  </div>
);

const cellHead = {
  textAlign: 'left',
  padding: '8px',
  fontSize: '12px',
  color: 'var(--light-color)'
};

const cellBody = {
  textAlign: 'left',
  padding: '8px',
  fontSize: '12px',
  color: 'var(--text-color)'
};

export default CrawlerMetricsInsightsPage;
