// Wiseravenshare.Server/Entities/Currency/WorkHourValuation.cs
using System.Text.Json;

namespace Wiseravenshare.Server.Entities.Currency;

public class WorkHourValuation : BaseEntity
{
    public DateTime Date { get; set; }
    public decimal WSCPerHour { get; set; }
    public decimal TotalWorkHours { get; set; }
    public decimal TotalWSCInCirculation { get; set; }
    public decimal MarketCapUSD { get; set; }
    public decimal AverageWSCPerUser { get; set; }
    public int ActiveUsers { get; set; }
    public decimal InflationRate { get; set; }
    public decimal BurnRate { get; set; }
    public JsonDocument? Metrics { get; set; }

    // Value anchors (human work hours)
    public decimal MinimumWageReference { get; set; } = 15.00m;
    public decimal FreelancerRateReference { get; set; } = 22.50m;
    public decimal ExpertRateReference { get; set; } = 37.50m;

    public decimal CalculateValuePerHour()
    {
        var baseValue = MinimumWageReference * 0.5m;
        var communityValue = TotalWorkHours / (ActiveUsers + 1) / 1000m;
        var scarcityValue = TotalWorkHours > 0 ? (TotalWSCInCirculation / TotalWorkHours) * 0.01m : 0m;
        return baseValue + communityValue + scarcityValue;
    }
}

public class WorkHourContribution : BaseEntity
{
    public Guid UserId { get; set; }
    public DateTime Date { get; set; } = DateTime.UtcNow;
    public decimal Hours { get; set; }
    [MaxLength(50)]
    public string Category { get; set; } = "General";
    [MaxLength(500)]
    public string Description { get; set; } = string.Empty;
    public decimal WSCGenerated { get; set; }
    public decimal WSCRate { get; set; }
    public bool IsVerified { get; set; }
    public bool IsApproved { get; set; }
    public Guid? VerifiedBy { get; set; }
    public string? ProofReference { get; set; }
    public JsonDocument? Metadata { get; set; }

    public virtual User User { get; set; } = null!;
    public virtual User? Verifier { get; set; }
}
