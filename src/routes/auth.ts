import { FastifyInstance } from 'fastify';
import { exchangeCodeForToken, getGithubUser } from '../services/github.service';
import { prisma } from '../lib/prisma';

const loginSchema = {
  body: {
    type: 'object',
    required: ['code'],
    properties: {
      code: { type: 'string' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        token: { type: 'string' },
      },
    },
  },
} as const;

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/login',
    { schema: loginSchema },
    async (request, reply) => {
      // The type for request.body is inferred from the schema
      const { code } = request.body;

      try {
        const accessToken = await exchangeCodeForToken(code);
        const githubUser = await getGithubUser(accessToken);

        let user = await prisma.user.findUnique({
          where: { githubId: githubUser.id },
        });

        if (!user) {
          user = await prisma.user.create({
            data: {
              githubId: githubUser.id, // Corrected: Use number directly
              username: githubUser.login,
              avatarUrl: githubUser.avatar_url,
            },
          });
        }

        // The payload now matches the global FastifyJWT type
        const token = app.jwt.sign(
          {
            sub: user.id,
            username: user.username,
            avatarUrl: user.avatarUrl,
            accessToken, // The user's GitHub token
          },
          { expiresIn: '1d' },
        );

        return { token };
      } catch (error) {
        app.log.error('Authentication Error:', error);
        reply.status(500).send({ error: 'Authentication failed' });
      }
    },
  );
}
