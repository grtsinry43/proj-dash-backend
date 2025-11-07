import fastify from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import fastifySwagger from '@fastify/swagger'
import fastifyApiReference from '@scalar/fastify-api-reference'
import 'dotenv/config'

import { openApiConfig, scalarConfig } from '@/config/docs'
import { authRoutes } from '@/routes/auth'
import { repoRoutes } from '@/routes/repos'
import { activityRoutes } from '@/routes/activity'
import { codeStatsRoutes } from '@/routes/code-stats'
import { contributorsRoutes } from '@/routes/contributors'
import { releasesRoutes } from '@/routes/releases'
import { actionsRoutes } from '@/routes/actions'
import { issueRoutes } from '@/routes/issue'
import { statsRoutes } from '@/routes/stats'
import { webhookRoutes } from '@/routes/webhooks'
import { popularityRoutes } from '@/routes/popularity'
import { ErrorCode, errorResponse } from '@/types/response'

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

  // Register Swagger for OpenAPI spec generation (BEFORE routes)
  await app.register(fastifySwagger, {
    ...openApiConfig,
    transform: jsonSchemaTransform,
  })

  // Register routes
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(repoRoutes, { prefix: '/repos' })
  await app.register(activityRoutes, { prefix: '/activity' })
  await app.register(codeStatsRoutes, { prefix: '/code-stats' })
  await app.register(contributorsRoutes, { prefix: '/contributors' })
  await app.register(releasesRoutes, { prefix: '/releases' })
  await app.register(actionsRoutes, { prefix: '/actions' })
  await app.register(issueRoutes, { prefix: '/issues' })
  await app.register(statsRoutes, { prefix: '/stats' })
  await app.register(popularityRoutes, { prefix: '/popularity' })
  await app.register(webhookRoutes, { prefix: '/webhooks' })

  // Register Scalar API Reference UI (AFTER routes)
  await app.register(fastifyApiReference, scalarConfig)

  // Add 404 not found handler
  app.setNotFoundHandler((request, reply) => {
    reply
      .status(404)
      .send(errorResponse(ErrorCode.NOT_FOUND, `Route ${request.method}:${request.url} not found`))
  })

  // Add a generic error handler
  app.setErrorHandler((error, _, reply) => {
    app.log.error(error)
    reply.status(500).send(errorResponse(ErrorCode.INTERNAL_ERROR, 'Internal Server Error'))
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
