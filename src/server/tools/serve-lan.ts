// Runs VoteHope on a local network: no domain name, no certificate, just the
// address this machine has right now. Settings are read from .env when it is
// there and asked for when they are not; the address is worked out at every
// start, so a new one from the router changes nothing.
//
// Usage: npm run serve:lan
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { hashPassword } from '../auth.ts';
import { isPrivateIPv4, lanAddress, portTaken } from '../net.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const envFile = path.join(root, '.env');
const shown = (file: string) => path.relative(root, file);

if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
  console.log(`Settings read from ${shown(envFile)}.`);
}

const port = process.env.PORT ?? '3000';
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  console.error(`PORT must be a port number (got “${port}”).`);
  process.exit(1);
}

// 1. The port, before anything else: failing here costs the user nothing. A dev
//    server on the loopback counts, even though this one would bind all interfaces.
if (await portTaken(Number(port))) {
  console.error(`\nPort ${port} is already in use — another VoteHope, or something else.`);
  console.error('Stop that one (a dev server started with "npm run dev" also holds it),');
  console.error('or pick a different port:');
  console.error(`  PORT=3001 npm run serve:lan`);
  process.exit(1);
}

// 2. A presenter password, so that writing quizzes is not open to the network.
if (!process.env.ADMIN_PASSWORD_HASH && !process.env.ADMIN_PASSWORD) {
  console.log('\nNo presenter password is set yet. It guards writing quizzes, running');
  console.log('sessions and seeing results; students never need it.\n');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const password = (await rl.question('Choose a presenter password: ')).trim();
  if (!password) {
    rl.close();
    console.error('The password cannot be empty.');
    process.exit(1);
  }
  const hash = hashPassword(password);
  process.env.ADMIN_PASSWORD_HASH = hash;
  const answer = (await rl.question(`Remember it in ${shown(envFile)}? [Y/n] `)).trim().toLowerCase();
  rl.close();
  if (answer === '' || answer === 'y' || answer === 'yes') {
    const existing = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
    const gap = existing === '' || existing.endsWith('\n') ? '' : '\n';
    appendFileSync(envFile, `${gap}ADMIN_PASSWORD_HASH=${hash}\n`, { mode: 0o600 });
    console.log(`Saved to ${shown(envFile)}. Only the hash is stored, never the password.`);
  }
}

// 3. The address students will use. One set by hand wins, so a fixed IP or a name
//    from the school's own DNS keeps working.
const detected = await lanAddress();
if (!process.env.PUBLIC_URL && !detected) {
  console.error('\nCould not work out this machine’s address on the network.');
  console.error('Join a network (Wi-Fi or cable), or give the address yourself:');
  console.error(`  PUBLIC_URL=http://192.168.1.23:${port} npm run serve:lan`);
  process.exit(1);
}
const publicUrl = process.env.PUBLIC_URL ?? `http://${detected}:${port}`;
if (process.env.PUBLIC_URL) console.log(`Using the PUBLIC_URL already set: ${publicUrl}`);

// 4. In this mode the server serves the front end itself, so it has to exist.
if (!existsSync(path.join(root, 'dist', 'client', 'index.html'))) {
  console.log('\nBuilding the front end, which has not been built yet…');
  const build = spawn('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  const code: number = await new Promise((resolve) => build.once('close', (status) => resolve(status ?? 1)));
  if (code !== 0) process.exit(code);
}

// 5. Start the server and wait until it really answers before saying so.
const server = spawn(process.execPath, [path.join(root, 'src', 'server', 'index.ts')], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, HOST: '0.0.0.0', PORT: port, PUBLIC_URL: publicUrl, NODE_ENV: 'production' },
});
let running = true;
server.once('close', (code) => {
  running = false;
  process.exit(code ?? 0);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.kill(signal));
}

// Asking on the address students will use, not on the loopback: that is the one
// that has to work, and the loopback can belong to somebody else's server.
if (await answers(`http://${detected ?? '127.0.0.1'}:${port}/api/health`)) {
  const rule = '─'.repeat(58);
  console.log(`
${rule}
  VoteHope is running on this network.

  Students     ${publicUrl}
  Presenter    ${publicUrl}/admin

  Open the presenter page on this machine and log in. Students on the
  same network scan the QR code, or type the 6-digit session code.
${rule}`);
  if (detected && !isPrivateIPv4(detected)) {
    console.log('\nCareful: that address is not a private one, so this may be reachable');
    console.log('from outside the school. Use a firewall, or a private network.');
  }
  console.log('\nThe router can hand this machine a different address later. If students');
  console.log('cannot connect, stop with Ctrl+C and run this again.\n');
}

/**
 * True once our own server answers. An answer alone does not prove it is ours —
 * if something else held the port, it would reply while our server died — so the
 * child has to still be running when the reply arrives. The check above makes that
 * nearly impossible; this keeps the banner honest if it happens anyway.
 */
async function answers(url: string, attempts = 40): Promise<boolean> {
  for (let attempt = 0; attempt < attempts && running; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!running) break;
    try {
      if ((await fetch(url)).ok) return running;
    } catch {
      // Not listening yet; the server prints its own error if it failed to start.
    }
  }
  return false;
}
