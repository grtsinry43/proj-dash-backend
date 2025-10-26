import type { FastifyReply, FastifyRequest } from 'fastify'
import * as crypto from 'crypto'

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
export function verifyGithubWebhook(req: FastifyRequest, reply: FastifyReply) {
  const signature = req.headers['x-hub-signature-256'] as string
  if (!signature) {
    return reply.status(401).send({ error: 'No signature found' })
  }

  const secret = process.env['GITHUB_WEBHOOK_SECRET']
  const hmac = crypto.createHmac('sha256', secret!)
  const digest = `sha256=${hmac.update(JSON.stringify(req.body)).digest('hex')}`

  if (digest !== signature) {
    return reply.status(401).send({ error: 'Invalid signature' })
  }
}
