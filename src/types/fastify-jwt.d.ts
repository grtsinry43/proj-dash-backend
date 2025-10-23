// This file extends the types for the @fastify/jwt plugin
import '@fastify/jwt';

declare module '@fastify/jwt' {
  /**
   * This interface defines the structure of the payload that is signed into the JWT.
   * It also defines the structure of the `request.user` object after verification.
   */
  interface FastifyJWT {
    // The `user` property is what will be available on `request.user`
    user: {
      sub: string;       // User ID from our database
      username: string;
      avatarUrl: string;
      accessToken: string; // GitHub Access Token
    };
  }
}
