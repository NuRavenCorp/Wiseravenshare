import React, { useMemo, useState } from "react";
import ReactPlayer from "react-player";
import { Loader2, Play, Pause, Search, Globe, Radio, Star, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TuningDial, { stationToFrequency } from "./TuningDial";
import { PRESET_CATEGORIES } from "@/lib/radioPresets";
import { getStationsByRegionAndGenre } from "@/Services/fmService";

const NYC_CALLSIGNS = ["WBLS", "WQHT", "WWPR", "Hot 97", "Power 105.1"];

const getStationStream = (station) => {
  const url = String(station?.url_resolved || station?.url || station?.urlResolved || "").trim();
  if (!url) return "";
  if (url.startsWith("/")) return url;
  if (/\.m3u8(?:\?|$)/i.test(url)) return url;
  return `/api/fmtuner/stream-proxy?url=${encodeURIComponent(url)}`;
};

const normalizeStation = (station) => ({
  ...station,
  id: station.stationuuid || station.id || station.url_resolved || station.url,
  url: getStationStream(station),
  tags: Array.isArray(station.tags)
    ? station.tags
    : String(station.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean),
  bitrate: Number(station.bitrate) || 0,
});

const lookupZip = async (zip) => {
  const response = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`);
  if (!response.ok) throw new Error("That ZIP code could not be found.");
  const data = await response.json();
  const place = data.places?.[0];
  if (!place) throw new Error("No region was found for that ZIP code.");
  return {
    countrycode: "US",
    state: place.state,
    city: place["place name"],
    postalCode: data["post code"] || zip,
  };
};

const lookupBrowserLocation = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) {
    reject(new Error("Location services are not available in this browser."));
    return;
  }

  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    try {
      const params = new URLSearchParams({
        format: "jsonv2",
        lat: String(coords.latitude),
        lon: String(coords.longitude),
        zoom: "10",
        addressdetails: "1",
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
      if (!response.ok) throw new Error("Could not resolve your location to a region.");
      const data = await response.json();
      const address = data.address || {};
      const state = address.state || address.region || address.county || "";
      if (!state) throw new Error("Could not determine a state or region. Enter a ZIP code instead.");
      resolve({
        countrycode: String(address.country_code || "US").toUpperCase(),
        state,
        city: address.city || address.town || address.village || address.suburb || "",
        postalCode: address.postcode || "",
      });
    } catch (error) {
      reject(error);
    }
  }, (error) => {
    const message = error.code === error.PERMISSION_DENIED
      ? "Location permission was denied. Enter a ZIP code or region instead."
      : "Could not read your location. Enter a ZIP code or region instead.";
    reject(new Error(message));
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
});

export default function StationFinder() {
  const [countryCode, setCountryCode] = useState("US");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [stationQuery, setStationQuery] = useState("");
  const [tag, setTag] = useState("");
  const [regionLabel, setRegionLabel] = useState("");
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(null);
  const [error, setError] = useState("");
  const [locationBusy, setLocationBusy] = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  const playingFreq = useMemo(() => playing ? stationToFrequency(playing.name) : null, [playing]);

  const searchRegion = async (region, query = stationQuery, genre = tag) => {
    if (!region?.state && !query.trim()) {
      setError("Enter a ZIP code or state to find stations near you.");
      return;
    }
    setLoading(true);
    setError("");
    setPlaying(null);
    setShowPresets(false);
    try {
      const broadSearch = getStationsByRegionAndGenre({
        countrycode: region.countrycode || countryCode,
        state: region.state || state,
        name: query.trim() || undefined,
        tag: genre,
        limit: 100,
      });
      const isNewYorkMetro = /\bnew york\b/i.test(region.state || state)
        && (/\b(new york|manhattan|brooklyn|queens|bronx|staten island)\b/i.test(`${region.city || ""} ${regionLabel}`)
          || /^1(?:0[0-4]|1[0-6])\d{2}$/.test(region.postalCode || zipCode));
      const isNewJerseyMetro = /\bnew jersey\b/i.test(region.state || state)
        && /\b(jersey city|newark|hoboken|fort lee|union city|weehawken)\b/i.test(`${region.city || ""} ${regionLabel}`);
      const localPresets = (isNewYorkMetro || isNewJerseyMetro)
        ? NYC_CALLSIGNS.map((name) => getStationsByRegionAndGenre({
            countrycode: region.countrycode || countryCode,
            state: isNewYorkMetro ? (region.state || state) : undefined,
            name,
            limit: 5,
          }).catch(() => []))
        : [];

      const [regional, ...presetResults] = await Promise.all([broadSearch, ...localPresets]);
      const all = [...presetResults.flat(), ...(Array.isArray(regional) ? regional : [])]
        .map(normalizeStation)
        .filter((station) => station.id && station.url);
      const unique = [...new Map(all.map((station) => [station.id, station])).values()];
      setStations(unique);
      setRegionLabel([region.city, region.state, region.postalCode].filter(Boolean).join(" · "));
      setCountryCode(region.countrycode || countryCode);
      setState(region.state || state);
      if (!unique.length) setError("No stations were found for that region. Try another ZIP code or state.");
    } catch (searchError) {
      setError(searchError?.message || "Station search is unavailable right now.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (event) => {
    event?.preventDefault?.();
    let region = { countrycode: countryCode, state };
    const zip = zipCode.trim();
    if (zip) {
      if (!/^\d{5}$/.test(zip)) {
        setError("Enter a five-digit US ZIP code.");
        return;
      }
      setLoading(true);
      setError("");
      try {
        region = await lookupZip(zip);
      } catch (lookupError) {
        setLoading(false);
        setError(lookupError?.message || "ZIP lookup failed.");
        return;
      }
    }
    await searchRegion(region);
  };

  const handleUseLocation = async () => {
    setLocationBusy(true);
    setError("");
    try {
      const region = await lookupBrowserLocation();
      setZipCode(region.postalCode || "");
      await searchRegion(region);
    } catch (locationError) {
      setError(locationError?.message || "Could not determine your location.");
    } finally {
      setLocationBusy(false);
    }
  };

  const handleGenreSearch = (genreTag) => {
    setTag(genreTag);
    searchRegion({ countrycode: countryCode, state }, stationQuery, genreTag);
  };

  const handlePlay = (station) => {
    setError("");
    setPlaying((current) => current?.id === station.id ? null : station);
  };

  const renderStation = (station, index, isRegional = false) => (
    <button
      key={station.id || index}
      onClick={() => handlePlay(station)}
      className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
        playing?.id === station.id ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-secondary/50"
      }`}
    >
      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
        {playing?.id === station.id ? <Pause className="w-4 h-4 text-primary" /> : <Play className="w-4 h-4 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{station.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {station.tags?.slice(0, 3).join(", ") || station.genre || "Radio"} · {station.bitrate || "?"} kbps · {station.codec || "Stream"}
          {station.state ? ` · ${station.state}` : ""}
        </p>
      </div>
      {isRegional && <Star className="w-3.5 h-3.5 text-accent shrink-0" aria-label="Regional station" />}
    </button>
  );

  const playbackUrl = playing?.url || "";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5"><Radio className="h-5 w-5 text-primary" /></div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground">Stations near you</h3>
            <p className="mt-1 text-sm text-muted-foreground">Find live stations by ZIP code, region, or device location.</p>
          </div>
          {regionLabel && <span className="hidden sm:inline-flex rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">{regionLabel}</span>}
        </div>

        <form onSubmit={handleSearch} className="grid gap-2 sm:grid-cols-[minmax(140px,0.8fr)_minmax(90px,0.5fr)_minmax(160px,1fr)_minmax(180px,1.4fr)_auto]">
          <Input value={zipCode} onChange={(event) => setZipCode(event.target.value)} placeholder="US ZIP code" inputMode="numeric" maxLength={5} aria-label="US ZIP code" />
          <Input value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase().slice(0, 2))} placeholder="Country" maxLength={2} aria-label="Two-letter country code" />
          <Input value={state} onChange={(event) => setState(event.target.value)} placeholder="State / region" aria-label="State or region" />
          <Input value={stationQuery} onChange={(event) => setStationQuery(event.target.value)} placeholder="Station or call sign (optional)" aria-label="Station name or call sign" />
          <Button type="submit" disabled={loading || locationBusy}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleUseLocation} disabled={loading || locationBusy}>
            {locationBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />} Use my location
          </Button>
          <span className="text-xs text-muted-foreground">Location is only read after you select this button. Region lookup © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>.</span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2"><Globe className="h-4 w-4 text-accent" /><span className="text-sm font-medium text-foreground">Browse by genre</span></div>
        <div className="flex flex-wrap gap-2">
          {[{ label: "All", tag: "" }, { label: "Pop", tag: "pop" }, { label: "Hip Hop", tag: "hip hop" }, { label: "R&B", tag: "r&b" }, { label: "News", tag: "news" }, { label: "Rock", tag: "rock" }, { label: "Jazz", tag: "jazz" }].map((genre) => (
            <button key={genre.label} onClick={() => handleGenreSearch(genre.tag)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${tag === genre.tag ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              {genre.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      {playing && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <span className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{playing.name}</p><p className="truncate text-xs text-muted-foreground">{regionLabel || playing.state || playing.country || "Live radio"}</p></div>
          <Button size="icon" variant="ghost" onClick={() => setPlaying(null)} aria-label="Stop station"><Pause className="h-4 w-4" /></Button>
        </div>
      )}

      {playing && <ReactPlayer key={playing.id} src={playbackUrl} playing width="0" height="0" config={{ file: { forceAudio: true } }} onError={() => { setPlaying(null); setError(`Could not play ${playing.name}. The stream may be offline or restricted.`); }} />}

      {playing && <TuningDial frequency={playingFreq} playing label={playing.name} sourceType="internet" />}

      {stations.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">{regionLabel ? `Regional presets · ${regionLabel}` : "Regional stations"}</h4>
          {stations.map((station, index) => renderStation(station, index, true))}
          <p className="pt-1 text-[11px] text-muted-foreground">Station listings and streams are provided by Radio Browser.</p>
        </section>
      )}

      {stations.length === 0 && !loading && !error && (
        <section className="rounded-xl border border-dashed border-border bg-card/60 p-5 text-center">
          <Radio className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Start with your region</p>
          <p className="mt-1 text-xs text-muted-foreground">Enter a ZIP code or state, or use your device location to load nearby station presets.</p>
        </section>
      )}

      {showPresets && PRESET_CATEGORIES.map((category) => (
        <section key={category.id} className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">{category.label}</h4>
          {category.stations.map((station, index) => renderStation({ ...station, id: station.name, tags: station.tags || [] }, index))}
        </section>
      ))}
      {!showPresets && <Button variant="outline" size="sm" className="w-full" onClick={() => setShowPresets(true)}><Star className="h-3.5 w-3.5" /> Show global presets</Button>}
    </div>
  );
}
