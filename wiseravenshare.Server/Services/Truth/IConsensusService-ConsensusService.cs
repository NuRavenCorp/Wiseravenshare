using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Services.Truth;

public interface IConsensusService
{
    Task<ConsensusResult> GetConsensusAsync(Guid claimId);
    Task<ConsensusResult> GetConsensusForClaimAsync(string normalizedClaim);
    Task<VoteResult> AddVoteAsync(Guid claimId, Guid userId, bool vote, int confidence = 5);
    Task<ExpertConsensus> GetExpertConsensusAsync(Guid claimId);
    Task<StakingConsensus> GetStakingConsensusAsync(Guid claimId);
}

public class ConsensusService : IConsensusService
{
    private readonly ITruthRepository _truthRepository;
    private readonly IUserRepository _userRepository;
    private readonly IMemoryCache _cache;
    private readonly ILogger<ConsensusService> _logger;

    private const decimal REPUTATION_WEIGHT = 0.30m;
    private const decimal TRUTH_SCORE_WEIGHT = 0.30m;
    private const decimal VERIFICATION_HISTORY_WEIGHT = 0.20m;
    private const int MIN_VOTES_FOR_CONSENSUS = 10;

    public ConsensusService(ITruthRepository truthRepository, IUserRepository userRepository, IMemoryCache cache, ILogger<ConsensusService> logger)
    {
        _truthRepository = truthRepository;
        _userRepository = userRepository;
        _cache = cache;
        _logger = logger;
    }

    public async Task<ConsensusResult> GetConsensusAsync(Guid claimId)
    {
        var claim = await _truthRepository.GetByIdAsync(claimId);
        if (claim == null)
        {
            throw new InvalidOperationException("Claim not found");
        }

        return await GetConsensusForClaimAsync(claim.NormalizedClaim);
    }

    public async Task<ConsensusResult> GetConsensusForClaimAsync(string normalizedClaim)
    {
        var cacheKey = $"consensus_{normalizedClaim.GetHashCode()}";
        if (_cache.TryGetValue(cacheKey, out ConsensusResult? cachedResult) && cachedResult is not null)
        {
            return cachedResult;
        }

        var claim = await _truthRepository.GetClaimByTextAsync(normalizedClaim);
        if (claim == null)
        {
            var empty = new ConsensusResult
            {
                Claim = normalizedClaim,
                TotalVotes = 0,
                VerifiedVotes = 0,
                DisputedVotes = 0,
                Confidence = 0.50m,
                ConsensusStatus = ConsensusStatus.InsufficientData
            };
            _cache.Set(cacheKey, empty, TimeSpan.FromMinutes(5));
            return empty;
        }

        var votes = (await _truthRepository.GetVotesForClaimAsync(claim.Id)).ToList();
        var result = new ConsensusResult
        {
            Claim = normalizedClaim,
            TotalVotes = votes.Count,
            VerifiedVotes = votes.Count(v => v.VoteType == true),
            DisputedVotes = votes.Count(v => v.VoteType == false),
            Confidence = 0.50m,
            ConsensusStatus = ConsensusStatus.InsufficientData
        };

        if (votes.Count > 0)
        {
            decimal weightedScore = 0m;
            decimal totalWeight = 0m;

            foreach (var vote in votes)
            {
                var user = await _userRepository.GetByIdAsync(vote.UserId);
                if (user == null)
                {
                    continue;
                }

                var weight = CalculateVoterWeight(user);
                weightedScore += (vote.VoteType == true ? 1m : 0m) * weight;
                totalWeight += weight;
            }

            result.Confidence = totalWeight > 0 ? weightedScore / totalWeight : 0.50m;
            result.ConsensusStatus = DetermineConsensusStatus(result.Confidence, result.TotalVotes);
            result.ExpertConsensus = await GetExpertConsensusForClaimAsync(normalizedClaim);
            result.StakingConsensus = await GetStakingConsensusForClaimAsync(normalizedClaim);
        }

        _cache.Set(cacheKey, result, TimeSpan.FromMinutes(5));
        return result;
    }

    public async Task<VoteResult> AddVoteAsync(Guid claimId, Guid userId, bool vote, int confidence = 5)
    {
        var user = await _userRepository.GetByIdAsync(userId);
        if (user == null)
        {
            throw new InvalidOperationException("User not found");
        }

        var existingVote = await _truthRepository.GetUserVoteAsync(claimId, userId);
        if (existingVote != null)
        {
            throw new InvalidOperationException("User has already voted on this claim");
        }

        var claim = await _truthRepository.GetByIdAsync(claimId);
        if (claim == null)
        {
            throw new InvalidOperationException("Claim not found");
        }

        var verificationVote = new TruthClaim.TruthVerificationVote
        {
            ClaimId = claimId,
            UserId = userId,
            VoteType = vote,
            ConfidenceScore = confidence
        };

        await _truthRepository.AddVoteAsync(verificationVote);
        claim.VerificationCount += 1;
        await _truthRepository.UpdateAsync(claim);

        _cache.Remove($"consensus_{claim.NormalizedClaim.GetHashCode()}");

        return new VoteResult
        {
            Success = true,
            VoteId = verificationVote.Id,
            NewConsensus = await GetConsensusAsync(claimId)
        };
    }

