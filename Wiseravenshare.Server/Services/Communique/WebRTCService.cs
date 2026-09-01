namespace Wiseravenshare.Server.Services.Communique;

public interface IWebRTCService
{
    Task<string> GenerateOffer(string callId, string userId);
    Task<bool> ProcessAnswer(string callId, string userId, string answer);
    Task<bool> AddIceCandidate(string callId, string candidate);
    Task<string> GetStunTurnConfig();
}

public class WebRTCService : IWebRTCService
{
    private readonly IConfiguration _configuration;

    public WebRTCService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public async Task<string> GenerateOffer(string callId, string userId)
    {
        // In production this would interact with a WebRTC media server.
        return await Task.FromResult($"v=0\r\no={userId} 0 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\n");
    }

    public async Task<bool> ProcessAnswer(string callId, string userId, string answer) =>
        await Task.FromResult(true);

    public async Task<bool> AddIceCandidate(string callId, string candidate) =>
        await Task.FromResult(true);

    public async Task<string> GetStunTurnConfig()
    {
        var config = new
        {
            iceServers = new[]
            {
                new
                {
                    urls        = _configuration["Communique:WebRTC:StunServer"],
                    username    = (string?)null,
                    credential  = (string?)null
                },
                new
                {
                    urls        = _configuration["Communique:WebRTC:TurnServer"],
                    username    = _configuration["Communique:WebRTC:TurnUsername"],
                    credential  = _configuration["Communique:WebRTC:TurnCredential"]
                }
            }
        };

        return await Task.FromResult(System.Text.Json.JsonSerializer.Serialize(config));
    }
}
