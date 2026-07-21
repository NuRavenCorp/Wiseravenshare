// Wiseravenshare.Server/Entities/Goal.cs
namespace Wiseravenshare.Server.Entities
{ 

public class Goal : BaseEntity
{
    public Guid UserId { get; set; }
    public GoalType Type { get; set; }

    [MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    public PriorityLevel Priority { get; set; } = PriorityLevel.Medium;
    public GoalStatus Status { get; set; } = GoalStatus.Active;
    public decimal Progress { get; set; } // 0-100
    public DateTime? DueDate { get; set; }
    public DateTime? CompletedAt { get; set; }
    public Guid? ParentGoalId { get; set; }

    // Navigation Properties
    public virtual User User { get; set; } = null!;
    public virtual Goal? ParentGoal { get; set; }
    public virtual ICollection<Goal> SubGoals { get; set; } = new List<Goal>();
    public virtual ICollection<Task> Tasks { get; set; } = new List<Task>();
}

public enum GoalType
{
    LongTerm,
    ShortTerm,
    NextAction
}

public enum GoalStatus
{
    Active,
    Completed,
    Archived,
    Cancelled
}

public class Task : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid? GoalId { get; set; }

    [MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    public PriorityLevel Priority { get; set; } = PriorityLevel.Medium;
    public TaskStatus Status { get; set; } = TaskStatus.Pending;
    public TaskColumn Column { get; set; } = TaskColumn.Day;
    public DateTime? DueDate { get; set; }
    public decimal? EstimatedHours { get; set; }
    public decimal? ActualHours { get; set; }
    public int TimeSpent { get; set; } // in minutes
    public int OrderIndex { get; set; }
    public DateTime? CompletedAt { get; set; }

    // Navigation Properties
    public virtual User User { get; set; } = null!;
    public virtual Goal? Goal { get; set; }
    public virtual ICollection<TaskDependency> Dependencies { get; set; } = new List<TaskDependency>();
    public virtual ICollection<TaskDependency> DependedUpon { get; set; } = new List<TaskDependency>();
}

public enum PriorityLevel
{
    Low,
    Medium,
    High,
    Urgent
}

public enum TaskStatus
{
    Pending,
    InProgress,
    Completed,
    Blocked
}

public enum TaskColumn
{
    Day,
    Week,
    Month
}

public class TaskDependency : BaseEntity
{
    public Guid TaskId { get; set; }
    public Guid DependsOnId { get; set; }

    // Navigation Properties
    public virtual Task Task { get; set; } = null!;
    public virtual Task DependsOn { get; set; } = null!;
    }
}