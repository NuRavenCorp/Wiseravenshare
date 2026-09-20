// wiseravenshare.client/src/Components/MediaLibrary/MediaFilters.jsx
import React from 'react';
import './MediaFilters.css';

/**
 * Filter component for media library
 */
const MediaFilters = ({ filterType, onFilterTypeChange, onClearFilters }) => {
  const mediaTypes = ['Photo', 'Video', 'Music', 'Audio', 'Podcast', 'Document'];

  return (
    <div className="media-filters">
      <div className="filter-group">
        <label>Filter by Type:</label>
        <div className="filter-buttons">
          <button 
            className={`filter-btn ${!filterType ? 'active' : ''}`}
            onClick={() => onFilterTypeChange(null)}
          >
            All
          </button>
          {mediaTypes.map(type => (
            <button 
              key={type}
              className={`filter-btn ${filterType === type ? 'active' : ''}`}
              onClick={() => onFilterTypeChange(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {filterType && (
        <button className="btn-clear-filters" onClick={onClearFilters}>
          ✕ Clear Filters
        </button>
      )}
    </div>
  );
};

export default MediaFilters;
