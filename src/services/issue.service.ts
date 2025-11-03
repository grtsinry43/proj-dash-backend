import { Octokit } from '@octokit/rest'
import { redis } from '@/lib/redis'

// Issue data
export interface Issue {
  id: number
  number: number
  title: string
  state: string
  user: {
    login: string
    avatar_url: string
  }
  labels: {
    name: string
    color: string
    description?: string
  }[]
  created_at: string
  updated_at: string
  closed_at: string | null
  html_url: string
  comments: number
  body?: string
}

// Pull request data
export interface PullRequest {
  id: number
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
  closed_at: string | null
  html_url: string
  draft: boolean
  mergeable_state?: string
  labels: {
    name: string
    color: string
  }[]
}

// Label data
export interface Label {
  id: number
  name: string
  color: string
  description?: string
  count?: number
}

// Issue/PR statistics
export interface IssueStats {
  total: number
  open: number
  closed: number
  avgClosedDays?: number
  avgFirstResponseHours?: number
}

export interface PullRequestStats {
  total: number
  open: number
  closed: number
  merged: number
  draft: number
  avgMergedDays?: number
}

// Response time metrics
export interface ResponseTimeMetrics {
  avgFirstResponseHours: number
  avgClosedDays: number
  medianClosedDays: number
  issuesWithResponse: number
  totalIssues: number
}

export class IssueService {
  private octokit: Octokit

  constructor(accessToken: string, _username: string) {
    this.octokit = new Octokit({ auth: accessToken })
  }

  /**
   * Get issues (excludes pull requests by default)
   */
  async getIssues(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'all',
    per_page = 30
  ): Promise<Issue[]> {
    const cacheKey = `repo:issues:${owner}/${repo}:${state}:${String(per_page)}`
    const CACHE_TTL = 300 // 5 minutes

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as Issue[]
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

    // Filter out pull requests
    const issues: Issue[] = data
      .filter((item) => !item.pull_request)
      .map((item) => ({
        id: item.id,
        number: item.number,
        title: item.title,
        state: item.state,
        user: {
          login: item.user?.login ?? 'Unknown',
          avatar_url: item.user?.avatar_url ?? '',
        },
        labels: item.labels.map((label) => ({
          name: typeof label === 'string' ? label : (label.name ?? ''),
          color: typeof label === 'string' ? '' : (label.color ?? ''),
          description: typeof label === 'string' ? undefined : (label.description ?? undefined),
        })),
        created_at: item.created_at,
        updated_at: item.updated_at,
        closed_at: item.closed_at,
        html_url: item.html_url,
        comments: item.comments,
        body: item.body ?? undefined,
      }))

    try {
      await redis.set(cacheKey, JSON.stringify(issues), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache issues:', error)
    }

    return issues
  }

  /**
   * Get pull requests
   */
  async getPullRequests(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'all',
    per_page = 30
  ): Promise<PullRequest[]> {
    const cacheKey = `repo:prs:${owner}/${repo}:${state}:${String(per_page)}`
    const CACHE_TTL = 300 // 5 minutes

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as PullRequest[]
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

    const pullRequests: PullRequest[] = data.map((pr) => ({
      id: pr.id,
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
      closed_at: pr.closed_at,
      html_url: pr.html_url,
      draft: pr.draft ?? false,
      mergeable_state: undefined,
      labels: pr.labels.map((label) => ({
        name: typeof label === 'string' ? label : label.name,
        color: typeof label === 'string' ? '' : label.color,
      })),
    }))

    try {
      await redis.set(cacheKey, JSON.stringify(pullRequests), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache pull requests:', error)
    }

    return pullRequests
  }

  /**
   * Get repository labels
   */
  async getLabels(owner: string, repo: string): Promise<Label[]> {
    const cacheKey = `repo:labels:${owner}/${repo}`
    const CACHE_TTL = 1800 // 30 minutes

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as Label[]
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    const { data } = await this.octokit.issues.listLabelsForRepo({
      owner,
      repo,
      per_page: 100,
    })

    const labels: Label[] = data.map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
      description: label.description ?? undefined,
    }))

    try {
      await redis.set(cacheKey, JSON.stringify(labels), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache labels:', error)
    }

    return labels
  }

