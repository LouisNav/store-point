# Store Point

A **resilient, multi-tenant store-management web app** for small shops and their staff. Runs offline-first against a local SQLite store, then auto-syncs every change to MongoDB when the network is back. Sales agents never see cost prices or margins — only what they need to take money at the till.

> Built for new store owners who want a tidy, professional tool they can actually understand.

---

## ✨ Features

### For the Root Admin (you)
- **Multi-store** from one account. Create separate tenants for each shop.
- **Custom branding per store** — store name, accent color, logo, tagline.
- **Staff management** — invite team, assign roles, suspend/remove.
- **Full financials** — cost, sell price, profit margin, daily reports.
- **Stores never lose data** — even if MongoDB is unreachable for days.

### For Store Managers
- Manage **products & pricing** (cost + sell + threshold alerts).
- **Refunds** with reason and restock.
- **Daily cash-up** breakdown by payment method.
- **Profit report**.

### For Sales Agents (the cashiers)
- **Simple POS** — search product, build cart, complete sale.
- Sees only **product name + sell price + stock**.
- **Customer receipts** can be printed.

### For Inventory Staff
- Restock products.
- See live low-stock alerts.

### For Everyone
- **Roles & permissions** enforced at the data layer — costs and margins are stripped from API responses for sales agents.
- **Cash-up time series chart** — last 14 days of sales.

---

## 🧱 Stack

- **Next.js 14** (App Router, React Server Components, Server Actions).
- **TypeScript** strict end-to-end.
- **better-sqlite3** (WAL, crash-safe) — the local source of truth on this server.
- **Mongoose / MongoDB** — primary cloud store. App keeps working fully offline.
- **iron-session** — encrypted cookies for auth, no auth roundtrip per request.
- **bcryptjs** — password hashing.
- **Tailwind CSS** + **shadcn-style primitives** (Radix) + **lucide-react** icons.
- **react-hook-form + zod** for forms.
- **TanStack Table** for data tables.
- **Recharts** for the dashboard chart.
- **sonner** for toasts.
- **uuid v7** — time-sortable IDs decoupling local from Mongo `ObjectId`.

---

## 🏛 Architecture

### Data flow

```
┌───────────────┐    writeTx()    ┌─────────────┐  ping()   ┌──────────────┐
│ Server action │ ──────────────▶ │   SQLite    │ ────────▶ │   MongoDB    │
│  or API       │                 │  (WAL)      │           │ (cloud view) │
└───────┬───────┘                 └─────┬───────┘           └──────▲───────┘
        │                               │                          │
        │                               │ outbox row enqueued       │
        │                               └──── pending outbox ───────┘
                                                                         drained by
                                                                  scripts/sync-worker.ts
```

- **Every write goes through a SQLite transaction** that also inserts an `outbox` row.
- The sync worker (a separate Node process — *not* Next.js) periodically drains the outbox into MongoDB.
- Reads always come from SQLite — fast, always available.
- If MongoDB is unreachable for days, every sale, every refund, every product edit is queued. When connectivity returns, the queue flushes in order.
- **Soft deletes everywhere** (`deletedAt`) — never lose records to a half-completed sync.

### Tenant isolation

- All queries are `storeId`-scoped in repositories — there's no way to read another store's data from app code.
- `RootAdmin` runs across all stores; everyone else only sees their own memberships.

### Role-based access control

Permissions are code-defined in `src/lib/rbac.ts`. Roles map to a fixed set of permissions:

| Role         | POS | Refund | Pricing | Brand | Reports | Profit | Users |
|--------------|-----|--------|---------|-------|---------|--------|-------|
| ROOT_ADMIN   | ✓   | ✓      | ✓       | ✓     | ✓       | ✓      | ✓     |
| MANAGER      | ✓   | ✓      | ✓       | ✓     | ✓       | ✓      | ✓     |
| INVENTORY    | —   | —      | —       | —     | —       | —      | —     |
| SALES_AGENT  | ✓   | —      | —       | —     | —       | —      | —     |
| VIEWER       | —   | —      | —       | —     | —       | —      | —     |

Field-level: **sales agents never see `costCents` or margins** — even in API responses.

### Hosting caveat

This app **must run on a VPS / persistent-disk host** (Render Disk, DigitalOcean, EC2 with EBS, Fly.io with a volume, a home server) because it keeps a real SQLite file. **Vercel / AWS Lambda will not work** — those platforms have ephemeral filesystems.

---

## 🚀 Quick start

### 1. Install

```bash
npm install
```

> better-sqlite3 needs build tools — most Node 18+ environments already have them. On Debian/Ubuntu: `apt install build-essential python3`.

### 2. Configure

```bash
cp .env.example .env
# Edit .env:
#   ROOT_ADMIN_EMAIL    = you@example.com
#   ROOT_ADMIN_PASSWORD = StrongPass!123
#   ROOT_ADMIN_NAME     = Your Name
#   SESSION_PASSWORD    = (32+ char random — `openssl rand -hex 32`)
# Optional:
#   MONGODB_URI = mongodb+srv://user:pass@cluster.mongodb.net/storepoint
```

### 3. Seed (creates root admin + sample store + demo products)

```bash
npm run seed
```

### 4. Run dev (Next.js + sync worker)

```bash
npm run dev:full
# or split:
npm run dev         # next dev only
npm run worker:dev  # sync worker (watch mode, auto-reloads on file changes)
```

Visit http://localhost:3000 (or your configured `APP_URL`) → sign in with the credentials you put in `.env`.

### 5. Production

```bash
npm run build
npm run start:full    # next start + sync worker (for simple setups)
```

