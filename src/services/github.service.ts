import { Octokit } from '@octokit/rest'
import type { Endpoints } from '@octokit/types'
import axios from 'axios'
import { redis } from '@/lib/redis'
import type { GitHubUser } from '@/types/github'

const GITHUB_API_BASE_URL = 'https://api.github.com'

// Define a type for the repository list response data for clarity
type ReposListForAuthenticatedUserResponse = Endpoints['GET /user/repos']['response']['data']

// GitHub OAuth token response type
interface GitHubTokenResponse {
  access_token: string
  token_type: string
  scope: string
  error?: string
  error_description?: string
}

/**
 * Exchange GitHub OAuth code for access token
 * Works with both OAuth Apps and GitHub Apps (user-to-server flow)
 * @see https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
 */
export async function exchangeCodeForToken(code: string): Promise<string> {
  console.log('Exchanging code for token...')
  console.log('Client ID:', process.env['GITHUB_APP_CLIENT_ID'])
  console.log('Code:', code.substring(0, 10) + '...')

  const response = await axios.post<GitHubTokenResponse>(
    'https://github.com/login/oauth/access_token',
    {
      client_id: process.env['GITHUB_APP_CLIENT_ID'],
      client_secret: process.env['GITHUB_APP_CLIENT_SECRET'],
      code,
    },
    {
      headers: { Accept: 'application/json' },
    }
  )

  console.log('GitHub OAuth response status:', response.status)
  console.log('GitHub OAuth response data:', response.data)

  // Check for errors in the response
  if (response.data.error) {
    throw new Error(
      `GitHub OAuth error: ${response.data.error} - ${response.data.error_description ?? ''}`
    )
  }

  if (!response.data.access_token) {
    console.error('GitHub OAuth response:', response.data)
    throw new Error('No access token received from GitHub')
  }

  return response.data.access_token
}

export async function getGithubUser(accessToken: string): Promise<GitHubUser> {
  const response = await axios.get<GitHubUser>(`${GITHUB_API_BASE_URL}/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  return response.data
}

export class GitHubService {
  private octokit: Octokit
  private username: string

  constructor(accessToken: string, username: string) {
    this.octokit = new Octokit({ auth: accessToken })
    this.username = username
  }

  async getRepositories(): Promise<ReposListForAuthenticatedUserResponse> {
    const cacheKey = `repos:${this.username}`

    // Try to get from cache, but don't fail if Redis is unavailable
    try {
      const cachedRepos = await redis.get(cacheKey)
      if (cachedRepos) {
        console.log('Cache hit for repositories')
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return JSON.parse(cachedRepos as string)
      }
    } catch (error) {
      console.warn('Redis cache unavailable, fetching from GitHub API directly:', error)
    }

    const { data } = await this.octokit.repos.listForAuthenticatedUser()

    // Try to cache, but don't fail if Redis is unavailable
    try {
      await redis.set(cacheKey, JSON.stringify(data), { ex: 3600 }) // Cache for 1 hour
    } catch (error) {
      console.warn('Failed to cache repositories:', error)
    }

    return data
  }

  async getRepositoryStats(owner: string, repo: string, since?: string) {
    const [repoData, commits, releases, contributors] = await Promise.all([
      this.octokit.repos.get({ owner, repo }),
      this.octokit.repos.listCommits({ owner, repo, since }),
      this.octokit.repos.listReleases({ owner, repo }),
      this.octokit.repos.listContributors({ owner, repo }),
    ])

    const stats = {
      stars: repoData.data.stargazers_count,
      forks: repoData.data.forks_count,
      openIssues: repoData.data.open_issues_count,
      commits: commits.data.length,
      releases: releases.data.length,
      contributors: contributors.data.length,
    }

    return stats
  }
}
