// Wiseravenshare.Server/Services/TruthService.cs
using Microsoft.Extensions.Logging;
using System.Text.Json;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.Infrastructure.Data.Repositories;
using Wiseravenshare.Server.Infrastructure.External;
using static Wiseravenshare.Server.Entities.TruthClaim;

namespace Wiseravenshare.Server.Services
{

    public interface ITruthService
    {
        Task<ClaimVerificationResultDto> AnalyzeContentAsync(string content);
        Task<TruthClaimDto> VerifyClaimAsync(Guid userId, VerifyClaimDto dto);
        Task<TruthClaimDto> GetClaimAsync(Guid claimId);
        Task<IEnumerable<TruthClaimDto>> GetClaimsByCategoryAsync(string category);
        Task DisputeClaimAsync(Guid userId, Guid postId, string reason, string? evidence);
        Task ResolveDisputeAsync(Guid adminUserId, Guid disputeId, string resolution);
        Task<decimal> GetUserTruthScoreAsync(Guid userId);
        Task<IEnumerable<TruthClaimDto>> GetUnverifiedClaimsAsync(int count);
    }

    public class TruthService : ITruthService
    {
        private readonly ITruthRepository _truthRepository;
        private readonly IPostRepository _postRepository;
        private readonly IOpenAIService _openAIService;
        private readonly ILogger<TruthService> _logger;

        public TruthService(
            ITruthRepository truthRepository,
            IPostRepository postRepository,
            IOpenAIService openAIService,
            ILogger<TruthService> logger)
        {
            _truthRepository = truthRepository;
            _postRepository = postRepository;
            _openAIService = openAIService;
            _logger = logger;
        }

        public async Task<ClaimVerificationResultDto> AnalyzeContentAsync(string content)
        {
            // Extract claims from content
            var claims = await ExtractClaimsAsync(content);

            var result = new ClaimVerificationResultDto
            {
                ClaimText = content,
                Sources = new List<SourceDto>()
            };

            foreach (var claim in claims)
            {
                // Check knowledge base first
                var existingClaim = await _truthRepository.GetClaimByTextAsync(NormalizeClaim(claim));
                if (existingClaim != null)
                {
                    result.IsTrue = existingClaim.IsTrue;
                    result.Confidence = existingClaim.Confidence;
                    result.Correction = existingClaim.Correction;
                    result.Explanation = existingClaim.Explanation;
                    result.TruthScore = existingClaim.IsTrue == true ? 100 : 0;
                    result.Verdict = existingClaim.IsTrue == true ? "Verified" : "Debunked";

                    // Add sources
                    if (existingClaim.Sources != null)
                    {
                        // Parse sources from JSON
                    }

                    return result;
                }

                // If not in knowledge base, use AI to verify
                var aiResult = await _openAIService.VerifyClaimAsync(claim);

                // Determine verdict
                result.IsTrue = aiResult.IsTrue;
                result.Confidence = aiResult.Confidence;
                result.Correction = aiResult.Correction;
                result.Explanation = aiResult.Explanation;
                result.Sources = aiResult.Sources.Select(s => new SourceDto
                {
                    Name = s.Name,
                    Url = s.Url,
                    Confidence = s.Confidence,
                    Verdict = s.Verdict
                }).ToList();

                result.TruthScore = aiResult.IsTrue ? 100 - (100 - aiResult.Confidence * 100) : (100 - aiResult.Confidence * 100);
                result.Verdict = aiResult.IsTrue ? "Verified" : "Questionable";

                // Store new claim for future reference
                if (aiResult.Confidence > 0.8m)
                {
                    await StoreClaimAsync(claim, aiResult);
                }
            }

            return result;
        }

        public async Task<TruthClaimDto> VerifyClaimAsync(Guid userId, VerifyClaimDto dto)
        {
            var normalizedClaim = NormalizeClaim(dto.ClaimText);

            // Check if already exists
            var existingClaim = await _truthRepository.GetClaimByTextAsync(normalizedClaim);
            if (existingClaim != null)
            {
                return MapToClaimDto(existingClaim);
            }

            // Use AI to verify
            var aiResult = await _openAIService.VerifyClaimAsync(dto.ClaimText);

            var claim = new TruthClaim
            {
                ClaimText = dto.ClaimText,
                NormalizedClaim = normalizedClaim,
                IsTrue = aiResult.IsTrue,
                Correction = aiResult.Correction,
                Explanation = aiResult.Explanation,
                Confidence = aiResult.Confidence,
                Category = dto.Category ?? "General",
                CreatedBy = userId,
                Sources = JsonDocument.Parse(JsonSerializer.Serialize(aiResult.Sources))
            };

            await _truthRepository.AddAsync(claim);
            _logger.LogInformation($"New truth claim stored: {claim.ClaimText}");

            return MapToClaimDto(claim);
        }

