namespace Wiseravenshare.Server.Services;

public interface IEmailService
{
    Task SendWelcomeEmailAsync(string email, string displayName);
    Task SendPasswordResetEmailAsync(string email, string displayName, string resetToken);
}

public class NoopEmailService : IEmailService
{
    public Task SendWelcomeEmailAsync(string email, string displayName)
    {
        return Task.CompletedTask;
    }

    public Task SendPasswordResetEmailAsync(string email, string displayName, string resetToken)
    {
        return Task.CompletedTask;
    }
}