  /**
   * Get issue statistics
   */
  async getIssueStats(owner: string, repo: string): Promise<IssueStats> {
    const cacheKey = `repo:issue-stats:${owner}/${repo}`
    const CACHE_TTL = 600 // 10 minutes

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as IssueStats
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    // Get repo basic info for total counts
    const { data: repoData } = await this.octokit.repos.get({ owner, repo })

    // Get recent closed issues for calculating averages
    const closedIssues = await this.getIssues(owner, repo, 'closed', 100)

    const stats: IssueStats = {
      total: repoData.open_issues_count + closedIssues.length,
      open: repoData.open_issues_count,
      closed: closedIssues.length,
    }

    // Calculate average closed time
    if (closedIssues.length > 0) {
      const closedDays = closedIssues
        .filter((issue) => issue.closed_at)
        .map((issue) => {
          const created = new Date(issue.created_at).getTime()
          const closed = new Date(issue.closed_at ?? '').getTime()
          return (closed - created) / (1000 * 60 * 60 * 24) // Convert to days
        })

      if (closedDays.length > 0) {
        stats.avgClosedDays = closedDays.reduce((a, b) => a + b, 0) / closedDays.length
      }
    }

    try {
      await redis.set(cacheKey, JSON.stringify(stats), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache issue stats:', error)
    }

    return stats
  }

  /**
   * Get pull request statistics
   */
  async getPullRequestStats(owner: string, repo: string): Promise<PullRequestStats> {
    const cacheKey = `repo:pr-stats:${owner}/${repo}`
    const CACHE_TTL = 600 // 10 minutes

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as PullRequestStats
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    // Get all PRs (open and closed)
    const [openPRs, closedPRs] = await Promise.all([
      this.getPullRequests(owner, repo, 'open', 100),
      this.getPullRequests(owner, repo, 'closed', 100),
    ])

    const allPRs = [...openPRs, ...closedPRs]
    const merged = allPRs.filter((pr) => pr.merged_at).length
    const draft = openPRs.filter((pr) => pr.draft).length

    const stats: PullRequestStats = {
      total: allPRs.length,
      open: openPRs.length,
      closed: closedPRs.length,
      merged,
      draft,
    }

    // Calculate average merged time
    const mergedPRs = allPRs.filter((pr) => pr.merged_at)
    if (mergedPRs.length > 0) {
      const mergedDays = mergedPRs.map((pr) => {
        const created = new Date(pr.created_at).getTime()
        const merged = new Date(pr.merged_at ?? '').getTime()
        return (merged - created) / (1000 * 60 * 60 * 24)
      })

      stats.avgMergedDays = mergedDays.reduce((a, b) => a + b, 0) / mergedDays.length
    }

    try {
      await redis.set(cacheKey, JSON.stringify(stats), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache PR stats:', error)
    }

    return stats
  }

  /**
   * Get response time metrics for issues
   */
  async getResponseTimeMetrics(owner: string, repo: string): Promise<ResponseTimeMetrics> {
    const cacheKey = `repo:response-metrics:${owner}/${repo}`
    const CACHE_TTL = 1800 // 30 minutes

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as ResponseTimeMetrics
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    const issues = await this.getIssues(owner, repo, 'all', 100)

    const responseTimesPromises = issues.map(async (issue) =>
      this.getFirstResponseTime(owner, repo, issue.number)
    )

    const responseTimes = await Promise.all(responseTimesPromises)

    const validResponseTimes = responseTimes.filter((time): time is number => time !== null)

    const closedIssues = issues.filter((issue) => issue.closed_at)
    const closedDays = closedIssues.map((issue) => {
      const created = new Date(issue.created_at).getTime()
      const closed = new Date(issue.closed_at ?? '').getTime()
      return (closed - created) / (1000 * 60 * 60 * 24)
    })

    const sortedClosedDays = [...closedDays].sort((a, b) => a - b)
    const medianIndex = Math.floor(sortedClosedDays.length / 2)

    let medianClosedDays = 0
    if (sortedClosedDays.length > 0) {
      if (sortedClosedDays.length % 2 === 0) {
        const mid1 = sortedClosedDays[medianIndex - 1]
        // eslint-disable-next-line security/detect-object-injection
        const mid2 = sortedClosedDays[medianIndex]
        if (mid1 !== undefined && mid2 !== undefined) {
          medianClosedDays = (mid1 + mid2) / 2
        }
      } else {
        // eslint-disable-next-line security/detect-object-injection
        medianClosedDays = sortedClosedDays[medianIndex] ?? 0
      }
    }

    const metrics: ResponseTimeMetrics = {
      avgFirstResponseHours:
        validResponseTimes.length > 0
          ? validResponseTimes.reduce((a, b) => a + b, 0) / validResponseTimes.length
          : 0,
      avgClosedDays:
        closedDays.length > 0 ? closedDays.reduce((a, b) => a + b, 0) / closedDays.length : 0,
      medianClosedDays,
      issuesWithResponse: validResponseTimes.length,
      totalIssues: issues.length,
    }

    try {
      await redis.set(cacheKey, JSON.stringify(metrics), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache response metrics:', error)
    }

    return metrics
  }

  /**
   * Get first response time for an issue (in hours)
   */
  private async getFirstResponseTime(
    owner: string,
    repo: string,
    issue_number: number
  ): Promise<number | null> {
    try {
      const { data: comments } = await this.octokit.issues.listComments({
        owner,
        repo,
        issue_number,
        per_page: 1,
        sort: 'created',
        direction: 'asc',
      })

      if (comments.length === 0) {
        return null
      }

      const firstComment = comments[0]
      if (!firstComment) {
        return null
      }

      const { data: issue } = await this.octokit.issues.get({
        owner,
        repo,
        issue_number,
      })

      const created = new Date(issue.created_at).getTime()
      const firstCommentTime = new Date(firstComment.created_at).getTime()
      return (firstCommentTime - created) / (1000 * 60 * 60) // Convert to hours
    } catch (error) {
      console.warn(`Failed to get first response time for issue #${String(issue_number)}:`, error)
      return null
    }
  }

  /**
   * Get label usage statistics
   */
  async getLabelStats(owner: string, repo: string): Promise<Label[]> {
    const labels = await this.getLabels(owner, repo)
    const issues = await this.getIssues(owner, repo, 'all', 100)

    // Count label usage
    const labelCounts = new Map<string, number>()

    for (const issue of issues) {
      for (const label of issue.labels) {
        const currentCount = labelCounts.get(label.name) ?? 0
        labelCounts.set(label.name, currentCount + 1)
      }
    }

    // Add counts to labels
    return labels
      .map((label) => ({
        ...label,
        count: labelCounts.get(label.name) ?? 0,
      }))
      .sort((a, b) => b.count - a.count)
  }
}
