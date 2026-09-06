# Historical Posts Feature Documentation

## Overview

The Historical Posts feature allows users to view, review, and analyze their posts from specific dates in the past. This feature provides comprehensive tools for archiving posts by date and understanding engagement patterns over time.

## Features

### 1. Timeline View
- Visual timeline showing the last N days of posting activity
- Color-coded indicators showing which days have posts
- Quick preview of content from each day
- Engagement metrics at a glance (likes, reposts, comments)
- Customizable date range (7, 14, 30, 60, 90, or 365 days)

### 2. Calendar View
- Interactive monthly calendar showing posting activity
- Visual indicators for days with posts
- Month navigation (previous/next)
- Single-click to view posts from any date
- Legend showing indicators for post days and today's date

### 3. Daily Posts View
- Detailed view of all posts from a specific date
- Post content with metadata (time created, engagement stats)
- Media preview with thumbnails
- Engagement breakdown (likes, reposts, comments, shares, views)
- Pagination for dates with many posts

### 4. Statistics Dashboard
- Comprehensive analytics for a date range
- Key metrics: total posts, likes, reposts, comments, shares
- Average posts per day calculation
- Engagement rate analysis
- Visual breakdown charts showing engagement distribution
- Most engaged post highlight
- Trend analysis

### 5. Quick Access Views
- Today's posts endpoint
- Yesterday's posts endpoint
- This week's posts endpoint
- This month's posts endpoint

## Architecture

### Backend Stack

#### Service: `HistoricalPostsService`
**Location:** `Wiseravenshare.Server/Services/HistoricalPostsService.cs`

**Responsibilities:**
- Retrieve posts by date
- Calculate date-based summaries
- Compute engagement statistics
- Generate timeline data
- Auto-archive posts after creation

**Key Methods:**
- `GetPostsByDateAsync(userId, date, page, pageSize)` - Get paginated posts from a specific date
- `GetPostsForDateRangeAsync(userId, startDate, endDate, page, pageSize)` - Get posts within date range
- `GetMonthSummaryAsync(userId, year, month)` - Monthly breakdown by day
- `GetYearSummaryAsync(userId, year)` - Yearly breakdown by day
- `GetPostsByWeekAsync(userId, weekStartDate, page, pageSize)` - Weekly view
- `GetHistoricalTimelineAsync(userId, daysBack)` - Timeline for last N days
- `GetPostStatisticsAsync(userId, startDate, endDate)` - Date range statistics
- `AutoSavePostToDailyArchiveAsync(postId)` - Hook for auto-archiving
- `HasPostsForDateAsync(userId, date)` - Check date for posts

**Dependencies:**
- `IPostRepository` - Access post data
- `IUserRepository` - User validation
- `ILogger<HistoricalPostsService>` - Logging

#### Controller: `HistoricalPostsController`
**Location:** `Wiseravenshare.Server/Controllers/HistoricalPostsController.cs`

**Base Route:** `/api/HistoricalPosts`

**Endpoints:**

| Method | Route | Parameters | Returns | Description |
|--------|-------|-----------|---------|-------------|
| GET | `/by-date` | date, page, pageSize | DailyPostsArchiveResponse | Posts from specific date |
| GET | `/by-date-range` | startDate, endDate, page, pageSize | DailyPostsArchiveResponse | Posts in date range |
| GET | `/month/{year}/{month}` | year, month | PostDateSummary[] | Monthly summary |
| GET | `/year/{year}` | year | PostDateSummary[] | Yearly summary |
| GET | `/by-week` | weekStartDate, page, pageSize | DailyPostsArchiveResponse | Weekly posts |
| GET | `/timeline` | daysBack | HistoricalDaySnapshot[] | Timeline view |
| GET | `/statistics` | startDate, endDate | PostStatisticsResponse | Date range stats |
| GET | `/has-posts` | date | {date, hasPosts} | Check if posts exist |
| GET | `/today` | page, pageSize | DailyPostsArchiveResponse | Today's posts |
| GET | `/yesterday` | page, pageSize | DailyPostsArchiveResponse | Yesterday's posts |
| GET | `/this-week` | page, pageSize | DailyPostsArchiveResponse | This week's posts |
| GET | `/this-month` | - | PostDateSummary[] | This month's summary |

**Security:**
- All endpoints require JWT authentication via `[Authorize]` attribute
- User ID extracted from JWT claims
- Server-side filtering ensures users only see their own posts

#### Data Transfer Objects (DTOs)

