// Wiseravenshare.Server/Services/CopyrightFilingService.cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace Wiseravenshare.Server.Services;

/// <summary>
/// Manages complete Copyright Office form filing workflow for users.
/// Wiseravenshare handles all aspects: form filling, payment, submission, tracking.
/// Users earn full revenue minus Copyright Office base fee (50% Wiseravenshare service margin).
/// </summary>
public class CopyrightFilingService
{
    private readonly ILogger<CopyrightFilingService> _logger;

    public CopyrightFilingService(ILogger<CopyrightFilingService> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Copyright registration filing status lifecycle
    /// </summary>
    public enum RegistrationStatus
    {
        /// Initial state, user gathering information
        Draft,
        /// User has filled form, awaiting payment
        ReadyForPayment,
        /// Payment received, form submitted to Copyright Office
        SubmittedToOffice,
        /// Awaiting Copyright Office processing (4-6 weeks typical)
        Processing,
        /// Registration certificate received from Copyright Office
        Registered,
        /// Registration rejected or failed
        Failed,
        /// User cancelled
        Cancelled
    }

    /// <summary>
    /// Copyright Office form types supported by Wiseravenshare filing service
    /// </summary>
    public class CopyrightForm
    {
        public string FormCode { get; set; }
        public string FormName { get; set; }
        public string WorkType { get; set; }
        /// <summary>
        /// U.S. Copyright Office filing fee (pass-through to CO)
        /// </summary>
        public decimal CopyrightOfficeFeeUsd { get; set; }
        /// <summary>
        /// Wiseravenshare service fee (50% of CO fee)
        /// </summary>
        public decimal WiseravenServiceFeeUsd { get; set; }
        /// <summary>
        /// Total user pays (CO fee + Wiseravenshare markup)
        /// </summary>
        public decimal TotalUserPriceUsd { get; set; }
        public string Description { get; set; }
        public List<string> RequiredDocuments { get; set; }
        public List<string> AppliesTo { get; set; }
    }

    /// <summary>
    /// User registration filing record
    /// </summary>
    public class RegistrationFiling
    {
        public string FilingId { get; set; }
        public string UserId { get; set; }
        public string FormCode { get; set; }
        public RegistrationStatus Status { get; set; }
        public decimal CopyrightOfficeFee { get; set; }
        public decimal WiseravenServiceFee { get; set; }
        public decimal TotalPrice { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? SubmittedAt { get; set; }
        public DateTime? RegisteredAt { get; set; }
        /// <summary>
        /// Registration number from Copyright Office (e.g., TXu 123-456-789)
        /// </summary>
        public string RegistrationNumber { get; set; }
        /// <summary>
        /// Work title provided by user
        /// </summary>
        public string WorkTitle { get; set; }
        /// <summary>
        /// Work description/details
        /// </summary>
        public string WorkDescription { get; set; }
        /// <summary>
        /// Creator/author name
        /// </summary>
        public string CreatorName { get; set; }
        /// <summary>
        /// Uploaded file storage keys (music file, artwork, etc.)
        /// </summary>
        public List<string> UploadedFileKeys { get; set; } = new();
        /// <summary>
        /// Payment confirmation ID (Stripe or payment processor)
        /// </summary>
        public string PaymentIntentId { get; set; }
        /// <summary>
        /// Optional notes from Copyright Office or internal tracking
        /// </summary>
        public string Notes { get; set; }
    }

    /// <summary>
    /// Returns all available Copyright Office forms Wiseravenshare can file
    /// </summary>
    public List<CopyrightForm> GetAvailableForms()
    {
        const decimal markupMultiplier = 1.5m; // 50% markup
        
        return new List<CopyrightForm>
        {
            new CopyrightForm
            {
                FormCode = "SR",
                FormName = "Form SR: Sound Recording",
                WorkType = "Sound Recording",
                CopyrightOfficeFeeUsd = 65m,
                WiseravenServiceFeeUsd = 65m * 0.5m,
                TotalUserPriceUsd = 65m * markupMultiplier,
                Description = "Register a sound recording (the fixed audio of your music recording). Wiseravenshare handles the complete filing process with the U.S. Copyright Office.",
                RequiredDocuments = new List<string>
                {
                    "Audio file (MP3, WAV, FLAC, etc., max 50MB)",
                    "Work title",
                    "Creator/artist name",
                    "Year of creation",
                    "Work description/notes"
                },
                AppliesTo = new List<string>
                {
                    "Recorded music tracks",
                    "Podcast episodes",
                    "Audiobook narration",
                    "Remixes and arrangements",
                    "Live concert recordings"
                }
            },
            new CopyrightForm
            {
                FormCode = "PA",
                FormName = "Form PA: Work of Performing Arts",
                WorkType = "Musical or Dramatic Work",
                CopyrightOfficeFeeUsd = 65m,
                WiseravenServiceFeeUsd = 65m * 0.5m,
                TotalUserPriceUsd = 65m * markupMultiplier,
                Description = "Register the underlying musical composition (notes, lyrics, structure). Wiseravenshare files your composition with the U.S. Copyright Office.",
                RequiredDocuments = new List<string>
                {
                    "Sheet music or lead sheet (PDF/image)",
                    "MIDI file (optional but recommended)",
                    "Lyric sheet (if applicable)",
                    "Work title",
                    "Composer/songwriter name",
                    "Year of creation",
                    "Composition description"
                },
                AppliesTo = new List<string>
                {
                    "Original song compositions",
                    "Musical scores",
                    "Orchestral arrangements",
                    "Instrumental compositions",
                    "Choreography set to music"
                }
            },
            new CopyrightForm
            {
                FormCode = "TX",
                FormName = "Form TX: Literary Work",
                WorkType = "Textual Work (Lyrics/Script)",
                CopyrightOfficeFeeUsd = 65m,
                WiseravenServiceFeeUsd = 65m * 0.5m,
                TotalUserPriceUsd = 65m * markupMultiplier,
                Description = "Register lyrics, scripts, or spoken word texts. Wiseravenshare files your literary work with the U.S. Copyright Office.",
                RequiredDocuments = new List<string>
                {
                    "Text document (TXT, PDF, DOCX)",
                    "Work title",
                    "Author/writer name",
                    "Year of creation",
                    "Work type (lyrics, script, poetry, etc.)",
                    "Content description"
                },
                AppliesTo = new List<string>
                {
                    "Song lyrics (standalone)",
                    "Podcast scripts",
                    "Spoken word poetry",
                    "Voice-over scripts",
                    "Liner notes and documentation"
                }
            },
            new CopyrightForm
            {
                FormCode = "COMBINED",
                FormName = "Combined SR + PA Bundle",
                WorkType = "Sound Recording + Composition",
                CopyrightOfficeFeeUsd = 130m,
                WiseravenServiceFeeUsd = 130m * 0.5m,
                TotalUserPriceUsd = 130m * markupMultiplier,
                Description = "Register both sound recording and composition in one complete filing. Most comprehensive protection for original artists.",
                RequiredDocuments = new List<string>
                {
                    "Audio file (MP3, WAV, FLAC, max 50MB)",
                    "Sheet music or lead sheet (PDF/image)",
                    "Work title",
                    "Creator/artist name",
                    "Composer/songwriter name",
                    "Year of creation",
                    "Recording and composition descriptions"
                },
                AppliesTo = new List<string>
                {
                    "Original recorded music (artist + songwriter)",
                    "Complete protection of artist output",
                    "Protection against sampling",
                    "Full copyright bundle for new releases"
                }
            }
        };
    }

    /// <summary>
    /// Creates a new copyright filing for a user (initially in Draft status)
    /// </summary>
    public RegistrationFiling CreateFiling(string userId, string formCode)
    {
        var forms = GetAvailableForms();
        var selectedForm = forms.FirstOrDefault(f => f.FormCode == formCode);
        
        if (selectedForm == null)
            throw new ArgumentException($"Form code '{formCode}' not found");

        var filing = new RegistrationFiling
        {
            FilingId = $"filing-{Guid.NewGuid():N}",
            UserId = userId,
            FormCode = formCode,
            Status = RegistrationStatus.Draft,
            CopyrightOfficeFee = selectedForm.CopyrightOfficeFeeUsd,
            WiseravenServiceFee = selectedForm.WiseravenServiceFeeUsd,
            TotalPrice = selectedForm.TotalUserPriceUsd,
            CreatedAt = DateTime.UtcNow
        };

        _logger.LogInformation($"Created filing {filing.FilingId} for user {userId}, form {formCode}, price ${filing.TotalPrice:F2}");
        return filing;
    }

    /// <summary>
    /// Validates filing data is complete before payment
    /// </summary>
    public (bool isValid, List<string> missingFields) ValidateFilingForPayment(RegistrationFiling filing)
    {
        var missingFields = new List<string>();

        if (string.IsNullOrWhiteSpace(filing.WorkTitle))
            missingFields.Add("Work title is required");

        if (string.IsNullOrWhiteSpace(filing.CreatorName))
            missingFields.Add("Creator/artist name is required");

        if (filing.UploadedFileKeys == null || filing.UploadedFileKeys.Count == 0)
            missingFields.Add("At least one file (audio, sheet music, or text) must be uploaded");

        if (string.IsNullOrWhiteSpace(filing.WorkDescription))
            missingFields.Add("Work description is required for Copyright Office filing");

        return (missingFields.Count == 0, missingFields);
    }

    /// <summary>
    /// Marks filing as ready for payment after validation
    /// </summary>
    public void MarkReadyForPayment(RegistrationFiling filing)
    {
        var (isValid, missingFields) = ValidateFilingForPayment(filing);
        
        if (!isValid)
            throw new InvalidOperationException($"Cannot mark filing ready: {string.Join(", ", missingFields)}");

        filing.Status = RegistrationStatus.ReadyForPayment;
        _logger.LogInformation($"Filing {filing.FilingId} marked ready for payment. Total: ${filing.TotalPrice:F2}");
    }

    /// <summary>
    /// Records payment confirmation and submits to Copyright Office
    /// </summary>
    public void ConfirmPaymentAndSubmit(RegistrationFiling filing, string paymentIntentId)
    {
        if (filing.Status != RegistrationStatus.ReadyForPayment)
            throw new InvalidOperationException($"Filing must be in ReadyForPayment status, currently {filing.Status}");

        filing.PaymentIntentId = paymentIntentId;
        filing.Status = RegistrationStatus.SubmittedToOffice;
        filing.SubmittedAt = DateTime.UtcNow;

        _logger.LogInformation($"Filing {filing.FilingId} payment confirmed (intent: {paymentIntentId}). Submitted to Copyright Office.");
    }

    /// <summary>
    /// Calculates expected timeline for registration based on Copyright Office processing
    /// </summary>
    public (DateTime expectedEarliestDate, DateTime expectedLatestDate) GetExpectedRegistrationTimeline(DateTime submittedDate)
    {
        // Copyright Office processes SR/PA/TX in 4-6 weeks typically
        var earliest = submittedDate.AddDays(28); // 4 weeks
        var latest = submittedDate.AddDays(42);   // 6 weeks

        return (earliest, latest);
    }

    /// <summary>
    /// Records registration when Copyright Office certificate arrives
    /// </summary>
    public void RecordRegistrationComplete(RegistrationFiling filing, string registrationNumber)
    {
        if (string.IsNullOrWhiteSpace(registrationNumber))
            throw new ArgumentException("Registration number is required");

        filing.Status = RegistrationStatus.Registered;
        filing.RegistrationNumber = registrationNumber;
        filing.RegisteredAt = DateTime.UtcNow;

        _logger.LogInformation($"Filing {filing.FilingId} registered with Copyright Office. Registration #: {registrationNumber}");
    }

    /// <summary>
    /// Calculates revenue split for Wiseravenshare
    /// </summary>
    public (decimal copyrightOfficeFee, decimal wiseravenRevenue) GetRevenueBreakdown(decimal userPrice)
    {
        // User price = CO fee + 50% markup
        // CO fee = user price / 1.5
        // Wiseravenshare revenue = user price - CO fee
        var coFee = userPrice / 1.5m;
        var wiseravenRev = userPrice - coFee;
        return (coFee, wiseravenRev);
    }
}
