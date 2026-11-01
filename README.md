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

## Week 3 — Mobile App: Reporting Flow

### **Oct 14, 2026 — Mobile Reporting Flow & State Management**
- **Prisma Enum Mirroring**: Defined Dart enums for `IssueType` and `Severity` in `report_model.dart` matching the backend schema with human-readable labels and severity hints.
- **Login & Sign Up Screen**: Built `LoginScreen` with mode toggle, email/password validation, Google OAuth via `AuthService`, and guest entry fallback.
- **Multi-Step Reporting Flow**: Created a 3-step workflow in `report_submission_screen.dart` combining camera capture/gallery picking (`image_picker`), GPS geotagging (`LocationService`), issue tagging, and summary review.
- **Riverpod State Management**: Implemented `newReportProvider` (`NewReportNotifier`) to maintain form state across steps and manage report lifecycle.

### **Oct 17, 2026 — Location Services, Camera Integration & UI Capture Widgets**
- **Enhanced Location Service & Exceptions**: Refactored `LocationService` with dedicated exception classes (`LocationPermissionException`, `LocationFetchException`), OS-level and app-level settings navigation helpers (`openLocationSettings()`, `openAppSettings()`), and fallback to `getLastKnownPosition()`.
- **High-Accuracy GPS Geotagging**: Configured `Geolocator` with high-accuracy position acquisition and explicit 10-second timeout handling for reliable civic issue coordinates.
- **iOS Permission Descriptions**: Updated `Info.plist` with clear, user-facing privacy descriptions for `NSLocationWhenInUseUsageDescription` and `NSLocationAlwaysAndWhenInUseUsageDescription`.
- **Camera Service Layer**: Built `CameraService` wrapping `image_picker` for camera captures and gallery selection with automatic resolution optimization and quality compression (`imageQuality: 85`, `maxWidth: 1920`, `maxHeight: 1080`).
- **Camera Capture & Photo Preview Widgets**: Implemented reusable UI widgets (`CameraCaptureWidget`, `PhotoPreviewWidget`) providing image previews, retake/replace options, camera permission handling (`NSCameraUsageDescription`), and full-screen preview overlays.
- **Camera Test Screen**: Added `CameraTestScreen` accessible directly from the home dashboard for standalone verification of camera/gallery capture flows and file metadata.

### **Oct 18, 2026 — Cloudinary Asset Pipeline, Offline Queueing & Auto-Sync Engine**
- **Cloudinary Upload Service**: Enhanced `CloudinaryService` with unsigned direct uploads, upload progress tracking streams (`uploadImageWithProgress`), credential validation, and custom `ImageUploadException`.
- **Interactive Cloudinary Test Screen**: Added `CloudinaryTestScreen` featuring live upload progress bars, status indicators, hosted image previews, and direct URL copy actions.
- **Offline Storage with SQLite (`sqflite`)**: Implemented `SQLiteHelper` managing a persistent `pending_reports` table with schema versioning and defensive migration handling (`onUpgrade`) for offline queuing.
- **Sandbox Photo Persistence**: Implemented permanent storage copying in `NewReportNotifier` (`_persistImageFile`) to save captured photos into persistent application documents storage (`pending_report_photos/`), preventing OS temporary cache purges before synchronization.
- **Background Auto-Sync Engine (`SyncService`)**: Built singleton `SyncService` paired with `ConnectivityService` (`connectivity_plus`) to detect network transitions and automatically drain queued reports sequentially upon online reconnection.
- **Offline Queue Management UI**: Developed `PendingReportsScreen` featuring report cards with status badges (`pending`, `syncing`, `failed`), retry counters, individual retry triggers, queue batch syncing, and deletion controls.
- **End-to-End Additional Notes Support**: Added `notes` support across the entire stack — Supabase PostgreSQL database (`ALTER TABLE reports ADD COLUMN notes TEXT`), Prisma schema & client, Zod validation schema, Express `createReport` controller, and Flutter serialization in `ApiService`, `NewReportNotifier`, and `SQLiteHelper`.
- **Comprehensive Test Suite**: Implemented extensive unit tests across `cloudinary_service_test.dart`, `report_submit_flow_test.dart`, and `offline_queue_test.dart` (22 total tests passing) verifying online submissions, offline queue persistence, failure retries, and network recovery flows.