        public async Task<TruthClaimDto> GetClaimAsync(Guid claimId)
        {
            var claim = await _truthRepository.GetByIdAsync(claimId);
            if (claim == null)
            {
                throw new NotFoundException("Claim not found");
            }

            return MapToClaimDto(claim);
        }

        public async Task<IEnumerable<TruthClaimDto>> GetClaimsByCategoryAsync(string category)
        {
            var claims = await _truthRepository.GetClaimsByCategoryAsync(category);
            return claims.Select(MapToClaimDto);
        }

        public async Task DisputeClaimAsync(Guid userId, Guid postId, string reason, string? evidence)
        {
            var post = await _postRepository.GetByIdAsync(postId);
            if (post == null || post.IsDeleted)
            {
                throw new NotFoundException("Post not found");
            }

            var dispute = new TruthDispute
            {
                PostId = postId,
                UserId = userId,
                Reason = reason,
                Evidence = evidence,
                Status = DisputeStatus.Pending
            };

            await _truthRepository.AddDisputeAsync(dispute);
            _logger.LogInformation($"Dispute filed for post {postId} by user {userId}");
        }

        public async Task ResolveDisputeAsync(Guid adminUserId, Guid disputeId, string resolution)
        {
            var dispute = await _truthRepository.GetDisputeAsync(disputeId);
            if (dispute == null)
            {
                throw new NotFoundException("Dispute not found");
            }

            dispute.Status = DisputeStatus.Resolved;
            dispute.ResolutionNotes = resolution;
            dispute.ResolvedBy = adminUserId;
            dispute.ResolvedAt = DateTime.UtcNow;

            await _truthRepository.UpdateDisputeAsync(dispute);
            _logger.LogInformation($"Dispute {disputeId} resolved by admin {adminUserId}");
        }

        public async Task<decimal> GetUserTruthScoreAsync(Guid userId)
        {
            return await _truthRepository.GetAverageTruthScoreAsync(userId);
        }

        public async Task<IEnumerable<TruthClaimDto>> GetUnverifiedClaimsAsync(int count)
        {
            var claims = await _truthRepository.GetUnverifiedClaimsAsync(count);
            return claims.Select(MapToClaimDto);
        }

        private async Task<List<string>> ExtractClaimsAsync(string content)
        {
            // Use AI to extract claims from content
            return await _openAIService.ExtractClaimsAsync(content);
        }

        private string NormalizeClaim(string claim)
        {
            return claim.Trim().ToLowerInvariant();
        }

        private async Task StoreClaimAsync(string claim, AIVerificationResult result)
        {
            var normalizedClaim = NormalizeClaim(claim);
            var existing = await _truthRepository.GetClaimByTextAsync(normalizedClaim);
            if (existing != null) return;

            var truthClaim = new TruthClaim
            {
                ClaimText = claim,
                NormalizedClaim = normalizedClaim,
                IsTrue = result.IsTrue,
                Correction = result.Correction,
                Explanation = result.Explanation,
                Confidence = result.Confidence,
                Sources = JsonDocument.Parse(JsonSerializer.Serialize(result.Sources)),
                Category = "AI-Generated"
            };

            await _truthRepository.AddAsync(truthClaim);
        }

        private TruthClaimDto MapToClaimDto(TruthClaim claim)
        {
            return new TruthClaimDto
            {
                Id = claim.Id,
                ClaimText = claim.ClaimText,
                IsTrue = claim.IsTrue,
                Correction = claim.Correction,
                Explanation = claim.Explanation,
                Sources = claim.Sources?.ToString(),
                Confidence = claim.Confidence,
                Category = claim.Category,
                VerificationCount = claim.VerificationCount,
                CreatedAt = claim.CreatedAt
            };
        }
    }
}