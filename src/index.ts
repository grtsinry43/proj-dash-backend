import Fastify from 'fastify'
const fastify = Fastify({
  logger: true,
})

fastify.get('/', () => {
  const name = process.env['NAME'] ?? 'World'
  return `Hello ${name}!`
})

const port = parseInt(process.env['PORT'] ?? '3000')

const start = async () => {
  try {
    await fastify.listen({ port })
  } catch (err) {
    fastify.log.error(err)
    // eslint-disable-next-line n/no-process-exit
    process.exit(1)
  }
}

void start()
