# MemoryLane — Alzheimer’s/Dementia Severity Level Implementation

This document summarizes the implementation of the **Severity Level** feature for patient profiles. This allows caregivers to specify the stage of memory condition when first creating a patient, which can be used to tailor the application experience.

---

## 1. Objective
Enable caregivers to record the **Alzheimer’s/Dementia Severity Level** (Mild, Moderate, or Severe) during the initial patient creation process. This data helps in categorizing patients and provides a foundation for future adaptive features.

---

## 2. Implementation Details

### 🗄️ Database (Prisma)
- **Enum Creation**: Added a `DementiaLevel` enum in `schema.prisma` with values: `MILD`, `MODERATE`, `SEVERE`.
- **Schema Update**: Added an optional `dementiaLevel` field to the `Patient` model.
- **Migration**: Generated a SQL migration (`20260508160000_add_dementia_level_to_patient`) that creates the Postgres type and adds the column to the `patients` table.

### ⚙️ Backend (NestJS)
- **DTO Update**: Modified `CreatePatientDto` to include an optional `dementiaLevel` field, validated using `class-validator`'s `@IsEnum`.
- **Service Layer**: Updated `PatientService.create()` to map the `dementiaLevel` from the incoming request to the database record.

### 📱 Frontend (React Native)
- **State Management**: Added `dementiaLevel` state to the `AddPatientScreen`.
- **UI Components**:
    - Implemented a **Segmented Chip Selector** using `TouchableOpacity`.
    - Integrated with the existing theme (`colors.ts`, `typography.ts`).
    - Added visual feedback for the selected level using the `secondary` color.
- **API Integration**: Updated the `handleSubmit` function to include the selected severity level in the `POST /patients` request.

---

## 3. Design Decisions
- **Optional Field**: The severity level is optional. If a caregiver is unsure, they can skip the selection, leaving the field as `null` in the database.
- **Toggle Behavior**: Tapping a selected chip deselects it, allowing users to easily revert their choice before submission.
- **Consistent Styling**: The selector follows the Material 3 / Soft-UI aesthetic used throughout the app, including adaptive borders for iOS and Android.

---

## 4. How to Apply Changes
1. **Sync Database**: Run `npx prisma migrate dev` in the `backend/server` directory to apply the new column.
2. **Refresh Client**: Run `npx prisma generate` to update the TypeScript types.
3. **Frontend**: Ensure the API base URL in `.env.local` is correct for your testing environment.

---

## 5. File Impact
- `backend/server/prisma/schema.prisma`
- `backend/server/prisma/migrations/20260508160000_add_dementia_level_to_patient/migration.sql`
- `backend/server/src/patient/dto/create-patient.dto.ts`
- `backend/server/src/patient/patient.service.ts`
- `frontend/app/add-patient.tsx`
