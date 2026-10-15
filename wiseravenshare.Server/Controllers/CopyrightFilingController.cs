// Wiseravenshare.Server/Controllers/CopyrightFilingController.cs
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Manages complete Copyright Office filing workflow.
/// Users submit forms, upload files, make payments, and Wiseravenshare handles Copyright Office submission.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class CopyrightFilingController : ControllerBase
{
    private readonly CopyrightFilingService _filingService;
    private readonly ILogger<CopyrightFilingController> _logger;

    public CopyrightFilingController(
        CopyrightFilingService filingService,
        ILogger<CopyrightFilingController> logger)
    {
        _filingService = filingService;
        _logger = logger;
    }

    /// <summary>
    /// GET /api/copyright-filing/forms
    /// Returns all available Copyright Office forms with pricing and requirements
    /// </summary>
    [HttpGet("forms")]
    [ProducesResponseType(200)]
    public IActionResult GetAvailableForms()
    {
        try
        {
            var forms = _filingService.GetAvailableForms();
            _logger.LogInformation($"Served {forms.Count} copyright filing forms");
            return Ok(forms);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving copyright filing forms");
            return StatusCode(500, new { message = "Error retrieving forms" });
        }
    }

    /// <summary>
    /// POST /api/copyright-filing/create
    /// Creates a new copyright filing in Draft status
    /// </summary>
    [HttpPost("create")]
    [ProducesResponseType(200)]
    public IActionResult CreateFiling([FromBody] CreateFilingRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.FormCode))
            return BadRequest(new { message = "FormCode is required" });

        try
        {
            // TODO: Extract userId from JWT token/claims
            var userId = User.FindFirst("sub")?.Value ?? "guest-user";
            
            var filing = _filingService.CreateFiling(userId, request.FormCode);
            _logger.LogInformation($"Created filing {filing.FilingId} for user {userId}");
            
            return Ok(new {
                filingId = filing.FilingId,
                formCode = filing.FormCode,
                status = filing.Status.ToString(),
                totalPrice = filing.TotalPrice,
                copyrightOfficeFee = filing.CopyrightOfficeFee,
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
            _logger.LogError(ex, "Error creating filing");
            return StatusCode(500, new { message = "Error creating filing" });
        }
    }

    /// <summary>
    /// PUT /api/copyright-filing/{filingId}/update
    /// Updates filing metadata (title, creator name, description)
    /// </summary>
    [HttpPut("{filingId}/update")]
    [ProducesResponseType(200)]
    public IActionResult UpdateFiling(string filingId, [FromBody] UpdateFilingRequest request)
    {
        if (string.IsNullOrWhiteSpace(filingId))
            return BadRequest(new { message = "FilingId is required" });

        try
        {
            // TODO: Load filing from database
            // var filing = await _filingRepository.GetById(filingId);
            // if (filing == null) return NotFound();
            
            // Update fields
            // filing.WorkTitle = request.WorkTitle;
            // filing.CreatorName = request.CreatorName;
            // filing.WorkDescription = request.WorkDescription;
            // await _filingRepository.Update(filing);

            _logger.LogInformation($"Updated filing {filingId}");
            return Ok(new { message = "Filing updated successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error updating filing {filingId}");
            return StatusCode(500, new { message = "Error updating filing" });
        }
    }

    /// <summary>
    /// POST /api/copyright-filing/{filingId}/upload
    /// Uploads a file (audio, sheet music, text) to a filing
    /// </summary>
    [HttpPost("{filingId}/upload")]
    [ProducesResponseType(200)]
    public async Task<IActionResult> UploadFilingDocument(string filingId, IFormFile file)
    {
        if (string.IsNullOrWhiteSpace(filingId))
            return BadRequest(new { message = "FilingId is required" });

        if (file == null || file.Length == 0)
            return BadRequest(new { message = "File is required" });

        // Max 50MB
        if (file.Length > 50 * 1024 * 1024)
            return BadRequest(new { message = "File exceeds 50MB limit" });

        try
        {
            // TODO: Upload file to GCS/S3
            // var storageKey = await _fileStorage.Upload(filingId, file);
            // var filing = await _filingRepository.GetById(filingId);
            // filing.UploadedFileKeys.Add(storageKey);
            // await _filingRepository.Update(filing);

            var mockStorageKey = $"filing/{filingId}/{file.FileName}";
            _logger.LogInformation($"Uploaded file {file.FileName} to filing {filingId}");
            
            return Ok(new {
                storageKey = mockStorageKey,
                fileName = file.FileName,
                fileSize = file.Length,
                message = "File uploaded successfully"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error uploading file to filing {filingId}");
            return StatusCode(500, new { message = "Error uploading file" });
        }
    }

    /// <summary>
    /// POST /api/copyright-filing/{filingId}/validate
    /// Validates filing is complete before payment
    /// </summary>
    [HttpPost("{filingId}/validate")]
    [ProducesResponseType(200)]
    public IActionResult ValidateFiling(string filingId)
    {
        if (string.IsNullOrWhiteSpace(filingId))
            return BadRequest(new { message = "FilingId is required" });

        try
        {
            // TODO: Load filing from database
            // var filing = await _filingRepository.GetById(filingId);
            // var (isValid, missingFields) = _filingService.ValidateFilingForPayment(filing);

            // Mock validation response
            var mockFiling = new
            {
                filingId = filingId,
                isValid = true,
                missingFields = new List<string>()
            };

            _logger.LogInformation($"Validated filing {filingId}");
            return Ok(mockFiling);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error validating filing {filingId}");
            return StatusCode(500, new { message = "Error validating filing" });
        }
    }

    /// <summary>
    /// POST /api/copyright-filing/{filingId}/checkout
    /// Initiates payment for filing (creates Stripe payment intent)
    /// </summary>
    [HttpPost("{filingId}/checkout")]
    [ProducesResponseType(200)]
    public IActionResult InitiateCheckout(string filingId)
    {
        if (string.IsNullOrWhiteSpace(filingId))
            return BadRequest(new { message = "FilingId is required" });

        try
        {
            // TODO: Load filing, create Stripe PaymentIntent
            // var filing = await _filingRepository.GetById(filingId);
            // var paymentIntent = await _stripeService.CreatePaymentIntent(
            //     amountCents: (long)(filing.TotalPrice * 100),
            //     description: $"Copyright {filing.FormCode} Filing - {filing.WorkTitle}",
            //     metadata: new { filingId = filing.FilingId }
            // );

            var mockPaymentIntent = new {
                clientSecret = "pi_test_secret_XXXX",
                paymentIntentId = "pi_test_1234",
                amount = 97.50m,
                currency = "usd",
                status = "requires_payment_method",
                filingId = filingId
            };

            _logger.LogInformation($"Initiated checkout for filing {filingId}");
            return Ok(mockPaymentIntent);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error initiating checkout for filing {filingId}");
            return StatusCode(500, new { message = "Error initiating payment" });
        }
    }

    /// <summary>
    /// POST /api/copyright-filing/{filingId}/confirm-payment
    /// Confirms payment and submits to Copyright Office
    /// </summary>
    [HttpPost("{filingId}/confirm-payment")]
    [ProducesResponseType(200)]
    public IActionResult ConfirmPaymentAndSubmit(string filingId, [FromBody] ConfirmPaymentRequest request)
    {
        if (string.IsNullOrWhiteSpace(filingId) || string.IsNullOrWhiteSpace(request?.PaymentIntentId))
            return BadRequest(new { message = "FilingId and PaymentIntentId are required" });

        try
        {
            // TODO: Verify payment with Stripe
            // var paymentIntent = await _stripeService.RetrievePaymentIntent(request.PaymentIntentId);
            // if (paymentIntent.Status != "succeeded") return BadRequest(...);
            
            // var filing = await _filingRepository.GetById(filingId);
            // _filingService.ConfirmPaymentAndSubmit(filing, request.PaymentIntentId);
            // await _filingRepository.Update(filing);
            
            // TODO: Queue Copyright Office submission job

            var mockResponse = new {
                filingId = filingId,
                status = "SubmittedToOffice",
                paymentIntentId = request.PaymentIntentId,
                submittedAt = DateTime.UtcNow,
                expectedRegistration = new {
                    earliestDate = DateTime.UtcNow.AddDays(28),
                    latestDate = DateTime.UtcNow.AddDays(42),
                    estimatedWeeks = "4-6 weeks"
                },
                message = "Filing submitted to Copyright Office. You will receive your registration number via email in 4-6 weeks."
            };

            _logger.LogInformation($"Confirmed payment and submitted filing {filingId} to Copyright Office");
            return Ok(mockResponse);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error confirming payment for filing {filingId}");
            return StatusCode(500, new { message = "Error confirming payment" });
        }
    }

    /// <summary>
    /// GET /api/copyright-filing/{filingId}/status
    /// Gets filing status and registration details
    /// </summary>
    [HttpGet("{filingId}/status")]
    [ProducesResponseType(200)]
    public IActionResult GetFilingStatus(string filingId)
    {
        if (string.IsNullOrWhiteSpace(filingId))
            return BadRequest(new { message = "FilingId is required" });

        try
        {
            // TODO: Load filing from database
            var mockFiling = new {
                filingId = filingId,
                formCode = "SR",
                status = "SubmittedToOffice",
                workTitle = "Sample Song",
                creatorName = "Artist Name",
                totalPrice = 97.50m,
                copyrightOfficeFee = 65.00m,
                wiseravenServiceFee = 32.50m,
                submittedAt = DateTime.UtcNow.AddDays(-1),
                registrationNumber = (string?)null,
                registeredAt = (DateTime?)null,
                expectedRegistration = new {
                    earliestDate = DateTime.UtcNow.AddDays(27),
                    latestDate = DateTime.UtcNow.AddDays(41)
                }
            };

            _logger.LogInformation($"Retrieved status for filing {filingId}");
            return Ok(mockFiling);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error retrieving filing {filingId}");
            return StatusCode(500, new { message = "Error retrieving filing" });
        }
    }

    /// <summary>
    /// GET /api/copyright-filing/user/filings
    /// Lists all filings for the authenticated user
    /// </summary>
    [HttpGet("user/filings")]
    [ProducesResponseType(200)]
    public IActionResult GetUserFilings()
    {
        try
        {
            // TODO: Extract userId from JWT
            var userId = User.FindFirst("sub")?.Value ?? "guest-user";
            
            // TODO: Load filings from database where UserId == userId
            var mockFilings = new List<dynamic>();
            
            _logger.LogInformation($"Retrieved filings for user {userId}");
            return Ok(mockFilings);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving user filings");
            return StatusCode(500, new { message = "Error retrieving filings" });
        }
    }
}

public class CreateFilingRequest
{
    public string FormCode { get; set; }
}

public class UpdateFilingRequest
{
    public string WorkTitle { get; set; }
    public string CreatorName { get; set; }
    public string WorkDescription { get; set; }
}

public class ConfirmPaymentRequest
{
    public string PaymentIntentId { get; set; }
}
