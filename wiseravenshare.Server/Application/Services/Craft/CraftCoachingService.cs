using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using WiseRavenShare.Server.Application.DTOs.Craft;
using WiseRavenShare.Server.Application.Services.Assistant;
using WiseRavenShare.Server.Core.Entities.Craft;
using WiseRavenShare.Server.Core.Interfaces.Repositories.Assistant;
using Wiseravenshare.Server.Infrastructure.Data;

namespace WiseRavenShare.Server.Application.Services.Craft;

public interface ICraftCoachingService
{
    Task<CraftDraftReviewResponse> ReviewDraftAsync(
        Guid userId,
        CraftDraftReviewRequest request,
        CancellationToken cancellationToken = default);
}

public class CraftCoachingService : ICraftCoachingService
{
    private readonly Wiseravenshare.Server.Infrastructure.Data.AppDbContext _context;
    private readonly ILlmGateway _llmGateway;
    private readonly IEmbeddingService _embeddingService;
    private readonly ILogger<CraftCoachingService> _logger;

    public CraftCoachingService(
        Wiseravenshare.Server.Infrastructure.Data.AppDbContext context,
        ILlmGateway llmGateway,
        IEmbeddingService embeddingService,
        ILogger<CraftCoachingService> logger)
    {
        _context = context;
        _llmGateway = llmGateway;
        _embeddingService = embeddingService;
        _logger = logger;
    }

    public async Task<CraftDraftReviewResponse> ReviewDraftAsync(
        Guid userId,
        CraftDraftReviewRequest request,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Validate request
            if (string.IsNullOrWhiteSpace(request.DraftContent))
                throw new ArgumentException("Draft content cannot be empty.");

            if (string.IsNullOrWhiteSpace(request.DomainKey))
                throw new ArgumentException("Domain key is required.");

            // Fetch domain
            var domain = await _context.CraftDomains
                .AsNoTracking()
                .FirstOrDefaultAsync(d => d.Key == request.DomainKey, cancellationToken);

            if (domain == null)
                throw new ArgumentException($"Domain '{request.DomainKey}' not found.");

            // Retrieve relevant principles via RAG (vector similarity search)
            var wordCount = request.DraftContent.Split().Length;
            var principles = await RetrieveRelevantPrinciples(
                request.DraftContent,
                domain.Id,
                request.MaxPrinciples ?? 5,
                cancellationToken);

            // Generate coaching via LLM
            var coachingResponse = await GenerateCoachingAsync(
                request.DraftContent,
                domain.Name,
                principles,
                request.ContentType,
                request.Context,
                cancellationToken);

            // Save draft review to database
            var draftReview = new CraftDraftReview
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                CraftDomainId = domain.Id,
                DomainKey = request.DomainKey,
                ContentType = request.ContentType,
                DraftContent = request.DraftContent,
                Context = request.Context,
                OverallScore = coachingResponse.OverallScore,
                WordCount = wordCount,
                ReviewedAt = DateTime.UtcNow,
                CoachingOutput = JsonDocument.Parse(JsonSerializer.Serialize(coachingResponse))
            };

            _context.CraftDraftReviews.Add(draftReview);
            await _context.SaveChangesAsync(cancellationToken);

            // Add RAG context (principle IDs) to response
            coachingResponse.RagContext = principles.Select(p => p.Title).ToList();
            coachingResponse.DraftReviewId = draftReview.Id;
            coachingResponse.WordCount = wordCount;

            return coachingResponse;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reviewing draft for domain {DomainKey}", request.DomainKey);
            
