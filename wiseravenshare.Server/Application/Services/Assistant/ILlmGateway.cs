using WiseRavenShare.Server.Entities.Assistant;

namespace WiseRavenShare.Server.Application.Services.Assistant;

public interface ILlmGateway
{
    Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct = default);
    IAsyncEnumerable<LlmStreamChunk> StreamAsync(LlmRequest request, CancellationToken ct = default);
    Task<float[]> EmbedAsync(string text, CancellationToken ct = default);
}
