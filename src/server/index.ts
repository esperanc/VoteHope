import path from 'node:path';
import { buildApp } from './app.ts';
import { ConfigError, loadConfig, type Config } from './config.ts';
import { openDatabase } from './db.ts';
import { lanAddress } from './net.ts';

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

// Where to send the students. With no PUBLIC_URL set, the address this machine has
// on the network is the best guess — and the one join links will carry if the
// presenter opens the admin page through it.
let joinAt = config.publicUrl;
if (!joinAt && config.host === '0.0.0.0') {
  const address = await lanAddress();
  if (address) joinAt = `http://${address}:${config.port}`;
}
if (joinAt) app.log.info(`Students join at ${joinAt}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    db.close();
    process.exit(0);
  });
}
