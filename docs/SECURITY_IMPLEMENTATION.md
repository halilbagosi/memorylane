# MemoryLane — Security Implementation Summary

This document describes **what we implemented**, **why**, and **how** patient-name encryption and caregiver media encryption work in this codebase. It is written for review (e.g. bachelor thesis or peer audit).

---

## 1. Goals

### Patient names (`Patient.name`, `Patient.surname`)

- Protect sensitive identifiers **at rest** in PostgreSQL (encryption at application layer).
- Avoid breaking existing data when `ENCRYPTION_KEY` changes during development or rotation.
- **Automatically migrate** rows decrypted with an older key so they are re-written using the **current** primary key.

### Photos / memory media (quiz & Relive tab inputs)

- Store caregiver-uploaded media **encrypted at rest**, using **per-file keys** (envelope encryption).
- Avoid exposing **guessable links** or **plaintext blobs** in the database or URLs.
- Use **short-lived signed URLs** for upload/download instead of long-lived public object URLs.
- Ensure **authorization**: only caregivers linked to the patient can upload or request access.

---

## 2. Patient name encryption (existing pattern, extended)

### Algorithm and format

- **Algorithm:** AES-256-CBC (historical choice in this project).
- **Key derivation:** SHA-256 hash of the configured passphrase → exactly 32 bytes for AES-256.
- **Storage format:** `iv_hex:ciphertext_hex` on each column (`name`, `surname`).
- **Implementation:** [`backend/server/src/patient/encryption.util.ts`](../backend/server/src/patient/encryption.util.ts).

### Why CBC here

The schema predates this document; CBC was kept so existing ciphertext remains readable. New components (media payload) use **AES-256-GCM** for authenticated encryption (see §3).

### Primary vs legacy keys

We extended decryption so multiple keys can be tried **in order**:

1. Current **`ENCRYPTION_KEY`** (primary — used for all **new** `encrypt()` calls).
2. Optional **`ENCRYPTION_KEY_LEGACY_PIPE`**: multiple secrets separated by `|||`.
3. Optional **`ENCRYPTION_KEY_LEGACY_1`** … **`ENCRYPTION_KEY_LEGACY_12`**.

Duplicate derived keys are deduplicated.

**Why:** If developers rotated `ENCRYPTION_KEY` without re-encrypting all rows, old ciphertext could only be decrypted with the **old** key. Listing legacy keys lets the server decrypt old rows once, then migrate.

### Re-encrypt on read (lazy migration)

Function: **`decryptPatientNamesWithOptionalReencrypt(prisma, { id, name, surname })`**.

Steps:

1. Run **`decryptWithMeta`** on `name` and `surname` (try full key chain).
2. Return plaintext for API responses (or `"Decryption Error"` if both fields fail — unchanged fallback UX).
3. If **both** decrypted successfully **and** either field used a **non-primary** key (`keyIndex !== 0`), **`patient.update`** rewrites both columns with **`encrypt(plaintext)`** using the **current** primary key.

**Why:** Migrates data gradually without a one-shot offline migration script; every relevant API path that surfaces names triggers correction.

### Where migration runs

Anywhere patient names are decrypted for responses or notifications with DB access, including:

- [`dashboard.service.ts`](../backend/server/src/patient/dashboard/dashboard.service.ts) — caregiver overview / patient list.
- [`patient.service.ts`](../backend/server/src/patient/patient.service.ts) — join flows, notifications, etc.
- [`management.service.ts`](../backend/server/src/patient/management/management.service.ts) — delete/delegation messaging.
- [`auth.service.ts`](../backend/server/src/auth/auth.service.ts) — delegation / role requests / deletion flows.

Private helpers **`decryptPatientRow`** / **`patientFullDisplayName`** centralize async decryption + migration in auth.

---

## 3. Encrypted media upload (“Option 2” architecture)

### Threat model (course scope)

- Mitigate impact of **database leak** (metadata visible; ciphertext and keys structured to limit blast radius).
- Mitigate **bucket/disk exposure** (files not plaintext).
- Mitigate **direct URL guessing** (signed, short-lived tokens).

We **do not** claim full unlinkability if an attacker has **both** DB and storage plus server secrets — that would require stronger models (e.g. client-side E2EE).

### High-level flow

1. **Caregiver** calls **`POST /media/upload-intent`** with JWT — payload includes `patientId`, `kind` (`PHOTO` | `AUDIO`), `contentType`, `byteSize`.
2. Server verifies **PatientCaregiver** membership, validates MIME and size caps, creates a **`Media`** row with **`PENDING_UPLOAD`**, generates:
   - **`publicId`** — opaque UUID for external APIs.
   - **`storageKey`** — random hierarchical path (non-identifying).
   - **Random DEK** (data encryption key) per file.
   - **Wrapped DEK** — DEK encrypted with **`MEDIA_MASTER_KEY`** using AES-256-GCM (key wrapping).
   - **Payload IV** for AES-256-GCM file encryption.
3. Response includes a **signed PUT URL** (`PUT /media/storage/upload/:token`) plus headers; token is HMAC-bound and expires (TTL via env).
4. Client **PUT**s **raw plaintext bytes** of the file to that URL.
5. Server middleware parses body as **raw buffer**, encrypts payload with DEK + GCM, writes **ciphertext** to storage.
6. Client calls **`POST /media/:publicId/complete`**; server checks object exists, sets status **`READY`**.
7. Viewing uses **`GET /media/:publicId/access-url`** → short-lived signed **`GET /media/storage/download/:token`** → server decrypts stream.

### Crypto building blocks

