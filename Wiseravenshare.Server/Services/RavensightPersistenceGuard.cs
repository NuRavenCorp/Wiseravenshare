namespace Wiseravenshare.Server.Services;

public static class RavensightPersistenceGuard
{
    public static async Task<T> RunWithTimeoutAsync<T>(
        Func<CancellationToken, Task<T>> operation,
        T fallbackValue,
        TimeSpan? timeout = null)
    {
        if (operation is null)
        {
            throw new ArgumentNullException(nameof(operation));
        }

        var timeoutValue = timeout ?? TimeSpan.FromSeconds(5);
        var operationTask = operation(CancellationToken.None);
        var timeoutTask = Task.Delay(timeoutValue);

        var completedTask = await Task.WhenAny(operationTask, timeoutTask);
        if (completedTask == operationTask)
        {
            return await operationTask;
        }

        return fallbackValue;
    }
}