// Wiseravenshare.Server/Controllers/CopyrightRegistrationController.cs
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Provides access to U.S. Copyright Office music registration forms and informational guidance.
/// All pricing is pass-through (0% markup) — fees go directly to users with no Wiseravenshare surcharge.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class CopyrightRegistrationController : ControllerBase
{
    private readonly CopyrightRegistrationService _copyrightService;
    private readonly ILogger<CopyrightRegistrationController> _logger;

    public CopyrightRegistrationController(
        CopyrightRegistrationService copyrightService,
        ILogger<CopyrightRegistrationController> logger)
    {
        _copyrightService = copyrightService;
        _logger = logger;
    }

    /// <summary>
    /// GET /api/copyright-registration/forms
    /// Returns list of available Copyright Office forms for music registration with descriptions and 2024 pricing.
    /// </summary>
    [HttpGet("forms")]
    [ProducesResponseType(typeof(List<object>), 200)]
    public IActionResult GetAvailableForms()
    {
        try
        {
            var forms = _copyrightService.GetMusicRegistrationForms();
            _logger.LogInformation($"Served {forms.Count} copyright registration forms");
            return Ok(forms);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving copyright registration forms");
            return StatusCode(500, new { message = "Error retrieving forms", error = ex.Message });
        }
    }

    /// <summary>
    /// POST /api/copyright-registration/recommend
    /// Analyzes work description and recommends appropriate Copyright Office forms.
    /// </summary>
    [HttpPost("recommend")]
    [ProducesResponseType(typeof(List<object>), 200)]
    public IActionResult RecommendForms([FromBody] RecommendationRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.WorkDescription))
            return BadRequest(new { message = "WorkDescription is required" });

        try
        {
            var recommended = _copyrightService.RecommendFormsForWork(request.WorkDescription);
            _logger.LogInformation($"Recommended {recommended.Count} forms for work: {request.WorkDescription.Substring(0, Math.Min(100, request.WorkDescription.Length))}");
            return Ok(recommended);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error recommending forms");
            return StatusCode(500, new { message = "Error processing recommendation", error = ex.Message });
        }
    }

    /// <summary>
    /// POST /api/copyright-registration/calculate-cost
    /// Calculates total registration cost for selected forms with 50% Wiseravenshare markup.
    /// </summary>
    [HttpPost("calculate-cost")]
    [ProducesResponseType(typeof(CostResponse), 200)]
    public IActionResult CalculateCost([FromBody] CostCalculationRequest request)
    {
        if (request?.FormCodes == null || request.FormCodes.Count == 0)
            return BadRequest(new { message = "At least one form code is required" });

        try
        {
            var breakdown = _copyrightService.GetCostBreakdown(request.FormCodes);
            var response = new CostResponse
            {
                SelectedForms = request.FormCodes,
                CopyrightOfficeFees = breakdown.copyrightOfficeFees,
                WiseravenMarkup = breakdown.wiseravenMarkup,
                TotalCostUsd = breakdown.totalUserPrice,
                MarkupPercentage = 50,
                Note = "50% Wiseravenshare markup: Copyright Office fees plus service fee"
            };
            _logger.LogInformation($"Calculated cost ${breakdown.totalUserPrice:F2} (CO: ${breakdown.copyrightOfficeFees:F2} + Wiseravenshare: ${breakdown.wiseravenMarkup:F2}) for forms: {string.Join(", ", request.FormCodes)}");
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error calculating cost");
            return StatusCode(500, new { message = "Error calculating cost", error = ex.Message });
        }
    }

    /// <summary>
    /// GET /api/copyright-registration/guide
    /// Returns HTML guidance document for copyright registration.
    /// Can be displayed in browser or printed.
    /// </summary>
    [HttpGet("guide")]
    [Produces("text/html")]
    [ProducesResponseType(typeof(string), 200)]
    public IActionResult GetGuide()
    {
        try
        {
            var guide = _copyrightService.BuildCopyrightRegistrationGuide();
            _logger.LogInformation("Served copyright registration guide");
            return Content(guide, "text/html");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating guide");
            return StatusCode(500, new { message = "Error generating guide", error = ex.Message });
        }
    }

    /// <summary>
    /// GET /api/copyright-registration/forms/{formCode}
    /// Returns details for a specific Copyright Office form.
    /// </summary>
    [HttpGet("forms/{formCode}")]
    [ProducesResponseType(typeof(object), 200)]
    [ProducesResponseType(404)]
    public IActionResult GetFormByCode(string formCode)
    {
        try
        {
            var forms = _copyrightService.GetMusicRegistrationForms();
            var form = forms.FirstOrDefault(f => f.FormCode == formCode.ToUpper());
            
            if (form == null)
                return NotFound(new { message = $"Form {formCode} not found" });

            return Ok(form);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error retrieving form {formCode}");
            return StatusCode(500, new { message = "Error retrieving form", error = ex.Message });
        }
    }
}

public class RecommendationRequest
{
    public string WorkDescription { get; set; }
}

public class CostCalculationRequest
{
    public List<string> FormCodes { get; set; }
}

public class CostResponse
{
    public List<string> SelectedForms { get; set; }
    public decimal CopyrightOfficeFees { get; set; }
    public decimal WiseravenMarkup { get; set; }
    public decimal TotalCostUsd { get; set; }
    public int MarkupPercentage { get; set; }
    public string Note { get; set; }
}