**DailyPostsArchiveResponse**
```csharp
{
  "date": DateTime,
  "dayOfWeek": string,
  "posts": PostDto[],
  "totalPostsForDay": int,
  "page": int,
  "pageSize": int,
  "totalPages": int
}
```

**PostDateSummary**
```csharp
{
  "date": DateTime,
  "dayOfWeek": string,
  "postCount": int,
  "likeCount": int,
  "repostCount": int,
  "commentCount": int,
  "previewText": string
}
```

**HistoricalDaySnapshot**
```csharp
{
  "date": DateTime,
  "dayOfWeek": string,
  "postCount": int,
  "totalEngagement": int,
  "preview": string,
  "hasPosts": bool
}
```

**PostStatisticsResponse**
```csharp
{
  "totalPosts": int,
  "averagePostsPerDay": double,
  "totalLikes": int,
  "totalReposts": int,
  "totalComments": int,
  "totalShares": int,
  "totalEngagement": int,
  "mostEngagedPost": string,
  "dayRange": int
}
```

### Frontend Stack

#### Custom Hook: `useHistoricalPosts`
**Location:** `wiseravenshare.client/src/hooks/useHistoricalPosts.js`

**Features:**
- Centralized API communication
- Automatic JWT token management
- Error handling and loading states
- 14 methods for all historical posts operations

**Methods:**
- `getPostsByDate(date, page, pageSize)`
- `getPostsByDateRange(startDate, endDate, page, pageSize)`
- `getMonthSummary(year, month)`
- `getYearSummary(year)`
- `getPostsByWeek(weekStartDate, page, pageSize)`
- `getHistoricalTimeline(daysBack)`
- `getPostStatistics(startDate, endDate)`
- `hasPostsForDate(date)`
- `getTodaysPosts(page, pageSize)`
- `getYesterdaysPosts(page, pageSize)`
- `getThisWeeksPosts(page, pageSize)`
- `getThisMonthsPosts()`

#### Components

**HistoricalPosts (Main Container)**
- Tab navigation (Timeline, Calendar, Statistics)
- View mode management
- Date selection handling
- Integration of all sub-components

**PostsTimeline**
- Vertical timeline visualization
- Day-by-day engagement preview
- Interactive date selection
- Responsive grid layout

**DailyPostsView**
- Detailed post listing for specific date
- Post content rendering
- Media gallery with thumbnails
- Engagement statistics display
- Pagination controls

**PostStatistics**
- Comprehensive analytics dashboard
- Key metrics cards
- Engagement breakdown charts
- Most engaged post highlight
- Trend analysis visualization

**HistoricalCalendar**
- Interactive monthly calendar
- Post day indicators
- Month navigation
- Quick date selection
- Legend showing indicators

#### Styling

6 CSS files with responsive design:
- `HistoricalPosts.css` - Main layout and tabs (300+ lines)
- `PostsTimeline.css` - Timeline styling (250+ lines)
- `DailyPostsView.css` - Daily view styling (250+ lines)
- `PostStatistics.css` - Statistics dashboard (400+ lines)
- `HistoricalCalendar.css` - Calendar styling (300+ lines)

**Responsive Breakpoints:**
- 1024px - Tablet
- 768px - Small tablet/phone
- 480px - Mobile

**Color Palette:**
- Primary: #3498db (Blue)
- Success: #2ecc71 (Green)
- Danger: #e74c3c (Red)
- Neutral: #95a5a6 (Gray)

## Integration Checklist

### Backend Integration

1. **Register Services in Program.cs:**
```csharp
services.AddScoped<IHistoricalPostsService, HistoricalPostsService>();
services.AddScoped<IPostRepository, PostRepository>(); // if not already registered
```

2. **Verify DbContext:**
- Ensure DbSet<Post> is configured
- Verify Post entity has required relationships
- Confirm indexes exist on CreatedAt, UserId, IsDeleted

3. **Wire Auto-Save Hook:**
In `PostService.CreatePostAsync()`:
```csharp
var newPost = new Post { /* ... */ };
await _postRepository.AddAsync(newPost);
await _historicalPostsService.AutoSavePostToDailyArchiveAsync(newPost.Id);
```

### Frontend Integration

1. **Add Route in Router:**
```jsx
import HistoricalPosts from './Components/HistoricalPosts/HistoricalPosts';

<Route path="/historical-posts" element={<HistoricalPosts />} />
```

2. **Add Navigation Link:**
In main navigation/header component:
```jsx
<Link to="/historical-posts">📚 Archives</Link>
```

3. **Verify API Configuration:**
- Set `REACT_APP_API_URL` environment variable
- Test token storage in localStorage

## API Usage Examples

