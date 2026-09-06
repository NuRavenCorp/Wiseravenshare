// Wiseravenshare.Server/Services/Truth/EnhancedTruthVerificationEngine.cs
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Wiseravenshare.Server.Services.External.DeepSeekService;

namespace Wiseravenshare.Server.Services.Truth;

public interface IEnhancedTruthEngine
{
    Task<MisbeliefAnalysis> DetectMisbeleifs(string claim);
    Task<TruthScore> VerifyClaimAsync(string claim);
    Task<LogicalFallacyDetection> DetectFallaciesAsync(string text);
    Task<ComprehensiveTruthAssessment> AssessClaimAsync(string claim);
}

public class EnhancedTruthVerificationEngine : IEnhancedTruthEngine
{
    private readonly IDeepSeekService _deepSeekService;
    private readonly ILogger<EnhancedTruthVerificationEngine> _logger;

    public EnhancedTruthVerificationEngine(
        IDeepSeekService deepSeekService,
        ILogger<EnhancedTruthVerificationEngine> logger)
    {
        _deepSeekService = deepSeekService;
        _logger = logger;
    }

    /// <summary>
    /// Detects misbeliefs, false premises, and cognitive distortions in claims
    /// </summary>
    public async Task<MisbeliefAnalysis> DetectMisbeleifs(string claim)
    {
        var analysis = new MisbeliefAnalysis { OriginalClaim = claim };

        // Step 1: Check for mathematical expressions first
        var mathAnalysis = EvaluateMathematicalClaims(claim);
        if (mathAnalysis.IsMathematical && mathAnalysis.HasError)
        {
            analysis.Misbeliefs.Add(new Misbelief
            {
                Type = MisbeliefType.FactualError,
                Description = mathAnalysis.Error,
                Severity = MisbeliefSeverity.Critical,
                Correction = mathAnalysis.Correction,
                Confidence = 0.99m
            });
            return analysis;
        }

        // Step 2: Detect logical fallacies
        var fallacies = await DetectFallaciesAsync(claim);
        foreach (var fallacy in fallacies.DetectedFallacies)
        {
            analysis.Misbeliefs.Add(new Misbelief
            {
                Type = MisbeliefType.LogicalFallacy,
                Description = fallacy.FallacyType,
                Severity = MisbeliefSeverity.High,
                Evidence = fallacy.Evidence,
                Confidence = fallacy.Confidence
            });
        }

        // Step 3: Check for false premises and assumptions
        var premiseAnalysis = AnalyzePremises(claim);
        foreach (var falsePremise in premiseAnalysis.FalsePremises)
        {
            analysis.Misbeliefs.Add(new Misbelief
            {
                Type = MisbeliefType.FalsePremise,
                Description = falsePremise.Premise,
                Severity = MisbeliefSeverity.High,
                Correction = falsePremise.Correction,
                Confidence = falsePremise.Confidence
            });
        }

        // Step 4: Cognitive biases and emotional manipulation
        var biasAnalysis = DetectCognitiveBiases(claim);
        foreach (var bias in biasAnalysis.IdentifiedBiases)
        {
            analysis.Misbeliefs.Add(new Misbelief
            {
                Type = MisbeliefType.CognitiveBias,
                Description = bias.BiasType,
                Severity = MisbeliefSeverity.Medium,
                Evidence = bias.Evidence,
                Confidence = bias.Confidence
            });
        }

        // Step 5: Use DeepSeek for complex analysis
        var deepSeekAnalysis = await _deepSeekService.AssessTruthAsync(claim);
        analysis.DeepSeekVerdict = deepSeekAnalysis.Verdict;
        analysis.TruthScore = deepSeekAnalysis.TruthScore;

        // Step 6: Determine overall misbelief confidence
        analysis.OverallMisbeliefConfidence = analysis.Misbeliefs.Count > 0
            ? analysis.Misbeliefs.Average(m => (double)m.Confidence)
            : 0.0;

        return analysis;
    }

