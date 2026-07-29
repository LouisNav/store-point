// Centralized environment loading. Validated with zod so misconfig fails loudly
// at boot (called from instrumentation.ts).
import { z } from 'zod';

const schema = z.object({
  APP_URL: z.string().url().default('http://localhost:3000'),
  SESSION_PASSWORD: z
    .string()
    .min(32, 'SESSION_PASSWORD must be at least 32 characters'),
  ROOT_ADMIN_EMAIL: z.string().email(),
  ROOT_ADMIN_PASSWORD: z.string().min(8, 'ROOT_ADMIN_PASSWORD must be ≥ 8 chars'),
  ROOT_ADMIN_NAME: z.string().min(1).default('Root'),
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
