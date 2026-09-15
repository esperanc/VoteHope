import path from 'node:path';
import { buildApp } from './app.ts';
import { ConfigError, loadConfig, type Config } from './config.ts';
import { openDatabase } from './db.ts';

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  console.error(`Configuration error: ${err.message}`);
  process.exit(1);
}

const production = process.env.NODE_ENV === 'production';
const db = openDatabase(path.join(config.dataDir, 'votehope.db'));
const app = await buildApp(config, db, {
  logger: production
    ? { level: 'info' }
    : {
        level: 'info',
        transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } },
      },
});

await app.listen({ port: config.port, host: config.host });
if (config.publicUrl) app.log.info(`Students join at ${config.publicUrl}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    db.close();
    process.exit(0);
  });
}
