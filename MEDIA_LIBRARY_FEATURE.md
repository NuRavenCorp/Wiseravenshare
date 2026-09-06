# Media Library Feature Implementation Guide

**Date:** 2026-09-05  
**Feature:** Save, organize, and hide media (photos, videos, music) from feed

---

## Overview

The Media Library feature allows WiseRavenShare users to:
- 📤 **Save** photos, videos, and music to a personal library
- 👁️ **Toggle visibility** to hide items from their public feed
- 📚 **Organize** media with tags and metadata
- ⏱️ **Schedule** publishing of media
- 📊 **Manage** their entire media collection from one place

---

## Architecture

### Backend Components

#### 1. **SavedMedia Entity** (`Wiseravenshare.Server/Entities/SavedMedia.cs`)
- Represents a media item in a user's library
- Properties:
  - `UserId`: User who owns the media
  - `MediaUrl`: URL/URI to the media file
  - `MediaType`: Photo, Video, Music, Audio, Podcast, Document
  - `IsVisibleInFeed`: Controls feed visibility (default: false/hidden)
  - `IsPublished`: Whether media has been published as a post
  - `Tags`: Array of organizational tags
  - `ScheduledPublishAt`: Optional scheduled publish time
  - `FileSizeBytes`, `DurationSeconds`: Media metadata

#### 2. **SavedMediaService** (`Wiseravenshare.Server/Services/SavedMediaService.cs`)
- Business logic for all media operations
- Key methods:
  - `SaveMediaAsync()`: Add new media to library
  - `ToggleVisibilityAsync()`: Hide/show single item
  - `BulkToggleVisibilityAsync()`: Bulk hide/show operations
  - `GetUserLibraryAsync()`: Retrieve paginated library
  - `GetHiddenMediaAsync()`: Get hidden items only
  - `GetVisibleMediaAsync()`: Get visible items only
  - `PublishMediaAsync()`: Convert saved media to post
  - `GetLibraryStatsAsync()`: Statistics dashboard data

#### 3. **SavedMediaController** (`Wiseravenshare.Server/Controllers/SavedMediaController.cs`)
- REST API endpoints
- Base route: `/api/SavedMedia`
- All endpoints require JWT authorization

#### 4. **DTOs** (`Wiseravenshare.Server/DTOs/SavedMediaDTOs.cs`)
- `CreateSavedMediaRequest`: Submit new media
- `UpdateSavedMediaRequest`: Modify existing media
- `SavedMediaResponse`: API response format
- `BulkToggleVisibilityRequest`: Bulk operations
- `MediaLibraryStatsResponse`: Statistics data

### Frontend Components

#### 1. **MediaLibrary** (`wiseravenshare.client/src/Components/MediaLibrary/MediaLibrary.jsx`)
- Main container component
- Features:
  - Tab navigation (All, Visible, Hidden, Scheduled)
  - Bulk action toolbar
  - Filter controls
  - Statistics dashboard
  - Pagination controls

#### 2. **MediaGrid** (`MediaGrid.jsx`)
- Grid display for media items
- Select all/individual selection checkboxes
- Responsive layout (auto-fill grid)

#### 3. **MediaCard** (`MediaCard.jsx`)
- Individual media item display
- Shows preview, metadata, tags
- Action menu (hide/show, download, delete, publish)
- Visibility badge (👁️ Visible / 🙈 Hidden)

#### 4. **MediaUpload** (`MediaUpload.jsx`)
- Upload new media to library
- Drag & drop support
- Form fields for title, description, type, tags
- Preview display

#### 5. **MediaFilters** (`MediaFilters.jsx`)
- Filter by media type
- Clear filters button

#### 6. **MediaStats** (`MediaStats.jsx`)
- Dashboard showing:
  - Total items, visible, hidden counts
  - Count by type (photos, videos, music, etc.)
  - Published and scheduled counts
  - Total storage size

#### 7. **MediaPagination** (`MediaPagination.jsx`)
- Page navigation
- Items per page selector (10, 20, 50, 100)
- Page info display

