import React, { useState, useMemo } from "react";
import ReactPlayer from "react-player";
import { apiClient } from "@/api/client";
import { Loader2, Play, Pause, Search, Globe, Radio, Star, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TuningDial, { stationToFrequency } from "./TuningDial";
import { PRESET_CATEGORIES, GENRE_BUTTONS } from "@/lib/radioPresets";
import FMChannelPlayer from "@/components/media/FMChannelPlayer";

export default function StationFinder() {
  const [country, setCountry] = useState("United States");
  const [state, setState] = useState("");
  const [tag, setTag] = useState("");
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(null);
  const [error, setError] = useState(null);
  const [showPresets, setShowPresets] = useState(true);
  const [collapsedCats, setCollapsedCats] = useState({});
  const resolveStationUrl = (station) => {
    if (!station?.url) return "";

    // Map dead stream.live.vc.bbcmedia.co.uk URLs to working HLS manifests
    const BBC_URL_MAP = {
      "bbc_world_service": "https://a.files.bbci.co.uk/media/live/manifesto/audio/simulcast/hls/nonuk/sbr_low/ak/bbc_world_service.m3u8",
      "bbc_radio_fourfm": "http://as-hls-ww-live.akamaized.net/pool_55057080/live/ww/bbc_radio_fourfm/bbc_radio_fourfm.isml/bbc_radio_fourfm-audio=128000.norewind.m3u8",
      "bbc_radio_five_live": "http://as-hls-ww-live.akamaized.net/pool_89021708/live/ww/bbc_radio_five_live/bbc_radio_five_live.isml/bbc_radio_five_live-audio%3d128000.norewind.m3u8",
      "bbc_6music": "https://a.files.bbci.co.uk/ms6/live/3441A116-B12E-4D2F-ACA8-C1984642FA4B/audio/simulcast/hls/uk/audio_syndication_med_sbr_v1/aks/bbc_6music.m3u8",
    };

    if (station.url.includes("stream.live.vc.bbcmedia.co.uk")) {
      const match = station.url.match(/\/v0_1\/([^/?]+)/);
      const key = match?.[1];
      if (key && BBC_URL_MAP[key]) return BBC_URL_MAP[key];
      const nameKey = station.name?.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      const nameMatch = Object.entries(BBC_URL_MAP).find(([k]) => nameKey?.includes(k.replace("bbc_", "")));
      if (nameMatch) return nameMatch[1];
    }

    // HLS manifests don't need a proxy — use them directly
    const url = station.url;
    if (url.endsWith('.m3u8') || url.includes('.m3u8?')) return url;
    if (url.startsWith('/')) return url;
    // Proxy non-HLS streams to avoid CORS + HTTP mixed-content issues
    return `/api/fmtuner/stream-proxy?url=${encodeURIComponent(url)}`;
  };

  const playingFreq = useMemo(() => {
    if (!playing) return null;
    return stationToFrequency(playing.name);
  }, [playing]);

  const handleSearch = async (searchTag = tag) => {
    setLoading(true);
    setError(null);
    setPlaying(null);
    try {
      const res = await apiClient.functions.invoke("FindStations", { country, state, tag: searchTag, limit: 30 });
      if (res.data?.error) throw new Error(res.data.error);
      setStations(res.data?.stations || []);
      setShowPresets(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenreSearch = (genreTag) => {
    setTag(genreTag);
    handleSearch(genreTag);
  };

  const handlePlay = (station) => {
    setError(null);
    if (playing?.url === station.url) {
      setPlaying(null);
      return;
    }
    setPlaying(station);
  };

  const toggleCat = (catId) => {
    setCollapsedCats((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  const renderStation = (s, i) => (
    <button
      key={i}
      onClick={() => handlePlay(s)}
      className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
        playing?.url === s.url ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-secondary/50"
      }`}
    >
      <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center shrink-0">
        {playing?.url === s.url ? <Pause className="w-4 h-4 text-primary" /> : <Play className="w-4 h-4 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {s.tags?.length > 0 ? s.tags.slice(0, 3).join(", ") : "Radio"} · {s.bitrate || "?"}kbps · {s.codec || "Unknown"}
        </p>
      </div>
      {s.preset && <Star className="w-3.5 h-3.5 text-accent shrink-0" />}
    </button>
  );

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* FM Channel Player — preset live stations with channel-pill model */}
      <FMChannelPlayer />

      <div className="border-t border-border/70" />

      <ReactPlayer
        key={playing?.url || "no-station"}
        url={playing ? resolveStationUrl(playing) : ""}
        playing={!!playing}
        width="0"
        height="0"
        config={{ file: { forceAudio: true } }}
        onError={(err) => {
          if (!playing) return;
          const msg = String(err?.message || err?.type || '').toLowerCase();
          let hint = `Could not play "${playing.name}".`;
          if (msg.includes('cors') || msg.includes('access-control')) hint += ' Stream blocked by browser security (CORS).';
          else if (msg.includes('404') || msg.includes('not found')) hint += ' Station stream not found — it may be offline.';
          else if (msg.includes('403') || msg.includes('geo')) hint += ' This station may be geo-restricted in your region.';
          else hint += ' The station may be temporarily offline. Try another.';
          setError(hint);
          setPlaying(null);
        }}
      />

      {/* Tuning Dial */}
      <TuningDial
        frequency={playingFreq}
        playing={!!playing}
        label={playing?.name}
        sourceType={playing?.preset ? "internet" : "local"}
      />

      {/* Genre quick-search */}
      <div className="rounded-xl border border-border bg-card/95 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Browse by Genre</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {GENRE_BUTTONS.map((g) => (
            <button
              key={g.label}
              onClick={() => handleGenreSearch(g.tag)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                tag === g.tag && !showPresets
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/70"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search controls */}
      <div className="rounded-xl border border-border bg-card/95 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-foreground">Digital Station Finder</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Enter your region to find local airwave channels. Local stations are listed first by popularity.</p>
        <div className="flex gap-2">
          <Input placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} className="flex-1" />
          <Input placeholder="State (optional)" value={state} onChange={(e) => setState(e.target.value)} className="flex-1" />
          <Button onClick={() => handleSearch()} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Find
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Now Playing indicator */}
      {playing && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{playing.name}</p>
            <p className="text-xs text-muted-foreground">{playing.country}{playing.state ? ` · ${playing.state}` : ""} · {playingFreq?.toFixed(1)} MHz</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => handlePlay(playing)}>
            <Pause className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Preset stations by category */}
      {showPresets && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-foreground">Preset Stations</span>
          </div>
          {PRESET_CATEGORIES.map((cat) => {
            const collapsed = collapsedCats[cat.id];
            return (
              <div key={cat.id} className="space-y-2">
                <button
                  onClick={() => toggleCat(cat.id)}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {cat.label} <span className="text-muted-foreground/60">({cat.stations.length})</span>
                </button>
                {!collapsed && (
                  <div className="space-y-2">
                    {cat.stations.map((s, i) => renderStation(s, `${cat.id}-${i}`))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Digitized stations from search */}
      {!showPresets && (
        <>
          {stations.length === 0 && !loading && !error && (
            <div className="rounded-xl border border-border bg-card/95 p-8 text-center">
              <Radio className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No stations found. Try a different region or genre.</p>
            </div>
          )}
          <div className="space-y-2">
            {stations.map((s, i) => renderStation(s, `dig-${i}`))}
          </div>
        </>
      )}

      {/* Toggle between presets and search results */}
      {!showPresets && (
        <Button variant="outline" size="sm" onClick={() => { setShowPresets(true); setTag(""); }} className="w-full">
          <Star className="w-3.5 h-3.5" /> Show preset stations
        </Button>
      )}
    </div>
  );
}