---

## Week 4 — Duplicate Detection Engine

### **Oct 19, 2026 — Server-Side Perceptual Hashing & Duplicate Detection Utilities**
- **Perceptual Hash Service (`ImageHashService`)**: Built a 64-bit pHash engine using `sharp` and Discrete Cosine Transform (DCT-II) to generate 16-character hex signatures for uploaded damage photos.
- **Hamming Distance & Similarity Metrics**: Implemented `computeHammingDistance` with a bitwise popcount table to classify duplicate and near-duplicate reports (match threshold `<= 5` bits).
- **Report Controller Integration**: Wired automated image hashing into `POST /api/v1/reports`, persisting `image_hash` to PostgreSQL with non-blocking fallback handling.
- **Backfill Script**: Added `npm run backfill:hashes` to scan and compute missing perceptual hashes for legacy database records.
- **Similarity CLI Test Suite**: Created `npm run test:hash-similarity` to verify Hamming distance and similarity scoring across synthetic scenes, camera compression variants, and live Cloudinary URLs.

### **Oct 20, 2026 — Geospatial Proximity Lookup & PostGIS ST_DWithin Engine**
- **Geospatial Proximity Service (`ProximityService`)**: Implemented `findNearbyOpenReports` using PostGIS `ST_DWithin` and `ST_Distance` with geography casting to find candidate reports within 25m.
- **Parameterized SQL & Error Handling**: Executed queries via `prisma.$queryRaw` tagged templates with safe UUID self-exclusion and custom `ProximityQueryException` handling.
- **Open Status Filtering**: Restricted candidates to active reports (`status NOT IN ('FIXED', 'REJECTED')`), ignoring historical resolved or rejected items.
- **Spatial Index Migration**: Added `@@index([lat, lng])` composite index to the `Report` model and applied migration `20261020143124_add_lat_lng_index`.
- **Controller Logging**: Integrated non-blocking proximity lookups into `createReport` with diagnostic distance and candidate logs on report creation.
- **CLI Test Script**: Created `src/scripts/testProximityQuery.ts` and `npm run test:proximity` for quick verification with CLI args and tabular results.

### **Oct 21, 2026 — Automated Duplicate Detection & Cluster Assignment Engine**
- **Hamming Distance Utility (`hammingDistance`)**: Implemented `/src/utils/hamming.ts` computing bitwise XOR and binary difference counts to quantify visual similarity between pHash signatures.
- **Clustering Decision Service (`ClusteringService`)**: Built `evaluateAndAssignCluster` evaluating 25m PostGIS candidates against pHash thresholds to merge reports into existing clusters or create new ones.
- **Atomic Database Transactions**: Wrapped multi-table operations in Prisma `$transaction` — managing `ReportCluster` records, updating `Report.cluster_id`, creating `ReportConfirmation` rows, and updating arithmetic centroid coordinates.
- **Configurable Similarity Threshold**: Added `DEDUP_HAMMING_THRESHOLD` (default: 10 bits) to environment variables for tunable matching precision.
- **Controller Integration**: Replaced read-only proximity logging in `createReport` with automated clustering assignment, enriching API responses with `clusterResult` metadata.
- **Standalone Clustering CLI**: Added `src/scripts/testClustering.ts` and `npm run test:clustering` to test report merging, confirmation counting, and cluster state inspections.

### **Oct 22, 2026 — Cluster Confirmation Audit & Threshold Calibration Harness**
- **Confirmation Count Verification**: Verified `ClusteringService` concurrency handling — confirming atomic `{ increment: 1 }` on merge, count of 2 on paired creation, and 1 on standalone creation inside Prisma transactions.
- **Buffer-Based pHash Support**: Extended `ImageHashService.computePerceptualHash` to accept local Node.js `Buffer` inputs alongside remote URLs for direct offline hashing.
- **Threshold Calibration Tooling**: Created `/backend/test-data` scaffold and `npm run calibrate:threshold` (`src/scripts/calibrateThreshold.ts`) to benchmark real image pairs, compute Hamming distance statistics, and recommend optimal `DEDUP_HAMMING_THRESHOLD` values.
- **Offline Results Logging**: Auto-saved full calibration metrics, separation gaps, and overlap warnings to `test-data/calibration-results.txt` (git-ignored).

