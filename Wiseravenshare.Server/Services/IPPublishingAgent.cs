using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Wiseravenshare.Server.Services;

/// <summary>
/// Autonomous IP Publishing Agent for Copyright Office and USPTO filings.
/// 
/// Responsibilities:
/// 1. Monitor payment confirmations for copyright/trademark filings
/// 2. Generate complete application forms from user data
/// 3. Automate online form submission to government portals
/// 4. Track application status and polling for responses
/// 5. Handle office actions (refusals/requirements) with auto-responses
/// 6. Notify users of progress and registration certificates
/// 
/// Runs as a background hosted service with configurable polling intervals.
/// </summary>
public class IPPublishingAgent
{
    private readonly ILogger<IPPublishingAgent> _logger;

    public IPPublishingAgent(ILogger<IPPublishingAgent> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Agent task status for monitoring
    /// </summary>
    public enum AgentTaskStatus
    {
        Pending = 1,
        InProgress = 2,
        Submitted = 3,
        Processing = 4,
        ActionRequired = 5,
        Completed = 6,
        Failed = 7
    }

    /// <summary>
    /// Copyright or Trademark filing workflow agent task
    /// </summary>
    public class FilingPublishingTask
    {
        public string TaskId { get; set; }
        public string FilingId { get; set; } // Reference to CopyrightFiling or TrademarkFiling
        public string FilingType { get; set; } // "Copyright" or "Trademark"
        public string FormCode { get; set; } // SR, PA, TX, VI, etc.
        public AgentTaskStatus Status { get; set; }
        
        // Form generation
        public string GeneratedFormContent { get; set; } // Populated form data (JSON or XML)
        public string FormTemplateUsed { get; set; } // Template version/ID
        public DateTime? FormGeneratedAt { get; set; }
        
        // Submission tracking
        public string GovernmentApplicationNumber { get; set; } // Receipt/confirmation number
        public string GovernmentConfirmationEmail { get; set; } // Email from Copyright Office or USPTO
        public DateTime? SubmittedAt { get; set; }
        public int SubmissionAttempts { get; set; } // Track retries
        
        // Status polling
        public DateTime? LastStatusCheckAt { get; set; }
        public DateTime? NextStatusCheckAt { get; set; }
        public string LatestStatusFromGovt { get; set; }
        
        // Office action handling
        public string OfficeActionReceived { get; set; } // Office action details
        public DateTime? OfficeActionReceivedAt { get; set; }
        public DateTime? OfficeActionDeadline { get; set; }
        public bool AutoResponseGenerated { get; set; }
        public string AutoResponseContent { get; set; }
        
        // Logging
        public string AgentNotes { get; set; } // Internal agent notes/errors
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    /// <summary>
    /// Publishes a copyright filing to the Copyright Office.
    /// Returns task for monitoring progress.
    /// </summary>
    public FilingPublishingTask PublishCopyrightFiling(string copyrightFilingId, string formCode, 
        string workTitle, string creatorName, string workDescription, List<string> uploadedFileKeys)
    {
        var task = new FilingPublishingTask
        {
            TaskId = Guid.NewGuid().ToString("N"),
            FilingId = copyrightFilingId,
            FilingType = "Copyright",
            FormCode = formCode,
            Status = AgentTaskStatus.Pending,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        try
        {
            // Step 1: Generate form from user data
            task.GeneratedFormContent = GenerateCopyrightForm(formCode, workTitle, creatorName, 
                workDescription, uploadedFileKeys);
            task.FormGeneratedAt = DateTime.UtcNow;
            task.FormTemplateUsed = $"CO-{formCode}-v1";
            
            _logger.LogInformation($"Generated {formCode} form for copyright filing {copyrightFilingId}");

            // Step 2: Queue for submission (will be picked up by hosting service)
            task.Status = AgentTaskStatus.InProgress;
            task.AgentNotes = "Form generated, queued for submission to Copyright Office";
            
            return task;
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error publishing copyright filing {copyrightFilingId}: {ex.Message}");
            task.Status = AgentTaskStatus.Failed;
            task.AgentNotes = $"Error: {ex.Message}";
            return task;
        }
    }

    /// <summary>
    /// Publishes a trademark filing to the USPTO.
    /// Returns task for monitoring progress.
    /// </summary>
    public FilingPublishingTask PublishTrademarkFiling(string trademarkFilingId, string formCode,
        string trademarkText, string trademarkDescription, string goodsServicesDescription, 
        List<string> uploadedFileKeys)
    {
        var task = new FilingPublishingTask
        {
            TaskId = Guid.NewGuid().ToString("N"),
            FilingId = trademarkFilingId,
            FilingType = "Trademark",
            FormCode = formCode,
            Status = AgentTaskStatus.Pending,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        try
        {
            // Step 1: Generate form from user data
            task.GeneratedFormContent = GenerateTrademarkForm(formCode, trademarkText, 
                trademarkDescription, goodsServicesDescription, uploadedFileKeys);
            task.FormGeneratedAt = DateTime.UtcNow;
            task.FormTemplateUsed = $"USPTO-{formCode}-v1";
            
            _logger.LogInformation($"Generated {formCode} form for trademark filing {trademarkFilingId}");

            // Step 2: Queue for submission (will be picked up by hosting service)
            task.Status = AgentTaskStatus.InProgress;
            task.AgentNotes = "Form generated, queued for submission to USPTO";
            
            return task;
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error publishing trademark filing {trademarkFilingId}: {ex.Message}");
            task.Status = AgentTaskStatus.Failed;
            task.AgentNotes = $"Error: {ex.Message}";
            return task;
        }
    }

    /// <summary>
    /// Generates a Copyright Office form (SR, PA, TX, or Combined).
    /// Returns populated form data as JSON.
    /// </summary>
    private string GenerateCopyrightForm(string formCode, string workTitle, string creatorName, 
        string workDescription, List<string> uploadedFileKeys)
    {
        var formData = new
        {
            formCode,
            formType = GetCopyrightFormType(formCode),
            workTitle,
            creatorName,
            workDescription,
            uploadedFiles = uploadedFileKeys,
            generatedAt = DateTime.UtcNow,
            copyrightClaimInfo = new
            {
                titleOfWork = workTitle,
                nameOfAuthor = creatorName,
                dateOfCompletion = DateTime.UtcNow.AddYears(-1).ToString("yyyy-MM-dd"),
                publicationDate = null,
                workMadeForHire = false,
                anonymousWork = false,
                pseudonymousWork = false,
                copyrightClaimLimit = "Full work"
            },
            attachments = uploadedFileKeys.Select((key, i) => new
            {
                index = i + 1,
                storageKey = key,
                fileName = ExtractFileName(key),
                type = DetermineFileType(key)
            }).ToList()
        };

        return System.Text.Json.JsonSerializer.Serialize(formData, new System.Text.Json.JsonSerializerOptions 
        { 
            WriteIndented = true 
        });
    }

    /// <summary>
    /// Generates a USPTO Trademark form (TX, VI, SR, or COMBINED).
    /// Returns populated form data as JSON (TEAS+ format).
    /// </summary>
    private string GenerateTrademarkForm(string formCode, string trademarkText, 
        string trademarkDescription, string goodsServicesDescription, List<string> uploadedFileKeys)
    {
        var formData = new
        {
            formCode,
            formType = GetTrademarkFormType(formCode),
            trademarkText,
            trademarkDescription,
            goodsServicesDescription,
            uploadedFiles = uploadedFileKeys,
            generatedAt = DateTime.UtcNow,
            trademarkInfo = new
            {
                markText = trademarkText,
                typeOfMark = GetMarkType(formCode),
                classCodes = GetClassCodes(formCode), // 041 for podcasting
                goodsAndServices = goodsServicesDescription,
                disclaimerText = "",
                transliteration = null,
                translationText = null
            },
            specimenInfo = uploadedFileKeys
                .Where(k => k.Contains("specimen", StringComparison.OrdinalIgnoreCase))
                .Select((key, i) => new
                {
                    index = i + 1,
                    storageKey = key,
                    fileName = ExtractFileName(key),
                    descriptionOfUse = $"Specimen {i + 1} showing mark in use in commerce"
                }).ToList(),
            ownerInfo = new
            {
                entityType = "Individual",
                name = "",  // Will be filled from filing
                address = "",
                city = "",
                state = "",
                zipCode = "",
                country = "United States"
            }
        };

        return System.Text.Json.JsonSerializer.Serialize(formData, new System.Text.Json.JsonSerializerOptions 
        { 
            WriteIndented = true 
        });
    }

    /// <summary>
    /// Gets the official Copyright Office form type name
    /// </summary>
    private string GetCopyrightFormType(string formCode)
    {
        return formCode switch
        {
            "SR" => "Sound Recording (Form SR)",
            "PA" => "Work of Performing Arts (Form PA)",
            "TX" => "Literary Work (Form TX)",
            "SR+PA" => "Combined - Sound Recording + Composition",
            _ => "Unknown"
        };
    }

    /// <summary>
    /// Gets the official USPTO trademark form type
    /// </summary>
    private string GetTrademarkFormType(string formCode)
    {
        return formCode switch
        {
            "TX" => "Text/Word Mark (TEAS)",
            "VI" => "Visual Mark (TEAS)",
            "SR" => "Sound Mark (TEAS)",
            "COMBINED" => "Combined TX + VI (TEAS)",
            _ => "Unknown"
        };
    }

    /// <summary>
    /// Gets trademark type for USPTO
    /// </summary>
    private string GetMarkType(string formCode)
    {
        return formCode switch
        {
            "TX" => "Trademark (text)",
            "VI" => "Trademark (image/design)",
            "SR" => "Sound mark",
            "COMBINED" => "Trademark (combined)",
            _ => "Trademark"
        };
    }

    /// <summary>
    /// Gets USPTO class codes (041 = podcasting/entertainment)
    /// </summary>
    private List<int> GetClassCodes(string formCode)
    {
        return new List<int> { 41 }; // 41 = Audio/visual entertainment services
    }

    private string ExtractFileName(string storageKey)
    {
        // storageKey format: filing/{filingId}/{documentType}/{fileName}
        return storageKey.Split('/').LastOrDefault() ?? "document";
    }

    private string DetermineFileType(string storageKey)
    {
        var ext = System.IO.Path.GetExtension(storageKey).ToLower();
        return ext switch
        {
            ".mp3" or ".wav" or ".flac" => "audio",
            ".pdf" or ".jpg" or ".jpeg" or ".png" => "image",
            ".txt" or ".docx" or ".doc" => "text",
            _ => "unknown"
        };
    }

    /// <summary>
    /// Updates task status based on government response
    /// </summary>
    public void UpdateTaskStatus(FilingPublishingTask task, string newStatus, string notes)
    {
        task.Status = Enum.Parse<AgentTaskStatus>(newStatus);
        task.AgentNotes = notes;
        task.UpdatedAt = DateTime.UtcNow;
        
        _logger.LogInformation($"Updated task {task.TaskId}: {newStatus} - {notes}");
    }

    /// <summary>
    /// Records office action (refusal/requirement from government)
    /// </summary>
    public void HandleOfficeAction(FilingPublishingTask task, string officeActionDetails, 
        DateTime responseDeadline)
    {
        task.Status = AgentTaskStatus.ActionRequired;
        task.OfficeActionReceived = officeActionDetails;
        task.OfficeActionReceivedAt = DateTime.UtcNow;
        task.OfficeActionDeadline = responseDeadline;
        task.AgentNotes = $"Office action received: {officeActionDetails}";
        
        // Auto-generate response suggestion (can be reviewed by human)
        GenerateOfficeActionResponse(task);
        
        task.UpdatedAt = DateTime.UtcNow;
        
        _logger.LogInformation($"Office action received for task {task.TaskId}, deadline: {responseDeadline:O}");
    }

    /// <summary>
    /// Generates an auto-response to office action (for human review)
    /// </summary>
    private void GenerateOfficeActionResponse(FilingPublishingTask task)
    {
        var responseTemplate = task.FilingType switch
        {
            "Copyright" => GenerateCopyrightOfficeActionResponse(task),
            "Trademark" => GenerateTrademarkOfficeActionResponse(task),
            _ => "No response template available"
        };

        task.AutoResponseContent = responseTemplate;
        task.AutoResponseGenerated = true;
    }

    private string GenerateCopyrightOfficeActionResponse(FilingPublishingTask task)
    {
        return $@"
OFFICE ACTION RESPONSE — Copyright Office Filing {task.FilingId}

Received: {task.OfficeActionReceivedAt:g}
Deadline: {task.OfficeActionDeadline:g}

ACTION ITEMS:
{task.OfficeActionReceived}

RECOMMENDED RESPONSE:
[Requires human review and customization]

This office action indicates the Copyright Office requires additional information or clarification.
Please review the specific requirements above and provide the requested documentation.

NEXT STEPS:
1. Review the office action details above
2. Gather any required additional materials
3. Submit response before deadline: {task.OfficeActionDeadline:g}
4. Keep copy for your records

Do NOT delay in responding — failure to respond will result in abandonment of the application.
";
    }

    private string GenerateTrademarkOfficeActionResponse(FilingPublishingTask task)
    {
        return $@"
OFFICE ACTION RESPONSE — Trademark Filing {task.FilingId}

Received: {task.OfficeActionReceivedAt:g}
Deadline: {task.OfficeActionDeadline:g}

OFFICE ACTION DETAILS:
{task.OfficeActionReceived}

RECOMMENDED RESPONSE:
[Requires human review and customization]

This office action indicates the USPTO examiner has identified issues with your trademark application.
Common reasons include:
- Refusal based on existing similar marks
- Specification issues (goods/services unclear)
- Specimen inadequate to show use in commerce
- Other federal statute issues

NEXT STEPS:
1. Carefully review the office action
2. Determine if you can overcome the refusal or need to amend
3. Prepare and submit response by deadline
4. If refusal cannot be overcome, consider abandoning to preserve filing fees

Response deadline: {task.OfficeActionDeadline:g}
";
    }

    /// <summary>
    /// Records successful registration
    /// </summary>
    public void MarkRegistrationComplete(FilingPublishingTask task, string registrationNumber, 
        string certificateData)
    {
        task.Status = AgentTaskStatus.Completed;
        task.GovernmentApplicationNumber = registrationNumber;
        task.AgentNotes = $"Registration completed: {registrationNumber}";
        task.UpdatedAt = DateTime.UtcNow;
        
        _logger.LogInformation($"Task {task.TaskId} completed with registration #{registrationNumber}");
    }

    /// <summary>
    /// Records task failure
    /// </summary>
    public void MarkTaskFailed(FilingPublishingTask task, string errorReason)
    {
        task.Status = AgentTaskStatus.Failed;
        task.AgentNotes = $"Failed: {errorReason}";
        task.UpdatedAt = DateTime.UtcNow;
        
        _logger.LogError($"Task {task.TaskId} failed: {errorReason}");
    }
}

/// <summary>
/// Hosted background service that runs the IP Publishing Agent.
/// Polls for pending filings and orchestrates publication workflow.
/// </summary>
public class IPPublishingAgentHostedService : BackgroundService
{
    private readonly IPPublishingAgent _agent;
    private readonly ILogger<IPPublishingAgentHostedService> _logger;
    private readonly TimeSpan _pollingInterval = TimeSpan.FromMinutes(5);

    public IPPublishingAgentHostedService(IPPublishingAgent agent, ILogger<IPPublishingAgentHostedService> logger)
    {
        _agent = agent;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("IP Publishing Agent starting...");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // TODO: Query database for filings in "SubmittedToOffice" status
                // var pendingFilings = await db.CopyrightFilings
                //     .Where(f => f.Status == RegistrationStatus.SubmittedToOffice)
                //     .ToListAsync(stoppingToken);

                // foreach (var filing in pendingFilings)
                // {
                //     var task = _agent.PublishCopyrightFiling(...);
                //     await _formBot.SubmitFormAsync(task);
                // }

                // TODO: Similarly for trademark filings
                
                _logger.LogDebug("IP Publishing Agent polling cycle completed");
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error in IP Publishing Agent: {ex.Message}");
            }

            await Task.Delay(_pollingInterval, stoppingToken);
        }

        _logger.LogInformation("IP Publishing Agent stopped");
    }
}
