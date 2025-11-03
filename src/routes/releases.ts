import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authMiddleware } from '@/middlewares/auth.middleware'
import { ReleaseService } from '@/services/release.service'
import {
  createResponseSchema,
  ErrorCode,
  errorResponse,
  errorResponseSchema,
  successResponse,
} from '@/types/response'

// Schema for request parameters
const repoParamsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
})

const releaseTagParamsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  tag: z.string(),
})

const releasesQuerySchema = z.object({
  per_page: z.coerce.number().min(1).max(100).optional().default(30),
})

// Generate notes request schema
const generateNotesSchema = z.object({
  tagName: z.string(),
  targetCommitish: z.string().optional(),
  previousTagName: z.string().optional(),
})

// Response schemas
const releaseAssetSchema = z.object({
  githubId: z.number(),
  name: z.string(),
  label: z.string().nullable(),
  contentType: z.string(),
  state: z.string(),
  size: z.number(),
  downloadCount: z.number(),
  browserDownloadUrl: z.string(),
  uploaderLogin: z.string(),
  uploaderAvatarUrl: z.string().nullable(),
  githubCreatedAt: z.date(),
  githubUpdatedAt: z.date(),
})

const releaseInfoSchema = z.object({
  githubId: z.number(),
  tagName: z.string(),
  targetCommitish: z.string().nullable(),
  name: z.string().nullable(),
  body: z.string().nullable(),
  isDraft: z.boolean(),
  isPrerelease: z.boolean(),
  authorLogin: z.string(),
  authorAvatarUrl: z.string().nullable(),
  htmlUrl: z.string(),
  assetsUrl: z.string(),
  uploadUrl: z.string(),
  tarballUrl: z.string(),
  zipballUrl: z.string(),
  githubCreatedAt: z.date(),
  githubPublishedAt: z.date().nullable(),
  assets: releaseAssetSchema.array(),
})

const releaseStatsSchema = z.object({
  totalReleases: z.number(),
  latestRelease: releaseInfoSchema.nullable(),
  totalDownloads: z.number(),
  averageDownloadsPerRelease: z.number(),
  recentReleases: releaseInfoSchema.array(),
})

const generatedNotesSchema = z.object({
  name: z.string(),
  body: z.string(),
})

// Create response schemas
const releasesResponseSchema = createResponseSchema(releaseInfoSchema.array())
const releaseResponseSchema = createResponseSchema(releaseInfoSchema)
const releaseStatsResponseSchema = createResponseSchema(releaseStatsSchema)
const generatedNotesResponseSchema = createResponseSchema(generatedNotesSchema)

export const releasesRoutes: FastifyPluginAsyncZod = async (app) => {
  // All routes in this plugin require authentication
  app.addHook('preHandler', authMiddleware)

  /**
   * Get all releases
   */
  app.get(
    '/:owner/:repo',
    {
      schema: {
        description: 'Get all releases for a repository (version timeline)',
        tags: ['releases'],
        params: repoParamsSchema,
        querystring: releasesQuerySchema,
        response: {
          200: releasesResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { per_page } = request.query
        const { accessToken, username } = request.user
        const releaseService = new ReleaseService(accessToken, username)
        const releases = await releaseService.getAllReleases(owner, repo, per_page)
        return successResponse(releases)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch releases'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  /**
   * Get latest release
   */
  app.get(
    '/:owner/:repo/latest',
    {
      schema: {
        description: 'Get the latest published release',
        tags: ['releases'],
        params: repoParamsSchema,
        response: {
          200: releaseResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { accessToken, username } = request.user
        const releaseService = new ReleaseService(accessToken, username)
        const release = await releaseService.getLatestRelease(owner, repo)

        if (!release) {
          // eslint-disable-next-line @typescript-eslint/return-await
          return reply.status(404).send(errorResponse(ErrorCode.NOT_FOUND, 'No releases found'))
        }

        return successResponse(release)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch latest release'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  /**
   * Get release statistics
   */
  app.get(
    '/:owner/:repo/stats',
    {
      schema: {
        description: 'Get release statistics including download counts',
        tags: ['releases'],
        params: repoParamsSchema,
        response: {
          200: releaseStatsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { accessToken, username } = request.user
        const releaseService = new ReleaseService(accessToken, username)
        const stats = await releaseService.getReleaseStats(owner, repo)
        return successResponse(stats)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch release statistics'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  /**
   * Get release by tag
   */
  app.get(
    '/:owner/:repo/tags/:tag',
    {
      schema: {
        description: 'Get a specific release by tag name',
        tags: ['releases'],
        params: releaseTagParamsSchema,
        response: {
          200: releaseResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo, tag } = request.params
        const { accessToken, username } = request.user
        const releaseService = new ReleaseService(accessToken, username)
        const release = await releaseService.getReleaseByTag(owner, repo, tag)

        if (!release) {
          // eslint-disable-next-line @typescript-eslint/return-await
          return reply
            .status(404)
            .send(errorResponse(ErrorCode.NOT_FOUND, `Release with tag '${tag}' not found`))
        }

        return successResponse(release)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch release'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  /**
   * Generate release notes
   */
  app.post(
    '/:owner/:repo/generate-notes',
    {
      schema: {
        description: 'Generate release notes for a tag',
        tags: ['releases'],
        params: repoParamsSchema,
        body: generateNotesSchema,
        response: {
          200: generatedNotesResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const body = request.body
        const { accessToken, username } = request.user
        const releaseService = new ReleaseService(accessToken, username)
        const notes = await releaseService.generateReleaseNotes(owner, repo, body)
        return successResponse(notes)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to generate release notes'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )
}
