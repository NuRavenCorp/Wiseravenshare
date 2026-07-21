namespace Wiseravenshare.Server.Services;

public interface IEmailService
{
    Task SendWelcomeEmailAsync(string email, string displayName);
}

public class NoopEmailService : IEmailService
{
    public Task SendWelcomeEmailAsync(string email, string displayName)
    {
        return Task.CompletedTask;
    }
}
