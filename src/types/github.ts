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
    full_name: string
    description: string | null
    html_url: string
    homepage: string | null
    private: boolean
    fork: boolean
    archived: boolean
    is_template?: boolean
    stargazers_count: number
    forks_count: number
    watchers_count: number
    open_issues_count: number
    size: number
    language: string | null
    topics?: string[]
    license?: {
      key: string
      name: string
    } | null
    created_at: string
    updated_at: string
    pushed_at: string | null
    owner: {
      login: string
    }
  }
}
