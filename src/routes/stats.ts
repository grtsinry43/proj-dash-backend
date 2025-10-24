import { FastifyInstance } from 'fastify';
import { StatsService } from '../services/stats.service';
import { authMiddleware } from '../middlewares/auth.middleware';

export async function statsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/overview', async (request, reply) => {
    const { accessToken, username } = request.user!;
    const statsService = new StatsService(accessToken, username);
    const overviewStats = await statsService.getOverviewStats();
    reply.send(overviewStats);
  });

  app.get('/activity', async (request, reply) => {
    const { accessToken, username } = request.user!;
    const statsService = new StatsService(accessToken, username);
    const activityStats = await statsService.getActivityStats();
    reply.send(activityStats);
  });
}
