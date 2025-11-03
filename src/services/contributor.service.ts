import { Octokit } from '@octokit/rest'
import prisma from '@/lib/prisma'
import { redis } from '@/lib/redis'

// Contributor types
export interface ContributorInfo {
  githubId: number
  login: string
  avatarUrl: string
  htmlUrl: string
  type: string
  contributions: number
}

export interface ContributorDetail extends ContributorInfo {
  totalAdditions: number
  totalDeletions: number
  firstContributionAt: Date | null
  lastContributionAt: Date | null
  weeklyStats: WeeklyContributionStats[]
}

export interface WeeklyContributionStats {
  weekTimestamp: number
  additions: number
  deletions: number
  commits: number
}

// Contributor analysis result
export interface ContributorAnalysis {
  total: number
  coreContributors: ContributorInfo[] // Top contributors
  recentActiveCount: number // Active in last 30 days
  newContributorsCount: number // New contributors in last 90 days
  contributionDistribution: {
    top10Percent: number // Percentage of contributions by top 10%
    top50Percent: number
  }
}

// Individual contributor growth
export interface ContributorGrowth {
  login: string
  avatarUrl: string
  weeklyCommits: { week: number; count: number }[]
  totalCommits: number
  trend: 'increasing' | 'decreasing' | 'stable'
}

export class ContributorService {
  private octokit: Octokit

  constructor(accessToken: string, _username: string) {
    this.octokit = new Octokit({ auth: accessToken })
  }

