import type { FastifyReply, FastifyRequest } from 'fastify'
import prisma from '@/lib/prisma'
import { ErrorCode, errorResponse } from '../types/response'

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

    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { accessToken: true },
    })

    if (!user?.accessToken) {
      return await reply
        .status(401)
        .send(errorResponse(ErrorCode.UNAUTHORIZED, 'GitHub authorization required'))
    }

    req.githubAccessToken = user.accessToken
  } catch (_error) {
    // If verification fails, send an unauthorized error
    return reply.status(401).send(errorResponse(ErrorCode.UNAUTHORIZED, 'Unauthorized'))
  }
}
