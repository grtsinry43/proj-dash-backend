import { Octokit } from '@octokit/rest'
import type { Endpoints } from '@octokit/types'
import axios from 'axios'
import { redis } from '@/lib/redis'
import type { GitHubUser } from '@/types/github'

const GITHUB_API_BASE_URL = 'https://api.github.com'

// Define a type for the repository list response data for clarity
type ReposListForAuthenticatedUserResponse = Endpoints['GET /user/repos']['response']['data']

export async function exchangeCodeForToken(code: string): Promise<string> {
  const response = await axios.post(
    'https://github.com/login/oauth/access_token',
    {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    },
    {
      headers: { Accept: 'application/json' },
    }
  )

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-member-access
  return response.data?.access_token
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
    const cachedRepos = await redis.get(cacheKey)

    if (cachedRepos) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return JSON.parse(cachedRepos as string)
    }

    const { data } = await this.octokit.repos.listForAuthenticatedUser()
    await redis.set(cacheKey, JSON.stringify(data), { ex: 3600 }) // Cache for 1 hour

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
