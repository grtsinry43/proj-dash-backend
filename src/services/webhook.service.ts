import prisma from '@/lib/prisma'
import type { GitHubWebhookPayload } from '@/types/github'

export async function handleWebhook(payload: GitHubWebhookPayload) {
  const { action, pull_request, repository } = payload

  if (action === 'opened' || action === 'closed') {
    const { number, title, state, user, created_at, closed_at } = pull_request

    await prisma.pullRequest.upsert({
      where: { repositoryId_number: { repositoryId: repository.id, number } },
      update: {
        state,
        closedAt: closed_at ? new Date(closed_at) : null,
      },
      create: {
        number,
        title,
        state,
        createdAt: new Date(created_at),
        closedAt: closed_at ? new Date(closed_at) : null,
        repository: {
          connectOrCreate: {
            where: { id: repository.id },
            create: {
              id: repository.id,
              name: repository.name,
              owner: repository.owner.login,
            },
          },
        },
        author: {
          connectOrCreate: {
            where: { githubId: String(user.id) },
            create: {
              githubId: String(user.id),
              username: user.login,
              avatarUrl: user.avatar_url,
            },
          },
        },
      },
    })
  }
}
