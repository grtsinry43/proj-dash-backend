import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { StatsService } from '../services/stats.service';
import { authMiddleware } from '../middlewares/auth.middleware';
import { createResponseSchema, successResponse } from '../types/response';

// Schema for overview stats response
const overviewStatsSchema = z.object({
  totalRepos: z.number(),
  totalStars: z.number(),
  totalForks: z.number(),
});

// Schema for activity stats response
const activityStatsSchema = z.object({
  totalCommitsLast30Days: z.number(),
});

// Use the unified response format
const overviewStatsResponseSchema = createResponseSchema(overviewStatsSchema);
const activityStatsResponseSchema = createResponseSchema(activityStatsSchema);

export const statsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', authMiddleware);

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
      const { accessToken, username } = request.user!;
      const statsService = new StatsService(accessToken, username);
      const overviewStats = await statsService.getOverviewStats();
      return successResponse(overviewStats);
    },
  );

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
      const { accessToken, username } = request.user!;
      const statsService = new StatsService(accessToken, username);
      const activityStats = await statsService.getActivityStats();
      return successResponse(activityStats);
    },
  );
};
