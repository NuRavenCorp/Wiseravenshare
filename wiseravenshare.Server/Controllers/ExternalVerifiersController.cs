using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Services.Truth;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// CRUD management for external truth-verification sources and their weights.
/// GET /api/external-verifiers  — public (read-only)
/// POST/PATCH/DELETE            — Admin or TruthGuardian only
/// </summary>
[ApiController]
[Route("api/external-verifiers")]
public sealed class ExternalVerifiersController : ControllerBase
{
    private readonly IExternalVerificationService _service;

    public ExternalVerifiersController(IExternalVerificationService service)
        => _service = service;

    // ── READ ─────────────────────────────────────────────────────────────────

    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var verifiers = await _service.ListVerifiersAsync(ct);
        return Ok(verifiers.Select(MapToDto));
    }

    // ── WRITE (Admin / TruthGuardian) ─────────────────────────────────────────

    [HttpPost]
    [Authorize(Roles = "Admin,TruthGuardian")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Upsert([FromBody] ExternalVerifierUpsertRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Id))
            return BadRequest(new { error = "id is required." });
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { error = "name is required." });

        var verifier = new ExternalVerifier
        {
            Id = req.Id.Trim().ToLowerInvariant(),
            Name = req.Name.Trim(),
            EndpointTemplate = req.EndpointTemplate?.Trim() ?? string.Empty,
            FetchType = req.FetchType?.Trim().ToLowerInvariant() ?? "stub",
            ApiKeyEnvVar = string.IsNullOrWhiteSpace(req.ApiKeyEnvVar) ? null : req.ApiKeyEnvVar.Trim(),
            Weight = req.Weight.HasValue ? Math.Clamp(req.Weight.Value, 0.01m, 1.0m) : 0.10m,
            IsEnabled = req.IsEnabled ?? true,
            ScoreJsonPath = string.IsNullOrWhiteSpace(req.ScoreJsonPath) ? null : req.ScoreJsonPath.Trim(),
            Notes = req.Notes?.Trim()
        };

        var saved = await _service.UpsertVerifierAsync(verifier, ct);
        return Ok(MapToDto(saved));
    }

    [HttpPatch("{id}")]
    [Authorize(Roles = "Admin,TruthGuardian")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Patch(string id, [FromBody] ExternalVerifierPatchRequest req, CancellationToken ct)
    {
        var all = await _service.ListVerifiersAsync(ct);
        var existing = all.FirstOrDefault(v => string.Equals(v.Id, id.Trim(), StringComparison.OrdinalIgnoreCase));
        if (existing is null)
            return NotFound(new { error = $"Verifier '{id}' not found." });

        if (!string.IsNullOrWhiteSpace(req.Name)) existing.Name = req.Name.Trim();
        if (!string.IsNullOrWhiteSpace(req.EndpointTemplate)) existing.EndpointTemplate = req.EndpointTemplate.Trim();
        if (!string.IsNullOrWhiteSpace(req.FetchType)) existing.FetchType = req.FetchType.Trim().ToLowerInvariant();
        if (req.ApiKeyEnvVar is not null) existing.ApiKeyEnvVar = string.IsNullOrWhiteSpace(req.ApiKeyEnvVar) ? null : req.ApiKeyEnvVar.Trim();
        if (req.Weight.HasValue) existing.Weight = Math.Clamp(req.Weight.Value, 0.01m, 1.0m);
        if (req.IsEnabled.HasValue) existing.IsEnabled = req.IsEnabled.Value;
        if (req.ScoreJsonPath is not null) existing.ScoreJsonPath = string.IsNullOrWhiteSpace(req.ScoreJsonPath) ? null : req.ScoreJsonPath.Trim();
        if (req.Notes is not null) existing.Notes = req.Notes.Trim();

        var saved = await _service.UpsertVerifierAsync(existing, ct);
        return Ok(MapToDto(saved));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        var deleted = await _service.DeleteVerifierAsync(id.Trim().ToLowerInvariant(), ct);
        return deleted ? NoContent() : NotFound(new { error = $"Verifier '{id}' not found." });
    }

    /// <summary>
    /// Preview what a live query returns for a test claim — useful for debugging weights.
    /// </summary>
    [HttpPost("preview")]
    [Authorize(Roles = "Admin,TruthGuardian")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Preview([FromBody] ExternalVerifierPreviewRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Claim))
            return BadRequest(new { error = "claim is required." });

        var results = await _service.QueryAllAsync(req.Claim.Trim(), ct);
        var externalWeightTotal = results.Where(r => r.Succeeded).Sum(r => r.Weight);
        return Ok(new
        {
            claim = req.Claim,
            results = results.Select(r => new
            {
                verifier_id = r.VerifierId,
                verifier_name = r.VerifierName,
                score = r.Score,
                weight = r.Weight,
                weighted_contribution = r.Succeeded ? r.Score * r.Weight : 0m,
                succeeded = r.Succeeded,
                error = r.Error,
                source_url = r.SourceUrl,
                summary = r.Summary
            }),
            external_weight_total = externalWeightTotal,
            note = externalWeightTotal > 0.50m
                ? "External weights exceed 50% cap; internal weights are not reduced below 50%."
                : $"Internal weights collectively contribute {1m - Math.Min(externalWeightTotal, 0.50m):P0} of the final score."
        });
    }

    // ── Mapping ───────────────────────────────────────────────────────────────

    private static object MapToDto(ExternalVerifier v) => new
    {
        id = v.Id,
        name = v.Name,
        endpoint_template = v.EndpointTemplate,
        fetch_type = v.FetchType,
        api_key_env_var = v.ApiKeyEnvVar,
        weight = v.Weight,
        is_enabled = v.IsEnabled,
        score_json_path = v.ScoreJsonPath,
        notes = v.Notes,
        created_at = v.CreatedAt,
        updated_at = v.UpdatedAt
    };
}

public sealed class ExternalVerifierUpsertRequest
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? EndpointTemplate { get; set; }
    public string? FetchType { get; set; }
    public string? ApiKeyEnvVar { get; set; }
    public decimal? Weight { get; set; }
    public bool? IsEnabled { get; set; }
    public string? ScoreJsonPath { get; set; }
    public string? Notes { get; set; }
}

public sealed class ExternalVerifierPatchRequest
{
    public string? Name { get; set; }
    public string? EndpointTemplate { get; set; }
    public string? FetchType { get; set; }
    public string? ApiKeyEnvVar { get; set; }
    public decimal? Weight { get; set; }
    public bool? IsEnabled { get; set; }
    public string? ScoreJsonPath { get; set; }
    public string? Notes { get; set; }
}

public sealed class ExternalVerifierPreviewRequest
{
    public string Claim { get; set; } = string.Empty;
}
