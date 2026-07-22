import type { ConnectorTemplate } from "./connector-types"

export const CONNECTOR_TEMPLATES: ConnectorTemplate[] = [
  {
    type: "github",
    name: "GitHub",
    description: "Issues, PRs, actions, code review",
    icon: "github",
    docsUrl: "https://docs.github.com/en/rest",
  },
  {
    type: "slack",
    name: "Slack",
    description: "Notifications, messages, channels",
    icon: "slack",
    docsUrl: "https://api.slack.com/docs",
  },
  {
    type: "linear",
    name: "Linear",
    description: "Issue tracking, project management",
    icon: "linear",
    docsUrl: "https://developers.linear.app/docs",
  },
]
