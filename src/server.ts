import fastify from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import 'dotenv/config'

import { authRoutes } from '@/routes/auth'
import { repoRoutes } from '@/routes/repos'
import { statsRoutes } from '@/routes/stats'
import { webhookRoutes } from '@/routes/webhooks'

import swagger from '@fastify/swagger'

// Main function to bootstrap the server
async function bootstrap() {
  // Initialize Fastify with ZodTypeProvider
  const app = fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  }).withTypeProvider<ZodTypeProvider>()

  // Set the validator and serializer for Zod
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Register plugins
  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET,
  })

  await app.register(fastifyCors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })

  // Register Swagger for OpenAPI spec generation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Project Dash API',
        description: 'Backend API documentation for Project Dash application.',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [
        {
          bearerAuth: [],
        },
      ],
    },
  })

  // --- Docs portal ---
  // Top-level docs landing page that links to multiple renderers (ReDoc, Stoplight Elements, RapiDoc)
  app.get('/docs', (_, reply) => {
    reply.type('text/html').send(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>API Documentation</title>
        <style>
          body { font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; margin:0; padding:40px; background:#0f172a; color:#e6eef8 }
          .container { max-width:900px; margin:0 auto; }
          h1 { margin:0 0 8px; font-size:28px; }
          p { color:#cbd5e1 }
          .cards { display:flex; gap:16px; margin-top:24px; }
          .card { background:linear-gradient(180deg,#0b1220,#061226); padding:18px; border-radius:8px; flex:1; box-shadow:0 6px 18px rgba(2,6,23,0.6); }
          .card a { color:#7dd3fc; text-decoration:none; font-weight:600 }
          .logo { height:36px; margin-bottom:12px }
        </style>
      </head>
      <body>
        <div class="container">
          <img class="logo" src="https://raw.githubusercontent.com/readmeio/presskit/master/logos/readme-logo-white.svg" alt="Docs" />
          <h1>API Documentation</h1>
          <p>Choose a renderer. <strong>ReDoc</strong> is visually polished; <strong>Stoplight</strong> gives a modern interactive portal similar to Knife4j.</p>

          <div class="cards">
            <div class="card">
              <h3>ReDoc — Readable & clean</h3>
              <p style="color:#9fb4c9">Great for well-structured API reference. Non-interactive but very pretty.</p>
              <p><a href="/docs/redoc">Open ReDoc →</a></p>
            </div>

            <div class="card">
              <h3>Stoplight Elements — Interactive</h3>
              <p style="color:#9fb4c9">Modern UI with playground/try-it-out support and a Knife4j-like feel.</p>
              <p><a href="/docs/stoplight">Open Stoplight →</a></p>
            </div>

            <div class="card">
              <h3>RapiDoc — Lightweight</h3>
              <p style="color:#9fb4c9">Existing lightweight renderer included for quick inspection.</p>
              <p><a href="/docs/rapidoc">Open RapiDoc →</a></p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `)
  })

  // --- RapiDoc route (moved from /docs to /docs/rapidoc) ---
  app.get('/docs/rapidoc', (_, reply) => {
    reply.type('text/html').send(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <script type="module" src="https://unpkg.com/rapidoc/dist/rapidoc-min.js"></script>
      </head>
      <body>
        <rapi-doc
          spec-url="/docs/json"
          theme="dark"
          render-style="view"
          show-header="false"
          allow-server-selection="false"
          allow-authentication="true"
        > </rapi-doc>
      </body>
      </html>
    `)
  })

  // --- API Documentation with ReDoc (alternative nicer UI) ---
  // ReDoc gives a clean, modern single-page OpenAPI rendering similar to Knife4j's look.
  app.get('/docs/redoc', (_, reply) => {
    reply.type('text/html').send(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>API Docs — ReDoc</title>
        <!-- ReDoc standalone bundle from CDN -->
        <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
        <style>
          body { margin: 0; padding: 0; }
          #redoc-container { height: 100vh; }
        </style>
      </head>
      <body>
        <div id="redoc-container"></div>
        <script>
          // Render ReDoc into the container and point it at the generated OpenAPI JSON
          Redoc.init('/docs/json', {
            scrollYOffset: 50,
            theme: {
              colors: { primary: { main: '#2b6cb0' } },
              typography: { fontSize: '14px' }
            }
          }, document.getElementById('redoc-container'));
        </script>
      </body>
      </html>
    `)
  })

  // --- Stoplight Elements (interactive, Knife4j-like feel) ---
  // Uses Stoplight Elements Web Components from CDN to render a modern interactive portal.
  app.get('/docs/stoplight', (_, reply) => {
    reply.type('text/html').send(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>API Docs — Stoplight</title>
  <link rel="stylesheet" href="https://unpkg.com/@stoplight/elements/styles.min.css" />
  <!-- Load Stoplight Elements as an ES module; add ?module for ESM entry on unpkg -->
  <script type="module" src="https://unpkg.com/@stoplight/elements/web-components.min.js?module"></script>
        <style>
          body { margin:0; font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; }
          header { padding:12px 20px; background:#0b1220; color:#e6eef8; display:flex; align-items:center; gap:12px }
          header h1 { margin:0; font-size:16px }
          main { height: calc(100vh - 56px); }
        </style>
      </head>
      <body>
        <header>
          <img src="https://raw.githubusercontent.com/stoplightio/elements/main/docs/images/logo.svg" alt="stoplight" style="height:28px"/>
          <h1>Interactive API Docs</h1>
        </header>
        <main>
          <!-- elements-api is the web component that renders an API description URL -->
          <elements-api api-description-url="/docs/json" router="hash"></elements-api>
          <noscript>
            <div style="padding:20px;color:#374151;background:#f8fafc;border-radius:6px;margin:16px">JavaScript is required to render interactive docs. You can view the OpenAPI JSON directly: <a href="/docs/json">/docs/json</a></div>
          </noscript>
          <script>
            // If the web component failed to register (CDN blocked), show a fallback notice after a short timeout
            setTimeout(() => {
              if (!customElements.get('elements-api')) {
                const fallback = document.createElement('div');
                fallback.style.padding = '16px';
                fallback.style.background = '#fff3cd';
                fallback.style.color = '#6b4226';
                fallback.style.borderRadius = '6px';
                fallback.style.margin = '16px';
                fallback.innerHTML = 'Interactive docs failed to load from CDN. You can view the OpenAPI JSON directly: <a href="/docs/json">/docs/json</a>';
                document.querySelector('main').appendChild(fallback);
              }
            }, 1200);
          </script>
        </main>
      </body>
      </html>
    `)
  })

  app.get('/docs/json', (_, reply) => {
    reply.send(app.swagger())
  })

  // Register routes
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(repoRoutes, { prefix: '/repos' })
  await app.register(statsRoutes, { prefix: '/stats' })
  await app.register(webhookRoutes, { prefix: '/webhooks' })

  // Add a generic error handler
  app.setErrorHandler((error, _, reply) => {
    app.log.error(error)
    reply.status(500).send({ error: 'Internal Server Error' })
  })

  return app
}

// Start the server
await (async () => {
  try {
    const app = await bootstrap()
    await app.listen({ port: 3333, host: '0.0.0.0' })
  } catch (err) {
    console.error(err)
    // eslint-disable-next-line n/no-process-exit
    process.exit(1)
  }
})()