            // Return graceful fallback response
            return new CraftDraftReviewResponse
            {
                Domain = request.DomainKey,
                OverallScore = 50,
                Strengths = new() { "Unable to generate detailed feedback at this time." },
                AiAnalysis = $"Coaching service error: {ex.Message}",
                WordCount = request.DraftContent.Split().Length
            };
        }
    }

    private async Task<List<CraftPrinciple>> RetrieveRelevantPrinciples(
        string draftContent,
        Guid domainId,
        int topK,
        CancellationToken cancellationToken)
    {
        try
        {
            // Embed the draft content
            var embedding = await _embeddingService.EmbedAsync(draftContent, cancellationToken);
            if (embedding == null || embedding.Length == 0)
            {
                // Fallback: return highest-importance principles
                return await _context.CraftPrinciples
                    .AsNoTracking()
                    .Where(p => p.CraftDomainId == domainId)
                    .OrderByDescending(p => p.Importance)
                    .Take(topK)
                    .ToListAsync(cancellationToken);
            }

            // Search via vector similarity (cosine) over principles with embeddings using raw SQL
            var vectorLiteral = "[" + string.Join(',', embedding.Select(f => f.ToString(System.Globalization.CultureInfo.InvariantCulture))) + "]";
            
            var sql = @"
                SELECT id, craft_domain_id, skill_id, title, description, example, counter_example, author, kind, importance, embedding
                FROM craft_principles
                WHERE craft_domain_id = @DomainId AND embedding IS NOT NULL
                ORDER BY embedding <=> @Embedding::vector
                LIMIT @TopK;";

            var similarPrinciples = new List<CraftPrinciple>();
            await using (var cmd = _context.Database.GetDbConnection().CreateCommand())
            {
                cmd.CommandText = sql;

                var p0 = cmd.CreateParameter();
                p0.ParameterName = "@DomainId";
                p0.Value = domainId;
                cmd.Parameters.Add(p0);

                var p1 = cmd.CreateParameter();
                p1.ParameterName = "@Embedding";
                p1.Value = vectorLiteral;
                cmd.Parameters.Add(p1);

                var p2 = cmd.CreateParameter();
                p2.ParameterName = "@TopK";
                p2.Value = topK;
                cmd.Parameters.Add(p2);

                await _context.Database.OpenConnectionAsync(cancellationToken);
                using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken))
                {
                    similarPrinciples.Add(new CraftPrinciple
                    {
                        Id = reader.GetGuid(0),
                        CraftDomainId = reader.GetGuid(1),
                        SkillId = reader.IsDBNull(2) ? null : reader.GetGuid(2),
                        Title = reader.GetString(3),
                        Description = reader.GetString(4),
                        Example = reader.IsDBNull(5) ? null : reader.GetString(5),
                        CounterExample = reader.IsDBNull(6) ? null : reader.GetString(6),
                        Author = reader.IsDBNull(7) ? null : reader.GetString(7),
                        Kind = (PrincipleKind)reader.GetInt32(8),
                        Importance = reader.GetInt32(9)
                    });
                }
            }

            // If not enough principles with embeddings, supplement with high-importance ones
            if (similarPrinciples.Count < topK)
            {
                var similarIds = similarPrinciples.Select(p => p.Id).ToList();
                var remaining = topK - similarPrinciples.Count;
                var supplemental = await _context.CraftPrinciples
                    .AsNoTracking()
                    .Where(p => p.CraftDomainId == domainId && !similarIds.Contains(p.Id))
                    .OrderByDescending(p => p.Importance)
                    .Take(remaining)
                    .ToListAsync(cancellationToken);
                
                similarPrinciples.AddRange(supplemental);
            }

            return similarPrinciples;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Vector search failed, falling back to importance-based retrieval");
            
            // Fallback to importance-based retrieval
            return await _context.CraftPrinciples
                .AsNoTracking()
                .Where(p => p.CraftDomainId == domainId)
                .OrderByDescending(p => p.Importance)
                .Take(topK)
                .ToListAsync(cancellationToken);
        }
    }

    private async Task<CraftDraftReviewResponse> GenerateCoachingAsync(
        string draftContent,
        string domainName,
        List<CraftPrinciple> principles,
        string contentType,
        string? context,
        CancellationToken cancellationToken)
    {
        var principlesText = string.Join("\n\n", principles.Select(p =>
            $"**{p.Title}** ({p.Kind})\n{p.Description}\nExample: {p.Example}"));

        var systemPrompt = $@"You are an expert content coach specializing in {domainName}.
Your task is to review a {contentType} draft and provide actionable feedback using key principles from the craft.

## Key Principles to Reference:
{principlesText}

Provide feedback as JSON with this structure:
{{
  ""overallScore"": <0-100 score>,
  ""strengths"": [""strength 1"", ""strength 2"", ...],
  ""improvements"": [
    {{
      ""principleKey"": ""principle_id"",
      ""principleTitle"": ""Principle Title"",
      ""feedback"": ""Specific feedback"",
      ""example"": ""What to do instead"",
      ""severity"": ""high|medium|low""
    }},
    ...
  ],
  ""nextSteps"": [""action 1"", ""action 2"", ...],
  ""aiAnalysis"": ""Summary of coaching""
}}";

        var userPrompt = $@"Please review this {contentType}:

{draftContent}

{(string.IsNullOrWhiteSpace(context) ? "" : $"\nContext: {context}")}

Provide structured coaching feedback as JSON.";

        try
        {
            var req = new LlmRequest
            {
                SystemPrompt = systemPrompt,
                Messages = new() { new LlmMessage("user", userPrompt) },
                JsonMode = true,
                Temperature = 0.7,
                MaxTokens = 2000
            };

            var response = await _llmGateway.CompleteAsync(req, cancellationToken);

            // Parse LLM response
            var coaching = ParseCoachingResponse(response.Content);
            return coaching;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "LLM coaching generation failed");
            throw;
        }
    }

    private CraftDraftReviewResponse ParseCoachingResponse(string llmResponse)
    {
        try
        {
            // Extract JSON from LLM response (may have surrounding text)
            var jsonStart = llmResponse.IndexOf('{');
            var jsonEnd = llmResponse.LastIndexOf('}');

            if (jsonStart < 0 || jsonEnd < 0)
                throw new InvalidOperationException("No JSON found in LLM response");

            var jsonStr = llmResponse.Substring(jsonStart, jsonEnd - jsonStart + 1);
            var doc = JsonDocument.Parse(jsonStr);
            var root = doc.RootElement;

            var response = new CraftDraftReviewResponse
            {
                OverallScore = root.TryGetProperty("overallScore", out var score)
                    ? score.GetDecimal()
                    : 50,
                AiAnalysis = root.TryGetProperty("aiAnalysis", out var analysis)
                    ? analysis.GetString() ?? ""
                    : ""
            };

            // Parse strengths
            if (root.TryGetProperty("strengths", out var strengths) && strengths.ValueKind == JsonValueKind.Array)
            {
                response.Strengths = strengths.EnumerateArray()
                    .Select(s => s.GetString() ?? "")
                    .Where(s => !string.IsNullOrEmpty(s))
                    .ToList();
            }

            // Parse improvements
            if (root.TryGetProperty("improvements", out var improvements) && improvements.ValueKind == JsonValueKind.Array)
            {
                response.Improvements = improvements.EnumerateArray()
                    .Select(imp => new CraftCoachingSuggestion
                    {
                        PrincipleKey = imp.TryGetProperty("principleKey", out var pk) ? pk.GetString() ?? "" : "",
                        PrincipleTitle = imp.TryGetProperty("principleTitle", out var pt) ? pt.GetString() ?? "" : "",
                        Feedback = imp.TryGetProperty("feedback", out var fb) ? fb.GetString() ?? "" : "",
                        Example = imp.TryGetProperty("example", out var ex) ? ex.GetString() : null,
                        Severity = imp.TryGetProperty("severity", out var sev) ? sev.GetString() ?? "medium" : "medium"
                    })
                    .ToList();
            }

            // Parse next steps
            if (root.TryGetProperty("nextSteps", out var nextSteps) && nextSteps.ValueKind == JsonValueKind.Array)
            {
                response.NextSteps = nextSteps.EnumerateArray()
                    .Select(s => s.GetString() ?? "")
                    .Where(s => !string.IsNullOrEmpty(s))
                    .ToList();
            }

            return response;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to parse LLM coaching response, returning default");
            return new CraftDraftReviewResponse
            {
                OverallScore = 50,
                Strengths = new() { "Draft received and processed" },
                AiAnalysis = llmResponse // Return raw response if parsing fails
            };
        }
    }
}
