import pg from 'pg';
export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL belum diatur; jalankan npm run setup');
  return new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
}
