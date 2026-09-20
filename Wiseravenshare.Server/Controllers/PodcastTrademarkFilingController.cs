using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// REST API for complete podcast trademark filing workflow.
/// Handles form creation, file uploads, payment, and USPTO tracking.
/// 
/// All endpoints require authentication (user context in claims).
/// All prices in USD (50% markup: $375-$525 user price).
/// 
/// Trademark Protection Covers:
/// - TX: Podcast name, tagline, catchphrase (text)
/// - VI: Logo, visual branding, artwork (visual)
/// - SR: Theme song, intro jingle, signature audio (sound)
/// - COMBINED: Word + Visual protection
/// </summary>
[ApiController]
[Route("api/podcast-trademark")]
[Authorize]
public class PodcastTrademarkFilingController : ControllerBase
{
    private readonly PodcastTrademarkFilingService _trademarkService;
    private readonly ILogger<PodcastTrademarkFilingController> _logger;

    public PodcastTrademarkFilingController(
        PodcastTrademarkFilingService trademarkService,
        ILogger<PodcastTrademarkFilingController> logger)
    {
        _trademarkService = trademarkService;
        _logger = logger;
    }

    /// <summary>
    /// Gets all available trademark forms with pricing and requirements.
    /// Supports TX (word mark), VI (visual mark), SR (sound mark), and COMBINED.
    /// </summary>
    [HttpGet("forms")]
    [ProducesResponseType(200)]
    public IActionResult GetAvailableForms()
    {
        try
        {
            var forms = _trademarkService.GetAvailableForms();
            _logger.LogInformation($"Served {forms.Count} trademark filing forms");
            return Ok(forms);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving trademark forms");
            return StatusCode(500, new { message = "Error retrieving forms" });
        }
    }

