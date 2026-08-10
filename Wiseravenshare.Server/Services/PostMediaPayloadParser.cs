using System.Text.Json;

namespace Wiseravenshare.Server.Services;

public static class PostMediaPayloadParser
{
    public static string[] ParseMediaUrls(string? directMediaUrl, params JsonElement[] payloads)
    {
        var values = new List<string>();

        if (!string.IsNullOrWhiteSpace(directMediaUrl))
        {
            values.Add(directMediaUrl.Trim());
        }

        foreach (var payload in payloads)
        {
            switch (payload.ValueKind)
            {
                case JsonValueKind.String:
                    AddIfUseful(values, payload.GetString());
                    break;
                case JsonValueKind.Array:
                    foreach (var element in payload.EnumerateArray())
                    {
                        switch (element.ValueKind)
                        {
                            case JsonValueKind.String:
                                AddIfUseful(values, element.GetString());
                                break;
                            case JsonValueKind.Object:
                                if (element.TryGetProperty("mediaUrl", out var mediaUrlProp) && mediaUrlProp.ValueKind == JsonValueKind.String)
                                {
                                    AddIfUseful(values, mediaUrlProp.GetString());
                                }
                                break;
                        }
                    }
                    break;
                case JsonValueKind.Object:
                    if (payload.TryGetProperty("mediaUrl", out var payloadMediaUrlProp) && payloadMediaUrlProp.ValueKind == JsonValueKind.String)
                    {
                        AddIfUseful(values, payloadMediaUrlProp.GetString());
                    }
                    if (payload.TryGetProperty("mediaUrls", out var mediaUrlsProp))
                    {
                        foreach (var entry in ParseMediaUrlsEntries(mediaUrlsProp))
                        {
                            AddIfUseful(values, entry);
                        }
                    }
                    break;
            }
        }

        return values.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private static IEnumerable<string> ParseMediaUrlsEntries(JsonElement value)
    {
        switch (value.ValueKind)
        {
            case JsonValueKind.String:
                return [value.GetString() ?? string.Empty];
            case JsonValueKind.Array:
                var result = new List<string>();
                foreach (var element in value.EnumerateArray())
                {
                    switch (element.ValueKind)
                    {
                        case JsonValueKind.String:
                            result.Add(element.GetString() ?? string.Empty);
                            break;
                        case JsonValueKind.Object:
                            if (element.TryGetProperty("mediaUrl", out var nestedMediaUrlProp) && nestedMediaUrlProp.ValueKind == JsonValueKind.String)
                            {
                                result.Add(nestedMediaUrlProp.GetString() ?? string.Empty);
                            }
                            break;
                    }
                }
                return result;
            default:
                return [];
        }
    }

    private static void AddIfUseful(List<string> values, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            values.Add(value.Trim());
        }
    }
}
