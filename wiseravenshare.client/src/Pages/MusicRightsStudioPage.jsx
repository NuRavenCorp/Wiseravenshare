import React, { useState, useEffect, useRef } from 'react';
import {
  FiUpload, FiShare2, FiPlay, FiPause, FiTrash2,
  FiMusic, FiShield, FiCheck, FiX, FiAlertCircle,
  FiLock, FiAward, FiFileText, FiExternalLink, FiInfo
} from 'react-icons/fi';
import { useAuth } from '../Contexts/AuthContext';
import { useNotification } from '../Contexts/NotificationContext';
import { shareMusic, buildMusicShareUrl, musicPlatformShare } from '../utils/musicShare';
import '../Styles/MusicRightsStudio.css';

// ─── Stripe Price IDs (from environment) ─────────────────────────────────────
// Uses per-interval price IDs so checkout can charge the correct billing cycle.
const STRIPE_PRICE_IDS = {
  basic: {
    monthly: import.meta.env.VITE_STRIPE_MUSIC_STUDIO_RIGHTS_BASIC_MONTHLY_PRICE_ID || '',
    annual: import.meta.env.VITE_STRIPE_MUSIC_STUDIO_RIGHTS_BASIC_ANNUAL_PRICE_ID || '',
  },
  standard: {
    monthly: import.meta.env.VITE_STRIPE_MUSIC_STUDIO_RIGHTS_STANDARD_MONTHLY_PRICE_ID || '',
    annual: import.meta.env.VITE_STRIPE_MUSIC_STUDIO_RIGHTS_STANDARD_ANNUAL_PRICE_ID || '',
  },
  pro: {
    monthly: import.meta.env.VITE_STRIPE_MUSIC_STUDIO_RIGHTS_PRO_MONTHLY_PRICE_ID || '',
    annual: import.meta.env.VITE_STRIPE_MUSIC_STUDIO_RIGHTS_PRO_ANNUAL_PRICE_ID || '',
  },
};

