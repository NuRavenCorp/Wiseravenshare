using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using Wiseravenshare.Server.Controllers;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class TestWebHostEnvironment : IWebHostEnvironment
{
    public string WebRootPath { get; set; } = string.Empty;
    public IFileProvider WebRootFileProvider { get; set; } = null!;
    public string EnvironmentName { get; set; } = "Development";
    public string ApplicationName { get; set; } = "Wiseravenshare.Server";
    public string ContentRootPath { get; set; } = string.Empty;
    public IFileProvider ContentRootFileProvider { get; set; } = null!;
}

public class AppointmentsPersistenceTests : IDisposable
{
    private readonly string _testAppDataDir;
    private readonly UserStore _userStore;
    private readonly AppDbContext _db;
    private readonly TestWebHostEnvironment _env;

    public AppointmentsPersistenceTests()
    {
        _testAppDataDir = Path.Combine(Path.GetTempPath(), "wrs_planner_test_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_testAppDataDir);

        _env = new TestWebHostEnvironment { ContentRootPath = _testAppDataDir };

        var config = new ConfigurationBuilder().AddInMemoryCollection().Build();
        _userStore = new UserStore(_env, config);

        var dbOptions = new DbContextOptions<AppDbContext>();
        _db = new AppDbContext(dbOptions);
    }

    public void Dispose()
    {
        _db.Dispose();
        try
        {
            if (Directory.Exists(_testAppDataDir))
            {
                Directory.Delete(_testAppDataDir, true);
            }
        }
        catch { }
    }

    private AppointmentsController CreateController(ClaimsPrincipal principal)
    {
        var controller = new AppointmentsController(
            _db,
            NullLogger<AppointmentsController>.Instance,
            _env,
            _userStore)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext
                {
                    User = principal
                }
            }
        };
        return controller;
    }

    [Fact]
    public async System.Threading.Tasks.Task CreateAndRetrieve_AcrossDifferentLoginIdentities_PreservesAppointment()
    {
        var email = "testuser@wiseravenshare.com";
        var initialUserId = Guid.NewGuid();

        // 1. User logs in first time with initial token: sub = initialUserId, email = testuser@wiseravenshare.com
        var claims1 = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, initialUserId.ToString("N")),
            new Claim(JwtRegisteredClaimNames.Sub, initialUserId.ToString("N")),
            new Claim(ClaimTypes.Email, email),
        }, "TestAuth"));

        var controller1 = CreateController(claims1);

        var request = new AppointmentRequest
        {
            Title = "Strategic Sync",
            Description = "Quarterly review",
            StartUtc = DateTimeOffset.UtcNow.AddHours(2),
            EndUtc = DateTimeOffset.UtcNow.AddHours(3),
            ReminderMinutesBefore = 15,
            Color = "#8b5cf6"
        };

        var createResult = await controller1.Create(request);
        Assert.IsType<CreatedAtActionResult>(createResult);

        // 2. User logs in later with different session scheme or rotated domainUserId but same email
        var secondaryUserId = Guid.NewGuid();
        var claims2 = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, secondaryUserId.ToString("N")),
            new Claim(JwtRegisteredClaimNames.Sub, secondaryUserId.ToString("N")),
            new Claim(ClaimTypes.Email, email),
        }, "TestAuth"));

        var controller2 = CreateController(claims2);
        var listResult = await controller2.GetAppointments(null, null, true);

        var okResult = Assert.IsType<OkObjectResult>(listResult);
        var items = Assert.IsAssignableFrom<System.Collections.IEnumerable>(okResult.Value);
        var list = items.Cast<object>().ToList();

        Assert.NotEmpty(list);
    }
}