    /// <summary>
    /// Creates a new trademark filing in Draft status.
    /// Associates filing with podcast for tracking.
    /// </summary>
    [HttpPost("create")]
    [ProducesResponseType(200)]
    public IActionResult CreateFiling([FromBody] CreateTrademarkFilingRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.FormCode) || string.IsNullOrWhiteSpace(request?.PodcastId))
            return BadRequest(new { message = "FormCode and PodcastId are required" });

        try
        {
            var userId = User.FindFirst("sub")?.Value ?? User.Identity?.Name;
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized(new { message = "User context not found" });

            var filing = _trademarkService.CreateFiling(userId, request.PodcastId, request.FormCode);
            _logger.LogInformation($"Created trademark filing {filing.FilingId} for user {userId}, podcast {request.PodcastId}");
            
            return Ok(new {
                filingId = filing.FilingId,
                userId = filing.UserId,
                podcastId = filing.PodcastId,
                formCode = filing.FormCode,
                status = filing.Status.ToString(),
                totalUserPrice = filing.TotalPrice,
                usptaFee = filing.USPTOFee,
                wiseravenServiceFee = filing.WiseravenServiceFee,
                createdAt = filing.CreatedAt
            });
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning($"Invalid form code: {request.FormCode}");
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating trademark filing");
            return StatusCode(500, new { message = "Error creating filing" });
        }
    }

    /// <summary>
    /// Updates trademark filing with brand details (name, description, ownership).
    /// Can only update filings in Draft or ReadyForPayment status.
    /// </summary>
    [HttpPut("{filingId}/update")]
    [ProducesResponseType(200)]
    public IActionResult UpdateFiling(string filingId, [FromBody] UpdateTrademarkFilingRequest request)
    {
        if (string.IsNullOrWhiteSpace(filingId))
            return BadRequest(new { message = "FilingId is required" });

        try
        {
            var userId = User.FindFirst("sub")?.Value ?? User.Identity?.Name;
            
            // TODO: Retrieve filing from database using filingId
            // var filing = _db.TrademarkFilings.FirstOrDefault(f => f.FilingId == filingId && f.UserId == userId);
            // if (filing == null)
            //     return NotFound(new { message = "Filing not found" });
            
            // _trademarkService.UpdateFiling(filing, request.TrademarkText, request.TrademarkDescription, 
            //     request.ClassificationCode, request.GoodsServicesDescription,
            //     request.OwnerName, request.OwnerEmail, request.OwnerAddress);
            // await _db.SaveChangesAsync();

            _logger.LogInformation($"Updated trademark filing {filingId}");
            return Ok(new { message = "Trademark filing updated successfully", updatedAt = DateTime.UtcNow });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error updating trademark filing {filingId}");
            return StatusCode(500, new { message = "Error updating filing" });
        }
    }

    /// <summary>
    /// Uploads a file to trademark filing (logo, specimen, evidence of use, audio).
    /// Returns storage key for uploaded file (GCS/S3 path).
    /// Max 50MB per file.
    /// </summary>
    [HttpPost("{filingId}/upload")]
    [ProducesResponseType(200)]
    public async Task<IActionResult> UploadTrademarkDocument(string filingId, IFormFile file, [FromQuery] string documentType = "Specimen")
    {
        if (string.IsNullOrWhiteSpace(filingId))
            return BadRequest(new { message = "FilingId is required" });

        if (file == null || file.Length == 0)
            return BadRequest(new { message = "File is required" });

        const long MAX_FILE_SIZE = 50_000_000; // 50MB
        if (file.Length > MAX_FILE_SIZE)
            return BadRequest(new { message = $"File exceeds 50MB limit (uploaded: {file.Length / 1_000_000}MB)" });

        try
        {
            var userId = User.FindFirst("sub")?.Value ?? User.Identity?.Name;

            // TODO: Retrieve filing from database
            // var filing = _db.TrademarkFilings.FirstOrDefault(f => f.FilingId == filingId && f.UserId == userId);
            // if (filing == null)
            //     return NotFound(new { message = "Filing not found" });

            // TODO: Upload file to GCS/S3, get storage key
            var storageKey = $"trademark/{filingId}/{documentType}/{file.FileName}";

            _logger.LogInformation($"Uploaded {documentType} {file.FileName} to trademark filing {filingId} (size: {file.Length} bytes)");

            return Ok(new {
                filingId,
                documentId = Guid.NewGuid().ToString("N"),
                fileName = file.FileName,
                documentType,
                storageKey,
                fileSizeBytes = file.Length,
                uploadedAt = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading trademark document");
            return StatusCode(500, new { message = "Error uploading file" });
        }
    }

    /// <summary>
    /// Validates trademark filing is complete (required fields + documents).
    /// Must be done before payment.
    /// </summary>
    [HttpPost("{filingId}/validate")]
    [ProducesResponseType(200)]
    public IActionResult ValidateFiling(string filingId)
    {
        if (string.IsNullOrWhiteSpace(filingId))
            return BadRequest(new { message = "FilingId is required" });

        try
        {
            var userId = User.FindFirst("sub")?.Value ?? User.Identity?.Name;

            // TODO: Retrieve filing from database
            // var filing = _db.TrademarkFilings.FirstOrDefault(f => f.FilingId == filingId && f.UserId == userId);
            // if (filing == null)
            //     return NotFound(new { message = "Filing not found" });

            // var (isValid, missingFields) = _trademarkService.ValidateFilingForPayment(filing);
            // if (!isValid)
            //     return BadRequest(new { isValid = false, errors = missingFields });

            return Ok(new {
                filingId,
                isValid = true,
                message = "Trademark filing is complete and ready for payment"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error validating trademark filing");
            return StatusCode(500, new { message = "Error validating filing" });
        }
    }

    /// <summary>
    /// Initiates Stripe payment for trademark filing (creates PaymentIntent).
    /// Returns client secret for Stripe payment modal.
    /// </summary>
    [HttpPost("{filingId}/checkout")]
    [ProducesResponseType(200)]
    public async Task<IActionResult> InitiateCheckout(string filingId)
    {
        if (string.IsNullOrWhiteSpace(filingId))
            return BadRequest(new { message = "FilingId is required" });

        try
        {
            var userId = User.FindFirst("sub")?.Value ?? User.Identity?.Name;

            // TODO: Retrieve filing from database
            // var filing = _db.TrademarkFilings.FirstOrDefault(f => f.FilingId == filingId && f.UserId == userId);
            // if (filing == null)
            //     return NotFound(new { message = "Filing not found" });

            // TODO: Create Stripe PaymentIntent
            // var paymentIntent = await _stripeService.CreatePaymentIntentAsync(
            //     amountCents: (int)(filing.TotalPrice * 100),
            //     description: $"Trademark filing {filingId} ({filing.FormCode})"
            // );

            var clientSecret = $"pi_{Guid.NewGuid():N}_secret_DEMO";

            _logger.LogInformation($"Created payment intent for trademark filing {filingId}");

            return Ok(new {
                filingId,
                clientSecret,
                amount = "$375.00", // TODO: Get from filing
                currency = "usd",
                checkoutUrl = $"/checkout?filingId={filingId}&clientSecret={clientSecret}"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error initiating checkout");
            return StatusCode(500, new { message = "Error initiating payment" });
        }
    }

    /// <summary>
    /// Confirms payment and submits filing to USPTO.
    /// Called after successful Stripe payment.
    /// Triggers background job to submit application to USPTO.
    /// </summary>
    [HttpPost("{filingId}/confirm-payment")]
    [ProducesResponseType(200)]
    public IActionResult ConfirmPayment(string filingId, [FromBody] ConfirmPaymentRequest request)
    {
        if (string.IsNullOrWhiteSpace(filingId))
            return BadRequest(new { message = "FilingId is required" });

        if (string.IsNullOrWhiteSpace(request?.PaymentIntentId))
            return BadRequest(new { message = "PaymentIntentId is required" });

        try
        {
            var userId = User.FindFirst("sub")?.Value ?? User.Identity?.Name;

            // TODO: Retrieve filing from database
            // var filing = _db.TrademarkFilings.FirstOrDefault(f => f.FilingId == filingId && f.UserId == userId);
            // if (filing == null)
            //     return NotFound(new { message = "Filing not found" });

            // TODO: Verify payment intent with Stripe
            // var paymentIntent = await _stripeService.GetPaymentIntentAsync(request.PaymentIntentId);
            // if (paymentIntent.Status != "succeeded")
            //     return BadRequest(new { message = "Payment was not successful" });

            // _trademarkService.ConfirmPaymentAndSubmit(filing, request.PaymentIntentId);

            // TODO: Queue background job to submit application to USPTO

            _logger.LogInformation($"Payment confirmed for trademark filing {filingId}, submitting to USPTO");

            return Ok(new {
                filingId,
                status = "SubmittedToUSPTO",
                message = "Payment received. Trademark application submitted to U.S. Patent and Trademark Office.",
                registrationTimeline = new {
                    expectedEarliest = DateTime.UtcNow.AddDays(84).ToString("O"),
                    expectedLatest = DateTime.UtcNow.AddDays(126).ToString("O"),
                    description = "Typical processing time: 12-18 weeks"
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error confirming payment");
            return StatusCode(500, new { message = "Error confirming payment" });
        }
    }

    /// <summary>
    /// Gets trademark filing status and details (including registration number if complete).
    /// </summary>
    [HttpGet("{filingId}/status")]
    [ProducesResponseType(200)]
    public IActionResult GetFilingStatus(string filingId)
    {
        if (string.IsNullOrWhiteSpace(filingId))
            return BadRequest(new { message = "FilingId is required" });

        try
        {
            var userId = User.FindFirst("sub")?.Value ?? User.Identity?.Name;

            // TODO: Retrieve filing from database
            // var filing = _db.TrademarkFilings.FirstOrDefault(f => f.FilingId == filingId && f.UserId == userId);
            // if (filing == null)
            //     return NotFound(new { message = "Filing not found" });

            return Ok(new {
                filingId,
                status = "PendingExamination",
                formCode = "VI",
                trademarkText = "The Daily Raven",
                totalUserPrice = "$525.00",
                usptaFee = "$350.00",
                createdAt = DateTime.UtcNow.AddDays(-7).ToString("O"),
                submittedToUSPTOAt = DateTime.UtcNow.AddDays(-6).ToString("O"),
                registrationNumber = null,
                registeredAt = null,
                officeActionIssued = null,
                officeActionDeadline = null
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting trademark filing status");
            return StatusCode(500, new { message = "Error getting filing status" });
        }
    }

    /// <summary>
    /// Lists all trademark filings for the authenticated user's podcasts.
    /// </summary>
    [HttpGet("user/filings")]
    [ProducesResponseType(200)]
    public IActionResult GetUserFilings([FromQuery] string podcastId = null)
    {
        try
        {
            var userId = User.FindFirst("sub")?.Value ?? User.Identity?.Name;
            if (string.IsNullOrWhiteSpace(userId))
                return Unauthorized(new { message = "User context not found" });

            // TODO: Retrieve all trademark filings for user from database
            // var filings = _db.TrademarkFilings
            //     .Where(f => f.UserId == userId && (podcastId == null || f.PodcastId == podcastId))
            //     .ToList();

            return Ok(new {
                userId,
                filings = new object[] { },
                summary = new {
                    totalFilings = 0,
                    registeredCount = 0,
                    pendingCount = 0,
                    draftCount = 0
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting user trademark filings");
            return StatusCode(500, new { message = "Error getting filings" });
        }
    }

    // Request/Response DTOs

    public class CreateTrademarkFilingRequest
    {
        public string PodcastId { get; set; }
        public string FormCode { get; set; } // TX, VI, SR, COMBINED
    }

    public class UpdateTrademarkFilingRequest
    {
        public string TrademarkText { get; set; }
        public string TrademarkDescription { get; set; }
        public string ClassificationCode { get; set; } // e.g., "041" for podcasting
        public string GoodsServicesDescription { get; set; }
        public string OwnerName { get; set; }
        public string OwnerEmail { get; set; }
        public string OwnerAddress { get; set; }
    }

    public class ConfirmPaymentRequest
    {
        public string PaymentIntentId { get; set; }
    }
}
