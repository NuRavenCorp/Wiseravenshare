using Microsoft.EntityFrameworkCore;
using Npgsql;
using NuRavenCorpLLM.Application.Services.Craft;
using NuRavenCorpLLM.Entities.Craft;
using NuRavenCorpLLM.Infrastructure.Data;

namespace NuRavenCorpLLM.Infrastructure.Vector;

public interface IPgVectorStore
{
    Task<IEnumerable<RagHit>> SimilaritySearchAsync(float[] query, int topK, double minScore, CancellationToken ct = default);
    Task<IReadOnlyList<CraftPrincipleHit>> SearchCraftPrinciplesAsync(float[] query, string domain, int topK, CancellationToken ct);
    Task<IReadOnlyList<CraftInsightHit>> SearchCraftInsightsAsync(float[] query, int topK, CancellationToken ct);
}

public record RagHit(Guid Id, string Title, string Content, string Source, string? SourceUrl, double Score);
public record CraftPrincipleHit(Guid Id, string Title, string Body, string Kind, int Importance, double Score);
public record CraftInsightHit(Guid Id, string Title, string Content, string Source, double Score);

public partial class PgVectorStore : IPgVectorStore
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<PgVectorStore> _logger;

    public PgVectorStore(ApplicationDbContext db, ILogger<PgVectorStore> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<IEnumerable<RagHit>> SimilaritySearchAsync(
        float[] query, int topK, double minScore, CancellationToken ct = default)
    {
        var vectorLiteral = "[" + string.Join(',', query.Select(f => f.ToString(System.Globalization.CultureInfo.InvariantCulture))) + "]";

        var sql = @"
            SELECT ""Id"", ""Title"", ""Content"", ""Source"", ""SourceUrl"",
                   1 - (""Embedding"" <=> @p0::vector) AS score
            FROM ""AssistantKnowledge""
            WHERE ""IsDeleted"" = false
              AND ""IsPublic"" = true
              AND ""IsApproved"" = true
              AND ""Embedding"" IS NOT NULL
            ORDER BY ""Embedding"" <=> @p0::vector
            LIMIT @p1;";

        var results = new List<RagHit>();
        using var cmd = _db.Database.GetDbConnection().CreateCommand();
        cmd.CommandText = sql;

        var p0 = cmd.CreateParameter(); p0.ParameterName = "@p0"; p0.Value = vectorLiteral; cmd.Parameters.Add(p0);
        var p1 = cmd.CreateParameter(); p1.ParameterName = "@p1"; p1.Value = topK; cmd.Parameters.Add(p1);

        await _db.Database.OpenConnectionAsync(ct);
        try
        {
            using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var score = reader.GetDouble(5);
                if (score < minScore) continue;
                results.Add(new RagHit(
                    reader.GetGuid(0),
                    reader.GetString(1),
                    reader.GetString(2),
                    reader.GetString(3),
                    reader.IsDBNull(4) ? null : reader.GetString(4),
                    score));
            }
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UndefinedObject || ex.SqlState == PostgresErrorCodes.UndefinedTable)
        {
            _logger.LogWarning(ex, "Vector similarity search unavailable. Falling back to empty RAG context.");
            return Array.Empty<RagHit>();
        }
        finally
        {
            await _db.Database.CloseConnectionAsync();
        }

        return results;
    }

    public async Task<IReadOnlyList<CraftPrincipleHit>> SearchCraftPrinciplesAsync(
        float[] query, string domain, int topK, CancellationToken ct)
    {
        var vec = "[" + string.Join(',', query.Select(f => f.ToString(System.Globalization.CultureInfo.InvariantCulture))) + "]";
        var sql = @"
            SELECT cp.id, cp.title, cp.body, cp.kind, cp.importance,
                   1 - (cp.embedding <=> @p0::vector) AS score
            FROM craft_principles cp
            JOIN craft_domains cd ON cd.id = cp.craft_domain_id
            WHERE cd.key = @p1
              AND cp.embedding IS NOT NULL
            ORDER BY cp.embedding <=> @p0::vector
            LIMIT @p2;";
        var results = new List<CraftPrincipleHit>();
        using var cmd = _db.Database.GetDbConnection().CreateCommand();
        cmd.CommandText = sql;
        var p0 = cmd.CreateParameter(); p0.ParameterName = "@p0"; p0.Value = vec; cmd.Parameters.Add(p0);
        var p1 = cmd.CreateParameter(); p1.ParameterName = "@p1"; p1.Value = domain; cmd.Parameters.Add(p1);
        var p2 = cmd.CreateParameter(); p2.ParameterName = "@p2"; p2.Value = topK; cmd.Parameters.Add(p2);
        await _db.Database.OpenConnectionAsync(ct);
        using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            results.Add(new CraftPrincipleHit(
                reader.GetGuid(0), reader.GetString(1), reader.GetString(2),
                reader.GetString(3), reader.GetInt32(4), reader.GetDouble(5)));
        }
        return results;
    }

    public async Task<IReadOnlyList<CraftInsightHit>> SearchCraftInsightsAsync(
        float[] query, int topK, CancellationToken ct)
    {
        var vec = "[" + string.Join(',', query.Select(f => f.ToString(System.Globalization.CultureInfo.InvariantCulture))) + "]";
        var sql = @"
            SELECT ci.id, ci.title, ci.content, cs.title,
                   1 - (ci.embedding <=> @p0::vector) AS score
            FROM craft_insights ci
            JOIN craft_sources cs ON cs.id = ci.source_id
            WHERE ci.embedding IS NOT NULL
            ORDER BY ci.embedding <=> @p0::vector
            LIMIT @p1;";
        var results = new List<CraftInsightHit>();
        using var cmd = _db.Database.GetDbConnection().CreateCommand();
        cmd.CommandText = sql;
        var p0 = cmd.CreateParameter(); p0.ParameterName = "@p0"; p0.Value = vec; cmd.Parameters.Add(p0);
        var p1 = cmd.CreateParameter(); p1.ParameterName = "@p1"; p1.Value = topK; cmd.Parameters.Add(p1);
        await _db.Database.OpenConnectionAsync(ct);
        using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            results.Add(new CraftInsightHit(
                reader.GetGuid(0), reader.GetString(1), reader.GetString(2),
                reader.GetString(3), reader.GetDouble(4)));
        }
        return results;
    }
}