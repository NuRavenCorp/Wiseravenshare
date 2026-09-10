/**
 * FMCreatorStudio.jsx
 *
 * Full Radio Station Creator Studio with:
 *  - 4 views: wizard | my-stations | marketplace | station-detail
 *  - 5-step wizard (Basic → Content → Audience → Licensing → Review)
 *  - Marketplace: browse & subscribe to monetised stations
 *  - Station management: go live, schedule shows, analytics, followers
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiAlertCircle, FiBarChart2, FiBookmark, FiCalendar, FiCheck,
  FiChevronLeft, FiChevronRight, FiClock, FiDollarSign, FiEdit2,
  FiFileText, FiGlobe, FiHeart, FiInfo, FiLoader, FiLock,
  FiMic, FiMusic, FiPlus, FiRadio, FiSave, FiSearch,
  FiShield, FiStar, FiTrash2, FiUsers, FiX, FiZap,
} from 'react-icons/fi';
import { fmService } from '../../Services/fmService';
import api from '../../Services/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const GENRES = ['Pop', 'Rock', 'Hip Hop', 'Jazz', 'Classical', 'Electronic', 'Country', 'Reggae', 'Latin', 'News', 'Talk', 'Sports', 'Gospel', 'Mixed'];
const BANDS  = ['ONLINE', 'FM', 'AM'];
const FORMATS = ['mp3', 'aac', 'ogg', 'opus'];
const BITRATES = [64, 96, 128, 192, 256, 320];
const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Japanese', 'Korean', 'Chinese', 'Arabic', 'Hindi'];
const RATINGS   = ['General', 'Teen', 'Mature', 'Explicit'];
const VISIBILITIES = ['Public', 'Unlisted', 'Private', 'SubscribersOnly'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const EMPTY_FORM = {
  // Step 1 – Basic
  name: '', tagline: '', description: '', logoUrl: '', coverImageUrl: '', brandColor: '#667eea',
  // Step 2 – Content
  genre: '', subGenre: '', band: 'ONLINE', bitrate: 128, streamFormat: 'mp3', contentRating: 'General',
  claimProprietaryFrequency: true, allowChat: true, allowRequests: true, allowShoutouts: true,
  visibility: 'Public', website: '', socialLinks: '',
  // Step 3 – Audience
  targetLanguage: 'English', targetRegion: '',
  isMonetized: false, monetizationType: 'None', subscriptionPrice: '', allowDonations: false, donationLink: '',
  // Step 4 – Licensing
  licenseNumber: '', licenseType: 'Standard', licenseIssuingAuthority: '', licenseDocumentUrl: '',
  licenseIssuedAt: '', licenseExpiresAt: '',
  licenseCoversMusicBroadcast: true, licenseCoversTalkContent: false, licenseCoversLiveShows: false,
  licensePROs: [],
};

const STEPS = [
  { id: 'basic',    label: 'Basic Info',  icon: FiRadio  },
  { id: 'content',  label: 'Content',     icon: FiMusic  },
  { id: 'audience', label: 'Audience',    icon: FiGlobe  },
  { id: 'license',  label: 'Licensing',   icon: FiShield },
  { id: 'review',   label: 'Review',      icon: FiCheck  },
];

// ─── Main Component ────────────────────────────────────────────────────────────
const FMCreatorStudio = () => {
  const [view, setView]               = useState('my-stations'); // wizard | my-stations | marketplace | station-detail
  const [stations, setStations]       = useState([]);
  const [marketplace, setMarketplace] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [toast, setToast]             = useState('');

  // Wizard state
  const [step, setStep]   = useState(0);
  const [form, setForm]   = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [wizardErrors, setWizardErrors] = useState({});

  // Schedule form
  const [schedForm, setSchedForm] = useState({ title: '', dayOfWeek: 1, startTime: '08:00', endTime: '10:00', timezone: 'UTC', isRecurring: true, hostName: '', genre: '' });
  const [addingSchedule, setAddingSchedule] = useState(false);

  const showToast = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); }, []);

  // ── Load my stations ────────────────────────────────────────────────────────
  const loadMyStations = useCallback(async () => {
    setLoading(true); setError('');
    try { setStations(await fmService.getMyCreatorStations()); }
    catch (e) { setError(e?.response?.data?.message || e?.message || 'Unable to load stations.'); }
    finally { setLoading(false); }
  }, []);

  // ── Load marketplace ────────────────────────────────────────────────────────
  const loadMarketplace = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const resp = await api.get('/fmtuner/creator-stations/marketplace');
      setMarketplace(Array.isArray(resp?.data) ? resp.data : []);
    } catch (e) {
      // Fallback to public stations if marketplace endpoint not yet deployed
      try { setMarketplace(await fmService.getPublicCreatorStations(1, 24)); }
      catch { setError('Unable to load marketplace.'); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadMyStations();
  }, [loadMyStations]);

  useEffect(() => {
    if (view === 'marketplace' && marketplace.length === 0) loadMarketplace();
  }, [view, marketplace.length, loadMarketplace]);

  // ── Wizard helpers ──────────────────────────────────────────────────────────
  const patch = (next) => setForm((p) => ({ ...p, ...next }));

  const validateStep = () => {
    const errs = {};
    if (step === 0) {
      if (!form.name.trim()) errs.name = 'Station name is required.';
    }
    if (step === 1) {
      if (!form.genre) errs.genre = 'Genre is required.';
    }
    if (step === 2) {
      if (!form.targetLanguage) errs.targetLanguage = 'Language is required.';
      if (form.isMonetized && form.monetizationType === 'Subscription' && !form.subscriptionPrice)
        errs.subscriptionPrice = 'Subscription price is required.';
    }
    if (step === 3) {
      if (form.licenseNumber && !form.licenseExpiresAt) errs.licenseExpiresAt = 'Expiry date is required with a license number.';
    }
    setWizardErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const nextStep = () => { if (validateStep()) setStep((s) => Math.min(s + 1, STEPS.length - 1)); };
  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  const submitWizard = async () => {
    if (!validateStep()) return;
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        bitrate: Number(form.bitrate),
        subscriptionPrice: form.subscriptionPrice ? parseFloat(form.subscriptionPrice) : null,
        licenseIssuedAt: form.licenseIssuedAt || null,
        licenseExpiresAt: form.licenseExpiresAt || null,
      };
      const created = await fmService.createCreatorStation(payload);
      setStations((p) => [created, ...p]);
      setForm({ ...EMPTY_FORM });
      setStep(0);
      setView('my-stations');
      showToast('🎙 Station created! Submit it for review when ready.');
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Station creation failed.');
    } finally { setSaving(false); }
  };

  // ── Station actions ─────────────────────────────────────────────────────────
  const toggleLive = async (station) => {
    try {
      if (station.isLive) await fmService.endCreatorStationLive(station.id);
      else await fmService.startCreatorStationLive(station.id);
      await loadMyStations();
      showToast(station.isLive ? 'Stream ended.' : '🔴 Now LIVE!');
    } catch (e) { setError(e?.response?.data?.message || e?.message || 'Live toggle failed.'); }
  };

  const submitForReview = async (station) => {
    try {
      await fmService.updateCreatorStationStatus(station.id, 'PendingApproval');
      await loadMyStations();
      showToast('📋 Submitted for review.');
    } catch (e) { setError(e?.response?.data?.message || e?.message || 'Submit failed.'); }
  };

  const deleteStation = async (station) => {
    if (!window.confirm(`Delete "${station.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/fmtuner/creator-stations/${station.id}`);
      setStations((p) => p.filter((s) => s.id !== station.id));
      showToast('Station deleted.');
    } catch (e) { setError(e?.response?.data?.message || e?.message || 'Delete failed.'); }
  };

  const followStation = async (station) => {
    try {
      if (station.isFollowing) await fmService.unfollowCreatorStation(station.id);
      else await fmService.followCreatorStation(station.id);
      setMarketplace((p) => p.map((s) => s.id === station.id ? { ...s, isFollowing: !s.isFollowing } : s));
    } catch (e) { setError(e?.message || 'Action failed.'); }
  };

  // ── Add schedule ────────────────────────────────────────────────────────────
  const addSchedule = async () => {
    if (!selectedStation) return;
    setAddingSchedule(true);
    try {
      await fmService.addCreatorStationSchedule(selectedStation.id, { ...schedForm, dayOfWeek: Number(schedForm.dayOfWeek) });
      const updated = await fmService.searchCreatorStations('', '', '');
      const refreshed = updated.find((s) => s.id === selectedStation.id);
      if (refreshed) setSelectedStation(refreshed);
      setSchedForm({ title: '', dayOfWeek: 1, startTime: '08:00', endTime: '10:00', timezone: 'UTC', isRecurring: true, hostName: '', genre: '' });
      showToast('Schedule added.');
    } catch (e) { setError(e?.message || 'Schedule add failed.'); }
    finally { setAddingSchedule(false); }
  };

  // ── View switching ──────────────────────────────────────────────────────────
  const openDetail = async (station) => {
    try {
      const full = await api.get(`/fmtuner/creator-stations/${station.id}`);
      setSelectedStation(full?.data || station);
    } catch { setSelectedStation(station); }
    setView('station-detail');
  };

  // ── Render helpers ──────────────────────────────────────────────────────────
  const statusColor = (status) => {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s === 'active') return 'color:#4ade80';
    if (s === 'pendingreview' || s === 'pendingapproval') return 'color:#fb923c';
    if (s === 'suspended') return 'color:#f87171';
    return 'color:#94a3b8';
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <section className="fm-creator-studio">
      {/* Toast */}
      {toast && <div className="fm-toast">{toast}</div>}

      {/* Nav bar */}
      <div className="fm-creator-nav">
        <button className={`fm-creator-nav-btn${view === 'my-stations'  ? ' active' : ''}`} onClick={() => { setView('my-stations'); loadMyStations(); }}><FiRadio /> My Stations</button>
        <button className={`fm-creator-nav-btn${view === 'wizard'       ? ' active' : ''}`} onClick={() => { setForm({ ...EMPTY_FORM }); setStep(0); setView('wizard'); }}><FiPlus /> Create New</button>
        <button className={`fm-creator-nav-btn${view === 'marketplace'  ? ' active' : ''}`} onClick={() => setView('marketplace')}><FiStar /> Marketplace</button>
      </div>

      {error && (
        <div className="fm-error-banner">
          <FiAlertCircle /> {error}
          <button type="button" onClick={() => setError('')}><FiX /></button>
        </div>
      )}

      {/* ─── MY STATIONS ─── */}
      {view === 'my-stations' && (
        <div className="fm-creator-list">
          <div className="fm-creator-list-header">
            <h4>Your Radio Stations</h4>
            <button className="fm-btn fm-btn-primary" onClick={() => { setForm({ ...EMPTY_FORM }); setStep(0); setView('wizard'); }}>
              <FiPlus /> New Station
            </button>
          </div>

          {loading && <div className="fm-empty"><FiLoader className="spin" /> Loading…</div>}
          {!loading && stations.length === 0 && (
            <div className="fm-empty">
              <FiRadio size={32} />
              <p>No stations yet. Create your first one!</p>
              <button className="fm-btn fm-btn-primary" onClick={() => setView('wizard')}>Create Station</button>
            </div>
          )}

          {stations.map((station) => (
            <article key={station.id} className="fm-creator-card">
              <div className="fm-creator-card-logo">
                {station.logoUrl
                  ? <img src={station.logoUrl} alt={station.name} />
                  : <FiRadio />}
              </div>
              <div className="fm-creator-card-body">
                <strong>{station.name}</strong>
                <small>{station.frequency} · {station.band} · <span style={{ ...Object.fromEntries((station.status || '').split(';').filter(Boolean).map(s => s.trim().split(':').map(s => s.trim()))) }}>{station.status || 'Draft'}</span></small>
                <small>
                  <FiUsers style={{ marginRight: 4 }} />{station.followerCount || 0} followers
                  {station.isMonetized && <> · <FiDollarSign style={{ marginRight: 2 }} />{station.subscriptionPrice ? `$${station.subscriptionPrice}/mo` : 'Monetised'}</>}
                </small>
              </div>
              <div className="fm-creator-actions">
                {station.isLive && <span className="fm-live-badge">● LIVE</span>}
                <button className="fm-icon-btn" title="Station detail" onClick={() => openDetail(station)}><FiEdit2 /></button>
                <button className={`fm-icon-btn play${station.isLive ? ' active' : ''}`} title={station.isLive ? 'End broadcast' : 'Go live'} onClick={() => toggleLive(station)}><FiMic /></button>
                {(station.status === 'Draft' || station.status === 'draft') && (
                  <button className="fm-icon-btn" title="Submit for review" onClick={() => submitForReview(station)}><FiSave /></button>
                )}
                <button className="fm-icon-btn" title="Delete" onClick={() => deleteStation(station)} style={{ color: '#f87171' }}><FiTrash2 /></button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ─── WIZARD ─── */}
      {view === 'wizard' && (
        <div className="fm-wizard">
          {/* Step indicators */}
          <div className="fm-wizard-steps">
            {STEPS.map((s, i) => (
              <div key={s.id} className={`fm-wizard-step${i === step ? ' active' : i < step ? ' done' : ''}`}>
                <div className="fm-wizard-step-dot">
                  {i < step ? <FiCheck /> : <s.icon />}
                </div>
                <span>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Step body */}
          <div className="fm-wizard-body">
            {step === 0 && <WizardBasic form={form} patch={patch} errors={wizardErrors} />}
            {step === 1 && <WizardContent form={form} patch={patch} errors={wizardErrors} />}
            {step === 2 && <WizardAudience form={form} patch={patch} errors={wizardErrors} />}
            {step === 3 && <WizardLicensing form={form} patch={patch} errors={wizardErrors} />}
            {step === 4 && <WizardReview form={form} />}
          </div>

          {/* Navigation */}
          <div className="fm-wizard-footer">
            <button className="fm-btn" onClick={prevStep} disabled={step === 0}>
              <FiChevronLeft /> Back
            </button>
            {step < STEPS.length - 1
              ? <button className="fm-btn fm-btn-primary" onClick={nextStep}>Next <FiChevronRight /></button>
              : <button className="fm-btn fm-btn-primary" onClick={submitWizard} disabled={saving}>
                  {saving ? <><FiLoader className="spin" /> Creating…</> : <><FiCheck /> Create Station</>}
                </button>
            }
          </div>
        </div>
      )}

      {/* ─── MARKETPLACE ─── */}
      {view === 'marketplace' && (
        <div className="fm-creator-marketplace">
          <div className="fm-creator-list-header">
            <h4><FiStar /> Station Marketplace</h4>
            <small style={{ color: 'var(--ms-muted, #64748b)' }}>Browse and subscribe to creator radio stations</small>
          </div>

          {loading && <div className="fm-empty"><FiLoader className="spin" /> Loading marketplace…</div>}
          {!loading && marketplace.length === 0 && (
            <div className="fm-empty">
              <FiStar size={28} />
              <p>No marketplace listings yet.</p>
            </div>
          )}

          <div className="fm-marketplace-grid">
            {marketplace.map((station) => (
              <div key={station.id} className="fm-marketplace-card" style={{ '--brand': station.brandColor || '#667eea' }}>
                <div className="fm-mc-header">
                  {station.logoUrl
                    ? <img src={station.logoUrl} alt={station.name} className="fm-mc-logo" />
                    : <div className="fm-mc-logo-placeholder"><FiRadio /></div>}
                  {station.isLive && <span className="fm-live-badge">● LIVE</span>}
                </div>
                <div className="fm-mc-body">
                  <strong>{station.name}</strong>
                  <small>{station.genre} · {station.band}</small>
                  {station.description && <p className="fm-mc-desc">{station.description.slice(0, 80)}{station.description.length > 80 ? '…' : ''}</p>}
                  <div className="fm-mc-stats">
                    <span><FiUsers /> {station.followerCount || 0}</span>
                    <span><FiMic /> {station.totalListeners || 0}</span>
                    {station.subscriptionPrice && <span><FiDollarSign /> ${station.subscriptionPrice}/mo</span>}
                  </div>
                </div>
                <div className="fm-mc-actions">
                  <button
                    className={`fm-btn${station.isFollowing ? '' : ' fm-btn-primary'}`}
                    onClick={() => followStation(station)}
                  >
                    {station.isFollowing ? <><FiHeart /> Following</> : <><FiHeart /> Follow</>}
                  </button>
                  {station.subscriptionPrice && (
                    <button className="fm-btn fm-btn-primary" onClick={() => window.open(station.donationLink || '#', '_blank')}>
                      <FiDollarSign /> Subscribe
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── STATION DETAIL ─── */}
      {view === 'station-detail' && selectedStation && (
        <div className="fm-station-detail">
          <div className="fm-detail-header">
            <button className="fm-icon-btn" onClick={() => setView('my-stations')}><FiChevronLeft /> All stations</button>
            <h4>{selectedStation.name}</h4>
            <button
              className={`fm-btn${selectedStation.isLive ? '' : ' fm-btn-primary'}`}
              onClick={() => toggleLive(selectedStation)}
            >
              <FiMic /> {selectedStation.isLive ? 'End Broadcast' : 'Go Live'}
            </button>
          </div>

          {/* Stats row */}
          <div className="fm-detail-stats">
            {[
              { icon: FiUsers, label: 'Followers', value: selectedStation.followerCount || 0 },
              { icon: FiMic,   label: 'Listeners', value: selectedStation.listeners || 0 },
              { icon: FiBarChart2, label: 'Peak', value: selectedStation.peakListeners || 0 },
              { icon: FiClock, label: 'Total listeners', value: selectedStation.totalListeners || 0 },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="fm-detail-stat">
                <Icon />
                <span className="fm-stat-val">{value}</span>
                <span className="fm-stat-label">{label}</span>
              </div>
            ))}
          </div>

          {/* Stream info */}
          <div className="fm-detail-section">
            <h5><FiRadio /> Broadcast Info</h5>
            <div className="fm-detail-row"><span>Status</span><span style={{ color: selectedStation.isLive ? '#4ade80' : '#94a3b8' }}>{selectedStation.isLive ? '● LIVE' : '○ Off Air'}</span></div>
            <div className="fm-detail-row"><span>Stream Key</span><code style={{ fontSize: '.7rem', opacity: .7 }}>{selectedStation.streamKey || 'Not provisioned'}</code></div>
            <div className="fm-detail-row"><span>Frequency</span><span>{selectedStation.frequency} {selectedStation.band}</span></div>
          </div>

          {/* Monetization */}
          <div className="fm-detail-section">
            <h5><FiDollarSign /> Monetization</h5>
            <div className="fm-detail-row"><span>Monetised</span><span>{selectedStation.isMonetized ? '✓ Yes' : 'No'}</span></div>
            {selectedStation.subscriptionPrice && <div className="fm-detail-row"><span>Price</span><span>${selectedStation.subscriptionPrice}/month</span></div>}
          </div>

          {/* Schedule manager */}
          <div className="fm-detail-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h5 style={{ margin: 0 }}><FiCalendar /> Show Schedule</h5>
            </div>

            {(selectedStation.schedule || []).length === 0 && <div className="fm-empty" style={{ padding: '12px 0' }}>No shows scheduled yet.</div>}
            {(selectedStation.schedule || []).map((sched) => (
              <div key={sched.id} className="fm-sched-item">
                <strong>{sched.title}</strong>
                <small>{DAYS[sched.dayOfWeek]} · {sched.startTime}–{sched.endTime} ({sched.timezone})</small>
                {sched.hostName && <small>Host: {sched.hostName}</small>}
              </div>
            ))}

            {/* Add schedule form */}
            <div className="fm-sched-form">
              <h6 style={{ margin: '12px 0 8px', fontSize: '.75rem', letterSpacing: '.1em', opacity: .7 }}>ADD SHOW</h6>
              <div className="fm-creator-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label>Title<input value={schedForm.title} onChange={(e) => setSchedForm((p) => ({ ...p, title: e.target.value }))} placeholder="Show title" /></label>
                <label>Host<input value={schedForm.hostName} onChange={(e) => setSchedForm((p) => ({ ...p, hostName: e.target.value }))} placeholder="Optional" /></label>
                <label>Day
                  <select value={schedForm.dayOfWeek} onChange={(e) => setSchedForm((p) => ({ ...p, dayOfWeek: e.target.value }))}>
                    {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select>
                </label>
                <label>Genre<input value={schedForm.genre} onChange={(e) => setSchedForm((p) => ({ ...p, genre: e.target.value }))} /></label>
                <label>Start<input type="time" value={schedForm.startTime} onChange={(e) => setSchedForm((p) => ({ ...p, startTime: e.target.value }))} /></label>
                <label>End<input type="time" value={schedForm.endTime} onChange={(e) => setSchedForm((p) => ({ ...p, endTime: e.target.value }))} /></label>
              </div>
              <button className="fm-btn fm-btn-primary" onClick={addSchedule} disabled={!schedForm.title || addingSchedule} style={{ marginTop: 8 }}>
                {addingSchedule ? <FiLoader className="spin" /> : <FiPlus />} Add Show
              </button>
            </div>
          </div>

          {/* Actions */}
          {(selectedStation.status === 'Draft' || selectedStation.status === 'draft') && (
            <button className="fm-btn fm-btn-primary" onClick={() => submitForReview(selectedStation)} style={{ marginTop: 12, width: '100%' }}>
              <FiSave /> Submit Station for Review
            </button>
          )}
        </div>
      )}
    </section>
  );
};

// ─── Wizard Step Components ────────────────────────────────────────────────────
const Field = ({ label, error, children }) => (
  <label className={`fm-field${error ? ' has-error' : ''}`}>
    {label}
    {children}
    {error && <span className="fm-field-error">{error}</span>}
  </label>
);

const WizardBasic = ({ form, patch, errors }) => (
  <div className="fm-wizard-step-body">
    <h4>Station Identity</h4>
    <p className="fm-wizard-sub">Give your radio station a memorable name and look.</p>
    <div className="fm-creator-grid">
      <Field label="Station Name *" error={errors.name}>
        <input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Midnight Vibes Radio" />
      </Field>
      <Field label="Tagline">
        <input value={form.tagline} onChange={(e) => patch({ tagline: e.target.value })} placeholder="Short catchy slogan" />
      </Field>
      <Field label="Logo URL">
        <input value={form.logoUrl} onChange={(e) => patch({ logoUrl: e.target.value })} placeholder="https://…" />
      </Field>
      <Field label="Cover Image URL">
        <input value={form.coverImageUrl} onChange={(e) => patch({ coverImageUrl: e.target.value })} placeholder="https://…" />
      </Field>
      <Field label="Brand Colour">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="color" value={form.brandColor} onChange={(e) => patch({ brandColor: e.target.value })} style={{ width: 40, height: 36, padding: 2 }} />
          <input value={form.brandColor} onChange={(e) => patch({ brandColor: e.target.value })} style={{ flex: 1 }} />
        </div>
      </Field>
      <Field label="Website">
        <input value={form.website} onChange={(e) => patch({ website: e.target.value })} placeholder="https://…" />
      </Field>
    </div>
    <Field label="Description">
      <textarea value={form.description} onChange={(e) => patch({ description: e.target.value })} rows={3} placeholder="Tell listeners what your station is about…" />
    </Field>
  </div>
);

const WizardContent = ({ form, patch, errors }) => (
  <div className="fm-wizard-step-body">
    <h4>Content & Format</h4>
    <p className="fm-wizard-sub">Define your programming and technical format.</p>
    <div className="fm-creator-grid">
      <Field label="Primary Genre *" error={errors.genre}>
        <select value={form.genre} onChange={(e) => patch({ genre: e.target.value })}>
          <option value="">Select genre…</option>
          {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </Field>
      <Field label="Sub-Genre">
        <input value={form.subGenre} onChange={(e) => patch({ subGenre: e.target.value })} placeholder="e.g. Deep House" />
      </Field>
      <Field label="Band">
        <select value={form.band} onChange={(e) => patch({ band: e.target.value })}>
          {BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </Field>
      <Field label="Content Rating">
        <select value={form.contentRating} onChange={(e) => patch({ contentRating: e.target.value })}>
          {RATINGS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Bitrate (kbps)">
        <select value={form.bitrate} onChange={(e) => patch({ bitrate: e.target.value })}>
          {BITRATES.map((b) => <option key={b} value={b}>{b} kbps</option>)}
        </select>
      </Field>
      <Field label="Stream Format">
        <select value={form.streamFormat} onChange={(e) => patch({ streamFormat: e.target.value })}>
          {FORMATS.map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
        </select>
      </Field>
      <Field label="Visibility">
        <select value={form.visibility} onChange={(e) => patch({ visibility: e.target.value })}>
          {VISIBILITIES.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </Field>
    </div>
    <div className="fm-creator-check-row" style={{ marginTop: 12 }}>
      <label><input type="checkbox" checked={form.allowChat}      onChange={(e) => patch({ allowChat: e.target.checked })} /> Chat</label>
      <label><input type="checkbox" checked={form.allowRequests}  onChange={(e) => patch({ allowRequests: e.target.checked })} /> Song requests</label>
      <label><input type="checkbox" checked={form.allowShoutouts} onChange={(e) => patch({ allowShoutouts: e.target.checked })} /> Shoutouts</label>
      <label><input type="checkbox" checked={form.claimProprietaryFrequency} onChange={(e) => patch({ claimProprietaryFrequency: e.target.checked })} /> <FiLock style={{ marginRight: 4 }} />Lock frequency</label>
    </div>
  </div>
);

const WizardAudience = ({ form, patch, errors }) => (
  <div className="fm-wizard-step-body">
    <h4>Audience & Monetization</h4>
    <p className="fm-wizard-sub">Set your target audience and revenue options.</p>
    <div className="fm-creator-grid">
      <Field label="Primary Language *" error={errors.targetLanguage}>
        <select value={form.targetLanguage} onChange={(e) => patch({ targetLanguage: e.target.value })}>
          {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </Field>
      <Field label="Target Region">
        <input value={form.targetRegion} onChange={(e) => patch({ targetRegion: e.target.value })} placeholder="e.g. North America" />
      </Field>
    </div>
    <div className="fm-detail-section" style={{ marginTop: 16 }}>
      <label className="fm-creator-check" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={form.isMonetized} onChange={(e) => patch({ isMonetized: e.target.checked })} />
        <strong>Enable Monetization</strong>
      </label>
      {form.isMonetized && (
        <div className="fm-creator-grid">
          <Field label="Monetization Type">
            <select value={form.monetizationType} onChange={(e) => patch({ monetizationType: e.target.value })}>
              {['None','Subscription','Donations','Advertising','Hybrid'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          {form.monetizationType === 'Subscription' && (
            <Field label="Monthly Price (USD) *" error={errors.subscriptionPrice}>
              <input type="number" min="1" step="0.01" value={form.subscriptionPrice} onChange={(e) => patch({ subscriptionPrice: e.target.value })} placeholder="4.99" />
            </Field>
          )}
          <label className="fm-creator-check">
            <input type="checkbox" checked={form.allowDonations} onChange={(e) => patch({ allowDonations: e.target.checked })} /> Accept donations
          </label>
          {form.allowDonations && (
            <Field label="Donation Link">
              <input value={form.donationLink} onChange={(e) => patch({ donationLink: e.target.value })} placeholder="https://…" />
            </Field>
          )}
        </div>
      )}
    </div>
  </div>
);

const WizardLicensing = ({ form, patch, errors }) => (
  <div className="fm-wizard-step-body">
    <h4>Licensing & Legal</h4>
    <p className="fm-wizard-sub">Provide your broadcast license details for legal compliance.</p>
    <div className="fm-info-banner">
      <FiInfo /> To legally broadcast music you need licensing from a Performance Rights Organization (ASCAP, BMI, SESAC, PRS, etc.). Stations without a valid license may be suspended.
    </div>
    <div className="fm-creator-grid">
      <Field label="License Number">
        <input value={form.licenseNumber} onChange={(e) => patch({ licenseNumber: e.target.value })} placeholder="ASCAP-123456" />
      </Field>
      <Field label="License Type">
        <select value={form.licenseType} onChange={(e) => patch({ licenseType: e.target.value })}>
          {['Standard', 'Internet', 'Community', 'Educational', 'Commercial'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Issuing Authority">
        <input value={form.licenseIssuingAuthority} onChange={(e) => patch({ licenseIssuingAuthority: e.target.value })} placeholder="ASCAP, BMI, PRS…" />
      </Field>
      <Field label="License Document URL">
        <input value={form.licenseDocumentUrl} onChange={(e) => patch({ licenseDocumentUrl: e.target.value })} placeholder="https://…" />
      </Field>
      <Field label="Issue Date">
        <input type="date" value={form.licenseIssuedAt} onChange={(e) => patch({ licenseIssuedAt: e.target.value })} />
      </Field>
      <Field label="Expiry Date" error={errors.licenseExpiresAt}>
        <input type="date" value={form.licenseExpiresAt} onChange={(e) => patch({ licenseExpiresAt: e.target.value })} />
      </Field>
    </div>
    <div className="fm-creator-check-row" style={{ marginTop: 12 }}>
      <label><input type="checkbox" checked={form.licenseCoversMusicBroadcast} onChange={(e) => patch({ licenseCoversMusicBroadcast: e.target.checked })} /> Music broadcast</label>
      <label><input type="checkbox" checked={form.licenseCoversTalkContent}    onChange={(e) => patch({ licenseCoversTalkContent: e.target.checked })} /> Talk content</label>
      <label><input type="checkbox" checked={form.licenseCoversLiveShows}      onChange={(e) => patch({ licenseCoversLiveShows: e.target.checked })} /> Live shows</label>
    </div>
  </div>
);

const WizardReview = ({ form }) => (
  <div className="fm-wizard-step-body">
    <h4>Review & Submit</h4>
    <p className="fm-wizard-sub">Check everything before creating your station.</p>
    <div className="fm-review-grid">
      <div className="fm-review-card">
        <h6><FiRadio /> Station</h6>
        <div className="fm-detail-row"><span>Name</span><strong>{form.name || '—'}</strong></div>
        <div className="fm-detail-row"><span>Genre</span><span>{form.genre}</span></div>
        <div className="fm-detail-row"><span>Band</span><span>{form.band}</span></div>
        <div className="fm-detail-row"><span>Format</span><span>{form.streamFormat.toUpperCase()} @ {form.bitrate}kbps</span></div>
        <div className="fm-detail-row"><span>Visibility</span><span>{form.visibility}</span></div>
      </div>
      <div className="fm-review-card">
        <h6><FiShield /> Licensing</h6>
        <div className="fm-detail-row"><span>License #</span><span>{form.licenseNumber || '—'}</span></div>
        <div className="fm-detail-row"><span>Authority</span><span>{form.licenseIssuingAuthority || '—'}</span></div>
        <div className="fm-detail-row"><span>Expires</span><span>{form.licenseExpiresAt || '—'}</span></div>
      </div>
      {form.isMonetized && (
        <div className="fm-review-card">
          <h6><FiDollarSign /> Monetization</h6>
          <div className="fm-detail-row"><span>Type</span><span>{form.monetizationType}</span></div>
          {form.subscriptionPrice && <div className="fm-detail-row"><span>Price</span><span>${form.subscriptionPrice}/mo</span></div>}
        </div>
      )}
    </div>
    <div className="fm-info-banner" style={{ marginTop: 12 }}>
      <FiInfo /> Your station will be created as a Draft. Submit it for review to go public. Approval takes 24–48 hours.
    </div>
  </div>
);

export default FMCreatorStudio;
