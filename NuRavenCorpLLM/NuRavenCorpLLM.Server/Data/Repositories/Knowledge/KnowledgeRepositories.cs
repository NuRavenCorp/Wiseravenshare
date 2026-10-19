using System.Text;
using Microsoft.EntityFrameworkCore;
using NuRavenCorpLLM.Server.Entities.Knowledge;

namespace NuRavenCorpLLM.Server.Data.Repositories.Knowledge;

public interface IKnowledgeDocumentRepository : IRepository<KnowledgeDocument>
{
    Task<KnowledgeDocument?> GetByHashAsync(string contentHash, CancellationToken ct = default);
    Task<IEnumerable<KnowledgeDocument>> GetByClientAsync(Guid clientSystemId, int limit = 500, CancellationToken ct = default);
    Task<IEnumerable<KnowledgeDocument>> GetApprovedPublicAsync(int limit = 500, CancellationToken ct = default);
    Task<IEnumerable<KnowledgeDocument>> SearchByTitleAsync(string query, int limit = 20, CancellationToken ct = default);
    Task<KnowledgeDocument?> GetWithChunksAsync(Guid id, CancellationToken ct = default);
}

public class KnowledgeDocumentRepository : Repository<KnowledgeDocument>, IKnowledgeDocumentRepository
{
    public KnowledgeDocumentRepository(ApplicationDbContext ctx, ILogger<KnowledgeDocumentRepository> logger) : base(ctx, logger) { }

    public async Task<KnowledgeDocument?> GetByHashAsync(string contentHash, CancellationToken ct = default)
        => await _dbSet.FirstOrDefaultAsync(d => d.ContentHash == contentHash, ct);

