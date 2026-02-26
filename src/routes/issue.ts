import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authMiddleware } from '@/middlewares/auth.middleware'
import { workspaceMiddleware } from '@/middlewares/workspace.middleware'
import { IssueService } from '@/services/issue.service'
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

// Query schemas
const issueQuerySchema = z.object({
  state: z.enum(['open', 'closed', 'all']).optional().default('all'),
  per_page: z.coerce.number().min(1).max(100).optional().default(30),
})

// Response schemas
const labelSchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string(),
  description: z.string().optional(),
  count: z.number().optional(),
})

const issueLabelSchema = z.object({
  name: z.string(),
  color: z.string(),
  description: z.string().optional(),
})

const issueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  state: z.string(),
  user: z.object({
    login: z.string(),
    avatar_url: z.string(),
  }),
  labels: issueLabelSchema.array(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  html_url: z.string(),
  comments: z.number(),
  body: z.string().optional(),
})

const pullRequestSchema = z.object({
  id: z.number(),
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
  closed_at: z.string().nullable(),
  html_url: z.string(),
  draft: z.boolean(),
  mergeable_state: z.string().optional(),
  labels: z
    .object({
      name: z.string(),
      color: z.string(),
    })
    .array(),
})

const issueStatsSchema = z.object({
  total: z.number(),
  open: z.number(),
  closed: z.number(),
  avgClosedDays: z.number().optional(),
  avgFirstResponseHours: z.number().optional(),
})

const pullRequestStatsSchema = z.object({
  total: z.number(),
  open: z.number(),
  closed: z.number(),
  merged: z.number(),
  draft: z.number(),
  avgMergedDays: z.number().optional(),
})

const responseTimeMetricsSchema = z.object({
  avgFirstResponseHours: z.number(),
  avgClosedDays: z.number(),
  medianClosedDays: z.number(),
  issuesWithResponse: z.number(),
  totalIssues: z.number(),
})

// Response schemas with unified format
const issuesResponseSchema = createResponseSchema(issueSchema.array())
const pullRequestsResponseSchema = createResponseSchema(pullRequestSchema.array())
const labelsResponseSchema = createResponseSchema(labelSchema.array())
const issueStatsResponseSchema = createResponseSchema(issueStatsSchema)
const pullRequestStatsResponseSchema = createResponseSchema(pullRequestStatsSchema)
const responseTimeMetricsResponseSchema = createResponseSchema(responseTimeMetricsSchema)

export const issueRoutes: FastifyPluginAsyncZod = async (app) => {
  // All routes in this plugin require authentication
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', workspaceMiddleware)

  // Route to get issues
  app.get(
    '/:owner/:repo/issues',
    {
      schema: {
        description: 'Get issues for a repository (excludes pull requests)',
        tags: ['issues'],
        params: repoParamsSchema,
        querystring: issueQuerySchema,
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
        const accessToken = request.githubAccessToken
        const { username } = request.user
        const issueService = new IssueService(accessToken, username)
        const issues = await issueService.getIssues(owner, repo, state, per_page)
        return successResponse(issues)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch issues'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Route to get pull requests
  app.get(
    '/:owner/:repo/pulls',
    {
      schema: {
        description: 'Get pull requests for a repository',
        tags: ['issues'],
        params: repoParamsSchema,
        querystring: issueQuerySchema,
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
        const accessToken = request.githubAccessToken
        const { username } = request.user
        const issueService = new IssueService(accessToken, username)
        const pulls = await issueService.getPullRequests(owner, repo, state, per_page)
        return successResponse(pulls)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch pull requests'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Route to get labels
  app.get(
    '/:owner/:repo/labels',
    {
      schema: {
        description: 'Get all labels for a repository',
        tags: ['issues'],
        params: repoParamsSchema,
        response: {
          200: labelsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const accessToken = request.githubAccessToken
        const { username } = request.user
        const issueService = new IssueService(accessToken, username)
        const labels = await issueService.getLabels(owner, repo)
        return successResponse(labels)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch labels'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Route to get label statistics
  app.get(
    '/:owner/:repo/label-stats',
    {
      schema: {
        description: 'Get label usage statistics',
        tags: ['issues'],
        params: repoParamsSchema,
        response: {
          200: labelsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const accessToken = request.githubAccessToken
        const { username } = request.user
        const issueService = new IssueService(accessToken, username)
        const labelStats = await issueService.getLabelStats(owner, repo)
        return successResponse(labelStats)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch label statistics'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Route to get issue statistics
  app.get(
    '/:owner/:repo/issue-stats',
    {
      schema: {
        description: 'Get issue statistics (counts, average close time)',
        tags: ['issues'],
        params: repoParamsSchema,
        response: {
          200: issueStatsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const accessToken = request.githubAccessToken
        const { username } = request.user
        const issueService = new IssueService(accessToken, username)
        const stats = await issueService.getIssueStats(owner, repo)
        return successResponse(stats)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch issue statistics'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Route to get pull request statistics
  app.get(
    '/:owner/:repo/pull-request-stats',
    {
      schema: {
        description: 'Get pull request statistics (counts, merge rate, average merge time)',
        tags: ['issues'],
        params: repoParamsSchema,
        response: {
          200: pullRequestStatsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const accessToken = request.githubAccessToken
        const { username } = request.user
        const issueService = new IssueService(accessToken, username)
        const stats = await issueService.getPullRequestStats(owner, repo)
        return successResponse(stats)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch pull request statistics'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Route to get response time metrics
  app.get(
    '/:owner/:repo/response-metrics',
    {
      schema: {
        description: 'Get response time metrics (first response time, close time, median values)',
        tags: ['issues'],
        params: repoParamsSchema,
        response: {
          200: responseTimeMetricsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const accessToken = request.githubAccessToken
        const { username } = request.user
        const issueService = new IssueService(accessToken, username)
        const metrics = await issueService.getResponseTimeMetrics(owner, repo)
        return successResponse(metrics)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch response time metrics'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )
}
