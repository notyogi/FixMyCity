# FixMyCity — Municipal Admin Dashboard

The web management portal for municipal staff, city engineers, and administrative operators to monitor incoming reports, inspect aggregated hazard clusters, and track prioritized civic issues.

Built with **React 18**, **TypeScript**, **Vite**, **Tailwind CSS v4**, **React Router v7**, and **TanStack React Query**.

---

## 🛠️ Tech Stack & Architecture

- **Framework**: Vite + React 18 + TypeScript
- **Styling**: Tailwind CSS (official `@tailwindcss/vite` integration)
- **Routing**: `react-router-dom` with authenticated protected route gating
- **Authentication**: Supabase Auth (Email & Password authentication via `@supabase/supabase-js`)
- **Data Fetching**: `@tanstack/react-query` with typed `apiClient` wrapper
- **API Integration**: Connects to the Express backend (`GET /api/v1/health`, `GET /api/v1/reports/priority-queue`)
- **Cloud Resilience**: 30s timeout with automatic cold-start warning for Render free tier instances

---

## 📁 Project Structure

```text
dashboard/
├── public/                 # Static public assets
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── AppLayout.tsx   # Top navigation bar, user session badge & civic footer
│   │   ├── ProtectedRoute.tsx # Route guard enforcing active Supabase session
│   │   └── StatusBanner.tsx   # Global banner alert for server cold-starts & errors
│   ├── hooks/
│   │   └── useAuth.tsx     # Session management & Supabase Auth context hook
│   ├── lib/
│   │   ├── apiClient.ts    # Fetch wrapper with Bearer token injection & error typing
│   │   └── supabaseClient.ts # Supabase client initialized with public anon key
│   ├── pages/
│   │   ├── DashboardPage.tsx # Connection verification & top-5 priority queue view
│   │   ├── LoginPage.tsx     # Municipal staff sign-in form
│   │   └── NotFoundPage.tsx  # Civic 404 error page
│   ├── types/
│   │   └── api.ts          # TypeScript interfaces for Priority Queue & Cluster models
│   ├── App.tsx             # Root router & React Query provider setup
│   ├── index.css           # Tailwind CSS imports & base styles
│   └── main.tsx            # DOM root entry point
├── vercel.json             # SPA routing rewrite rule for Vercel
├── vite.config.ts          # Vite configuration with Tailwind CSS plugin
└── package.json
```

---

## ⚙️ Environment Variables

Create a `.env` file inside `/dashboard` (refer to `.env.example`):

```env
# Supabase Configuration
# IMPORTANT: Use ONLY the public anon key in the browser. NEVER use the service role key!
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# FixMyCity Express Backend API Base URL (including /api/v1 prefix)
# Local development default:
VITE_API_BASE_URL=http://localhost:5001/api/v1

# Production on Render:
# VITE_API_BASE_URL=https://fixmycity-fvfg.onrender.com/api/v1
```

---

## 🚀 Local Development

1. **Navigate to the dashboard directory**:
   ```bash
   cd dashboard
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the local development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

4. **Build and test for production**:
   ```bash
   npm run build
   npm run preview
   ```

---

## ☁️ Vercel Deployment

When importing the `FixMyCity` repository into Vercel, configure the following project settings:

| Setting | Value |
| :--- | :--- |
| **Framework Preset** | `Vite` |
| **Root Directory** | `dashboard` *(Click Edit and choose `dashboard`)* |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

### Environment Variables on Vercel:
Add the following in **Vercel Project Settings $\rightarrow$ Environment Variables**:
- `VITE_SUPABASE_URL`: Your Supabase project URL (`https://<project-ref>.supabase.co`)
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous key
- `VITE_API_BASE_URL`: Your deployed backend URL (e.g. `https://fixmycity-fvfg.onrender.com/api/v1`)

The included `vercel.json` ensures all deep routes (such as `/login` or `/`) are rewritten to `/index.html`, preventing 404 errors on page reload.
