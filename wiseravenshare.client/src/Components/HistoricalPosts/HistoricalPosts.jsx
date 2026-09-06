// wiseravenshare.client/src/Components/HistoricalPosts/HistoricalPosts.jsx
import React, { useState, useEffect } from 'react';
import './HistoricalPosts.css';
import PostsTimeline from './PostsTimeline';
import DailyPostsView from './DailyPostsView';
import PostStatistics from './PostStatistics';
import HistoricalCalendar from './HistoricalCalendar';
import { useHistoricalPosts } from '../../hooks/useHistoricalPosts';

/**
 * Main Historical Posts component
 * Allows users to view and review their posts from specific dates
 */
const HistoricalPosts = () => {
  const {
    getHistoricalTimeline,
    getPostsByDate,
    getPostStatistics,
    loading,
    error
  } = useHistoricalPosts();

  const [timeline, setTimeline] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [daysBack, setDaysBack] = useState(30);
  const [viewMode, setViewMode] = useState('timeline'); // timeline, daily, statistics, calendar
  const [selectedPostsData, setSelectedPostsData] = useState(null);

  useEffect(() => {
    loadTimeline();
  }, [daysBack]);

  const loadTimeline = async () => {
    try {
      const data = await getHistoricalTimeline(daysBack);
      setTimeline(data);
    } catch (err) {
      console.error('Error loading timeline:', err);
    }
  };

  const handleDateSelect = async (date) => {
    setSelectedDate(date);
    setViewMode('daily');
    
    try {
      const posts = await getPostsByDate(date);
      setSelectedPostsData(posts);
    } catch (err) {
      console.error('Error loading posts for date:', err);
    }
  };

  const handleViewStatistics = async () => {
    setViewMode('statistics');
    
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
      const endDate = new Date();
      
      const stats = await getPostStatistics(startDate, endDate);
      setSelectedPostsData(stats);
    } catch (err) {
      console.error('Error loading statistics:', err);
    }
  };

  const handleBackToTimeline = () => {
    setViewMode('timeline');
    setSelectedDate(null);
    setSelectedPostsData(null);
  };

  if (error) {
    return (
      <div className="historical-posts">
        <div className="error-message">⚠️ {error}</div>
      </div>
    );
  }

  return (
    <div className="historical-posts">
      <div className="historical-header">
        <h1>📚 Historical Posts Archive</h1>
        <p className="subtitle">Review and explore your posts by date</p>
      </div>

      {/* Navigation Tabs */}
      <div className="view-tabs">
        <button
          className={`tab ${viewMode === 'timeline' ? 'active' : ''}`}
          onClick={() => setViewMode('timeline')}
        >
          📊 Timeline
        </button>
        <button
          className={`tab ${viewMode === 'calendar' ? 'active' : ''}`}
          onClick={() => setViewMode('calendar')}
        >
          📅 Calendar
        </button>
        <button
          className={`tab ${viewMode === 'statistics' ? 'active' : ''}`}
          onClick={handleViewStatistics}
        >
          📈 Statistics
        </button>
      </div>

      {/* Content Area */}
      <div className="historical-content">
        {loading && <div className="loading">Loading...</div>}

        {viewMode === 'timeline' && !loading && (
          <div className="timeline-container">
            <div className="timeline-controls">
              <label htmlFor="daysBack">Show last:</label>
              <select 
                id="daysBack"
                value={daysBack} 
                onChange={(e) => setDaysBack(Number(e.target.value))}
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
                <option value={365}>1 year</option>
              </select>
            </div>

            <PostsTimeline 
              timeline={timeline}
              onDateSelect={handleDateSelect}
            />
          </div>
        )}

        {viewMode === 'calendar' && !loading && (
          <HistoricalCalendar 
            onDateSelect={handleDateSelect}
          />
        )}

        {viewMode === 'daily' && selectedPostsData && !loading && (
          <DailyPostsView
            date={selectedDate}
            postsData={selectedPostsData}
            onBack={handleBackToTimeline}
          />
        )}

        {viewMode === 'statistics' && selectedPostsData && !loading && (
          <PostStatistics
            stats={selectedPostsData}
            onBack={handleBackToTimeline}
          />
        )}
      </div>
    </div>
  );
};

export default HistoricalPosts;