#### 8. **useSavedMedia Hook** (`hooks/useSavedMedia.js`)
- Custom React hook for API integration
- Methods mirror backend service methods
- Handles loading/error states

---

## API Endpoints

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/SavedMedia/save` | Save new media to library |
| GET | `/api/SavedMedia/{mediaId}` | Get specific media item |
| GET | `/api/SavedMedia/library` | Get paginated library |
| GET | `/api/SavedMedia/library/hidden` | Get hidden media only |
| GET | `/api/SavedMedia/library/visible` | Get visible media only |
| GET | `/api/SavedMedia/library/tag/{tag}` | Get media by tag |
| GET | `/api/SavedMedia/library/scheduled` | Get scheduled media |
| GET | `/api/SavedMedia/library/stats` | Get statistics |
| PUT | `/api/SavedMedia/{mediaId}` | Update media metadata |
| PATCH | `/api/SavedMedia/{mediaId}/toggle-visibility` | Toggle single item visibility |
| PATCH | `/api/SavedMedia/bulk/toggle-visibility` | Bulk toggle visibility |
| DELETE | `/api/SavedMedia/{mediaId}` | Delete media from library |
| POST | `/api/SavedMedia/publish` | Publish media as post |
| POST | `/api/SavedMedia/{mediaId}/tags/{tag}` | Add tag |
| DELETE | `/api/SavedMedia/{mediaId}/tags/{tag}` | Remove tag |

---

## Database Changes

### Migration Script
Location: `scripts/20260905_add_saved_media_table.sql`

Creates `app_data.SavedMedia` table with:
- Automatic indexes on:
  - `UserId` (common queries)
  - `UserId + IsDeleted` (active items)
  - `UserId + IsVisibleInFeed` (visibility queries)
  - `UserId + MediaType` (type filtering)
  - `ScheduledPublishAt` (scheduled tasks)
  - `Tags` (GIN index for tag searches)

---

## Implementation Checklist

### Backend Setup

- [ ] Add SavedMedia entity to DbContext
- [ ] Register SavedMediaService in DI container (Program.cs)
- [ ] Register IRepository<SavedMedia> in DI container
- [ ] Run database migration script
- [ ] Test API endpoints with Swagger/Postman

### Frontend Setup

- [ ] Add MediaLibrary component to routing
- [ ] Import useSavedMedia hook where needed
- [ ] Add navigation link to Media Library page
- [ ] Install/verify axios dependency
- [ ] Configure API_BASE_URL environment variable
- [ ] Add component to main layout/navigation

### Integration Points

```csharp
// Program.cs - Dependency Injection
builder.Services.AddScoped<ISavedMediaService, SavedMediaService>();
builder.Services.AddScoped<IRepository<SavedMedia>, GenericRepository<SavedMedia>>();

// DbContext
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    base.OnModelCreating(modelBuilder);
    
    modelBuilder.Entity<SavedMedia>()
        .HasOne(sm => sm.User)
        .WithMany()
        .HasForeignKey(sm => sm.UserId)
        .OnDelete(DeleteBehavior.Cascade);
    
    modelBuilder.Entity<SavedMedia>()
        .HasIndex(sm => new { sm.UserId, sm.IsDeleted });
    
    // Additional indexes...
}
```

---

## Usage Examples

### Backend - Save Media

```csharp
var request = new CreateSavedMediaRequest
{
    Title = "My Vacation Photo",
    Description = "Beach sunset",
    MediaType = MediaLibraryType.Photo,
    MediaUrl = "https://example.com/photo.jpg",
    ThumbnailUrl = "https://example.com/photo-thumb.jpg",
    Tags = new[] { "vacation", "beach", "summer" },
    IsVisibleInFeed = false,
    FileSizeBytes = 2048576
};

await _savedMediaService.SaveMediaAsync(userId, request);
```

### Backend - Toggle Visibility

```csharp
// Hide all vacation photos
var mediaIds = new[] { id1, id2, id3 };
var request = new BulkToggleVisibilityRequest
{
    MediaIds = mediaIds,
    IsVisibleInFeed = false
};

