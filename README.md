# MemoryLane

A mobile application that helps patients with memory conditions (such as Alzheimer's and dementia) retain recognition of familiar people through interactive quizzes. Caregivers upload photos and audio of family members and friends, while patients take guided recognition quizzes on a paired device. The system tracks performance over time and provides analytics to caregivers.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | Node.js, TypeScript, NestJS 11, Express |
| **Database** | PostgreSQL 17, Prisma 6 ORM |
| **Authentication** | JWT with server-side sessions, Passport, bcrypt, Google OAuth, Apple Sign-In |
| **Email** | Nodemailer (password reset codes) |
| **Mobile App** | Expo ~54, React Native 0.81, React 19, expo-router 6 |
| **UI** | React Native Paper, custom adaptive components, @expo/vector-icons |
| **Device APIs** | Camera, Image Picker, Secure Store, Clipboard, QR Code generation |

## Project Structure

```
memorylane/
├── backend/server/
│   ├── src/
│   │   ├── auth/                    # Authentication module
│   │   │   ├── auth.controller.ts       # All auth & account routes
│   │   │   ├── auth.service.ts          # Auth, profile, sessions, deletion, delegation logic
│   │   │   ├── auth.module.ts           # Module wiring (JWT, Passport)
│   │   │   ├── jwt.strategy.ts          # Passport JWT strategy with DB session check
│   │   │   └── jwt-auth.guard.ts        # Reusable auth guard
│   │   ├── patient/                 # Patient module
│   │   │   ├── patient.controller.ts    # Patient CRUD, pairing, care team routes
│   │   │   ├── patient.service.ts       # Patient join/pairing/care team logic
│   │   │   ├── dashboard/
│   │   │   │   └── dashboard.service.ts # Caregiver overview aggregation
│   │   │   ├── management/
│   │   │   │   ├── management.service.ts      # Primary delegation & patient deletion
│   │   │   │   └── management.service.spec.ts # Unit tests with Prisma mock
│   │   │   ├── dto/                     # Patient-specific DTOs
│   │   │   └── encryption.util.ts       # Patient data encryption helpers
│   │   ├── dto/                     # Shared DTOs
│   │   │   ├── signup.dto.ts
│   │   │   ├── login.dto.ts
│   │   │   ├── social-login.dto.ts
│   │   │   ├── update-profile.dto.ts
│   │   │   ├── change-password.dto.ts
│   │   │   ├── change-email.dto.ts
│   │   │   ├── forgot-password.dto.ts
│   │   │   └── reset-password.dto.ts
│   │   ├── prisma/                  # Prisma client module
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/              # 13 migration files
│   ├── test/
│   │   └── app.e2e-spec.ts          # E2E tests for auth endpoints
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── app/                         # Expo Router screens
│   │   ├── _layout.tsx                  # Root stack layout
│   │   ├── index.tsx                    # Landing / welcome screen
│   │   ├── login.tsx                    # Login (email + Google + Apple)
│   │   ├── signup.tsx                   # Registration
│   │   ├── forgot-password.tsx          # Forgot password flow
│   │   ├── reset-password.tsx           # Reset password with code
│   │   ├── dashboard.tsx                # Caregiver dashboard
│   │   ├── account.tsx                  # Account settings
│   │   ├── add-patient.tsx              # Create a new patient
│   │   ├── join-patient.tsx             # Join as a patient device
│   │   ├── join-space.tsx               # Join an existing care space
│   │   ├── (caregiver-tabs)/            # Caregiver tab navigator
│   │   │   ├── patients.tsx                 # Patient list
│   │   │   ├── inbox.tsx                    # Delegation & role request inbox
│   │   │   └── analytics.tsx                # Performance analytics
│   │   └── (patient-tabs)/              # Patient tab navigator
│   │       ├── quiz.tsx                     # Memory recognition quiz
│   │       └── relive.tsx                   # Media gallery / relive memories
│   ├── src/
│   │   ├── components/              # Reusable UI components
│   │   │   ├── AdaptiveButton.tsx
│   │   │   ├── AdaptiveInput.tsx
│   │   │   ├── AdaptiveCard.tsx
│   │   │   ├── AdaptiveBadge.tsx
│   │   │   ├── AppIcon.tsx
│   │   │   ├── M3BottomSheet.tsx
│   │   │   ├── M3Dialog.tsx
│   │   │   └── M3TabBar.tsx
│   │   ├── theme/
│   │   │   ├── colors.ts            # Design system color tokens
│   │   │   └── typography.ts        # Font family definitions
│   │   ├── config/
│   │   │   └── api.ts               # API base URL configuration
│   │   └── utils/
│   │       └── auth.ts              # Token & user info persistence
│   ├── plugins/
│   │   └── withAndroidGradleJvm.js  # Custom Expo config plugin
│   ├── app.json
│   └── package.json
│
└── README.md
```

## Database Models

| Model | Purpose |
|-------|---------|
| **Caregiver** | User accounts with email, password, avatar, and account status |
| **Patient** | Individuals taking memory quizzes (encrypted name/surname, join code, device pairing) |
| **PatientCaregiver** | Many-to-many link with primary/secondary role tracking |
| **Media** | Photos and audio of people the patient should recognize, with decoy names for quizzes |
| **QuizSession** | A quiz sitting by a patient |
| **QuizAttempt** | Individual question results (correct/incorrect, tap count, response time) |
| **AuthSession** | JWT session tracking with device labels (supports server-side revocation) |
| **PasswordHistory** | Last 5 password hashes to prevent reuse |
| **PasswordResetRequest** | Time-limited 6-digit reset codes |
| **DelegationRequest** | Primary caregiver handover during account deletion |
| **RoleRequest** | Secondary-to-primary role upgrade requests |
| **Notification** | In-app notifications for delegation, role changes, and team events |
| **AnalyticsSnapshot** | Daily aggregated quiz performance stats |

## API Endpoints

### Authentication

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/auth/signup` | No | Register a new caregiver |
| POST | `/auth/login` | No | Email/password login |
| POST | `/auth/social-login` | No | Google or Apple OAuth login |
| POST | `/auth/forgot-password` | No | Request a password reset code |
| POST | `/auth/reset-password` | No | Reset password with code |
| POST | `/auth/logout` | Yes | Revoke current session |
| POST | `/auth/restore-account` | No | Restore a deactivated account |

### Profile & Settings

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/auth/me` | Get current user profile |
| PATCH | `/auth/profile` | Update name, surname, avatar |
| PATCH | `/auth/change-password` | Change password (with history check) |
| PATCH | `/auth/change-email` | Change email address |

### Sessions

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/auth/sessions` | List active sessions |
| DELETE | `/auth/sessions/:id` | Revoke a specific session |
| DELETE | `/auth/sessions/others` | Revoke all other sessions |

### Account Deletion

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/auth/request-deletion` | Start deletion (triggers delegation flow if primary) |
| POST | `/auth/confirm-deletion` | Confirm deletion after delegations are resolved |
| POST | `/auth/cancel-deletion` | Cancel pending deletion |
| GET | `/auth/deletion-status` | Check delegation progress |
| DELETE | `/auth/account` | Immediate hard delete (no dependents) |

### Delegation & Role Requests

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/auth/delegate-patient` | Send/resend delegation to a secondary |
| GET | `/auth/delegation-requests/incoming` | View incoming delegation requests |
| POST | `/auth/delegation-requests/:id/accept` | Accept a delegation |
| POST | `/auth/delegation-requests/:id/decline` | Decline a delegation |
| POST | `/auth/delegation-requests/:id/resend` | Resend a delegation request |
| POST | `/auth/role-requests` | Request primary role for a patient |
| GET | `/auth/role-requests/incoming` | View incoming role requests |
| GET | `/auth/role-requests/pending-by-me` | View your pending role requests |
| POST | `/auth/role-requests/:id/approve` | Approve a role request |
| POST | `/auth/role-requests/:id/decline` | Decline a role request |

### Notifications

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/auth/notifications` | List all notifications |
| DELETE | `/auth/notifications/:id` | Delete a notification |
| PATCH | `/auth/notifications/mark-all-read` | Mark all as read |

### Patients

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/patients` | Create a new patient |
| POST | `/patients/join` | Patient device joins via code |
| POST | `/patients/join-as-caregiver` | Caregiver joins a patient's care team |
| GET | `/patients/my-list` | List all patients for current caregiver |
| GET | `/patients/:id/paired-status` | Check if patient device is paired |
| PATCH | `/patients/:id/unpair` | Unpair a patient device |
| PATCH | `/patients/:id` | Update patient details |
| GET | `/patients/:id/caregivers` | List caregivers for a patient |
| PATCH | `/patients/:id/delegate-primary` | Transfer primary role |
| DELETE | `/patients/:id/caregivers/:caregiverId` | Remove a caregiver from care team |
| DELETE | `/patients/:id/leave` | Leave a patient's care team |
| DELETE | `/patients/:id` | Delete a patient |

## Prerequisites

- Node.js v20+
- PostgreSQL 17
- npm
- Xcode (for iOS development builds)
- Android Studio (for Android development builds)

## Getting Started

### Backend

1. **Install dependencies:**

   ```bash
   cd backend/server
   npm install
   ```

2. **Configure environment variables:**

   Copy `backend/server/.env.example` to `backend/server/.env` and fill in:

   ```env
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/memorylane
   JWT_SECRET=your-secure-random-secret-here
   PORT=3000

   # Google OAuth (from https://console.cloud.google.com/apis/credentials)
   GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
   GOOGLE_IOS_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com
   GOOGLE_ANDROID_CLIENT_ID=your-android-client-id.apps.googleusercontent.com

   # Apple Sign-In
   APPLE_BUNDLE_ID=com.memorylane.app

   # SMTP (optional — falls back to console in development only)
   SMTP_HOST=smtp.example.com
   SMTP_PORT=587
   SMTP_USER=you@example.com
   SMTP_PASS=your-smtp-password
   ```

   > **Note:** Set `NODE_ENV=production` in any deployed environment. Without SMTP configured in production, password reset codes will not be sent and will not appear in logs.

3. **Set up the database:**

   ```bash
   createdb -U postgres memorylane
   cd backend/server
   npx prisma migrate deploy
   ```

4. **Start the dev server:**

   ```bash
   npm run start:dev
   ```

   The API will be available at `http://localhost:3000`.

### Frontend

1. **Install dependencies:**

   ```bash
   cd frontend
   npm install
   ```

2. **Configure environment variables:**

   Copy `frontend/.env.example` to `frontend/.env.local` and set as needed:

   ```env
   # Physical device: use your machine's LAN IP
   # EXPO_PUBLIC_API_BASE_URL=http://192.168.1.X:3000

   # Google Sign-In
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com
   ```

3. **Run with Expo Go** (limited — Google/Apple sign-in unavailable):

   ```bash
   npx expo start
   ```

4. **Run with development build** (full functionality including social login):

   ```bash
   npx expo prebuild
   npx expo run:ios      # or npx expo run:android
   ```

## Backend Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start in watch mode |
| `npm run build` | Compile TypeScript |
| `npm run start:prod` | Run compiled output |
| `npm run lint` | Lint and auto-fix |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests |

## Testing

The backend has two test suites:

- **Unit tests** (`npm run test`) — `management.service.spec.ts` tests `delegatePrimaryRole` and `deletePatient` with a Prisma mock.
- **E2E tests** (`npm run test:e2e`) — `test/app.e2e-spec.ts` boots the full NestJS app and tests real auth endpoints (bad credentials → 401, missing fields → 400, weak password → 400).

## Key Features

- **Caregiver accounts** with email/password, Google Sign-In (iOS + Android), and Apple Sign-In (iOS)
- **Patient profiles** with encrypted personal data, QR-code-based device pairing, and join codes
- **Care teams** with primary/secondary caregiver roles, delegation, and role transfer workflows
- **Memory quizzes** with photo + audio recognition, multiple-choice with decoy names, and performance tracking
- **Analytics** with daily accuracy snapshots and response time metrics
- **Account lifecycle** with soft deletion, 10-day grace period, delegation-based handover, and account restoration
- **Session management** with per-device tracking and remote revocation
- **Password security** with history-based reuse prevention and email-based reset codes
- **In-app notifications** for delegation events, role changes, and team updates
