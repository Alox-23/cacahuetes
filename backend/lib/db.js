import pg from 'pg';

let pool;

export function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 5_000,
      allowExitOnIdle: true
    });
    pool.on('error', (error) => console.error('PostgreSQL idle connection:', error.code ?? error.name));
  }
  return pool;
}
