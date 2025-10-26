import type { FastifyInstance } from 'fastify'

export async function errorMiddleware(app: FastifyInstance) {
  app.setErrorHandler((error, _, reply) => {
    app.log.error(error)
    reply.status(500).send({ error: 'Internal Server Error' })
  })
}
