import { Octokit } from '@octokit/rest'
import type { Endpoints } from '@octokit/types'
import { Prisma } from '@prisma/client'
import axios from 'axios'
import prisma from '@/lib/prisma'
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

// Repository overview data for dashboard
export interface RepositoryOverview {
  id: number
  name: string
  fullName: string
  owner: string
  description: string | null
  htmlUrl: string
  homepage: string | null
  isPrivate: boolean
  isFork: boolean
  isArchived: boolean
  isTemplate: boolean
  stargazersCount: number
  forksCount: number
  watchersCount: number
  openIssuesCount: number
  size: number
  language: string | null
  languages: Record<string, number> | null
  topics: string[]
  licenseName: string | null
  licenseKey: string | null
  githubCreatedAt: Date
  githubUpdatedAt: Date
  githubPushedAt: Date | null
  lastSyncedAt: Date
}

// Real-time statistics
export interface RealtimeStats {
  stargazersCount: number
  forksCount: number
  watchersCount: number
  openIssuesCount: number
}

// Traffic views data from GitHub API (14 days only)
export interface TrafficViewsData {
  count: number // Total views
  uniques: number // Unique visitors
  views: {
    timestamp: string // ISO date string
    count: number
    uniques: number
  }[]
}

// Traffic clones data from GitHub API (14 days only)
export interface TrafficClonesData {
  count: number // Total clones
  uniques: number // Unique cloners
  clones: {
    timestamp: string // ISO date string
    count: number
    uniques: number
  }[]
}

// Traffic referrers data from GitHub API (14 days only)
export interface TrafficReferrer {
  referrer: string
  count: number
  uniques: number
}

// Traffic paths data from GitHub API (14 days only)
export interface TrafficPath {
  path: string
  title: string
  count: number
  uniques: number
}

// Stargazer with timestamp (requires special Accept header)
export interface StargazerWithTimestamp {
  starred_at: string
  user: {
    login: string
    id: number
    avatar_url: string
    html_url: string
  }
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

