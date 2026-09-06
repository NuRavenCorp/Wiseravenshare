// wiseravenshare.client/src/Components/MediaLibrary/MediaPagination.jsx
import React from 'react';
import './MediaPagination.css';

/**
 * Pagination component for media library
 */
const MediaPagination = ({ currentPage, pageSize, totalCount, onPageChange, onPageSizeChange }) => {
  const totalPages = Math.ceil(totalCount / pageSize);
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages = [];
    const maxPages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
    let endPage = Math.min(totalPages, startPage + maxPages - 1);

    if (endPage - startPage < maxPages - 1) {
      startPage = Math.max(1, endPage - maxPages + 1);
    }

    if (startPage > 1) {
      pages.push(1);
      if (startPage > 2) pages.push('...');
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="media-pagination">
      <div className="pagination-info">
        Showing {startItem} to {endItem} of {totalCount} items
      </div>

      <div className="page-size-selector">
        <label htmlFor="pageSize">Items per page:</label>
        <select 
          id="pageSize"
          value={pageSize} 
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>

      <div className="page-numbers">
        <button 
          className="page-btn prev"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          title="Previous page"
        >
          ← Prev
        </button>

        {getPageNumbers().map((page, idx) => (
          page === '...' ? (
            <span key={`dots-${idx}`} className="page-dots">...</span>
          ) : (
            <button
              key={page}
              className={`page-btn number ${currentPage === page ? 'active' : ''}`}
              onClick={() => onPageChange(page)}
              disabled={currentPage === page}
            >
              {page}
            </button>
          )
        ))}

        <button 
          className="page-btn next"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          title="Next page"
        >
          Next →
        </button>
      </div>
    </div>
  );
};

export default MediaPagination;
