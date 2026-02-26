/**
 * Represents the user data structure returned from the GitHub API.
 */
export interface GitHubUser {
  id: number
  login: string
  name: string | null
  avatar_url: string
}
