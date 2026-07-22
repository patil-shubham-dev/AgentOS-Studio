import type { TaskTemplate } from "./scheduled-task-types"

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    action: "code_review",
    name: "Daily Code Review",
    description: "Review recent changes and suggest improvements",
    defaultCron: "0 9 * * 1-5",
    icon: "code",
  },
  {
    action: "dependency_audit",
    name: "Weekly Dependency Audit",
    description: "Check for outdated/deprecated dependencies",
    defaultCron: "0 10 * * 1",
    icon: "package",
  },
  {
    action: "security_scan",
    name: "Monthly Security Scan",
    description: "Scan for security vulnerabilities",
    defaultCron: "0 10 1 * *",
    icon: "shield",
  },
  {
    action: "memory_consolidation",
    name: "Memory Consolidation",
    description: "Consolidate and optimize session memory",
    defaultCron: "0 */6 * * *",
    icon: "brain",
  },
  {
    action: "performance_report",
    name: "Performance Report",
    description: "Generate system performance metrics report",
    defaultCron: "0 8 * * 1",
    icon: "activity",
  },
]
