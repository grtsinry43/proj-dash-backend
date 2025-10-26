import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { GitHubService } from '@/services/github.service'
import { authMiddleware } from '@/middlewares/auth.middleware'
import { createResponseSchema, successResponse } from '@/types/response'

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

const reposListSchema = z.array(repoListItemSchema)

// Use the unified response format
const reposListResponseSchema = createResponseSchema(reposListSchema)
const repoStatsResponseSchema = createResponseSchema(repoStatsSchema)

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
}