    /// <summary>
    /// Evaluates mathematical expressions for correctness
    /// </summary>
    private MathematicalAnalysis EvaluateMathematicalClaims(string claim)
    {
        var result = new MathematicalAnalysis { IsMathematical = false };

        // Pattern: "X + Y equals/is Z" or "X + Y = Z"
        var mathPattern = @"(\d+)\s*\+\s*(\d+)\s*(?:equals?|is|=)\s*(\d+)";
        var match = Regex.Match(claim, mathPattern, RegexOptions.IgnoreCase);

        if (!match.Success)
        {
            return result;
        }

        result.IsMathematical = true;
        var operand1 = int.Parse(match.Groups[1].Value);
        var operand2 = int.Parse(match.Groups[2].Value);
        var claimedResult = int.Parse(match.Groups[3].Value);
        var actualResult = operand1 + operand2;

        if (claimedResult != actualResult)
        {
            result.HasError = true;
            result.Error = $"Mathematical error detected: {operand1} + {operand2} = {claimedResult} is incorrect";
            result.Correction = $"The correct answer is: {operand1} + {operand2} = {actualResult}";
        }

        return result;
    }

    /// <summary>
    /// Detects logical fallacies in arguments
    /// </summary>
    public async Task<LogicalFallacyDetection> DetectFallaciesAsync(string text)
    {
        var detection = new LogicalFallacyDetection();

        // Ad Hominem - attacking the person rather than the argument
        if (Regex.IsMatch(text, @"\b(person|guy|she|he|they)\s+(is|are)\s+(stupid|idiotic|dumb|crazy)\b", RegexOptions.IgnoreCase))
        {
            detection.DetectedFallacies.Add(new FallacyInfo
            {
                FallacyType = "Ad Hominem",
                Evidence = "Attack on character rather than argument",
                Confidence = 0.85m
            });
        }

        // Straw Man - misrepresenting the opposition
        if (Regex.IsMatch(text, @"\b(they|you|opponents?)\s+want\s+to\s+(ban|destroy|eliminate|get rid of)\b", RegexOptions.IgnoreCase))
        {
            detection.DetectedFallacies.Add(new FallacyInfo
            {
                FallacyType = "Straw Man Fallacy",
                Evidence = "Oversimplification of opposing viewpoint",
                Confidence = 0.75m
            });
        }

        // Appeal to Authority without evidence
        if (Regex.IsMatch(text, @"\b(experts|scientists|doctors)\s+say\b(?!\s+(?:that|according to|research shows))", RegexOptions.IgnoreCase))
        {
            detection.DetectedFallacies.Add(new FallacyInfo
            {
                FallacyType = "Appeal to Authority",
                Evidence = "Vague reference to authority without specific citation",
                Confidence = 0.70m
            });
        }

        // False Dilemma
        if (Regex.IsMatch(text, @"\b(either|you must)\s+.*\s+(or|you must)\s+.*\b", RegexOptions.IgnoreCase))
        {
            detection.DetectedFallacies.Add(new FallacyInfo
            {
                FallacyType = "False Dilemma",
                Evidence = "Presents only two options when more exist",
                Confidence = 0.75m
            });
        }

        // Circular Reasoning - repeating the same claim as evidence
        if (Regex.IsMatch(text, @"because\s+.*is\s+(true|real|correct|facts?)\b", RegexOptions.IgnoreCase))
        {
            detection.DetectedFallacies.Add(new FallacyInfo
            {
                FallacyType = "Circular Reasoning",
                Evidence = "Uses conclusion as its own premise",
                Confidence = 0.70m
            });
        }

        // Slippery Slope
        if (Regex.IsMatch(text, @"\b(will lead to|eventually|inevitably|soon)\s+.*(?:ban|destroy|eliminate|collapse)\b", RegexOptions.IgnoreCase))
        {
            detection.DetectedFallacies.Add(new FallacyInfo
            {
                FallacyType = "Slippery Slope",
                Evidence = "Assumes chain reaction without evidence",
                Confidence = 0.70m
            });
        }

        // Hasty Generalization
        if (Regex.IsMatch(text, @"\b(all|every|none of)\s+.*\s+(always|never)\b", RegexOptions.IgnoreCase))
        {
            detection.DetectedFallacies.Add(new FallacyInfo
            {
                FallacyType = "Hasty Generalization",
                Evidence = "Makes sweeping claim without sufficient evidence",
                Confidence = 0.75m
            });
        }

        // Use DeepSeek for nuanced fallacy detection
        var prompt = $@"Identify any logical fallacies in this statement. List each fallacy type and explain why it's a fallacy:

        Statement: {text}

        Respond in JSON format with array of objects: {{fallacies: [{{type: string, explanation: string, confidence: number}}]}}";

        try
        {
            var response = await _deepSeekService.GenerateAsync(prompt);
            var deepSeekFallacies = JsonSerializer.Deserialize<dynamic>(response);
            // Parse and add DeepSeek findings (implementation depends on response structure)
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "DeepSeek fallacy detection failed");
        }

