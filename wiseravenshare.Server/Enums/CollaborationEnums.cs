// Wiseravenshare.Server/Enums/CollaborationEnums.cs
namespace Wiseravenshare.Server.Enums;

public enum ProjectType
{
    Podcast,
    VideoSeries,
    ArticleSeries,
    Documentary,
    MusicProduction,
    ResearchProject,
    CommunityInitiative,
    LiveEvent,
    EducationalContent,
    NewsInvestigation,
    Interview
}

public enum ProjectStatus
{
    Draft,
    Planning,
    InProgress,
    Review,
    Published,
    Archived,
    Cancelled,
    OnHold
}

public enum ProjectVisibility
{
    Private,
    Team,
    Public,
    Unlisted
}

public enum RevenueShareModel
{
    Equal,
    ContributionBased,
    RoleBased,
    Custom,
    Weighted
}

public enum ProjectRole
{
    Owner,
    CoOwner,
    Editor,
    Contributor,
    Reviewer,
    Viewer
}

public enum ProjectRoleLevel
{
    Core,
    Senior,
    Junior,
    Guest
}

public enum ContentType
{
    Article,
    Video,
    Audio,
    Podcast,
    Image,
    Document,
    Script,
    Outline,
    Notes
}

public enum ContentStatus
{
    Draft,
    InReview,
    Approved,
    Published,
    Archived,
    Rejected
}

public enum InviteStatus
{
    Pending,
    Accepted,
    Declined,
    Expired,
    Cancelled
}

public enum ActivityType
{
    Created,
    Updated,
    MemberAdded,
    MemberRemoved,
    ContentAdded,
    ContentUpdated,
    ContentPublished,
    CommentAdded,
    Invited,
    StatusChanged
}

public enum SocialPlatform
{
    YouTube,
    TikTok,
    Facebook,
    Instagram,
    Twitter,
    Reddit,
    LinkedIn,
    Spotify,
    ApplePodcasts,
    GooglePodcasts,
    Twitch,
    Discord,
    Telegram,
    WhatsApp,
    Custom
}

public enum PublishStatus
{
    Pending,
    Processing,
    Scheduled,
    Published,
    Failed,
    Cancelled,
    Retrying
}

public enum RoleType
{
    Platform,
    Project,
    Content,
    Publishing,
    Administration
}

public enum RoleLevel
{
    Global,
    Platform,
    Project,
    Content
}

public enum PermissionAction
{
    Create,
    Read,
    Update,
    Delete,
    Publish,
    Administer,
    Moderate,
    Review,
    Approve,
    Share,
    Collaborate
}
