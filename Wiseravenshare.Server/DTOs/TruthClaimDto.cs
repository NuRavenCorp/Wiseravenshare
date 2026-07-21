// Wiseravenshare.Server/DTOs/TruthClaimDto.cs
using System.ComponentModel.DataAnnotations;
using Wiseravenshare.Server.DTOs.User;

namespace Wiseravenshare.Server.DTOs
{

    public class TruthClaimDto
    {
        public Guid Id { get; set; }
        public string ClaimText { get; set; } = string.Empty;
        public bool? IsTrue { get; set; }
        public string? Correction { get; set; }
        public string? Explanation { get; set; }
        public string? Sources { get; set; }
        public decimal Confidence { get; set; }
        public string Category { get; set; } = "General";
        public int VerificationCount { get; set; }
        public DateTime CreatedAt { get; set; }
        public UserDto? Creator { get; set; }
    }

    public class VerifyClaimDto
    {
        [Required]
        [MaxLength(2000)]
        public string ClaimText { get; set; } = string.Empty;

        public string? Category { get; set; }
    }

    public class ClaimVerificationResultDto
    {
        public string ClaimText { get; set; } = string.Empty;
        public bool IsTrue { get; set; }
        public decimal Confidence { get; set; }
        public string? Correction { get; set; }
        public string? Explanation { get; set; }
        public List<SourceDto> Sources { get; set; } = new();
        public decimal TruthScore { get; set; }
        public string Verdict { get; set; } = string.Empty;
    }

    public class SourceDto
    {
        public string Name { get; set; } = string.Empty;
        public string Url { get; set; } = string.Empty;
        public decimal Confidence { get; set; }
        public string Verdict { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
    }
}