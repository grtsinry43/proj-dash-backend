import fastify from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import 'dotenv/config'

import { authRoutes } from '@/routes/auth'
import { repoRoutes } from '@/routes/repos'
import { statsRoutes } from '@/routes/stats'
import { webhookRoutes } from '@/routes/webhooks'

import swagger from '@fastify/swagger'

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
  }).withTypeProvider<ZodTypeProvider>()

  // Set the validator and serializer for Zod
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Register plugins
  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET,
  })

  await app.register(fastifyCors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })

  // Register Swagger for OpenAPI spec generation
  await app.register(swagger, {
    transform: jsonSchemaTransform,
    openapi: {
      info: {
        title: 'Project Dash API',
        description: `
# GitHub Dashboard Backend API

Backend API for the Project Dash application - A modern GitHub repository dashboard with real-time statistics and analytics.

## Features
- 🔐 GitHub OAuth Authentication
- 📊 Repository Statistics & Analytics
- 🔔 GitHub Webhook Integration
- ⚡ Redis Caching for Performance

## Authentication
Most endpoints require authentication via JWT token.

**How to authenticate:**
1. Login via \`POST /auth/login\` with GitHub OAuth code
2. Use the returned JWT token in the \`Authorization\` header: \`Bearer <token>\`

## Rate Limiting
GitHub API rate limits apply. Authenticated requests: 5,000/hour.
        `,
        version: '1.0.0',
        contact: {
          name: 'API Support',
          url: 'https://github.com/yourusername/proj-dash-backend',
        },
        license: {
          name: 'Apache 2.0',
          url: 'https://www.apache.org/licenses/LICENSE-2.0.html',
        },
      },
      servers: [
        {
          url: 'http://localhost:3333',
          description: 'Local development server',
        },
        {
          url: 'https://api.projectdash.example.com',
          description: 'Production server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Enter your JWT token obtained from `/auth/login`',
          },
        },
      },
      security: [
        {
          bearerAuth: [],
        },
      ],
      tags: [
        {
          name: 'auth',
          description: 'Authentication endpoints',
        },
        {
          name: 'repos',
          description: 'Repository management and statistics',
        },
        {
          name: 'stats',
          description: 'User statistics and analytics',
        },
        {
          name: 'webhooks',
          description: 'GitHub webhook handlers',
        },
      ],
    },
  })

  app.get('/docs', (_, reply) => {
    reply.type('text/html').send(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>API Docs — Project Dashboard</title>
        <style>
          body { margin: 0; }
        </style>
      </head>
      <body>
        <!-- Scalar API Reference -->
        <script id="api-reference" data-url="/docs/json"></script>
        <script>
          var configuration = {
            theme: 'purple',
            layout: 'modern',
            darkMode: true,
            hideModels: false,
            hideDownloadButton: false,
            searchHotKey: 'k',
            customCss: \`
              .scalar-app {
                --scalar-font: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
              }
            \`
          }

          var apiReference = document.getElementById('api-reference')
          apiReference.dataset.configuration = JSON.stringify(configuration)
        </script>
        <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
      </body>
      </html>
    `)
  })

  app.get('/docs/json', (_, reply) => {
    reply.send(app.swagger())
  })

  // Register routes
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(repoRoutes, { prefix: '/repos' })
  await app.register(statsRoutes, { prefix: '/stats' })
  await app.register(webhookRoutes, { prefix: '/webhooks' })

  // Add a generic error handler
  app.setErrorHandler((error, _, reply) => {
    app.log.error(error)
    reply.status(500).send({ error: 'Internal Server Error' })
  })
  return app
}

// Start the server
void (async () => {
  try {
    const app = await bootstrap()
    await app.listen({ port: 3333, host: '0.0.0.0' })
  } catch (err) {
    console.error(err)
    // eslint-disable-next-line n/no-process-exit
    process.exit(1)
  }
})()