  /**
   * Fetch complete repository overview data
   * Combines repo metadata, languages, and topics
   */
  async getRepositoryOverview(owner: string, repo: string): Promise<RepositoryOverview> {
    const cacheKey = `repo:overview:${owner}/${repo}`
    const CACHE_TTL = 300 // 5 minutes for overview data

    // Try to get from Redis cache
    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        console.log(`Cache hit for repository overview: ${owner}/${repo}`)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return JSON.parse(cached as string)
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    // Fetch from GitHub API
    const [repoData, languagesData] = await Promise.all([
      this.octokit.repos.get({ owner, repo }),
      this.octokit.repos.listLanguages({ owner, repo }),
    ])

    const overview: RepositoryOverview = {
      id: repoData.data.id,
      name: repoData.data.name,
      fullName: repoData.data.full_name,
      owner: repoData.data.owner.login,
      description: repoData.data.description,
      htmlUrl: repoData.data.html_url,
      homepage: repoData.data.homepage,
      isPrivate: repoData.data.private,
      isFork: repoData.data.fork,
      isArchived: repoData.data.archived,
      isTemplate: repoData.data.is_template ?? false,
      stargazersCount: repoData.data.stargazers_count,
      forksCount: repoData.data.forks_count,
      watchersCount: repoData.data.watchers_count,
      openIssuesCount: repoData.data.open_issues_count,
      size: repoData.data.size,
      language: repoData.data.language,
      languages: Object.keys(languagesData.data).length > 0 ? languagesData.data : null,
      topics: repoData.data.topics ?? [],
      licenseName: repoData.data.license?.name ?? null,
      licenseKey: repoData.data.license?.key ?? null,
      githubCreatedAt: new Date(repoData.data.created_at),
      githubUpdatedAt: new Date(repoData.data.updated_at),
      githubPushedAt: repoData.data.pushed_at ? new Date(repoData.data.pushed_at) : null,
      lastSyncedAt: new Date(),
    }

    // Cache in Redis
    try {
      await redis.set(cacheKey, JSON.stringify(overview), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache repository overview:', error)
    }

    // Save to database
    try {
      await prisma.repository.upsert({
        where: { id: overview.id },
        create: {
          id: overview.id,
          name: overview.name,
          fullName: overview.fullName,
          owner: overview.owner,
          description: overview.description,
          htmlUrl: overview.htmlUrl,
          homepage: overview.homepage,
          isPrivate: overview.isPrivate,
          isFork: overview.isFork,
          isArchived: overview.isArchived,
          isTemplate: overview.isTemplate,
          stargazersCount: overview.stargazersCount,
          forksCount: overview.forksCount,
          watchersCount: overview.watchersCount,
          openIssuesCount: overview.openIssuesCount,
          size: overview.size,
          language: overview.language,
          languages: overview.languages ?? Prisma.JsonNull,
          topics: overview.topics,
          licenseName: overview.licenseName,
          licenseKey: overview.licenseKey,
          githubCreatedAt: overview.githubCreatedAt,
          githubUpdatedAt: overview.githubUpdatedAt,
          githubPushedAt: overview.githubPushedAt,
          lastSyncedAt: new Date(),
        },
        update: {
          name: overview.name,
          fullName: overview.fullName,
          owner: overview.owner,
          description: overview.description,
          htmlUrl: overview.htmlUrl,
          homepage: overview.homepage,
          isPrivate: overview.isPrivate,
          isFork: overview.isFork,
          isArchived: overview.isArchived,
          isTemplate: overview.isTemplate,
          stargazersCount: overview.stargazersCount,
          forksCount: overview.forksCount,
          watchersCount: overview.watchersCount,
          openIssuesCount: overview.openIssuesCount,
          size: overview.size,
          language: overview.language,
          languages: overview.languages ?? Prisma.JsonNull,
          topics: overview.topics,
          licenseName: overview.licenseName,
          licenseKey: overview.licenseKey,
          githubCreatedAt: overview.githubCreatedAt,
          githubUpdatedAt: overview.githubUpdatedAt,
          githubPushedAt: overview.githubPushedAt,
          lastSyncedAt: new Date(),
        },
      })

      // Save historical snapshot
      await prisma.repositoryStats.create({
        data: {
          repositoryId: overview.id,
          stargazersCount: overview.stargazersCount,
          forksCount: overview.forksCount,
          watchersCount: overview.watchersCount,
          openIssuesCount: overview.openIssuesCount,
        },
      })
    } catch (err) {
      const error = err as Error
      console.error('Failed to save repository overview to database:', error.message)
    }

    return overview
  }

  /**
   * Get real-time statistics (stars, forks, watchers)
   * These are cached in Redis with short TTL for real-time updates
   */
  async getRealtimeStats(owner: string, repo: string): Promise<RealtimeStats> {
    const cacheKey = `repo:stats:${owner}/${repo}`
    const CACHE_TTL = 60 // 1 minute for real-time stats

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as RealtimeStats
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    const { data } = await this.octokit.repos.get({ owner, repo })

    const stats: RealtimeStats = {
      stargazersCount: data.stargazers_count,
      forksCount: data.forks_count,
      watchersCount: data.watchers_count,
      openIssuesCount: data.open_issues_count,
    }

    try {
      await redis.set(cacheKey, JSON.stringify(stats), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache realtime stats:', error)
    }

    return stats
  }

  /**
   * Get traffic views data (14 days only)
   * ⚠️ GitHub only retains 14 days of traffic data
   * @see https://docs.github.com/en/rest/metrics/traffic
   */
  async getTrafficViews(owner: string, repo: string): Promise<TrafficViewsData> {
    const cacheKey = `repo:traffic:views:${owner}/${repo}`
    const CACHE_TTL = 3600 // 1 hour cache

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as TrafficViewsData
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    const { data } = await this.octokit.repos.getViews({ owner, repo })

    const trafficData: TrafficViewsData = {
      count: data.count,
      uniques: data.uniques,
      views: data.views.map((view) => ({
        timestamp: view.timestamp,
        count: view.count,
        uniques: view.uniques,
      })),
    }

    try {
      await redis.set(cacheKey, JSON.stringify(trafficData), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache traffic views:', error)
    }

    return trafficData
  }

  /**
   * Get traffic clones data (14 days only)
   * ⚠️ GitHub only retains 14 days of traffic data
   * @see https://docs.github.com/en/rest/metrics/traffic
   */
  async getTrafficClones(owner: string, repo: string): Promise<TrafficClonesData> {
    const cacheKey = `repo:traffic:clones:${owner}/${repo}`
    const CACHE_TTL = 3600 // 1 hour cache

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as TrafficClonesData
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    const { data } = await this.octokit.repos.getClones({ owner, repo })

    const trafficData: TrafficClonesData = {
      count: data.count,
      uniques: data.uniques,
      clones: data.clones.map((clone) => ({
        timestamp: clone.timestamp,
        count: clone.count,
        uniques: clone.uniques,
      })),
    }

    try {
      await redis.set(cacheKey, JSON.stringify(trafficData), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache traffic clones:', error)
    }

    return trafficData
  }

  /**
   * Get top referrers (14 days only)
   * @see https://docs.github.com/en/rest/metrics/traffic
   */
  async getTopReferrers(owner: string, repo: string): Promise<TrafficReferrer[]> {
    const cacheKey = `repo:traffic:referrers:${owner}/${repo}`
    const CACHE_TTL = 3600 // 1 hour cache

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return JSON.parse(cached as string)
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    const { data } = await this.octokit.repos.getTopReferrers({ owner, repo })

    const referrers: TrafficReferrer[] = data.map((ref) => ({
      referrer: ref.referrer,
      count: ref.count,
      uniques: ref.uniques,
    }))

    try {
      await redis.set(cacheKey, JSON.stringify(referrers), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache traffic referrers:', error)
    }

    return referrers
  }

  /**
   * Get top paths (14 days only)
   * @see https://docs.github.com/en/rest/metrics/traffic
   */
  async getTopPaths(owner: string, repo: string): Promise<TrafficPath[]> {
    const cacheKey = `repo:traffic:paths:${owner}/${repo}`
    const CACHE_TTL = 3600 // 1 hour cache

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return JSON.parse(cached as string)
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    const { data } = await this.octokit.repos.getTopPaths({ owner, repo })

    const paths: TrafficPath[] = data.map((p) => ({
      path: p.path,
      title: p.title,
      count: p.count,
      uniques: p.uniques,
    }))

    try {
      await redis.set(cacheKey, JSON.stringify(paths), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache traffic paths:', error)
    }

    return paths
  }

  /**
   * Get stargazers with timestamps
   * ⚠️ Limited to 40,000 stars (400 pages × 100 per page)
   * Requires special Accept header
   * @see https://docs.github.com/en/rest/activity/starring
   */
  async getStargazersWithTimestamps(
    owner: string,
    repo: string,
    page = 1,
    perPage = 100
  ): Promise<StargazerWithTimestamp[]> {
    const { data } = await this.octokit.request('GET /repos/{owner}/{repo}/stargazers', {
      owner,
      repo,
      per_page: perPage,
      page,
      headers: {
        accept: 'application/vnd.github.star+json',
      },
    })

    return data as StargazerWithTimestamp[]
  }
}