| Component | Role |
|-----------|------|
| [`KeyWrapService`](../backend/server/src/media/crypto/key-wrap.service.ts) | Generates DEKs; wraps/unwraps DEKs with master key (AES-256-GCM). |
| [`MediaCryptoService`](../backend/server/src/media/crypto/media-crypto.service.ts) | Encrypts/decrypts **file bytes** at rest with DEK + GCM. |
| [`SignedUrlService`](../backend/server/src/media/crypto/signed-url.service.ts) | HMAC-signed tokens (`put` / `get`), expiry, constant-time verify. |
| [`LocalStorageService`](../backend/server/src/media/storage/local-storage.service.ts) | Default driver: ciphertext files under configurable directory (path traversal guarded). |

**Why envelope encryption:** If `MEDIA_MASTER_KEY` is rotated or compartmentalized later, per-file DEKs limit how much historical plaintext depends on one key.

### Database (`Media` model)

Migration adds enums **`MediaKind`**, **`MediaStatus`**, and columns such as **`public_id`**, **`storage_key`**, envelope fields, **`content_type`**, **`byte_size`**, removes legacy **`image_url`** / **`audio_url`** from the migration path. Quiz-only columns (`correct_name`, decoys, etc.) remain **nullable** for future quiz generation.

See [`backend/server/prisma/schema.prisma`](../backend/server/prisma/schema.prisma) and migration folder.

### API privacy

Responses avoid leaking internal IDs or crypto material where practical; caregivers interact by **`publicId`**. Signed URLs carry only token + operation — no patient/caregiver identifiers in the URL path beyond what’s needed for routing.

### SQL injection posture

All media queries use **Prisma** typed APIs; no raw concatenated SQL was added for these features.

---

## 4. Frontend changes

### API client

- [`frontend/src/services/media.ts`](../frontend/src/services/media.ts) — `uploadPatientMedia` (intent → PUT → complete), list, delete, access URL helpers using bearer token from secure storage.

### UX

- [`frontend/app/patient-media.tsx`](../frontend/app/patient-media.tsx) — “Memory Library” for a patient: grid, lazy signed thumbnail URLs, add photo, delete on long-press.
- [`frontend/app/(caregiver-tabs)/patients.tsx`](../frontend/app/(caregiver-tabs)/patients.tsx) — navigation entry from patient detail sheet.
- [`frontend/app/_layout.tsx`](../frontend/app/_layout.tsx) — registers the `patient-media` screen.

### Important distinction

- **Patient profile photos** (avatars) may still be sent as base64 in JSON elsewhere — **not** the same pipeline as encrypted memory media.

---

## 5. Configuration reference

### Patient names

| Variable | Purpose |
|----------|---------|
| `ENCRYPTION_KEY` | Primary key for **new** encrypts and first decryption attempt. |
| `ENCRYPTION_KEY_LEGACY_PIPE` | Additional secrets, separated by `\|\|\|`. |
| `ENCRYPTION_KEY_LEGACY_1` … `12` | Ordered fallback secrets. |

### Media pipeline

| Variable | Purpose |
|----------|---------|
| `MEDIA_MASTER_KEY` | Wraps per-file DEKs (required in production). |
| `MEDIA_SIGNED_URL_SECRET` / `JWT_SECRET` | HMAC for signed URLs. |
| `MEDIA_STORAGE_LOCAL_PATH` | Local ciphertext root (optional). |
| `MEDIA_SIGNED_URL_TTL_SECONDS` | URL lifetime (capped server-side). |
| `MEDIA_MAX_BYTES_IMAGE` / `MEDIA_MAX_BYTES_AUDIO` | Size limits. |
| `PUBLIC_API_BASE_URL` | Optional; bases signed URLs when reverse proxies affect Host. |

See [`backend/server/.env.example`](../backend/server/.env.example).

---

## 6. Documentation and README updates

- Root [`README.md`](../README.md) and [`backend/server/README.md`](../backend/server/README.md) include rationale for **Option 2** (balanced academic-grade design): object storage + envelope encryption + pseudonymous IDs vs simpler single-key or full E2EE.

---

## 7. Testing

Backend tests cover:

- Key wrap round-trip and tampering (`key-wrap.service.spec.ts`).
- Media crypto round-trip (`media-crypto.service.spec.ts`).
- Signed URL validity / expiry / tampering (`signed-url.service.spec.ts`).
- Media service authorization and migration-style flows (`media.service.spec.ts`).
- Patient encryption legacy decrypt (`encryption.util.spec.ts`).
- Existing patient/management tests remain green.

Run: `cd backend/server && npm test`.

---

## 8. Operational notes

1. **Rotate `ENCRYPTION_KEY` safely:** add the **previous** value as `ENCRYPTION_KEY_LEGACY_1` before deploying the new primary; let traffic migrate rows; then remove legacy after verification.
2. **Never commit real `.env` secrets** — use `.env.example` as a template only.
3. **Local vs device:** Expo must use `http://…` base URL including **`http://`** and correct host/port; physical devices need the machine LAN IP, not `localhost`.

---

## 9. File index (main touchpoints)

| Area | Paths |
|------|--------|
| Patient crypto | `backend/server/src/patient/encryption.util.ts` |
| Media module | `backend/server/src/media/*` |
| App wiring | `backend/server/src/app.module.ts` |
| Schema | `backend/server/prisma/schema.prisma`, `prisma/migrations/` |
| Frontend media UI | `frontend/app/patient-media.tsx`, `frontend/src/services/media.ts` |

This file is the consolidated narrative for **encryption-related** work; feature-specific README sections remain the high-level product overview.
