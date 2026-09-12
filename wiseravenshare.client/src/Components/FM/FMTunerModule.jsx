import React, { useEffect, useMemo, useRef, useState } from 'react';
import FMSearch from './FMSearch';
import FMStationList from './FMStationList';
import FMNowPlaying from './FMNowPlaying';
import FMPlayer from './FMPlayer';
import FMCreatorStudio from './FMCreatorStudio';
import FMBrowser from './FMBrowser';
import FMScanner from './FMScanner';
import { fmService, GENRE_PRESETS, scanByGenre, trackRadioBrowserClick } from '../../Services/fmService';
import { useAuth } from '../../Contexts/AuthContext';
import '../../Styles/FMTunerModule.css';

const tabs = [
  { id: 'stations', label: 'Stations' },
  { id: 'scanner',  label: '📡 Scanner' },
  { id: 'browse',   label: '🌍 Browse' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'history',  label: 'History' },
  { id: 'discover', label: 'Discover' },
  { id: 'creator',  label: 'Creator Studio' }
];

const resolveDefaultPinRegion = (location) => {
  const raw = String(location || '').trim();
  if (!raw) return 'NYC';
  const upper = raw.toUpperCase();
  if (upper.includes('NEW YORK') || upper.includes('NYC')) return 'NYC';
  const firstToken = raw.split(',')[0]?.trim();
  return firstToken || 'NYC';
};

const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isGuid = (value) => GUID_REGEX.test(String(value || '').trim());

const FM_LOW = 88.0;
const FM_HIGH = 108.0;

const parseStationFrequency = (station) => {
  const candidates = [station?.frequency, station?.name, station?.displayName];
  for (const candidate of candidates) {
    const raw = String(candidate || '').trim();
    if (!raw) continue;
    const match = raw.match(/(\d{2,3}(?:\.\d)?)/);
    if (!match) continue;
    const parsed = Number.parseFloat(match[1]);
    if (!Number.isFinite(parsed)) continue;
    if (parsed >= FM_LOW && parsed <= FM_HIGH) {
      return parsed;
    }
  }
  return null;
};

