// Curated real internet radio stations, grouped by category.
// All stream URLs are publicly available broadcast feeds.

export const PRESET_CATEGORIES = [
  {
    id: "talk-news",
    label: "Talk & News",
    stations: [
      { name: "BBC World Service", url: "https://a.files.bbci.co.uk/media/live/manifesto/audio/simulcast/hls/nonuk/sbr_low/ak/bbc_world_service.m3u8", country: "United Kingdom", tags: ["News", "World", "Talk"], codec: "AAC+", bitrate: 101, preset: true },
      { name: "BBC Radio 4 FM", url: "https://stream.live.vc.bbcmedia.co.uk/v0_1/bbc_radio_fourfm", country: "United Kingdom", tags: ["Talk", "News", "Culture"], codec: "MP3", bitrate: 128, preset: true },
      { name: "BBC Radio 5 Live", url: "https://stream.live.vc.bbcmedia.co.uk/v0_1/bbc_radio_five_live", country: "United Kingdom", tags: ["News", "Sport", "Talk"], codec: "MP3", bitrate: 128, preset: true },
    ],
  },
  {
    id: "chill",
    label: "Chill & Ambient",
    stations: [
      { name: "SomaFM Groove Salad", url: "https://ice1.somafm.com/groovesalad-128-mp3", country: "Internet", tags: ["Ambient", "Chill"], codec: "MP3", bitrate: 128, preset: true },
      { name: "SomaFM Drone Zone", url: "https://ice1.somafm.com/dronezone-128-mp3", country: "Internet", tags: ["Drone", "Ambient"], codec: "MP3", bitrate: 128, preset: true },
      { name: "SomaFM Lush", url: "https://ice1.somafm.com/lush-128-mp3", country: "Internet", tags: ["Vocals", "Chill"], codec: "MP3", bitrate: 128, preset: true },
      { name: "SomaFM Space Station", url: "https://ice1.somafm.com/spacestation-128-mp3", country: "Internet", tags: ["Space", "Ambient"], codec: "MP3", bitrate: 128, preset: true },
      { name: "SomaFM Deep Space One", url: "https://ice1.somafm.com/deepspaceone-128-mp3", country: "Internet", tags: ["Deep Space", "Ambient"], codec: "MP3", bitrate: 128, preset: true },
    ],
  },
  {
    id: "eclectic",
    label: "Eclectic & Indie",
    stations: [
      { name: "Radio Paradise", url: "https://stream.radioparadise.com/aac-320", country: "Internet", tags: ["Eclectic", "Indie"], codec: "AAC", bitrate: 320, preset: true },
      { name: "BBC Radio 6 Music", url: "https://stream.live.vc.bbcmedia.co.uk/v0_1/bbc_6music", country: "United Kingdom", tags: ["Alternative", "Indie"], codec: "MP3", bitrate: 128, preset: true },
      { name: "SomaFM Indie Pop Rocks", url: "https://ice1.somafm.com/indiepop-128-mp3", country: "Internet", tags: ["Indie", "Pop"], codec: "MP3", bitrate: 128, preset: true },
    ],
  },
  {
    id: "jazz-soul",
    label: "Jazz, Soul & Reggae",
    stations: [
      { name: "Jazz24", url: "https://live.amperwave.net/manifest/jazz24-aac-64.m3u8", country: "United States", tags: ["Jazz"], codec: "AAC", bitrate: 64, preset: true },
      { name: "SomaFM Secret Agent", url: "https://ice1.somafm.com/secretagent-128-mp3", country: "Internet", tags: ["Lounge", "Jazz"], codec: "MP3", bitrate: 128, preset: true },
      { name: "SomaFM Heavyweight Reggae", url: "https://ice1.somafm.com/reggae-128-mp3", country: "Internet", tags: ["Reggae", "Dub"], codec: "MP3", bitrate: 128, preset: true },
      { name: "SomaFM Suburbs of Goa", url: "https://ice1.somafm.com/suburbsofgoa-128-mp3", country: "Internet", tags: ["World", "Goa"], codec: "MP3", bitrate: 128, preset: true },
    ],
  },
  {
    id: "electronic",
    label: "Electronic & Beats",
    stations: [
      { name: "SomaFM Underground 80s", url: "https://ice1.somafm.com/u80s-128-mp3", country: "Internet", tags: ["80s", "Electronic"], codec: "MP3", bitrate: 128, preset: true },
      { name: "SomaFM Beat Blender", url: "https://ice1.somafm.com/beatblender-128-mp3", country: "Internet", tags: ["Downtempo", "Electronic"], codec: "MP3", bitrate: 128, preset: true },
      { name: "SomaFM DEF CON Radio", url: "https://ice1.somafm.com/defcon-128-mp3", country: "Internet", tags: ["Electronic", "Hacker"], codec: "MP3", bitrate: 128, preset: true },
      { name: "SomaFM Sonic Universe", url: "https://ice1.somafm.com/sonicuniverse-128-mp3", country: "Internet", tags: ["Jazz", "Electronic"], codec: "MP3", bitrate: 128, preset: true },
    ],
  },
];

export const ALL_PRESET_STATIONS = PRESET_CATEGORIES.flatMap((c) => c.stations);

export const GENRE_BUTTONS = [
  { label: "All", tag: "" },
  { label: "Talk", tag: "talk" },
  { label: "News", tag: "news" },
  { label: "Jazz", tag: "jazz" },
  { label: "Rock", tag: "rock" },
  { label: "Classical", tag: "classical" },
  { label: "Electronic", tag: "electronic" },
  { label: "Pop", tag: "pop" },
  { label: "Hip Hop", tag: "hip hop" },
  { label: "Dance", tag: "dance" },
  { label: "Reggae", tag: "reggae" },
  { label: "Country", tag: "country" },
];