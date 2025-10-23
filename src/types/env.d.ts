declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL: string;
    JWT_SECRET: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    FRONTEND_URL: string;
    UPSTASH_REDIS_URL: string;
    UPSTASH_REDIS_TOKEN: string;
  }
}
