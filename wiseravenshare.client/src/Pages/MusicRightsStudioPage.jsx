import React, { useState, useEffect, useRef } from 'react';
import {
  FiUpload, FiShare2, FiPlay, FiPause, FiTrash2,
  FiMusic, FiShield, FiCheck, FiX, FiAlertCircle,
  FiLock, FiAward, FiFileText, FiExternalLink, FiInfo
} from 'react-icons/fi';
import { useAuth } from '../Contexts/AuthContext';
import { useNotification } from '../Contexts/NotificationContext';
import { shareMusic, buildMusicShareUrl, musicPlatformShare } from '../utils/musicShare';
import AudioPlayer from '../Components/Ravensight/AudioPlayer';
import '../Styles/MusicRightsStudio.css';

// ─── IP Protection Plans ──────────────────────────────────────────────────────
const PROTECTION_PLANS = [
  {
    id: 'basic',
    name: 'Basic Protection',
    price: '$4.99 / mo',
    annualPrice: '$49.99 / yr',
    badge: null,
    color: '#22c55e',
    features: [
      'Timestamped upload proof of creation',
      'SHA-256 cryptographic fingerprint stored per track',
      'WiseRavenShare rights registration record',
      'DMCA takedown request template & guidance',
      'Permanent proof-of-creation certificate (PDF)',
    ],
    cta: 'Start Basic',
  },
  {
    id: 'standard',
    name: 'Standard Protection',
    price: '$14.99 / mo',
    annualPrice: '$149.99 / yr',
    badge: 'Popular',
    color: '#3b82f6',
    features: [
      'Everything in Basic',
      'Cross-platform infringement monitoring (FB, TikTok, YouTube, IG)',
      'Automated takedown filing support',
      'Sync & mechanical licensing agreement templates',
      'Revenue split tracking for collaborators',
      'Streaming royalty registration guidance',
    ],
    cta: 'Start Standard',
  },
  {
    id: 'pro',
    name: 'Pro Protection',
    price: '$29.99 / mo',
    annualPrice: '$299.99 / yr',
    badge: 'Best Value',
    color: '#a855f7',
    features: [
      'Everything in Standard',
      'PRO (ASCAP / BMI / SESAC) registration guidance',
      'Master + publishing rights documentation',
      'Priority DMCA legal escalation support',
      'Custom licensing deal templates (sync, master, performance)',
      'Dedicated IP advisor on-call',
      'Monetization & licensing deal tracking dashboard',
    ],
    cta: 'Start Pro',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
const MusicRightsStudioPage = ({ onNavigate, user: propUser }) => {
  const { user } = useAuth();
  const { addToast } = useNotification();
  const currentUser = propUser || user;

  const [musicLibrary,   setMusicLibrary]  = useState([]);
  const [uploading,      setUploading]     = useState(false);
  const [showUploadForm, setShowUploadForm]= useState(false);
  const [playingTrackId, setPlayingTrackId]= useState(null);
  const [selectedTrack,  setSelectedTrack] = useState(null);
  const [shareMenuOpen,  setShareMenuOpen] = useState(null);
  const [sharingTrackId, setSharingTrackId]= useState(null);
  const [showIPInfo,     setShowIPInfo]    = useState(false);

  const [uploadFormData, setUploadFormData] = useState({
    title: '', artist: '', album: '', genre: '', file: null,
    originalWorkConfirmed: false,
    rightsOwnerConfirmed: false,
  });
  const [detectedDuration, setDetectedDuration] = useState('0:00');

  const fileInputRef = useRef(null);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getBaseFileName = (n = '') => n.replace(/\.[^/.]+$/, '').trim();
  const normalizeText   = (v = '') => v.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();

  const inferFromFileName = (fileName = '') => {
    const base  = normalizeText(getBaseFileName(fileName));
    const parts = base.split(/\s*[-–—]\s*/).map(p => normalizeText(p)).filter(Boolean);
    if (parts.length >= 2) return { artist: parts[0], title: parts[1], album: parts[2] || '' };
    return { title: base, artist: '', album: '' };
  };

  const fmtDuration = (s) => {
    if (!isFinite(s) || s <= 0) return '0:00';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
      : `${m}:${String(sec).padStart(2,'0')}`;
  };

  const readDuration = (file) => new Promise(res => {
    const a = document.createElement('audio');
    const url = URL.createObjectURL(file);
    a.preload = 'metadata';
    a.onloadedmetadata = () => { URL.revokeObjectURL(url); a.src = ''; res(fmtDuration(a.duration)); };
    a.onerror = () => { URL.revokeObjectURL(url); res('0:00'); };
    a.src = url;
  });

  // SHA-256 fingerprint of file bytes
  const fingerprint = async (file) => {
    try {
      const buf  = await file.arrayBuffer();
      const hash = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
    } catch { return null; }
  };

  // ── Load library ───────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('authToken');
        if (token) {
          const res = await fetch('/api/ravensight/media/music', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) setMusicLibrary(Array.isArray(await res.json()) ? await res.json() : []);
        } else {
          const stored = localStorage.getItem('wiseMusic_library');
          if (stored) setMusicLibrary(JSON.parse(stored));
        }
      } catch { setMusicLibrary([]); }
    })();
  }, []);

  useEffect(() => {
    if (musicLibrary.length > 0)
      localStorage.setItem('wiseMusic_library', JSON.stringify(musicLibrary));
  }, [musicLibrary]);

  // ── File select ────────────────────────────────────────────────────────────
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      addToast('Please select an audio file', 'error');
      return;
    }
    const info     = inferFromFileName(file.name);
    const duration = await readDuration(file);
    setUploadFormData(p => ({ ...p, file, ...info, genre: p.genre }));
    setDetectedDuration(duration);
    if (info.title || info.artist) addToast('Track info autofilled from filename', 'info');
  };

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadFormData.file) { addToast('Select a file first', 'warning'); return; }
    if (!uploadFormData.originalWorkConfirmed || !uploadFormData.rightsOwnerConfirmed) {
      addToast('You must confirm this is your original work before uploading', 'error');
      return;
    }

    setUploading(true);
    try {
      // Compute fingerprint locally before upload
      const fp = await fingerprint(uploadFormData.file);

      const formData = new FormData();
      formData.append('file',              uploadFormData.file);
      formData.append('title',             uploadFormData.title || getBaseFileName(uploadFormData.file.name));
      formData.append('artist',            uploadFormData.artist || '');
      formData.append('album',             uploadFormData.album  || '');
      formData.append('genre',             uploadFormData.genre  || '');
      formData.append('destinationFolder', '/wiseravenshare/ravensight/music');
      if (fp) formData.append('fingerprint', fp);

      const token = localStorage.getItem('authToken');
      const res   = await fetch('/api/ravensight/media/music/save', {
        method:  'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body:    formData,
      });

      if (res.ok) {
        const result = await res.json();
        const newTrack = {
          id:          `music_${Date.now()}`,
          title:       uploadFormData.title || getBaseFileName(uploadFormData.file.name) || 'Untitled',
          artist:      uploadFormData.artist || '',
          album:       uploadFormData.album  || '',
          genre:       uploadFormData.genre  || '',
          mediaUrl:    result.file?.mediaUrl || URL.createObjectURL(uploadFormData.file),
          fileName:    result.file?.fileName || uploadFormData.file.name,
          uploadedAt:  new Date().toISOString(),
          duration:    detectedDuration,
          fingerprint: fp,
          protected:   true,
        };
        setMusicLibrary(lib => [newTrack, ...lib]);
        setUploadFormData({ title:'', artist:'', album:'', genre:'', file:null,
          originalWorkConfirmed: false, rightsOwnerConfirmed: false });
        setDetectedDuration('0:00');
        setShowUploadForm(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        addToast('✅ Track uploaded & protection record created', 'success');
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.message || 'Upload failed', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  // ── Share ──────────────────────────────────────────────────────────────────
  const handleShare = async (track, opts = {}) => {
    setSharingTrackId(track.id);
    try {
      await shareMusic({ track, currentUser, ...opts,
        onNotification: (m, t) => addToast(m, t) });
      setShareMenuOpen(null);
    } catch { addToast('Share failed', 'error'); }
    finally  { setSharingTrackId(null); }
  };

  const handlePlatformShare = (track, platform) => {
    const url = buildMusicShareUrl(track, currentUser);
    const msg = `🎵 ${track.artist} — ${track.title}${track.album ? ` (${track.album})` : ''}`;
    if (musicPlatformShare[platform]) musicPlatformShare[platform]({ message: msg, url, track });
    setShareMenuOpen(null);
  };

  const handleDelete = (id) => {
    if (confirm('Delete this track and its protection record?')) {
      setMusicLibrary(lib => lib.filter(t => t.id !== id));
      addToast('Track deleted', 'success');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  const canUpload = uploadFormData.originalWorkConfirmed && uploadFormData.rightsOwnerConfirmed && uploadFormData.file;

  return (
    <div className="mrs-page">

      {/* ── Page Header ── */}
      <div className="mrs-header">
        <div className="mrs-header-left">
          <h1><FiShield /> Music Rights Studio</h1>
          <p className="mrs-subtitle">
            <FiLock size={12} /> For original creations only — upload, register, and protect your intellectual property
          </p>
        </div>
        <div className="mrs-header-actions">
          <button className="btn-outline" onClick={() => setShowIPInfo(!showIPInfo)}>
            <FiInfo /> How IP Protection Works
          </button>
          <button className="btn-outline" onClick={() => onNavigate('music-player')}>
            <FiPlay /> Open Studio Player
          </button>
          <button className="btn-primary" onClick={() => setShowUploadForm(!showUploadForm)}>
            <FiUpload /> Register New Track
          </button>
        </div>
      </div>

      {/* ── IP Info Accordion ── */}
      {showIPInfo && (
        <div className="mrs-ip-info">
          <div className="ip-intro">
            <h2>Your Music. Your Rights. Protected.</h2>
            <p>
              WiseRavenShare Music Rights Studio is exclusively for <strong>original compositions and recordings</strong>.
              When you upload here, we create an immutable, timestamped record of your creation — a legal anchor that
              establishes your ownership under the U.S. Copyright Act (17 U.S.C. § 102) and international Berne Convention.
            </p>
          </div>

          <div className="ip-how-it-works">
            <h3>How We Protect Your Work</h3>
            <div className="ip-steps">
              {[
                {
                  icon: <FiUpload />,
                  title: 'Upload & Fingerprint',
                  desc: 'Every file is hashed with SHA-256 on upload, creating a unique cryptographic fingerprint tied to your account and upload timestamp.',
                },
                {
                  icon: <FiFileText />,
                  title: 'Rights Record Created',
                  desc: 'A rights registration record is created in the WiseRavenShare database logging your identity, upload time, and file fingerprint as proof of creation.',
                },
                {
                  icon: <FiShield />,
                  title: 'Monitoring & Enforcement',
                  desc: 'Standard & Pro plans continuously scan Facebook, TikTok, YouTube, and Instagram for unauthorised use of your content and initiate DMCA takedowns on your behalf.',
                },
                {
                  icon: <FiAward />,
                  title: 'Licensing & Revenue',
                  desc: 'Pro plan users receive licensing agreement templates, PRO registration guidance (ASCAP/BMI/SESAC), and a deal-tracking dashboard for sync and performance royalties.',
                },
              ].map(s => (
                <div key={s.title} className="ip-step">
                  <div className="ip-step-icon">{s.icon}</div>
                  <div>
                    <strong>{s.title}</strong>
                    <p>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="ip-disclaimer">
            <FiAlertCircle />
            <p>
              <strong>Important:</strong> WiseRavenShare rights records supplement — but do not replace — formal copyright registration
              with the U.S. Copyright Office (<a href="https://www.copyright.gov" target="_blank" rel="noopener noreferrer">copyright.gov <FiExternalLink size={10}/></a>).
              For the strongest legal protection, we recommend filing formal registration for commercially released works.
              Our protection services provide evidence of creation date and ownership — consult an IP attorney for legal disputes.
            </p>
          </div>

          {/* ── Pricing ── */}
          <h3 className="plans-title">IP Protection Plans</h3>
          <div className="plans-grid">
            {PROTECTION_PLANS.map(plan => (
              <div key={plan.id} className={`plan-card ${plan.badge ? 'plan-featured' : ''}`}
                style={{ '--plan-color': plan.color }}>
                {plan.badge && <span className="plan-badge">{plan.badge}</span>}
                <div className="plan-name">{plan.name}</div>
                <div className="plan-price">{plan.price}</div>
                <div className="plan-annual">or {plan.annualPrice} (save 17%)</div>
                <ul className="plan-features">
                  {plan.features.map(f => (
                    <li key={f}><FiCheck className="check-icon" /> {f}</li>
                  ))}
                </ul>
                <button className="plan-cta"
                  onClick={() => { addToast(`${plan.name} — subscription flow coming soon`, 'info'); }}>
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Audio Preview Player ── */}
      {selectedTrack && (
        <div className="mrs-player-wrap">
          <AudioPlayer track={selectedTrack} showVisualizer
            onEnded={() => setSelectedTrack(null)}
            onError={() => { addToast('Playback error', 'error'); setSelectedTrack(null); }}
          />
        </div>
      )}

      {/* ── Upload / Register Form ── */}
      {showUploadForm && (
        <div className="mrs-upload-card">
          <div className="mrs-upload-header">
            <h3><FiShield /> Register Original Track</h3>
            <button className="icon-btn" onClick={() => setShowUploadForm(false)}><FiX /></button>
          </div>

          {/* Original Works Declaration */}
          <div className="mrs-declaration">
            <div className="declaration-icon"><FiLock size={20} /></div>
            <div>
              <strong>Original Works Only</strong>
              <p>
                This service is exclusively for tracks you created. Uploading music you do not own
                violates copyright law and WiseRavenShare's Terms of Service, and may result in
                immediate account suspension and DMCA counter-claims against you.
              </p>
            </div>
          </div>

          <form onSubmit={handleUpload} className="mrs-upload-form">
            {/* File picker */}
            <div className="form-group">
              <label>Audio File <span className="req">*</span></label>
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="audio/*" />
              {uploadFormData.file && (
                <span className="file-hint">
                  <FiCheck size={12} /> {uploadFormData.file.name}
                  {detectedDuration !== '0:00' && ` · ${detectedDuration}`}
                </span>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Track Title <span className="req">*</span></label>
                <input type="text" placeholder="My Original Song"
                  value={uploadFormData.title}
                  onChange={e => setUploadFormData(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Artist / Stage Name <span className="req">*</span></label>
                <input type="text" placeholder="Your Name"
                  value={uploadFormData.artist}
                  onChange={e => setUploadFormData(p => ({ ...p, artist: e.target.value }))} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Album / Project</label>
                <input type="text" placeholder="Album name (optional)"
                  value={uploadFormData.album}
                  onChange={e => setUploadFormData(p => ({ ...p, album: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Genre</label>
                <input type="text" placeholder="Genre (optional)"
                  value={uploadFormData.genre}
                  onChange={e => setUploadFormData(p => ({ ...p, genre: e.target.value }))} />
              </div>
            </div>

            {/* Consent checkboxes */}
            <div className="mrs-consents">
              <label className="consent-check">
                <input type="checkbox"
                  checked={uploadFormData.originalWorkConfirmed}
                  onChange={e => setUploadFormData(p => ({ ...p, originalWorkConfirmed: e.target.checked }))} />
                <span>
                  I confirm this track is my <strong>original creation</strong> and I hold the master and
                  publishing rights. I am not uploading a cover, remix, or sample of another artist's work
                  without the required licenses.
                </span>
              </label>
              <label className="consent-check">
                <input type="checkbox"
                  checked={uploadFormData.rightsOwnerConfirmed}
                  onChange={e => setUploadFormData(p => ({ ...p, rightsOwnerConfirmed: e.target.checked }))} />
                <span>
                  I authorise WiseRavenShare to create a timestamped rights registration record, compute
                  a cryptographic fingerprint of this file, and use it to enforce my IP rights on my behalf.
                </span>
              </label>
            </div>

            <button type="submit" className={`btn-primary submit-btn ${!canUpload ? 'disabled' : ''}`}
              disabled={!canUpload || uploading}>
              {uploading
                ? <><div className="btn-spinner" /> Uploading & registering…</>
                : <><FiShield /> Upload & Register IP</>}
            </button>
          </form>
        </div>
      )}

      {/* ── Track Library ── */}
      <div className="mrs-library">
        <h2>Your Protected Tracks</h2>

        {musicLibrary.length === 0 ? (
          <div className="mrs-empty">
            <FiMusic size={48} />
            <p>No original tracks registered yet.</p>
            <button className="btn-primary" onClick={() => setShowUploadForm(true)}>
              <FiUpload /> Register Your First Track
            </button>
          </div>
        ) : (
          <div className="mrs-track-list">
            {musicLibrary.map(track => (
              <div key={track.id} className="mrs-track">
                {/* Protection badge */}
                <div className="track-shield" title="IP Protected">
                  <FiShield size={14} />
                </div>

                <div className="track-info">
                  <div className="track-title">{track.title}</div>
                  <div className="track-meta">
                    {track.artist && <span>{track.artist}</span>}
                    {track.album  && <><span className="sep">·</span><span>{track.album}</span></>}
                    {track.genre  && <><span className="sep">·</span><span>{track.genre}</span></>}
                    <span className="sep">·</span>
                    <span>{track.duration || '—'}</span>
                  </div>
                  <div className="track-fp">
                    <FiLock size={10} />
                    {track.fingerprint
                      ? <span className="fp-hash" title={track.fingerprint}>
                          SHA-256 · {track.fingerprint.slice(0, 12)}…
                        </span>
                      : <span className="fp-none">No fingerprint</span>}
                    <span className="fp-date">
                      Registered {new Date(track.uploadedAt).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })}
                    </span>
                  </div>
                </div>

                <div className="track-actions">
                  {/* Play */}
                  <button className="action-btn"
                    onClick={() => { setSelectedTrack(track); setPlayingTrackId(track.id); }}
                    title="Preview">
                    {playingTrackId === track.id && selectedTrack?.id === track.id
                      ? <FiPause /> : <FiPlay />}
                  </button>

                  {/* Share */}
                  <div className="share-wrap">
                    <button className="action-btn"
                      onClick={() => setShareMenuOpen(shareMenuOpen === track.id ? null : track.id)}
                      disabled={sharingTrackId === track.id}
                      title="Share">
                      <FiShare2 />
                    </button>
                    {shareMenuOpen === track.id && (
                      <div className="share-menu">
                        {[
                          { label: 'Copy Link',  fn: () => handleShare(track) },
                          { label: '📘 Facebook', fn: () => handlePlatformShare(track,'facebook') },
                          { label: '𝕏 X / Twitter', fn: () => handlePlatformShare(track,'twitter') },
                          { label: '💬 WhatsApp', fn: () => handlePlatformShare(track,'whatsapp') },
                          { label: '📧 Email',   fn: () => handlePlatformShare(track,'email') },
                        ].map(item => (
                          <button key={item.label} className="share-item" onClick={item.fn}>
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Delete */}
                  <button className="action-btn danger" onClick={() => handleDelete(track.id)} title="Delete">
                    <FiTrash2 />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MusicRightsStudioPage;
