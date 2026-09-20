import React, { useEffect, useRef, useState } from 'react';
import { FiChevronRight, FiRefreshCw, FiPlay, FiHeart, FiBookmark, FiUsers } from 'react-icons/fi';
import {
  getCountries,
  getPopularTags,
  getStationsByRegionAndGenre
} from '../../Services/fmService';

// ─── Step indicators ──────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'Region' },
  { id: 2, label: 'Genre' },
  { id: 3, label: 'Stations' }
];

const StepBar = ({ activeStep, onStepClick }) => (
  <div className="fmb-steps">
    {STEPS.map((step, i) => (
      <React.Fragment key={step.id}>
        <button
          type="button"
          className={`fmb-step${activeStep === step.id ? ' active' : ''}${activeStep > step.id ? ' done' : ''}`}
          onClick={() => activeStep > step.id && onStepClick(step.id)}
          disabled={activeStep <= step.id}
          aria-label={`Go back to ${step.label}`}
        >
          <span className="fmb-step-num">{activeStep > step.id ? '✓' : step.id}</span>
          <span className="fmb-step-label">{step.label}</span>
        </button>
        {i < STEPS.length - 1 && <FiChevronRight className="fmb-step-sep" />}
      </React.Fragment>
    ))}
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────
const FMBrowser = ({ onPlay, onLike, onBookmark }) => {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1 — countries
  const [countries, setCountries] = useState([]);
  const [countryFilter, setCountryFilter] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(null); // { name, iso, stationCount }

  // Step 2 — tags
  const [tags, setTags] = useState([]);
  const [tagFilter, setTagFilter] = useState('');
  const [selectedTag, setSelectedTag] = useState(null); // { name, stationCount }

  // Step 3 — stations
  const [stations, setStations] = useState([]);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // ── Step 1: load countries on mount ─────────────────────────────────────────
  useEffect(() => {
    setIsLoading(true);
    setError('');
    getCountries(250).then((data) => {
      if (!mountedRef.current) return;
      setCountries(data);
      setIsLoading(false);
    }).catch(() => {
      if (!mountedRef.current) return;
      setError('Could not load country list. Check your connection and retry.');
      setIsLoading(false);
    });
  }, []);

  // ── Step 1 → Step 2: pick a country ──────────────────────────────────────────
  const handleSelectCountry = async (country) => {
    setSelectedCountry(country);
    setTagFilter('');
    setSelectedTag(null);
    setStep(2);
    setIsLoading(true);
    setError('');
    try {
      const data = await getPopularTags(country.iso, 60);
      if (!mountedRef.current) return;
      setTags(data);
    } catch {
      if (!mountedRef.current) return;
      setError('Could not load genres for this region.');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  // ── Step 2 → Step 3: pick a genre tag ────────────────────────────────────────
  const handleSelectTag = async (tag) => {
    setSelectedTag(tag);
    setStep(3);
    setIsLoading(true);
    setError('');
    try {
      const data = await getStationsByRegionAndGenre({
        countrycode: selectedCountry?.iso || '',
        tag: tag.name,
        limit: 40
      });
      if (!mountedRef.current) return;
      setStations(data);
    } catch {
      if (!mountedRef.current) return;
      setError('Could not load stations for this genre.');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  // ── Retry / refresh ───────────────────────────────────────────────────────────
  const retry = () => {
    if (step === 3 && selectedTag) handleSelectTag(selectedTag);
    else if (step === 2 && selectedCountry) handleSelectCountry(selectedCountry);
    else {
      setStep(1);
      setCountries([]);
      setIsLoading(true);
      getCountries(250).then((data) => {
        if (!mountedRef.current) return;
        setCountries(data);
        setIsLoading(false);
      }).catch(() => {
        if (!mountedRef.current) return;
        setIsLoading(false);
      });
    }
  };

  // ── Visible filtered lists ────────────────────────────────────────────────────
  const visibleCountries = countryFilter
    ? countries.filter((c) => c.name.toLowerCase().includes(countryFilter.toLowerCase()) ||
        c.iso.toLowerCase().includes(countryFilter.toLowerCase()))
    : countries;

  const visibleTags = tagFilter
    ? tags.filter((t) => t.name.toLowerCase().includes(tagFilter.toLowerCase()))
    : tags;

  return (
    <div className="fmb-root">
      <StepBar activeStep={step} onStepClick={setStep} />

      {/* ── Breadcrumb ── */}
      <div className="fmb-crumb">
        {selectedCountry && <span className="fmb-crumb-item">🌍 {selectedCountry.name}</span>}
        {selectedTag && (
          <>
            <FiChevronRight className="fmb-crumb-sep" />
            <span className="fmb-crumb-item">🎵 {selectedTag.name}</span>
          </>
        )}
      </div>

      {error && (
        <div className="fmb-error">
          {error}
          <button type="button" className="fm-btn" onClick={retry} style={{ marginLeft: 10 }}>
            <FiRefreshCw style={{ marginRight: 4 }} />Retry
          </button>
        </div>
      )}

      {isLoading && (
        <div className="fmb-loading">
          <div className="fmb-spinner" />
          {step === 1 && 'Loading regions…'}
          {step === 2 && `Loading genres for ${selectedCountry?.name || '…'}`}
          {step === 3 && `Finding ${selectedTag?.name} stations…`}
        </div>
      )}

      {/* ── Step 1: Country grid ── */}
      {!isLoading && step === 1 && (
        <>
          <input
            type="text"
            className="fmb-filter"
            placeholder="Filter by country name or code…"
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
          />
          <div className="fmb-country-grid">
            {visibleCountries.map((country) => (
              <button
                key={country.iso || country.name}
                type="button"
                className="fmb-country-btn"
                onClick={() => handleSelectCountry(country)}
              >
                <span className="fmb-country-name">{country.name}</span>
                <span className="fmb-country-count">{country.stationCount.toLocaleString()} stations</span>
              </button>
            ))}
            {visibleCountries.length === 0 && !error && (
              <p className="fmb-empty">No regions match your filter.</p>
            )}
          </div>
        </>
      )}

      {/* ── Step 2: Genre tag cloud ── */}
      {!isLoading && step === 2 && (
        <>
          <input
            type="text"
            className="fmb-filter"
            placeholder="Filter genres…"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          />
          <div className="fmb-tag-cloud">
            {visibleTags.map((tag) => (
              <button
                key={tag.name}
                type="button"
                className="fmb-tag-btn"
                onClick={() => handleSelectTag(tag)}
              >
                {tag.name}
                <span className="fmb-tag-count">{tag.stationCount.toLocaleString()}</span>
              </button>
            ))}
            {visibleTags.length === 0 && !error && (
              <p className="fmb-empty">No genres available for this region.</p>
            )}
          </div>
        </>
      )}

      {/* ── Step 3: Station list ── */}
      {!isLoading && step === 3 && (
        <div className="fmb-station-list">
          {stations.map((station) => (
            <div key={station.id} className="fmb-station-row">
              <div className="fmb-station-logo">
                {station.logoUrl
                  ? <img src={station.logoUrl} alt={station.name} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  : <span>📻</span>}
              </div>
              <div className="fmb-station-info">
                <strong>{station.name}</strong>
                <small>{station.genre} • {station.country}</small>
                {station.bitrate > 0 && <small>{station.bitrate} kbps {station.codec}</small>}
              </div>
              <div className="fmb-station-actions">
                <span className="fmb-listeners"><FiUsers /> {station.listeners.toLocaleString()}</span>
                <button type="button" className="fm-icon-btn play" onClick={() => onPlay?.(station)} aria-label={`Play ${station.name}`}><FiPlay /></button>
                <button type="button" className={`fm-icon-btn ${station.isLiked ? 'active' : ''}`} onClick={() => onLike?.(station.id)} aria-label="Like"><FiHeart /></button>
                <button type="button" className={`fm-icon-btn ${station.isBookmarked ? 'active' : ''}`} onClick={() => onBookmark?.(station.id)} aria-label="Bookmark"><FiBookmark /></button>
              </div>
            </div>
          ))}
          {stations.length === 0 && !error && (
            <p className="fmb-empty">No active stations found for this combination.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default FMBrowser;
