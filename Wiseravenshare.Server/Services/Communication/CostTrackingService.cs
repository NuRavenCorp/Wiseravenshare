// Wiseravenshare.Server/Services/Communication/CostTrackingService.cs
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.Communique;
using Wiseravenshare.Server.Interfaces.Repositories;
using Microsoft.Extensions.Logging;

namespace Wiseravenshare.Server.Services.Communication;

/// <summary>
/// Service for tracking SMS, WhatsApp, and verification costs
/// </summary>
public interface ICostTrackingService
{
    /// <summary>
    /// Log SMS cost
    /// </summary>
    Task LogSmsAsync(string userId, string phoneNumber, int messageLength);

    /// <summary>
    /// Log WhatsApp cost
    /// </summary>
    Task LogWhatsAppAsync(string userId, string phoneNumber);

    /// <summary>
    /// Log verification request cost
    /// </summary>
    Task LogVerificationAsync(string userId, string phoneNumber, string channel);

    /// <summary>
    /// Get monthly cost for a user
    /// </summary>
    Task<CostSummaryDto> GetMonthlyCostAsync(string? userId = null, int year = 0, int month = 0);

    /// <summary>
    /// Get usage metrics within a timeframe
    /// </summary>
    Task<UsageMetricsDto> GetMetricsAsync(string timeframe = "month");

    /// <summary>
    /// Get cost breakdown by type
    /// </summary>
    Task<CostBreakdownDto> GetCostBreakdownAsync(string? userId = null, int days = 30);
}

public class CostTrackingService : ICostTrackingService
{
    private readonly IRepository<NotificationCost> _costRepository;
    private readonly ILogger<CostTrackingService> _logger;

    public CostTrackingService(
        IRepository<NotificationCost> costRepository,
        ILogger<CostTrackingService> logger)
    {
        _costRepository = costRepository;
        _logger = logger;
    }

