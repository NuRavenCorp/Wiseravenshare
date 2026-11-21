using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Wiseravenshare.Server.Models;

public sealed class TeamMemberDetail
{
    [JsonPropertyName("user_id")]
    public string UserId { get; set; } = string.Empty;

    [JsonPropertyName("display_name")]
    public string DisplayName { get; set; } = string.Empty;

    [JsonPropertyName("role")]
    public string Role { get; set; } = "Member";

    [JsonPropertyName("responsibility")]
    public string? Responsibility { get; set; }

    [JsonPropertyName("device")]
    public string? Device { get; set; }

    [JsonPropertyName("joined_date")]
    public DateTime? JoinedDate { get; set; } = DateTime.UtcNow;
}

public sealed class TeamRecord
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [JsonPropertyName("team_name")]
    public string TeamName { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("focus")]
    public string? Focus { get; set; }

    [JsonPropertyName("purpose")]
    public string? Purpose { get; set; }

    [JsonPropertyName("owner_id")]
    public string OwnerId { get; set; } = string.Empty;

    [JsonPropertyName("members")]
    public List<string> Members { get; set; } = new();

    [JsonPropertyName("member_details")]
    public List<TeamMemberDetail> MemberDetails { get; set; } = new();

    [JsonPropertyName("created_date")]
    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

    [JsonPropertyName("updated_date")]
    public DateTime UpdatedDate { get; set; } = DateTime.UtcNow;
}
