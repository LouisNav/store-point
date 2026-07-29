/**
 * Apply SQLite migrations and exit. Safe to run repeatedly.
 */
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
import { getDB, closeDB } from '../src/lib/db/sqlite';

// runMigrations happens inside getDB().
getDB();
console.log('✓ Migrations applied.');
closeDB();
