using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OpenAI.Chat;
using WiseRavenShare.Backend.Models;

namespace WiseRavenShare.Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [EnableCors("AllowReactApp")]
    [EnableRateLimiting("AiChatPolicy")]
    public class AiChatController : ControllerBase
    {
        private readonly ChatClient _chatClient;

        public AiChatController(ChatClient chatClient)
        {
            _chatClient = chatClient;
        }

        [HttpPost("stream")]
        public async Task GetStreamedResponse([FromBody] ChatRequest request, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(request.Prompt))
            {
                Response.StatusCode = 400;
                await Response.WriteAsync("Prompt cannot be empty.");
                return;
            }

            Response.ContentType = "text/event-stream";
            Response.Headers.Append("Cache-Control", "no-cache");
            Response.Headers.Append("Connection", "keep-alive");

            var messages = new List<ChatMessage>
            {
                new SystemChatMessage(
                    "You are the official WiseRavenShare Assistant. Help creators manage uploads, " +
                    "understand file sharing, navigate copyright protection, and optimize their media content. " +
                    "Keep responses professional, brief, and structured with clean markdown if necessary.")
            };

            // Add simple context history (or expand this to accept an array of previous messages)
            messages.Add(new UserChatMessage(request.Prompt));

            try
            {
                AsyncCollectionResult<StreamingChatCompletionUpdate> updates = _chatClient.CompleteChatStreamingAsync(messages, cancellationToken: cancellationToken);

                await foreach (StreamingChatCompletionUpdate update in updates)
                {
                    if (update.ContentUpdate.Count > 0)
                    {
                        string textChunk = update.ContentUpdate[0].Text;
                        // Format as server-sent event (SSE) standard data block
                        await Response.WriteAsync($"data: {textChunk}\n\n");
                        await Response.Body.FlushAsync(cancellationToken);
                    }
                }
            }
            catch (Exception ex)
            {
                await Response.WriteAsync($"data: [ERROR: {ex.Message}]\n\n");
            }
        }
    }
}
