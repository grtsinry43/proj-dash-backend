import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    // This is the type for the payload that is signed
    // and the type of the `request.user` object.
    user: {
      sub: string;
      username: string;
      avatarUrl: string;
      accessToken: string;
    };
  }
}
