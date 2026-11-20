using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Npgsql;
using NpgsqlTypes;
namespace WiseRavenShare.Journalism
{
    // =========================================================================
    // PLANNER MODELS (KNITTED TO WISERAVENSHARE USER IDENTITY)
    // =========================================================================
    public record PlannerItemDto(
        Guid Id,
        string UserId,
        string Title,
        string? Description,
        DateTime? ScheduledFor,
        string Status,
        Guid? ArticleId,
        string? ZipCode,
        List<string> Tags,
        DateTime CreatedAt,
        DateTime UpdatedAt
    );
    public record CreatePlannerItemRequest(
        string Title,
        string? Description,
        DateTime? ScheduledFor,
        string? ZipCode,
        List<string>? Tags
    );
    public record UpdatePlannerItemRequest(
        string? Title,
        string? Description,
        DateTime? ScheduledFor,