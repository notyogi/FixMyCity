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

---