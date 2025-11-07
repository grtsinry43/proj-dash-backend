import { GitHubService } from './github.service'
import prisma from '@/lib/prisma'

/**
 * PopularityService - Manages repository popularity metrics
 * Handles star history and traffic statistics (views, clones, referrers, paths)
 *
 * ⚠️ GitHub only retains traffic data for 14 days, so we need to collect it regularly
 */
export class PopularityService {
  private githubService: GitHubService

  constructor(accessToken: string, username: string) {
    this.githubService = new GitHubService(accessToken, username)
  }

  /**
   * Get repository ID from GitHub
   * Helper method to fetch repository metadata
   */
  async getRepositoryId(owner: string, repo: string): Promise<number> {
    const overview = await this.githubService.getRepositoryOverview(owner, repo)
    return overview.id
  }

  /**
   * Get star history from database
   * Returns historical snapshots of star counts
   */
  async getStarHistory(repositoryId: number, limit = 30) {
    const starHistory = await prisma.starHistory.findMany({
      where: { repositoryId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    })

    return starHistory.map((record) => ({
      starCount: record.starCount,
      recordedAt: record.recordedAt.toISOString(),
    }))
  }

  /**
   * Record current star count
   * Should be called periodically to build star growth history
   */
  async recordStarCount(owner: string, repo: string) {
    // Get current star count from GitHub
    const overview = await this.githubService.getRepositoryOverview(owner, repo)

    // Save to database
    await prisma.starHistory.create({
      data: {
        repositoryId: overview.id,
        starCount: overview.stargazersCount,
      },
    })

    return {
      repositoryId: overview.id,
      starCount: overview.stargazersCount,
      recordedAt: new Date().toISOString(),
    }
  }

  /**
   * Get traffic views data and save to database
   * GitHub only keeps 14 days, so we store it for historical tracking
   */
  async syncTrafficViews(owner: string, repo: string) {
    const trafficData = await this.githubService.getTrafficViews(owner, repo)
    const overview = await this.githubService.getRepositoryOverview(owner, repo)

    // Save each day's data
    const savedRecords = []
    for (const view of trafficData.views) {
      const viewDate = new Date(view.timestamp)

      // eslint-disable-next-line no-await-in-loop
      const record = await prisma.trafficViews.upsert({
        where: {
          repositoryId_viewDate: {
            repositoryId: overview.id,
            viewDate,
          },
        },
        create: {
          repositoryId: overview.id,
          viewDate,
          viewCount: view.count,
          uniqueCount: view.uniques,
        },
        update: {
          viewCount: view.count,
          uniqueCount: view.uniques,
        },
      })

      savedRecords.push({
        viewDate: record.viewDate.toISOString(),
        viewCount: record.viewCount,
        uniqueCount: record.uniqueCount,
      })
    }

    return {
      totalViews: trafficData.count,
      totalUniques: trafficData.uniques,
      records: savedRecords,
    }
  }

  /**
   * Get traffic clones data and save to database
   */
  async syncTrafficClones(owner: string, repo: string) {
    const trafficData = await this.githubService.getTrafficClones(owner, repo)
    const overview = await this.githubService.getRepositoryOverview(owner, repo)

    // Save each day's data
    const savedRecords = []
    for (const clone of trafficData.clones) {
      const cloneDate = new Date(clone.timestamp)

      // eslint-disable-next-line no-await-in-loop
      const record = await prisma.trafficClones.upsert({
        where: {
          repositoryId_cloneDate: {
            repositoryId: overview.id,
            cloneDate,
          },
        },
        create: {
          repositoryId: overview.id,
          cloneDate,
          cloneCount: clone.count,
          uniqueCount: clone.uniques,
        },
        update: {
          cloneCount: clone.count,
          uniqueCount: clone.uniques,
        },
      })

      savedRecords.push({
        cloneDate: record.cloneDate.toISOString(),
        cloneCount: record.cloneCount,
        uniqueCount: record.uniqueCount,
      })
    }

    return {
      totalClones: trafficData.count,
      totalUniques: trafficData.uniques,
      records: savedRecords,
    }
  }

  /**
   * Get top referrers and save snapshot
   */
  async syncTopReferrers(owner: string, repo: string) {
    const referrers = await this.githubService.getTopReferrers(owner, repo)
    const overview = await this.githubService.getRepositoryOverview(owner, repo)

    // Save snapshot of current top referrers
    const savedRecords = []
    for (const referrer of referrers) {
      // eslint-disable-next-line no-await-in-loop
      const record = await prisma.trafficReferrer.create({
        data: {
          repositoryId: overview.id,
          referrer: referrer.referrer,
          viewCount: referrer.count,
          uniqueCount: referrer.uniques,
        },
      })

      savedRecords.push({
        referrer: record.referrer,
        viewCount: record.viewCount,
        uniqueCount: record.uniqueCount,
        recordedAt: record.recordedAt.toISOString(),
      })
    }

    return savedRecords
  }

  /**
   * Get top paths and save snapshot
   */
  async syncTopPaths(owner: string, repo: string) {
    const paths = await this.githubService.getTopPaths(owner, repo)
    const overview = await this.githubService.getRepositoryOverview(owner, repo)

    // Save snapshot of current top paths
    const savedRecords = []
    for (const path of paths) {
      // eslint-disable-next-line no-await-in-loop
      const record = await prisma.trafficPath.create({
        data: {
          repositoryId: overview.id,
          path: path.path,
          title: path.title,
          viewCount: path.count,
          uniqueCount: path.uniques,
        },
      })

      savedRecords.push({
        path: record.path,
        title: record.title,
        viewCount: record.viewCount,
        uniqueCount: record.uniqueCount,
        recordedAt: record.recordedAt.toISOString(),
      })
    }

    return savedRecords
  }

  /**
   * Get historical traffic views from database
   */
  async getTrafficViewsHistory(repositoryId: number, limit = 30) {
    const views = await prisma.trafficViews.findMany({
      where: { repositoryId },
      orderBy: { viewDate: 'desc' },
      take: limit,
    })

    return views.map((view) => ({
      viewDate: view.viewDate.toISOString(),
      viewCount: view.viewCount,
      uniqueCount: view.uniqueCount,
    }))
  }

  /**
   * Get historical traffic clones from database
   */
  async getTrafficClonesHistory(repositoryId: number, limit = 30) {
    const clones = await prisma.trafficClones.findMany({
      where: { repositoryId },
      orderBy: { cloneDate: 'desc' },
      take: limit,
    })

    return clones.map((clone) => ({
      cloneDate: clone.cloneDate.toISOString(),
      cloneCount: clone.cloneCount,
      uniqueCount: clone.uniqueCount,
    }))
  }

  /**
   * Get top referrers aggregated from recent snapshots
   */
  async getTopReferrersAggregated(repositoryId: number, days = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const referrers = await prisma.trafficReferrer.groupBy({
      by: ['referrer'],
      where: {
        repositoryId,
        recordedAt: { gte: since },
      },
      _sum: {
        viewCount: true,
        uniqueCount: true,
      },
      orderBy: {
        _sum: {
          viewCount: 'desc',
        },
      },
      take: 10,
    })

    return referrers.map((ref) => ({
      referrer: ref.referrer,
      viewCount: ref._sum.viewCount ?? 0,
      uniqueCount: ref._sum.uniqueCount ?? 0,
    }))
  }

  /**
   * Get top paths aggregated from recent snapshots
   */
  async getTopPathsAggregated(repositoryId: number, days = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const paths = await prisma.trafficPath.groupBy({
      by: ['path', 'title'],
      where: {
        repositoryId,
        recordedAt: { gte: since },
      },
      _sum: {
        viewCount: true,
        uniqueCount: true,
      },
      orderBy: {
        _sum: {
          viewCount: 'desc',
        },
      },
      take: 10,
    })

    return paths.map((p) => ({
      path: p.path,
      title: p.title,
      viewCount: p._sum.viewCount ?? 0,
      uniqueCount: p._sum.uniqueCount ?? 0,
    }))
  }

  /**
   * Sync all traffic data at once
   * Useful for scheduled tasks
   */
  async syncAllTrafficData(owner: string, repo: string) {
    const [views, clones, referrers, paths] = await Promise.all([
      this.syncTrafficViews(owner, repo),
      this.syncTrafficClones(owner, repo),
      this.syncTopReferrers(owner, repo),
      this.syncTopPaths(owner, repo),
    ])

    return {
      views,
      clones,
      referrers,
      paths,
      syncedAt: new Date().toISOString(),
    }
  }

  /**
   * Get popularity summary for a repository
   * Includes current stats and recent trends
   */
  async getPopularitySummary(owner: string, repo: string) {
    const overview = await this.githubService.getRepositoryOverview(owner, repo)

    // Get recent star history (last 30 records)
    const starHistory = await this.getStarHistory(overview.id, 30)

    // Get recent traffic views (last 14 days)
    const viewsHistory = await this.getTrafficViewsHistory(overview.id, 14)

    // Get recent traffic clones (last 14 days)
    const clonesHistory = await this.getTrafficClonesHistory(overview.id, 14)

    // Get top referrers (last 7 days)
    const topReferrers = await this.getTopReferrersAggregated(overview.id, 7)

    // Get top paths (last 7 days)
    const topPaths = await this.getTopPathsAggregated(overview.id, 7)

    // Calculate totals from history
    const totalViews = viewsHistory.reduce((sum, v) => sum + v.viewCount, 0)
    const totalUniqueViews = viewsHistory.reduce((sum, v) => sum + v.uniqueCount, 0)
    const totalClones = clonesHistory.reduce((sum, c) => sum + c.cloneCount, 0)
    const totalUniqueClones = clonesHistory.reduce((sum, c) => sum + c.uniqueCount, 0)

    return {
      currentStars: overview.stargazersCount,
      currentForks: overview.forksCount,
      currentWatchers: overview.watchersCount,
      starHistory,
      traffic: {
        views: {
          total: totalViews,
          unique: totalUniqueViews,
          history: viewsHistory,
        },
        clones: {
          total: totalClones,
          unique: totalUniqueClones,
          history: clonesHistory,
        },
        topReferrers,
        topPaths,
      },
    }
  }
}
