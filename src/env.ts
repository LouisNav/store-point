// Centralized environment loading. Validated with zod so misconfig fails loudly
// at boot (called from instrumentation.ts).
import { z } from 'zod';

const schema = z.object({
  APP_URL: z.string().url().default('http://localhost:3000'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SESSION_PASSWORD: z
    .string()
    .min(32, 'SESSION_PASSWORD must be at least 32 characters'),
  // Root admin credentials are OPTIONAL. They are only consumed by
  // `npm run seed` and the "bootstrap from .env" button. When absent, the
  // operator creates the first account from the in-browser /setup screen.
  ROOT_ADMIN_EMAIL: z.union([z.literal(''), z.string().email()]).default(''),
  ROOT_ADMIN_PASSWORD: z
    .union([z.literal(''), z.string().min(8, 'ROOT_ADMIN_PASSWORD must be ≥ 8 chars')])
    .default(''),
  ROOT_ADMIN_NAME: z.string().default('Root'),
  // Optional: currency for the sample store created by `npm run seed`.
  SEED_STORE_CURRENCY: z.string().default('USD'),
  SEED_STORE_CURRENCY_SYMBOL: z.string().default(''),
  MONGODB_URI: z.string().optional().default(''),
  MONGODB_DB: z.string().default('storepoint'),
  SQLITE_PATH: z.string().default('./data/storepoint.db'),
  // Optional, used only by `scripts/sync-test.ts` so the round-trip test
  // never overwrites the dev/prod SQLite file.
  TEST_SQLITE_PATH: z.string().default('./data/test.db'),
  SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  SYNC_BATCH_SIZE: z.coerce.number().int().positive().default(200),
  // Worker backoff cap when Mongo is unreachable.
  SYNC_BACKOFF_MAX_MS: z.coerce.number().int().positive().default(60000),
  // Comma-separated list of allowed origins for Server Actions (Codespaces, proxies, etc.)
  ALLOWED_ORIGINS: z.string().optional().default('localhost:3000'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(
      `❌ Invalid environment configuration:\n${issues}\n\nCheck your .env file. See .env.example for reference.`,
    );
  }
  cached = parsed.data;
  return cached;
}
