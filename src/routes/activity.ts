import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authMiddleware } from '@/middlewares/auth.middleware'
import { ActivityService } from '@/services/activity.service'
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
const activityQuerySchema = z.object({
  state: z.enum(['open', 'closed', 'all']).optional().default('all'),
  per_page: z.coerce.number().min(1).max(100).optional().default(30),
})

const commitsQuerySchema = z.object({
  per_page: z.coerce.number().min(1).max(100).optional().default(30),
})

// Activity timeline schemas
const commitActivitySchema = z.object({
  sha: z.string(),
  message: z.string(),
  author: z.object({
    name: z.string(),
    email: z.string(),
    date: z.string(),
    avatar: z.string().optional(),
  }),
  committer: z.object({
    name: z.string(),
    date: z.string(),
  }),
  url: z.string(),
})

const pullRequestActivitySchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.string(),
  user: z.object({
    login: z.string(),
    avatar_url: z.string(),
  }),
  created_at: z.string(),
  updated_at: z.string(),
  merged_at: z.string().nullable(),
  html_url: z.string(),
})

const issueActivitySchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.string(),
  user: z.object({
    login: z.string(),
    avatar_url: z.string(),
  }),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  html_url: z.string(),
  labels: z
    .object({
      name: z.string(),
      color: z.string(),
    })
    .array(),
})

const commitActivityStatsSchema = z.object({
  days: z.number().array(),
  total: z.number(),
  week: z.number(),
})

const contributorStatsSchema = z.object({
  author: z.object({
    login: z.string(),
    avatar_url: z.string(),
  }),
  total: z.number(),
  weeks: z
    .object({
      w: z.number(),
      a: z.number(),
      d: z.number(),
      c: z.number(),
    })
    .array(),
})

// Response schemas
const commitsResponseSchema = createResponseSchema(commitActivitySchema.array())
const pullRequestsResponseSchema = createResponseSchema(pullRequestActivitySchema.array())
const issuesResponseSchema = createResponseSchema(issueActivitySchema.array())
const commitActivityStatsResponseSchema = createResponseSchema(commitActivityStatsSchema.array())
const contributorStatsResponseSchema = createResponseSchema(contributorStatsSchema.array())

export const activityRoutes: FastifyPluginAsyncZod = async (app) => {
  // All routes in this plugin require authentication
  app.addHook('preHandler', authMiddleware)

  // Route to get recent commits
  app.get(
    '/:owner/:repo/commits',
    {
      schema: {
        description: 'Get recent commits for activity timeline',
        tags: ['activity'],
        params: repoParamsSchema,
        querystring: commitsQuerySchema,
        response: {
          200: commitsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { per_page } = request.query
        const { accessToken, username } = request.user
        const activityService = new ActivityService(accessToken, username)
        const commits = await activityService.getRecentCommits(owner, repo, per_page)
        return successResponse(commits)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch commits'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Route to get recent pull requests
  app.get(
    '/:owner/:repo/pulls',
    {
      schema: {
        description: 'Get recent pull requests for activity timeline',
        tags: ['activity'],
        params: repoParamsSchema,
        querystring: activityQuerySchema,
        response: {
          200: pullRequestsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { state, per_page } = request.query
        const { accessToken, username } = request.user
        const activityService = new ActivityService(accessToken, username)
        const pulls = await activityService.getRecentPullRequests(owner, repo, state, per_page)
        return successResponse(pulls)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch pull requests'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Route to get recent issues
  app.get(
    '/:owner/:repo/issues',
    {
      schema: {
        description: 'Get recent issues for activity timeline (excludes PRs)',
        tags: ['activity'],
        params: repoParamsSchema,
        querystring: activityQuerySchema,
        response: {
          200: issuesResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { state, per_page } = request.query
        const { accessToken, username } = request.user
        const activityService = new ActivityService(accessToken, username)
        const issues = await activityService.getRecentIssues(owner, repo, state, per_page)
        return successResponse(issues)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch issues'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Route to get commit activity stats (heatmap data)
  app.get(
    '/:owner/:repo/commit-stats',
    {
      schema: {
        description:
          'Get commit activity statistics (weekly) for heatmap. ⚠️ Only for repos with <10k commits',
        tags: ['activity'],
        params: repoParamsSchema,
        response: {
          200: commitActivityStatsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { accessToken, username } = request.user
        const activityService = new ActivityService(accessToken, username)
        const stats = await activityService.getCommitActivityStats(owner, repo)
        return successResponse(stats)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch commit activity stats'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Route to get contributor statistics
  app.get(
    '/:owner/:repo/contributors',
    {
      schema: {
        description:
          'Get contributor statistics with weekly breakdown. ⚠️ Only for repos with <10k commits',
        tags: ['activity'],
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
        const activityService = new ActivityService(accessToken, username)
        const stats = await activityService.getContributorStats(owner, repo)
        return successResponse(stats)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch contributor stats'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )
}
