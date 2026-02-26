import type { FastifyReply, FastifyRequest } from 'fastify'
import { ErrorCode, errorResponse } from '@/types/response'
import {
  isRepositoryMonitored,
  isWorkspaceAdminRole,
  normalizeWorkspaceIdHeader,
  resolveWorkspaceContext,
} from '@/services/workspace.service'

interface RepoParams {
  owner?: string
  repo?: string
}

export const workspaceMiddleware = async (req: FastifyRequest, reply: FastifyReply) => {
  const userId = req.user.sub

  const requestedWorkspaceId = normalizeWorkspaceIdHeader(req.headers['x-workspace-id'])
  const workspace = await resolveWorkspaceContext(userId, requestedWorkspaceId)

  if (!workspace) {
    return reply.status(403).send(errorResponse(ErrorCode.FORBIDDEN, 'No workspace access'))
  }

  req.workspace = workspace

  const params = req.params as RepoParams
  if (typeof params.owner === 'string' && typeof params.repo === 'string') {
    const isMonitored = await isRepositoryMonitored(workspace.id, params.owner, params.repo)

    if (!isMonitored) {
      return reply
        .status(403)
        .send(errorResponse(ErrorCode.FORBIDDEN, 'Repository is not configured for this workspace'))
    }
  }
}

export const workspaceAdminMiddleware = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!req.workspace) {
    await workspaceMiddleware(req, reply)
    if (reply.sent) {
      return
    }
  }

  if (!req.workspace || !isWorkspaceAdminRole(req.workspace.role)) {
    return reply
      .status(403)
      .send(errorResponse(ErrorCode.FORBIDDEN, 'Admin role is required for this action'))
  }
}