        return detection;
    }

    /// <summary>
    /// Analyzes premises in claims for validity
    /// </summary>
    private PremiseAnalysis AnalyzePremises(string claim)
    {
        var analysis = new PremiseAnalysis();

        // Extract statements that appear to be premises
        var sentences = Regex.Split(claim, @"(?<=[.!?])\s+");

        foreach (var sentence in sentences)
        {
            // Check for false medical premises
            if (Regex.IsMatch(sentence, @"\b(vaccines?|vaccines?.*cause|vaccines? give)\b", RegexOptions.IgnoreCase))
            {
                analysis.FalsePremises.Add(new FalsePremise
                {
                    Premise = "Vaccines cause diseases or autism",
                    Correction = "Extensive scientific studies show no causal link between vaccines and autism or most diseases. Vaccines save millions of lives annually.",
                    Confidence = 0.99m
                });
            }

            // Check for false climate premises
            if (Regex.IsMatch(sentence, @"\b(climate change.*fake|global warming.*hoax|climate.*not real)\b", RegexOptions.IgnoreCase))
            {
                analysis.FalsePremises.Add(new FalsePremise
                {
                    Premise = "Climate change is not real",
                    Correction = "97%+ of climate scientists agree climate change is real and human-caused. Evidence is overwhelming from multiple independent sources.",
                    Confidence = 0.98m
                });
            }

            // Check for false earth shape premises
            if (Regex.IsMatch(sentence, @"\b(earth.*flat|earth is a disk|flat earth)\b", RegexOptions.IgnoreCase))
            {
                analysis.FalsePremises.Add(new FalsePremise
                {
                    Premise = "The Earth is flat",
                    Correction = "The Earth is an oblate spheroid. This has been demonstrated by satellite imagery, physics, and centuries of observations.",
                    Confidence = 0.99m
                });
            }
        }

        return analysis;
    }

    /// <summary>
    /// Detects cognitive biases and emotional manipulation tactics
    /// </summary>
    private CognitiveBiasAnalysis DetectCognitiveBiases(string claim)
    {
        var analysis = new CognitiveBiasAnalysis();

        // Confirmation Bias indicators
        if (Regex.IsMatch(claim, @"\b(obviously|clearly|of course|everyone knows)\b", RegexOptions.IgnoreCase))
        {
            analysis.IdentifiedBiases.Add(new BiasInfo
            {
                BiasType = "Confirmation Bias",
                Evidence = "Uses universalizing language that assumes agreement",
                Confidence = 0.70m
            });
        }

        // Availability Heuristic - overemphasis on recent/memorable events
        if (Regex.IsMatch(claim, @"\b(recently|just (saw|read|heard)|went viral)\b", RegexOptions.IgnoreCase))
        {
            analysis.IdentifiedBiases.Add(new BiasInfo
            {
                BiasType = "Availability Heuristic",
                Evidence = "May overweight recent or memorable cases",
                Confidence = 0.65m
            });
        }

        // Emotional Language - potential manipulation
        if (Regex.IsMatch(claim, @"\b(terrifying|horrifying|shocking|unbelievable|outrageous)\b", RegexOptions.IgnoreCase))
        {
            analysis.IdentifiedBiases.Add(new BiasInfo
            {
                BiasType = "Emotional Manipulation",
                Evidence = "Uses heightened emotional language that may cloud judgment",
                Confidence = 0.75m
            });
        }

        // Appeal to Fear
        if (Regex.IsMatch(claim, @"\b(will destroy|will kill|deadly|dangerous|threat to)\b", RegexOptions.IgnoreCase))
        {
            analysis.IdentifiedBiases.Add(new BiasInfo
            {
                BiasType = "Appeal to Fear",
                Evidence = "Uses fear-based language without proportional evidence",
                Confidence = 0.70m
            });
        }

        // Bandwagon - "everyone believes this"
        if (Regex.IsMatch(claim, @"\b(everyone|most people|most scientists) (believes?|knows?|agrees?)\b", RegexOptions.IgnoreCase))
        {
            analysis.IdentifiedBiases.Add(new BiasInfo
            {
                BiasType = "Bandwagon Fallacy",
                Evidence = "Appeals to popularity rather than evidence",
                Confidence = 0.70m
            });
        }

        return analysis;
    }

    /// <summary>
    /// Comprehensive truth assessment combining all methods
    /// </summary>
    public async Task<ComprehensiveTruthAssessment> AssessClaimAsync(string claim)
    {
        var assessment = new ComprehensiveTruthAssessment { Claim = claim };

        // Get misbelief analysis
        var misbeleifAnalysis = await DetectMisbeleifs(claim);
        assessment.Misbeliefs = misbeleifAnalysis.Misbeliefs;
        assessment.MisbeliefConfidence = misbeleifAnalysis.OverallMisbeliefConfidence;

        // Get DeepSeek assessment
        var deepSeekAssessment = await _deepSeekService.AssessTruthAsync(claim);
        assessment.DeepSeekVerdict = deepSeekAssessment.Verdict;
        assessment.TruthScore = deepSeekAssessment.TruthScore;
        assessment.RiskLevel = deepSeekAssessment.RiskLevel;
        assessment.Correction = deepSeekAssessment.Correction;

        // Calculate final score
        var hasSignificantMisbeliefs = assessment.Misbeliefs.Any(m => m.Severity >= MisbeliefSeverity.High);
        if (hasSignificantMisbeliefs)
        {
            assessment.FinalTruthScore = Math.Max(0, assessment.TruthScore - 30);
            assessment.IsReliable = false;
        }
        else
        {
            assessment.FinalTruthScore = assessment.TruthScore;
            assessment.IsReliable = assessment.TruthScore >= 70;
        }

        assessment.ProcessedAt = DateTime.UtcNow;
        return assessment;
    }

    public async Task<TruthScore> VerifyClaimAsync(string claim)
    {
        var assessment = await AssessClaimAsync(claim);
        return new TruthScore
        {
            Score = assessment.FinalTruthScore,
            Confidence = assessment.MisbeliefConfidence,
            Accuracy = assessment.FinalTruthScore / 100m,
            IsReliable = assessment.IsReliable
        };
    }
}

