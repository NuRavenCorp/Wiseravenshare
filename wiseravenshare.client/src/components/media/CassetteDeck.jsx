import React from "react";

const STREAM_LOGO = "https://media.apiClient.com/images/public/6acad64c240f9153977f3360/cff6f2f4a_Ravenstream.jpg";

const RadioIcon = () => (
  <svg viewBox="0 0 24 24" className="w-[17px] h-[17px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
    <path d="M4 9a12 12 0 0 1 16 0M7 12a7.5 7.5 0 0 1 10 0m-7 3a3 3 0 0 1 4 0" />
    <circle cx="12" cy="19" r="1" fill="currentColor" />
  </svg>
);
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M7 4.8c0-.8.9-1.3 1.6-.9l11 7.1a1.2 1.2 0 0 1 0 2L8.6 20.1c-.7.4-1.6-.1-1.6-.9z" /></svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
);
const SkipIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="m5 5 10 7-10 7zM19 5v14" /></svg>
);

const VU_HEIGHTS = ["25%", "64%", "42%", "85%", "35%", "70%"];

const reelStyle = {
  width: 62,
  height: 62,
  borderRadius: "50%",
  border: "2px solid #8d52e0",
  background:
    "radial-gradient(circle, #21192b 0 18%, #a477d8 19% 22%, #21192b 23% 40%, #58476b 41% 45%, #17121d 46% 65%, #8d52e0 66% 69%, #17121d 70%)",
  boxShadow: "0 0 12px #8d52e044, inset 0 0 7px #000",
};

function Reel() {
  return (
    <div className="reel relative" style={reelStyle}>
      <span className="absolute rounded-full" style={{ width: 7, height: 7, background: "#c6a8ea", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }} />
      <span className="absolute" style={{ width: 24, height: 2, background: "#c6a8ea", left: "50%", top: "50%", transform: "translate(-50%, -50%) rotate(45deg)" }} />
    </div>
  );
}

export default function CassetteDeck({ playing, trackTitle, status, trackCounter, onPlayPause, onSkip, bands, onBandToggle }) {
  return (
    <div
      className={`cassette-deck relative overflow-hidden flex flex-col gap-[17px] p-[22px] ${playing ? "playing" : ""}`}
      style={{
        maxWidth: "430px",
        background: "linear-gradient(145deg, #211b28, #14101a 60%, #0e0b12)",
        border: "1px solid #44384d",
        borderRadius: "16px",
        color: "#edeaf0",
        boxShadow: "0 12px 32px #17111d33, inset 0 1px #ffffff12",
      }}
    >
      <span className="absolute pointer-events-none rounded-[11px]" style={{ inset: "7px", border: "1px solid #ffffff0c" }} />

      {/* decktop */}
      <div className="flex items-center justify-between gap-[18px] relative">
        <div className="flex items-center gap-2.5">
          <img src={STREAM_LOGO} alt="WiseRavenStream" className="w-12 h-12 rounded-full object-cover" style={{ border: "2px solid #8d52e0", boxShadow: "0 0 16px #8d52e055" }} />
          <RadioIcon />
          <span className="text-xs font-bold tracking-[0.17em]" style={{ color: "#c9a9f2" }}>RAVEN RADIO</span>
        </div>
        <div className="flex gap-[5px] items-center">
          <span className="block w-[7px] h-[7px] rounded-full" style={{ background: "#9c63e5", boxShadow: "0 0 9px #8d52e0" }} />
          {[1, 2, 3].map((i) => (
            <span key={i} className="block w-[7px] h-[7px] rounded-full" style={{ background: "#594b62", boxShadow: "inset 0 1px 2px #000" }} />
          ))}
        </div>
      </div>

      {/* window */}
      <div className="flex items-center justify-around gap-3 relative" style={{ padding: "13px 15px 12px", background: "linear-gradient(180deg, #0b090e, #17121c)", border: "1px solid #45384d", borderRadius: "8px", boxShadow: "inset 0 3px 8px #000b, 0 1px #ffffff0b" }}>
        <Reel />
        <div className="flex items-end justify-center gap-[3px]" style={{ width: 65, height: 32, border: "1px solid #5a4967", borderRadius: "5px", background: "#100c14", padding: 4, boxSizing: "border-box" }}>
          {VU_HEIGHTS.map((h, i) => (
            <span key={i} className="vu-bar" style={{ width: 4, height: h, background: "#a36be8", borderRadius: "2px 2px 0 0", boxShadow: "0 0 5px #8d52e077", transformOrigin: "bottom" }} />
          ))}
        </div>
        <Reel />
      </div>

      {/* label */}
      <div className="flex flex-col gap-[5px] relative" style={{ padding: "10px 13px", background: "linear-gradient(100deg, #eee8dc, #d8d0c5)", borderRadius: "4px", color: "#251c2c", boxShadow: "inset 0 1px #fff, 0 2px 4px #0005" }}>
        <div className="text-sm font-semibold leading-tight break-words">{trackTitle}</div>
        <div className="text-[11px] leading-snug" style={{ color: "#665b68" }}>{status}</div>
      </div>

      {/* controls */}
      <div className="flex items-center justify-between gap-3.5 relative">
        <div className="flex gap-1.5">
          {bands.map((b) => (
            <button key={b.id} onClick={() => onBandToggle(b.id)} className={`deck-btn deck-band ${b.active ? "active" : ""}`}>
              {b.label}
            </button>
          ))}
        </div>
        <div className="flex gap-[7px] items-center">
          <button onClick={onPlayPause} className="deck-btn deck-transport-btn deck-main-btn" aria-label={playing ? "Pause" : "Play"}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button onClick={onSkip} className="deck-btn deck-transport-btn" aria-label="Skip forward">
            <SkipIcon />
          </button>
        </div>
      </div>

      {/* counter */}
      <div className="text-[11px] text-center relative" style={{ color: "#a79baa", letterSpacing: "0.04em" }}>
        {trackCounter}
      </div>
    </div>
  );
}