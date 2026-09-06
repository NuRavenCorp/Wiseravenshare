using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.Collaboration;
using Wiseravenshare.Server.Entities.Currency;
using Wiseravenshare.Server.Entities.Roles;
using UserRole = Wiseravenshare.Server.Entities.Roles.UserRole;

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
    public DbSet<UserSettings> UserSettings => Set<UserSettings>();
    public DbSet<TruthClaim.TruthDispute> TruthDisputes => Set<TruthClaim.TruthDispute>();
    public DbSet<TruthClaim.TruthVerificationVote> TruthVerificationVotes => Set<TruthClaim.TruthVerificationVote>();
    public DbSet<SocialCrossPost> SocialCrossPosts => Set<SocialCrossPost>();
    public DbSet<InstrumentConnection> InstrumentConnections => Set<InstrumentConnection>();
    public DbSet<StudioCaptureRigProfile> StudioCaptureRigProfiles => Set<StudioCaptureRigProfile>();
    public DbSet<StudioCaptureSourceCapture> StudioCaptureSourceCaptures => Set<StudioCaptureSourceCapture>();
    public DbSet<MediaItem> MediaItems => Set<MediaItem>();
    public DbSet<MediaTag> MediaTags => Set<MediaTag>();
    public DbSet<MediaItemTag> MediaItemTags => Set<MediaItemTag>();
    public DbSet<MediaComment> MediaComments => Set<MediaComment>();
    public DbSet<MediaPlaylist> MediaPlaylists => Set<MediaPlaylist>();
    public DbSet<MediaPlaylistItem> MediaPlaylistItems => Set<MediaPlaylistItem>();
    public DbSet<MediaViewHistory> MediaViewHistories => Set<MediaViewHistory>();
    public DbSet<MediaLike> MediaLikes => Set<MediaLike>();
    public DbSet<MediaBookmark> MediaBookmarks => Set<MediaBookmark>();
    public DbSet<WiseCoin> WiseCoins => Set<WiseCoin>();
    public DbSet<CoinTransaction> CoinTransactions => Set<CoinTransaction>();
    public DbSet<CoinStake> CoinStakes => Set<CoinStake>();
    public DbSet<Wiseravenshare.Server.Services.Currency.LedgerAnchor> LedgerAnchors => Set<Wiseravenshare.Server.Services.Currency.LedgerAnchor>();
    public DbSet<Badge> Badges => Set<Badge>();
    public DbSet<UserBadge> UserBadges => Set<UserBadge>();
    public DbSet<BadgeEvolution> BadgeEvolutions => Set<BadgeEvolution>();
    public DbSet<WorkHourValuation> WorkHourValuations => Set<WorkHourValuation>();
    public DbSet<WorkHourContribution> WorkHourContributions => Set<WorkHourContribution>();

    // Communique
    public DbSet<Wiseravenshare.Server.Entities.Communique.CallLog> CallLogs => Set<Wiseravenshare.Server.Entities.Communique.CallLog>();
    public DbSet<Wiseravenshare.Server.Entities.Communique.CommunicationPreferences> CommunicationPreferences => Set<Wiseravenshare.Server.Entities.Communique.CommunicationPreferences>();
    public DbSet<Wiseravenshare.Server.Entities.Communique.NotificationCost> NotificationCosts => Set<Wiseravenshare.Server.Entities.Communique.NotificationCost>();

    // Collaboration
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ProjectMember> ProjectMembers => Set<ProjectMember>();
    public DbSet<ProjectContent> ProjectContents => Set<ProjectContent>();
    public DbSet<ProjectContentVersion> ProjectContentVersions => Set<ProjectContentVersion>();
    public DbSet<CollaborationInvite> CollaborationInvites => Set<CollaborationInvite>();
    public DbSet<ProjectComment> ProjectComments => Set<ProjectComment>();
    public DbSet<ProjectActivity> ProjectActivities => Set<ProjectActivity>();
    public DbSet<PlatformPublish> PlatformPublishes => Set<PlatformPublish>();

    // Roles
    public DbSet<Wiseravenshare.Server.Entities.Roles.UserRole> UserRoles => Set<Wiseravenshare.Server.Entities.Roles.UserRole>();
    public DbSet<UserRoleAssignment> UserRoleAssignments => Set<UserRoleAssignment>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.ConfigureCurrency();

        modelBuilder.HasDefaultSchema("app_data");

        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("Users");
            entity.HasIndex(u => u.Email).IsUnique();
            entity.HasIndex(u => u.Username).IsUnique();
            entity.Property(u => u.Email).HasMaxLength(255);
            entity.Property(u => u.Username).HasMaxLength(100);
            entity.Property(u => u.DisplayName).HasMaxLength(200);
            entity.Property(u => u.Bio).HasColumnType("text");
            entity.Property(u => u.AvatarUrl).HasColumnType("text");
            entity.Property(u => u.CoverPhotoUrl).HasColumnType("text");
            entity.Property(u => u.Location).HasMaxLength(200);
            entity.Property(u => u.Website).HasMaxLength(2048);
            entity.Property(u => u.RefreshToken).HasMaxLength(512);
            entity.Property(u => u.PasswordResetToken).HasMaxLength(512);
        });

        modelBuilder.Entity<UserSettings>(entity =>
        {
            entity.ToTable("UserSettings");
            entity.Property(s => s.Theme).HasMaxLength(50);
        });

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

        modelBuilder.Entity<PostLike>(entity =>
        {
            entity.HasIndex(x => new { x.PostId, x.UserId })
                .IsUnique();
        });

        modelBuilder.Entity<PostRepost>(entity =>
        {
            entity.HasIndex(x => new { x.PostId, x.UserId })
                .IsUnique();
        });

        modelBuilder.Entity<PostBookmark>(entity =>
        {
            entity.HasIndex(x => new { x.PostId, x.UserId })
                .IsUnique();
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

        modelBuilder.Entity<SocialCrossPost>(entity =>
        {
            entity.ToTable("SocialCrossPosts");
            entity.Property(c => c.Platform).HasMaxLength(30);
            entity.Property(c => c.Status).HasMaxLength(20);
            entity.Property(c => c.ErrorMessage).HasColumnType("text");
            entity.HasIndex(c => new { c.PostId, c.Platform }).IsUnique();
            entity.HasIndex(c => c.UserId);

            entity.HasOne(c => c.Post)
                .WithMany()
                .HasForeignKey(c => c.PostId)
                .OnDelete(DeleteBehavior.Cascade);
        });

            modelBuilder.Entity<InstrumentConnection>(entity =>
            {
                entity.ToTable("InstrumentConnections");
                entity.Property(c => c.DeviceIdentifier).HasMaxLength(120);
                entity.Property(c => c.DeviceName).HasMaxLength(255);
                entity.Property(c => c.Transport).HasMaxLength(40);
                entity.Property(c => c.HardwareAddress).HasMaxLength(120);
                entity.Property(c => c.MetadataJson).HasColumnType("text");
                entity.HasIndex(c => c.UserId);
                entity.HasIndex(c => new { c.UserId, c.DeviceIdentifier }).IsUnique();

                entity.HasOne(c => c.User)
                .WithMany()
                .HasForeignKey(c => c.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<StudioCaptureRigProfile>(entity =>
            {
                entity.ToTable("StudioCaptureRigProfiles");
                entity.Property(c => c.RigName).HasMaxLength(150);
                entity.Property(c => c.Notes).HasMaxLength(1200);
                entity.HasIndex(c => c.UserId).IsUnique();
                entity.HasOne(c => c.User)
                    .WithMany()
                    .HasForeignKey(c => c.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<StudioCaptureSourceCapture>(entity =>
            {
                entity.ToTable("StudioCaptureSourceCaptures");
                entity.Property(c => c.SourceType).HasMaxLength(30);
                entity.Property(c => c.SourceName).HasMaxLength(255);
                entity.Property(c => c.DeviceIdentifier).HasMaxLength(255);
                entity.Property(c => c.FileName).HasMaxLength(255);
                entity.Property(c => c.FingerprintHash).HasMaxLength(128);
                entity.Property(c => c.MetadataJson).HasColumnType("text");
                entity.HasIndex(c => c.UserId);
                entity.HasIndex(c => c.CapturedAtUtc);
                entity.HasOne(c => c.User)
                    .WithMany()
                    .HasForeignKey(c => c.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(c => c.RigProfile)
                    .WithMany()
                    .HasForeignKey(c => c.RigProfileId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<MediaItem>(entity =>
            {
                entity.ToTable("MediaItems");
                entity.Property(x => x.Title).HasMaxLength(255);
                entity.Property(x => x.Description).HasMaxLength(2000);
                entity.Property(x => x.FileName).HasMaxLength(255);
                entity.Property(x => x.FilePath).HasMaxLength(2048);
                entity.Property(x => x.FileUrl).HasMaxLength(2048);
                entity.Property(x => x.MimeType).HasMaxLength(255);
                entity.Property(x => x.ThumbnailPath).HasMaxLength(2048);
                entity.Property(x => x.ThumbnailUrl).HasMaxLength(2048);
                entity.Property(x => x.PreviewPath).HasMaxLength(2048);
                entity.Property(x => x.PreviewUrl).HasMaxLength(2048);
                entity.Property(x => x.Metadata).HasColumnType("jsonb");
                entity.HasIndex(x => x.UserId);
                entity.HasIndex(x => new { x.MediaType, x.Status });
                entity.HasIndex(x => x.CreatedAt);
                entity.HasOne(x => x.User)
                    .WithMany()
                    .HasForeignKey(x => x.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<MediaTag>(entity =>
            {
                entity.ToTable("MediaTags");
                entity.Property(x => x.Name).HasMaxLength(100);
                entity.Property(x => x.Description).HasMaxLength(500);
                entity.HasIndex(x => x.Name).IsUnique();
            });

            modelBuilder.Entity<MediaItemTag>(entity =>
            {
                entity.ToTable("MediaItemTags");
                entity.HasIndex(x => new { x.MediaId, x.TagId }).IsUnique();
                entity.HasOne(x => x.MediaItem)
                    .WithMany(x => x.Tags)
                    .HasForeignKey(x => x.MediaId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(x => x.MediaTag)
                    .WithMany(x => x.MediaItems)
                    .HasForeignKey(x => x.TagId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<MediaComment>(entity =>
            {
                entity.ToTable("MediaComments");
                entity.Property(x => x.Content).HasMaxLength(2000);
                entity.HasIndex(x => x.MediaId);
                entity.HasIndex(x => x.UserId);
                entity.HasOne(x => x.MediaItem)
                    .WithMany(x => x.Comments)
                    .HasForeignKey(x => x.MediaId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(x => x.User)
                    .WithMany()
                    .HasForeignKey(x => x.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(x => x.ParentComment)
                    .WithMany(x => x.Replies)
                    .HasForeignKey(x => x.ParentCommentId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<MediaPlaylist>(entity =>
            {
                entity.ToTable("MediaPlaylists");
                entity.Property(x => x.Name).HasMaxLength(255);
                entity.Property(x => x.Description).HasMaxLength(500);
                entity.Property(x => x.CoverImageUrl).HasMaxLength(2048);
                entity.HasIndex(x => x.UserId);
                entity.HasOne(x => x.User)
                    .WithMany()
                    .HasForeignKey(x => x.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<MediaPlaylistItem>(entity =>
            {
                entity.ToTable("MediaPlaylistItems");
                entity.HasIndex(x => new { x.PlaylistId, x.MediaId }).IsUnique();
                entity.HasIndex(x => new { x.PlaylistId, x.OrderIndex });
                entity.HasOne(x => x.Playlist)
                    .WithMany(x => x.Items)
                    .HasForeignKey(x => x.PlaylistId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(x => x.MediaItem)
                    .WithMany(x => x.PlaylistItems)
                    .HasForeignKey(x => x.MediaId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<MediaViewHistory>(entity =>
            {
                entity.ToTable("MediaViewHistories");
                entity.Property(x => x.DeviceInfo).HasMaxLength(256);
                entity.Property(x => x.IPAddress).HasMaxLength(80);
                entity.HasIndex(x => new { x.MediaId, x.UserId, x.ViewedAt });
                entity.HasOne(x => x.MediaItem)
                    .WithMany()
                    .HasForeignKey(x => x.MediaId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(x => x.User)
                    .WithMany()
                    .HasForeignKey(x => x.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<MediaLike>(entity =>
            {
                entity.ToTable("MediaLikes");
                entity.HasIndex(x => new { x.MediaId, x.UserId }).IsUnique();
                entity.HasOne(x => x.MediaItem)
                    .WithMany()
                    .HasForeignKey(x => x.MediaId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(x => x.User)
                    .WithMany()
                    .HasForeignKey(x => x.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<MediaBookmark>(entity =>
            {
                entity.ToTable("MediaBookmarks");
                entity.HasIndex(x => new { x.MediaId, x.UserId }).IsUnique();
                entity.HasOne(x => x.MediaItem)
                    .WithMany()
                    .HasForeignKey(x => x.MediaId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(x => x.User)
                    .WithMany()
                    .HasForeignKey(x => x.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

        // ── Communique ──
        modelBuilder.Entity<Wiseravenshare.Server.Entities.Communique.CallLog>(entity =>
        {
            entity.ToTable("CallLogs");
            entity.HasIndex(c => c.UserId);
            entity.HasIndex(c => c.Timestamp);
        });

        modelBuilder.Entity<Wiseravenshare.Server.Entities.Communique.CommunicationPreferences>(entity =>
        {
            entity.ToTable("CommunicationPreferences");
            entity.HasIndex(cp => cp.UserId).IsUnique();
            entity.Property(cp => cp.PreferredChannel).HasMaxLength(20);
            entity.Property(cp => cp.VerifiedPhoneNumber).HasMaxLength(20);
            entity.HasOne(cp => cp.User)
                .WithOne()
                .HasForeignKey<Wiseravenshare.Server.Entities.Communique.CommunicationPreferences>(cp => cp.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Wiseravenshare.Server.Entities.Communique.NotificationCost>(entity =>
        {
            entity.ToTable("NotificationCosts");
            entity.Property(nc => nc.NotificationType).HasMaxLength(20);
            entity.Property(nc => nc.PhoneNumber).HasMaxLength(20);
            entity.Property(nc => nc.DeliveryStatus).HasMaxLength(20);
            entity.Property(nc => nc.TwilioSid).HasMaxLength(255);
            entity.Property(nc => nc.CostUsd).HasPrecision(10, 6);
            entity.HasIndex(nc => nc.UserId);
            entity.HasIndex(nc => nc.SentAt);
            entity.HasIndex(nc => nc.NotificationType);
            entity.HasOne(nc => nc.User)
                .WithMany()
                .HasForeignKey(nc => nc.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ── Collaboration ──
        modelBuilder.Entity<Project>(entity =>
        {
            entity.HasIndex(p => p.OwnerId);
            entity.HasOne(p => p.Owner)
                .WithMany()
                .HasForeignKey(p => p.OwnerId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ProjectMember>(entity =>
        {
            entity.HasIndex(m => new { m.ProjectId, m.UserId });
            entity.HasOne(m => m.Project)
                .WithMany(p => p.Members)
                .HasForeignKey(m => m.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(m => m.User)
                .WithMany()
                .HasForeignKey(m => m.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ProjectContent>(entity =>
        {
            entity.HasIndex(c => c.ProjectId);
            entity.HasOne(c => c.Project)
                .WithMany(p => p.Content)
                .HasForeignKey(c => c.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ProjectContentVersion>(entity =>
        {
            entity.HasIndex(v => v.ContentId);
        });

        modelBuilder.Entity<CollaborationInvite>(entity =>
        {
            entity.HasIndex(i => new { i.ProjectId, i.InviteeEmail });
            entity.HasOne(i => i.Project)
                .WithMany(p => p.Invites)
                .HasForeignKey(i => i.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ProjectComment>(entity =>
        {
            entity.HasIndex(c => c.ProjectId);
            entity.HasOne(c => c.Project)
                .WithMany(p => p.Comments)
                .HasForeignKey(c => c.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(c => c.User)
                .WithMany()
                .HasForeignKey(c => c.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ProjectActivity>(entity =>
        {
            entity.HasIndex(a => a.ProjectId);
            entity.HasOne(a => a.Project)
                .WithMany(p => p.Activities)
                .HasForeignKey(a => a.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PlatformPublish>(entity =>
        {
            entity.HasIndex(p => p.ContentId);
            entity.HasOne(p => p.Project)
                .WithMany(p => p.Publications)
                .HasForeignKey(p => p.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(p => p.Content)
                .WithMany()
                .HasForeignKey(p => p.ContentId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ── Roles ──
        modelBuilder.Entity<Entities.Roles.UserRole>(entity =>
        {
            entity.HasIndex(r => r.Name).IsUnique();
        });

        modelBuilder.Entity<UserRoleAssignment>(entity =>
        {
            entity.HasIndex(a => a.UserId);
            entity.HasOne(a => a.User)
                .WithMany()
                .HasForeignKey(a => a.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(a => a.Role)
                .WithMany(r => r.Assignments)
                .HasForeignKey(a => a.RoleId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<RolePermission>(entity =>
        {
            entity.HasIndex(p => p.RoleId);
            entity.HasOne(p => p.Role)
                .WithMany(r => r.RolePermissions)
                .HasForeignKey(p => p.RoleId)
                .OnDelete(DeleteBehavior.Cascade);

            // Composite index for permission checks (UserId → RoleIds → ResourceType/Action)
            entity.HasIndex(p => new { p.RoleId, p.ResourceType, p.Action });
        });

        // Role hierarchy (ParentRole self-reference)
        modelBuilder.Entity<UserRole>(entity =>
        {
            entity.HasOne(r => r.ParentRole)
                .WithMany(r => r.ChildRoles)
                .HasForeignKey("ParentRoleId")
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Role assignments scoped per project (null = global)
        modelBuilder.Entity<UserRoleAssignment>(entity =>
        {
            entity.HasIndex(a => new { a.UserId, a.RoleId, a.ProjectId });
            entity.HasOne(a => a.AssignedBy)
                .WithMany()
                .HasForeignKey(a => a.AssignedById)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }
}
