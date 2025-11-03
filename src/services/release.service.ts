import { Octokit } from '@octokit/rest'
import prisma from '@/lib/prisma'
import { redis } from '@/lib/redis'

// Release types
export interface ReleaseAssetInfo {
  githubId: number
  name: string
  label: string | null
  contentType: string
  state: string
  size: number
  downloadCount: number
  browserDownloadUrl: string
  uploaderLogin: string
  uploaderAvatarUrl: string | null
  githubCreatedAt: Date
  githubUpdatedAt: Date
}

export interface ReleaseInfo {
  githubId: number
  tagName: string
  targetCommitish: string | null
  name: string | null
  body: string | null
  isDraft: boolean
  isPrerelease: boolean
  authorLogin: string
  authorAvatarUrl: string | null
  htmlUrl: string
  assetsUrl: string
  uploadUrl: string
  tarballUrl: string
  zipballUrl: string
  githubCreatedAt: Date
  githubPublishedAt: Date | null
  assets: ReleaseAssetInfo[]
}

// Release statistics
export interface ReleaseStats {
  totalReleases: number
  latestRelease: ReleaseInfo | null
  totalDownloads: number
  averageDownloadsPerRelease: number
  recentReleases: ReleaseInfo[] // Last 5 releases
}

// Generate release notes request
export interface GenerateNotesRequest {
  tagName: string
  targetCommitish?: string
  previousTagName?: string
}

export interface GeneratedNotes {
  name: string
  body: string
}

export class ReleaseService {
  private octokit: Octokit

  constructor(accessToken: string, _username: string) {
    this.octokit = new Octokit({ auth: accessToken })
  }

