// wiseravenshare.client/src/Components/HistoricalPosts/PostsTimeline.jsx
import React from 'react';
import './PostsTimeline.css';

/**
 * Timeline view showing historical posts
 */
const PostsTimeline = ({ timeline, onDateSelect }) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatEngagement = (count) => {
    if (count > 1000) return (count / 1000).toFixed(1) + 'k';
    return count;
  };

  if (!timeline || timeline.length === 0) {
    return (
      <div className="timeline-empty">
        <p>No posts found in this period</p>
      </div>
    );
  }

  return (
    <div className="posts-timeline">
      <div className="timeline-container">
        {timeline.map((day, index) => (
          <div 
            key={index} 
            className={`timeline-item ${day.hasPosts ? 'has-posts' : 'empty'}`}
            onClick={() => day.hasPosts && onDateSelect(day.date)}
            style={{ cursor: day.hasPosts ? 'pointer' : 'default' }}
          >
            {/* Timeline dot */}
            <div className="timeline-dot">
              {day.hasPosts ? '●' : '○'}
            </div>

            {/* Timeline card */}
            <div className="timeline-card">
              <div className="card-header">
                <div className="date-info">
                  <div className="date-display">{formatDate(day.date)}</div>
                  <div className="day-name">{day.dayOfWeek}</div>
                </div>
                <div className="post-count">
                  {day.postCount} post{day.postCount !== 1 ? 's' : ''}
                </div>
              </div>

              {day.hasPosts && (
                <div className="card-body">
                  <div className="preview-text">
                    {day.preview ? day.preview.substring(0, 80) + '...' : 'No content preview'}
                  </div>
                  
                  <div className="engagement-stats">
                    <span className="stat">
                      <span className="emoji">❤️</span>
                      {formatEngagement(day.totalEngagement)} engagement
                    </span>
                  </div>

                  <button className="btn-view-posts">
                    View Posts →
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PostsTimeline;
