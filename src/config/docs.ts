import type { FastifyDynamicSwaggerOptions } from '@fastify/swagger'
import type { FastifyApiReferenceOptions } from '@scalar/fastify-api-reference'

/**
 * OpenAPI documentation configuration
 */
export const openApiConfig: FastifyDynamicSwaggerOptions = {
  openapi: {
    info: {
      title: 'Project Dash API',
      description: `
# GitHub Dashboard Backend API

Backend API for the Project Dash application - A modern GitHub repository dashboard with real-time statistics and analytics.

## Features
- 🔐 GitHub OAuth Authentication
- 📊 Repository Statistics & Analytics
- 🔔 GitHub Webhook Integration
- ⚡ Redis Caching for Performance

## Authentication
Most endpoints require authentication via JWT token.

**How to authenticate:**
1. Login via \`POST /auth/login\` with GitHub OAuth code
2. Use the returned JWT token in the \`Authorization\` header: \`Bearer <token>\`

## Rate Limiting
GitHub API rate limits apply. Authenticated requests: 5,000/hour.
      `,
      version: '1.0.0',
      contact: {
        name: 'API Support',
        url: 'https://github.com/yourusername/proj-dash-backend',
      },
      license: {
        name: 'Apache 2.0',
        url: 'https://www.apache.org/licenses/LICENSE-2.0.html',
      },
    },
    servers: [
      {
        url: 'http://localhost:3333',
        description: 'Local development server',
      },
      {
        url: 'https://zany-couscous-jg4x4q5q6gj2p945-3333.app.github.dev/',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http' as const,
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token obtained from `/auth/login`',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    tags: [
      {
        name: 'auth',
        description: 'Authentication endpoints',
      },
      {
        name: 'repos',
        description: 'Repository management and statistics',
      },
      {
        name: 'activity',
        description: 'Repository activity timeline (commits, PRs, issues)',
      },
      {
        name: 'code-stats',
        description: 'Code statistics and analysis (languages, file structure, hot files)',
      },
      {
        name: 'contributors',
        description: 'Contributor analysis and statistics',
      },
      {
        name: 'releases',
        description: 'Release and version management',
      },
      {
        name: 'actions',
        description: 'CI/CD workflow monitoring (GitHub Actions)',
      },
      {
        name: 'issues',
        description: 'Issue and Pull Request management',
      },
      {
        name: 'stats',
        description: 'User statistics and analytics',
      },
      {
        name: 'popularity',
        description: 'Repository popularity metrics (stars, traffic views, clones)',
      },
      {
        name: 'webhooks',
        description: 'GitHub webhook handlers',
      },
    ],
  },
}

/**
 * Scalar API Reference configuration
 */
export const scalarConfig: FastifyApiReferenceOptions = {
  routePrefix: '/docs',
  configuration: {
    theme: 'purple',
    layout: 'modern',
    darkMode: true,
    hideModels: false,
    hideDownloadButton: false,
    searchHotKey: 'k',
    customCss: `
      .scalar-app {
        --scalar-font: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
      }
    `,
  },
}
