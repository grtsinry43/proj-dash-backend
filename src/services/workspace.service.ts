import type { WorkspaceRole } from '@prisma/client'
import type { FastifyRequest } from 'fastify'
import prisma from '@/lib/prisma'

export interface WorkspaceContext {
  id: string
  name: string
  role: WorkspaceRole
  createdAt: Date
  updatedAt: Date
}

export function normalizeWorkspaceIdHeader(
  workspaceHeaderValue: string | string[] | undefined
): string | undefined {
  if (!workspaceHeaderValue) {
    return undefined
  }

  if (Array.isArray(workspaceHeaderValue)) {
    return workspaceHeaderValue[0]
  }

  return workspaceHeaderValue
}

export function isWorkspaceAdminRole(role: WorkspaceRole): boolean {
  return role === 'OWNER' || role === 'ADMIN'
}

export async function resolveWorkspaceContext(
  userId: string,
  workspaceId?: string
): Promise<WorkspaceContext | null> {
  if (workspaceId) {
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
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
    })

    if (!membership) {
      return null
    }

    return {
      id: membership.workspace.id,
      name: membership.workspace.name,
      role: membership.role,
      createdAt: membership.workspace.createdAt,
      updatedAt: membership.workspace.updatedAt,
    }
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
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

  if (!membership) {
    return null
  }

  return {
    id: membership.workspace.id,
    name: membership.workspace.name,
    role: membership.role,
    createdAt: membership.workspace.createdAt,
    updatedAt: membership.workspace.updatedAt,
  }
}

export async function isRepositoryMonitored(
  workspaceId: string,
  owner: string,
  repo: string
): Promise<boolean> {
  const fullName = `${owner}/${repo}`

  const monitoredRepo = await prisma.monitoredRepository.findUnique({
    where: {
      workspaceId_fullName: {
        workspaceId,
        fullName,
      },
    },
    select: {
      isActive: true,
    },
  })

  return Boolean(monitoredRepo?.isActive)
}

export function requireWorkspace(request: FastifyRequest): WorkspaceContext {
  const workspace = request.workspace
  if (!workspace) {
    throw new Error('Workspace context is missing')
  }

  return workspace
}
