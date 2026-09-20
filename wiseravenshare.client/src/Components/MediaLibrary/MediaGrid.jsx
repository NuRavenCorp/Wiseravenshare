// wiseravenshare.client/src/Components/MediaLibrary/MediaGrid.jsx
import React from 'react';
import MediaCard from './MediaCard';
import './MediaGrid.css';

/**
 * Grid display for media items with selection support
 */
const MediaGrid = ({
  items,
  selectedItems,
  onSelectItem,
  onSelectAll,
  onToggleVisibility,
  onDelete,
  selectAllChecked
}) => {
  return (
    <div className="media-grid-container">
      <div className="select-all-bar">
        <input 
          type="checkbox" 
          checked={selectAllChecked}
          onChange={onSelectAll}
          aria-label="Select all media"
        />
        <label>Select All</label>
      </div>

      <div className="media-grid">
        {items.map(item => (
          <MediaCard
            key={item.id}
            media={item}
            isSelected={selectedItems.has(item.id)}
            onSelect={() => onSelectItem(item.id)}
            onToggleVisibility={() => onToggleVisibility(item.id, item.isVisibleInFeed)}
            onDelete={() => onDelete(item.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default MediaGrid;
