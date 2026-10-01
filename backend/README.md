# FixMyCity Backend API

FixMyCity Backend is a Node.js and Express REST API built with TypeScript and Prisma ORM. It serves as the central server for the FixMyCity crowdsourced infrastructure damage reporting ecosystem, processing reports submitted by citizens, validating Supabase JWT authentication, managing report statuses, and queuing issues for municipal resolution.

---

## Architecture & Folder Structure

```text
backend/
  ├── prisma/
  │   └── schema.prisma         # Prisma schema configured for PostgreSQL
  ├── src/
  │   ├── controllers/
  │   │   └── reports.controller.ts  # Request handlers for reports (stubs)
  │   ├── middleware/
  │   │   └── auth.middleware.ts    # Supabase JWT authentication verifier (stub)
  │   ├── routes/
  │   │   ├── auth.routes.ts        # Authentication routes
  │   │   ├── health.routes.ts      # Health check endpoint (/api/health)
  │   │   └── reports.routes.ts     # Reports endpoints (/api/reports)
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

Populate `.env` with your actual credentials:

```env
# PostgreSQL connection string (Supabase Postgres)
DATABASE_URL=postgresql://user:password@host:5432/postgres

# Supabase Auth configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Server Port
PORT=5000
```

> [!NOTE]
> On macOS, AirPlay Receiver / Control Center occupies port `5000` by default. If port `5000` is in use, change `PORT=5001` in your local `.env` or disable AirPlay Receiver in *System Settings > General > AirDrop & AirPlay*.

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
FixMyCity Backend API listening on port 5000
Health check: http://localhost:5000/api/health
```

### 3. Verification

Test the health-check route:

```bash
curl http://localhost:5000/api/health
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
