import { FastifyInstance } from 'fastify';
import { GitHubService } from '../services/github.service';
import { authMiddleware } from '../middlewares/auth.middleware';

// Schema for the URL parameters
const repoParamsSchema = {
  type: 'object',
  required: ['owner', 'repo'],
  properties: {
    owner: { type: 'string' },
    repo: { type: 'string' },
  },
} as const; // Using 'as const' for stronger type inference

// Schema for the response of the repository stats endpoint
const repoStatsSchema = {
  type: 'object',
  properties: {
    stars: { type: 'number' },
    forks: { type: 'number' },
    openIssues: { type: 'number' },
    commits: { type: 'number' },
    releases: { type: 'number' },
    contributors: { type: 'number' },
  },
} as const;

export async function repoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // This route retrieves all repositories for the authenticated user.
  // The response type is inferred from Octokit, so a detailed schema is omitted for brevity,
  // but in a real-world scenario, you might want to define the properties you actually use.
  app.get('/', async (request, reply) => {
    const githubService = new GitHubService(request.user.accessToken);
    const repos = await githubService.getRepositories();
    reply.send(repos);
  });

  // This route gets specific stats for a single repository.
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
      // request.params is now strongly typed based on repoParamsSchema!
      const { owner, repo } = request.params;
      const githubService = new GitHubService(request.user.accessToken);

      const stats = await githubService.getRepositoryStats(owner, repo);

      // The return type is validated against repoStatsSchema
      return stats;
    },
  );
}
