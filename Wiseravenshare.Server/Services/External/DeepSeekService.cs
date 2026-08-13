// Wiseravenshare.Infrastructure/External/DeepSeekService.cs
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Wiseravenshare.Server.Services.External.DeepSeekService
{

    public interface IDeepSeekService
    {
        Task<string> GenerateAsync(string prompt);
        Task<DeepSeekResponse> QueryAsync(string query);
        Task<FactVerification> VerifyFactAsync(string fact, string context);
        Task<SemanticAnalysis> AnalyzeSemanticsAsync(string text);
        Task<TruthAssessment> AssessTruthAsync(string claim);
    }


    public class DeepSeekService : IDeepSeekService
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<DeepSeekService> _logger;

        public DeepSeekService(
            HttpClient httpClient,
            IConfiguration configuration,
            ILogger<DeepSeekService> logger)
        {
            _httpClient = httpClient;
            _configuration = configuration;
            _logger = logger;

            _httpClient.BaseAddress = new Uri(configuration["DeepSeek:ApiBaseUrl"] ?? "https://api.deepseek.com/v1");
            _httpClient.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", configuration["DeepSeek:ApiKey"]);
        }

        public async Task<string> GenerateAsync(string prompt)
        {
            try
            {
                var request = new
                {
                    model = "deepseek-chat",
                    messages = new[]
                    {
                    new { role = "system", content = @"You are Wiseravenshare Truth Engine, an advanced AI dedicated to truth verification. Your purpose is to fact-check claims with absolute precision. Follow these strict rules:

                    1. Always verify claims against established scientific consensus
                    2. Cross-reference multiple authoritative sources
                    3. Provide clear reasoning with step-by-step logic
                    4. Identify logical fallacies and cognitive biases
                    5. Be objective and unbiased
                    6. When uncertain, clearly state the limitations
                    7. Provide actionable corrections when claims are false
                    8. Cite specific sources and evidence
                    9. Consider historical context and temporal evolution
                    10. Evaluate statistical claims for validity

                    Output format must be valid JSON with fields: verdict, confidence, reasoning, counterarguments, needed_evidence" },
                    new { role = "user", content = prompt }
                },
                    temperature = 0.1,
                    max_tokens = 2000,
                    top_p = 0.95
                };

                var json = JsonSerializer.Serialize(request);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await _httpClient.PostAsync("/chat/completions", content);
                response.EnsureSuccessStatusCode();

                var responseJson = await response.Content.ReadAsStringAsync();
                var result = JsonSerializer.Deserialize<DeepSeekResponse>(responseJson);

                return result?.Choices?.FirstOrDefault()?.Message?.Content ?? "Unable to process request";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calling DeepSeek API");
                throw new DeepSeekException("Failed to generate response from DeepSeek", ex);
            }
        }

        public async Task<DeepSeekResponse> QueryAsync(string query)
        {
            var prompt = $@"Analyze the following query and provide a comprehensive response:
        {query}

        Include:
        1. Direct answer
        2. Supporting evidence
        3. Confidence level
        4. Sources
        5. Limitations";

            var response = await GenerateAsync(prompt);
            return JsonSerializer.Deserialize<DeepSeekResponse>(response) ?? new DeepSeekResponse();
        }

        public async Task<FactVerification> VerifyFactAsync(string fact, string context)
        {
            var prompt = $@"
        Verify the following fact within this context:

        Fact: {fact}
        Context: {context}

        Provide:
        1. Truth status (True/False/Uncertain)
        2. Confidence score (0.0-1.0)
        3. Evidence
        4. Counterevidence
        5. Final verdict
        6. Correction if false
        ";

            var response = await GenerateAsync(prompt);
            return JsonSerializer.Deserialize<FactVerification>(response) ?? new FactVerification();
        }

        public async Task<SemanticAnalysis> AnalyzeSemanticsAsync(string text)
        {
            var prompt = $@"
        Perform semantic analysis on the following text:
        {text}

        Provide:
        1. Main claims
        2. Key entities
        3. Relationships
        4. Sentiment
        5. Bias detection
        6. Logical consistency
        ";

            var response = await GenerateAsync(prompt);
            return JsonSerializer.Deserialize<SemanticAnalysis>(response) ?? new SemanticAnalysis();
        }

        public async Task<TruthAssessment> AssessTruthAsync(string claim)
        {
            var prompt = $@"
        Conduct a comprehensive truth assessment of this claim:

        Claim: {claim}

        Analysis Framework:
        1. Scientific Evidence: Is there empirical evidence?
        2. Logical Validity: Does it follow logical reasoning?
        3. Source Credibility: Are sources reliable?
        4. Historical Context: How has this claim evolved?
        5. Consensus: Is there expert/scientific consensus?
        6. Fallacies: Any logical fallacies present?
        7. Bias: Any cognitive or confirmation bias?

        Provide:
        - Truth Score (0-100)
        - Verdict (True/False/Partially True/Unverifiable)
        - Evidence Summary
        - Misinformation Type (if applicable)
        - Actionable Correction
        - Risk Level (None/Low/Medium/High)
        - Recommended Action
        ";

            var response = await GenerateAsync(prompt);
            return JsonSerializer.Deserialize<TruthAssessment>(response) ?? new TruthAssessment();
        }
    }

    // Supporting DTOs
    public class DeepSeekResponse
    {
        public List<Choice> Choices { get; set; } = new();
    }

    public class Choice
    {
        public Message Message { get; set; } = new();
    }

    public class Message
    {
        public string Content { get; set; } = string.Empty;
    }

    public class FactVerification
    {
        public string TruthStatus { get; set; } = string.Empty;
        public decimal ConfidenceScore { get; set; }
        public List<string> Evidence { get; set; } = new();
        public List<string> Counterevidence { get; set; } = new();
        public string Verdict { get; set; } = string.Empty;
        public string Correction { get; set; } = string.Empty;
    }

    public class SemanticAnalysis
    {
        public List<string> MainClaims { get; set; } = new();
        public List<string> KeyEntities { get; set; } = new();
        public List<string> Relationships { get; set; } = new();
        public string Sentiment { get; set; } = string.Empty;
        public List<string> Bias { get; set; } = new();
        public bool LogicallyConsistent { get; set; }
    }

    public class TruthAssessment
    {
        public int TruthScore { get; set; }
        public string Verdict { get; set; } = string.Empty;
        public string EvidenceSummary { get; set; } = string.Empty;
        public string MisinformationType { get; set; } = string.Empty;
        public string Correction { get; set; } = string.Empty;
        public string RiskLevel { get; set; } = string.Empty;
        public string RecommendedAction { get; set; } = string.Empty;
    }

    public class DeepSeekException : Exception
    {
        public DeepSeekException(string message, Exception innerException) : base(message, innerException)
        {
        }
    }
}