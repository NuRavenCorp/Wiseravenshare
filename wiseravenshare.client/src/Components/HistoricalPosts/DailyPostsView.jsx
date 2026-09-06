// wiseravenshare.client/src/Components/HistoricalPosts/DailyPostsView.jsx
import React, { useState } from 'react';
import './DailyPostsView.css';

/**
 * Detailed view of posts from a specific day
 */
const DailyPostsView = ({ date, postsData, onBack }) => {
  const [currentPage, setCurrentPage] = useState(postsData.page || 1);

  const formatDate = (dateString) => {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (dateString) => {
    const d = new Date(dateString);
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    // Fetch new page data
  };

  if (!postsData.posts || postsData.posts.length === 0) {
    return (
      <div className="daily-posts-view">
        <button className="btn-back" onClick={onBack}>← Back to Timeline</button>
        <div className="empty-day">
          <p>📭 No posts for {formatDate(date)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="daily-posts-view">
      <button className="btn-back" onClick={onBack}>← Back to Timeline</button>

      <div className="daily-header">
        <h2>{formatDate(date)}</h2>
        <p className="day-stat">{postsData.totalPostsForDay} posts</p>
      </div>

      <div className="posts-list">
        {postsData.posts.map((post) => (
          <div key={post.id} className="post-item">
            <div className="post-time">{formatTime(post.createdAt)}</div>
            
            <div className="post-content">
              <p className="post-text">{post.content}</p>
              
              {post.mediaUrls && post.mediaUrls.length > 0 && (
                <div className="post-media">
                  {post.mediaUrls.map((url, idx) => (
                    <img 
                      key={idx}
                      src={url} 
                      alt="post media"
                      className="media-thumbnail"
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="post-stats">
              <span className="stat">❤️ {post.likesCount}</span>
              <span className="stat">🔁 {post.repostsCount}</span>
              <span className="stat">💬 {post.commentsCount}</span>
              <span className="stat">👁️ {post.viewsCount}</span>
            </div>
          </div>
        ))}
      </div>

      {postsData.totalPages > 1 && (
        <div className="pagination">
          <button 
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            ← Previous
          </button>
          <span className="page-info">
            Page {currentPage} of {postsData.totalPages}
          </span>
          <button 
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === postsData.totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};

export default DailyPostsView;
