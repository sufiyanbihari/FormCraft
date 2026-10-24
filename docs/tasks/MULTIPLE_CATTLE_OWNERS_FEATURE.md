# Feature Task Tracker: Multiple Cattle Owners in FormCraft Survey

**Project:** FormCraft
**Task:** Add Multiple Cattle Owners to the Existing FormCraft Survey
**Baseline Checkpoint Date:** 2026-10-23
**Status:** Completed

---

## 1. Feature Overview & Objectives

Enable a surveyor during a single village visit to:
1. Enter the Society Code once (auto-filling Society Name, Taluka, District from `society_data.xlsx`).
2. Enter Surveyor details once (Surveyor Name and 10-digit mobile number).
3. Record multiple cattle owners in the same survey visit using repeatable Cattle Owner sections:
   - Cattle Owner Full Name
   - Owner Mobile Number (10 digits)
   - Total Large Cattle Count (Over 1 Year Age)
   - Total Small Cattle Count
   - Flooring Type (Concrete / Mud)
   - Supply Dung? (Yes / No)
4. Add additional owners with **“+ Add Another Cattle Owner”** and remove owners with a Remove button (minimum 1 owner).
5. Validate all entries independently with inline field-level errors.
6. Submit all owners atomically in one logical parent `FormSubmission` transaction.
7. Support multi-owner response display in the admin response viewer and multi-row Excel/CSV export (one row per cattle owner, repeating shared society and surveyor info).
8. Ensure 100% backward compatibility with existing single-owner submissions and unrelated forms.

---

## 2. Architecture & Data Model Decisions

1. **Prisma Schema & Database**:
   - Model `CattleOwnerEntry` linked to `FormSubmission` with cascade delete.
   - Fields:
     - `id`: CUID primary key
     - `submissionId`: Foreign key to `FormSubmission(id)`
     - `orderIndex`: Integer (0-based order)
     - `ownerName`: String
     - `ownerMobile`: String
     - `largeCattleCount`: Integer
     - `smallCattleCount`: Integer
     - `flooringType`: String
     - `supplyDung`: String
     - `createdAt`, `updatedAt`
   - Indexes: `[submissionId, orderIndex]`.
   - Reverse relation on `FormSubmission`: `cattleOwners CattleOwnerEntry[]`.
   - Non-destructive additive migration via `npx prisma db push`.
   - Backward compatibility: First owner's answers also saved into standard `SubmissionAnswer` rows so standard question queries and existing integrations remain untouched.

2. **Public Submission API (`/api/public/forms/[publicId]/submissions`)**:
   - Schema `cattleOwnerEntrySchema`: Validates each owner entry.
   - Validates Society details (with existing lookup verification).
   - Validates Surveyor Name & Mobile.
   - Validates all `cattleOwners` entries (min 1).
   - In a single Prisma `$transaction`:
     - Creates `FormSubmission`.
     - Creates `CattleOwnerEntry` for each owner.
     - Creates `SubmissionAnswer` for shared fields and Owner 1 for legacy compatibility.
   - Idempotency & duplicate check preserved.

3. **Public Form Frontend (`src/app/f/[publicId]/page.tsx`)**:
   - For Cattle Survey form (`isCattleSurvey`):
     - Keeps existing society auto-fill intact via `answers[societyCodeQ.id]`.
     - Keeps surveyor details intact via `answers[surveyorNameQ.id]` & `answers[surveyorMobileQ.id]`.
     - Uses separate typed state `cattleOwners: CattleOwner[]` initialized with 1 owner.
     - Each owner entry has a unique stable ID (`id: crypto.randomUUID()`).
     - "+ Add Another Cattle Owner" appends a new blank entry without modifying existing answers.
     - "Remove" button appears on entries when `cattleOwners.length > 1`.
     - Displays headings: `Cattle Owner 1`, `Cattle Owner 2`, `Cattle Owner 3`...
     - Independent field validation with inline error messages.

4. **Response Viewer & Export (`src/app/api/forms/[id]/responses/export/route.ts` & `ResponsesTab.tsx`)**:
   - Excel & CSV export: When a submission has `cattleOwners`, generates **one row per cattle owner**, repeating shared society and surveyor details.
   - Unrelated forms and historical single-owner submissions export standard single rows without changes.
   - Admin Response Viewer displays all owners for each survey.

---

## 3. Checklist

- [x] Inspect existing files and create checkpoint (Completed).
- [x] Update `prisma/schema.prisma` with `CattleOwnerEntry` and apply migration (`npx prisma db push`).
- [x] Update `src/lib/validation/submissionSchema.ts` with `cattleOwnerEntrySchema`.
- [x] Update `src/app/api/public/forms/[publicId]/submissions/route.ts` to process and store `cattleOwners` transactionally.
- [x] Update `src/app/f/[publicId]/page.tsx` with repeatable cattle owner UI, validation, and payload submission.
- [x] Update `src/app/api/forms/[id]/responses/export/route.ts` for multi-row cattle owner exports.
- [x] Update `src/components/form-builder/ResponsesTab.tsx` to display all cattle owners in individual response view.
- [x] Verify TypeScript build (`npx tsc --noEmit`).
- [x] Run automated tests verifying single-owner, multi-owner, validation, lookup, and export.
- [x] Document results in completion report.

---

## 4. Verification Results

All automated tests passed:
1. **TypeScript Build**: `npx tsc --noEmit` executed with 0 errors.
2. **Society Code Auto-fill**: Verified Society Code `101` fetches `Model Cooperative Society 101`, `North Taluka`, and `Sample District` from `society_data.xlsx`.
3. **Surveyor Details**: Surveyor Name and 10-digit Mobile are entered once at the top level and shared across all cattle owner records.
4. **Repeatable Sections**: 1 owner rendered initially; "+ Add Another Cattle Owner" dynamically appends blank entries with stable IDs; Remove button enabled when count > 1; last remaining owner cannot be removed.
5. **Independent Validation**: Field-level validation enforces:
   - Cattle Owner Full Name (required)
   - Owner Mobile (exactly 10 digits)
   - Large & Small Cattle Counts (non-negative integer numbers)
   - Flooring Type (Concrete / Mud required separately for each owner)
   - Supply Dung (Yes / No required separately for each owner)
   Bad payloads rejected with 400 and specific error messages.
6. **Transactional Persistence**: Submission saves parent `FormSubmission` and all `CattleOwnerEntry` records atomically in a single Prisma `$transaction`.
7. **Legacy Compatibility**: Single-owner legacy submissions are accepted without error and populate 1 `CattleOwnerEntry`.
8. **Responses & Export**:
   - `GET /api/forms/[id]/responses`: Returns all associated `cattleOwners` per submission.
   - `GET /api/forms/[id]/responses/export?format=csv`: Exports 1 row per cattle owner, repeating shared society & surveyor columns.
   - Response Viewer UI: Displays a dedicated card for all registered cattle owners under individual responses.
