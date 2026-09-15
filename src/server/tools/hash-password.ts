// Prints a hash suitable for ADMIN_PASSWORD_HASH.
// Usage: npm run hash-password            (prompts)
//        npm run hash-password -- 'secret'
import { createInterface } from 'node:readline/promises';
import { hashPassword } from '../auth.ts';

let password = process.argv[2];
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question('Admin password: ');
  rl.close();
}
if (!password) {
  console.error('The password cannot be empty.');
  process.exit(1);
}
console.log(hashPassword(password));
