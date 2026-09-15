import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/server/auth.ts';

describe('password hashing', () => {
  it('verifies the right password and rejects others', async () => {
    const hash = hashPassword('s3cret');
    expect(hash).toMatch(/^scrypt:\d+:\d+:\d+:[\w-]+:[\w-]+$/);
    expect(await verifyPassword('s3cret', hash)).toBe(true);
    expect(await verifyPassword('S3cret', hash)).toBe(false);
  });

  it('uses a fresh salt each time', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('rejects malformed hashes instead of throwing', async () => {
    for (const bad of ['', 'plain-text', 'bcrypt:1:2:3:a:b', 'scrypt:x:8:1:abc:def', 'scrypt:3:8:1:abc:def']) {
      expect(await verifyPassword('anything', bad)).toBe(false);
    }
  });
});
