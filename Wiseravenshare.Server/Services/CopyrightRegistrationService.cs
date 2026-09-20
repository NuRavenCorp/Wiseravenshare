// Wiseravenshare.Server/Services/CopyrightRegistrationService.cs
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Microsoft.Extensions.Logging;

namespace Wiseravenshare.Server.Services;

/// <summary>
/// Provides information about U.S. Copyright Office music registration forms and pass-through pricing.
/// Supports sound recordings, musical compositions, and lyrics registration.
/// Zero markup: prices pass directly to users as Copyright Office fees with no Wiseravenshare surcharge.
/// </summary>
public class CopyrightRegistrationService
{
    private readonly ILogger<CopyrightRegistrationService> _logger;

    public CopyrightRegistrationService(ILogger<CopyrightRegistrationService> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Available Copyright Office forms for music creators, with 2024 pricing from Copyright.gov.
    /// </summary>
    public class CopyrightFormInfo
    {
        public string FormCode { get; set; }
        public string FormName { get; set; }
        public string WorkType { get; set; }
        public decimal PriceUsd { get; set; }
        public string Description { get; set; }
        public string FormUrl { get; set; }
        public string InstructionsUrl { get; set; }
        public List<string> AppliesTo { get; set; }
    }

    /// <summary>
    /// Returns all applicable Copyright Office forms for music, including descriptions and direct links.
    /// Prices are pass-through (0% markup) — user pays exact Copyright Office filing fee.
    /// </summary>
    public List<CopyrightFormInfo> GetMusicRegistrationForms()
    {
        return new List<CopyrightFormInfo>
        {
            new CopyrightFormInfo
            {
                FormCode = "SR",
                FormName = "Form SR: Sound Recording",
                WorkType = "Sound Recording",
                PriceUsd = 65m,
                Description = "Register a sound recording (the fixed audio of your music recording). Covers your specific recording and the performer's rights.",
                FormUrl = "https://www.copyright.gov/forms/",
                InstructionsUrl = "https://www.copyright.gov/circs/circ56.pdf",
                AppliesTo = new List<string>
                {
                    "Recorded music tracks",
                    "Podcast episodes",
                    "Audiobook narration",
                    "Remixes and arrangements",
                    "Live concert recordings"
                }
            },
            new CopyrightFormInfo
            {
                FormCode = "PA",
                FormName = "Form PA: Work of Performing Arts",
                WorkType = "Musical or Dramatic Work",
                PriceUsd = 65m,
                Description = "Register the underlying musical composition (notes, lyrics, structure). This covers your songwriting — the composition independent of any specific recording.",
                FormUrl = "https://www.copyright.gov/forms/",
                InstructionsUrl = "https://www.copyright.gov/circs/circ61.pdf",
                AppliesTo = new List<string>
                {
                    "Original song compositions",
                    "Musical scores",
                    "Orchestral arrangements",
                    "Instrumental compositions",
                    "Choreography set to music"
                }
            },
            new CopyrightFormInfo
            {
                FormCode = "TX",
                FormName = "Form TX: Literary Work",
                WorkType = "Textual Work (Lyrics/Script)",
                PriceUsd = 65m,
                Description = "Register lyrics, scripts, or spoken word texts separately from musical composition. Use when lyrics are the primary work or stand independently.",
                FormUrl = "https://www.copyright.gov/forms/",
                InstructionsUrl = "https://www.copyright.gov/circs/circ34.pdf",
                AppliesTo = new List<string>
                {
                    "Song lyrics (standalone)",
                    "Podcast scripts",
                    "Spoken word poetry",
                    "Voice-over scripts",
                    "Liner notes and documentation"
                }
            },
            new CopyrightFormInfo
            {
                FormCode = "COMBINED",
                FormName = "Combined SR + PA Bundle",
                WorkType = "Sound Recording + Composition",
                PriceUsd = 130m,
                Description = "Register both the sound recording (SR) and musical composition (PA) in one application for complete protection of your music. Most protective option for original artists.",
                FormUrl = "https://www.copyright.gov/forms/",
                InstructionsUrl = "https://www.copyright.gov/circs/",
                AppliesTo = new List<string>
                {
                    "Original recorded music",
                    "Complete protection of artist output",
                    "Protection against sampling",
                    "Full copyright bundle for new releases"
                }
            }
        };
    }

    /// <summary>
    /// Returns form recommended for the given work description.
    /// Analyzes content to suggest most appropriate Copyright Office form.
    /// </summary>
    public List<CopyrightFormInfo> RecommendFormsForWork(string workDescription)
    {
        var allForms = GetMusicRegistrationForms();
        var recommended = new List<CopyrightFormInfo>();

        var desc = workDescription.ToLower();

        // Sound Recording indicators
        if (desc.Contains("recording") || desc.Contains("recorded") || desc.Contains("track") ||
            desc.Contains("podcast") || desc.Contains("audio"))
        {
            recommended.Add(allForms.First(f => f.FormCode == "SR"));
        }

        // Composition indicators
        if (desc.Contains("composition") || desc.Contains("song") || desc.Contains("music") ||
            desc.Contains("written") || desc.Contains("original") || desc.Contains("arrangement"))
        {
            recommended.Add(allForms.First(f => f.FormCode == "PA"));
        }

        // Lyrics indicators
        if (desc.Contains("lyrics") || desc.Contains("words") || desc.Contains("script") ||
            desc.Contains("spoken word") || desc.Contains("poetry"))
        {
            recommended.Add(allForms.First(f => f.FormCode == "TX"));
        }

        // If original recorded music, recommend bundle
        if (recommended.Count >= 2 &&
            (desc.Contains("original") || desc.Contains("my recording") || desc.Contains("i recorded")))
        {
            return new List<CopyrightFormInfo>
            {
                allForms.First(f => f.FormCode == "COMBINED")
            };
        }

        // If nothing matched, default to SR (most common for Wiseravenshare podcast/music uploads)
        if (recommended.Count == 0)
        {
            recommended.Add(allForms.First(f => f.FormCode == "SR"));
        }

        return recommended;
    }

    /// <summary>
    /// Builds a guidance document explaining Copyright Office registration for the user.
    /// Returns HTML for display or printing.
    /// </summary>
    public string BuildCopyrightRegistrationGuide()
    {
        var forms = GetMusicRegistrationForms();
        var sb = new StringBuilder();

        sb.AppendLine(@"<!DOCTYPE html>");
        sb.AppendLine(@"<html lang=""en"">");
        sb.AppendLine(@"<head>");
        sb.AppendLine(@"    <meta charset=""UTF-8"">");
        sb.AppendLine(@"    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">");
        sb.AppendLine(@"    <title>Copyright Registration Guide - Wiseravenshare</title>");
        sb.AppendLine(@"    <style>");
        sb.AppendLine(@"        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; background-color: #f5f5f5; color: #333; }");
        sb.AppendLine(@"        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px; margin-bottom: 30px; }");
        sb.AppendLine(@"        .header h1 { margin: 0; font-size: 2em; }");
        sb.AppendLine(@"        .section { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #667eea; }");
        sb.AppendLine(@"        .pricing-table { width: 100%; border-collapse: collapse; margin: 15px 0; }");
        sb.AppendLine(@"        .pricing-table th, .pricing-table td { border: 1px solid #ddd; padding: 12px; text-align: left; }");
        sb.AppendLine(@"        .pricing-table th { background: #667eea; color: white; }");
        sb.AppendLine(@"        .form-code { font-weight: bold; color: #667eea; font-size: 1.2em; }");
        sb.AppendLine(@"        .price { font-weight: bold; color: #28a745; }");
        sb.AppendLine(@"        .note { background: #e7f3ff; border-left: 4px solid #2196F3; padding: 15px; margin: 15px 0; }");
        sb.AppendLine(@"    </style>");
        sb.AppendLine(@"</head>");
        sb.AppendLine(@"<body>");
        sb.AppendLine(@"    <div class=""header"">");
        sb.AppendLine(@"        <h1>🏛️ U.S. Copyright Office Registration</h1>");
        sb.AppendLine(@"        <p>Protect your music, compositions, and content with official copyright registration</p>");
        sb.AppendLine(@"    </div>");

        sb.AppendLine(@"    <div class=""section"">");
        sb.AppendLine(@"        <h2>Why Register?</h2>");
        sb.AppendLine(@"        <ul>");
        sb.AppendLine(@"            <li><strong>Public record:</strong> Official notice of your copyright claim</li>");
        sb.AppendLine(@"            <li><strong>Legal benefit:</strong> Required for infringement lawsuits in U.S. courts</li>");
        sb.AppendLine(@"            <li><strong>Damages:</strong> Eligibility for statutory damages (up to $150K) and attorney fees if infringement occurs</li>");
        sb.AppendLine(@"            <li><strong>Protection:</strong> Valid for your lifetime plus 70 years (for works created after 1978)</li>");
        sb.AppendLine(@"        </ul>");
        sb.AppendLine(@"    </div>");

        sb.AppendLine(@"    <div class=""section"">");
        sb.AppendLine(@"        <h2>Available Forms & Current Pricing</h2>");
        sb.AppendLine(@"        <table class=""pricing-table"">");
        sb.AppendLine(@"            <thead>");
        sb.AppendLine(@"                <tr>");
        sb.AppendLine(@"                    <th>Form</th>");
        sb.AppendLine(@"                    <th>Work Type</th>");
        sb.AppendLine(@"                    <th>Price</th>");
        sb.AppendLine(@"                    <th>Description</th>");
        sb.AppendLine(@"                </tr>");
        sb.AppendLine(@"            </thead>");
        sb.AppendLine(@"            <tbody>");

        foreach (var form in forms)
        {
            sb.AppendLine($@"                <tr>");
            sb.AppendLine($@"                    <td><span class=""form-code"">{form.FormCode}</span></td>");
            sb.AppendLine($@"                    <td>{form.WorkType}</td>");
            sb.AppendLine($@"                    <td><span class=""price"">${form.PriceUsd:F2}</span></td>");
            sb.AppendLine($@"                    <td>{form.Description}</td>");
            sb.AppendLine($@"                </tr>");
        }

        sb.AppendLine(@"            </tbody>");
        sb.AppendLine(@"        </table>");
        sb.AppendLine(@"        <div class=""note"">");
        sb.AppendLine(@"            <strong>Zero Markup Pricing:</strong> Wiseravenshare charges exactly the U.S. Copyright Office fee with no additional markup or commission.");
        sb.AppendLine(@"        </div>");
        sb.AppendLine(@"    </div>");

        sb.AppendLine(@"    <div class=""section"">");
        sb.AppendLine(@"        <h2>How to Register</h2>");
        sb.AppendLine(@"        <ol>");
        sb.AppendLine(@"            <li>Choose the appropriate form(s) based on your work type</li>");
        sb.AppendLine(@"            <li>Visit <a href=""https://www.copyright.gov/"" target=""_blank"">copyright.gov</a></li>");
        sb.AppendLine(@"            <li>Complete the registration form with your work details</li>");
        sb.AppendLine(@"            <li>Pay the Copyright Office filing fee (Wiseravenshare does not process these payments)</li>");
        sb.AppendLine(@"            <li>Submit your work sample(s) to the Copyright Office</li>");
        sb.AppendLine(@"            <li>Wait 4-6 weeks for registration certificate</li>");
        sb.AppendLine(@"        </ol>");
        sb.AppendLine(@"    </div>");

        sb.AppendLine(@"    <div class=""section"">");
        sb.AppendLine(@"        <h2>Form Details</h2>");

        foreach (var form in forms)
        {
            sb.AppendLine($@"        <div style=""background: #f9f9f9; border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px;"">");
            sb.AppendLine($@"            <div class=""form-code"">{form.FormCode}: {form.FormName}</div>");
            sb.AppendLine($@"            <p><strong>Price:</strong> <span class=""price"">${form.PriceUsd:F2}</span></p>");
            sb.AppendLine($@"            <p><strong>Description:</strong> {form.Description}</p>");
            sb.AppendLine($@"            <p><strong>Applies to:</strong></p>");
            sb.AppendLine(@"            <ul>");

            foreach (var applies in form.AppliesTo)
            {
                sb.AppendLine($@"                <li>{applies}</li>");
            }

            sb.AppendLine(@"            </ul>");
            sb.AppendLine($@"            <a href=""{form.InstructionsUrl}"" target=""_blank"" style=""color: #667eea; text-decoration: none; margin-right: 15px;"">📄 View Instructions</a>");
            sb.AppendLine($@"            <a href=""https://www.copyright.gov/forms/"" target=""_blank"" style=""color: #667eea; text-decoration: none;"">🏛️ Go to Copyright.gov</a>");
            sb.AppendLine(@"        </div>");
        }

        sb.AppendLine(@"    </div>");

        sb.AppendLine(@"    <div class=""section"">");
        sb.AppendLine(@"        <h2>Questions?</h2>");
        sb.AppendLine(@"        <ul>");
        sb.AppendLine(@"            <li><strong>Copyright Office FAQ:</strong> <a href=""https://www.copyright.gov/help/faq/"" target=""_blank"">copyright.gov/help/faq</a></li>");
        sb.AppendLine(@"            <li><strong>Phone:</strong> 1-202-707-3000</li>");
        sb.AppendLine(@"            <li><strong>Web Form:</strong> <a href=""https://www.copyright.gov/help/"" target=""_blank"">copyright.gov/help</a></li>");
        sb.AppendLine(@"        </ul>");
        sb.AppendLine(@"    </div>");

        sb.AppendLine(@"    <div class=""note"">");
        sb.AppendLine(@"        <strong>Important:</strong> This guide is informational only. Wiseravenshare does not process Copyright Office registrations. Registration must be completed directly through copyright.gov. Consult an attorney for specific copyright or IP questions.");
        sb.AppendLine(@"    </div>");

        sb.AppendLine(@"</body>");
        sb.AppendLine(@"</html>");

        return sb.ToString();
    }

    /// <summary>
    /// Extracts the total registration cost based on selected forms.
    /// Used for payment system integration.
    /// </summary>
    public decimal CalculateRegistrationCost(List<string> formCodes)
    {
        var allForms = GetMusicRegistrationForms();
        var selectedForms = allForms.Where(f => formCodes.Contains(f.FormCode)).ToList();
        return selectedForms.Sum(f => f.PriceUsd);
    }
}
