import { Octokit } from '@octokit/rest'
import { redis } from '@/lib/redis'

// Language distribution
export type LanguageStats = Record<string, number> // bytes of code

// Code frequency (weekly additions/deletions)
export interface CodeFrequency {
  week: number // Unix timestamp
  additions: number
  deletions: number
}

// File tree structure
export interface FileTree {
  path: string
  mode: string
  type: 'blob' | 'tree'
  sha: string
  size?: number
  url?: string
}

// Hot files (most frequently modified)
export interface HotFile {
  path: string
  changeCount: number
  lastModified: string
  authors: string[]
}

export class CodeStatsService {
  private octokit: Octokit

  constructor(accessToken: string, _username: string) {
    this.octokit = new Octokit({ auth: accessToken })
  }

  /**
   * Get language distribution (in bytes)
   * Returns languages used in the repository with byte counts
   */
  async getLanguageStats(owner: string, repo: string): Promise<LanguageStats> {
    const cacheKey = `repo:languages:${owner}/${repo}`
    const CACHE_TTL = 3600 // 1 hour

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as LanguageStats
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    const { data } = await this.octokit.repos.listLanguages({
      owner,
      repo,
    })

    try {
      await redis.set(cacheKey, JSON.stringify(data), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache language stats:', error)
    }

    return data
  }

  /**
   * Get code frequency statistics (weekly additions/deletions)
   * ⚠️ Only available for repositories with < 10,000 commits
   * ⚠️ First request returns 202, need to retry
   */
  async getCodeFrequency(owner: string, repo: string): Promise<CodeFrequency[]> {
    const cacheKey = `repo:code-frequency:${owner}/${repo}`
    const CACHE_TTL = 3600 // 1 hour

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as CodeFrequency[]
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    const response = await this.fetchCodeFrequencyWithRetry(owner, repo)

    const stats: CodeFrequency[] = response.data.map((item) => ({
      week: item[0] ?? 0,
      additions: item[1] ?? 0,
      deletions: Math.abs(item[2] ?? 0),
    }))

    try {
      await redis.set(cacheKey, JSON.stringify(stats), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache code frequency stats:', error)
    }

    return stats
  }

  /**
   * Fetch code frequency with retry logic (recursive)
   */
  private async fetchCodeFrequencyWithRetry(
    owner: string,
    repo: string,
    attempt = 1
  ): Promise<{ data: number[][] }> {
    const maxAttempts = 3
    const response = await this.octokit.repos.getCodeFrequencyStats({ owner, repo })

    if (response.status === 200 && response.data.length > 0) {
      return { data: response.data }
    }

    if (response.status === 202 && attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      return this.fetchCodeFrequencyWithRetry(owner, repo, attempt + 1)
    }

    throw new Error(`Failed to fetch code frequency after ${String(attempt)} attempts`)
  }

  /**
   * Get repository file tree structure
   * @param recursive If true, get all files recursively
   */
  async getFileTree(
    owner: string,
    repo: string,
    branch = 'main',
    recursive = true
  ): Promise<FileTree[]> {
    const cacheKey = `repo:tree:${owner}/${repo}:${branch}:${String(recursive)}`
    const CACHE_TTL = 1800 // 30 minutes

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as FileTree[]
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    // First, get the branch to find the tree SHA
    const { data: branchData } = await this.octokit.repos.getBranch({
      owner,
      repo,
      branch,
    })

    const treeSha = branchData.commit.commit.tree.sha

    // Then get the tree
    const { data } = await this.octokit.git.getTree({
      owner,
      repo,
      tree_sha: treeSha,
      recursive: recursive ? 'true' : undefined,
    })

    const fileTree: FileTree[] = data.tree.map((item) => ({
      path: item.path,
      mode: item.mode,
      type: item.type as 'blob' | 'tree',
      sha: item.sha,
      size: item.size,
      url: item.url,
    }))

    try {
      await redis.set(cacheKey, JSON.stringify(fileTree), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache file tree:', error)
    }

    return fileTree
  }

  /**
   * Analyze hot files (most frequently modified files)
   * This analyzes recent commits to find which files are changed most often
   * @param limit Number of commits to analyze (default: 100)
   * @param topN Return top N hot files (default: 20)
   */
  async getHotFiles(owner: string, repo: string, limit = 100, topN = 20): Promise<HotFile[]> {
    const cacheKey = `repo:hot-files:${owner}/${repo}:${String(limit)}:${String(topN)}`
    const CACHE_TTL = 1800 // 30 minutes

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached as string) as HotFile[]
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    // Get recent commits
    const { data: commits } = await this.octokit.repos.listCommits({
      owner,
      repo,
      per_page: Math.min(limit, 100),
    })

    // Track file changes
    const fileChanges = new Map<
      string,
      {
        count: number
        lastModified: string
        authors: Set<string>
      }
    >()

    // Process commits
    await this.processCommitsForHotFiles(owner, repo, commits, fileChanges)

    // Convert to array and sort
    const hotFiles = this.sortAndLimitHotFiles(fileChanges, topN)

    try {
      await redis.set(cacheKey, JSON.stringify(hotFiles), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache hot files:', error)
    }

    return hotFiles
  }

  /**
   * Process commits to track file changes
   */
  private async processCommitsForHotFiles(
    owner: string,
    repo: string,
    commits: { sha: string }[],
    fileChanges: Map<string, { count: number; lastModified: string; authors: Set<string> }>
  ) {
    const commitPromises = commits.map(async (commit) =>
      this.octokit.repos
        .getCommit({
          owner,
          repo,
          ref: commit.sha,
        })
        .then((result) => result.data)
        .catch((error: unknown) => {
          console.warn(`Failed to fetch commit ${commit.sha}:`, error)
          return null
        })
    )

    const commitDetails = await Promise.all(commitPromises)

    for (const commitDetail of commitDetails) {
      if (!commitDetail) continue

      const author = commitDetail.commit.author?.name ?? 'Unknown'
      const date = commitDetail.commit.author?.date ?? new Date().toISOString()

      if (commitDetail.files) {
        this.updateFileChanges(commitDetail.files, fileChanges, author, date)
      }
    }
  }

  /**
   * Update file changes tracking
   */
  private updateFileChanges(
    files: { filename: string }[],
    fileChanges: Map<string, { count: number; lastModified: string; authors: Set<string> }>,
    author: string,
    date: string
  ) {
    for (const file of files) {
      const path = file.filename

      if (!fileChanges.has(path)) {
        fileChanges.set(path, {
          count: 0,
          lastModified: date,
          authors: new Set(),
        })
      }

      const fileData = fileChanges.get(path)
      if (fileData) {
        fileData.count++
        fileData.authors.add(author)

        // Update last modified if this commit is more recent
        if (new Date(date) > new Date(fileData.lastModified)) {
          fileData.lastModified = date
        }
      }
    }
  }

  /**
   * Sort and limit hot files
   */
  private sortAndLimitHotFiles(
    fileChanges: Map<string, { count: number; lastModified: string; authors: Set<string> }>,
    topN: number
  ): HotFile[] {
    return Array.from(fileChanges.entries())
      .map(([path, data]) => ({
        path,
        changeCount: data.count,
        lastModified: data.lastModified,
        authors: Array.from(data.authors),
      }))
      .sort((a, b) => b.changeCount - a.changeCount)
      .slice(0, topN)
  }

  /**
   * Get file structure summary (counts by type)
   */
  async getFileStructureSummary(owner: string, repo: string, branch = 'main') {
    const files = await this.getFileTree(owner, repo, branch, true)

    const summary = {
      totalFiles: 0,
      totalDirectories: 0,
      totalSize: 0,
      filesByExtension: new Map<string, number>(),
      largestFiles: [] as { path: string; size: number }[],
    }

    for (const file of files) {
      if (file.type === 'blob') {
        summary.totalFiles++
        summary.totalSize += file.size ?? 0

        // Track by extension
        const ext = file.path.split('.').pop() ?? 'no-extension'
        const currentCount = summary.filesByExtension.get(ext) ?? 0
        summary.filesByExtension.set(ext, currentCount + 1)
      } else {
        summary.totalDirectories++
      }
    }

    // Get top 10 largest files
    const largestFiles = files
      .filter((f) => f.type === 'blob' && f.size)
      .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
      .slice(0, 10)
      .map((f) => ({ path: f.path, size: f.size ?? 0 }))

    return {
      ...summary,
      filesByExtension: Object.fromEntries(summary.filesByExtension),
      largestFiles,
    }
  }
}
