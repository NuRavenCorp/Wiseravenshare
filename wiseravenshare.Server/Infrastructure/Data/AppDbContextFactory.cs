using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Wiseravenshare.Server.Infrastructure.Data;

/// <summary>
/// Design-time factory for EF Core migration tooling.
/// </summary>
public class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        // Read from environment or fall back to local dev defaults
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=wiseravenshare_db;Username=postgres;Password=postgres;SSL Mode=Disable;Trust Server Certificate=true";

        var optionsBuilder = new DbContextOptionsBuilder<AppDbContext>();
        optionsBuilder.UseNpgsql(connectionString, npgsql =>
        {
            npgsql.MigrationsHistoryTable("__EFMigrationsHistory", "app_data");
        });

        return new AppDbContext(optionsBuilder.Options);
    }
}
