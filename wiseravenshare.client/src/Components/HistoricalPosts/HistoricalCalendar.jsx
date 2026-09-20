// wiseravenshare.client/src/Components/HistoricalPosts/HistoricalCalendar.jsx
import React, { useState, useEffect } from 'react';
import './HistoricalCalendar.css';
import { useHistoricalPosts } from '../../hooks/useHistoricalPosts';

/**
 * Calendar view for browsing posts by date
 */
const HistoricalCalendar = ({ onDateSelect }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [daysWithPosts, setDaysWithPosts] = useState(new Set());
  const { getMonthSummary } = useHistoricalPosts();

  useEffect(() => {
    loadMonthData();
  }, [currentDate]);

  const loadMonthData = async () => {
    try {
      const summary = await getMonthSummary(currentDate.getFullYear(), currentDate.getMonth() + 1);
      const postDates = new Set(summary.map(s => new Date(s.date).getDate()));
      setDaysWithPosts(postDates);
    } catch (err) {
      console.error('Error loading month data:', err);
    }
  };

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleDateClick = (day) => {
    const selectedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    onDateSelect(selectedDate);
  };

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const days = [];

  // Empty cells for days before month starts
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
  }

  // Days of month
  for (let day = 1; day <= daysInMonth; day++) {
    const hasPost = daysWithPosts.has(day);
    const isToday = new Date().toDateString() === 
      new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toDateString();
    
    days.push(
      <div 
        key={day}
        className={`calendar-day ${hasPost ? 'has-posts' : ''} ${isToday ? 'today' : ''}`}
        onClick={() => onDateClick(day)}
      >
        <div className="day-number">{day}</div>
        {hasPost && <div className="post-indicator">●</div>}
      </div>
    );
  }

  const monthYear = currentDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="historical-calendar">
      <div className="calendar-header">
        <button className="btn-nav" onClick={handlePrevMonth}>←</button>
        <h3>{monthYear}</h3>
        <button className="btn-nav" onClick={handleNextMonth}>→</button>
      </div>

      <div className="calendar-weekdays">
        <div className="weekday">Sun</div>
        <div className="weekday">Mon</div>
        <div className="weekday">Tue</div>
        <div className="weekday">Wed</div>
        <div className="weekday">Thu</div>
        <div className="weekday">Fri</div>
        <div className="weekday">Sat</div>
      </div>

      <div className="calendar-grid">
        {days}
      </div>

      <div className="calendar-legend">
        <div className="legend-item">
          <div className="legend-dot has-posts"></div>
          <span>Days with posts</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot today"></div>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
};

export default HistoricalCalendar;
