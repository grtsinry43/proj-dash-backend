/**
 * Represents the user data structure returned from the GitHub API.
 */
export interface GitHubUser {
  id: number
  login: string
  name: string | null
  avatar_url: string
}

/**
 * A generic type for the GitHub webhook payload.
 * The actual structure varies widely depending on the event type.
 */
export interface GitHubWebhookPayload {
  action: string
  pull_request: {
    number: number
    title: string
    state: string
    user: {
      id: number
      login: string
      avatar_url: string
    }
    created_at: string
    closed_at: string | null
  }
  repository: {
    id: number
    name: string
    owner: {
      login: string
    }
  }
}
