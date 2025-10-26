import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { verifyGithubWebhook } from '@/middlewares/verify-webhook.middleware'
import { handleWebhook } from '@/services/webhook.service'
import type { GitHubWebhookPayload } from '@/types/github'
import { createResponseSchema, ErrorCode, errorResponse, successResponse } from '@/types/response'

// Schema for webhook payload (flexible since payloads vary by event type)
const webhookBodySchema = z.record(z.string(), z.any())

// Schema for webhook response data
const webhookDataSchema = z.object({
  message: z.string(),
})

// Use the unified response format
const webhookSuccessSchema = createResponseSchema(webhookDataSchema)
const webhookErrorSchema = createResponseSchema(z.null())

export const webhookRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/github',
    {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      preHandler: verifyGithubWebhook,
      schema: {
        description: 'Handle GitHub webhook events',
        tags: ['webhooks'],
        body: webhookBodySchema,
        response: {
          200: webhookSuccessSchema,
          500: webhookErrorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        // Type cast to GitHubWebhookPayload for service function
        await handleWebhook(request.body as GitHubWebhookPayload)
        return successResponse({ message: 'Webhook received' })
      } catch (error) {
        app.log.error({ error }, 'Webhook processing error')
        return reply
          .status(500)
          .send(errorResponse(ErrorCode.INTERNAL_ERROR, 'Webhook processing failed'))
      }
    }
  )
}
