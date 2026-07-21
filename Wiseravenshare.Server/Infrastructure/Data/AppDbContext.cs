using Microsoft.EntityFrameworkCore;

namespace Wiseravenshare.Server.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Post> Posts => Set<Post>();
    public DbSet<Video> Videos => Set<Video>();
    public DbSet<TruthClaim> TruthClaims => Set<TruthClaim>();
    public DbSet<AIAgent> Agents => Set<AIAgent>();
    public DbSet<Follow> UserFollows => Set<Follow>();
    public DbSet<PostLike> PostLikes => Set<PostLike>();
    public DbSet<PostRepost> PostReposts => Set<PostRepost>();
    public DbSet<PostBookmark> PostBookmarks => Set<PostBookmark>();
    public DbSet<AgentEvolution> AgentEvolutions => Set<AgentEvolution>();
    public DbSet<AgentInteraction> AgentInteractions => Set<AgentInteraction>();
    public DbSet<UserSubscription> UserSubscriptions => Set<UserSubscription>();
    public DbSet<TruthClaim.TruthDispute> TruthDisputes => Set<TruthClaim.TruthDispute>();
    public DbSet<TruthClaim.TruthVerificationVote> TruthVerificationVotes => Set<TruthClaim.TruthVerificationVote>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Follow>(entity =>
        {
            entity.HasOne(f => f.Follower)
                .WithMany(u => u.Following)
                .HasForeignKey(f => f.FollowerId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(f => f.Following)
                .WithMany(u => u.Followers)
                .HasForeignKey(f => f.FollowingId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(f => new { f.FollowerId, f.FollowingId })
                .IsUnique();
        });

        modelBuilder.Entity<Post>(entity =>
        {
            entity.HasOne(p => p.User)
                .WithMany(u => u.Posts)
                .HasForeignKey(p => p.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(p => p.ReplyTo)
                .WithMany()
                .HasForeignKey(p => p.ReplyToId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(p => p.RepostOf)
                .WithMany()
                .HasForeignKey(p => p.RepostOfId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(p => p.QuoteOf)
                .WithMany()
                .HasForeignKey(p => p.QuoteOfId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Comment>(entity =>
        {
            entity.HasOne(c => c.Post)
                .WithMany(p => p.Comments)
                .HasForeignKey(c => c.PostId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(c => c.User)
                .WithMany()
                .HasForeignKey(c => c.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(c => c.ParentComment)
                .WithMany(c => c.Replies)
                .HasForeignKey(c => c.ParentCommentId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Message>(entity =>
        {
            entity.HasOne(m => m.ReplyTo)
                .WithMany(m => m.Replies)
                .HasForeignKey(m => m.ReplyToId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<VideoComment>(entity =>
        {
            entity.HasOne(c => c.ParentComment)
                .WithMany(c => c.Replies)
                .HasForeignKey(c => c.ParentCommentId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<UserSettings>(entity =>
        {
            entity.HasOne<User>()
                .WithOne(u => u.Settings)
                .HasForeignKey<UserSettings>(s => s.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(s => s.UserId)
                .IsUnique();
        });

        modelBuilder.Entity<UserSubscription>(entity =>
        {
            entity.HasOne(s => s.User)
                .WithMany()
                .HasForeignKey(s => s.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(s => s.UserId)
                .IsUnique();

            entity.HasIndex(s => s.StripeCustomerId)
                .IsUnique();

            entity.HasIndex(s => s.StripeSubscriptionId)
                .HasFilter("\"StripeSubscriptionId\" IS NOT NULL")
                .IsUnique();
        });

        modelBuilder.Entity<TruthClaim.TruthDispute>(entity =>
        {
            entity.HasOne(d => d.User)
                .WithMany()
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(d => d.Resolver)
                .WithMany()
                .HasForeignKey(d => d.ResolvedBy)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(d => d.Post)
                .WithMany()
                .HasForeignKey(d => d.PostId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<TruthClaim.TruthVerificationVote>(entity =>
        {
            entity.HasOne(v => v.User)
                .WithMany()
                .HasForeignKey(v => v.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(v => v.Claim)
                .WithMany(c => c.Votes)
                .HasForeignKey(v => v.ClaimId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AIAgent>(entity =>
        {
            entity.HasMany(a => a.Interactions)
                .WithOne(i => i.Agent)
                .HasForeignKey(i => i.AgentId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(a => a.Evolutions)
                .WithOne(e => e.Agent)
                .HasForeignKey(e => e.AgentId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AgentInteraction>(entity =>
        {
            entity.HasOne(i => i.TargetAgent)
                .WithMany()
                .HasForeignKey(i => i.TargetAgentId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(i => i.TargetUser)
                .WithMany()
                .HasForeignKey(i => i.TargetUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AgentEvolution>();
    }
}
