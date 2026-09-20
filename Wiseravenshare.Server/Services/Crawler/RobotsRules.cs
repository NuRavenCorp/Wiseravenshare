namespace Wiseravenshare.Server.Services.Crawler;

public sealed class RobotsRules
{
    private readonly List<RobotsGroup> _groups = [];

    public static RobotsRules Parse(string content)
    {
        var rules = new RobotsRules();
        if (string.IsNullOrWhiteSpace(content))
        {
            return rules;
        }

        RobotsGroup? current = null;
        foreach (var rawLine in content.Split('\n'))
        {
            var line = rawLine.Split('#')[0].Trim();
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            var idx = line.IndexOf(':');
            if (idx < 0)
            {
                continue;
            }

            var key = line[..idx].Trim().ToLowerInvariant();
            var value = line[(idx + 1)..].Trim();

            if (key == "user-agent")
            {
                if (current is null || current.Rules.Count > 0)
                {
                    current = new RobotsGroup { UserAgent = value };
                    rules._groups.Add(current);
                }
                else
                {
                    current.UserAgent = value;
                }
            }
            else if (key == "disallow")
            {
                current?.Rules.Add(new RobotsRule { Type = RuleType.Disallow, Path = value });
            }
            else if (key == "allow")
            {
                current?.Rules.Add(new RobotsRule { Type = RuleType.Allow, Path = value });
            }
        }

        return rules;
    }

    public bool IsAllowed(string path, string userAgent)
    {
        var group = _groups.FirstOrDefault(g =>
            g.UserAgent == "*" || userAgent.Contains(g.UserAgent, StringComparison.OrdinalIgnoreCase));
        if (group is null)
        {
            return true;
        }

        var matchingRules = group.Rules
            .Where(rule => !string.IsNullOrWhiteSpace(rule.Path) && path.StartsWith(rule.Path, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(rule => rule.Path.Length)
            .ToList();

        if (matchingRules.Count == 0)
        {
            return true;
        }

        return matchingRules[0].Type == RuleType.Allow;
    }
}

public sealed class RobotsGroup
{
    public string UserAgent { get; set; } = "*";
    public List<RobotsRule> Rules { get; } = [];
}

public sealed class RobotsRule
{
    public RuleType Type { get; set; }
    public string Path { get; set; } = string.Empty;
}

public enum RuleType
{
    Allow,
    Disallow
}