await _savedMediaService.BulkToggleVisibilityAsync(userId, request);
```

### Frontend - Get Library

```jsx
const { getLibrary, loading } = useSavedMedia();

useEffect(() => {
  const loadLibrary = async () => {
    const response = await getLibrary(1, 20, { mediaType: 'Photo' });
    setItems(response.items);
  };
  
  loadLibrary();
}, []);
```

### Frontend - Hide Media

```jsx
const handleHideMedia = async (mediaId) => {
  await toggleVisibility(mediaId, false);
  // Refresh UI
};
```

---

## Features & Capabilities

### 1. Visibility Control
- ✅ Hide/show individual media
- ✅ Bulk toggle visibility (up to 100 items)
- ✅ Filter library by visibility status
- ✅ Visibility badges on cards

### 2. Organization
- ✅ Tag-based categorization
- ✅ Filter by media type (photo, video, music, etc.)
- ✅ Search by tag
- ✅ Pagination support (10-100 items per page)

### 3. Media Management
- ✅ Upload/save new media
- ✅ Edit title, description, tags
- ✅ Delete from library
- ✅ Download media
- ✅ View metadata (size, duration, date)

### 4. Publishing
- ✅ Publish saved media as feed posts
- ✅ Schedule media for automatic publishing
- ✅ Track published status

### 5. Statistics
- ✅ Total item count
- ✅ Breakdown by type (photos, videos, music)
- ✅ Visible vs hidden count
- ✅ Published vs draft count
- ✅ Total storage used
- ✅ Scheduled items count

---

## UI/UX Features

- 📱 **Responsive Design**: Mobile-friendly grid layout
- 🎨 **Modern Styling**: Gradient backgrounds, smooth animations
- 🔍 **Quick Filters**: One-click filtering by type and visibility
- ⚡ **Bulk Actions**: Select multiple items for quick operations
- 📊 **Dashboard**: At-a-glance statistics
- 🎯 **Intuitive Controls**: Hide/show/delete from card menu
- 📎 **Drag & Drop**: Upload media by dragging

---

## Security Considerations

- ✅ JWT authorization on all endpoints
- ✅ User ID verification (users can only access own media)
- ✅ Soft deletes (media marked as deleted, not purged)
- ✅ No direct file storage access required
- ✅ Rate limiting recommended for upload endpoint
- ✅ File type validation on upload

---

## Performance Optimizations

- ✅ Indexed database queries
- ✅ Pagination to limit result sets
- ✅ GIN index on tags for fast searches
- ✅ Lazy loading in UI
- ✅ Efficient grid rendering
- ✅ Bulk operations reduce API calls

---

## Future Enhancements

- 🔮 AI-powered tagging and categorization
- 🔮 Advanced search with full-text indexing
- 🔮 Media sharing with specific users/groups
- 🔮 Automatic backup and versioning
- 🔮 Analytics on media performance
- 🔮 Integration with AI content creation tools
- 🔮 Collaboration on media projects
- 🔮 Custom storage quotas by subscription tier

---

## Testing Checklist

### API Tests
- [ ] Create media (POST /save)
- [ ] Retrieve single media (GET /{id})
- [ ] List library with pagination
- [ ] Filter by type
- [ ] Filter by visibility
- [ ] Toggle single visibility
- [ ] Bulk toggle visibility
- [ ] Delete media
- [ ] Add/remove tags
- [ ] Get statistics
- [ ] Schedule publishing

### UI Tests
- [ ] Media grid displays correctly
- [ ] Responsive on mobile/tablet
- [ ] Upload form works
- [ ] Selection checkboxes functional
- [ ] Bulk actions visible when items selected
- [ ] Filters apply correctly
- [ ] Pagination navigates properly
- [ ] Action menu opens/closes
- [ ] Hide/show toggles update display
- [ ] Drag & drop works

---

## Support & Documentation

For questions or issues:
1. Check API response status codes and error messages
2. Verify JWT token is valid and includes user ID claim
3. Ensure user ID matches authenticated user
4. Check database indexes are created
5. Review service logs for validation errors

---

**Implementation Complete:** 2026-09-05  
**Status:** Ready for integration and testing