// Supporting types
public class MisbeliefAnalysis
{
    public string OriginalClaim { get; set; } = string.Empty;
    public List<Misbelief> Misbeliefs { get; set; } = new();
    public double OverallMisbeliefConfidence { get; set; }
    public string DeepSeekVerdict { get; set; } = string.Empty;
    public int TruthScore { get; set; }
}

public class Misbelief
{
    public MisbeliefType Type { get; set; }
    public string Description { get; set; } = string.Empty;
    public MisbeliefSeverity Severity { get; set; }
    public string? Evidence { get; set; }
    public string? Correction { get; set; }
    public decimal Confidence { get; set; }
}

public enum MisbeliefType
{
    FactualError,
    LogicalFallacy,
    FalsePremise,
    CognitiveBias,
    StatisticalError,
    EmotionalManipulation
}

public enum MisbeliefSeverity
{
    Low,
    Medium,
    High,
    Critical
}

public class LogicalFallacyDetection
{
    public List<FallacyInfo> DetectedFallacies { get; set; } = new();
}

public class FallacyInfo
{
    public string FallacyType { get; set; } = string.Empty;
    public string Evidence { get; set; } = string.Empty;
    public decimal Confidence { get; set; }
}

public class PremiseAnalysis
{
    public List<FalsePremise> FalsePremises { get; set; } = new();
}

public class FalsePremise
{
    public string Premise { get; set; } = string.Empty;
    public string Correction { get; set; } = string.Empty;
    public decimal Confidence { get; set; }
}

public class CognitiveBiasAnalysis
{
    public List<BiasInfo> IdentifiedBiases { get; set; } = new();
}

public class BiasInfo
{
    public string BiasType { get; set; } = string.Empty;
    public string Evidence { get; set; } = string.Empty;
    public decimal Confidence { get; set; }
}

public class MathematicalAnalysis
{
    public bool IsMathematical { get; set; }
    public bool HasError { get; set; }
    public string Error { get; set; } = string.Empty;
    public string Correction { get; set; } = string.Empty;
}

public class ComprehensiveTruthAssessment
{
    public string Claim { get; set; } = string.Empty;
    public List<Misbelief> Misbeliefs { get; set; } = new();
    public double MisbeliefConfidence { get; set; }
    public string DeepSeekVerdict { get; set; } = string.Empty;
    public int TruthScore { get; set; }
    public int FinalTruthScore { get; set; }
    public bool IsReliable { get; set; }
    public string RiskLevel { get; set; } = string.Empty;
    public string? Correction { get; set; }
    public DateTime ProcessedAt { get; set; }
}

public class TruthScore
{
    public int Score { get; set; }
    public double Confidence { get; set; }
    public decimal Accuracy { get; set; }
    public bool IsReliable { get; set; }
}
