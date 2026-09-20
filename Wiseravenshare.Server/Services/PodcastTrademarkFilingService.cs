using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Extensions.Logging;

namespace Wiseravenshare.Server.Services;

/// <summary>
/// Podcast trademark registration filing service via USPTO.
/// Protects podcast names, logos, catchphrases, and brand identifiers.
/// 
/// Business Model (50% Markup):
/// - USPTO base fee: $250-$350 (depending on filing type)
/// - User pays: Base × 1.5 = $375-$525
/// - Wiseravenshare revenue: 50% of user price ($125-$175 per filing)
/// 
/// Trademark Protection Types:
/// - TX (Word Mark): Podcast name, tagline, catchphrase as text
/// - VI (Visual Mark): Logo, album artwork, visual branding
/// - SR (Sound Mark): Signature podcast audio, theme song (rare, premium)
/// </summary>
public class PodcastTrademarkFilingService
{
    private readonly ILogger<PodcastTrademarkFilingService> _logger;

    public PodcastTrademarkFilingService(ILogger<PodcastTrademarkFilingService> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Trademark registration filing status lifecycle
    /// </summary>
    public enum TrademarkStatus
    {
        Draft = 1,                  // User building application
        ReadyForPayment = 2,        // All required fields complete
        SubmittedToUSPTO = 3,       // Payment confirmed, submitted to USPTO
        PendingExamination = 4,     // Awaiting USPTO examiner review (1-3 months)
        ExaminerResponseRequired = 5,  // Office action issued, user must respond
        RegistrationGranted = 6,    // Registration certificate received
        Abandoned = 7,              // Application abandoned (didn't respond to office action)
        Refused = 8                 // Application refused by examiner
    }

    /// <summary>
    /// Trademark application types supported
    /// </summary>
    public class TrademarkForm
    {
        public string FormCode { get; set; }
        public string FormName { get; set; }
        public string ProtectionType { get; set; }
        /// <summary>
        /// USPTO filing fee (base cost)
        /// </summary>
        public decimal USPTOFeeUsd { get; set; }
        /// <summary>
        /// Wiseravenshare service fee (50% of USDTO fee)
        /// </summary>
        public decimal WiseravenServiceFeeUsd { get; set; }
        /// <summary>
        /// Total user pays (USDTO + Wiseravenshare)
        /// </summary>
        public decimal TotalUserPriceUsd { get; set; }
        public string Description { get; set; }
        public List<string> RequiredDocuments { get; set; }
        public List<string> AppliesTo { get; set; }
        public int ProcessingWeeks { get; set; } // Typical processing time
    }

    /// <summary>
    /// User trademark filing application
    /// </summary>
    public class TrademarkFiling
    {
        public string FilingId { get; set; }
        public string UserId { get; set; }
        public string PodcastId { get; set; } // Link to podcast
        public string FormCode { get; set; } // TX, VI, SR
        public TrademarkStatus Status { get; set; }
        
        // Trademark details
        public string TrademarkText { get; set; } // For TX: exact text to protect
        public string TrademarkDescription { get; set; } // Description of mark
        public string ClassificationCode { get; set; } // USPTO class (e.g., 041 for podcasting)
        public string GoodsServicesDescription { get; set; } // What services covered
        
        // Ownership
        public string OwnerName { get; set; }
        public string OwnerEmail { get; set; }
        public string OwnerAddress { get; set; }
        
        // Files
        public List<TrademarkDocument> UploadedDocuments { get; set; } = new();
        
        // Pricing
        public decimal USPTOFee { get; set; }
        public decimal WiseravenServiceFee { get; set; }
        public decimal TotalPrice { get; set; }
        
        // Payment & USPTO tracking
        public string PaymentIntentId { get; set; }
        public string USPTOApplicationNumber { get; set; }
        public string RegistrationNumber { get; set; }
        public string CurrentExaminerOfficeAction { get; set; } // If issued
        public DateTime? ExaminerResponseDeadline { get; set; }
        
        // Timelines
        public DateTime CreatedAt { get; set; }
        public DateTime? SubmittedToUSPTOAt { get; set; }
        public DateTime? RegistrationGrantedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    /// <summary>
    /// Uploaded trademark document (logo, specimen, evidence of use)
    /// </summary>
    public class TrademarkDocument
    {
        public string DocumentId { get; set; }
        public string FilingId { get; set; }
        public string FileName { get; set; }
        public string StorageKey { get; set; } // GCS/S3 path
        public long FileSizeBytes { get; set; }
        public string MimeType { get; set; }
        public string DocumentType { get; set; } // Logo, Specimen, EvidenceOfUse, etc.
        public DateTime UploadedAt { get; set; }
    }

    /// <summary>
    /// Returns all available trademark forms with pricing
    /// </summary>
    public List<TrademarkForm> GetAvailableForms()
    {
        const decimal markupMultiplier = 1.5m; // 50% markup
        
        return new List<TrademarkForm>
        {
            new TrademarkForm
            {
                FormCode = "TX",
                FormName = "Form TX: Word/Text Mark",
                ProtectionType = "Podcast Name, Tagline, or Catchphrase",
                USPTOFeeUsd = 250m,
                WiseravenServiceFeeUsd = 250m * 0.5m,
                TotalUserPriceUsd = 250m * markupMultiplier,
                Description = "Protect the exact text of your podcast name, tagline, or signature catchphrase. Covers use in podcast marketing, social media, branding. Does NOT protect visual design—use Form VI for logos.",
                RequiredDocuments = new List<string>
                {
                    "Exact text mark (e.g., 'The Daily Raven')",
                    "Podcast title and description",
                    "Goods/services description (podcasting, entertainment)",
                    "Specimen of use (screenshot from podcast app, website, social media showing the mark)",
                    "Owner name, address, email"
                },
                AppliesTo = new List<string>
                {
                    "Podcast show names",
                    "Signature catchphrases",
                    "Host taglines",
                    "Podcast series titles",
                    "Brand slogans"
                },
                ProcessingWeeks = 12  // Typical 3 months
            },
            new TrademarkForm
            {
                FormCode = "VI",
                FormName = "Form VI: Visual/Logo Mark",
                ProtectionType = "Podcast Logo, Artwork, or Visual Branding",
                USPTOFeeUsd = 350m,
                WiseravenServiceFeeUsd = 350m * 0.5m,
                TotalUserPriceUsd = 350m * markupMultiplier,
                Description = "Protect your podcast logo, album artwork, visual design, or any distinctive visual branding. Covers the specific visual elements and colors used. Does NOT protect the text alone—use Form TX for podcast name.",
                RequiredDocuments = new List<string>
                {
                    "High-quality logo image (JPG/PNG, color version)",
                    "Description of colors (if color is important)",
                    "Podcast name and description",
                    "Goods/services description (podcasting, entertainment)",
                    "Specimen of use (screenshot of logo on podcast app, website, social media)",
                    "Owner name, address, email"
                },
                AppliesTo = new List<string>
                {
                    "Podcast logos",
                    "Album artwork",
                    "Visual branding elements",
                    "Episode cover art",
                    "Channel headers and thumbnails"
                },
                ProcessingWeeks = 14  // Typically 3-4 months
            },
            new TrademarkForm
            {
                FormCode = "SR",
                FormName = "Form SR: Sound Mark (Premium)",
                ProtectionType = "Podcast Theme Song or Signature Audio",
                USPTOFeeUsd = 400m,
                WiseravenServiceFeeUsd = 400m * 0.5m,
                TotalUserPriceUsd = 400m * markupMultiplier,
                Description = "Protect a distinctive audio signature—podcast theme song, intro jingle, or signature sound. Rare and requires strong evidence that the sound is recognized as identifying the podcast. Not recommended for generic audio. Includes 5-minute audio file.",
                RequiredDocuments = new List<string>
                {
                    "Audio file (MP3, WAV, max 5 minutes)",
                    "Waveform visual representation (provided by USPTO)",
                    "Detailed description of audio (e.g., 'Opening theme: 15-second orchestral composition with distinctive rising horn melody')",
                    "Podcast name and description",
                    "Goods/services description (podcasting, entertainment)",
                    "Specimen showing how sound is used (transcribed YouTube link, podcast platform screenshot showing audio)",
                    "Evidence that public recognizes sound (listener comments, reviews mentioning theme)",
                    "Owner name, address, email"
                },
                AppliesTo = new List<string>
                {
                    "Distinctive podcast theme songs",
                    "Iconic intro jingles",
                    "Signature sound effects",
                    "Host catchphrase audio versions"
                },
                ProcessingWeeks = 18  // Typically 4-5 months (more complex)
            },
            new TrademarkForm
            {
                FormCode = "COMBINED",
                FormName = "Combined TX + VI: Word + Visual Bundle",
                ProtectionType = "Complete Podcast Brand Protection",
                USPTOFeeUsd = 500m,
                WiseravenServiceFeeUsd = 500m * 0.5m,
                TotalUserPriceUsd = 500m * markupMultiplier,
                Description = "Protect both the podcast name AND the visual logo in a single combined application. Most comprehensive protection. Allows you to enforce rights against both text-only copies and visual-only copies of your branding.",
                RequiredDocuments = new List<string>
                {
                    "Podcast name (exact text mark)",
                    "Logo image (high-quality JPG/PNG)",
                    "Description of colors (if color is important)",
                    "Podcast description and category",
                    "Goods/services description",
                    "Two specimens of use (one showing text, one showing visual)",
                    "Owner name, address, email"
                },
                AppliesTo = new List<string>
                {
                    "Complete podcast brand packages",
                    "Shows with distinctive name + logo",
                    "Maximum brand protection",
                    "Enforcement against imitators using either element"
                },
                ProcessingWeeks = 14  // Combined, takes same time as VI
            }
        };
    }

    /// <summary>
    /// Gets single form by code
    /// </summary>
    public TrademarkForm GetFormByCode(string formCode)
    {
        return GetAvailableForms().FirstOrDefault(f => f.FormCode == formCode);
    }

    /// <summary>
    /// Creates a new trademark filing in Draft status
    /// </summary>
    public TrademarkFiling CreateFiling(string userId, string podcastId, string formCode)
    {
        var forms = GetAvailableForms();
        var selectedForm = forms.FirstOrDefault(f => f.FormCode == formCode);
        
        if (selectedForm == null)
            throw new ArgumentException($"Form code '{formCode}' not found");

        var filing = new TrademarkFiling
        {
            FilingId = $"tm-{Guid.NewGuid():N}",
            UserId = userId,
            PodcastId = podcastId,
            FormCode = formCode,
            Status = TrademarkStatus.Draft,
            USPTOFee = selectedForm.USPTOFeeUsd,
            WiseravenServiceFee = selectedForm.WiseravenServiceFeeUsd,
            TotalPrice = selectedForm.TotalUserPriceUsd,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _logger.LogInformation($"Created trademark filing {filing.FilingId} for user {userId}, podcast {podcastId}, form {formCode}, price ${filing.TotalPrice:F2}");
        return filing;
    }

    /// <summary>
    /// Updates filing with trademark details and ownership info
    /// </summary>
    public void UpdateFiling(TrademarkFiling filing, string trademarkText, string trademarkDescription, 
        string classificationCode, string goodsServicesDescription, string ownerName, string ownerEmail, string ownerAddress)
    {
        filing.TrademarkText = trademarkText;
        filing.TrademarkDescription = trademarkDescription;
        filing.ClassificationCode = classificationCode ?? "041"; // 041 = Podcasting/Entertainment
        filing.GoodsServicesDescription = goodsServicesDescription;
        filing.OwnerName = ownerName;
        filing.OwnerEmail = ownerEmail;
        filing.OwnerAddress = ownerAddress;
        filing.UpdatedAt = DateTime.UtcNow;

        _logger.LogInformation($"Updated trademark filing {filing.FilingId}");
    }

    /// <summary>
    /// Adds a document to filing (logo, specimen, evidence)
    /// </summary>
    public TrademarkDocument AddDocumentReference(TrademarkFiling filing, string fileName, long fileSizeBytes, 
        string mimeType, string documentType)
    {
        const long MAX_FILE_SIZE = 50_000_000; // 50MB
        if (fileSizeBytes > MAX_FILE_SIZE)
            throw new InvalidOperationException($"File exceeds 50MB limit: {fileName}");

        var doc = new TrademarkDocument
        {
            DocumentId = Guid.NewGuid().ToString("N"),
            FilingId = filing.FilingId,
            FileName = fileName,
            StorageKey = $"trademark/{filing.FilingId}/{documentType}/{fileName}",
            FileSizeBytes = fileSizeBytes,
            MimeType = mimeType,
            DocumentType = documentType, // Logo, Specimen, EvidenceOfUse, etc.
            UploadedAt = DateTime.UtcNow
        };

        filing.UploadedDocuments.Add(doc);
        filing.UpdatedAt = DateTime.UtcNow;

        _logger.LogInformation($"Added {documentType} document {fileName} to trademark filing {filing.FilingId}");
        return doc;
    }

    /// <summary>
    /// Validates filing is complete before payment
    /// </summary>
    public (bool isValid, List<string> missingFields) ValidateFilingForPayment(TrademarkFiling filing)
    {
        var missingFields = new List<string>();

        if (string.IsNullOrWhiteSpace(filing.TrademarkText))
            missingFields.Add("Trademark text/name is required");

        if (string.IsNullOrWhiteSpace(filing.OwnerName))
            missingFields.Add("Owner name is required");

        if (string.IsNullOrWhiteSpace(filing.GoodsServicesDescription))
            missingFields.Add("Goods/services description is required");

        if (filing.UploadedDocuments.Count == 0)
            missingFields.Add("At least one document (logo, specimen, or evidence) must be uploaded");

        // Form-specific requirements
        if (filing.FormCode == "VI" && !filing.UploadedDocuments.Any(d => d.DocumentType == "Logo"))
            missingFields.Add("Logo image is required for Visual Mark");

        if (filing.FormCode == "SR" && !filing.UploadedDocuments.Any(d => d.DocumentType == "Audio"))
            missingFields.Add("Audio file is required for Sound Mark");

        return (missingFields.Count == 0, missingFields);
    }

    /// <summary>
    /// Marks filing ready for payment
    /// </summary>
    public void MarkReadyForPayment(TrademarkFiling filing)
    {
        var (isValid, missingFields) = ValidateFilingForPayment(filing);
        
        if (!isValid)
            throw new InvalidOperationException($"Cannot mark filing ready: {string.Join(", ", missingFields)}");

        filing.Status = TrademarkStatus.ReadyForPayment;
        filing.UpdatedAt = DateTime.UtcNow;
        
        _logger.LogInformation($"Trademark filing {filing.FilingId} marked ready for payment. Total: ${filing.TotalPrice:F2}");
    }

    /// <summary>
    /// Confirms payment and submits to USPTO
    /// </summary>
    public void ConfirmPaymentAndSubmit(TrademarkFiling filing, string paymentIntentId)
    {
        if (filing.Status != TrademarkStatus.ReadyForPayment)
            throw new InvalidOperationException($"Filing must be in ReadyForPayment status, currently {filing.Status}");

        filing.PaymentIntentId = paymentIntentId;
        filing.Status = TrademarkStatus.SubmittedToUSPTO;
        filing.SubmittedToUSPTOAt = DateTime.UtcNow;
        filing.UpdatedAt = DateTime.UtcNow;

        _logger.LogInformation($"Trademark filing {filing.FilingId} payment confirmed (intent: {paymentIntentId}). Submitted to USPTO.");
        
        // TODO: Queue background job to submit application to USPTO
    }

    /// <summary>
    /// Gets expected registration timeline
    /// </summary>
    public (DateTime expectedEarliestDate, DateTime expectedLatestDate) GetExpectedRegistrationTimeline(
        DateTime submittedDate, string formCode)
    {
        var form = GetFormByCode(formCode);
        var weeksLow = form.ProcessingWeeks;
        var weeksHigh = form.ProcessingWeeks + 4; // Add 4 weeks for variance

        var earliest = submittedDate.AddDays(weeksLow * 7);
        var latest = submittedDate.AddDays(weeksHigh * 7);

        return (earliest, latest);
    }

    /// <summary>
    /// Records registration when USPTO issues certificate
    /// </summary>
    public void RecordRegistrationComplete(TrademarkFiling filing, string registrationNumber)
    {
        if (string.IsNullOrWhiteSpace(registrationNumber))
            throw new ArgumentException("Registration number is required");

        filing.Status = TrademarkStatus.RegistrationGranted;
        filing.RegistrationNumber = registrationNumber;
        filing.RegistrationGrantedAt = DateTime.UtcNow;
        filing.UpdatedAt = DateTime.UtcNow;

        _logger.LogInformation($"Trademark filing {filing.FilingId} registered with USPTO. Registration #: {registrationNumber}");
    }

    /// <summary>
    /// Issues office action (examiner response required)
    /// </summary>
    public void IssueOfficeAction(TrademarkFiling filing, string officeActionDescription, DateTime responseDeadline)
    {
        filing.Status = TrademarkStatus.ExaminerResponseRequired;
        filing.CurrentExaminerOfficeAction = officeActionDescription;
        filing.ExaminerResponseDeadline = responseDeadline;
        filing.UpdatedAt = DateTime.UtcNow;

        _logger.LogInformation($"Trademark filing {filing.FilingId} office action issued. Response deadline: {responseDeadline:O}");
    }

    /// <summary>
    /// Calculates revenue breakdown
    /// </summary>
    public (decimal usptaFee, decimal wiseravenRevenue) GetRevenueBreakdown(decimal userPrice)
    {
        // User price = USDTO fee + 50% markup
        var usptaFee = userPrice / 1.5m;
        var wiseravenRev = userPrice - usptaFee;
        return (usptaFee, wiseravenRev);
    }

    /// <summary>
    /// Revenue reporting for admin dashboard
    /// </summary>
    public class RevenueBreakdown
    {
        public decimal TotalFilingsCreated { get; set; }
        public decimal TotalUsersCharged { get; set; }
        public decimal TotalUSPTOFeesCollected { get; set; }
        public decimal TotalWiseravenRevenue { get; set; }
        public Dictionary<string, decimal> RevenueByFormCode { get; set; } = new();
        public Dictionary<string, int> FilingCountByStatus { get; set; } = new();
    }

    public RevenueBreakdown GetRevenueBreakdown()
    {
        // TODO: Query database for all trademark filings
        return new RevenueBreakdown
        {
            TotalFilingsCreated = 0,
            TotalUsersCharged = 0,
            TotalUSPTOFeesCollected = 0,
            TotalWiseravenRevenue = 0
        };
    }
}
