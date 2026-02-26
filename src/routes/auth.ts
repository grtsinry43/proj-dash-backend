import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { exchangeCodeForToken, getGithubUser } from '@/services/github.service'
import prisma from '@/lib/prisma'
import { createResponseSchema, ErrorCode, errorResponse, successResponse } from '@/types/response'

// Schema for login request body
const loginBodySchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
})

// Schema for login response data
const loginDataSchema = z.object({
  token: z.string(),
  workspaceId: z.string(),
})

// Use the unified response format
const loginSuccessSchema = createResponseSchema(loginDataSchema)
const loginErrorSchema = createResponseSchema(z.null())

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/login',
    {
      schema: {
        description: 'Login with GitHub App OAuth code (user-to-server authentication)',
        tags: ['auth'],
        body: loginBodySchema,
        response: {
          200: loginSuccessSchema,
          500: loginErrorSchema,
        },
      },
    },
    async (request, reply) => {
      // ✅ Type is automatically inferred from Zod schema
      const { code } = request.body

      try {
        const accessToken = await exchangeCodeForToken(code)
        const githubUser = await getGithubUser(accessToken)

        // Convert number to string as Prisma schema expects String
        let user = await prisma.user.findUnique({
          where: { githubId: String(githubUser.id) },
        })

        user ??= await prisma.user.create({
          data: {
            githubId: String(githubUser.id),
            username: githubUser.login,
            avatarUrl: githubUser.avatar_url,
            accessToken,
          },
        })

        if (user.accessToken !== accessToken) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { accessToken },
          })
        }

        const ownerWorkspaceMembership = await prisma.workspaceMember.findFirst({
          where: {
            userId: user.id,
            role: 'OWNER',
          },
          select: {
            workspaceId: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        })

        let workspaceId = ownerWorkspaceMembership?.workspaceId

        if (!workspaceId) {
          const workspace = await prisma.workspace.create({
            data: {
              name: `${user.username}'s Workspace`,
              createdByUserId: user.id,
              members: {
                create: {
                  userId: user.id,
                  role: 'OWNER',
                },
              },
            },
          })

          workspaceId = workspace.id
        }

        // Generate JWT token
        const token = app.jwt.sign(
          {
            sub: user.id,
            username: user.username,
            avatarUrl: user.avatarUrl,
          },
          { expiresIn: '1d' }
        )

        return successResponse({ token, workspaceId })
      } catch (error) {
        app.log.error({ error }, 'Authentication Error')
        return reply.status(500).send(errorResponse(ErrorCode.AUTH_FAILED, 'Authentication failed'))
      }
    }
  )
}
