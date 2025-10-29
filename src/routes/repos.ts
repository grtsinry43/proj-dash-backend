import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authMiddleware } from '@/middlewares/auth.middleware'
import { GitHubService } from '@/services/github.service'
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

// Schema for repository statistics response
const repoStatsSchema = z.object({
  stars: z.number(),
  forks: z.number(),
  openIssues: z.number(),
  commits: z.number(),
  releases: z.number(),
  contributors: z.number(),
})

// Schema for repository overview response
const repoOverviewSchema = z.object({
  id: z.number(),
  name: z.string(),
  fullName: z.string(),
  owner: z.string(),
  description: z.string().nullable(),
  htmlUrl: z.string(),
  homepage: z.string().nullable(),
  isPrivate: z.boolean(),
  isFork: z.boolean(),
  isArchived: z.boolean(),
  isTemplate: z.boolean(),
  stargazersCount: z.number(),
  forksCount: z.number(),
  watchersCount: z.number(),
  openIssuesCount: z.number(),
  size: z.number(),
  language: z.string().nullable(),
  languages: z.record(z.string(), z.number()).nullable(),
  topics: z.string().array(),
  licenseName: z.string().nullable(),
  licenseKey: z.string().nullable(),
  githubCreatedAt: z.date(),
  githubUpdatedAt: z.date(),
  githubPushedAt: z.date().nullable(),
  lastSyncedAt: z.date(),
})

// Schema for real-time stats
const realtimeStatsSchema = z.object({
  stargazersCount: z.number(),
  forksCount: z.number(),
  watchersCount: z.number(),
  openIssuesCount: z.number(),
})

// Schema for repository list response
const repoListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  private: z.boolean(),
  html_url: z.url(),
  description: z.string().nullable(),
  stargazers_count: z.number(),
  watchers_count: z.number(),
  forks_count: z.number(),
  language: z.string().nullable(),
  owner: z.object({
    login: z.string(),
    avatar_url: z.url(),
  }),
})

const reposListSchema = repoListItemSchema.array()

// Use the unified response format
const reposListResponseSchema = createResponseSchema(reposListSchema)
const repoStatsResponseSchema = createResponseSchema(repoStatsSchema)
const repoOverviewResponseSchema = createResponseSchema(repoOverviewSchema)
const realtimeStatsResponseSchema = createResponseSchema(realtimeStatsSchema)

export const repoRoutes: FastifyPluginAsyncZod = async (app) => {
  // All routes in this plugin require authentication
  app.addHook('preHandler', authMiddleware)

  // Route to list repositories for the authenticated user
  app.get(
    '/',
    {
      schema: {
        description: 'Get repositories for authenticated user',
        tags: ['repos'],
        response: {
          200: reposListResponseSchema,
        },
      },
    },
    async (request) => {
      const { accessToken, username } = request.user
      const githubService = new GitHubService(accessToken, username)
      const repos = await githubService.getRepositories()
      return successResponse(repos)
    }
  )

  // Route to get statistics for a specific repository
  app.get(
    '/:owner/:repo/stats',
    {
      schema: {
        description: 'Get statistics for a specific repository',
        tags: ['repos'],
        params: repoParamsSchema,
        response: {
          200: repoStatsResponseSchema,
        },
      },
    },
    async (request) => {
      // ✅ Type is automatically inferred from Zod schema
      const { owner, repo } = request.params
      const { accessToken, username } = request.user
      const githubService = new GitHubService(accessToken, username)
      const stats = await githubService.getRepositoryStats(owner, repo)
      return successResponse(stats)
    }
  )

  // Route to get complete repository overview
  app.get(
    '/:owner/:repo/overview',
    {
      schema: {
        description: 'Get complete repository overview including metadata, languages, and topics',
        tags: ['repos'],
        params: repoParamsSchema,
        response: {
          200: repoOverviewResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { accessToken, username } = request.user
        const githubService = new GitHubService(accessToken, username)
        const overview = await githubService.getRepositoryOverview(owner, repo)
        return successResponse(overview)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch repository overview'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Route to get real-time statistics (cached for 1 minute)
  app.get(
    '/:owner/:repo/stats/realtime',
    {
      schema: {
        description:
          'Get real-time statistics (stars, forks, watchers, issues) with 1-minute cache',
        tags: ['repos'],
        params: repoParamsSchema,
        response: {
          200: realtimeStatsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { accessToken, username } = request.user
        const githubService = new GitHubService(accessToken, username)
        const stats = await githubService.getRealtimeStats(owner, repo)
        return successResponse(stats)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch real-time stats'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )
}
