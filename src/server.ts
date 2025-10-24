import fastify from 'fastify';
import { 
  serializerCompiler, 
  validatorCompiler, 
  ZodTypeProvider 
} from 'fastify-type-provider-zod';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import 'dotenv/config';

import { authRoutes } from './routes/auth';
import { repoRoutes } from './routes/repos';
import { statsRoutes } from './routes/stats';
import { webhookRoutes } from './routes/webhooks';

import swagger from '@fastify/swagger';

// Main function to bootstrap the server
async function bootstrap() {
  // Initialize Fastify with ZodTypeProvider
  const app = fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  }).withTypeProvider<ZodTypeProvider>();

  // Set the validator and serializer for Zod
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Register plugins
  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!,
  });

  await app.register(fastifyCors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Register Swagger for OpenAPI spec generation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Project Dash API',
        description: 'Backend API documentation for Project Dash application.',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [
        {
          bearerAuth: [],
        },
      ],
    },
  });

  // --- API Documentation with RapiDoc ---
  app.get('/docs', (req, reply) => {
    reply.type('text/html').send(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <script type="module" src="https://unpkg.com/rapidoc/dist/rapidoc-min.js"></script>
      </head>
      <body>
        <rapi-doc
          spec-url="/docs/json"
          theme="dark"
          render-style="view"
          show-header="false"
          allow-server-selection="false"
          allow-authentication="true"
        > </rapi-doc>
      </body>
      </html>
    `);
  });

  app.get('/docs/json', (req, reply) => {
    reply.send(app.swagger());
  });

  // Register routes
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(repoRoutes, { prefix: '/repos' });
  await app.register(statsRoutes, { prefix: '/stats' });
  await app.register(webhookRoutes, { prefix: '/webhooks' });

  // Add a generic error handler
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    reply.status(500).send({ error: 'Internal Server Error' });
  });

  return app;
}

// Start the server
(async () => {
  try {
    const app = await bootstrap();
    await app.listen({ port: 3333, host: '0.0.0.0' });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
