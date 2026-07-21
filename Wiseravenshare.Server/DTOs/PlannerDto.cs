// Wiseravenshare.Server/DTOs/Planner/GoalDto.cs
using System.ComponentModel.DataAnnotations;

namespace Wiseravenshare.Server.DTOs.Planner
{

    public class GoalDto
    {
        public Guid Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string Type { get; set; } = "LongTerm";
        public string Priority { get; set; } = "Medium";
        public string Status { get; set; } = "Active";
        public decimal Progress { get; set; }
        public DateTime? DueDate { get; set; }
        public DateTime? CompletedAt { get; set; }
        public DateTime CreatedAt { get; set; }
        public List<GoalDto> SubGoals { get; set; } = new();
        public List<TaskDto> Tasks { get; set; } = new();
    }

    public class CreateGoalDto
    {
        [Required]
        [MaxLength(255)]
        public string Title { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string? Description { get; set; }

        public string Type { get; set; } = "LongTerm";
        public string Priority { get; set; } = "Medium";
        public DateTime? DueDate { get; set; }
        public Guid? ParentGoalId { get; set; }
    }

    public class TaskDto
    {
        public Guid Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string Priority { get; set; } = "Medium";
        public string Status { get; set; } = "Pending";
        public string Column { get; set; } = "Day";
        public DateTime? DueDate { get; set; }
        public decimal? EstimatedHours { get; set; }
        public decimal? ActualHours { get; set; }
        public int TimeSpent { get; set; }
        public int OrderIndex { get; set; }
        public DateTime? CompletedAt { get; set; }
        public DateTime CreatedAt { get; set; }
        public List<TaskDto> Dependencies { get; set; } = new();
    }

    public class CreateTaskDto
    {
        [Required]
        [MaxLength(255)]
        public string Title { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string? Description { get; set; }

        public string Priority { get; set; } = "Medium";
        public string Column { get; set; } = "Day";
        public DateTime? DueDate { get; set; }
        public decimal? EstimatedHours { get; set; }
        public Guid? GoalId { get; set; }
        public List<Guid>? DependencyIds { get; set; }
    }

    public class UpdateTaskDto
    {
        [MaxLength(255)]
        public string? Title { get; set; }

        [MaxLength(1000)]
        public string? Description { get; set; }

        public string? Priority { get; set; }
        public string? Status { get; set; }
        public string? Column { get; set; }
        public DateTime? DueDate { get; set; }
        public decimal? EstimatedHours { get; set; }
        public int? TimeSpent { get; set; }
    }
}