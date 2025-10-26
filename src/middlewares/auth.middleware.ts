import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * This middleware function verifies the JWT token from the request.
 * Upon successful verification, it attaches the user payload to the request object.
 * The types for `request.user` are globally defined in `src/types/fastify-jwt.d.ts`,
 * so no explicit typing is needed here.
 */
export const authMiddleware = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    // This will verify the token and attach the user payload to `req.user`
    await req.jwtVerify()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    // If verification fails, send an unauthorized error
    reply.status(401).send({ error: 'Unauthorized' })
  }
}