For serious production use, **PM2 is recommended** (auto-restart on crash, restart on system reboot):

```bash
npm run build
npm run pm2:start     # starts both web + sync worker
pm2 save              # persist process list across reboots
pm2 startup           # generate & install systemd/upstart hook (run once)
```

Other PM2 commands:

```bash
npm run pm2:status    # show process status
npm run pm2:logs      # tail all logs
npm run pm2:restart   # restart both
npm run pm2:stop      # stop both
```

---

## 🛠 Operations

### Sync state

Top-right of the app shows **cloud status** (`Synced` / `Offline · N queued`). The `MONGODB_URI` env var controls whether sync is online (configured) or offline (purely local).

`GET /api/sync-status` returns `{ state, pending, mongoConfigured }` (requires authentication).

### Worker scripts

| Script | Mode | Use |
|---|---|---|
| `npm run worker:dev` | `tsx watch` (auto-reload) | Development (`dev:full` uses this) |
| `npm run worker` | `tsx` (plain, no watch) | Production (`start:full` and PM2 use this) |

### SQLite migrations

Add migrations to `MIGRATIONS` in `src/lib/db/schema.ts` (each row = one migration with an `id` and `sql`). They apply at boot, also runnable on demand:

```bash
npm run migrate
```

### Backups

Since SQLite (with WAL) is the durable copy, take regular snapshots to S3 / B2. A simple cron:

```bash
sqlite3 ./data/storepoint.db ".backup ./backups/storepoint-$(date +%F).db"
```

(Drop this into a daily cron on your VPS.)

### Root admin password reset

If you forget the root admin password, reset it directly in SQLite:

```bash
node -e "
  const bcrypt = require('bcryptjs');
  const Database = require('better-sqlite3');
  const db = new Database('./data/storepoint.db');
  const hash = bcrypt.hashSync('NewPass!123', 10);
  db.prepare('UPDATE users SET passwordHash = ? WHERE isRoot = 1').run(hash);
  console.log('Root password reset to: NewPass!123');
"
```

> **Note**: Updating your email/password via the **My Profile** page works normally — login uses the SQLite database, not `.env` vars. The `.env` credentials are only consumed by `npm run seed` (which skips if a root already exists).

### Reset everything

```bash
rm -f ./data/*.db ./data/*-wal ./data/*-shm
npm run seed
```

---

## 🧪 Smoke test

1. `npm run seed` then `npm run dev:full`.
2. Sign in → redirected to `/stores` → click **Greenmarket Demo** → land on `/dashboard`.
3. **POS**: search "rice", add to cart, click "Complete sale" → see printable receipt.
4. **Products**: edit "Bread" → see margin column update for you (manager+), not for sales agents.
5. **Staff**: switch role of a new user to `SALES_AGENT`, sign in as them — verify they don't see cost or profit pages.
6. **Branding**: visit Brand → change accent → see header buttons instantly recolor.
7. **Offline test**: stop the sync worker or unplug Mongo URI, do another sale. Restart. Run `GET /api/sync-status` — `pending` decreases.

---

## 🗂 Project structure

```
src/
├── app/
│   ├── (app)/                # protected app shell (sidebar + topbar)
│   │   ├── dashboard/        # role-aware home
│   │   ├── pos/              # cash register
│   │   ├── products/         # list / new / edit
│   │   ├── customers/        # list + create
│   │   ├── sales/            # history + [id] + receipt
│   │   ├── reports/          # cashup + profit
│   │   ├── users/            # staff & roles
│   │   ├── settings/         # brand / profile
│   │   └── stores/           # switcher + new store
│   ├── login/                # login form
│   ├── setup/                # fallback if seed not run
│   ├── api/                  # auth, sync status, store switch
│   └── globals.css, layout.tsx, page.tsx
├── components/
│   ├── ui/                   # Button / Card / Input / Select / Table / etc.
│   └── layout/               # Sidebar / Topbar (sync indicator)
├── lib/
│   ├── auth/                 # iron-session, guards, password
│   ├── db/                   # sqlite, mongo, schema, repositories/
│   ├── rbac.ts               # permission table
│   ├── brand.ts              # CSS-var theme from store.brandJson
│   ├── types.ts              # domain types
│   ├── env.ts                # validated env loader
│   └── utils.ts
├── instrumentation.ts        # boot-time check
└── middleware.ts             # cookie-presence gate
scripts/
├── seed.ts                   # root admin + sample store via env
├── sync-worker.ts            # outbox → MongoDB
└── migrate.ts                # apply sqlite migrations
data/                         # SQLite files (gitignored)
```

---

## 🔐 Security notes (v1)

- Sessions are encrypted cookies (`iron-session`). Set a long random `SESSION_PASSWORD` in production.
- Root admin is **env-seeded** only — there's no self-serve signup by design.
- All mutations require a session + matching store membership + permission.
- Soft delete everywhere means even a "deleted" record is recoverable from the SQLite file.
- HTTPS / reverse-proxy with TLS is your responsibility in front of the app.

---

## 🛣 Roadmap (suggested next steps)

- **Receipts**: PDF + SMS receipts.
- **Mobile-friendly POS**: PWA install, barcode scanner via camera.
- **Inventory transfers** between stores.
- **Multi-currency** with per-store rates.
- **Purchase orders** for restocking.
- **Email/WhatsApp exports** for daily summaries.
- **Audit log UI** (we already log to outbox; just need a viewer).
- **Customer credit** / layaway tracking.
- **Automatic on-disk backup** with `sqlite3 .backup` every hour → S3.

---

## 📜 License

MIT — bring it on, build your dream shop tool.
