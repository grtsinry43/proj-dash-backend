import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { authMiddleware } from '@/middlewares/auth.middleware'
import { workspaceAdminMiddleware, workspaceMiddleware } from '@/middlewares/workspace.middleware'
import { requireWorkspace } from '@/services/workspace.service'
import {
  createResponseSchema,
  ErrorCode,
  errorResponse,
  errorResponseSchema,
  successResponse,
} from '@/types/response'

const workspaceRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'])
const memberRoleSchema = z.enum(['ADMIN', 'MEMBER', 'VIEWER'])

const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: workspaceRoleSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})

const workspaceMemberSchema = z.object({
  id: z.string(),
  role: workspaceRoleSchema,
  user: z.object({
    id: z.string(),
    username: z.string(),
    avatarUrl: z.string(),
  }),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const createWorkspaceBodySchema = z.object({
  name: z.string().min(1).max(80),
})

const addWorkspaceMemberBodySchema = z.object({
  username: z.string().min(1),
  role: memberRoleSchema.optional().default('MEMBER'),
})

const workspaceListResponseSchema = createResponseSchema(workspaceSchema.array())
const workspaceResponseSchema = createResponseSchema(workspaceSchema)
const workspaceMembersResponseSchema = createResponseSchema(workspaceMemberSchema.array())
const workspaceMemberResponseSchema = createResponseSchema(workspaceMemberSchema)

export const workspacesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', authMiddleware)

  app.get(
    '/',
    {
      schema: {
        description: 'List all workspaces available to current user',
        tags: ['workspaces'],
        response: {
          200: workspaceListResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const memberships = await prisma.workspaceMember.findMany({
          where: {
            userId: request.user.sub,
          },
          include: {
            workspace: {
              select: {
                id: true,
                name: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        })

        const workspaces = memberships.map((membership) => ({
          id: membership.workspace.id,
          name: membership.workspace.name,
          role: membership.role,
          createdAt: membership.workspace.createdAt,
          updatedAt: membership.workspace.updatedAt,
        }))

        return successResponse(workspaces)
      } catch (err) {
        const error = err as Error
        return reply
          .status(500)
          .send(
            errorResponse(ErrorCode.INTERNAL_ERROR, error.message || 'Failed to list workspaces')
          )
      }
    }
  )

  app.get(
    '/current',
    {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      preHandler: workspaceMiddleware,
      schema: {
        description:
          'Get current workspace resolved from x-workspace-id header or default workspace',
        tags: ['workspaces'],
        response: {
          200: workspaceResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const workspace = requireWorkspace(request)

      return successResponse({
        id: workspace.id,
        name: workspace.name,
        role: workspace.role,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      })
    }
  )

  app.post(
    '/',
    {
      schema: {
        description: 'Create a new workspace. Creator is assigned OWNER role.',
        tags: ['workspaces'],
        body: createWorkspaceBodySchema,
        response: {
          200: workspaceResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { name } = request.body

        const workspace = await prisma.workspace.create({
          data: {
            name,
            createdByUserId: request.user.sub,
            members: {
              create: {
                userId: request.user.sub,
                role: 'OWNER',
              },
            },
          },
        })

        return successResponse({
          id: workspace.id,
          name: workspace.name,
          role: 'OWNER',
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        })
      } catch (err) {
        const error = err as Error
        return reply
          .status(500)
          .send(
            errorResponse(ErrorCode.INTERNAL_ERROR, error.message || 'Failed to create workspace')
          )
      }
    }
  )

  app.get(
    '/current/members',
    {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      preHandler: workspaceMiddleware,
      schema: {
        description: 'List members of current workspace',
        tags: ['workspaces'],
        response: {
          200: workspaceMembersResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const workspace = requireWorkspace(request)
        const members = await prisma.workspaceMember.findMany({
          where: {
            workspaceId: workspace.id,
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        })

        return successResponse(members)
      } catch (err) {
        const error = err as Error
        return reply
          .status(500)
          .send(
            errorResponse(
              ErrorCode.INTERNAL_ERROR,
              error.message || 'Failed to list workspace members'
            )
          )
      }
    }
  )

  app.post(
    '/current/members',
    {
      preHandler: [workspaceMiddleware, workspaceAdminMiddleware],
      schema: {
        description: 'Add or update a workspace member by username',
        tags: ['workspaces'],
        body: addWorkspaceMemberBodySchema,
        response: {
          200: workspaceMemberResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const workspace = requireWorkspace(request)
        const { username, role } = request.body

        const user = await prisma.user.findFirst({
          where: { username: { equals: username, mode: 'insensitive' } },
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        })

        if (!user) {
          return await reply.status(404).send(errorResponse(ErrorCode.NOT_FOUND, 'User not found'))
        }

        const membership = await prisma.workspaceMember.upsert({
          where: {
            workspaceId_userId: {
              workspaceId: workspace.id,
              userId: user.id,
            },
          },
          update: {
            role,
          },
          create: {
            workspaceId: workspace.id,
            userId: user.id,
            role,
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
        })

        return successResponse(membership)
      } catch (err) {
        const error = err as Error
        return reply
          .status(500)
          .send(
            errorResponse(
              ErrorCode.INTERNAL_ERROR,
              error.message || 'Failed to add workspace member'
            )
          )
      }
    }
  )
}
