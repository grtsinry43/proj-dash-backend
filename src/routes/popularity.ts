import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authMiddleware } from '@/middlewares/auth.middleware'
import { PopularityService } from '@/services/popularity.service'
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

// Schema for query parameters
const historyQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(365).optional().default(30),
})

const aggregateQuerySchema = z.object({
  days: z.coerce.number().min(1).max(90).optional().default(7),
})

// Response schemas
const starHistoryItemSchema = z.object({
  starCount: z.number(),
  recordedAt: z.string(),
})

const trafficViewItemSchema = z.object({
  viewDate: z.string(),
  viewCount: z.number(),
  uniqueCount: z.number(),
})

const trafficCloneItemSchema = z.object({
  cloneDate: z.string(),
  cloneCount: z.number(),
  uniqueCount: z.number(),
})

const trafficReferrerSchema = z.object({
  referrer: z.string(),
  viewCount: z.number(),
  uniqueCount: z.number(),
})

const trafficPathSchema = z.object({
  path: z.string(),
  title: z.string(),
  viewCount: z.number(),
  uniqueCount: z.number(),
})

const popularitySummarySchema = z.object({
  currentStars: z.number(),
  currentForks: z.number(),
  currentWatchers: z.number(),
  starHistory: starHistoryItemSchema.array(),
  traffic: z.object({
    views: z.object({
      total: z.number(),
      unique: z.number(),
      history: trafficViewItemSchema.array(),
    }),
    clones: z.object({
      total: z.number(),
      unique: z.number(),
      history: trafficCloneItemSchema.array(),
    }),
    topReferrers: trafficReferrerSchema.array(),
    topPaths: trafficPathSchema.array(),
  }),
})

const syncResultSchema = z.object({
  totalViews: z.number(),
  totalUniques: z.number(),
  records: z.array(z.unknown()),
})

const syncClonesResultSchema = z.object({
  totalClones: z.number(),
  totalUniques: z.number(),
  records: z.array(z.unknown()),
})

const recordStarResultSchema = z.object({
  repositoryId: z.number(),
  starCount: z.number(),
  recordedAt: z.string(),
})

// Response schemas
const starHistoryResponseSchema = createResponseSchema(starHistoryItemSchema.array())
const trafficViewsResponseSchema = createResponseSchema(trafficViewItemSchema.array())
const trafficClonesResponseSchema = createResponseSchema(trafficCloneItemSchema.array())
const topReferrersResponseSchema = createResponseSchema(trafficReferrerSchema.array())
const topPathsResponseSchema = createResponseSchema(trafficPathSchema.array())
const popularitySummaryResponseSchema = createResponseSchema(popularitySummarySchema)
const syncResultResponseSchema = createResponseSchema(syncResultSchema)
const syncClonesResultResponseSchema = createResponseSchema(syncClonesResultSchema)
const recordStarResponseSchema = createResponseSchema(recordStarResultSchema)

