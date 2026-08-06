import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Loads a local .env for scripts. Missing file is fine (Vercel injects env). */
export function loadLocalEnv(file = '.env') {
  const envPath = path.isAbsolute(file) ? file : path.join(ROOT, file);
  if (!fs.existsSync(envPath)) return false;
  process.loadEnvFile(envPath);
  return true;
}

/** Loads .env then .env.local (local overrides), matching typical Vercel CLI layout. */
export function loadLocalEnvChain() {
  const a = loadLocalEnv('.env');
  const b = loadLocalEnv('.env.local');
  return a || b;
}
