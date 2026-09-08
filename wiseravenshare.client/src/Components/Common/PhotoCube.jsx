import React, { useCallback, useEffect, useState } from 'react';
import { apiService } from '../../Services/api';
import '../../Styles/PhotoCube.css';

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

const MAX_VISIBLE = 9;   // 3 × 3 grid

// ─── Component ────────────────────────────────────────────────────────────────
/**
 * PhotoLibrary — compact sidebar photo grid pulling images from feed posts.
 *
 * Props:
 *   onNavigate  — sidebar nav callback (opens my-library)
 *   userId      — refresh trigger when user changes
 */
const PhotoCube = ({ onNavigate, userId }) => {
  const [photos, setPhotos]     = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);

  // ── Load photos from feed posts ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        const feedRes = await apiService.getPosts({ pageSize: 50 });
        const posts   = Array.isArray(feedRes?.data) ? feedRes.data : [];
        const urls    = [];

        for (const post of posts) {
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
            const norm = normPhotoUrl({ url: u });
            if (norm && !urls.includes(norm)) urls.push(norm);
          }
        }

        if (!cancelled) {
          setTotal(urls.length);
          setPhotos(urls.slice(0, MAX_VISIBLE));
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [userId]);

  const goToLibrary = useCallback(() => {
    if (typeof onNavigate === 'function') onNavigate('my-library');
  }, [onNavigate]);

  const overflow = total - MAX_VISIBLE;

  return (
    <div className="photo-library-widget">
      {/* Header */}
      <div className="photo-library-header">
        <span className="photo-library-title">📷 My Photos</span>
        {total > 0 && (
          <span className="photo-library-count">{total}</span>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="photo-library-loading">
          <span className="photo-lib-spinner" />
        </div>
      ) : photos.length === 0 ? (
        <div className="photo-library-empty">
          <span>🖼️</span>
          <p>No photos yet</p>
        </div>
      ) : (
        <div className="photo-library-grid">
          {photos.map((src, i) => {
            const isLast = i === photos.length - 1 && overflow > 0;
            return (
              <button
                key={src}
                type="button"
                className="photo-lib-cell"
                onClick={goToLibrary}
                aria-label={isLast ? `View all ${total} photos` : `Photo ${i + 1}`}
              >
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.parentElement.style.display = 'none';
                  }}
                />
                {isLast && (
                  <div className="photo-lib-overflow">+{overflow}</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Footer CTA */}
      <button type="button" className="photo-library-nav" onClick={goToLibrary}>
        {photos.length > 0 ? 'Open library →' : 'Upload photos →'}
      </button>
    </div>
  );
};

export default PhotoCube;

