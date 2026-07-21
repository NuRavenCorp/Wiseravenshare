namespace Wiseravenshare.Server.Infrastructure.Data;

public interface IDataSeeder
{
    Task SeedAsync();
}

public class DataSeeder : IDataSeeder
{
    public Task SeedAsync()
    {
        return Task.CompletedTask;
    }
}
