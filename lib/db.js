import pg from 'pg';

const { Pool } = pg;

let pool;

function isLocal(connectionString) {
  try {
    const host = new URL(connectionString).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

function sslConfig(connectionString) {
  if (process.env.PGSSL === 'disable' || isLocal(connectionString)) return false;
  return { rejectUnauthorized: process.env.PGSSL_NO_VERIFY !== '1' };
}

export function resolveConnectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

export function getPool() {
  if (pool) return pool;

  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set.');
  }

  pool = new Pool({
    connectionString,
    ssl: sslConfig(connectionString),
    max: Number(process.env.PG_POOL_MAX || 1),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', (err) => console.error('Idle Postgres client error:', err));
  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}

export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

export const UNDEFINED_TABLE = '42P01';

export async function closePool() {
  if (pool) {
    const closing = pool.end();
    pool = undefined;
    await closing;
  }
}
