import { FastifyInstance } from 'fastify';
import { verifyGithubWebhook } from '../middlewares/verify-webhook.middleware';
import { handleWebhook } from '../services/webhook.service';

// Define a basic schema to expect a JSON object payload.
const webhookSchema = {
  body: {
    type: 'object',
    // Since webhook payloads vary, we allow any properties.
    // In a real application, you might add more specific validation
    // based on the event types you expect to handle.
    additionalProperties: true,
  },
} as const;

export async function webhookRoutes(app: FastifyInstance) {
  app.post(
    '/github',
    {
      preHandler: verifyGithubWebhook,
      schema: webhookSchema,
    },
    async (request, reply) => {
      try {
        // request.body is now safely typed as Record<string, any>
        await handleWebhook(request.body);
        reply.status(200).send({ message: 'Webhook received' });
      } catch (error) {
        app.log.error('Webhook processing error:', error);
        reply.status(500).send({ error: 'Webhook processing failed' });
      }
    },
  );
}
