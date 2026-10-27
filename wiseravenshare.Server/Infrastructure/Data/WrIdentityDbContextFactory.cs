using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Wiseravenshare.Server.Infrastructure.Data;

/// <summary>
/// Design-time factory for <see cref="WrIdentityDbContext"/> migration tooling.
/// </summary>
public sealed class WrIdentityDbContextFactory : IDesignTimeDbContextFactory<WrIdentityDbContext>
{
    public WrIdentityDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=wiseravenshare_db;Username=postgres;Password=postgres;SSL Mode=Disable;Trust Server Certificate=true";

        var optionsBuilder = new DbContextOptionsBuilder<WrIdentityDbContext>();
        optionsBuilder.UseNpgsql(connectionString, npgsql =>
        {
            npgsql.MigrationsHistoryTable("__EFMigrationsHistory", "identity");
        });

        return new WrIdentityDbContext(optionsBuilder.Options);
    }
}
