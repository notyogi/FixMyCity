# FixMyCity

FixMyCity is a crowdsourced civic infrastructure reporting platform that allows citizens to report damage (potholes, broken streetlights, water leaks) with photos and geolocation, while municipal authorities can prioritize and track repairs.

---

## Architecture Overview

The project is structured as a monorepo containing:
- **`fixmycity_app`**: Cross-platform mobile app built with Flutter (Supabase Auth, Cloudinary, Google Maps).
- **`backend`**: RESTful API server built with Node.js, Express, TypeScript, and Prisma ORM connecting to Supabase PostgreSQL with PostGIS.

---

## Week 1 — Project Setup & Architecture

### **Sep 30, 2026 — Repository & Workflow Setup**
- Initialized Git repository.
- Configured repository `.gitignore` rules for environment variables and build dependencies.

### **Oct 01, 2026 — Monorepo & Project Scaffolding**
- **Mobile (`fixmycity_app`)**: Initialized Flutter project with Material 3 civic theme, dependency manifests, and skeleton screens (Login, Home, Report Submission, My Reports).
- **Backend (`backend`)**: Initialized Node.js/Express project with TypeScript, security middleware, and structured directories (`routes`, `controllers`, `services`, `middleware`).

### **Oct 02, 2026 — Database Provisioning & Client Models**
- Provisioned remote PostgreSQL database instance on Supabase with the **PostGIS** geospatial extension enabled.
- Defined initial client data models in Flutter for `user_model.dart` and `report_model.dart`.

### **Oct 03, 2026 — Cloudinary Asset Pipeline Setup**
- Created Cloudinary account and configured an **unsigned upload preset** (`fixmycity_preset`).
- Implemented `cloudinary_service.dart` in Flutter using `cloudinary_public` for direct image uploads without exposing API secrets in mobile code.

### **Oct 04, 2026 — Authentication, Pooling & End-to-End Connectivity**
- **Authentication & Deep Linking**: Implemented Supabase Auth (Email & Google OAuth) with native deep linking (`fixmycity://login-callback`) on Android and iOS.
- **Database Connection Pooling**: Configured Prisma with pooled (`DATABASE_URL`) and direct (`DIRECT_URL`) Supabase connections; verified live database & PostGIS connectivity.
- **End-to-End Connectivity**: Added Express health-check endpoint (`/api/v1/health`) and wired up a "Test Backend Connection" button on the mobile Home Screen.

---

## Week 2 — Database Schema & Core Backend APIs

### **Oct 05, 2026 — Core Database Schema & Migration (Users & Reports)**
- **Prisma Schema Modeling**: Designed core models in `schema.prisma` for `User` (mapped to Supabase Auth UUIDs) and `Report` (with geospatial coordinates, Cloudinary media URLs, and cluster linkage).
- **PostgreSQL Enums & Indexing**: Created custom enums for `IssueType`, `Severity`, and `ReportStatus` (`SUBMITTED` default); added database indexes for `status`, `cluster_id`, and `created_at`.
- **Database Migration**: Created and applied the initial migration (`init_core_models`) to the remote Supabase PostgreSQL database via `DIRECT_URL`, verifying table creation and relational integrity in the Supabase Schema Visualizer.

### **Oct 06, 2026 — Clustering & Confirmation Models Migration**
- **Prisma Schema Expansion**: Designed and integrated `ReportCluster` (centroid coordinates, priority scoring, auto-timestamps) and `ReportConfirmation` (junction model with composite unique constraint on `[report_id, confirmed_by_user_id]`).
- **Relational Integrity**: Established cross-table foreign key relations between `User`, `Report`, `ReportCluster`, and `ReportConfirmation`.
- **Database Migration**: Created and applied migration (`add_clusters_and_confirmations`) to remote Supabase PostgreSQL via `DIRECT_URL`, verifying the complete relational graph in the Supabase Schema Visualizer.

### **Oct 09, 2026 — Core Report Management APIs, Validation & Auth Middleware**
- **Supabase JWT Authentication & RBAC Middleware**: Implemented `requireAuth` to verify Supabase JWT tokens via `@supabase/supabase-js` service role client, extending Express `Request` with authenticated user context; implemented `requireAdmin` for protected administrative operations via `ADMIN_USER_IDS`.
- **Zod Validation Layer**: Created comprehensive schemas in `report.validation.ts` leveraging native Prisma enums (`IssueType`, `Severity`, `ReportStatus`), geographic coordinate bounds (`lat`, `lng`), and paginated query parameters.
- **Report Management Controllers & Routing**: Implemented full CRUD endpoints for civic damage reports (`POST /api/v1/reports`, `GET /api/v1/reports`, `GET /api/v1/reports/:id`, `PATCH /api/v1/reports/:id/status`) with foreign key relational integrity, pagination, and cluster associations.
- **Database Utilities & Verification**: Centralized Prisma and Supabase service client singletons; verified end-to-end functionality across live database persistence and Postman collection testing.

### **Oct 10, 2026 — Postman Collection Setup & End-to-End Reports API Testing**
- **Postman Workspace & Collection Structure**: Configured dedicated `Reports` folder within the `FixMyCity` Postman collection with collection-level variables (`{{server}}` set to `http://localhost:5001/api/v1`).
- **End-to-End CRUD Verification**:
  - `POST submit report`: Successfully verified report creation with coordinates, image URLs, and enums, confirming database insertion into Supabase.
  - `GET get reports`: Verified paginated listing with query filters (`page`, `limit`, `status`, `issue_type`) and reporter details.
  - `GET Report Detail by ID`: Verified single report lookup with path variables (`:id`) and relational user info.
  - `PATCH Update Report Status`: Verified admin-only status transitions (`SCHEDULED`) protected by JWT validation and `ADMIN_USER_IDS` authorization.

### **Oct 11, 2026 — Supabase Admin Client Refactor & Protected Route Testing**
- **Supabase Admin Client Singleton**: Created `src/lib/supabaseAdmin.ts` using `createClient` from `@supabase/supabase-js` with `autoRefreshToken: false` and `persistSession: false` for dedicated server-side authentication operations.
- **Auth Middleware Refactoring**: Updated `requireAuth` and `requireAdmin` in `src/middleware/auth.middleware.ts` to consume `supabaseAdmin` directly and standardized error messages (`Missing or malformed authorization header`, `Invalid or expired token`, `Admin access required`).
- **Protected Test Endpoint**: Added `GET /api/v1/protected-test` in `src/app.ts` to independently verify JWT token extraction and user payload echoing without modifying the public health check.
- **Postman Integration**: Added and verified `GET Protected Test` in the Postman collection across unauthorized (401) and authenticated (200) scenarios.

---