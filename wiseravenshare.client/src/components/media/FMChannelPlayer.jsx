import ReactPlayer from 'react-player';
import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/api/client';
import { ALL_PRESET_STATIONS, PRESET_CATEGORIES } from '@/lib/radioPresets';
import { Play, Pause, Radio, Volume2, VolumeX, Loader2, AlertCircle, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CATEGORY_LABELS = {
  'talk-news': 'Talk & News',
  chill: 'Chill & Ambient',
  'jazz-soul': 'Jazz Soul & Reggae',
  electronic: 'Electronic & Beats',
  eclectic: 'Eclectic & Indie',
};

const CATEGORY_ORDER = ['talk-news', 'chill', 'jazz-soul', 'electronic', 'eclectic'];

// Proxy stream through the backend to fix CORS + HTTP→HTTPS mixed-content issues.
// HLS manifests (.m3u8) are already HTTPS and served correctly; only proxy
// direct Icecast/SHOUTcast streams that are plain http:// or cross-origin.
const resolvePlaybackUrl = (rawUrl) => {
  if (!rawUrl) return '';
  // HLS manifests go directly to ReactPlayer's built-in HLS support
  if (rawUrl.endsWith('.m3u8') || rawUrl.includes('.m3u8?')) return rawUrl;
  // Same-origin relative URLs don't need a proxy
  if (rawUrl.startsWith('/')) return rawUrl;
  // Proxy all other external streams to avoid CORS + mixed-content blocks
  return `/api/fmtuner/stream-proxy?url=${encodeURIComponent(rawUrl)}`;
};

function groupByCategory(channels) {
  const map = {};
  for (const ch of channels) {
    if (!map[ch.category]) map[ch.category] = [];
    map[ch.category].push(ch);
  }
  return map;
}

function presetsToChannels() {
  return ALL_PRESET_STATIONS.map((s) => {
    const cat = PRESET_CATEGORIES.find((c) => c.stations.includes(s));
    return {
      id: s.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      name: s.name,
      streamUrl: s.url,
      isLive: true,
      category: cat?.id || 'eclectic',
      genre: s.tags?.join(', ') || '',
      codec: s.codec || 'MP3',
      bitrate: s.bitrate || 128,
    };
  });
}

const ERROR_HINTS = {
  cors: 'Stream blocked by browser security (CORS). Try a different station.',
  mixed: 'HTTP stream blocked on this HTTPS page. Switching to proxy…',
  notFound: 'Stream URL not found (404). The station may be offline.',
  geo: 'This station may be geo-restricted in your region.',
  generic: 'Could not connect to stream. The station may be temporarily offline.',
};

function classifyError(err) {
  if (!err) return ERROR_HINTS.generic;
  const msg = String(err?.message || err?.type || err || '').toLowerCase();
  if (msg.includes('cors') || msg.includes('access-control')) return ERROR_HINTS.cors;
  if (msg.includes('mixed') || msg.includes('http')) return ERROR_HINTS.mixed;
  if (msg.includes('404') || msg.includes('not found')) return ERROR_HINTS.notFound;
  if (msg.includes('403') || msg.includes('forbidden') || msg.includes('geo')) return ERROR_HINTS.geo;
  return ERROR_HINTS.generic;
}

export default function FMChannelPlayer() {
  const [channels, setChannels] = useState([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('talk-news');
  const [activeChannel, setActiveChannel] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [playerError, setPlayerError] = useState(null);
  const [buffering, setBuffering] = useState(false);
  const playerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    apiClient.radio.getChannels()
      .then((data) => {
        if (!cancelled) setChannels(Array.isArray(data) ? data : presetsToChannels());
      })
      .catch(() => {
        if (!cancelled) setChannels(presetsToChannels());
      })
      .finally(() => {
        if (!cancelled) setFetchLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const grouped = groupByCategory(channels);
  const categoryIds = CATEGORY_ORDER.filter((id) => grouped[id]?.length > 0);
  const currentTabChannels = grouped[activeCategory] || [];

  // Autoplay guard: selecting a new channel only cues it up.
  // User must explicitly press Play; we never force-start playback.
  const handleSelectChannel = (ch) => {
    setPlayerError(null);
    setBuffering(false);
    if (activeChannel?.id === ch.id) {
      // Toggle play/pause on same channel
      setIsPlaying((p) => !p);
    } else {
      // Cue new channel but don't autoplay — let user press Play
      setActiveChannel(ch);
      setIsPlaying(false);
    }
  };

  const handleTogglePlay = () => {
    if (!activeChannel) return;
    setPlayerError(null);
    setIsPlaying((p) => !p);
  };

  const handleError = (err) => {
    const hint = classifyError(err);
    setPlayerError(hint);
    setIsPlaying(false);
    setBuffering(false);
  };

  const playbackUrl = activeChannel ? resolvePlaybackUrl(activeChannel.streamUrl) : '';

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Radio className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">FM Channel Player</span>
        {isPlaying && activeChannel && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-primary">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            LIVE
          </span>
        )}
        {buffering && !isPlaying && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Buffering…
          </span>
        )}
      </div>

      {/* Hidden ReactPlayer — only mounted when a channel is selected */}
      {activeChannel && (
        <ReactPlayer
          ref={playerRef}
          url={playbackUrl}
          playing={isPlaying}
          volume={muted ? 0 : volume}
          width="0"
          height="0"
          config={{ file: { forceAudio: true } }}
          onPlay={() => { setIsPlaying(true); setBuffering(false); }}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onBuffer={() => setBuffering(true)}
          onBufferEnd={() => setBuffering(false)}
          onError={handleError}
        />
      )}

      {/* Category Tabs */}
      <div className="flex gap-1 overflow-x-auto px-4 pt-3 pb-1 scrollbar-hide">
        {fetchLoading
          ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground my-1" />
          : categoryIds.map((catId) => (
            <button
              key={catId}
              onClick={() => setActiveCategory(catId)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                activeCategory === catId
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {CATEGORY_LABELS[catId] || catId}
            </button>
          ))
        }
      </div>

      {/* Channel Pills */}
      <div className="flex flex-wrap gap-2 px-4 py-3">
        {fetchLoading
          ? Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-28 rounded-full bg-secondary/60 animate-pulse" />
          ))
          : currentTabChannels.map((ch) => {
            const isActive = activeChannel?.id === ch.id;
            return (
              <button
                key={ch.id}
                onClick={() => handleSelectChannel(ch)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  isActive
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/50'
                }`}
              >
                {isActive && isPlaying
                  ? <Pause className="w-3 h-3" />
                  : <Play className="w-3 h-3" />
                }
                {ch.name}
              </button>
            );
          })
        }
      </div>

      {/* Now Playing / Controls */}
      {activeChannel && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          <div className="flex items-center gap-3">
            <Button size="icon" onClick={handleTogglePlay} className="h-8 w-8 shrink-0" disabled={buffering}>
              {buffering
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : isPlaying
                  ? <Pause className="w-4 h-4" />
                  : <Play className="w-4 h-4" />
              }
            </Button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{activeChannel.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {activeChannel.genre} · {activeChannel.codec} · {activeChannel.bitrate}kbps
                {!isPlaying && !buffering && !playerError && (
                  <span className="ml-1 text-muted-foreground/60">· Press ▶ to play</span>
                )}
              </p>
            </div>
            {/* Volume */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMuted((m) => !m)}>
                {muted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </Button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }}
                className="w-20 accent-primary"
              />
            </div>
          </div>
          {playerError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive leading-snug">{playerError}</p>
              <button
                onClick={() => { setPlayerError(null); setIsPlaying(true); }}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground shrink-0"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {!activeChannel && !fetchLoading && (
        <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground border-t border-border">
          <WifiOff className="w-3.5 h-3.5" />
          Select a station above to tune in
        </div>
      )}
    </div>
  );
}
