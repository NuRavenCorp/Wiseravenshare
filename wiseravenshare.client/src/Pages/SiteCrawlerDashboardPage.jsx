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

const STATUS_COLORS = {
  Pending: '#f59e0b',
  Running: '#38bdf8',
  Paused: '#f59e0b',
  Completed: '#10b981',
  Failed: '#ef4444',
  Cancelled: '#94a3b8'
};

const scoreColor = (score) => {
  if (score >= 90) return '#10b981';
  if (score >= 75) return '#84cc16';
  if (score >= 60) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
};

const SiteCrawlerDashboardPage = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [issues, setIssues] = useState([]);
  const [pages, setPages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    startUrl: 'https://wiseravenshare.com',
    jobName: '',
    scope: 'FullSite',
    maxPages: 5000,
    maxDepth: 10,
    requestsPerSecond: 5,
    respectRobotsTxt: true,
    renderJavaScript: true,
    captureScreenshots: false,
    followExternalLinks: false,
    includePatterns: '',
    excludePatterns: ''
  });

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) || null, [jobs, selectedJobId]);

  const loadJobs = async () => {
    setLoading(true);
    try {
      setError('');
      const data = await siteAuditCrawlerService.getJobs(true);
      setJobs(data || []);
      if (!selectedJobId && data?.length) {
        setSelectedJobId(data[0].id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load crawl jobs.');
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedJobData = async () => {
    if (!selectedJobId) {
      setIssues([]);
      setPages([]);
      return;
    }

    try {
      const [issueRows, pageRows] = await Promise.all([
        siteAuditCrawlerService.getIssues(selectedJobId, { pageSize: 200 }),
        siteAuditCrawlerService.getPages(selectedJobId, { pageSize: 200 })
      ]);
      setIssues(issueRows || []);
      setPages(pageRows || []);
    } catch (err) {
      setError(err.message || 'Failed to load job details.');
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  useEffect(() => {
    loadSelectedJobData();
  }, [selectedJobId]);

  useEffect(() => {
    const timer = setInterval(async () => {
      await loadJobs();
      await loadSelectedJobData();
    }, 5000);
    return () => clearInterval(timer);
  }, [selectedJobId]);

  const handleFormChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleStart = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        ...form,
        scope: ['SinglePage', 'Section', 'FullSite', 'SitemapOnly', 'CustomList'].indexOf(form.scope),
        includePatterns: form.includePatterns ? form.includePatterns.split(',').map((value) => value.trim()).filter(Boolean) : null,
        excludePatterns: form.excludePatterns ? form.excludePatterns.split(',').map((value) => value.trim()).filter(Boolean) : null
      };
      const createdJob = await siteAuditCrawlerService.startCrawl(payload);
      await loadJobs();
      setSelectedJobId(createdJob.id);
    } catch (err) {
      setError(err.message || 'Failed to start crawl.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (jobId) => {
    try {
      await siteAuditCrawlerService.cancelJob(jobId);
      await loadJobs();
      await loadSelectedJobData();
    } catch (err) {
      setError(err.message || 'Failed to cancel crawl.');
    }
  };

  const handleDelete = async (jobId) => {
    try {
      await siteAuditCrawlerService.deleteJob(jobId);
      await loadJobs();
      if (selectedJobId === jobId) {
        setSelectedJobId('');
      }
      setIssues([]);
      setPages([]);
    } catch (err) {
      setError(err.message || 'Failed to delete crawl.');
    }
  };

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <section style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: 'var(--card-bg)' }}>
        <h2 style={{ marginTop: 0, marginBottom: '10px' }}>Site Intelligence Crawler</h2>
        <form onSubmit={handleStart} style={{ display: 'grid', gap: '10px' }}>
          <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label>
              <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '6px' }}>Start URL</div>
              <input className="input" type="url" required value={form.startUrl} onChange={(event) => handleFormChange('startUrl', event.target.value)} />
            </label>
            <label>
              <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '6px' }}>Job Name</div>
              <input className="input" value={form.jobName} onChange={(event) => handleFormChange('jobName', event.target.value)} />
            </label>
            <label>
              <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '6px' }}>Scope</div>
              <select className="input" value={form.scope} onChange={(event) => handleFormChange('scope', event.target.value)}>
                <option>SinglePage</option>
                <option>Section</option>
                <option>FullSite</option>
                <option>SitemapOnly</option>
                <option>CustomList</option>
              </select>
            </label>
            <label>
              <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '6px' }}>Max Pages</div>
              <input className="input" type="number" min="1" value={form.maxPages} onChange={(event) => handleFormChange('maxPages', Number(event.target.value))} />
            </label>
            <label>
              <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '6px' }}>Max Depth</div>
              <input className="input" type="number" min="0" value={form.maxDepth} onChange={(event) => handleFormChange('maxDepth', Number(event.target.value))} />
            </label>
            <label>
              <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '6px' }}>Requests / Sec</div>
              <input className="input" type="number" min="1" value={form.requestsPerSecond} onChange={(event) => handleFormChange('requestsPerSecond', Number(event.target.value))} />
            </label>
          </div>

          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            <Toggle label="Respect robots.txt" checked={form.respectRobotsTxt} onChange={(value) => handleFormChange('respectRobotsTxt', value)} />
            <Toggle label="Render JavaScript" checked={form.renderJavaScript} onChange={(value) => handleFormChange('renderJavaScript', value)} />
            <Toggle label="Capture Screenshots" checked={form.captureScreenshots} onChange={(value) => handleFormChange('captureScreenshots', value)} />
            <Toggle label="Follow External Links" checked={form.followExternalLinks} onChange={(value) => handleFormChange('followExternalLinks', value)} />
          </div>

          <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            <label>
              <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '6px' }}>Include Patterns (comma separated)</div>
              <input className="input" value={form.includePatterns} onChange={(event) => handleFormChange('includePatterns', event.target.value)} />
            </label>
            <label>
              <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '6px' }}>Exclude Patterns (comma separated)</div>
              <input className="input" value={form.excludePatterns} onChange={(event) => handleFormChange('excludePatterns', event.target.value)} />
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" className="input" style={{ width: 'auto', cursor: 'pointer' }} onClick={loadJobs}>Refresh Jobs</button>
            <button type="submit" className="input" style={{ width: 'auto', cursor: 'pointer' }} disabled={submitting}>
              {submitting ? 'Starting...' : 'Start Crawl'}
            </button>
          </div>
        </form>
      </section>

      {error ? (
        <div style={{ border: '1px solid #dc2626', borderRadius: '10px', padding: '12px', background: 'rgba(220,38,38,0.15)' }}>
          {error}
        </div>
      ) : null}

      <section style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: 'var(--card-bg)' }}>
        <h3 style={{ marginTop: 0 }}>Crawl Jobs</h3>
        {loading ? <div>Loading jobs...</div> : null}
        <div style={{ display: 'grid', gap: '10px' }}>
          {jobs.map((job) => (
            <button
              type="button"
              key={job.id}
              onClick={() => setSelectedJobId(job.id)}
              style={{
                textAlign: 'left',
                border: selectedJobId === job.id ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '12px',
                background: 'rgba(15,23,42,0.35)',
                color: 'var(--text-color)',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <strong>{job.jobName}</strong>
                <span style={{ color: STATUS_COLORS[STATUS_NAMES[job.status] || job.status] || '#cbd5e1' }}>
                  {STATUS_NAMES[job.status] || job.status}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--light-color)', marginTop: '6px' }}>{job.startUrl}</div>
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '8px', fontSize: '12px' }}>
                <span>Pages: {job.pagesCrawled}/{job.pagesDiscovered}</span>
                <span>Issues: {job.issuesFound}</span>
                <span>Failed: {job.pagesFailed}</span>
                <span style={{ color: scoreColor(Math.round(job.overallHealthScore || 0)) }}>
                  Health: {Math.round(job.overallHealthScore || 0)}
                </span>
              </div>
              <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                {(STATUS_NAMES[job.status] || job.status) === 'Running' ? (
                  <span className="input" onClick={(event) => { event.stopPropagation(); handleCancel(job.id); }} style={{ width: 'auto' }}>Cancel</span>
                ) : null}
                <span className="input" onClick={(event) => { event.stopPropagation(); handleDelete(job.id); }} style={{ width: 'auto' }}>Delete</span>
              </div>
            </button>
          ))}
          {jobs.length === 0 && !loading ? <div style={{ color: 'var(--light-color)' }}>No crawl jobs found.</div> : null}
        </div>
      </section>

      {selectedJob ? (
        <section style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', background: 'var(--card-bg)' }}>
          <h3 style={{ marginTop: 0 }}>Job Detail: {selectedJob.jobName}</h3>
          <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '12px' }}>
            <Stat label="Overall" value={`${Math.round(selectedJob.overallHealthScore || 0)}`} color={scoreColor(Math.round(selectedJob.overallHealthScore || 0))} />
            <Stat label="SEO" value={`${Math.round(selectedJob.seoScore || 0)}`} color={scoreColor(Math.round(selectedJob.seoScore || 0))} />
            <Stat label="Performance" value={`${Math.round(selectedJob.performanceScore || 0)}`} color={scoreColor(Math.round(selectedJob.performanceScore || 0))} />
            <Stat label="Accessibility" value={`${Math.round(selectedJob.accessibilityScore || 0)}`} color={scoreColor(Math.round(selectedJob.accessibilityScore || 0))} />
            <Stat label="Security" value={`${Math.round(selectedJob.securityScore || 0)}`} color={scoreColor(Math.round(selectedJob.securityScore || 0))} />
            <Stat label="Content" value={`${Math.round(selectedJob.contentScore || 0)}`} color={scoreColor(Math.round(selectedJob.contentScore || 0))} />
          </div>

          <h4 style={{ marginBottom: '8px' }}>Top Issues ({issues.length})</h4>
          <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#101a33' }}>
                <tr>
                  <th style={cellHead}>Severity</th>
                  <th style={cellHead}>Category</th>
                  <th style={cellHead}>Code</th>
                  <th style={cellHead}>Title</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id} style={{ borderTop: '1px solid rgba(148,163,184,0.25)' }}>
                    <td style={cellBody}>{ISSUE_SEVERITY_NAMES[issue.severity] || issue.severity}</td>
                    <td style={cellBody}>{ISSUE_CATEGORY_NAMES[issue.category] || issue.category}</td>
                    <td style={cellBody}><code>{issue.code}</code></td>
                    <td style={cellBody}>{issue.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 style={{ marginTop: '16px', marginBottom: '8px' }}>Pages ({pages.length})</h4>
          <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#101a33' }}>
                <tr>
                  <th style={cellHead}>Status</th>
                  <th style={cellHead}>URL</th>
                  <th style={cellHead}>Response</th>
                  <th style={cellHead}>Words</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr key={page.id} style={{ borderTop: '1px solid rgba(148,163,184,0.25)' }}>
                    <td style={cellBody}>{page.statusCode}</td>
                    <td style={cellBody}>{page.url}</td>
                    <td style={cellBody}>{page.responseTimeMs} ms</td>
                    <td style={cellBody}>{page.wordCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
};

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

const Toggle = ({ label, checked, onChange }) => (
  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    {label}
  </label>
);

const Stat = ({ label, value, color }) => (
  <div style={{ border: '1px solid rgba(148,163,184,0.35)', borderRadius: '10px', padding: '10px' }}>
    <div style={{ fontSize: '11px', color: 'var(--light-color)', textTransform: 'uppercase' }}>{label}</div>
    <div style={{ fontWeight: 700, color }}>{value}</div>
  </div>
);

export default SiteCrawlerDashboardPage;
