import React, { useEffect, useMemo, useRef, useState } from 'react';
import FMSearch from './FMSearch';
import FMStationList from './FMStationList';
import FMNowPlaying from './FMNowPlaying';
import FMPlayer from './FMPlayer';
import FMCreatorStudio from './FMCreatorStudio';
import { fmService, GENRE_PRESETS, scanByGenre, scanAllStations, trackRadioBrowserClick } from '../../Services/fmService';
import '../../Styles/FMTunerModule.css';

const tabs = [
  { id: 'stations', label: 'Stations' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'history', label: 'History' },
  { id: 'discover', label: 'Discover' },
  { id: 'creator', label: 'Creator Studio' }
];

const FMTunerModule = () => {
  const [activeTab, setActiveTab] = useState('stations');
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [activeGenre, setActiveGenre] = useState('all');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStation, setCurrentStation] = useState(null);
  const [stations, setStations] = useState([]);
  const [featuredStations, setFeaturedStations] = useState([]);
  const [popularStations, setPopularStations] = useState([]);
  const [recommendedStations, setRecommendedStations] = useState([]);
  const [favoriteStations, setFavoriteStations] = useState([]);
  const [historyStations, setHistoryStations] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const scanTimerRef = useRef(null);
  const listeningStartRef = useRef(0);

  const loadStations = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const [featured, popular, recommended] = await Promise.all([
        fmService.getFeaturedStations(12),
        fmService.getPopularStations(12),
        fmService.getRecommendedStations(12)
      ]);
      setFeaturedStations(featured);
      setPopularStations(popular);
      setRecommendedStations(recommended);
      setStations(featured);
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
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
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

  // ── Scan handler ─────────────────────────────────────────────────────────────
  // Simulates tuning across the dial: increments a progress bar while fetching
  // stations from Radio Browser, then fills the list when done.
  const handleScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setErrorMessage('');
    setScanProgress(0);
    setActiveTab('stations');

    // Animate progress bar while the async fetch runs.
    let tick = 0;
    scanTimerRef.current = setInterval(() => {
      tick = Math.min(tick + 4, 90);
      setScanProgress(tick);
    }, 200);

    try {
      const results = await scanAllStations(8);
      clearInterval(scanTimerRef.current);
      setScanProgress(100);
      setStations(results.length > 0 ? results : stations);
      setActiveGenre('all');
    } catch (error) {
      clearInterval(scanTimerRef.current);
      setErrorMessage('Scan failed — showing cached stations.');
    } finally {
      setTimeout(() => {
        setIsScanning(false);
        setScanProgress(0);
      }, 600);
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
    if (!station?.id) return;
    setErrorMessage('');
    try {
      // Log listening time for the previous station if one was running.
      if (currentStation?.id && listeningStartRef.current > 0) {
        const duration = Math.max(0, Math.round((Date.now() - listeningStartRef.current) / 1000));
        fmService.trackListening(currentStation.id, duration).catch(() => {});
      }

      // getPlaybackInfo may return {} for sample/unseeded stations — that's fine;
      // we always preserve the station's own streamUrl as the authoritative source.
      const playbackInfo = await fmService.getPlaybackInfo(station.id).catch(() => ({}));
      const merged = {
        ...station,
        ...playbackInfo,
        // Never let an empty playbackInfo wipe out the station's known stream URL.
        streamUrl: playbackInfo?.streamUrl || station.streamUrl
      };

      if (!merged.streamUrl) {
        setErrorMessage('This station has no stream URL configured.');
        return;
      }

      // Per Radio Browser spec: send a /json/url click event for every play.
      // This marks the station as popular and helps the community database.
      if (station.source === 'radio-browser') {
        trackRadioBrowserClick(station.id);
      }

      setCurrentStation(merged);
      setIsPlaying(true);
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

  return (
    <section className="fm-module">
      <header className="fm-header">
        <div>
          <h3>FM Tuner</h3>
          <p>Live radio discovery and streaming inside your Music Studio.</p>
        </div>
        <button
          type="button"
          className={`fm-btn fm-btn-scan${isScanning ? ' scanning' : ''}`}
          onClick={handleScan}
          disabled={isScanning}
          aria-label="Scan for stations"
        >
          {isScanning ? '📡 Scanning…' : '📡 Scan'}
        </button>
      </header>

      {/* Scan progress bar */}
      {isScanning && (
        <div className="fm-scan-bar">
          <div className="fm-scan-fill" style={{ width: `${scanProgress}%` }} />
        </div>
      )}

      {/* Genre preset pills */}
      <div className="fm-genre-presets">
        {GENRE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`fm-genre-pill${activeGenre === preset.id ? ' active' : ''}`}
            onClick={() => handleGenreSelect(preset.id)}
            disabled={isLoading || isScanning}
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
