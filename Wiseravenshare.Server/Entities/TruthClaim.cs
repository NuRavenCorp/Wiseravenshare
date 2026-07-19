// Wiseravenshare.Server/Entities/TruthClaim.cs
using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace Wiseravenshare.Server.Entities
{

    public class TruthClaim : BaseEntity
    {
        public string ClaimText { get; set; } = string.Empty;
        public string NormalizedClaim { get; set; } = string.Empty;
        public bool IsTrue { get; set; }
        public string? Correction { get; set; }
        public string? Explanation { get; set; }
        public JsonDocument? Sources { get; set; }
        public decimal Confidence { get; set; } = 0.95m;
        public string Category { get; set; } = "General";
        public int VerificationCount { get; set; } = 1;
        public Guid? CreatedBy { get; set; }
        public DateTime? ExpiresAt { get; set; }

        // Navigation Properties
        public virtual User? Creator { get; set; }
        public virtual ICollection<TruthVerificationVote> Votes { get; set; } = new List<TruthVerificationVote>();
        public virtual ICollection<TruthDispute> Disputes { get; set; } = new List<TruthDispute>();

        public class TruthDispute : BaseEntity
        {
            public Guid PostId { get; set; }
            public Guid UserId { get; set; }

            [MaxLength(1000)]
            public string Reason { get; set; } = string.Empty;

            [MaxLength(2000)]
            public string? Evidence { get; set; }

            public DisputeStatus Status { get; set; } = DisputeStatus.Pending;
            public string? ResolutionNotes { get; set; }
            public Guid? ResolvedBy { get; set; }
            public DateTime? ResolvedAt { get; set; }

            // Navigation Properties
            public virtual Post Post { get; set; } = null!;
            public virtual User User { get; set; } = null!;
            public virtual User? Resolver { get; set; }
        }

        public enum DisputeStatus
        {
            Pending,
            Resolved,
            Rejected,
            UnderReview
        }

        public class TruthVerificationVote : BaseEntity
        {
            public Guid ClaimId { get; set; }
            public Guid UserId { get; set; }
            public bool? VoteType { get; set; }
            public int ConfidenceScore { get; set; } // 1-10

            // Navigation Properties
            public virtual TruthClaim Claim { get; set; } = null!;
            public virtual User User { get; set; } = null!;
        }
    }
}