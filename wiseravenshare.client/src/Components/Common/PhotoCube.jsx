import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiService } from '../../Services/api';
import '../../Styles/PhotoCube.css';

// ─── Face metadata ────────────────────────────────────────────────────────────
const FACE_KEYS = ['front', 'right', 'back', 'left', 'top', 'bottom'];
const FACE_ICONS = ['🖼️', '📸', '🌅', '🌄', '🌟', '🎨'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const normPhotoUrl = (photo) => {
  if (!photo || typeof photo !== 'object') return null;
  const raw = String(
    photo.mediaUrl || photo.url || photo.imageUrl || photo.fileUrl ||
    photo.publicUrl || photo.MediaUrl || photo.Url || ''
  ).trim();
  if (!raw) return null;
  if (raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('/')) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('api/')) return `/${raw}`;
  return null;
};

// ─── Component ────────────────────────────────────────────────────────────────
/**
 * PhotoCube — a CSS-3D rotating cube that shows up to 6 user photos.
 *
 * Props:
 *   onNavigate  — sidebar navigation callback (opens my-library on CTA click)
 *   userId      — used when fetching photos (optional)
 */
const PhotoCube = ({ onNavigate, userId }) => {
  const [photos, setPhotos] = useState([]);
  const [step, setStep]     = useState(0);          // 0..3 — side faces only
  const [isSpinning, setIsSpinning] = useState(false);
  const innerRef = useRef(null);

  // ── Load user photos ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // 1. Try /api/ravensight/media/photos (same pattern as music)
        const res = await apiService.getMusicLibrary?.()
          .catch(() => null);
        // We only have a music helper wired up; fall back to feed posts for images.
        void res; // unused — see approach 2 below

        // 2. Filter feed posts for image media
        const feedRes = await apiService.getPosts({ pageSize: 30 });
        const posts   = Array.isArray(feedRes?.data) ? feedRes.data : [];
        const urls    = [];

        for (const post of posts) {
          if (urls.length >= 6) break;
          // Pull the first image from each image/photo post
          const mediaUrls = Array.isArray(post?.mediaUrls) ? post.mediaUrls : [];
          const directUrl = post?.mediaUrl || '';
          const type      = String(post?.type || '').toLowerCase();
          const isImg     = type === 'image' || type === 'photo';

          if (isImg) {
            const u = directUrl || mediaUrls[0] || '';
            const norm = normPhotoUrl({ url: u });
            if (norm && !urls.includes(norm)) urls.push(norm);
          }

          for (const u of mediaUrls) {
            if (urls.length >= 6) break;
            const norm = normPhotoUrl({ url: u });
            if (norm && !urls.includes(norm)) urls.push(norm);
          }
        }

        if (!cancelled) setPhotos(urls);
      } catch {
        // Silently keep placeholders.
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [userId]);

  // ── Rotation ─────────────────────────────────────────────────────────────────
  const rotate = useCallback(() => {
    setStep((s) => (s + 1) % 4);
    setIsSpinning(true);
  }, []);

  // Clear spinning class once animation ends
  const handleAnimEnd = useCallback(() => {
    setIsSpinning(false);
  }, []);

  // Touch handler — fire once on touchstart to feel snappy
  const handleTouch = useCallback((e) => {
    e.preventDefault();
    rotate();
  }, [rotate]);

  // Keyboard: Space / Enter
  const handleKey = useCallback((e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      rotate();
    }
  }, [rotate]);

  // The Y angle for the whole cube — clockwise = increasing positive Y degrees
  const yDeg = step * 90;

  const cubeStyle = {
    transform: `rotateX(-18deg) rotateY(${yDeg}deg)`
  };

  // Build face data (6 faces, cycle photos)
  const faceSrc = (i) => (photos.length > 0 ? photos[i % photos.length] : null);

  return (
    <div className="photo-cube-widget">
      {/* Header row */}
      <div className="photo-cube-label">
        <span>📷 My Photos</span>
        <span className="photo-cube-hint">tap to spin</span>
      </div>

      {/* Cube */}
      <div
        className="photo-cube-scene"
        role="button"
        tabIndex={0}
        aria-label="Photo cube — click or press Enter to rotate"
        onClick={rotate}
        onTouchStart={handleTouch}
        onKeyDown={handleKey}
      >
        <div
          ref={innerRef}
          className={`photo-cube-inner${isSpinning ? ' spinning' : ''}`}
          style={cubeStyle}
          onAnimationEnd={handleAnimEnd}
        >
          {FACE_KEYS.map((face, i) => {
            const src = faceSrc(i);
            return (
              <div key={face} className={`cube-face cube-face--${face}`}>
                {src ? (
                  <img
                    src={src}
                    alt={`Photo ${i + 1}`}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="cube-face-placeholder">
                    {FACE_ICONS[i]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step dots */}
      <div className="photo-cube-dots" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`cube-dot${step === i ? ' active' : ''}`} />
        ))}
      </div>

      {/* CTA */}
      {typeof onNavigate === 'function' && (
        <button
          type="button"
          className="photo-cube-nav"
          onClick={() => onNavigate('my-library')}
        >
          View all photos →
        </button>
      )}
    </div>
  );
};

export default PhotoCube;
