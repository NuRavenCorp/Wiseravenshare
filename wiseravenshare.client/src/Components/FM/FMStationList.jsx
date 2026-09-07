import React from 'react';
import { FiPlay, FiHeart, FiBookmark, FiUsers } from 'react-icons/fi';

const FMStationList = ({
  stations,
  loading,
  onPlay,
  onLike,
  onBookmark,
  title
}) => {
  if (loading) {
    return <div className="fm-empty">Loading stations…</div>;
  }

  if (!Array.isArray(stations) || stations.length === 0) {
    return (
      <div className="fm-empty">
        <p>No stations found.</p>
      </div>
    );
  }

  return (
    <div className="fm-station-group">
      {title && <h4 className="fm-group-title">{title}</h4>}
      <div className="fm-station-grid">
        {stations.map((station) => (
          <article key={station.id} className="fm-station-card">
            <div className="fm-station-head">
              <div className="fm-station-logo">
                {station.logoUrl ? (
                  <img src={station.logoUrl} alt={station.name} />
                ) : (
                  <span>📻</span>
                )}
              </div>
              <div className="fm-station-meta">
                <strong>{station.name}</strong>
                <small>{station.genre || 'General'}</small>
                <small>
                  {station.frequency || '—'} • {station.country || 'Global'}
                </small>
              </div>
            </div>
            <div className="fm-station-foot">
              <button type="button" className="fm-icon-btn play" onClick={() => onPlay?.(station)} aria-label={`Play ${station.name}`}>
                <FiPlay />
              </button>
              <button type="button" className={`fm-icon-btn ${station.isLiked ? 'active' : ''}`} onClick={() => onLike?.(station.id)} aria-label={`Like ${station.name}`}>
                <FiHeart />
              </button>
              <button type="button" className={`fm-icon-btn ${station.isBookmarked ? 'active' : ''}`} onClick={() => onBookmark?.(station.id)} aria-label={`Bookmark ${station.name}`}>
                <FiBookmark />
              </button>
              <span className="fm-listeners"><FiUsers /> {Number(station.listeners || 0)}</span>
              {station.isFeatured && <span className="fm-featured">Featured</span>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default FMStationList;
