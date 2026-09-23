import { createServer, type AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { isPrivateIPv4, lanAddress, localAddresses, portAvailable, portTaken } from '../src/server/net.ts';

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

describe('network addresses', () => {
  it('knows which addresses belong to a private network', () => {
    for (const address of ['10.0.0.1', '172.16.5.4', '172.31.255.255', '192.168.68.102', '169.254.1.1']) {
      expect(isPrivateIPv4(address), address).toBe(true);
    }
    for (const address of ['8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.0.1', '300.1.1.1', '1.2.3', 'nonsense']) {
      expect(isPrivateIPv4(address), address).toBe(false);
    }
  });

  it('lists this machine’s addresses without the loopback', () => {
    for (const address of localAddresses()) {
      expect(address).toMatch(IPV4);
      expect(address.startsWith('127.')).toBe(false);
    }
  });

  // Whether there is a network at all depends on the machine running the tests.
  it('either finds an address other machines could use, or reports none', async () => {
    const address = await lanAddress();
    expect(address === null || IPV4.test(address)).toBe(true);
  });

  it('sees whether a port is already taken', async () => {
    const other = createServer();
    await new Promise<void>((resolve) => other.listen(0, '0.0.0.0', resolve));
    const { port } = other.address() as AddressInfo;

    expect(await portAvailable(port)).toBe(false);
    await new Promise<void>((resolve) => other.close(() => resolve()));
    expect(await portAvailable(port)).toBe(true);
  });

  // macOS lets a wildcard bind succeed over a loopback-only listener, so asking
  // about 0.0.0.0 alone reports a busy port as free — which is how a dev server
  // running on 127.0.0.1 went unnoticed.
  it('notices a server that holds only the loopback', async () => {
    const other = createServer();
    await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve));
    const { port } = other.address() as AddressInfo;

    expect(await portTaken(port)).toBe(true);
    await new Promise<void>((resolve) => other.close(() => resolve()));
    expect(await portTaken(port)).toBe(false);
  });
});
