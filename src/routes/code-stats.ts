import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authMiddleware } from '@/middlewares/auth.middleware'
import { CodeStatsService } from '@/services/code-stats.service'
import {
  createResponseSchema,
  ErrorCode,
  errorResponse,
  errorResponseSchema,
  successResponse,
} from '@/types/response'

// Schema for request parameters
const repoParamsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
})

// Query schemas
const fileTreeQuerySchema = z.object({
  branch: z.string().optional().default('main'),
  recursive: z.coerce.boolean().optional().default(true),
})

const hotFilesQuerySchema = z.object({
  limit: z.coerce.number().min(10).max(200).optional().default(100),
  top: z.coerce.number().min(5).max(50).optional().default(20),
})

const fileStructureQuerySchema = z.object({
  branch: z.string().optional().default('main'),
})

// Response schemas
const languageStatsSchema = z.record(z.string(), z.number())

const codeFrequencySchema = z.object({
  week: z.number(),
  additions: z.number(),
  deletions: z.number(),
})

const fileTreeSchema = z.object({
  path: z.string(),
  mode: z.string(),
  type: z.enum(['blob', 'tree']),
  sha: z.string(),
  size: z.number().optional(),
  url: z.string().optional(),
})

const hotFileSchema = z.object({
  path: z.string(),
  changeCount: z.number(),
  lastModified: z.string(),
  authors: z.string().array(),
})

const fileStructureSummarySchema = z.object({
  totalFiles: z.number(),
  totalDirectories: z.number(),
  totalSize: z.number(),
  filesByExtension: z.record(z.string(), z.number()),
  largestFiles: z
    .object({
      path: z.string(),
      size: z.number(),
    })
    .array(),
})

// Response schemas with unified format
const languageStatsResponseSchema = createResponseSchema(languageStatsSchema)
const codeFrequencyResponseSchema = createResponseSchema(codeFrequencySchema.array())
const fileTreeResponseSchema = createResponseSchema(fileTreeSchema.array())
const hotFilesResponseSchema = createResponseSchema(hotFileSchema.array())
const fileStructureSummaryResponseSchema = createResponseSchema(fileStructureSummarySchema)

export const codeStatsRoutes: FastifyPluginAsyncZod = async (app) => {
  // All routes in this plugin require authentication
  app.addHook('preHandler', authMiddleware)

  // Route to get language distribution
  app.get(
    '/:owner/:repo/languages',
    {
      schema: {
        description: 'Get programming language distribution (in bytes)',
        tags: ['code-stats'],
        params: repoParamsSchema,
        response: {
          200: languageStatsResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { accessToken, username } = request.user
        const codeStatsService = new CodeStatsService(accessToken, username)
        const languages = await codeStatsService.getLanguageStats(owner, repo)
        return successResponse(languages)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch language statistics'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Route to get code frequency (weekly additions/deletions)
  app.get(
    '/:owner/:repo/code-frequency',
    {
      schema: {
        description:
          'Get code frequency statistics (weekly additions/deletions). ⚠️ Only for repos with <10k commits',
        tags: ['code-stats'],
        params: repoParamsSchema,
        response: {
          200: codeFrequencyResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { accessToken, username } = request.user
        const codeStatsService = new CodeStatsService(accessToken, username)
        const frequency = await codeStatsService.getCodeFrequency(owner, repo)
        return successResponse(frequency)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch code frequency'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Route to get file tree structure
  app.get(
    '/:owner/:repo/file-tree',
    {
      schema: {
        description: 'Get repository file tree structure',
        tags: ['code-stats'],
        params: repoParamsSchema,
        querystring: fileTreeQuerySchema,
        response: {
          200: fileTreeResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { branch, recursive } = request.query
        const { accessToken, username } = request.user
        const codeStatsService = new CodeStatsService(accessToken, username)
        const fileTree = await codeStatsService.getFileTree(owner, repo, branch, recursive)
        return successResponse(fileTree)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch file tree'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Route to get hot files (most frequently modified)
  app.get(
    '/:owner/:repo/hot-files',
    {
      schema: {
        description: 'Get hot files (most frequently modified files) by analyzing recent commits',
        tags: ['code-stats'],
        params: repoParamsSchema,
        querystring: hotFilesQuerySchema,
        response: {
          200: hotFilesResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { limit, top } = request.query
        const { accessToken, username } = request.user
        const codeStatsService = new CodeStatsService(accessToken, username)
        const hotFiles = await codeStatsService.getHotFiles(owner, repo, limit, top)
        return successResponse(hotFiles)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to analyze hot files'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )

  // Route to get file structure summary
  app.get(
    '/:owner/:repo/file-structure-summary',
    {
      schema: {
        description: 'Get file structure summary (counts by type, largest files, etc.)',
        tags: ['code-stats'],
        params: repoParamsSchema,
        querystring: fileStructureQuerySchema,
        response: {
          200: fileStructureSummaryResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { owner, repo } = request.params
        const { branch } = request.query
        const { accessToken, username } = request.user
        const codeStatsService = new CodeStatsService(accessToken, username)
        const summary = await codeStatsService.getFileStructureSummary(owner, repo, branch)
        return successResponse(summary)
      } catch (err) {
        const error = err as Error
        const errorMessage = error.message || 'Failed to fetch file structure summary'
        return reply.status(500).send(errorResponse(ErrorCode.GITHUB_API_ERROR, errorMessage))
      }
    }
  )
}
