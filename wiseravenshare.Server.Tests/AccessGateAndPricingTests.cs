using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Wiseravenshare.Server.Controllers;
using Wiseravenshare.Server.Services;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class AccessGateAndPricingTests : IDisposable
{
    private readonly string _tempStatePath;

    public AccessGateAndPricingTests()
    {
        _tempStatePath = Path.Combine(Path.GetTempPath(), $"access_gate_test_{Guid.NewGuid():N}.json");
    }

    public void Dispose()
    {
        if (File.Exists(_tempStatePath))
        {
            try { File.Delete(_tempStatePath); } catch { }
        }
    }

    [Fact]
    public void MasterGate_DefaultsToOpen_AllUsersHaveAccess()
    {
        var service = new AccessGateService(_tempStatePath, NullLogger<AccessGateService>.Instance);
        
        Assert.True(service.IsMasterGateOpen());

        var anonymousClaims = new ClaimsPrincipal(new ClaimsIdentity());
        Assert.True(service.HasAccess(anonymousClaims));

        var standardUser = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString("N")),
            new Claim(ClaimTypes.Email, "regular.user@example.com")
        }, "TestAuth"));

        Assert.True(service.HasAccess(standardUser));
    }

    [Fact]
    public void MasterGate_WhenClosed_NonPayingUserIsLocked()
    {
        var service = new AccessGateService(_tempStatePath, NullLogger<AccessGateService>.Instance);
        
        // Admin closes the gate
        service.SetMasterGate(false, "admin@wise-ravens.com", "Enforcing paywalls");
        Assert.False(service.IsMasterGateOpen());

        var nonPayingUser = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "user_unpaid_123"),
            new Claim(ClaimTypes.Email, "unpaid@example.com")
        }, "TestAuth"));

        Assert.False(service.HasAccess(nonPayingUser));
    }

    [Fact]
    public void MasterGate_WhenClosed_PayingUserGrantedAccessToAllGates()
    {
        var service = new AccessGateService(_tempStatePath, NullLogger<AccessGateService>.Instance);
        
        // Admin closes the gate
        service.SetMasterGate(false, "admin@wise-ravens.com");
        Assert.False(service.IsMasterGateOpen());

        var payingUserId = "user_paying_456";
        var payingEmail = "subscriber@example.com";

        // Payment is received
        service.RecordPaymentReceived(payingUserId, payingEmail, "creator_pro", "stripe_payment");

        var payingUser = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, payingUserId),
            new Claim(ClaimTypes.Email, payingEmail)
        }, "TestAuth"));

        // User now has access to all gates!
        Assert.True(service.HasAccess(payingUser));
        Assert.True(service.IsPayingUser(payingUser));

        var status = service.GetStatus(payingUser);
        Assert.False(status.MasterGateOpen);
        Assert.True(status.UserHasAccess);
        Assert.True(status.IsPayingUser);
        Assert.Equal(70, status.DiscountPercent);
    }

    [Fact]
    public void MasterGate_AdminAlwaysHasAccess()
    {
        var service = new AccessGateService(_tempStatePath, NullLogger<AccessGateService>.Instance);
        service.SetMasterGate(false, "admin@wise-ravens.com");

        var adminUser = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "admin_user_789"),
            new Claim(ClaimTypes.Role, "admin"),
            new Claim(ClaimTypes.Email, "admin@wise-ravens.com")
        }, "TestAuth"));

        Assert.True(service.HasAccess(adminUser));
    }

    [Fact]
    public void PaymentsCatalog_Reflects70PercentDiscount()
    {
        var env = new TestWebHostEnvironment();
        var config = new ConfigurationBuilder().Build();
        var userStore = new UserStore(env, config);
        var growthService = new GrowthService(env, NullLogger<GrowthService>.Instance);
        var controller = new PaymentsController(
            config,
            growthService,
            userStore,
            NullLogger<PaymentsController>.Instance);

        var result = controller.GetCatalog() as OkObjectResult;
        Assert.NotNull(result);

        // Verify discountPercent is 70
        var val = result.Value;
        Assert.NotNull(val);

        var propertyInfo = val.GetType().GetProperty("discountPercent");
        Assert.NotNull(propertyInfo);
        Assert.Equal(70, (int)propertyInfo.GetValue(val)!);
    }
}