// ─── IP Protection Plans ──────────────────────────────────────────────────────
const PROTECTION_PLANS = [
  {
    id: 'basic',
    name: 'Basic Protection',
    price: '$4.99 / mo',
    annualPrice: '$49.99 / yr',
    badge: null,
    color: '#22c55e',
    stripeMonthlyPriceId: STRIPE_PRICE_IDS.basic.monthly,
    stripeAnnualPriceId: STRIPE_PRICE_IDS.basic.annual,
    features: [
      'Timestamped upload proof of creation',
      'SHA-256 cryptographic fingerprint stored per track',
      'WiseRavenShare rights registration record',
      'DMCA takedown request template & guidance',
      'Permanent proof-of-creation certificate (PDF)',
    ],
    ctaMonthly: 'Start Basic Monthly',
    ctaAnnual: 'Start Basic Annual',
  },
  {
    id: 'standard',
    name: 'Standard Protection',
    price: '$14.99 / mo',
    annualPrice: '$149.99 / yr',
    badge: 'Popular',
    color: '#3b82f6',
    stripeMonthlyPriceId: STRIPE_PRICE_IDS.standard.monthly,
    stripeAnnualPriceId: STRIPE_PRICE_IDS.standard.annual,
    features: [
      'Everything in Basic',
      'Cross-platform infringement monitoring (FB, TikTok, YouTube, IG)',
      'Automated takedown filing support',
      'Sync & mechanical licensing agreement templates',
      'Revenue split tracking for collaborators',
      'Streaming royalty registration guidance',
    ],
    ctaMonthly: 'Start Standard Monthly',
    ctaAnnual: 'Start Standard Annual',
  },
  {
    id: 'pro',
    name: 'Pro Protection',
    price: '$29.99 / mo',
    annualPrice: '$299.99 / yr',
    badge: 'Best Value',
    color: '#a855f7',
    stripeMonthlyPriceId: STRIPE_PRICE_IDS.pro.monthly,
    stripeAnnualPriceId: STRIPE_PRICE_IDS.pro.annual,
    features: [
      'Everything in Standard',
      'PRO (ASCAP / BMI / SESAC) registration guidance',
      'Master + publishing rights documentation',
      'Priority DMCA legal escalation support',
      'Custom licensing deal templates (sync, master, performance)',
      'Dedicated IP advisor on-call',
      'Monetization & licensing deal tracking dashboard',
    ],
    ctaMonthly: 'Start Pro Monthly',
    ctaAnnual: 'Start Pro Annual',
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

  // ── Register Original Track (paid feature) ─────────────────────────────────
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showPaymentGate,   setShowPaymentGate]   = useState(false);
  const [registering,       setRegistering]       = useState(false);
  const [registrationDoc,   setRegistrationDoc]   = useState(null);
  const [analysing,         setAnalysing]         = useState(false);
  const [regForm, setRegForm] = useState({
    title: '', artistName: '', album: '', genre: '', yearOfCreation: new Date().getFullYear(),
    bpm: '', musicalKey: '', isrc: '', label: '', coWriters: '', description: '',
    lyricsExcerpt: '', file: null, sha256Fingerprint: '', musicCharacterization: '',
    originalWorkConfirmed: false, rightsOwnerConfirmed: false,
  });
  const regFileInputRef = useRef(null);

  const openRegisterModal = () => {
    const token = localStorage.getItem('authToken');
    if (!token || !currentUser) {
      addToast('Please sign in to register a track.', 'warning');
      return;
    }
    // Always show payment gate first (user selects plan or skips if already paid)
    setShowPaymentGate(true);
  };

  const proceedToRegistration = () => {
    setShowPaymentGate(false);
    setShowRegisterModal(true);
  };

  // Web Audio API: analyse first 20 bars (~40 seconds at 120 BPM)
  const analyseFirst20Bars = async (file) => {
    setAnalysing(true);
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();

      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      const sampleRate = audioBuffer.sampleRate;
      const totalSamples = audioBuffer.length;
      // Analyse the first 40 seconds (covers ~20 bars at 120 BPM in 4/4)
      const analysisSamples = Math.min(totalSamples, sampleRate * 40);
      const channelData = audioBuffer.getChannelData(0).slice(0, analysisSamples);

      // RMS energy
      let sumSq = 0;
      for (let i = 0; i < channelData.length; i++) sumSq += channelData[i] ** 2;
      const rms = Math.sqrt(sumSq / channelData.length);
      const rmsDb = Math.round(20 * Math.log10(rms + 1e-10));

      // Zero crossing rate (higher = more percussive/noisy)
      let zcrCount = 0;
      for (let i = 1; i < channelData.length; i++) {
        if (channelData[i] * channelData[i - 1] < 0) zcrCount++;
      }
      const zcr = zcrCount / channelData.length;

      // Peak amplitude
      let peak = 0;
      for (let i = 0; i < channelData.length; i++) {
        if (Math.abs(channelData[i]) > peak) peak = Math.abs(channelData[i]);
      }
      const peakDb = Math.round(20 * Math.log10(peak + 1e-10));

      // FFT-based spectral centroid (brightness)
      const fftSize = 2048;
      const offlineCtx = new OfflineAudioContext(1, fftSize, sampleRate);
      const sourceNode = offlineCtx.createBufferSource();
      const fftBuffer = offlineCtx.createBuffer(1, fftSize, sampleRate);
      fftBuffer.copyToChannel(channelData.slice(0, fftSize), 0);
      sourceNode.buffer = fftBuffer;
      const analyserNode = offlineCtx.createAnalyser();
      analyserNode.fftSize = fftSize;
      sourceNode.connect(analyserNode);
      analyserNode.connect(offlineCtx.destination);
      sourceNode.start(0);
      await offlineCtx.startRendering();
      const freqData = new Uint8Array(analyserNode.frequencyBinCount);
      analyserNode.getByteFrequencyData(freqData);

      let weightedSum = 0, magSum = 0;
      for (let i = 0; i < freqData.length; i++) {
        const freq = (i * sampleRate) / fftSize;
        weightedSum += freq * freqData[i];
        magSum += freqData[i];
      }
      const spectralCentroid = magSum > 0 ? Math.round(weightedSum / magSum) : 0;

      // Sub-band energy ratios
      let subBass = 0, bass = 0, mid = 0, presence = 0, brilliance = 0;
      for (let i = 0; i < freqData.length; i++) {
        const freq = (i * sampleRate) / fftSize;
        const e = freqData[i];
        if (freq < 60)            subBass   += e;
        else if (freq < 250)      bass      += e;
        else if (freq < 2000)     mid       += e;
        else if (freq < 6000)     presence  += e;
        else                      brilliance += e;
      }
      const totalE = subBass + bass + mid + presence + brilliance || 1;
      const bassRatio      = Math.round((subBass + bass) / totalE * 100);
      const midRatio       = Math.round(mid / totalE * 100);
      const brillianceRatio = Math.round((presence + brilliance) / totalE * 100);

      // Classify texture
      const toneQuality = zcr < 0.02
        ? 'smooth / tonal'
        : zcr < 0.08
          ? 'balanced'
          : 'percussive / textured';

      const brightnessDesc = spectralCentroid < 800
        ? 'warm and low'
        : spectralCentroid < 2500
          ? 'balanced, full-range'
          : 'bright and airy';

      const dynamicRange = peakDb - rmsDb;
      const dynamicDesc = dynamicRange > 18 ? 'wide dynamic range' : dynamicRange > 10 ? 'moderate dynamics' : 'compressed / dense';

      const durationSec = Math.round(analysisSamples / sampleRate);
      const durationFmt = durationSec >= 60
        ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
        : `${durationSec}s`;

      await ctx.close();

      return [
        `Audio duration analysed: ${durationFmt} (first 20 bars / up to 40 seconds)`,
        `Texture: ${toneQuality} (zero-crossing rate: ${(zcr * 1000).toFixed(1)}/1000 samples)`,
        `Spectral character: ${brightnessDesc} (centroid: ${spectralCentroid} Hz)`,
        `Energy distribution: ${bassRatio}% bass · ${midRatio}% mids · ${brillianceRatio}% high-end`,
        `Volume level: RMS ${rmsDb} dBFS · Peak ${peakDb} dBFS · ${dynamicDesc}`,
        `Sample rate: ${sampleRate} Hz · Channels: ${audioBuffer.numberOfChannels}`,
      ].join('\n');
    } catch (err) {
      console.warn('Audio analysis failed:', err);
      return null;
    } finally {
      setAnalysing(false);
    }
  };

  const handleRegFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) { addToast('Please select an audio file.', 'error'); return; }

    // Auto-fill title/artist from filename
    const base = file.name.replace(/\.[^/.]+$/, '').replace(/[_]+/g, ' ').trim();
    const parts = base.split(/\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);
    const inferred = parts.length >= 2 ? { artistName: parts[0], title: parts[1] } : { title: base };

    // SHA-256 fingerprint
    let sha256Fingerprint = '';
    try {
      const buf  = await file.arrayBuffer();
      const hash = await crypto.subtle.digest('SHA-256', buf);
      sha256Fingerprint = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {}

    setRegForm((p) => ({ ...p, file, sha256Fingerprint, musicCharacterization: '', ...inferred }));
    addToast('File selected. Click "Analyse First 20 Bars" to generate the music characterization.', 'info');
  };

  const handleAnalyse = async () => {
    if (!regForm.file) { addToast('Select an audio file first.', 'warning'); return; }
    const result = await analyseFirst20Bars(regForm.file);
    if (result) {
      setRegForm((p) => ({ ...p, musicCharacterization: result }));
      addToast('Music characterization complete.', 'success');
    } else {
      addToast('Analysis could not be completed. You can describe the first 20 bars manually.', 'warning');
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!regForm.title.trim()) { addToast('Track title is required.', 'warning'); return; }
    if (!regForm.artistName.trim()) { addToast('Artist name is required.', 'warning'); return; }
    if (!regForm.originalWorkConfirmed || !regForm.rightsOwnerConfirmed) {
      addToast('Both declarations are required before registering.', 'error'); return;
    }

    setRegistering(true);
    try {
      const token = localStorage.getItem('authToken');
      const payload = {
        title:                 regForm.title.trim(),
        artistName:            regForm.artistName.trim(),
        album:                 regForm.album.trim() || null,
        genre:                 regForm.genre.trim() || null,
        yearOfCreation:        regForm.yearOfCreation ? Number(regForm.yearOfCreation) : null,
        bpm:                   regForm.bpm ? parseFloat(regForm.bpm) : null,
        musicalKey:            regForm.musicalKey.trim() || null,
        isrc:                  regForm.isrc.trim() || null,
        label:                 regForm.label.trim() || null,
        coWriters:             regForm.coWriters.trim() || null,
        description:           regForm.description.trim() || null,
        lyricsExcerpt:         regForm.lyricsExcerpt.trim() || null,
        musicCharacterization: regForm.musicCharacterization.trim() || null,
        sha256Fingerprint:     regForm.sha256Fingerprint || null,
      };

      const res = await fetch('/api/music-rights/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 402) {
        setShowRegisterModal(false);
        setShowPaymentGate(true);
        addToast('A paid Music Rights plan is required. Please select a plan.', 'info');
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addToast(err.message || 'Registration failed. Please try again.', 'error');
        return;
      }

      const data = await res.json();
      setRegistrationDoc(data);
      setShowRegisterModal(false);
      addToast(`✅ Track registered! ID: REG-${data.registrationId}`, 'success');
    } catch (err) {
      addToast(err?.message || 'Registration failed.', 'error');
    } finally {
      setRegistering(false);
    }
  };

  const downloadDocument = (htmlString, registrationId) => {
    const blob = new Blob([htmlString], { type: 'text/html; charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `WiseRaven-Registration-REG-${registrationId}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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


  const toBlobStreamUrl = (relativePath = '') => {
    const normalized = String(relativePath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized) return '';
    const encoded = normalized
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return encoded ? `/api/videostreaming/blob/${encoded}` : '';
  };

  const normalizePlaybackUrl = (value = '') => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    if (raw.startsWith('data:') || raw.startsWith('blob:')) {
      return raw;
    }

    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(raw)) {
      try {
        const parsed = new URL(raw);
        return `${parsed.pathname}${parsed.search}`;
      } catch {
        return raw;
      }
    }

    if (raw.startsWith('/')) return raw;
    if (raw.startsWith('api/')) return `/${raw}`;
    if (/^https?:\/\//i.test(raw)) return raw;
    return '';
  };

  const normalizeMusicTrack = (track) => {
    if (!track || typeof track !== 'object') return null;

    const fileName = String(track.fileName || track.FileName || '').trim();
    const relativePath = String(
      track.relativePath
      || track.RelativePath
      || track.objectKey
      || track.ObjectKey
      || ''
    ).trim();
    const directMediaUrl = normalizePlaybackUrl(
      track.mediaUrl
      || track.MediaUrl
      || track.url
      || track.Url
      || track.fileUrl
      || track.FileUrl
      || ''
    );

    const blobStreamUrl = toBlobStreamUrl(relativePath);
    const fileNameStreamUrl = fileName
      ? `/api/videostreaming/stream?fileName=${encodeURIComponent(fileName)}`
      : '';
    const mediaUrl = blobStreamUrl || fileNameStreamUrl || directMediaUrl;

    return {
      id: String(track.id || track.Id || `music_${Date.now()}_${Math.random().toString(16).slice(2)}`),
      title: String(track.title || track.Title || 'Untitled').trim(),
      artist: String(track.artist || track.Artist || '').trim(),
      album: String(track.album || track.Album || '').trim(),
      genre: String(track.genre || track.Genre || '').trim(),
      mediaUrl,
      url: mediaUrl,
      fileName,
      relativePath,
      uploadedAt: track.uploadedAt || track.UploadedAt || new Date().toISOString(),
      duration: String(track.duration || track.Duration || '0:00'),
      fingerprint: track.fingerprint || track.Fingerprint || null,
      protected: track.protected !== false,
    };
  };

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

  // ── Stripe Checkout Handler ────────────────────────────────────────
  const handleStripeCheckout = async (plan, interval = 'monthly') => {
    try {
      if (!currentUser) {
        addToast('Please sign in to purchase a plan', 'error');
        return;
      }

      const requestedInterval = interval === 'annual' ? 'annual' : 'monthly';
      const selectedPriceId = requestedInterval === 'annual'
        ? plan.stripeAnnualPriceId
        : plan.stripeMonthlyPriceId;

      if (!selectedPriceId) {
        addToast(`Plan not yet available for ${requestedInterval} billing.`, 'info');
        return;
      }

      if (!String(selectedPriceId).startsWith('price_')) {
        addToast('Stripe plan is misconfigured. Expected a Stripe Price ID (price_...).', 'error');
        return;
      }

      const origin = window.location.origin;
      const successUrl = `${origin}/?subscription=success`;
      const cancelUrl = `${origin}/?subscription=cancelled`;

      // Create Stripe Checkout Session via backend
      const response = await fetch('/api/billing/checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`
        },
        body: JSON.stringify({
          priceId: selectedPriceId,
          successUrl,
          cancelUrl
        })
      });

      if (!response.ok) {
        let message = 'Failed to create checkout session';
        try {
          const payload = await response.json();
          message = payload?.message || payload?.error || message;
        } catch {
          // Keep fallback message
        }
        addToast(message, 'error');
        return;
      }

      const payload = await response.json();

      const sessionId = payload?.sessionId || payload?.id;
      const checkoutUrl = payload?.url;

      if (checkoutUrl) {
        window.location.assign(checkoutUrl);
        return;
      }

      if (!sessionId) {
        addToast('Failed to create checkout session', 'error');
        return;
      }

      const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
      if (!publishableKey) {
        addToast('Stripe publishable key is missing for client redirect.', 'error');
        return;
      }

      // Redirect to Stripe Checkout
      const stripe = window.Stripe(publishableKey);
      if (stripe) {
        const { error } = await stripe.redirectToCheckout({ sessionId });
        if (error) {
          addToast(error.message, 'error');
        }
      } else {
        addToast('Unable to initialize Stripe checkout.', 'error');
      }
    } catch (error) {
      console.error('Stripe checkout error:', error);
      addToast(error?.message || 'Checkout failed. Please try again.', 'error');
    }
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
          if (res.ok) {
            const data = await res.json();
            const tracks = Array.isArray(data)
              ? data.map(normalizeMusicTrack).filter(Boolean)
              : [];
            setMusicLibrary(tracks);
            return;
          }
        } else {
          const stored = localStorage.getItem('wiseMusic_library');
          if (stored) {
            const tracks = JSON.parse(stored).map(normalizeMusicTrack).filter(Boolean);
            setMusicLibrary(tracks);
          }
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
        const normalizedUploadedTrack = normalizeMusicTrack(result?.track || result?.file || result || {});
        const newTrack = {
          id:          normalizedUploadedTrack?.id || result.mediaAssetId || `music_${Date.now()}`,
          title:       normalizedUploadedTrack?.title || uploadFormData.title || getBaseFileName(uploadFormData.file.name) || 'Untitled',
          artist:      normalizedUploadedTrack?.artist || uploadFormData.artist || '',
          album:       normalizedUploadedTrack?.album || uploadFormData.album  || '',
          genre:       normalizedUploadedTrack?.genre || uploadFormData.genre  || '',
          mediaUrl:    normalizedUploadedTrack?.mediaUrl || URL.createObjectURL(uploadFormData.file),
          url:         normalizedUploadedTrack?.mediaUrl || URL.createObjectURL(uploadFormData.file),
          relativePath: normalizedUploadedTrack?.relativePath || '',
          fileName:    normalizedUploadedTrack?.fileName || result.file?.fileName || uploadFormData.file.name,
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
          <button className="btn-primary" style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', border: 'none' }} onClick={openRegisterModal}>
            🛡️ Register Original Track
          </button>
          <button className="btn-primary" onClick={() => setShowUploadForm(!showUploadForm)}>
            <FiUpload /> Quick Upload
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
                <div className="plan-cta-row">
                  <button className="plan-cta"
                    onClick={() => { handleStripeCheckout(plan, 'monthly'); }}>
                    {plan.ctaMonthly}
                  </button>
                  <button className="plan-cta plan-cta-secondary"
                    onClick={() => { handleStripeCheckout(plan, 'annual'); }}>
                    {plan.ctaAnnual}
                  </button>
                </div>
              </div>
            ))}
          </div>
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
                    onClick={() => { setSelectedTrack(normalizeMusicTrack(track)); setPlayingTrackId(track.id); }}
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

      {/* ── Payment Gate Modal ─────────────────────────────────────────────── */}
      {showPaymentGate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9990, padding: '20px'
        }}>
          <div style={{
            background: 'linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,15,55,0.95))',
            border: '1px solid rgba(129,140,248,0.35)', borderRadius: '24px',
            padding: '32px', maxWidth: '780px', width: '100%', maxHeight: '85vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.55)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#e2e8f0', marginBottom: '4px' }}>
                  🛡️ Register Original Track
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                  Paid service · Timestamped ownership certificate with 20-bar music characterization
                </div>
              </div>
              <button type="button" onClick={() => setShowPaymentGate(false)}
                style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            <div style={{ background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.2)', borderRadius: '12px', padding: '14px', marginBottom: '20px', fontSize: '13px', color: '#cbd5e1' }}>
              📄 Your registration certificate will include: <strong>unique registration ID · server-stamped date &amp; time · all form fields · first-20-bar music analysis · SHA-256 fingerprint · ownership declaration</strong>. Download as an HTML document printable to PDF.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              {PROTECTION_PLANS.map((plan) => {
                const style = plan.id === 'standard' ? { border: '2px solid #3b82f6' } : { border: '1px solid rgba(129,140,248,0.25)' };
                return (
                  <div key={plan.id} style={{
                    background: 'rgba(15,23,42,0.7)', borderRadius: '16px',
                    padding: '18px', display: 'flex', flexDirection: 'column', gap: '8px',
                    ...style
                  }}>
                    {plan.badge && (
                      <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#38bdf8', background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)', padding: '2px 8px', borderRadius: '999px', alignSelf: 'flex-start' }}>
                        {plan.badge}
                      </span>
                    )}
                    <div style={{ fontWeight: 800, fontSize: '15px', color: '#e2e8f0' }}>{plan.name}</div>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#a5b4fc' }}>{plan.price}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>or {plan.annualPrice}</div>
                    <ul style={{ fontSize: '12px', color: '#cbd5e1', paddingLeft: '14px', margin: '4px 0', display: 'grid', gap: '4px' }}>
                      {plan.features.map((f) => <li key={f}>{f}</li>)}
                    </ul>
                    <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => handleStripeCheckout(plan, 'monthly')}
                        style={{ flex: 1, border: 'none', background: `linear-gradient(135deg,${plan.color},${plan.color}cc)`, color: '#fff', borderRadius: '8px', padding: '8px 10px', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}>
                        Monthly
                      </button>
                      <button type="button" onClick={() => handleStripeCheckout(plan, 'annual')}
                        style={{ flex: 1, border: `1px solid ${plan.color}55`, background: 'transparent', color: plan.color, borderRadius: '8px', padding: '8px 10px', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}>
                        Annual
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button type="button" onClick={proceedToRegistration}
                style={{ border: '1px solid rgba(129,140,248,0.4)', background: 'rgba(129,140,248,0.12)', color: '#a5b4fc', borderRadius: '10px', padding: '11px 24px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                I already have an active plan — Continue to Registration →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Registration Form Modal ────────────────────────────────────────── */}
      {showRegisterModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9991, padding: '16px'
        }}>
          <div style={{
            background: 'linear-gradient(135deg,rgba(15,23,42,0.99),rgba(30,15,55,0.96))',
            border: '1px solid rgba(129,140,248,0.3)', borderRadius: '24px',
            padding: '28px', maxWidth: '820px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#e2e8f0' }}>📋 Original Track Registration Form</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>All fields are included in the official ownership certificate.</div>
              </div>
              <button type="button" onClick={() => setShowRegisterModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            <form onSubmit={handleRegisterSubmit} style={{ display: 'grid', gap: '14px' }}>
              {/* File + Analysis */}
              <div style={{ background: 'rgba(129,140,248,0.07)', border: '1px solid rgba(129,140,248,0.2)', borderRadius: '12px', padding: '16px', display: 'grid', gap: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#a5b4fc', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Audio File &amp; 20-Bar Analysis</div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ flex: 1, minWidth: '180px' }}>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Audio File <span style={{ color: '#f87171' }}>*</span></div>
                    <input type="file" accept="audio/*" ref={regFileInputRef} onChange={handleRegFileSelect}
                      style={{ fontSize: '13px', color: '#e2e8f0', width: '100%' }} />
                  </label>
                  <button type="button" onClick={handleAnalyse} disabled={!regForm.file || analysing}
                    style={{
                      border: '1px solid rgba(16,185,129,0.45)', background: 'rgba(16,185,129,0.12)',
                      color: '#34d399', borderRadius: '10px', padding: '10px 16px', fontWeight: 700,
                      fontSize: '12px', cursor: regForm.file && !analysing ? 'pointer' : 'not-allowed',
                      opacity: !regForm.file || analysing ? 0.6 : 1, whiteSpace: 'nowrap'
                    }}>
                    {analysing ? '🔍 Analysing...' : '🎵 Analyse First 20 Bars'}
                  </button>
                </div>
                {regForm.sha256Fingerprint && (
                  <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    SHA-256: {regForm.sha256Fingerprint}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                    Music Characterization — First 20 Bars <span style={{ color: '#64748b' }}>(auto-filled by analysis or describe manually)</span>
                  </div>
                  <textarea value={regForm.musicCharacterization}
                    onChange={(e) => setRegForm((p) => ({ ...p, musicCharacterization: e.target.value }))}
                    rows={4} placeholder="Describe the opening 20 bars: tempo, key feel, instruments, mood, structure..."
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid rgba(129,140,248,0.25)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Track details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {[
                  { label: 'Track Title *', key: 'title', placeholder: 'My Original Song', required: true },
                  { label: 'Artist / Stage Name *', key: 'artistName', placeholder: 'Your Name', required: true },
                  { label: 'Album / Project', key: 'album', placeholder: 'Album name' },
                  { label: 'Genre', key: 'genre', placeholder: 'Hip-Hop, Jazz, Pop...' },
                  { label: 'Year of Creation', key: 'yearOfCreation', placeholder: '2025', type: 'number' },
                  { label: 'BPM / Tempo', key: 'bpm', placeholder: '120', type: 'number' },
                  { label: 'Musical Key', key: 'musicalKey', placeholder: 'C major / A minor' },
                  { label: 'ISRC Code', key: 'isrc', placeholder: 'CC-XXX-YY-NNNNN' },
                  { label: 'Label / Publisher', key: 'label', placeholder: 'Independent / Label name' },
                  { label: 'Co-writers', key: 'coWriters', placeholder: 'Full names of all co-writers' },
                ].map(({ label, key, placeholder, required, type }) => (
                  <label key={key} style={{ display: 'grid', gap: '4px' }}>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{label}</span>
                    <input
                      type={type || 'text'}
                      value={regForm[key] ?? ''}
                      onChange={(e) => setRegForm((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder={placeholder}
                      required={required}
                      style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid rgba(129,140,248,0.25)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '13px' }}
                    />
                  </label>
                ))}
              </div>

              {/* Description + lyrics */}
              {[
                { label: 'Description', key: 'description', placeholder: 'Brief description of the work, its inspiration, and intended use...', rows: 3 },
                { label: 'Lyrics Excerpt (First Verse / Hook)', key: 'lyricsExcerpt', placeholder: 'Include the opening lyrics as part of the ownership record...', rows: 4 },
              ].map(({ label, key, placeholder, rows }) => (
                <label key={key} style={{ display: 'grid', gap: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>{label}</span>
                  <textarea value={regForm[key] ?? ''} onChange={(e) => setRegForm((p) => ({ ...p, [key]: e.target.value }))}
                    rows={rows} placeholder={placeholder}
                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid rgba(129,140,248,0.25)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: '13px', resize: 'vertical' }} />
                </label>
              ))}

              {/* Declarations */}
              <div style={{ display: 'grid', gap: '10px', background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '10px', padding: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#fca5a5', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Required Declarations</div>
                {[
                  { key: 'originalWorkConfirmed', label: 'I confirm this track is my original creation and I hold or co-hold the master and publishing rights. I am not uploading a cover, remix, or sample of another artist\'s work without the required licenses.' },
                  { key: 'rightsOwnerConfirmed', label: 'I authorise WiseRavenShare to create a timestamped rights registration record, compute a cryptographic fingerprint, and include the information in an official ownership certificate.' },
                ].map(({ key, label }) => (
                  <label key={key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input type="checkbox" checked={regForm[key]} onChange={(e) => setRegForm((p) => ({ ...p, [key]: e.target.checked }))}
                      style={{ marginTop: '2px', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: '#cbd5e1' }}>{label}</span>
                  </label>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowRegisterModal(false)}
                  style={{ border: '1px solid var(--border-color)', background: 'transparent', color: '#94a3b8', borderRadius: '10px', padding: '11px 18px', cursor: 'pointer', fontWeight: 600 }}>
                  Cancel
                </button>
                <button type="submit" disabled={registering}
                  style={{ border: 'none', background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', borderRadius: '10px', padding: '11px 22px', fontWeight: 700, fontSize: '14px', cursor: registering ? 'wait' : 'pointer', opacity: registering ? 0.7 : 1 }}>
                  {registering ? '⏳ Registering...' : '🛡️ Generate Ownership Certificate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Registration Document View ─────────────────────────────────────── */}
      {registrationDoc && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9992, padding: '16px'
        }}>
          <div style={{
            background: '#fff', borderRadius: '16px', maxWidth: '940px', width: '100%',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)'
          }}>
            {/* Doc toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: '16px 16px 0 0', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#1e3a5f', fontSize: '14px' }}>
                  ✅ Ownership Certificate — REG-{registrationDoc.registrationId}
                </div>
                <div style={{ fontSize: '11px', color: '#718096', marginTop: '2px' }}>{registrationDoc.metadata?.title} · {registrationDoc.metadata?.artist}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button"
                  onClick={() => downloadDocument(registrationDoc.document, registrationDoc.registrationId)}
                  style={{ border: '1px solid #1e3a5f', background: '#1e3a5f', color: '#fff', borderRadius: '8px', padding: '7px 14px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                  ⬇ Download HTML
                </button>
                <button type="button"
                  onClick={() => window.print()}
                  style={{ border: '1px solid #4a5568', background: 'transparent', color: '#4a5568', borderRadius: '8px', padding: '7px 14px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                  🖨️ Print to PDF
                </button>
                <button type="button" onClick={() => setRegistrationDoc(null)}
                  style={{ border: '1px solid #e2e8f0', background: 'transparent', color: '#718096', borderRadius: '8px', padding: '7px 14px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            </div>
            {/* Iframe doc preview */}
            <iframe
              srcDoc={registrationDoc.document}
              title="Ownership Registration Certificate"
              style={{ flex: 1, border: 'none', borderRadius: '0 0 16px 16px' }}
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      )}

    </div>
  );
};

export default MusicRightsStudioPage;
