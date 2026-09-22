import { randomBytes, scryptSync } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
const rl = createInterface({ input: process.stdin, output: process.stdout });
try {
  const email = (await rl.question('Email admin: ')).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email tidak valid');
  // Generated password avoids terminal echo of a user-owned password.
  const password = randomBytes(18).toString('base64url');
  const salt = randomBytes(16).toString('hex');
  const dbPassword = randomBytes(24).toString('hex');
  await writeFile('.env', [
    `POSTGRES_PASSWORD=${dbPassword}`,
    `DATABASE_URL=postgresql://prospek:${dbPassword}@127.0.0.1:55432/prospek`,
    `ADMIN_EMAIL=${email}`,
    `ADMIN_PASSWORD_HASH=${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
    `SESSION_SECRET=${randomBytes(32).toString('hex')}`,
    `INGEST_API_KEY=${randomBytes(32).toString('hex')}`,
    'API_URL=http://127.0.0.1:3001',
    'APP_ORIGIN=http://127.0.0.1:5173',
    'PORT=3001', ''
  ].join('\n'), { flag: 'wx', mode: 0o600 });
  console.log(`Konfigurasi dibuat. Simpan password admin: ${password}`);
} finally { rl.close(); }
