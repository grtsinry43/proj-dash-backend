import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authMiddleware } from '@/middlewares/auth.middleware'
import { ContributorService } from '@/services/contributor.service'
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

const contributorParamsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  username: z.string(),
})

const growthQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(50).optional().default(10),
})

// Response schemas
const contributorInfoSchema = z.object({
  githubId: z.number(),
  login: z.string(),
  avatarUrl: z.string(),
  htmlUrl: z.string(),
  type: z.string(),
  contributions: z.number(),
})

const weeklyStatsSchema = z.object({
  weekTimestamp: z.number(),
  additions: z.number(),
  deletions: z.number(),
  commits: z.number(),
})

const contributorDetailSchema = contributorInfoSchema.extend({
  totalAdditions: z.number(),
  totalDeletions: z.number(),
  firstContributionAt: z.date().nullable(),
  lastContributionAt: z.date().nullable(),
  weeklyStats: weeklyStatsSchema.array(),
})

const contributorAnalysisSchema = z.object({
  total: z.number(),
  coreContributors: contributorInfoSchema.array(),
  recentActiveCount: z.number(),
  newContributorsCount: z.number(),
  contributionDistribution: z.object({
    top10Percent: z.number(),
    top50Percent: z.number(),
  }),
})

const contributorGrowthSchema = z.object({
  login: z.string(),
  avatarUrl: z.string(),
  weeklyCommits: z
    .object({
      week: z.number(),
      count: z.number(),
    })
    .array(),
  totalCommits: z.number(),
  trend: z.enum(['increasing', 'decreasing', 'stable']),
})

// Create response schemas
const contributorsListResponseSchema = createResponseSchema(contributorInfoSchema.array())
const contributorStatsResponseSchema = createResponseSchema(contributorDetailSchema.array())
const contributorAnalysisResponseSchema = createResponseSchema(contributorAnalysisSchema)
const contributorGrowthResponseSchema = createResponseSchema(contributorGrowthSchema.array())
const contributorDetailResponseSchema = createResponseSchema(contributorDetailSchema)

export const contributorsRoutes: FastifyPluginAsyncZod = async (app) => {
  // All routes in this plugin require authentication
  app.addHook('preHandler', authMiddleware)

  /**
   * Get basic contributor list
   * Returns contributor info with avatar and total contributions
   */
  app.get(
    '/:owner/:repo',
    {
      schema: {
        description:
          'Get basic contributor list with avatars and contribution counts (up to 100 contributors)',
        tags: ['contributors'],
        params: repoParamsSchema,
        response: {
          200: contributorsListResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { accessToken, username } = request.user
        const contributorService = new ContributorService(accessToken, username)
        const contributors = await contributorService.getContributorsList(owner, repo)
        return successResponse(contributors)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch contributors'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  /**
   * Get detailed contributor statistics
   * Includes weekly breakdown of additions, deletions, and commits
   */
  app.get(
    '/:owner/:repo/stats',
    {
      schema: {
        description:
          'Get detailed contributor statistics with weekly breakdown. ⚠️ Only for repos with <10k commits',
        tags: ['contributors'],
        params: repoParamsSchema,
        response: {
          200: contributorStatsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { accessToken, username } = request.user
        const contributorService = new ContributorService(accessToken, username)
        const stats = await contributorService.getContributorStats(owner, repo)
        return successResponse(stats)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch contributor statistics'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  /**
   * Get contributor analysis
   * Returns insights about contributor diversity, activity, and distribution
   */
  app.get(
    '/:owner/:repo/analysis',
    {
      schema: {
        description:
          'Get contributor analysis including core contributors, new/active counts, and contribution distribution',
        tags: ['contributors'],
        params: repoParamsSchema,
        response: {
          200: contributorAnalysisResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { accessToken, username } = request.user
        const contributorService = new ContributorService(accessToken, username)
        const analysis = await contributorService.analyzeContributors(owner, repo)
        return successResponse(analysis)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to analyze contributors'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  /**
   * Get contributor growth trends
   * Returns weekly commit activity for top contributors
   */
  app.get(
    '/:owner/:repo/growth',
    {
      schema: {
        description:
          'Get contributor growth trends with weekly commit activity for top contributors',
        tags: ['contributors'],
        params: repoParamsSchema,
        querystring: growthQuerySchema,
        response: {
          200: contributorGrowthResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { limit } = request.query
        const { accessToken, username } = request.user
        const contributorService = new ContributorService(accessToken, username)
        const growth = await contributorService.getContributorGrowth(owner, repo, limit)
        return successResponse(growth)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch contributor growth'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  /**
   * Get individual contributor details
   * Returns detailed statistics for a specific contributor
   */
  app.get(
    '/:owner/:repo/:username',
    {
      schema: {
        description: 'Get detailed statistics for a specific contributor',
        tags: ['contributors'],
        params: contributorParamsSchema,
        response: {
          200: contributorDetailResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo, username } = request.params
        const { accessToken, username: authUsername } = request.user
        const contributorService = new ContributorService(accessToken, authUsername)
        const contributor = await contributorService.getContributorDetail(owner, repo, username)

        if (!contributor) {
          // eslint-disable-next-line @typescript-eslint/return-await
          return reply.status(404).send(errorResponse(ErrorCode.NOT_FOUND, 'Contributor not found'))
        }

        return successResponse(contributor)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch contributor details'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )
}
