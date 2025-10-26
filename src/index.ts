import Fastify from 'fastify'
const fastify = Fastify({
  logger: true,
})

fastify.get('/', async () => {
  const name = process.env['NAME'] || 'World'
  return `Hello ${name}!`
})

const port = parseInt(process.env['PORT'] || '3000')

const start = async () => {
  try {
    await fastify.listen({ port })
  } catch (err) {
    fastify.log.error(err)
    // eslint-disable-next-line n/no-process-exit
    process.exit(1)
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
start().then((r) => console.log(r))