  /**
   * Get basic contributor list
   * Returns simple contributor info with total contributions
   */
  async getContributorsList(owner: string, repo: string): Promise<ContributorInfo[]> {
    const cacheKey = `repo:contributors:list:${owner}/${repo}`
    const CACHE_TTL = 1800 // 30 minutes

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        console.info(`Cache hit for contributor list: ${owner}/${repo}`)
        return JSON.parse(cached as string) as ContributorInfo[]
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    // Fetch from GitHub API
    const { data } = await this.octokit.repos.listContributors({
      owner,
      repo,
      per_page: 100,
      anon: '0', // Exclude anonymous contributors
    })

    const contributors: ContributorInfo[] = data.map((contributor) => ({
      githubId: contributor.id ?? 0,
      login: contributor.login ?? 'unknown',
      avatarUrl: contributor.avatar_url ?? '',
      htmlUrl: contributor.html_url ?? '',
      type: contributor.type,
      contributions: contributor.contributions,
    }))

    // Cache result
    try {
      await redis.set(cacheKey, JSON.stringify(contributors), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache contributor list:', error)
    }

    // Save to database
    await this.saveContributorsToDatabase(owner, repo, contributors)

    return contributors
  }

  /**
   * Get detailed contributor statistics with weekly breakdown
   * ⚠️ Only available for repositories with < 10,000 commits
   */
  async getContributorStats(owner: string, repo: string): Promise<ContributorDetail[]> {
    const cacheKey = `repo:contributors:stats:${owner}/${repo}`
    const CACHE_TTL = 3600 // 1 hour

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        console.info(`Cache hit for contributor stats: ${owner}/${repo}`)
        return JSON.parse(cached as string) as ContributorDetail[]
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    // GitHub API may return 202 on first request
    const maxRetries = 3
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        const response = await this.octokit.repos.getContributorsStats({ owner, repo })

        if (response.status === 200 && response.data.length > 0) {
          const contributors: ContributorDetail[] = response.data.map((contributor) => {
            // Calculate first and last contribution dates
            const weeks = contributor.weeks.filter((w) => (w.c ?? 0) > 0)
            const firstWeek = weeks[0]
            const lastWeek = weeks[weeks.length - 1]

            return {
              githubId: contributor.author?.id ?? 0,
              login: contributor.author?.login ?? 'unknown',
              avatarUrl: contributor.author?.avatar_url ?? '',
              htmlUrl: contributor.author?.html_url ?? '',
              type: contributor.author?.type ?? 'User',
              contributions: contributor.total,
              totalAdditions: contributor.weeks.reduce((sum, w) => sum + (w.a ?? 0), 0),
              totalDeletions: contributor.weeks.reduce((sum, w) => sum + (w.d ?? 0), 0),
              firstContributionAt: firstWeek?.w ? new Date(firstWeek.w * 1000) : null,
              lastContributionAt: lastWeek?.w ? new Date(lastWeek.w * 1000) : null,
              weeklyStats: contributor.weeks.map((week) => ({
                weekTimestamp: week.w ?? 0,
                additions: week.a ?? 0,
                deletions: week.d ?? 0,
                commits: week.c ?? 0,
              })),
            }
          })

          // Cache result
          try {
            await redis.set(cacheKey, JSON.stringify(contributors), { ex: CACHE_TTL })
          } catch (error) {
            console.warn('Failed to cache contributor stats:', error)
          }

          // Save detailed stats to database
          await this.saveDetailedStatsToDatabase(owner, repo, contributors)

          return contributors
        }

        // If 202, wait and retry
        if (response.status === 202 && retry < maxRetries - 1) {
          console.info(`Waiting for GitHub to compute stats (attempt ${String(retry + 1)})...`)
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

  /**
   * Analyze contributor patterns
   * Returns insights about contributor diversity, activity, and growth
   */
  async analyzeContributors(owner: string, repo: string): Promise<ContributorAnalysis> {
    const cacheKey = `repo:contributors:analysis:${owner}/${repo}`
    const CACHE_TTL = 3600 // 1 hour

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        console.info(`Cache hit for contributor analysis: ${owner}/${repo}`)
        return JSON.parse(cached as string) as ContributorAnalysis
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    // Get detailed stats
    const contributors = await this.getContributorStats(owner, repo)

    // Sort by total contributions
    const sorted = [...contributors].sort((a, b) => b.contributions - a.contributions)

    // Calculate metrics
    const total = contributors.length
    const totalContributions = sorted.reduce((sum, c) => sum + c.contributions, 0)

    // Top contributors (top 20)
    const coreContributors: ContributorInfo[] = sorted.slice(0, 20).map((c) => ({
      githubId: c.githubId,
      login: c.login,
      avatarUrl: c.avatarUrl,
      htmlUrl: c.htmlUrl,
      type: c.type,
      contributions: c.contributions,
    }))

    // Recent active contributors (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recentActiveCount = contributors.filter(
      (c) => c.lastContributionAt && c.lastContributionAt >= thirtyDaysAgo
    ).length

    // New contributors (first contribution in last 90 days)
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const newContributorsCount = contributors.filter(
      (c) => c.firstContributionAt && c.firstContributionAt >= ninetyDaysAgo
    ).length

    // Contribution distribution (Pareto principle)
    const top10Count = Math.ceil(total * 0.1)
    const top50Count = Math.ceil(total * 0.5)

    const top10Contributions = sorted
      .slice(0, top10Count)
      .reduce((sum, c) => sum + c.contributions, 0)
    const top50Contributions = sorted
      .slice(0, top50Count)
      .reduce((sum, c) => sum + c.contributions, 0)

    const analysis: ContributorAnalysis = {
      total,
      coreContributors,
      recentActiveCount,
      newContributorsCount,
      contributionDistribution: {
        top10Percent: totalContributions > 0 ? (top10Contributions / totalContributions) * 100 : 0,
        top50Percent: totalContributions > 0 ? (top50Contributions / totalContributions) * 100 : 0,
      },
    }

    // Cache result
    try {
      await redis.set(cacheKey, JSON.stringify(analysis), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache contributor analysis:', error)
    }

    return analysis
  }

  /**
   * Get individual contributor details
   */
  async getContributorDetail(
    owner: string,
    repo: string,
    username: string
  ): Promise<ContributorDetail | null> {
    const cacheKey = `repo:contributor:detail:${owner}/${repo}:${username}`
    const CACHE_TTL = 1800 // 30 minutes

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as ContributorDetail
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    // Get all contributor stats
    const allContributors = await this.getContributorStats(owner, repo)

    // Find specific contributor
    const contributor = allContributors.find(
      (c) => c.login.toLowerCase() === username.toLowerCase()
    )

    if (!contributor) {
      return null
    }

    // Cache result
    try {
      await redis.set(cacheKey, JSON.stringify(contributor), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache contributor detail:', error)
    }

    return contributor
  }

  /**
   * Get contributor growth trends
   * Returns weekly commit activity for visualization
   */
  async getContributorGrowth(
    owner: string,
    repo: string,
    limit = 10
  ): Promise<ContributorGrowth[]> {
    const contributors = await this.getContributorStats(owner, repo)

    // Get top contributors
    const topContributors = contributors
      .sort((a, b) => b.contributions - a.contributions)
      .slice(0, limit)

    const growth: ContributorGrowth[] = topContributors.map((contributor) => {
      // Filter weeks with commits
      const activeWeeks = contributor.weeklyStats
        .filter((w) => w.commits > 0)
        .map((w) => ({
          week: w.weekTimestamp,
          count: w.commits,
        }))

      // Calculate trend (simple moving average comparison)
      const trend = this.calculateTrend(activeWeeks)

      return {
        login: contributor.login,
        avatarUrl: contributor.avatarUrl,
        weeklyCommits: activeWeeks,
        totalCommits: contributor.contributions,
        trend,
      }
    })

    return growth
  }

  /**
   * Calculate contribution trend
   */
  private calculateTrend(
    weeklyData: { week: number; count: number }[]
  ): 'increasing' | 'decreasing' | 'stable' {
    if (weeklyData.length < 4) {
      return 'stable'
    }

    // Compare first half vs second half
    const midPoint = Math.floor(weeklyData.length / 2)
    const firstHalf = weeklyData.slice(0, midPoint)
    const secondHalf = weeklyData.slice(midPoint)

    const firstAvg = firstHalf.reduce((sum, w) => sum + w.count, 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((sum, w) => sum + w.count, 0) / secondHalf.length

    const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100

    if (changePercent > 20) return 'increasing'
    if (changePercent < -20) return 'decreasing'
    return 'stable'
  }

  /**
   * Save basic contributor info to database
   */
  private async saveContributorsToDatabase(
    owner: string,
    repo: string,
    contributors: ContributorInfo[]
  ): Promise<void> {
    try {
      // Get repository ID
      const repository = await prisma.repository.findUnique({
        where: { fullName: `${owner}/${repo}` },
      })

      if (!repository) {
        console.warn(`Repository ${owner}/${repo} not found in database`)
        return
      }

      // Upsert each contributor
      for (const contributor of contributors) {
        await prisma.contributor.upsert({
          where: {
            repositoryId_githubId: {
              repositoryId: repository.id,
              githubId: contributor.githubId,
            },
          },
          create: {
            repositoryId: repository.id,
            githubId: contributor.githubId,
            login: contributor.login,
            avatarUrl: contributor.avatarUrl,
            htmlUrl: contributor.htmlUrl,
            type: contributor.type,
            totalContributions: contributor.contributions,
          },
          update: {
            login: contributor.login,
            avatarUrl: contributor.avatarUrl,
            htmlUrl: contributor.htmlUrl,
            type: contributor.type,
            totalContributions: contributor.contributions,
            lastSyncedAt: new Date(),
          },
        })
      }

      console.info(`Saved ${String(contributors.length)} contributors to database`)
    } catch (error) {
      console.error('Failed to save contributors to database:', error)
    }
  }

  /**
   * Save detailed contributor stats to database
   */
  private async saveDetailedStatsToDatabase(
    owner: string,
    repo: string,
    contributors: ContributorDetail[]
  ): Promise<void> {
    try {
      const repository = await prisma.repository.findUnique({
        where: { fullName: `${owner}/${repo}` },
      })

      if (!repository) {
        console.warn(`Repository ${owner}/${repo} not found in database`)
        return
      }

      // Upsert each contributor with detailed stats
      for (const contributor of contributors) {
        const dbContributor = await prisma.contributor.upsert({
          where: {
            repositoryId_githubId: {
              repositoryId: repository.id,
              githubId: contributor.githubId,
            },
          },
          create: {
            repositoryId: repository.id,
            githubId: contributor.githubId,
            login: contributor.login,
            avatarUrl: contributor.avatarUrl,
            htmlUrl: contributor.htmlUrl,
            type: contributor.type,
            totalContributions: contributor.contributions,
            totalAdditions: contributor.totalAdditions,
            totalDeletions: contributor.totalDeletions,
            firstContributionAt: contributor.firstContributionAt,
            lastContributionAt: contributor.lastContributionAt,
          },
          update: {
            login: contributor.login,
            avatarUrl: contributor.avatarUrl,
            htmlUrl: contributor.htmlUrl,
            totalContributions: contributor.contributions,
            totalAdditions: contributor.totalAdditions,
            totalDeletions: contributor.totalDeletions,
            firstContributionAt: contributor.firstContributionAt,
            lastContributionAt: contributor.lastContributionAt,
            lastSyncedAt: new Date(),
          },
        })

        // Save weekly stats
        for (const weekStat of contributor.weeklyStats) {
          if (weekStat.commits > 0) {
            await prisma.contributorWeeklyStats.upsert({
              where: {
                contributorId_weekTimestamp: {
                  contributorId: dbContributor.id,
                  weekTimestamp: weekStat.weekTimestamp,
                },
              },
              create: {
                contributorId: dbContributor.id,
                weekTimestamp: weekStat.weekTimestamp,
                additions: weekStat.additions,
                deletions: weekStat.deletions,
                commits: weekStat.commits,
              },
              update: {
                additions: weekStat.additions,
                deletions: weekStat.deletions,
                commits: weekStat.commits,
              },
            })
          }
        }
      }

      console.info(
        `Saved detailed stats for ${String(contributors.length)} contributors to database`
      )
    } catch (error) {
      console.error('Failed to save detailed contributor stats to database:', error)
    }
  }
}
