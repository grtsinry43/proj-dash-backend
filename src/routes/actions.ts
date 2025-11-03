import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import * as actionsService from '../services/actions.service'
import {
  createResponseSchema,
  ErrorCode,
  errorResponse,
  errorResponseSchema,
  successResponse,
} from '@/types/response'

// Schema for request parameters
const repoParamsSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
})

const workflowParamsSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  workflowId: z.number().describe('Workflow ID'),
})

const runParamsSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  runId: z.number().describe('Run ID'),
})

const runsQuerySchema = z.object({
  status: z.enum(['completed', 'in_progress', 'queued']).optional(),
  perPage: z.coerce.number().min(1).max(100).default(30).optional(),
  page: z.coerce.number().min(1).default(1).optional(),
})

// Response schemas
const workflowInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
  path: z.string(),
  state: z.string(),
  badgeUrl: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const workflowRunInfoSchema = z.object({
  id: z.number(),
  workflowId: z.number(),
  runNumber: z.number(),
  event: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  headBranch: z.string().nullable(),
  headSha: z.string(),
  triggerUser: z.string().nullable(),
  htmlUrl: z.string(),
  runStartedAt: z.string().nullable(),
  updatedAt: z.string(),
})

const workflowJobInfoSchema = z.object({
  id: z.number(),
  runId: z.number(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  runnerName: z.string().nullable(),
  runnerGroupName: z.string().nullable(),
  htmlUrl: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
})

const workflowRunsResponseSchema = z.object({
  runs: workflowRunInfoSchema.array(),
  totalCount: z.number(),
})

const workflowStatsSchema = z.object({
  totalRuns: z.number(),
  successfulRuns: z.number(),
  failedRuns: z.number(),
  cancelledRuns: z.number(),
  successRate: z.number(),
  averageDuration: z.number().nullable(),
  recentRuns: workflowRunInfoSchema.array(),
})

// Create response schemas
const workflowsResponseSchema = createResponseSchema(workflowInfoSchema.array())
const runsResponseSchema = createResponseSchema(workflowRunsResponseSchema)
const runDetailsResponseSchema = createResponseSchema(workflowRunInfoSchema)
const jobsResponseSchema = createResponseSchema(workflowJobInfoSchema.array())
const statsResponseSchema = createResponseSchema(workflowStatsSchema)

export const actionsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  // Get all workflows for a repository
  fastify.get(
    '/:owner/:repo/workflows',
    {
      schema: {
        description: 'Get all workflows for a repository',
        tags: ['actions'],
        params: repoParamsSchema,
        response: {
          200: workflowsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const workflows = await actionsService.getWorkflows(owner, repo)
        return successResponse(workflows)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch workflows'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Get workflow runs for a repository
  fastify.get(
    '/:owner/:repo/runs',
    {
      schema: {
        description: 'Get workflow runs for a repository',
        tags: ['actions'],
        params: repoParamsSchema,
        querystring: runsQuerySchema,
        response: {
          200: runsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { status, perPage, page } = request.query
        const result = await actionsService.getWorkflowRuns(owner, repo, {
          status,
          perPage,
          page,
        })
        return successResponse(result)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch workflow runs'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Get runs for a specific workflow
  fastify.get(
    '/:owner/:repo/workflows/:workflowId/runs',
    {
      schema: {
        description: 'Get runs for a specific workflow',
        tags: ['actions'],
        params: workflowParamsSchema,
        querystring: runsQuerySchema,
        response: {
          200: runsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo, workflowId } = request.params
        const { status, perPage, page } = request.query
        const result = await actionsService.getWorkflowRunsByWorkflow(owner, repo, workflowId, {
          status,
          perPage,
          page,
        })
        return successResponse(result)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch workflow runs for workflow'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Get details of a specific workflow run
  fastify.get(
    '/:owner/:repo/runs/:runId',
    {
      schema: {
        description: 'Get details of a specific workflow run',
        tags: ['actions'],
        params: runParamsSchema,
        response: {
          200: runDetailsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo, runId } = request.params
        const run = await actionsService.getWorkflowRunDetails(owner, repo, runId)
        return successResponse(run)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch workflow run details'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Get jobs for a specific workflow run
  fastify.get(
    '/:owner/:repo/runs/:runId/jobs',
    {
      schema: {
        description: 'Get jobs for a specific workflow run',
        tags: ['actions'],
        params: runParamsSchema,
        response: {
          200: jobsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo, runId } = request.params
        const jobs = await actionsService.getWorkflowRunJobs(owner, repo, runId)
        return successResponse(jobs)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch workflow jobs'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Get workflow statistics
  fastify.get(
    '/:owner/:repo/stats',
    {
      schema: {
        description: 'Get workflow statistics for a repository (success rate, average duration)',
        tags: ['actions'],
        params: repoParamsSchema,
        response: {
          200: statsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const stats = await actionsService.getWorkflowStats(owner, repo)
        return successResponse(stats)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch workflow stats'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )
}