### Timeline View (Last 30 Days)
```bash
GET /api/HistoricalPosts/timeline?daysBack=30
Authorization: Bearer {token}
```

### Get Posts from Specific Date
```bash
GET /api/HistoricalPosts/by-date?date=2024-01-15&page=1&pageSize=20
Authorization: Bearer {token}
```

### Get Month Summary
```bash
GET /api/HistoricalPosts/month/2024/1
Authorization: Bearer {token}
```

### Get Statistics for Date Range
```bash
GET /api/HistoricalPosts/statistics?startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer {token}
```

### Get This Week's Posts
```bash
GET /api/HistoricalPosts/this-week?page=1&pageSize=20
Authorization: Bearer {token}
```

## Performance Optimization

### Database Optimization
- Index on `Post.UserId` for user filtering
- Index on `Post.CreatedAt` for date-based queries
- Composite index on (UserId, CreatedAt, IsDeleted) for common queries
- GIN index on tags array (if using Post.Tags)

### Query Patterns
- Pagination to limit result sets (default pageSize: 20, max: 100)
- Date filtering to reduce dataset size
- Lazy loading of media thumbnails
- Client-side caching of timeline data

### Frontend Optimization
- Virtualized list rendering for large datasets
- Image lazy loading in media galleries
- Memoization of components
- CSS Grid for responsive layouts

## Security Considerations

### Authentication
- All endpoints require valid JWT token
- Token must contain valid user ID in NameIdentifier claim
- Server-side user ID validation on every request

### Authorization
- Users can only view their own posts
- Database queries filtered by authenticated user ID
- No cross-user data leakage

### Input Validation
- Date parameters validated for reasonable ranges
- Page/pageSize bounded to prevent abuse (page >= 1, pageSize <= 100)
- Year bounded to 2000-present year

## Testing Checklist

### Backend Tests
- [ ] GetPostsByDateAsync returns only posts from specified date
- [ ] GetPostsForDateRangeAsync includes both start and end dates
- [ ] GetMonthSummaryAsync correctly groups by day
- [ ] GetHistoricalTimelineAsync returns correct daysBack count
- [ ] GetPostStatisticsAsync calculates accurate engagement metrics
- [ ] AutoSavePostToDailyArchiveAsync logs correctly
- [ ] HasPostsForDateAsync returns true/false correctly
- [ ] Unauthorized requests are rejected
- [ ] Non-existent dates return empty results
- [ ] Pagination works correctly

### Frontend Tests
- [ ] Timeline view loads and displays data
- [ ] Calendar view renders correctly
- [ ] Daily posts view shows content with media
- [ ] Statistics dashboard calculates metrics
- [ ] Date selection navigates between views
- [ ] Navigation buttons work correctly
- [ ] Responsive design works on mobile/tablet
- [ ] Error states display user-friendly messages
- [ ] Loading states show while fetching

### Integration Tests
- [ ] API endpoints return expected status codes
- [ ] Component renders without errors
- [ ] User can navigate between all views
- [ ] Token refresh works correctly
- [ ] Date filtering returns correct posts

## Future Enhancements

1. **Advanced Filtering**
   - Filter by engagement level
   - Filter by content type (text, media, links)
   - Filter by hashtags or mentions

2. **Export Features**
   - Export posts as CSV
   - Export monthly report as PDF
   - Archive backup download

3. **Analytics Deep Dive**
   - Follower growth tracking
   - Engagement rate trends
   - Peak posting time analysis
   - Content performance comparison

4. **Sharing & Collaboration**
   - Share archive links
   - Collaborate on post analysis
   - Team analytics dashboard

5. **AI-Powered Features**
   - Content recommendations based on performance
   - Auto-tagging historical posts
   - Engagement prediction

## Troubleshooting

### No Posts Appearing
- Verify user has created posts
- Check date range filter
- Ensure JWT token is valid
- Check browser console for errors

### Pagination Not Working
- Verify pageSize is between 1-100
- Check page number is >= 1
- Verify total items exceed page size

### Statistics Showing Zeros
- Confirm posts have engagement data
- Check date range includes posts with engagement
- Verify engagement fields are populated

### Performance Issues
- Check database indexes exist
- Reduce daysBack parameter in timeline
- Use smaller pageSize values
- Clear browser cache

## Support & Documentation

- **Backend Issues:** Check HistoricalPostsService.cs logging
- **Frontend Issues:** Check browser console for errors
- **API Issues:** Verify Bearer token and required parameters
- **Database Issues:** Verify Post table structure and indexes

---

**Version:** 1.0  
**Last Updated:** 2024  
**Status:** Production Ready
