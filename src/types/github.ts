/**
 * Represents the user data structure returned from the GitHub API.
 */
export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}

/**
 * A generic type for the GitHub webhook payload.
 * The actual structure varies widely depending on the event type.
 */
export type GitHubWebhookPayload = Record<string, any>;