const FMTunerModule = ({ onFrequencyChange }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('stations');
  const [isLoading, setIsLoading] = useState(false);
  const [activeGenre, setActiveGenre] = useState('all');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStation, setCurrentStation] = useState(null);
  const [stations, setStations] = useState([]);
  const [featuredStations, setFeaturedStations] = useState([]);
  const [popularStations, setPopularStations] = useState([]);
  const [recommendedStations, setRecommendedStations] = useState([]);
  const [favoriteStations, setFavoriteStations] = useState([]);
  const [historyStations, setHistoryStations] = useState([]);
  const [pinFrequency, setPinFrequency] = useState('107.5');
  const [pinRegion, setPinRegion] = useState(() => resolveDefaultPinRegion(user?.location));
  const [pinFeedback, setPinFeedback] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const listeningStartRef = useRef(0);

  useEffect(() => {
    setPinRegion((prev) => {
      if (String(prev || '').trim().length > 0) {
        return prev;
      }
      return resolveDefaultPinRegion(user?.location);
    });
  }, [user?.location]);

  const loadStations = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const [featuredResult, popularResult, recommendedResult] = await Promise.allSettled([
        fmService.getFeaturedStations(12),
        fmService.getPopularStations(12),
        fmService.getRecommendedStations(12)
      ]);
      const featured = featuredResult.status === 'fulfilled' ? featuredResult.value : [];
      const popular = popularResult.status === 'fulfilled' ? popularResult.value : [];
      const recommended = recommendedResult.status === 'fulfilled' ? recommendedResult.value : [];

      setFeaturedStations(featured);
      setPopularStations(popular);
      setRecommendedStations(recommended);
      setStations(featured.length > 0 ? featured : popular);

      if (featured.length === 0 && popular.length === 0) {
        throw new Error('Failed to load FM stations.');
      }
    } catch (error) {
      setErrorMessage(error?.message || 'Failed to load FM stations.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPersonalLists = async () => {
    try {
      const [liked, bookmarked, history] = await Promise.all([
        fmService.getLikedStations(),
        fmService.getBookmarkedStations(),
        fmService.getListeningHistory(50)
      ]);
      const mergedFavorites = [...liked];
      for (const station of bookmarked) {
        if (!mergedFavorites.some((item) => item.id === station.id)) {
          mergedFavorites.push(station);
        }
      }
      setFavoriteStations(mergedFavorites);
      setHistoryStations(history);
    } catch {
      // Keep page usable if profile-only endpoints are blocked.
    }
  };

  useEffect(() => {
    loadStations();
    loadPersonalLists();
  }, []);

  useEffect(() => {
    return () => {
      if (currentStation?.id && listeningStartRef.current > 0) {
          const duration = Math.max(0, Math.round((Date.now() - listeningStartRef.current) / 1000));
          fmService.trackListening(currentStation.id, duration).catch(() => {});
        }
      };
  }, [currentStation?.id]);

  // ── Genre preset handler ─────────────────────────────────────────────────────
  const handleGenreSelect = async (genreId) => {
    setActiveGenre(genreId);
    setErrorMessage('');
    setIsLoading(true);
    try {
      const results = await scanByGenre(genreId, 24);
      setStations(results);
      setActiveTab('stations');
    } catch (error) {
      setErrorMessage(error?.message || 'Could not load genre stations.');
    } finally {
      setIsLoading(false);
    }
  };

  const displayStations = useMemo(() => {
    if (activeTab === 'favorites') return favoriteStations;
    if (activeTab === 'history') return historyStations;
    if (activeTab === 'discover') return popularStations;
    return stations;
  }, [activeTab, favoriteStations, historyStations, popularStations, stations]);

  const handleSearch = async (query, filters) => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const results = await fmService.searchStations({
        query,
        genre: filters?.genre || '',
        language: filters?.language || '',
        country: filters?.country || '',
        band: filters?.band || '',
        page: 1,
        pageSize: 30
      });
      setStations(results);
      setActiveTab('stations');
    } catch (error) {
      setErrorMessage(error?.message || 'Search failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayStation = async (station) => {
    if (!station?.streamUrl) {
      setErrorMessage('This station has no stream URL configured.');
      return;
    }

    const baseKey = String(station.streamUrl || station.name || Date.now())
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    const stationWithId = {
      ...station,
      id: station?.id || `stream-${baseKey || Date.now()}`
    };
    setErrorMessage('');
    try {
      // Log listening time for the previous station if one was running.
      if (currentStation?.id && listeningStartRef.current > 0) {
        const duration = Math.max(0, Math.round((Date.now() - listeningStartRef.current) / 1000));
        fmService.trackListening(currentStation.id, duration).catch(() => {});
      }

      // Station cards already provide authoritative stream URLs.
      // Avoid DB playback-info lookups here because many external/sample stations
      // are not catalog-backed and return 404 for /fmtuner/{id}/play.
      const playbackInfo = {};
      const merged = {
        ...stationWithId,
        ...playbackInfo,
        // Never let an empty playbackInfo wipe out the station's known stream URL.
        streamUrl: playbackInfo?.streamUrl || stationWithId.streamUrl
      };

      if (!merged.streamUrl) {
        setErrorMessage('This station has no stream URL configured.');
        return;
      }

      // Per Radio Browser spec: send a /json/url click event for every play.
      // This marks the station as popular and helps the community database.
      if (stationWithId.source === 'radio-browser') {
        trackRadioBrowserClick(stationWithId.id);
      }

      setCurrentStation(merged);
      setIsPlaying(true);
      const tunedFrequency = parseStationFrequency(merged);
      if (Number.isFinite(tunedFrequency)) {
        onFrequencyChange?.(tunedFrequency);
      }
      listeningStartRef.current = Date.now();
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to play station.');
    }
  };

  const patchStation = (stationId, updater) => {
    const patchList = (list) => list.map((item) => (item.id === stationId ? updater(item) : item));
    setStations((prev) => patchList(prev));
    setFeaturedStations((prev) => patchList(prev));
    setPopularStations((prev) => patchList(prev));
    setRecommendedStations((prev) => patchList(prev));
    setFavoriteStations((prev) => patchList(prev));
    setHistoryStations((prev) => patchList(prev));
    setCurrentStation((prev) => (prev?.id === stationId ? updater(prev) : prev));
  };

  const handleLike = async (stationId) => {
    const station = [stations, featuredStations, popularStations, recommendedStations, favoriteStations]
      .flat()
      .find((item) => item.id === stationId);
    const nextLike = !Boolean(station?.isLiked);
    patchStation(stationId, (item) => ({ ...item, isLiked: nextLike }));
    try {
      if (nextLike) {
        await fmService.likeStation(stationId);
      } else {
        await fmService.unlikeStation(stationId);
      }
      loadPersonalLists();
    } catch (error) {
      patchStation(stationId, (item) => ({ ...item, isLiked: !nextLike }));
      setErrorMessage(error?.message || 'Failed to update like.');
    }
  };

  const handleBookmark = async (stationId) => {
    const station = [stations, featuredStations, popularStations, recommendedStations, favoriteStations]
      .flat()
      .find((item) => item.id === stationId);
    const nextBookmark = !Boolean(station?.isBookmarked);
    patchStation(stationId, (item) => ({ ...item, isBookmarked: nextBookmark }));
    try {
      if (nextBookmark) {
        await fmService.bookmarkStation(stationId);
      } else {
        await fmService.unbookmarkStation(stationId);
      }
      loadPersonalLists();
    } catch (error) {
      patchStation(stationId, (item) => ({ ...item, isBookmarked: !nextBookmark }));
      setErrorMessage(error?.message || 'Failed to update bookmark.');
    }
  };

  const handleNext = () => {
    const list = displayStations;
    if (!list.length || !currentStation?.id) return;
    const index = list.findIndex((item) => item.id === currentStation.id);
    const next = list[(index + 1) % list.length];
    if (next) handlePlayStation(next);
  };

  const handlePrevious = () => {
    const list = displayStations;
    if (!list.length || !currentStation?.id) return;
    const index = list.findIndex((item) => item.id === currentStation.id);
    const prev = list[(index - 1 + list.length) % list.length];
    if (prev) handlePlayStation(prev);
  };

  const handleStop = async () => {
    setIsPlaying(false);
    if (currentStation?.id && listeningStartRef.current > 0) {
      const duration = Math.max(0, Math.round((Date.now() - listeningStartRef.current) / 1000));
      listeningStartRef.current = 0;
      await fmService.trackListening(currentStation.id, duration).catch(() => {});
    }
  };

  const handleQuickTune = async () => {
    setPinFeedback('');
    setErrorMessage('');

    const station = fmService.getPinnedStationByFrequency(pinFrequency, pinRegion);
    if (!station) {
      setErrorMessage(`No pinned station for ${String(pinFrequency || '').trim() || 'that frequency'} in ${String(pinRegion || '').trim() || 'this region'}.`);
      return;
    }

    setStations((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      if (!next.some((item) => item.id === station.id)) {
        next.unshift(station);
      }
      return next;
    });
    setActiveTab('stations');
    setPinFeedback(`Pinned tune locked: ${station.frequency} ${pinRegion || 'NYC'} → ${station.name}`);
    await handlePlayStation(station);
  };

  return (
    <section className="fm-module">
      <header className="fm-header">
        <div>
          <h3>FM Tuner</h3>
          <p>Live radio discovery and streaming inside your Music Studio.</p>
        </div>
      </header>

      <div className="fm-quick-tune" role="group" aria-label="Quick frequency tune">
        <div className="fm-quick-tune-field">
          <label htmlFor="fm-pin-frequency">Frequency</label>
          <input
            id="fm-pin-frequency"
            type="text"
            value={pinFrequency}
            onChange={(event) => setPinFrequency(event.target.value)}
            placeholder="107.5"
          />
        </div>
        <div className="fm-quick-tune-field">
          <label htmlFor="fm-pin-region">Region</label>
          <input
            id="fm-pin-region"
            type="text"
            value={pinRegion}
            onChange={(event) => setPinRegion(event.target.value)}
            placeholder="NYC"
          />
        </div>
        <button type="button" className="fm-btn fm-btn-primary" onClick={handleQuickTune}>
          Pin Tune
        </button>
      </div>

      {pinFeedback && <div className="fm-pin-feedback">{pinFeedback}</div>}

      {/* Genre preset pills */}
      <div className="fm-genre-presets">
        {GENRE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`fm-genre-pill${activeGenre === preset.id ? ' active' : ''}`}
            onClick={() => handleGenreSelect(preset.id)}
            disabled={isLoading}
          >
            {preset.icon} {preset.label}
          </button>
        ))}
      </div>

      {currentStation && (
        <FMNowPlaying station={currentStation} isPlaying={isPlaying} onStop={handleStop} />
      )}

      <FMSearch onSearch={handleSearch} />

      <div className="fm-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {errorMessage && <div className="fm-error-banner">{errorMessage}</div>}

      {activeTab === 'creator' ? (
        <FMCreatorStudio />
      ) : activeTab === 'scanner' ? (
        <FMScanner
          onTuneIn={(station) => {
            handlePlayStation(station);
            setActiveTab('stations');
          }}
        />
      ) : activeTab === 'browse' ? (
        <FMBrowser
          onPlay={handlePlayStation}
          onLike={handleLike}
          onBookmark={handleBookmark}
        />
      ) : activeTab === 'discover' ? (
        <div className="fm-discover">
          <FMStationList title="Featured Stations" stations={featuredStations} loading={isLoading} onPlay={handlePlayStation} onLike={handleLike} onBookmark={handleBookmark} />
          <FMStationList title="Popular Stations" stations={popularStations} loading={isLoading} onPlay={handlePlayStation} onLike={handleLike} onBookmark={handleBookmark} />
          <FMStationList title="Recommended For You" stations={recommendedStations} loading={isLoading} onPlay={handlePlayStation} onLike={handleLike} onBookmark={handleBookmark} />
        </div>
      ) : (
        <FMStationList
          title={
            activeTab === 'favorites' ? 'Your Favorites' :
            activeTab === 'history' ? 'Listening History' :
            activeGenre !== 'all' ? `${GENRE_PRESETS.find((p) => p.id === activeGenre)?.icon || ''} ${GENRE_PRESETS.find((p) => p.id === activeGenre)?.label || ''} Stations` :
            'All Stations'
          }
          stations={displayStations}
          loading={isLoading}
          onPlay={handlePlayStation}
          onLike={handleLike}
          onBookmark={handleBookmark}
        />
      )}

      {currentStation && (
        <FMPlayer
          station={currentStation}
          isPlaying={isPlaying}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onLike={handleLike}
          onBookmark={handleBookmark}
        />
      )}
    </section>
  );
};

export default FMTunerModule;
