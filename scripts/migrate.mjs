import fs from 'node:fs';
import path from 'node:path';
import { loadLocalEnvChain, ROOT } from '../lib/env.js';
import { getPool, closePool } from '../lib/db.js';

loadLocalEnvChain();

const schemaPath = path.join(ROOT, 'lib', 'schema.sql');
const sql = fs.readFileSync(schemaPath, 'utf8');

/** Split on semicolons at end of statements; keep it simple for our schema file. */
function statements(text) {
  return text
    .split(/;\s*\n/)
    .map((s) => s.replace(/--.*$/gm, '').trim())
    .filter(Boolean)
    .map((s) => (s.endsWith(';') ? s : `${s};`));
}

const pool = getPool();
try {
  for (const statement of statements(sql)) {
    await pool.query(statement);
  }
  console.log('Migration complete.');
} finally {
  await closePool();
}