  /**
   * Get all releases for a repository
   */
  async getAllReleases(owner: string, repo: string, perPage = 30): Promise<ReleaseInfo[]> {
    const cacheKey = `repo:releases:${owner}/${repo}:${String(perPage)}`
    const CACHE_TTL = 600 // 10 minutes

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        console.info(`Cache hit for releases: ${owner}/${repo}`)
        return JSON.parse(cached as string) as ReleaseInfo[]
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    // Fetch from GitHub API
    const { data } = await this.octokit.repos.listReleases({
      owner,
      repo,
      per_page: perPage,
    })

    const releases: ReleaseInfo[] = data.map((release) => ({
      githubId: release.id,
      tagName: release.tag_name,
      targetCommitish: release.target_commitish || null,
      name: release.name ?? null,
      body: release.body ?? null,
      isDraft: release.draft,
      isPrerelease: release.prerelease,
      authorLogin: release.author.login,
      authorAvatarUrl: release.author.avatar_url || null,
      htmlUrl: release.html_url,
      assetsUrl: release.assets_url,
      uploadUrl: release.upload_url,
      tarballUrl: release.tarball_url ?? '',
      zipballUrl: release.zipball_url ?? '',
      githubCreatedAt: new Date(release.created_at),
      githubPublishedAt: release.published_at ? new Date(release.published_at) : null,

      assets: release.assets.map((asset) => ({
        githubId: asset.id,
        name: asset.name,
        label: asset.label ?? null,
        contentType: asset.content_type,
        state: asset.state,
        size: asset.size,
        downloadCount: asset.download_count,
        browserDownloadUrl: asset.browser_download_url,
        uploaderLogin: asset.uploader?.login ?? 'unkonown',
        uploaderAvatarUrl: asset.uploader?.avatar_url ?? null,
        githubCreatedAt: new Date(asset.created_at),
        githubUpdatedAt: new Date(asset.updated_at),
      })),
    }))

    // Cache result
    try {
      await redis.set(cacheKey, JSON.stringify(releases), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache releases:', error)
    }

    // Save to database
    await this.saveReleasesToDatabase(owner, repo, releases)

    return releases
  }

  /**
   * Get latest release for a repository
   */
  async getLatestRelease(owner: string, repo: string): Promise<ReleaseInfo | null> {
    const cacheKey = `repo:release:latest:${owner}/${repo}`
    const CACHE_TTL = 300 // 5 minutes

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        console.info(`Cache hit for latest release: ${owner}/${repo}`)
        return JSON.parse(cached as string) as ReleaseInfo
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    try {
      const { data } = await this.octokit.repos.getLatestRelease({
        owner,
        repo,
      })

      const release: ReleaseInfo = {
        githubId: data.id,
        tagName: data.tag_name,
        targetCommitish: data.target_commitish || null,
        name: data.name ?? null,
        body: data.body ?? null,
        isDraft: data.draft,
        isPrerelease: data.prerelease,
        authorLogin: data.author.login,
        authorAvatarUrl: data.author.avatar_url || null,
        htmlUrl: data.html_url,
        assetsUrl: data.assets_url,
        uploadUrl: data.upload_url,
        tarballUrl: data.tarball_url ?? '',
        zipballUrl: data.zipball_url ?? '',
        githubCreatedAt: new Date(data.created_at),
        githubPublishedAt: data.published_at ? new Date(data.published_at) : null,

        assets: data.assets.map((asset) => ({
          githubId: asset.id,
          name: asset.name,
          label: asset.label ?? null,
          contentType: asset.content_type,
          state: asset.state,
          size: asset.size,
          downloadCount: asset.download_count,
          browserDownloadUrl: asset.browser_download_url,
          uploaderLogin: asset.uploader?.login ?? 'unkonown',
          uploaderAvatarUrl: asset.uploader?.avatar_url ?? null,
          githubCreatedAt: new Date(asset.created_at),
          githubUpdatedAt: new Date(asset.updated_at),
        })),
      }

      // Cache result
      try {
        await redis.set(cacheKey, JSON.stringify(release), { ex: CACHE_TTL })
      } catch (error) {
        console.warn('Failed to cache latest release:', error)
      }

      return release
    } catch (_error) {
      // No releases found
      return null
    }
  }

  /**
   * Get release by tag name
   */
  async getReleaseByTag(owner: string, repo: string, tag: string): Promise<ReleaseInfo | null> {
    const cacheKey = `repo:release:tag:${owner}/${repo}:${tag}`
    const CACHE_TTL = 600 // 10 minutes

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        console.info(`Cache hit for release by tag: ${owner}/${repo}/${tag}`)
        return JSON.parse(cached as string) as ReleaseInfo
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    try {
      const { data } = await this.octokit.repos.getReleaseByTag({
        owner,
        repo,
        tag,
      })

      const release: ReleaseInfo = {
        githubId: data.id,
        tagName: data.tag_name,
        targetCommitish: data.target_commitish || null,
        name: data.name ?? null,
        body: data.body ?? null,
        isDraft: data.draft,
        isPrerelease: data.prerelease,
        authorLogin: data.author.login,
        authorAvatarUrl: data.author.avatar_url || null,
        htmlUrl: data.html_url,
        assetsUrl: data.assets_url,
        uploadUrl: data.upload_url,
        tarballUrl: data.tarball_url ?? '',
        zipballUrl: data.zipball_url ?? '',
        githubCreatedAt: new Date(data.created_at),
        githubPublishedAt: data.published_at ? new Date(data.published_at) : null,

        assets: data.assets.map((asset) => ({
          githubId: asset.id,
          name: asset.name,
          label: asset.label ?? null,
          contentType: asset.content_type,
          state: asset.state,
          size: asset.size,
          downloadCount: asset.download_count,
          browserDownloadUrl: asset.browser_download_url,
          uploaderLogin: asset.uploader?.login ?? 'unkonown',
          uploaderAvatarUrl: asset.uploader?.avatar_url ?? null,
          githubCreatedAt: new Date(asset.created_at),
          githubUpdatedAt: new Date(asset.updated_at),
        })),
      }

      // Cache result
      try {
        await redis.set(cacheKey, JSON.stringify(release), { ex: CACHE_TTL })
      } catch (error) {
        console.warn('Failed to cache release by tag:', error)
      }

      return release
    } catch (_error) {
      // Release not found
      return null
    }
  }

  /**
   * Get release statistics
   */
  async getReleaseStats(owner: string, repo: string): Promise<ReleaseStats> {
    const cacheKey = `repo:release:stats:${owner}/${repo}`
    const CACHE_TTL = 600 // 10 minutes

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        console.info(`Cache hit for release stats: ${owner}/${repo}`)
        return JSON.parse(cached as string) as ReleaseStats
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error)
    }

