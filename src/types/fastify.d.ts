import type { WorkspaceRole } from '@prisma/client'

declare module 'fastify' {
  interface FastifyRequest {
    githubAccessToken: string
    workspace?: {
      id: string
      name: string
      role: WorkspaceRole
      createdAt: Date
      updatedAt: Date
    }
  }
}
