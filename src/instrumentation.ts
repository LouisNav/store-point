// Next.js instrumentation hook — runs once per server process at boot.
// Validates env and ensures the SQLite schema is ready.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Validate env. Throws on misconfig.
  const { env } = await import('@/env');
  env();
  // Force SQLite migrations + warm-up.
  const { getDB } = await import('@/lib/db/sqlite');
  getDB();
  // eslint-disable-next-line no-console
  console.log(`[boot] Store Point ready · sqlite=${process.env.SQLITE_PATH ?? './data/storepoint.db'} · mongo=${process.env.MONGODB_URI ? 'configured' : 'offline-mode'}`);
}
