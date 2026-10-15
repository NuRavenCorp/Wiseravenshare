using System.Text;

namespace WiseRavenShare.Server.Application.Services.Assistant;

public class PromptBuilder
{
    public string BuildContext(IReadOnlyList<RagHit> rag, IReadOnlyList<WebSnippet> web)
    {
        var sb = new StringBuilder();
        if (rag.Count > 0)
        {
            sb.AppendLine("Use the following retrieved WiseRavenShare context when it is relevant. Cite sources by name.");
            sb.AppendLine();
            foreach (var r in rag)
            {
                sb.AppendLine($"### {r.Title}");
                sb.AppendLine($"Source: {r.Source}" + (r.SourceUrl != null ? $" ({r.SourceUrl})" : ""));
                sb.AppendLine(r.Content);
                sb.AppendLine();
            }
        }
        if (web.Count > 0)
        {
            sb.AppendLine("You may also use these freshly retrieved web results. Cite URLs inline.");
            sb.AppendLine();
            foreach (var w in web)
            {
                sb.AppendLine($"### {w.Title}");
                sb.AppendLine(w.Url);
                sb.AppendLine(w.Snippet);
                sb.AppendLine();
            }
        }
        return sb.ToString();
    }
}
