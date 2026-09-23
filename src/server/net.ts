// Working out which address students should type when there is no domain name.

import dgram from 'node:dgram';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** The ranges reserved for private networks (RFC 1918) plus link-local (169.254). */
export function isPrivateIPv4(address: string): boolean {
  if (!IPV4.test(address)) return false;
  const [a, b] = address.split('.').map(Number) as [number, number, number, number];
  if (a > 255 || b > 255) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

/** Every IPv4 address of this machine except the loopback. */
export function localAddresses(): string[] {
  const found: string[] = [];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) found.push(address.address);
    }
  }
  return found;
}

/**
 * Asks the routing table which address leaves this machine: a UDP socket that
 * connects sends nothing, it only makes the system choose an interface. That beats
 * picking from the list of interfaces, which also holds VPN and container addresses.
 */
function routedAddress(): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    let settled = false;
    const done = (address: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // Already closed, or never opened.
      }
      resolve(address);
    };
    const timer = setTimeout(() => done(null), 500);
    timer.unref();
    socket.once('error', () => done(null));
    try {
      // TEST-NET-1 (RFC 5737): routed like any distant address, never reached.
      socket.connect(53, '192.0.2.1', () => {
        const { address } = socket.address();
        done(address === '0.0.0.0' ? null : address);
      });
    } catch {
      done(null);
    }
  });
}

/**
 * Whether nothing is listening on this port yet. Worth asking before starting a
 * server: "port 3000 is taken" is a far better message than the crash that follows,
 * and a health check cannot tell our own server from whoever already holds it.
 */
export function portAvailable(port: number, host = '0.0.0.0'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen({ port, host }, () => server.close(() => resolve(true)));
  });
}

/**
 * Whether anything already listens on this port. Both addresses have to be asked
 * about: macOS lets a wildcard bind succeed over a server that holds only the
 * loopback, so checking 0.0.0.0 alone would call a busy port free.
 */
export async function portTaken(port: number): Promise<boolean> {
  for (const host of ['0.0.0.0', '127.0.0.1']) {
    if (!(await portAvailable(port, host))) return true;
  }
  return false;
}

/**
 * The address other machines on this network can use to reach us, or null when
 * there is none (no network at all).
 */
export async function lanAddress(): Promise<string | null> {
  const routed = await routedAddress();
  if (routed) return routed;
  // No route out — an isolated network still has an address to offer.
  const local = localAddresses();
  return local.find(isPrivateIPv4) ?? local[0] ?? null;
}