    public async Task<ExpertConsensus> GetExpertConsensusAsync(Guid claimId)
    {
        var claim = await _truthRepository.GetByIdAsync(claimId);
        if (claim == null)
        {
            return new ExpertConsensus { ExpertCount = 0, ExpertVotes = 0, ExpertAgreement = 0m, HasConsensus = false };
        }

        return await GetExpertConsensusForClaimAsync(claim.NormalizedClaim);
    }

    public async Task<StakingConsensus> GetStakingConsensusAsync(Guid claimId)
    {
        var claim = await _truthRepository.GetByIdAsync(claimId);
        if (claim == null)
        {
            return new StakingConsensus { TotalStaked = 0m, SupportingStaked = 0m, ContradictingStaked = 0m, HasConsensus = false };
        }

        return await GetStakingConsensusForClaimAsync(claim.NormalizedClaim);
    }

    private decimal CalculateVoterWeight(User user)
    {
        var reputationWeight = Math.Min(user.ReputationPoints / 1000m, 1.0m);
        var truthWeight = user.TruthScore / 100m;
        var verificationWeight = Math.Min(1m, user.TruthScore / 100m);
        var expertBonus = user.IsVerified && user.TruthScore > 80 ? 1.5m : 1.0m;

        var weight = (reputationWeight * REPUTATION_WEIGHT +
                      truthWeight * TRUTH_SCORE_WEIGHT +
                      verificationWeight * VERIFICATION_HISTORY_WEIGHT) * expertBonus;

        return Math.Min(weight, 1.0m);
    }

    private ConsensusStatus DetermineConsensusStatus(decimal confidence, int totalVotes)
    {
        if (totalVotes < MIN_VOTES_FOR_CONSENSUS)
        {
            return ConsensusStatus.InsufficientData;
        }

        if (confidence >= 0.80m)
        {
            return ConsensusStatus.StrongConsensus;
        }

        if (confidence >= 0.60m)
        {
            return ConsensusStatus.WeakConsensus;
        }

        if (confidence >= 0.40m)
        {
            return ConsensusStatus.Divided;
        }

        return ConsensusStatus.Disputed;
    }

    private async Task<ExpertConsensus> GetExpertConsensusForClaimAsync(string normalizedClaim)
    {
        var experts = await _userRepository.GetTopTruthSeekersAsync(100);
        var expertVotes = (await _truthRepository.GetVotesByUsersAsync(normalizedClaim, experts.Select(e => e.Id))).ToList();

        return new ExpertConsensus
        {
            ExpertCount = experts.Count(),
            ExpertVotes = expertVotes.Count,
            ExpertAgreement = expertVotes.Count > 0 ? expertVotes.Count(v => v.VoteType == true) / (decimal)expertVotes.Count : 0.50m,
            HasConsensus = expertVotes.Count >= 10 && expertVotes.Count(v => v.VoteType == true) / (decimal)expertVotes.Count >= 0.70m
        };
    }

    private async Task<StakingConsensus> GetStakingConsensusForClaimAsync(string normalizedClaim)
    {
        var stakedVotes = (await _truthRepository.GetStakedVotesAsync(normalizedClaim)).ToList();

        return new StakingConsensus
        {
            TotalStaked = stakedVotes.Sum(v => v.VoteType == true ? 1m : 0m),
            SupportingStaked = stakedVotes.Where(v => v.VoteType == true).Sum(v => 1m),
            ContradictingStaked = stakedVotes.Where(v => v.VoteType == false).Sum(v => 1m),
            HasConsensus = stakedVotes.Any() &&
                stakedVotes.Count(v => v.VoteType == true) > stakedVotes.Count(v => v.VoteType == false) * 2
        };
    }
}

public class ConsensusResult
{
    public string Claim { get; set; } = string.Empty;
    public int TotalVotes { get; set; }
    public int VerifiedVotes { get; set; }
    public int DisputedVotes { get; set; }
    public decimal Confidence { get; set; } = 0.50m;
    public ConsensusStatus ConsensusStatus { get; set; } = ConsensusStatus.InsufficientData;
    public ExpertConsensus? ExpertConsensus { get; set; }
    public StakingConsensus? StakingConsensus { get; set; }
}

public class VoteResult
{
    public bool Success { get; set; }
    public Guid VoteId { get; set; }
    public ConsensusResult? NewConsensus { get; set; }
}

public class ExpertConsensus
{
    public int ExpertCount { get; set; }
    public int ExpertVotes { get; set; }
    public decimal ExpertAgreement { get; set; }
    public bool HasConsensus { get; set; }
}

public class StakingConsensus
{
    public decimal TotalStaked { get; set; }
    public decimal SupportingStaked { get; set; }
    public decimal ContradictingStaked { get; set; }
    public bool HasConsensus { get; set; }
}

public enum ConsensusStatus
{
    InsufficientData,
    StrongConsensus,
    WeakConsensus,
    Divided,
    Disputed
}