namespace WiseRavenShare.Server.Entities.Assistant;

public enum AssistantChannel { Web, Mobile, Voice, Widget, Extension }

public enum AssistantPersona
{
    Default,
    Professional,
    Friendly,
    Concise,
    Creative,
    Technical,
    Educator
}

public enum AssistantRole { System, User, Assistant, Tool }

public enum AssistantMessageStatus { Streaming, Complete, Failed, Blocked }

public enum FeedbackVote { None, ThumbUp, ThumbDown }

public enum LearningSampleSource
{
    UserFeedback,
    ChatterObservation,
    WebContent,
    ManualSeed,
    AutoCurated
}

public enum LearningSampleStatus
{
    Pending,
    Approved,
    Rejected,
    UsedInTraining
}