export const popularityRoutes: FastifyPluginAsyncZod = async (app) => {
  // All routes in this plugin require authentication
  app.addHook('preHandler', authMiddleware)

  // Get popularity summary (all metrics in one call)
  app.get(
    '/:owner/:repo/summary',
    {
      schema: {
        description:
          'Get complete popularity summary including stars, views, clones, and top content',
        tags: ['popularity'],
        params: repoParamsSchema,
        response: {
          200: popularitySummaryResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { accessToken, username } = request.user
        const popularityService = new PopularityService(accessToken, username)
        const summary = await popularityService.getPopularitySummary(owner, repo)
        return successResponse(summary)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch popularity summary'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Get star history from database
  app.get(
    '/:owner/:repo/stars/history',
    {
      schema: {
        description: 'Get historical star count snapshots from database',
        tags: ['popularity'],
        params: repoParamsSchema,
        querystring: historyQuerySchema,
        response: {
          200: starHistoryResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { limit } = request.query
        const { accessToken, username } = request.user
        const popularityService = new PopularityService(accessToken, username)

        // Get repository ID first
        const repositoryId = await popularityService.getRepositoryId(owner, repo)
        const starHistory = await popularityService.getStarHistory(repositoryId, limit)

        return successResponse(starHistory)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch star history'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Record current star count
  app.post(
    '/:owner/:repo/stars/record',
    {
      schema: {
        description: 'Record current star count to database (for building historical data)',
        tags: ['popularity'],
        params: repoParamsSchema,
        response: {
          200: recordStarResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { accessToken, username } = request.user
        const popularityService = new PopularityService(accessToken, username)
        const result = await popularityService.recordStarCount(owner, repo)
        return successResponse(result)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to record star count'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Get traffic views history
  app.get(
    '/:owner/:repo/traffic/views',
    {
      schema: {
        description: 'Get historical traffic views from database',
        tags: ['popularity'],
        params: repoParamsSchema,
        querystring: historyQuerySchema,
        response: {
          200: trafficViewsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { limit } = request.query
        const { accessToken, username } = request.user
        const popularityService = new PopularityService(accessToken, username)

        const repositoryId = await popularityService.getRepositoryId(owner, repo)
        const viewsHistory = await popularityService.getTrafficViewsHistory(repositoryId, limit)

        return successResponse(viewsHistory)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch traffic views'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Sync traffic views from GitHub API to database
  app.post(
    '/:owner/:repo/traffic/views/sync',
    {
      schema: {
        description: 'Sync traffic views from GitHub API to database. ⚠️ GitHub only keeps 14 days',
        tags: ['popularity'],
        params: repoParamsSchema,
        response: {
          200: syncResultResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { accessToken, username } = request.user
        const popularityService = new PopularityService(accessToken, username)
        const result = await popularityService.syncTrafficViews(owner, repo)
        return successResponse(result)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to sync traffic views'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Get traffic clones history
  app.get(
    '/:owner/:repo/traffic/clones',
    {
      schema: {
        description: 'Get historical traffic clones from database',
        tags: ['popularity'],
        params: repoParamsSchema,
        querystring: historyQuerySchema,
        response: {
          200: trafficClonesResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { limit } = request.query
        const { accessToken, username } = request.user
        const popularityService = new PopularityService(accessToken, username)

        const repositoryId = await popularityService.getRepositoryId(owner, repo)
        const clonesHistory = await popularityService.getTrafficClonesHistory(repositoryId, limit)

        return successResponse(clonesHistory)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch traffic clones'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Sync traffic clones from GitHub API to database
  app.post(
    '/:owner/:repo/traffic/clones/sync',
    {
      schema: {
        description:
          'Sync traffic clones from GitHub API to database. ⚠️ GitHub only keeps 14 days',
        tags: ['popularity'],
        params: repoParamsSchema,
        response: {
          200: syncClonesResultResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { accessToken, username } = request.user
        const popularityService = new PopularityService(accessToken, username)
        const result = await popularityService.syncTrafficClones(owner, repo)
        return successResponse(result)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to sync traffic clones'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Get top referrers (aggregated)
  app.get(
    '/:owner/:repo/traffic/referrers',
    {
      schema: {
        description: 'Get top referrers aggregated from recent database snapshots',
        tags: ['popularity'],
        params: repoParamsSchema,
        querystring: aggregateQuerySchema,
        response: {
          200: topReferrersResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { days } = request.query
        const { accessToken, username } = request.user
        const popularityService = new PopularityService(accessToken, username)

        const repositoryId = await popularityService.getRepositoryId(owner, repo)
        const topReferrers = await popularityService.getTopReferrersAggregated(repositoryId, days)

        return successResponse(topReferrers)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch top referrers'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Get top paths (aggregated)
  app.get(
    '/:owner/:repo/traffic/paths',
    {
      schema: {
        description: 'Get top content paths aggregated from recent database snapshots',
        tags: ['popularity'],
        params: repoParamsSchema,
        querystring: aggregateQuerySchema,
        response: {
          200: topPathsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { days } = request.query
        const { accessToken, username } = request.user
        const popularityService = new PopularityService(accessToken, username)

        const repositoryId = await popularityService.getRepositoryId(owner, repo)
        const topPaths = await popularityService.getTopPathsAggregated(repositoryId, days)

        return successResponse(topPaths)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch top paths'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Sync all traffic data at once
  app.post(
    '/:owner/:repo/sync-all',
    {
      schema: {
        description:
          'Sync all traffic data (views, clones, referrers, paths) from GitHub to database',
        tags: ['popularity'],
        params: repoParamsSchema,
        response: {
          200: createResponseSchema(z.unknown()),
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { accessToken, username } = request.user
        const popularityService = new PopularityService(accessToken, username)
        const result = await popularityService.syncAllTrafficData(owner, repo)
        return successResponse(result)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to sync all traffic data'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )
}
