# FixMyCity Backend API

FixMyCity Backend is a Node.js and Express REST API built with TypeScript and Prisma ORM. It serves as the central server for the FixMyCity crowdsourced infrastructure damage reporting ecosystem, processing reports submitted by citizens, validating Supabase JWT authentication, managing report statuses, and queuing issues for municipal resolution.

---

## Architecture & Folder Structure

```text
backend/
  ├── prisma/
  │   └── schema.prisma         # Prisma schema configured for PostgreSQL & Supabase pooling
  ├── src/
  │   ├── controllers/
  │   │   └── reports.controller.ts  # Request handlers for reports (stubs)
  │   ├── middleware/
  │   │   └── auth.middleware.ts    # Supabase JWT authentication verifier (stub)
  │   ├── routes/
  │   │   ├── auth.routes.ts        # Authentication routes
  │   │   ├── health.routes.ts      # Health check endpoint (/api/v1/health)
  │   │   └── reports.routes.ts     # Reports endpoints (/api/v1/reports)
  │   ├── scripts/
  │   │   └── testConnection.ts     # Database & PostGIS connectivity test script
  │   ├── services/
  │   │   ├── dedup.service.ts      # Proximity & duplicate report detection (stub)
  │   │   └── priority.service.ts   # Severity & priority score calculation (stub)
  │   ├── utils/                    # Utility functions placeholder
  │   ├── app.ts                    # Express application setup (cors, helmet, morgan, routes)
  │   └── server.ts                 # Server entry point (loads env, listens on PORT)
  ├── .env.example                  # Template of required environment variables
  ├── .gitignore                    # Ignores node_modules, dist, and .env
  ├── package.json                  # Scripts and dependencies
  └── tsconfig.json                 # TypeScript compiler configuration (ES2022, strict mode)
```

---

## Environment Configuration

The service uses `dotenv` to load secrets and settings dynamically. **No secrets or connection strings are hardcoded.**

### 1. Create `.env`

Copy `.env.example` to create your local `.env`:

```bash
cp .env.example .env
```

### 2. Configure Variables

Populate `.env` with your actual Supabase database URLs and credentials:

```env
# Pooled connection string (port 6543 with pgbouncer) used for runtime queries
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"

# Direct connection string (port 5432) used for Prisma migrations
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# Supabase Auth configuration
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Server Port
PORT=5001
```

> [!NOTE]
> On macOS, AirPlay Receiver / Control Center occupies port `5000` by default. If port `5000` is in use, use `PORT=5001` in your local `.env` or disable AirPlay Receiver in *System Settings > General > AirDrop & AirPlay*.

---

## Database Setup & Prisma Migrations

Prisma is configured to connect to Supabase PostgreSQL with PostGIS support.

### Supabase Connection Pooling
Supabase provides two connection strings:
1. **`DATABASE_URL` (Pooled, port 6543):** Used by Prisma Client for runtime application queries via PgBouncer.
2. **`DIRECT_URL` (Direct, port 5432):** Used by Prisma CLI for running schema migrations, as PgBouncer does not support the migration locking mechanism.

### Testing Connection & PostGIS
Once your `.env` has the connection strings configured, verify connectivity and the PostGIS extension with:

```bash
npm run test:db
```

This runs `src/scripts/testConnection.ts` and executes `SELECT PostGIS_Version();` against your Supabase database.

### Running Schema Migrations
Whenever you update `prisma/schema.prisma`, create and apply migrations using:

```bash
npx prisma migrate dev --name <migration_name>
```
Prisma will automatically route the migration through `DIRECT_URL`.

To re-generate the Prisma Client types:
```bash
npx prisma generate
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.0.0 or higher)
- [npm](https://www.npmjs.com/) (v9.0.0 or higher)

### 1. Installation

Install all required dependencies:

```bash
npm install
```

### 2. Running in Development (Hot Reload)

Start the development server with `ts-node-dev`:

```bash
npm run dev
```

The server will start and display:
```text
FixMyCity Backend API listening on port 5001
Health check: http://localhost:5001/api/v1/health
```

### 3. Verification

Test the health-check route:

```bash
curl http://localhost:5001/api/v1/health
# Returns: {"status":"ok"}
```

---

## Production Build

To compile TypeScript and run the compiled JavaScript bundle:

```bash
# Compile to /dist
npm run build

# Start production server from /dist
npm start
```

---

## Available NPM Scripts

- `npm run dev` — Starts server in watch mode using `ts-node-dev`
- `npm run build` — Compiles TypeScript into `/dist` using `tsc`
- `npm start` — Executes compiled bundle (`dist/server.js`) with Node.js
- `npm run test:db` — Runs `src/scripts/testConnection.ts` to test Supabase DB & PostGIS connectivity
