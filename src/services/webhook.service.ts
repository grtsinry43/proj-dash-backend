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
              fullName: repository.full_name,
              owner: repository.owner.login,
              description: repository.description,
              htmlUrl: repository.html_url,
              homepage: repository.homepage,
              isPrivate: repository.private,
              isFork: repository.fork,
              isArchived: repository.archived,
              isTemplate: repository.is_template ?? false,
              stargazersCount: repository.stargazers_count,
              forksCount: repository.forks_count,
              watchersCount: repository.watchers_count,
              openIssuesCount: repository.open_issues_count,
              size: repository.size,
              language: repository.language,
              topics: repository.topics ?? [],
              licenseName: repository.license?.name,
              licenseKey: repository.license?.key,
              githubCreatedAt: new Date(repository.created_at),
              githubUpdatedAt: new Date(repository.updated_at),
              githubPushedAt: repository.pushed_at ? new Date(repository.pushed_at) : null,
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
