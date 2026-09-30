# FixMyCity Mobile App

FixMyCity is a crowdsourced civic infrastructure damage reporting mobile application built with Flutter. It empowers citizens to report public infrastructure issues—such as potholes, broken streetlights, water pipe leaks, damaged sidewalks, and traffic signal outages—directly to municipal authorities with photographic evidence and GPS coordinates.

---

## Features & Highlights

- **Civil Damage Reporting**: Capture photos and pinpoint damage with GPS geolocation.
- **Offline Report Queue**: Reports submitted without an internet connection are saved locally in SQLite (`sqlite_helper.dart`) and synced once connectivity is restored.
- **Supabase Authentication**: Secure citizen sign-up, sign-in, and session management configured dynamically via environment variables.
- **Cloudinary Image Uploads**: Fast, unsigned image hosting for damage photos.
- **State Management**: Built on Flutter Riverpod for reactive state management.
- **Material 3 Design System**: Clean, civic-focused aesthetic with dark mode support, quick action cards, and status tracking.

---

## Folder Structure

```text
/lib
  ├── screens/
  │   ├── login_screen.dart             # Citizen authentication UI & guest entry
  │   ├── home_screen.dart              # Dashboard, quick stats & recent activity feed
  │   ├── report_submission_screen.dart # Damage report form with categories & GPS locator
  │   └── my_reports_screen.dart        # User submission history with status filter chips
  ├── widgets/                          # Reusable UI components (buttons, badges, cards)
  ├── services/
  │   ├── api_service.dart              # REST client for Express backend API
  │   ├── auth_service.dart             # Supabase authentication service
  │   ├── location_service.dart         # Geolocator GPS integration
  │   └── cloudinary_service.dart       # Unsigned image upload service
  ├── models/
  │   ├── report_model.dart             # Data model for damage reports & SQLite schema
  │   └── user_model.dart               # Data model for citizen profile
  ├── providers/                        # Riverpod state providers
  ├── db/
  │   └── sqlite_helper.dart            # Local SQLite database & offline report queue
  └── main.dart                         # App entrypoint, dotenv loader, Supabase init & Riverpod scope
```

---

## Environment Configuration

The application uses `flutter_dotenv` to securely load environment variables at runtime. **No API keys or secrets are hardcoded in the codebase.**

### 1. Create `.env`

Copy the provided `.env.example` file to create your local `.env`:

```bash
cp .env.example .env
```

### 2. Configure Variables

Populate `.env` with your actual project credentials:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_UPLOAD_PRESET=your-unsigned-upload-preset

# Express Backend API URL
BACKEND_API_URL=http://localhost:3000/api
```

> **Security Note**: `.env` is listed in `.gitignore` and must never be committed to source control. Only `.env.example` is tracked.

---

## Getting Started

### Prerequisites

- [Flutter SDK](https://docs.flutter.dev/get-started/install) (v3.13.0 or higher)
- [Xcode](https://developer.apple.com/xcode/) with iOS Simulator & Command Line Tools (for iOS)
- [CocoaPods](https://cocoapods.org/) (`sudo gem install cocoapods` or `brew install cocoapods`)
- [Android Studio](https://developer.android.com/studio) with Android SDK (for Android)

### Installation

1. Navigate to the mobile app directory:
   ```bash
   cd fixmycity_app
   ```

2. Install all dependencies:
   ```bash
   flutter pub get
   ```

3. (iOS only) Install CocoaPods dependencies:
   ```bash
   cd ios && pod install && cd ..
   ```

### Running the App

To launch the app on an active simulator or connected device:

```bash
flutter run
```

Or target a specific device:

```bash
# List available devices/simulators
flutter devices

# Run on iOS Simulator
flutter run -d ios

# Run on Android Emulator
flutter run -d android
```

---

## Testing & Quality Assurance

- **Run Widget & Unit Tests**:
  ```bash
  flutter test
  ```

- **Run Static Analysis (Linter)**:
  ```bash
  flutter analyze
  ```
