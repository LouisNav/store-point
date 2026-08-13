# Store Point

A **resilient, multi-tenant store-management web app** for small shops and their staff. Runs offline-first against a local SQLite store, then auto-syncs every change to MongoDB when the network is back. Sales agents never see cost prices or margins — only what they need to take money at the till.

> Built for new store owners who want a tidy, professional tool they can actually understand.

---

## ✨ Features

### For the Root Admin (you)
- **Multi-store** from one account. Create separate tenants for each shop.
- **Custom branding per store** — store name, accent color, logo, tagline.
- **Custom currency per store** — any ISO code plus an optional display symbol (₦, $, KSh, د.ك, …) so the register works anywhere.
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
- **Store messaging** — General and manager-controlled Announcements channels, threaded replies, reactions, pins, search, unread state, announcement acknowledgments, private manager-to-employee direct messages, visibility-aware in-app toasts, and root-admin global announcements delivered to every store.
- **Inventory operations** — Inventory staff and managers can record reasoned stock adjustments, receive low-stock/out-of-stock toasts, and review an immutable stock-movement audit trail. Product master-data and pricing changes remain manager-controlled.
- **RBAC hardening** — The active database membership is authoritative at request time; stale session roles are not trusted for protected layouts, store switching, staff management, branding, or global publication. Membership-targeted mutations are checked against the active store.
- **Cash-up time series chart** — last 14 days of sales.

### Global announcements
- Root administrators can publish platform-level announcements to every active store member without copying the announcement into each store's private message history.
- Global announcements support priority, expiration, optional automatic visibility acknowledgment, notification toasts, append-only audit records, and outbox synchronization.
- Global announcement management is isolated behind `global-announcement:manage`; store managers cannot publish platform-wide messages.

### Messaging governance
- Messaging is scoped to the active `storeId` tenant; all reads and mutations re-check active membership server-side.
- Direct messages use participant-scoped conversations with one stable thread per member pair. Managers/root admins can start them; both participants can reply, while non-participants receive no conversation data.
- Sales agents and inventory staff can participate in General; viewers are read-only. Managers and root admins can publish announcements, moderate messages, pin operational updates, and view the messaging audit trail.
- Announcement acknowledgments and message audit events are durable SQLite records and message/ack/audit writes are queued through the existing Mongo outbox. Read watermarks remain local operational state to avoid high-frequency outbox growth.
- Message governance follows a compliance-safe rule: only the original author may edit, and only until another participant has seen the message. Managers/root admins can moderate visibility (delete/pin) but cannot rewrite another user’s text. Every revision is append-only and synchronized separately, while audit rows are protected from update/delete.
- Messages are plain text (4,000-character limit) by design. Notifications use authenticated, visibility-aware polling so the app remains offline-first without requiring an external realtime service. Attachments, customer-facing inboxes, typing indicators, and external realtime infrastructure are intentionally outside this store-operations scope.

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
| SALES_AGENT  | ✓   | —      | —       | —     | —       | —      | —     || VIEWER      | —   | —        | —       | —     | —       | —      | Read-only messaging |


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
#   SESSION_PASSWORD    = (32+ char random — `openssl rand -hex 32`)  ← required
#   ROOT_ADMIN_EMAIL    = you@example.com     (optional — only for `npm run seed`)
#   ROOT_ADMIN_PASSWORD = StrongPass!123      (optional — only for `npm run seed`)
#   ROOT_ADMIN_NAME     = Your Name            (optional)
#   SEED_STORE_CURRENCY = USD                  (optional — sample store currency)
#   SEED_STORE_CURRENCY_SYMBOL = $             (optional — override symbol)
#   PORT                = 3000 (optional; defaults to 3000)
# Optional:
#   MONGODB_URI = mongodb+srv://user:pass@cluster.mongodb.net/storepoint
```

> Skip the `ROOT_ADMIN_*` values if you'd rather create your first account from the
> browser: start the app and open **http://localhost:3000/setup**.

### 3. Seed (creates root admin + sample store + demo products)

```bash
npm run seed
```

Demo product prices scale to `SEED_STORE_CURRENCY`, so the sample store looks realistic whether you're in Lagos (₦), Nairobi (KSh), or New York ($).

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

### Docker

Docker packages the Next.js web server and the offline sync worker from the same production image. SQLite is stored in a named Docker volume so data survives container recreation.

```bash
cp .env.example .env
# Edit .env and set SESSION_PASSWORD (required). ROOT_ADMIN_* are optional —
# if omitted, create the first account from the /setup screen in your browser.
# Set MONGODB_URI if cloud synchronization is desired; leave it empty for offline mode.

docker compose up --build -d
```

Open http://localhost:3000. View service logs with:

```bash
docker compose logs -f web sync-worker
```

Stop the services without deleting the SQLite volume:

```bash
docker compose down
```

To intentionally delete the persisted SQLite data as well:

```bash
docker compose down -v
```

### Docker SQLite backups

The backup command uses SQLite's online `.backup` API, which safely includes WAL-backed data while the app is running:

```bash
npm run docker:backup
# Optional destination directory:
npm run docker:backup -- ./backups
```

Restore only after stopping the stack. The restore command checks SQLite integrity, refuses to run against active services, creates a timestamped rollback backup of the current volume database beside the supplied backup, and preserves the container's runtime ownership:

```bash
docker compose down
npm run docker:restore -- ./backups/storepoint-YYYYMMDDTHHMMSSZ.db
docker compose up -d
```

A `storepoint-pre-restore-*.db` rollback backup is created in the same directory before replacement. Backups are written to `./backups/`, which is ignored by Git. Store them in protected external storage for production disaster recovery.

For a non-default server port, set `PORT` in `.env` (for example `PORT=8080`); Docker maps and starts the app on that port. For a deployed hostname or custom port, set both `APP_URL` and `ALLOWED_ORIGINS` to the appropriate origin before starting the stack.

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
- The first account is created via the one-time `/setup` screen or `npm run seed` — there's no open self-serve signup.
- All mutations require a session + matching store membership + permission.
- Soft delete everywhere means even a "deleted" record is recoverable from the SQLite file.
- HTTPS / reverse-proxy with TLS is your responsibility in front of the app.

---

## 🛣 Roadmap (suggested next steps)

- **Receipts**: PDF + SMS receipts.
- **Mobile-friendly POS**: PWA install, barcode scanner via camera.
- **Inventory transfers** between stores.
- **Multi-currency** with per-store exchange rates for consolidated reporting.
- **Purchase orders** for restocking.
- **Email/WhatsApp exports** for daily summaries.
- **Customer credit** / layaway tracking.
- **Automatic on-disk backup** with `sqlite3 .backup` every hour → S3.

---

## 📜 License

MIT — bring it on, build your dream shop tool.
