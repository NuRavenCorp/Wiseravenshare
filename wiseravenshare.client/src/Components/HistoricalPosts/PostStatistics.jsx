// wiseravenshare.client/src/Components/HistoricalPosts/PostStatistics.jsx
import React from 'react';
import './PostStatistics.css';

/**
 * Statistics view for posts in a date range
 */
const PostStatistics = ({ stats, onBack }) => {
  if (!stats) {
    return (
      <div className="post-statistics">
        <button className="btn-back" onClick={onBack}>← Back</button>
        <p>No statistics available</p>
      </div>
    );
  }

  const engagementRate = stats.totalPosts > 0 
    ? ((stats.totalEngagement / stats.totalPosts) * 100).toFixed(1)
    : 0;

  const calculateTrend = (value, average) => {
    if (average === 0) return 0;
    return (((value - average) / average) * 100).toFixed(1);
  };

  return (
    <div className="post-statistics">
      <button className="btn-back" onClick={onBack}>← Back</button>

      <div className="statistics-header">
        <h2>📊 Post Analytics</h2>
        <p className="date-range">{stats.dayRange} days analyzed</p>
      </div>

      {/* Main Statistics Grid */}
      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-label">Total Posts</div>
          <div className="stat-value">{stats.totalPosts}</div>
          <div className="stat-detail">
            {stats.averagePostsPerDay.toFixed(1)} per day
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">❤️ Total Likes</div>
          <div className="stat-value">{stats.totalLikes}</div>
          <div className="stat-detail">
            {stats.totalPosts > 0 
              ? (stats.totalLikes / stats.totalPosts).toFixed(1) 
              : 0} per post
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">🔁 Total Reposts</div>
          <div className="stat-value">{stats.totalReposts}</div>
          <div className="stat-detail">
            {stats.totalPosts > 0 
              ? (stats.totalReposts / stats.totalPosts).toFixed(1) 
              : 0} per post
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">💬 Total Comments</div>
          <div className="stat-value">{stats.totalComments}</div>
          <div className="stat-detail">
            {stats.totalPosts > 0 
              ? (stats.totalComments / stats.totalPosts).toFixed(1) 
              : 0} per post
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">👁️ Total Shares</div>
          <div className="stat-value">{stats.totalShares}</div>
          <div className="stat-detail">
            {stats.totalPosts > 0 
              ? (stats.totalShares / stats.totalPosts).toFixed(1) 
              : 0} per post
          </div>
        </div>

        <div className="stat-card highlight">
          <div className="stat-label">📈 Total Engagement</div>
          <div className="stat-value">{stats.totalEngagement}</div>
          <div className="stat-detail">
            {engagementRate}% per post
          </div>
        </div>
      </div>

      {/* Most Engaged Post */}
      {stats.mostEngagedPost && (
        <div className="most-engaged-section">
          <h3>⭐ Most Engaged Post</h3>
          <div className="most-engaged-card">
            <p className="engaged-post-text">
              {stats.mostEngagedPost.substring(0, 200)}
              {stats.mostEngagedPost.length > 200 ? '...' : ''}
            </p>
          </div>
        </div>
      )}

      {/* Engagement Breakdown Chart */}
      <div className="engagement-breakdown">
        <h3>📊 Engagement Breakdown</h3>
        <div className="breakdown-bars">
          <div className="breakdown-item">
            <div className="label">Likes</div>
            <div className="bar-container">
              <div 
                className="bar likes"
                style={{
                  width: `${(stats.totalLikes / (stats.totalLikes + stats.totalReposts + stats.totalComments + stats.totalShares || 1)) * 100}%`
                }}
              ></div>
            </div>
            <div className="value">{stats.totalLikes}</div>
          </div>

          <div className="breakdown-item">
            <div className="label">Reposts</div>
            <div className="bar-container">
              <div 
                className="bar reposts"
                style={{
                  width: `${(stats.totalReposts / (stats.totalLikes + stats.totalReposts + stats.totalComments + stats.totalShares || 1)) * 100}%`
                }}
              ></div>
            </div>
            <div className="value">{stats.totalReposts}</div>
          </div>

          <div className="breakdown-item">
            <div className="label">Comments</div>
            <div className="bar-container">
              <div 
                className="bar comments"
                style={{
                  width: `${(stats.totalComments / (stats.totalLikes + stats.totalReposts + stats.totalComments + stats.totalShares || 1)) * 100}%`
                }}
              ></div>
            </div>
            <div className="value">{stats.totalComments}</div>
          </div>

          <div className="breakdown-item">
            <div className="label">Shares</div>
            <div className="bar-container">
              <div 
                className="bar shares"
                style={{
                  width: `${(stats.totalShares / (stats.totalLikes + stats.totalReposts + stats.totalComments + stats.totalShares || 1)) * 100}%`
                }}
              ></div>
            </div>
            <div className="value">{stats.totalShares}</div>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="key-metrics">
        <h3>🎯 Key Metrics</h3>
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-title">Avg Engagement per Post</div>
            <div className="metric-value">
              {stats.totalPosts > 0 
                ? (stats.totalEngagement / stats.totalPosts).toFixed(1)
                : 0}
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-title">Avg Posts per Day</div>
            <div className="metric-value">
              {stats.averagePostsPerDay.toFixed(1)}
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-title">Engagement Rate</div>
            <div className="metric-value">{engagementRate}%</div>
          </div>

          <div className="metric-card">
            <div className="metric-title">Peak Engagement Day</div>
            <div className="metric-value">
              {stats.totalLikes > 0 ? '📈 Active' : '📉 Quiet'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostStatistics;
