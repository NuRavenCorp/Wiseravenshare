// Wiseravenshare.Server/Services/SavedMediaService.cs
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Services
{
    /// <summary>
    /// Service for managing user's saved media library
    /// </summary>
    public interface ISavedMediaService
    {
        Task<SavedMediaResponse> SaveMediaAsync(Guid userId, CreateSavedMediaRequest request);
        Task<SavedMediaResponse> UpdateMediaAsync(Guid userId, Guid mediaId, UpdateSavedMediaRequest request);
        Task<SavedMediaResponse> GetMediaAsync(Guid userId, Guid mediaId);
        Task<MediaLibraryResponse> GetUserLibraryAsync(Guid userId, int page = 1, int pageSize = 20, MediaLibraryType? filterType = null, bool? onlyVisible = null);
        Task<MediaLibraryResponse> GetHiddenMediaAsync(Guid userId, int page = 1, int pageSize = 20);
        Task<MediaLibraryResponse> GetVisibleMediaAsync(Guid userId, int page = 1, int pageSize = 20);
        Task<MediaLibraryResponse> GetTaggedMediaAsync(Guid userId, string tag, int page = 1, int pageSize = 20);
        Task<MediaLibraryResponse> GetScheduledMediaAsync(Guid userId, int page = 1, int pageSize = 20);
        Task ToggleVisibilityAsync(Guid userId, Guid mediaId, bool isVisible);
        Task BulkToggleVisibilityAsync(Guid userId, BulkToggleVisibilityRequest request);
        Task DeleteMediaAsync(Guid userId, Guid mediaId);
        Task<SavedMediaResponse> PublishMediaAsync(Guid userId, PublishMediaRequest request);
        Task<MediaLibraryStatsResponse> GetLibraryStatsAsync(Guid userId);
        Task AddTagToMediaAsync(Guid userId, Guid mediaId, string tag);
        Task RemoveTagFromMediaAsync(Guid userId, Guid mediaId, string tag);
        Task CleanupScheduledPublishesAsync();
    }

    public class SavedMediaService : ISavedMediaService
    {
        private readonly IRepository<SavedMedia> _savedMediaRepository;
        private readonly IUserRepository _userRepository;
        private readonly IPostService _postService;
        private readonly ILogger<SavedMediaService> _logger;

        public SavedMediaService(
            IRepository<SavedMedia> savedMediaRepository,
            IUserRepository userRepository,
            IPostService postService,
            ILogger<SavedMediaService> logger)
        {
            _savedMediaRepository = savedMediaRepository;
            _userRepository = userRepository;
            _postService = postService;
            _logger = logger;
        }

        public async Task<SavedMediaResponse> SaveMediaAsync(Guid userId, CreateSavedMediaRequest request)
        {
            _logger.LogInformation("User {UserId} saving media: {Title}", userId, request.Title);

            // Verify user exists
            var user = await _userRepository.GetByIdAsync(userId);
            if (user == null)
                throw new ArgumentException($"User {userId} not found");

            var media = new SavedMedia
            {
                UserId = userId,
                Title = request.Title,
                Description = request.Description,
                MediaType = request.MediaType,
                MediaUrl = request.MediaUrl,
                ThumbnailUrl = request.ThumbnailUrl,
                MediaMetadata = request.MediaMetadata,
                IsVisibleInFeed = request.IsVisibleInFeed,
                Tags = request.Tags,
                FileSizeBytes = request.FileSizeBytes,
                DurationSeconds = request.DurationSeconds,
                ScheduledPublishAt = request.ScheduledPublishAt,
                SourcePostId = request.SourcePostId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            await _savedMediaRepository.AddAsync(media);
            await _savedMediaRepository.SaveChangesAsync();

            _logger.LogInformation("Media saved successfully with ID: {MediaId}", media.Id);
            return MapToResponse(media);
        }

        public async Task<SavedMediaResponse> UpdateMediaAsync(Guid userId, Guid mediaId, UpdateSavedMediaRequest request)
        {
            _logger.LogInformation("User {UserId} updating media: {MediaId}", userId, mediaId);

            var media = await GetAndVerifyMediaOwnershipAsync(userId, mediaId);

            if (!string.IsNullOrEmpty(request.Title))
                media.Title = request.Title;

            if (!string.IsNullOrEmpty(request.Description))
                media.Description = request.Description;

            if (!string.IsNullOrEmpty(request.ThumbnailUrl))
                media.ThumbnailUrl = request.ThumbnailUrl;

            if (request.IsVisibleInFeed.HasValue)
                media.IsVisibleInFeed = request.IsVisibleInFeed.Value;

            if (request.Tags != null)
                media.Tags = request.Tags;

            if (request.ScheduledPublishAt.HasValue)
                media.ScheduledPublishAt = request.ScheduledPublishAt.Value;

            media.UpdatedAt = DateTime.UtcNow;

            _savedMediaRepository.Update(media);
            await _savedMediaRepository.SaveChangesAsync();

            _logger.LogInformation("Media {MediaId} updated successfully", mediaId);
            return MapToResponse(media);
        }

        public async Task<SavedMediaResponse> GetMediaAsync(Guid userId, Guid mediaId)
        {
            var media = await GetAndVerifyMediaOwnershipAsync(userId, mediaId);
            return MapToResponse(media);
        }

        public async Task<MediaLibraryResponse> GetUserLibraryAsync(Guid userId, int page = 1, int pageSize = 20, MediaLibraryType? filterType = null, bool? onlyVisible = null)
        {
            _logger.LogInformation("Fetching media library for user {UserId}, page {Page}, size {PageSize}", userId, page, pageSize);

            var query = _savedMediaRepository.GetAll()
                .Where(m => m.UserId == userId && !m.IsDeleted);

            if (filterType.HasValue)
                query = query.Where(m => m.MediaType == filterType.Value);

            if (onlyVisible.HasValue)
                query = query.Where(m => m.IsVisibleInFeed == onlyVisible.Value);

            var totalCount = query.Count();
            var items = query
                .OrderByDescending(m => m.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToList();

            return new MediaLibraryResponse
            {
                Items = items.Select(MapToResponse).ToList(),
                TotalCount = totalCount,
                PageNumber = page,
                PageSize = pageSize
            };
        }

        public async Task<MediaLibraryResponse> GetHiddenMediaAsync(Guid userId, int page = 1, int pageSize = 20)
        {
            return await GetUserLibraryAsync(userId, page, pageSize, onlyVisible: false);
        }

        public async Task<MediaLibraryResponse> GetVisibleMediaAsync(Guid userId, int page = 1, int pageSize = 20)
        {
            return await GetUserLibraryAsync(userId, page, pageSize, onlyVisible: true);
        }

        public async Task<MediaLibraryResponse> GetTaggedMediaAsync(Guid userId, string tag, int page = 1, int pageSize = 20)
        {
            _logger.LogInformation("Fetching media tagged with {Tag} for user {UserId}", tag, userId);

            var query = _savedMediaRepository.GetAll()
                .Where(m => m.UserId == userId && !m.IsDeleted && m.Tags != null && m.Tags.Contains(tag))
                .OrderByDescending(m => m.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize);

            var items = query.ToList();
            var totalCount = _savedMediaRepository.GetAll()
                .Count(m => m.UserId == userId && !m.IsDeleted && m.Tags != null && m.Tags.Contains(tag));

            return new MediaLibraryResponse
            {
                Items = items.Select(MapToResponse).ToList(),
                TotalCount = totalCount,
                PageNumber = page,
                PageSize = pageSize
            };
        }

        public async Task<MediaLibraryResponse> GetScheduledMediaAsync(Guid userId, int page = 1, int pageSize = 20)
        {
            _logger.LogInformation("Fetching scheduled media for user {UserId}", userId);

            var now = DateTime.UtcNow;
            var query = _savedMediaRepository.GetAll()
                .Where(m => m.UserId == userId && !m.IsDeleted && m.ScheduledPublishAt.HasValue && m.ScheduledPublishAt > now)
                .OrderBy(m => m.ScheduledPublishAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize);

            var items = query.ToList();
            var totalCount = _savedMediaRepository.GetAll()
                .Count(m => m.UserId == userId && !m.IsDeleted && m.ScheduledPublishAt.HasValue && m.ScheduledPublishAt > now);

            return new MediaLibraryResponse
            {
                Items = items.Select(MapToResponse).ToList(),
                TotalCount = totalCount,
                PageNumber = page,
                PageSize = pageSize
            };
        }

        public async Task ToggleVisibilityAsync(Guid userId, Guid mediaId, bool isVisible)
        {
            _logger.LogInformation("User {UserId} toggling visibility of media {MediaId} to {IsVisible}", userId, mediaId, isVisible);

            var media = await GetAndVerifyMediaOwnershipAsync(userId, mediaId);
            media.IsVisibleInFeed = isVisible;
            media.UpdatedAt = DateTime.UtcNow;

            _savedMediaRepository.Update(media);
            await _savedMediaRepository.SaveChangesAsync();

            _logger.LogInformation("Media {MediaId} visibility set to {IsVisible}", mediaId, isVisible);
        }

        public async Task BulkToggleVisibilityAsync(Guid userId, BulkToggleVisibilityRequest request)
        {
            _logger.LogInformation("User {UserId} bulk toggling visibility of {Count} items to {IsVisible}", userId, request.MediaIds.Length, request.IsVisibleInFeed);

            var medias = _savedMediaRepository.GetAll()
                .Where(m => m.UserId == userId && request.MediaIds.Contains(m.Id) && !m.IsDeleted)
                .ToList();

            if (medias.Count != request.MediaIds.Length)
                _logger.LogWarning("Expected {Expected} items but found {Found}", request.MediaIds.Length, medias.Count);

            foreach (var media in medias)
            {
                media.IsVisibleInFeed = request.IsVisibleInFeed;
                media.UpdatedAt = DateTime.UtcNow;
                _savedMediaRepository.Update(media);
            }

            await _savedMediaRepository.SaveChangesAsync();
            _logger.LogInformation("Bulk visibility update completed for {Count} items", medias.Count);
        }

        public async Task DeleteMediaAsync(Guid userId, Guid mediaId)
        {
            _logger.LogInformation("User {UserId} deleting media {MediaId}", userId, mediaId);

            var media = await GetAndVerifyMediaOwnershipAsync(userId, mediaId);
            media.IsDeleted = true;
            media.DeletedAt = DateTime.UtcNow;

            _savedMediaRepository.Update(media);
            await _savedMediaRepository.SaveChangesAsync();

            _logger.LogInformation("Media {MediaId} deleted successfully", mediaId);
        }

        public async Task<SavedMediaResponse> PublishMediaAsync(Guid userId, PublishMediaRequest request)
        {
            _logger.LogInformation("User {UserId} publishing media {MediaId}", userId, request.MediaId);

            var media = await GetAndVerifyMediaOwnershipAsync(userId, request.MediaId);

            // Create a post from the media
            // This is a simplified version - you'll need to adapt based on your PostService API
            // TODO: Implement actual post creation using PostService

            media.IsPublished = true;
            media.IsVisibleInFeed = true;
            media.UpdatedAt = DateTime.UtcNow;

            _savedMediaRepository.Update(media);
            await _savedMediaRepository.SaveChangesAsync();

            _logger.LogInformation("Media {MediaId} published successfully", request.MediaId);
            return MapToResponse(media);
        }

        public async Task<MediaLibraryStatsResponse> GetLibraryStatsAsync(Guid userId)
        {
            _logger.LogInformation("Fetching library stats for user {UserId}", userId);

            var medias = _savedMediaRepository.GetAll()
                .Where(m => m.UserId == userId && !m.IsDeleted)
                .ToList();

            return new MediaLibraryStatsResponse
            {
                TotalItems = medias.Count,
                PhotoCount = medias.Count(m => m.MediaType == MediaLibraryType.Photo),
                VideoCount = medias.Count(m => m.MediaType == MediaLibraryType.Video),
                MusicCount = medias.Count(m => m.MediaType == MediaLibraryType.Music),
                AudioCount = medias.Count(m => m.MediaType == MediaLibraryType.Audio),
                PodcastCount = medias.Count(m => m.MediaType == MediaLibraryType.Podcast),
                VisibleItemsCount = medias.Count(m => m.IsVisibleInFeed),
                HiddenItemsCount = medias.Count(m => !m.IsVisibleInFeed),
                PublishedCount = medias.Count(m => m.IsPublished),
                ScheduledCount = medias.Count(m => m.ScheduledPublishAt.HasValue && m.ScheduledPublishAt > DateTime.UtcNow),
                TotalSizeBytes = medias.Where(m => m.FileSizeBytes.HasValue).Sum(m => m.FileSizeBytes.Value)
            };
        }

        public async Task AddTagToMediaAsync(Guid userId, Guid mediaId, string tag)
        {
            _logger.LogInformation("User {UserId} adding tag {Tag} to media {MediaId}", userId, tag, mediaId);

            var media = await GetAndVerifyMediaOwnershipAsync(userId, mediaId);

            if (media.Tags == null)
                media.Tags = new[] { tag };
            else if (!media.Tags.Contains(tag))
                media.Tags = media.Tags.Append(tag).ToArray();

            media.UpdatedAt = DateTime.UtcNow;
            _savedMediaRepository.Update(media);
            await _savedMediaRepository.SaveChangesAsync();
        }

        public async Task RemoveTagFromMediaAsync(Guid userId, Guid mediaId, string tag)
        {
            _logger.LogInformation("User {UserId} removing tag {Tag} from media {MediaId}", userId, tag, mediaId);

            var media = await GetAndVerifyMediaOwnershipAsync(userId, mediaId);

            if (media.Tags != null)
            {
                media.Tags = media.Tags.Where(t => t != tag).ToArray();
                media.UpdatedAt = DateTime.UtcNow;
                _savedMediaRepository.Update(media);
                await _savedMediaRepository.SaveChangesAsync();
            }
        }

        public async Task CleanupScheduledPublishesAsync()
        {
            _logger.LogInformation("Running scheduled media publish cleanup job");

            var now = DateTime.UtcNow;
            var dueMedia = _savedMediaRepository.GetAll()
                .Where(m => m.ScheduledPublishAt.HasValue && m.ScheduledPublishAt <= now && !m.IsPublished && !m.IsDeleted)
                .ToList();

            _logger.LogInformation("Found {Count} media items ready for scheduled publish", dueMedia.Count);

            // TODO: Implement automatic publish logic for scheduled media

            await _savedMediaRepository.SaveChangesAsync();
        }

        private async Task<SavedMedia> GetAndVerifyMediaOwnershipAsync(Guid userId, Guid mediaId)
        {
            var media = await _savedMediaRepository.GetByIdAsync(mediaId);
            if (media == null || media.IsDeleted)
                throw new ArgumentException($"Media {mediaId} not found");

            if (media.UserId != userId)
                throw new UnauthorizedAccessException($"User {userId} does not own media {mediaId}");

            return media;
        }

        private SavedMediaResponse MapToResponse(SavedMedia media)
        {
            return new SavedMediaResponse
            {
                Id = media.Id,
                UserId = media.UserId,
                SourcePostId = media.SourcePostId,
                Title = media.Title,
                Description = media.Description,
                MediaType = media.MediaType,
                MediaUrl = media.MediaUrl,
                ThumbnailUrl = media.ThumbnailUrl,
                MediaMetadata = media.MediaMetadata,
                IsVisibleInFeed = media.IsVisibleInFeed,
                IsPublished = media.IsPublished,
                PublishedPostId = media.PublishedPostId,
                Tags = media.Tags,
                ScheduledPublishAt = media.ScheduledPublishAt,
                FileSizeBytes = media.FileSizeBytes,
                DurationSeconds = media.DurationSeconds,
                CreatedAt = media.CreatedAt,
                UpdatedAt = media.UpdatedAt
            };
        }
    }
}