    public async Task LogSmsAsync(string userId, string phoneNumber, int messageLength)
    {
        try
        {
            var cost = NotificationCost.CreateSms(userId, phoneNumber, messageLength);
            await _costRepository.AddAsync(cost);
            
            _logger.LogInformation(
                "Logged SMS cost: User={UserId}, Phone={Phone}, Length={Length}, Cost=${Cost}",
                userId, phoneNumber, messageLength, cost.CostUsd
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error logging SMS cost for user {UserId}", userId);
            // Don't throw - cost tracking shouldn't interrupt main operation
        }
    }

    public async Task LogWhatsAppAsync(string userId, string phoneNumber)
    {
        try
        {
            var cost = NotificationCost.CreateWhatsApp(userId, phoneNumber);
            await _costRepository.AddAsync(cost);

            _logger.LogInformation(
                "Logged WhatsApp cost: User={UserId}, Phone={Phone}, Cost=${Cost}",
                userId, phoneNumber, cost.CostUsd
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error logging WhatsApp cost for user {UserId}", userId);
        }
    }

    public async Task LogVerificationAsync(string userId, string phoneNumber, string channel)
    {
        try
        {
            var cost = NotificationCost.CreateVerification(userId, phoneNumber, channel);
            await _costRepository.AddAsync(cost);

            _logger.LogInformation(
                "Logged verification cost: User={UserId}, Phone={Phone}, Channel={Channel}, Cost=${Cost}",
                userId, phoneNumber, channel, cost.CostUsd
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error logging verification cost for user {UserId}", userId);
        }
    }

    public async Task<CostSummaryDto> GetMonthlyCostAsync(string? userId = null, int year = 0, int month = 0)
    {
        try
        {
            if (year == 0)
                year = DateTime.UtcNow.Year;
            if (month == 0)
                month = DateTime.UtcNow.Month;

            var startDate = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
            var endDate = startDate.AddMonths(1).AddSeconds(-1);

            var query = await _costRepository.GetAllAsync();
            var costs = query
                .Where(c => c.SentAt >= startDate && c.SentAt <= endDate)
                .AsEnumerable();

            if (!string.IsNullOrEmpty(userId))
                costs = costs.Where(c => c.UserId == userId);

            var summary = new CostSummaryDto
            {
                Month = month,
                Year = year,
                TotalCostUsd = costs.Sum(c => c.CostUsd),
                SmsCount = costs.Count(c => c.NotificationType == "SMS"),
                WhatsAppCount = costs.Count(c => c.NotificationType == "WhatsApp"),
                VerificationCount = costs.Count(c => c.NotificationType == "Verify"),
                SmsCostUsd = costs.Where(c => c.NotificationType == "SMS").Sum(c => c.CostUsd),
                WhatsAppCostUsd = costs.Where(c => c.NotificationType == "WhatsApp").Sum(c => c.CostUsd),
                VerificationCostUsd = costs.Where(c => c.NotificationType == "Verify").Sum(c => c.CostUsd)
            };

            return summary;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting monthly cost for user {UserId}", userId ?? "all");
            throw;
        }
    }

    public async Task<UsageMetricsDto> GetMetricsAsync(string timeframe = "month")
    {
        try
        {
            var startDate = GetStartDate(timeframe);
            var query = await _costRepository.GetAllAsync();
            var costs = query
                .Where(c => c.SentAt >= startDate)
                .AsEnumerable();

            var metrics = new UsageMetricsDto
            {
                Timeframe = timeframe,
                PeriodStart = startDate,
                PeriodEnd = DateTime.UtcNow,
                TotalMessages = costs.Count(),
                UniqueUsers = costs.Select(c => c.UserId).Distinct().Count(),
                AverageCostPerMessage = costs.Count() > 0 ? costs.Sum(c => c.CostUsd) / costs.Count() : 0,
                SuccessfulMessages = costs.Count(c => c.DeliveryStatus == "Sent"),
                FailedMessages = costs.Count(c => c.DeliveryStatus == "Failed"),
                SuccessRate = costs.Count() > 0 
                    ? (decimal)costs.Count(c => c.DeliveryStatus == "Sent") / costs.Count() 
                    : 0
            };

            return metrics;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting metrics for timeframe {Timeframe}", timeframe);
            throw;
        }
    }

    public async Task<CostBreakdownDto> GetCostBreakdownAsync(string? userId = null, int days = 30)
    {
        try
        {
            var startDate = DateTime.UtcNow.AddDays(-days);
            var query = await _costRepository.GetAllAsync();
            var costs = query
                .Where(c => c.SentAt >= startDate)
                .AsEnumerable();

            if (!string.IsNullOrEmpty(userId))
                costs = costs.Where(c => c.UserId == userId);

            var smsCosts = costs.Where(c => c.NotificationType == "SMS").ToList();
            var whatsAppCosts = costs.Where(c => c.NotificationType == "WhatsApp").ToList();
            var verifyCosts = costs.Where(c => c.NotificationType == "Verify").ToList();

            var breakdown = new CostBreakdownDto
            {
                Days = days,
                PeriodStart = startDate,
                PeriodEnd = DateTime.UtcNow,
                TotalCostUsd = costs.Sum(c => c.CostUsd),
                
                SmsMetrics = new CostBreakdownDto.TypeMetrics
                {
                    Type = "SMS",
                    Count = smsCosts.Count,
                    TotalCostUsd = smsCosts.Sum(c => c.CostUsd),
                    AverageCostPerMessage = smsCosts.Count > 0 ? smsCosts.Sum(c => c.CostUsd) / smsCosts.Count : 0,
                    SuccessCount = smsCosts.Count(c => c.DeliveryStatus == "Sent"),
                    FailureCount = smsCosts.Count(c => c.DeliveryStatus == "Failed")
                },
                
                WhatsAppMetrics = new CostBreakdownDto.TypeMetrics
                {
                    Type = "WhatsApp",
                    Count = whatsAppCosts.Count,
                    TotalCostUsd = whatsAppCosts.Sum(c => c.CostUsd),
                    AverageCostPerMessage = whatsAppCosts.Count > 0 ? whatsAppCosts.Sum(c => c.CostUsd) / whatsAppCosts.Count : 0,
                    SuccessCount = whatsAppCosts.Count(c => c.DeliveryStatus == "Sent"),
                    FailureCount = whatsAppCosts.Count(c => c.DeliveryStatus == "Failed")
                },
                
                VerificationMetrics = new CostBreakdownDto.TypeMetrics
                {
                    Type = "Verify",
                    Count = verifyCosts.Count,
                    TotalCostUsd = verifyCosts.Sum(c => c.CostUsd),
                    AverageCostPerMessage = verifyCosts.Count > 0 ? verifyCosts.Sum(c => c.CostUsd) / verifyCosts.Count : 0,
                    SuccessCount = verifyCosts.Count(c => c.DeliveryStatus == "Sent"),
                    FailureCount = verifyCosts.Count(c => c.DeliveryStatus == "Failed")
                }
            };

            return breakdown;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting cost breakdown for user {UserId}", userId ?? "all");
            throw;
        }
    }

    private DateTime GetStartDate(string timeframe)
    {
        return timeframe.ToLower() switch
        {
            "day" => DateTime.UtcNow.AddDays(-1),
            "week" => DateTime.UtcNow.AddDays(-7),
            "month" => DateTime.UtcNow.AddDays(-30),
            "quarter" => DateTime.UtcNow.AddDays(-90),
            "year" => DateTime.UtcNow.AddYears(-1),
            _ => DateTime.UtcNow.AddDays(-30) // default to month
        };
    }
}

/// <summary>
/// Monthly cost summary DTO
/// </summary>
public class CostSummaryDto
{
    public int Month { get; set; }
    public int Year { get; set; }
    public decimal TotalCostUsd { get; set; }
    public int SmsCount { get; set; }
    public int WhatsAppCount { get; set; }
    public int VerificationCount { get; set; }
    public decimal SmsCostUsd { get; set; }
    public decimal WhatsAppCostUsd { get; set; }
    public decimal VerificationCostUsd { get; set; }
}

/// <summary>
/// Usage metrics DTO
/// </summary>
public class UsageMetricsDto
{
    public string Timeframe { get; set; } = string.Empty;
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    public int TotalMessages { get; set; }
    public int UniqueUsers { get; set; }
    public decimal AverageCostPerMessage { get; set; }
    public int SuccessfulMessages { get; set; }
    public int FailedMessages { get; set; }
    public decimal SuccessRate { get; set; }
}

/// <summary>
/// Cost breakdown by notification type
/// </summary>
public class CostBreakdownDto
{
    public int Days { get; set; }
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    public decimal TotalCostUsd { get; set; }
    public TypeMetrics SmsMetrics { get; set; } = new();
    public TypeMetrics WhatsAppMetrics { get; set; } = new();
    public TypeMetrics VerificationMetrics { get; set; } = new();

    public class TypeMetrics
    {
        public string Type { get; set; } = string.Empty;
        public int Count { get; set; }
        public decimal TotalCostUsd { get; set; }
        public decimal AverageCostPerMessage { get; set; }
        public int SuccessCount { get; set; }
        public int FailureCount { get; set; }
    }
}