    public async Task<IEnumerable<KnowledgeDocument>> GetByClientAsync(Guid clientSystemId, int limit = 500, CancellationToken ct = default)
        => await _dbSet
            .Where(d => d.ClientSystemId == clientSystemId)
            .OrderByDescending(d => d.CreatedAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<IEnumerable<KnowledgeDocument>> GetApprovedPublicAsync(int limit = 500, CancellationToken ct = default)
        => await _dbSet
            .Where(d => d.IsApproved && d.IsPublic)
            .OrderByDescending(d => d.UpdatedAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<IEnumerable<KnowledgeDocument>> SearchByTitleAsync(string query, int limit = 20, CancellationToken ct = default)
        => await _dbSet
            .Where(d => EF.Functions.ILike(d.Title, $"%{query}%"))
            .Take(limit)
            .ToListAsync(ct);

    public async Task<KnowledgeDocument?> GetWithChunksAsync(Guid id, CancellationToken ct = default)
        => await _dbSet
            .Include(d => d.Chunks.OrderBy(c => c.ChunkIndex))
            .FirstOrDefaultAsync(d => d.Id == id, ct);
}

public interface IKnowledgeChunkRepository : IRepository<KnowledgeChunk>
{
    Task<IEnumerable<KnowledgeChunk>> GetByDocumentAsync(Guid documentId, CancellationToken ct = default);
    Task<IReadOnlyList<(KnowledgeChunk Chunk, double Score)>> SearchByEmbeddingAsync(float[] embedding, Guid? clientSystemId = null, int topK = 8, double minScore = 0.3, CancellationToken ct = default);
}

public class KnowledgeChunkRepository : Repository<KnowledgeChunk>, IKnowledgeChunkRepository
{
    public KnowledgeChunkRepository(ApplicationDbContext ctx, ILogger<KnowledgeChunkRepository> logger) : base(ctx, logger) { }

    public async Task<IEnumerable<KnowledgeChunk>> GetByDocumentAsync(Guid documentId, CancellationToken ct = default)
        => await _dbSet
            .Where(c => c.DocumentId == documentId)
            .OrderBy(c => c.ChunkIndex)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<(KnowledgeChunk Chunk, double Score)>> SearchByEmbeddingAsync(float[] embedding, Guid? clientSystemId = null, int topK = 8, double minScore = 0.3, CancellationToken ct = default)
    {
        var vectorLiteral = ToPgVector(embedding);
        var results = new List<(KnowledgeChunk, double)>();

        var sql = new StringBuilder();
        sql.AppendLine("""
            SELECT c.id,
                   1 - (c.embedding <=> @vec::vector) AS score
            FROM knowledge_chunks c
            JOIN knowledge_documents d ON d.id = c.document_id
            WHERE d.is_deleted = false
              AND d.is_approved = true
              AND c.embedding IS NOT NULL
            """);

        if (clientSystemId.HasValue)
            sql.AppendLine("  AND (d.client_system_id = @clientId OR d.is_public = true)");

        sql.AppendLine("  AND (d.client_system_id IS NULL OR d.is_public = true OR d.client_system_id = @clientId)");
        sql.AppendLine("ORDER BY c.embedding <=> @vec::vector");
        sql.AppendLine("LIMIT @topK;");

        using var cmd = _context.Database.GetDbConnection().CreateCommand();
        cmd.CommandText = sql.ToString();

        var pVec = cmd.CreateParameter();
        pVec.ParameterName = "@vec";
        pVec.Value = vectorLiteral;
        cmd.Parameters.Add(pVec);

        var pTopK = cmd.CreateParameter();
        pTopK.ParameterName = "@topK";
        pTopK.Value = topK;
        cmd.Parameters.Add(pTopK);

        var pClient = cmd.CreateParameter();
        pClient.ParameterName = "@clientId";
        pClient.Value = (object?)clientSystemId ?? DBNull.Value;
        cmd.Parameters.Add(pClient);

        await _context.Database.OpenConnectionAsync(ct);
        try
        {
            using var reader = await cmd.ExecuteReaderAsync(ct);
            var ids = new List<(Guid Id, double Score)>();

            while (await reader.ReadAsync(ct))
            {
                var id = reader.GetGuid(0);
                var score = reader.GetDouble(1);
                if (score < minScore) continue;
                ids.Add((id, score));
            }

            if (ids.Count == 0) return results;

            var chunkIds = ids.Select(x => x.Id).ToList();
            var chunks = await _dbSet
                .Include(c => c.Document)
                .Where(c => chunkIds.Contains(c.Id))
                .ToListAsync(ct);

            var scoreLookup = ids.ToDictionary(x => x.Id, x => x.Score);
            foreach (var c in chunks)
                results.Add((c, scoreLookup[c.Id]));

            return results.OrderByDescending(r => r.Item2).ToList();
        }
        finally
        {
            await _context.Database.CloseConnectionAsync();
        }
    }

    private static string ToPgVector(float[] embedding)
    {
        var sb = new StringBuilder(embedding.Length * 8);
        sb.Append('[');
        for (int i = 0; i < embedding.Length; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append(embedding[i].ToString("R", System.Globalization.CultureInfo.InvariantCulture));
        }
        sb.Append(']');
        return sb.ToString();
    }
}

public interface IKnowledgeCollectionRepository : IRepository<KnowledgeCollection>
{
    Task<KnowledgeCollection?> GetByKeyAsync(string key, CancellationToken ct = default);
    Task<KnowledgeCollection?> GetWithItemsAsync(Guid id, CancellationToken ct = default);
    Task<IEnumerable<KnowledgeCollection>> GetActiveAsync(CancellationToken ct = default);
    Task AddItemAsync(Guid collectionId, Guid documentId, CancellationToken ct = default);
    Task RemoveItemAsync(Guid collectionId, Guid documentId, CancellationToken ct = default);
}

public class KnowledgeCollectionRepository : Repository<KnowledgeCollection>, IKnowledgeCollectionRepository
{
    public KnowledgeCollectionRepository(ApplicationDbContext ctx, ILogger<KnowledgeCollectionRepository> logger) : base(ctx, logger) { }

    public async Task<KnowledgeCollection?> GetByKeyAsync(string key, CancellationToken ct = default)
        => await _dbSet.FirstOrDefaultAsync(c => c.Key == key, ct);

    public async Task<KnowledgeCollection?> GetWithItemsAsync(Guid id, CancellationToken ct = default)
        => await _dbSet
            .Include(c => c.Items)
            .ThenInclude(i => i.Document)
            .FirstOrDefaultAsync(c => c.Id == id, ct);

    public async Task<IEnumerable<KnowledgeCollection>> GetActiveAsync(CancellationToken ct = default)
        => await _dbSet.Where(c => c.IsActive).ToListAsync(ct);

    public async Task AddItemAsync(Guid collectionId, Guid documentId, CancellationToken ct = default)
    {
        var exists = await _context.Set<KnowledgeCollectionItem>()
            .AnyAsync(i => i.CollectionId == collectionId && i.DocumentId == documentId, ct);
        if (exists) return;

        await _context.Set<KnowledgeCollectionItem>().AddAsync(new KnowledgeCollectionItem
        {
            CollectionId = collectionId,
            DocumentId = documentId
        }, ct);
        await _context.SaveChangesAsync(ct);
    }

    public async Task RemoveItemAsync(Guid collectionId, Guid documentId, CancellationToken ct = default)
    {
        var item = await _context.Set<KnowledgeCollectionItem>()
            .FirstOrDefaultAsync(i => i.CollectionId == collectionId && i.DocumentId == documentId, ct);
        if (item == null) return;
        _context.Set<KnowledgeCollectionItem>().Remove(item);
        await _context.SaveChangesAsync(ct);
    }
}
