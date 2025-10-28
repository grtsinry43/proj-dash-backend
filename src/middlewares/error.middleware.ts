import type { FastifyInstance } from 'fastify'
import { ErrorCode, errorResponse } from '../types/response'

export function errorMiddleware(app: FastifyInstance) {
  app.setErrorHandler((error, _, reply) => {
    app.log.error(error)
    reply.status(500).send(errorResponse(ErrorCode.INTERNAL_ERROR, 'Internal Server Error'))
  })
}
