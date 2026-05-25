/**
 * DATABRIDGE API — bootstrap stub.
 *
 * Phase A delivers a runnable healthcheck so the Docker image and release
 * pipeline can be exercised end-to-end. Phase B replaces this with the full
 * Fastify gateway (auth, profiles, audits, mapping studio).
 */
import Fastify from 'fastify';
import sensible from '@fastify/sensible';

const PORT = Number(process.env['API_PORT'] ?? 3001);
const HOST = process.env['API_HOST'] ?? '0.0.0.0';

async function build() {
  const isProd = process.env['NODE_ENV'] === 'production';
  const loggerConfig: Record<string, unknown> = {
    level: process.env['LOG_LEVEL'] ?? 'info',
  };
  if (!isProd) {
    loggerConfig['transport'] = {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    };
  }
  const app = Fastify({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger: loggerConfig as any,
  });

  await app.register(sensible);

  app.get('/healthz', async () => ({ ok: true, ts: new Date().toISOString() }));
  app.get('/readyz', async () => ({ ok: true }));
  app.get('/', async () => ({
    name: '@databridge/api',
    status: 'stub',
    note: 'Phase A bootstrap — full API surface lands in Phase B',
  }));

  return app;
}

async function main(): Promise<void> {
  const app = await build();
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info({ port: PORT, host: HOST }, 'databridge-api listening');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  void main();
} else if (process.env['DATABRIDGE_API_AUTOSTART'] === '1') {
  void main();
} else {
  // When loaded via tsx in dev, start automatically
  void main();
}

export { build };
