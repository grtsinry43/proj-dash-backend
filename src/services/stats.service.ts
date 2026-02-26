import { GitHubService } from './github.service'

export class StatsService {
  private githubService: GitHubService

  constructor(accessToken: string, username: string) {
    this.githubService = new GitHubService(accessToken, username)
  }

  private async getScopedRepositories(monitoredRepoFullNames?: string[]) {
    const repos = await this.githubService.getRepositories()

    if (!monitoredRepoFullNames) {
      return repos
    }

    const monitoredSet = new Set(monitoredRepoFullNames)
    return repos.filter((repo) => monitoredSet.has(repo.full_name))
  }

  async getOverviewStats(monitoredRepoFullNames?: string[]) {
    const repos = await this.getScopedRepositories(monitoredRepoFullNames)
    const totalStars = repos.reduce((acc, repo) => acc + (repo.stargazers_count || 0), 0)
    const totalForks = repos.reduce((acc, repo) => acc + (repo.forks_count || 0), 0)

    return {
      totalRepos: repos.length,
      totalStars,
      totalForks,
    }
  }

  async getActivityStats(monitoredRepoFullNames?: string[]) {
    const repos = await this.getScopedRepositories(monitoredRepoFullNames)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const commitPromises = repos.map(async (repo) => {
      const [owner, repoName] = repo.full_name.split('/')
      if (!owner || !repoName) {
        return { commits: 0 }
      }
      return this.githubService.getRepositoryStats(owner, repoName, thirtyDaysAgo)
    })

    const allStats = await Promise.all(commitPromises)

    const totalCommits = allStats.reduce((acc, stats) => acc + stats.commits, 0)

    return {
      totalCommitsLast30Days: totalCommits,
    }
  }
}
