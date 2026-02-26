import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { authMiddleware } from '@/middlewares/auth.middleware'
import { workspaceAdminMiddleware, workspaceMiddleware } from '@/middlewares/workspace.middleware'
import { GitHubService } from '@/services/github.service'
import { requireWorkspace } from '@/services/workspace.service'
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

const monitoredRepoIdParamsSchema = z.object({
  id: z.string(),
})

const addMonitoredRepoBodySchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
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

const monitoredRepoSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  repositoryId: z.number().nullable(),
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  isActive: z.boolean(),
  addedByUserId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const removeMonitoredRepoResultSchema = z.object({
  id: z.string(),
  isActive: z.boolean(),
})

const reposListSchema = repoListItemSchema.array()

// Use the unified response format
const reposListResponseSchema = createResponseSchema(reposListSchema)
const monitoredReposResponseSchema = createResponseSchema(monitoredRepoSchema.array())
const monitoredRepoResponseSchema = createResponseSchema(monitoredRepoSchema)
const removeMonitoredRepoResponseSchema = createResponseSchema(removeMonitoredRepoResultSchema)
const repoStatsResponseSchema = createResponseSchema(repoStatsSchema)
const repoOverviewResponseSchema = createResponseSchema(repoOverviewSchema)
const realtimeStatsResponseSchema = createResponseSchema(realtimeStatsSchema)

export const repoRoutes: FastifyPluginAsyncZod = async (app) => {
  // All routes in this plugin require authentication and workspace context
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', workspaceMiddleware)

  // Route to list monitored repositories for current workspace
  app.get(
    '/',
    {
      schema: {
        description: 'Get monitored repositories configured for current workspace',
        tags: ['repos'],
        response: {
          200: monitoredReposResponseSchema,
        },
      },
    },
    async (request) => {
      const workspace = requireWorkspace(request)
      const monitoredRepos = await prisma.monitoredRepository.findMany({
        where: {
          workspaceId: workspace.id,
          isActive: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      return successResponse(monitoredRepos)
    }
  )

  // Route to discover repositories accessible by current user (admin only)
  app.get(
    '/discover',
    {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      preHandler: workspaceAdminMiddleware,
      schema: {
        description: 'Discover repositories available to authenticated user for workspace setup',
        tags: ['repos'],
        response: {
          200: reposListResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const accessToken = request.githubAccessToken
        const { username } = request.user
        const githubService = new GitHubService(accessToken, username)
        const repos = await githubService.getRepositories()
        return successResponse(repos)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to discover repositories'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Route to add monitored repository for current workspace (admin only)
  app.post(
    '/monitored',
    {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      preHandler: workspaceAdminMiddleware,
      schema: {
        description: 'Add a repository to monitored list for current workspace',
        tags: ['repos'],
        body: addMonitoredRepoBodySchema,
        response: {
          200: monitoredRepoResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const workspace = requireWorkspace(request)
        const { owner, repo } = request.body
        const accessToken = request.githubAccessToken
        const { username, sub } = request.user
        const githubService = new GitHubService(accessToken, username)

        const overview = await githubService.getRepositoryOverview(owner, repo)
        const monitoredRepo = await prisma.monitoredRepository.upsert({
          where: {
            workspaceId_fullName: {
              workspaceId: workspace.id,
              fullName: overview.fullName,
            },
          },
          update: {
            owner: overview.owner,
            name: overview.name,
            repositoryId: overview.id,
            isActive: true,
            addedByUserId: sub,
          },
          create: {
            workspaceId: workspace.id,
            repositoryId: overview.id,
            owner: overview.owner,
            name: overview.name,
            fullName: overview.fullName,
            isActive: true,
            addedByUserId: sub,
          },
        })

        return successResponse(monitoredRepo)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to add monitored repository'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Route to disable monitored repository for current workspace (admin only)
  app.delete(
    '/monitored/:id',
    {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      preHandler: workspaceAdminMiddleware,
      schema: {
        description: 'Disable a monitored repository in current workspace',
        tags: ['repos'],
        params: monitoredRepoIdParamsSchema,
        response: {
          200: removeMonitoredRepoResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const workspace = requireWorkspace(request)
        const existing = await prisma.monitoredRepository.findFirst({
          where: {
            id: request.params.id,
            workspaceId: workspace.id,
          },
        })

        if (!existing) {
          return await reply
            .status(404)
            .send(errorResponse(ErrorCode.NOT_FOUND, 'Monitored repository not found'))
        }

        const monitoredRepo = await prisma.monitoredRepository.update({
          where: { id: existing.id },
          data: { isActive: false },
        })

        return successResponse({ id: monitoredRepo.id, isActive: monitoredRepo.isActive })
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to remove monitored repository'
        return reply.status(500).send(errorResponse(ErrorCode.INTERNAL_ERROR, errorMessage))
      }
    }
  )

  // Route to get statistics for a specific repository
  app.get(
    '/:owner/:repo/stats',
    {
      schema: {
        description: 'Get statistics for a monitored repository',
        tags: ['repos'],
        params: repoParamsSchema,
        response: {
          200: repoStatsResponseSchema,
        },
      },
    },
    async (request) => {
      const { owner, repo } = request.params
      const accessToken = request.githubAccessToken
      const { username } = request.user
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
        const accessToken = request.githubAccessToken
        const { username } = request.user
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
        const accessToken = request.githubAccessToken
        const { username } = request.user
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
