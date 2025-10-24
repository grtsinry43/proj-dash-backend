import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GitHubService } from '../services/github.service';
import { authMiddleware } from '../middlewares/auth.middleware';

// Schema for request parameters
const repoParamsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
});

// Schema for repository statistics response
const repoStatsSchema = z.object({
  stars: z.number(),
  forks: z.number(),
  openIssues: z.number(),
  commits: z.number(),
  releases: z.number(),
  contributors: z.number(),
});

// Schema for repository list response
const repoListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  private: z.boolean(),
  html_url: z.string().url(),
  description: z.string().nullable(),
  stargazers_count: z.number(),
  watchers_count: z.number(),
  forks_count: z.number(),
  language: z.string().nullable(),
  owner: z.object({
    login: z.string(),
    avatar_url: z.string().url(),
  }),
});

const reposListResponseSchema = z.array(repoListItemSchema);

export async function repoRoutes(app: FastifyInstance) {
  // All routes in this plugin require authentication
  app.addHook('preHandler', authMiddleware);

  // Route to list repositories for the authenticated user
  app.get(
    '/',
    {
      schema: {
        response: {
          200: reposListResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { accessToken, username } = request.user!;
      const githubService = new GitHubService(accessToken, username);
      const repos = await githubService.getRepositories();
      return repos;
    },
  );

  // Route to get statistics for a specific repository
  app.get(
    '/:owner/:repo/stats',
    {
      schema: {
        params: repoParamsSchema,
        response: {
          200: repoStatsSchema,
        },
      },
    },
    async (request, reply) => {
      const { owner, repo } = request.params as z.infer<typeof repoParamsSchema>;
      const { accessToken, username } = request.user!;
      const githubService = new GitHubService(accessToken, username);
      const stats = await githubService.getRepositoryStats(owner, repo);
      return stats;
    },
  );
}
