import { Octokit } from '@octokit/rest'
import { redis } from '@/lib/redis'

// Activity timeline types
export interface CommitActivity {
  sha: string
  message: string
  author: {
    name: string
    email: string
    date: string
    avatar?: string
  }
  committer: {
    name: string
    date: string
  }
  url: string
}

export interface PullRequestActivity {
  number: number
  title: string
  state: string
  user: {
    login: string
    avatar_url: string
  }
  created_at: string
  updated_at: string
  merged_at: string | null
  html_url: string
}

export interface IssueActivity {
  number: number
  title: string
  state: string
  user: {
    login: string
    avatar_url: string
  }
  created_at: string
  updated_at: string
  closed_at: string | null
  html_url: string
  labels: {
    name: string
    color: string
  }[]
}

export interface CommitActivityStats {
  days: number[] // 7 days, 0 = Sunday
  total: number
  week: number // Unix timestamp
}

export interface ContributorStats {
  author: {
    login: string
    avatar_url: string
  }
  total: number
  weeks: {
    w: number // Week timestamp
    a: number // Additions
    d: number // Deletions
    c: number // Commits
  }[]
}

export class ActivityService {
  private octokit: Octokit

  constructor(accessToken: string, _username: string) {
    this.octokit = new Octokit({ auth: accessToken })
  }

  /**
   * Get recent commits for activity timeline
   */
  async getRecentCommits(owner: string, repo: string, per_page = 30): Promise<CommitActivity[]> {
    const cacheKey = `repo:commits:${owner}/${repo}:${String(per_page)}`
    const CACHE_TTL = 300 // 5 minutes

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as CommitActivity[]
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    const { data } = await this.octokit.repos.listCommits({
      owner,
      repo,
      per_page,
    })

    const commits: CommitActivity[] = data.map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: {
        name: commit.commit.author?.name ?? 'Unknown',
        email: commit.commit.author?.email ?? '',
        date: commit.commit.author?.date ?? '',
        avatar: commit.author?.avatar_url,
      },
      committer: {
        name: commit.commit.committer?.name ?? 'Unknown',
        date: commit.commit.committer?.date ?? '',
      },
      url: commit.html_url,
    }))

    try {
      await redis.set(cacheKey, JSON.stringify(commits), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache commits:', error)
    }

    return commits
  }

  /**
   * Get recent pull requests for activity timeline
   */
  async getRecentPullRequests(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'all',
    per_page = 30
  ): Promise<PullRequestActivity[]> {
    const cacheKey = `repo:prs:${owner}/${repo}:${state}:${String(per_page)}`
    const CACHE_TTL = 300 // 5 minutes

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as PullRequestActivity[]
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    const { data } = await this.octokit.pulls.list({
      owner,
      repo,
      state,
      per_page,
      sort: 'updated',
      direction: 'desc',
    })

    const pullRequests: PullRequestActivity[] = data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      user: {
        login: pr.user?.login ?? 'Unknown',
        avatar_url: pr.user?.avatar_url ?? '',
      },
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      merged_at: pr.merged_at,
      html_url: pr.html_url,
    }))

    try {
      await redis.set(cacheKey, JSON.stringify(pullRequests), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache pull requests:', error)
    }

    return pullRequests
  }

  /**
   * Get recent issues for activity timeline
   */
  async getRecentIssues(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'all',
    per_page = 30
  ): Promise<IssueActivity[]> {
    const cacheKey = `repo:issues:${owner}/${repo}:${state}:${String(per_page)}`
    const CACHE_TTL = 300 // 5 minutes

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as IssueActivity[]
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    const { data } = await this.octokit.issues.listForRepo({
      owner,
      repo,
      state,
      per_page,
      sort: 'updated',
      direction: 'desc',
    })

    // Filter out pull requests (GitHub API returns both issues and PRs)
    const issues: IssueActivity[] = data
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        user: {
          login: issue.user?.login ?? 'Unknown',
          avatar_url: issue.user?.avatar_url ?? '',
        },
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        closed_at: issue.closed_at,
        html_url: issue.html_url,
        labels: issue.labels.map((label) => ({
          name: typeof label === 'string' ? label : (label.name ?? ''),
          color: typeof label === 'string' ? '' : (label.color ?? ''),
        })),
      }))

    try {
      await redis.set(cacheKey, JSON.stringify(issues), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache issues:', error)
    }

    return issues
  }

  /**
   * Get commit activity statistics (weekly commit activity)
   * ⚠️ Only available for repositories with < 10,000 commits
   * ⚠️ First request returns 202, need to retry
   */
  async getCommitActivityStats(owner: string, repo: string): Promise<CommitActivityStats[]> {
    const cacheKey = `repo:commit-activity:${owner}/${repo}`
    const CACHE_TTL = 3600 // 1 hour (GitHub caches this data)

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as CommitActivityStats[]
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    // GitHub returns 202 on first request, need to retry
    const maxRetries = 3
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        const response = await this.octokit.repos.getCommitActivityStats({ owner, repo })

        if (response.status === 200 && response.data.length > 0) {
          const stats = response.data as CommitActivityStats[]

          try {
            await redis.set(cacheKey, JSON.stringify(stats), { ex: CACHE_TTL })
          } catch (error) {
            console.warn('Failed to cache commit activity stats:', error)
          }

          return stats
        }

        // If 202, wait and retry
        if (response.status === 202 && retry < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          continue
        }
      } catch (error) {
        console.error('Error fetching commit activity stats:', error)
        throw error
      }
    }

    throw new Error('Failed to fetch commit activity stats after retries')
  }

  /**
   * Get contributor statistics
   * ⚠️ Only available for repositories with < 10,000 commits
   * ⚠️ First request returns 202, need to retry
   */
  async getContributorStats(owner: string, repo: string): Promise<ContributorStats[]> {
    const cacheKey = `repo:contributor-stats:${owner}/${repo}`
    const CACHE_TTL = 3600 // 1 hour (GitHub caches this data)

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as ContributorStats[]
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    // GitHub returns 202 on first request, need to retry
    const maxRetries = 3
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        const response = await this.octokit.repos.getContributorsStats({ owner, repo })

        if (response.status === 200 && response.data.length > 0) {
          const stats: ContributorStats[] = response.data.map((contributor) => ({
            author: {
              login: contributor.author?.login ?? 'Unknown',
              avatar_url: contributor.author?.avatar_url ?? '',
            },
            total: contributor.total,
            weeks: contributor.weeks.map((week) => ({
              w: week.w ?? 0,
              a: week.a ?? 0,
              d: week.d ?? 0,
              c: week.c ?? 0,
            })),
          }))

          try {
            await redis.set(cacheKey, JSON.stringify(stats), { ex: CACHE_TTL })
          } catch (error) {
            console.warn('Failed to cache contributor stats:', error)
          }

          return stats
        }

        // If 202, wait and retry
        if (response.status === 202 && retry < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          continue
        }
      } catch (error) {
        console.error('Error fetching contributor stats:', error)
        throw error
      }
    }

    throw new Error('Failed to fetch contributor stats after retries')
  }
}