    // Get all releases
    const allReleases = await this.getAllReleases(owner, repo, 100)

    // Calculate statistics
    const totalReleases = allReleases.length
    const latestRelease = allReleases.length > 0 && allReleases[0] ? allReleases[0] : null

    // Calculate total downloads
    const totalDownloads = allReleases.reduce((sum, release) => {
      return sum + release.assets.reduce((assetSum, asset) => assetSum + asset.downloadCount, 0)
    }, 0)

    const averageDownloadsPerRelease = totalReleases > 0 ? totalDownloads / totalReleases : 0

    // Get recent 5 releases
    const recentReleases = allReleases.slice(0, 5)

    const stats: ReleaseStats = {
      totalReleases,
      latestRelease,
      totalDownloads,
      averageDownloadsPerRelease,
      recentReleases,
    }

    // Cache result
    try {
      await redis.set(cacheKey, JSON.stringify(stats), { ex: CACHE_TTL })
    } catch (error) {
      console.warn('Failed to cache release stats:', error)
    }

    return stats
  }

  /**
   * Generate release notes
   */
  async generateReleaseNotes(
    owner: string,
    repo: string,
    request: GenerateNotesRequest
  ): Promise<GeneratedNotes> {
    const response = await this.octokit.repos.generateReleaseNotes({
      owner,
      repo,
      tag_name: request.tagName,
      target_commitish: request.targetCommitish,
      previous_tag_name: request.previousTagName,
    })

    return {
      name: response.data.name,
      body: response.data.body,
    }
  }

  /**
   * Save releases to database
   */
  private async saveReleasesToDatabase(
    owner: string,
    repo: string,
    releases: ReleaseInfo[]
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

      // Upsert each release
      for (const release of releases) {
        const dbRelease = await prisma.release.upsert({
          where: { githubId: release.githubId },
          create: {
            githubId: release.githubId,
            repositoryId: repository.id,
            tagName: release.tagName,
            targetCommitish: release.targetCommitish,
            name: release.name,
            body: release.body,
            isDraft: release.isDraft,
            isPrerelease: release.isPrerelease,
            authorLogin: release.authorLogin,
            authorAvatarUrl: release.authorAvatarUrl,
            htmlUrl: release.htmlUrl,
            assetsUrl: release.assetsUrl,
            uploadUrl: release.uploadUrl,
            tarballUrl: release.tarballUrl,
            zipballUrl: release.zipballUrl,
            githubCreatedAt: release.githubCreatedAt,
            githubPublishedAt: release.githubPublishedAt,
          },
          update: {
            tagName: release.tagName,
            targetCommitish: release.targetCommitish,
            name: release.name,
            body: release.body,
            isDraft: release.isDraft,
            isPrerelease: release.isPrerelease,
            authorLogin: release.authorLogin,
            authorAvatarUrl: release.authorAvatarUrl,
            htmlUrl: release.htmlUrl,
            githubPublishedAt: release.githubPublishedAt,
            lastSyncedAt: new Date(),
          },
        })

        // Upsert release assets
        for (const asset of release.assets) {
          await prisma.releaseAsset.upsert({
            where: { githubId: asset.githubId },
            create: {
              githubId: asset.githubId,
              releaseId: dbRelease.id,
              name: asset.name,
              label: asset.label,
              contentType: asset.contentType,
              state: asset.state,
              size: asset.size,
              downloadCount: asset.downloadCount,
              browserDownloadUrl: asset.browserDownloadUrl,
              uploaderLogin: asset.uploaderLogin,
              uploaderAvatarUrl: asset.uploaderAvatarUrl,
              githubCreatedAt: asset.githubCreatedAt,
              githubUpdatedAt: asset.githubUpdatedAt,
            },
            update: {
              name: asset.name,
              label: asset.label,
              state: asset.state,
              downloadCount: asset.downloadCount,
              githubUpdatedAt: asset.githubUpdatedAt,
              lastSyncedAt: new Date(),
            },
          })
        }
      }

      console.info(`Saved ${String(releases.length)} releases to database`)
    } catch (error) {
      console.error('Failed to save releases to database:', error)
    }
  }
}
