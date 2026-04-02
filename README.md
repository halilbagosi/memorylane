# MemoryLane

A backend API for a caregiver-patient memory quiz application. Caregivers upload media (photos, audio) of familiar people, and patients take recognition quizzes to help with memory retention. The system tracks quiz performance and provides analytics.

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **Framework:** NestJS 11
- **Database:** PostgreSQL 17
- **ORM:** Prisma 6
- **Authentication:** JWT (with server-side session tracking via `AuthSession` table)
- **Password Hashing:** bcrypt

## Project Structure

```
backend/server/
├── src/
│   ├── auth/                # Authentication module
│   │   ├── auth.controller.ts   # Signup, login, logout routes
│   │   ├── auth.service.ts      # Auth business logic
│   │   ├── auth.module.ts       # Module wiring (JWT, Passport)
│   │   ├── jwt.strategy.ts      # Passport JWT strategy with DB session check
│   │   └── jwt-auth.guard.ts    # Reusable auth guard
│   ├── dto/
│   │   ├── signup.dto.ts        # Signup validation (email restricted to @epoka.edu.al)
│   │   └── login.dto.ts         # Login validation
│   ├── prisma/
│   │   ├── prisma.service.ts    # Prisma client service
│   │   └── prisma.module.ts     # Global Prisma module
│   ├── app.module.ts            # Root module
│   └── main.ts                  # App bootstrap
├── prisma/
│   └── schema.prisma            # Database schema
├── test/                        # E2E tests
└── package.json
```

## Database Models

| Model | Purpose |
|-------|---------|
| **Caregiver** | User accounts (email, password, join code for family groups) |
| **Patient** | Individuals taking memory quizzes |
| **PatientCaregiver** | Many-to-many link between caregivers and patients |
| **Media** | Photos/audio of people the patient should recognize |
| **QuizSession** | A quiz sitting by a patient |
| **QuizAttempt** | Individual question results within a session |
| **AuthSession** | JWT session tracking (supports server-side revocation) |
| **PasswordResetRequest** | Password reset tokens |
| **AnalyticsSnapshot** | Daily aggregated quiz performance stats |

## Prerequisites

- Node.js (v20+)
- PostgreSQL 17
- npm

## Getting Started

1. **Install dependencies:**

   ```bash
   cd backend/server
   npm install
   ```

2. **Configure environment variables:**

   Create `backend/server/.env`:

   ```
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/memorylane"
   JWT_SECRET=your-secure-random-secret-here
   ```

3. **Set up the database:**

   ```bash
   # Make sure PostgreSQL is running
   brew services start postgresql@17   # macOS with Homebrew

   # Create the database
   createdb -U postgres memorylane

   # Apply migrations
   cd backend/server
   npx prisma migrate deploy
   ```

4. **Start the dev server:**

   ```bash
   cd backend/server
   npm run start:dev
   ```

   The API will be available at `http://localhost:3000`.

## API Endpoints

### Authentication

#### `POST /auth/signup`

Register a new caregiver.

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane",
    "surname": "Doe",
    "email": "jane@epoka.edu.al",
    "password": "Secret1!",
    "isPrimary": true
  }'
```

For secondary caregivers, set `"isPrimary": false` and include the `"inviteCode"` from the primary caregiver.

#### `POST /auth/login`

Authenticate and receive a JWT.

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@epoka.edu.al",
    "password": "Secret1!"
  }'
```

Returns: `{ "accessToken": "eyJhbG..." }`

#### `POST /auth/logout`

Revoke the current session (requires authentication).

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Protected Routes

Any route can be protected by applying the `JwtAuthGuard`:

```typescript
@UseGuards(JwtAuthGuard)
@Get('profile')
getProfile(@Request() req) {
  // req.user.userId, req.user.email, req.user.sessionId
}
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start in watch mode |
| `npm run build` | Compile TypeScript |
| `npm run start:prod` | Run compiled output |
| `npm run lint` | Lint and auto-fix |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests |