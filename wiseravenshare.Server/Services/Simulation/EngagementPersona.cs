using System;
using System.Collections.Generic;

namespace Wiseravenshare.Server.Services.Simulation;

/// <summary>
/// Defines an authentic engagement persona with a rich, unique personality profile,
/// writing tone, domains of interest, and realistic human creative output.
/// </summary>
public sealed class EngagementPersona
{
    public string Key { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string HandleBase { get; set; } = string.Empty;
    public string EmailBase { get; set; } = string.Empty;
    public string Archetype { get; set; } = string.Empty;
    public string Bio { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public string AvatarUrl { get; set; } = string.Empty;
    public string Tone { get; set; } = string.Empty;
    public List<string> Interests { get; set; } = new();
    public List<string> PostPool { get; set; } = new();
    public List<string> ReplyPool { get; set; } = new();
}