### **Oct 24, 2026 — Live Community Feed, Scoped Reports & Mobile Device Support**
- **Live Metrics & Filtering**: Connected Home Screen status cards (`Active`, `In Progress`, `Resolved`) to live database counts with instant tap-to-filter capabilities.
- **Live Activity Feed**: Rendered real community reports on the Home Screen with photo thumbnails, issue icons, relative timestamps, and cluster badges (`👥 N confirmed`).
- **Interactive Report Details (`ReportDetailScreen`)**: Added full-screen zoomable photo inspection, status progress timeline, category/severity badges, cluster duplicate detection info, and GPS clipboard copy.
- **Scoped Community & My Reports**: Separated Quick Actions into **"Community Reports"** (filtering out own reports to show neighbor activity) and **"My Reports"** (showing only the authenticated citizen's submissions).
- **Backend User Filtering**: Added optional `user_id` query parameter to `GET /api/v1/reports` and updated `ApiService.fetchReports` for server-side filtering.
- **Supabase Auth & User Sync**: Verified OAuth custom URL scheme handling (`fixmycity://login-callback`) and configured PostgreSQL database triggers syncing new signups into `public.users`.

---

## Week 5 — Prioritization Logic

### **Oct 30, 2026 — Cluster Priority Scoring Engine & Automated Recomputation**
- **Location Risk Support**: Added `near_sensitive_location` boolean to `Report` model with database migration and updated `createReport` validation.
- **Scoring Config**: Created `priority.config.ts` with tunable weights (`SEVERITY`, `CONFIRMATION`, `LOCATION_RISK`, `AGE`) and caps (`CONFIRMATION_CAP: 10`, `AGE_CAP_DAYS: 30`).
- **Priority Scoring Engine**: Implemented pure `computePriorityScore` function and cluster-level `recomputeClusterPriority` in `priority.service.ts`.
- **Lifecycle Recomputation Hooks**: Hooked automatic priority updates into `ClusteringService` post-merge/create and `updateReportStatus` on resolution.
- **Batch Recompute & Test Scripts**: Added `npm run recompute:priorities` CLI for ranking all clusters and `npm run test:priority` for unit testing scoring rules and caps.

### **Oct 31, 2026 — Mobile Location-Risk Tagging, Offline Queue Migration & Sync**
- **Severity Tagging Polish**: Standardized one-line severity hints (Low, Medium, High, Critical) in dropdown and ensured Severity selection is mandatory.
- **Location-Risk Flag UI**: Added optional "Near a school, hospital, or other sensitive place" checkbox in tagging flow and displayed status in the summary review step.
- **State & Online Pipeline**: Added `nearSensitiveLocation` to Riverpod `newReportProvider` and updated `ApiService.submitReport` to pass the flag in JSON payloads.
- **Offline Queue & SQLite Migration**: Bumped SQLite database to v3 with `onUpgrade` column migration, updated `PendingReport` model, and ensured `SyncService` preserves the flag upon sync.
- **UI Badges & Test Suite**: Added visual location-risk chips in offline queue and report details; expanded test suite covering online submissions, offline persistence, and legacy row syncs (31 tests passing).

### **Nov 01, 2026 — Municipal Priority Queue API & Freshness Engine**
- **Priority Queue Endpoint**: Added `GET /api/v1/reports/priority-queue` returning clusters ranked by priority score with stable tie-breaking.
- **Filtering & Pagination**: Added Zod validation for status, issue type, min severity, sensitive location, and closed cluster filters.
- **Score Freshness**: Added auto-refresh check with concurrency lock using `PRIORITY_REFRESH_MINUTES` (default 15m).
- **Admin Protection**: Secured endpoint with `requireAuth` and `requireAdmin` for municipal staff.
- **Test Suite**: Added `npm run test:priority-queue` covering sorting, tie-breakers, filters, and pagination (26 tests passing).
