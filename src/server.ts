import fastify from 'fastify';
import { authRoutes } from './routes/auth';
import { webhookRoutes } from './routes/webhooks';
import { repoRoutes } from './routes/repos';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import 'dotenv/config';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      sub: string;
      username: string;
      avatarUrl: string;
      accessToken: string;
    };
  }
}

async function bootstrap() {
  const app = fastify({
    logger: true,
  });

  app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!,
  });

  app.register(fastifyCors, {
    origin: process.env.FRONTEND_URL,
  });

  app.register(authRoutes, { prefix: '/auth' });
  app.register(webhookRoutes, { prefix: '/webhooks' });
  app.register(repoRoutes, { prefix: '/repos' });

  await app.listen({ port: 3333, host: '0.0.0.0' });
}

bootstrap();
