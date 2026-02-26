import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { StatsService } from '@/services/stats.service'
import { requireWorkspace } from '@/services/workspace.service'
import { authMiddleware } from '@/middlewares/auth.middleware'
import { workspaceMiddleware } from '@/middlewares/workspace.middleware'
import { createResponseSchema, successResponse } from '@/types/response'

// Schema for overview stats response
const overviewStatsSchema = z.object({
  totalRepos: z.number(),
  totalStars: z.number(),
  totalForks: z.number(),
})

// Schema for activity stats response
const activityStatsSchema = z.object({
  totalCommitsLast30Days: z.number(),
})

// Use the unified response format
const overviewStatsResponseSchema = createResponseSchema(overviewStatsSchema)
const activityStatsResponseSchema = createResponseSchema(activityStatsSchema)

export const statsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', workspaceMiddleware)

  app.get(
    '/overview',
    {
      schema: {
        description: 'Get overview statistics for authenticated user',
        tags: ['stats'],
        response: {
          200: overviewStatsResponseSchema,
        },
      },
    },
    async (request) => {
      const workspace = requireWorkspace(request)
      const accessToken = request.githubAccessToken
      const { username } = request.user
      const statsService = new StatsService(accessToken, username)

      const monitoredRepos = await prisma.monitoredRepository.findMany({
        where: {
          workspaceId: workspace.id,
          isActive: true,
        },
        select: {
          fullName: true,
        },
      })

      const monitoredRepoFullNames = monitoredRepos.map((repo) => repo.fullName)
      const overviewStats = await statsService.getOverviewStats(monitoredRepoFullNames)
      return successResponse(overviewStats)
    }
  )

  app.get(
    '/activity',
    {
      schema: {
        description: 'Get activity statistics for authenticated user',
        tags: ['stats'],
        response: {
          200: activityStatsResponseSchema,
        },
      },
    },
    async (request) => {
      const workspace = requireWorkspace(request)
      const accessToken = request.githubAccessToken
      const { username } = request.user
      const statsService = new StatsService(accessToken, username)

      const monitoredRepos = await prisma.monitoredRepository.findMany({
        where: {
          workspaceId: workspace.id,
          isActive: true,
        },
        select: {
          fullName: true,
        },
      })

      const monitoredRepoFullNames = monitoredRepos.map((repo) => repo.fullName)
      const activityStats = await statsService.getActivityStats(monitoredRepoFullNames)
      return successResponse(activityStats)
    }
  )
}
