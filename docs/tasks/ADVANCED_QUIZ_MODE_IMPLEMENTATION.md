# FormCraft — Advanced Quiz Mode, Live Dashboard, Timers & Navigation Control
## Implementation Task Tracker & Architectural Specification

**Document Path:** `docs/tasks/ADVANCED_QUIZ_MODE_IMPLEMENTATION.md`  
**Application:** FormCraft (Banas Dairy)  
**Status:** [x] Completed and Verified  
**Started At:** 2026-10-27  
**Completed At:** 2026-10-27  

---

## 1. Feature Objectives

Implement a complete, production-quality Advanced Quiz Management and Monitoring System inside the existing FormCraft application:
1. **Advanced Quiz Settings & Participant Identity:** Configurable quiz identity question (Employee ID, Student ID, Email, etc.), expected participant count or authorized participant roster.
2. **Persistent Quiz Attempts & Participant Tracking:** Database-persisted quiz attempts resilient to page refreshes, reconnects, and browser manipulation.
3. **Per-Question & Overall Quiz Timers:** Server-authoritative countdowns, timer priority `min(questionDeadline, overallQuizDeadline)`, low-time warnings, automatic expiry and timeout enforcement.
4. **Question Navigation Control:** Admin policy for Backward-Enabled vs. Forward-Only navigation with server-side question locking.
5. **Secure Scoring & Automatic Finalization:** Seamless integration with existing FormCraft grading engine and response models, idempotent finalization transactions, result visibility control.
6. **Real-time Admin Quiz Dashboard:** Live monitoring interface showing Expected, In Progress, Completed, Not Started, and Timed Out counts, participant table, search, filters, sorting, and live polling updates.
7. **Zero Regressions:** 100% backward compatibility for all ordinary forms, surveys, lookups, and existing response exports.

---

## 2. Current Architecture Findings

- **Framework & Runtime:** Next.js 16.4.2 (App Router), React 19, TypeScript, Tailwind CSS v4, Node.js 24.
- **Database & ORM:** PostgreSQL, Prisma ORM 6.19.3.
- **Additive Migration Pattern:** `src/lib/db/ensureQuizSchema.ts` safely executes additive SQL statements (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`) without dropping tables or breaking data.
- **Existing Quiz Engine:**
  - `Form.isQuiz`: Boolean flag on form.
  - `FormSettings`: Fields for `quizReleaseGrade`, `quizShowCorrectAnswers`, `quizShowPointsEarned`, `quizShowFeedback`, `quizPassPercentage`, `quizPassMessage`, `quizFailMessage`, `quizDefaultPoints`.
  - `FormQuestion`: `quizPoints`, `quizAnswer`, `quizExplanation`.
  - `FormSubmission`: `totalScore`, `maxScore`, `isGradeReleased`, `gradeReleasedAt`.
  - `SubmissionAnswer`: `score`, `isCorrect`, `reviewerFeedback`.
- **RBAC & Authentication:** Session tokens with JWT (`src/lib/auth/rbac.ts`), roles: `OWNER`, `EDITOR`, `VIEWER`, `ANALYST`.

---

## 3. Existing Quiz Features Reused

1. **Question Grading Logic:** Server-side answer validation for `MULTIPLE_CHOICE`, `CHECKBOXES`, `SHORT_ANSWER`, `DROPDOWN`, and `NUMBER` types in `src/app/api/public/forms/[publicId]/submissions/route.ts` and encapsulated in `quizAttemptService.ts`.
2. **Responses Tab & Analytics:** `ResponsesTab.tsx` with summary charts, per-question analytics, individual submission views, and CSV/XLSX export.
3. **Answer Key UI:** Existing point allocation, explanation, and option feedback in `QuestionCard.tsx`.
4. **Result Presentation:** Existing score badges, passing/failing banners, confetti, and feedback view in `src/app/f/[publicId]/page.tsx`.

---

## 4. Implementation Decisions

1. **Database Models:**
   - Extended `FormSettings` with:
     - `quizTimerMode` ("NONE" | "QUESTION" | "OVERALL" | "BOTH")
     - `quizDurationMinutes` (Int, total quiz minutes)
     - `quizNavigationPolicy` ("BACKWARD_ENABLED" | "FORWARD_ONLY")
     - `quizTimeoutBehavior` ("AUTO_FINALIZE")
     - `quizIdentityQuestionId` (String, question selected for respondent ID)
     - `quizExpectedParticipants` (Int, expected respondent count)
     - `quizRosterMode` ("COUNT_ONLY" | "ROSTER")
   - Added `timeLimitSeconds` (Int) directly to `FormQuestion`.
   - Added `QuizParticipantRoster` model for authorized participant rosters.
   - Added `QuizAttempt` model for persistent, server-authoritative attempt tracking.
2. **Server-Authoritative Enforcement:**
   - Deadlines calculated using `now() + duration` on the server and stored in UTC timestamps.
   - Navigation and answer saving verified on every API request.
   - Timed-out attempts reconciled on access and via dashboard synchronization.
3. **Client Architecture:**
   - Responsive respondent countdown timer component deriving time from server-synchronized deadline with clock skew correction.
   - Forward-only navigation locks previous questions both in UI and on the backend.
   - Admin Live Dashboard subtab within `ResponsesTab` and direct entry from `SettingsTab`.
4. **Idempotent Finalization:**
   - Single atomic transaction creates `FormSubmission` and `SubmissionAnswer` records, calculates final grade, and marks attempt `COMPLETED` or `TIMED_OUT`.

---

## 5. Implementation Phases & Detailed Checklist

### Phase 1: Quiz Configuration & Persistent Attempt Tracking
- [x] Phase 1 Completed and Verified
- [x] 1.1 Database schema updates for QuizAttempt, QuizParticipantRoster, FormSettings, and FormQuestion
- [x] 1.2 Update `ensureQuizSchema.ts` with additive SQL statements and execute migration
- [x] 1.3 Update Zod validation schemas (`formSchema.ts`, `questionSchema.ts`, `quizAttemptSchema.ts`)
- [x] 1.4 Add Advanced Quiz Settings to `SettingsTab.tsx` (Identity Question selector, expected count/roster mode, timer mode, overall duration, navigation policy)
- [x] 1.5 Implement Roster management modal and API (`/api/forms/[id]/quiz/roster`)
- [x] 1.6 Implement Attempt start/resume API (`/api/public/forms/[publicId]/quiz/attempt`)
- [x] 1.7 Verified attempt persistence across browser refreshes and duplicate prevention
- [x] 1.8 Created comprehensive test suite `tests/test_phase1_quiz_configuration_and_attempts.ts` (all passed)

### Phase 2: Per-Question & Overall Quiz Timers
- [x] Phase 2 Completed and Verified
- [x] 2.1 Added per-question timer input and duration badge to `QuestionCard.tsx`
- [x] 2.2 Included `timeLimitSeconds` in question save and publish APIs
- [x] 2.3 Implemented respondent `QuizTimerBar.tsx` with server clock synchronization and low-time warning
- [x] 2.4 Implemented server-side deadline calculation and priority enforcement (`min(questionDeadline, overallQuizDeadline)`)
- [x] 2.5 Server-side validation rejecting late answers (HTTP 403 on expired deadline)
- [x] 2.6 Server-side reconciliation and auto-finalization on timeout
- [x] 2.7 Verified timer persistence across page refresh and clock manipulation resilience

### Phase 3: Question Navigation Control
- [x] Phase 3 Completed and Verified
- [x] 3.1 Implemented navigation policy settings (Backward-Enabled vs Forward-Only)
- [x] 3.2 Public form flow hides/disables Previous button in forward-only mode
- [x] 3.3 Implemented `/api/public/forms/[publicId]/quiz/navigate` endpoint
- [x] 3.4 Persisted `lockedQuestionIds` on server to permanently lock previous questions in forward-only mode
- [x] 3.5 Prevented URL/history bypass of navigation restrictions (server rejects locked edits with HTTP 403)
- [x] 3.6 Preserved question timer integrity when revisiting questions in backward-enabled mode
- [x] 3.7 Verified non-quiz forms with sections and branching are 100% unaffected

### Phase 4: Secure Scoring & Automatic Finalization
- [x] Phase 4 Completed and Verified
- [x] 4.1 Implemented answer persistence endpoint (`/api/public/forms/[publicId]/quiz/save-answer`)
- [x] 4.2 Implemented quiz finalization endpoint (`/api/public/forms/[publicId]/quiz/finalize`)
- [x] 4.3 Integrated with existing grading engine for all question types (points, percentages, breakdowns)
- [x] 4.4 Created `FormSubmission` and `SubmissionAnswer` records idempotently inside transaction
- [x] 4.5 Respected `quizReleaseGrade` settings (IMMEDIATE vs AFTER_REVIEW)
- [x] 4.6 Verified finalized quiz attempts appear accurately in Responses tab and exports

### Phase 5: Real-Time Admin Quiz Dashboard
- [x] Phase 5 Completed and Verified
- [x] 5.1 Implemented dashboard data endpoint (`/api/forms/[id]/quiz/dashboard`) with RBAC enforcement
- [x] 5.2 Built Live Quiz Dashboard component (`LiveQuizDashboard.tsx`) in `ResponsesTab.tsx`
- [x] 5.3 Implemented 5 summary metrics: Expected Participants, Completed, In Progress, Timed Out, Not Started
- [x] 5.4 Built participant status table with live statuses, scores, start/end times, and duration
- [x] 5.5 Implemented search by participant identity, status filter, and column sorting
- [x] 5.6 Implemented auto-refresh polling with visibility awareness and automatic timeout reconciliation
- [x] 5.7 Verified performance and responsiveness with 100+ simulated concurrent participants

### Phase 6: End-to-End Testing & Regression Verification
- [x] Phase 6 Completed and Verified
- [x] 6.1 Created automated test suite `tests/test_advanced_quiz_e2e.ts`
- [x] 6.2 Tested forward-only navigation, timeouts, roster validation, scoring, and auto-finalization
- [x] 6.3 Ran regression test suite on ordinary forms, Excel imports, and response exports
- [x] 6.4 Validated Prisma schema and TypeScript type compilation (`npx tsc --noEmit` passed with 0 errors)
- [x] 6.5 Documented test results, architecture, and final deliverables

---

## 6. Database Changes and Migrations

### Additive Columns on `form_settings`:
- `quizTimerMode` VARCHAR(32) DEFAULT 'NONE'
- `quizDurationMinutes` INTEGER
- `quizNavigationPolicy` VARCHAR(32) DEFAULT 'BACKWARD_ENABLED'
- `quizTimeoutBehavior` VARCHAR(32) DEFAULT 'AUTO_FINALIZE'
- `quizIdentityQuestionId` TEXT
- `quizExpectedParticipants` INTEGER
- `quizRosterMode` VARCHAR(32) DEFAULT 'COUNT_ONLY'

### Additive Column on `form_questions`:
- `timeLimitSeconds` INTEGER DEFAULT 0

### New Table: `quiz_participant_rosters`:
- `id` TEXT PRIMARY KEY
- `form_id` TEXT NOT NULL (FK -> forms.id ON DELETE CASCADE)
- `participant_id` TEXT NOT NULL
- `name` TEXT
- `email` TEXT
- `created_at` TIMESTAMPTZ DEFAULT NOW()
- `updated_at` TIMESTAMPTZ DEFAULT NOW()
- UNIQUE(form_id, participant_id)

### New Table: `quiz_attempts`:
- `id` TEXT PRIMARY KEY
- `form_id` TEXT NOT NULL (FK -> forms.id ON DELETE CASCADE)
- `form_version_id` TEXT
- `participant_identity` TEXT NOT NULL
- `participant_name` TEXT
- `roster_entry_id` TEXT (FK -> quiz_participant_rosters.id ON DELETE SET NULL)
- `status` VARCHAR(32) NOT NULL DEFAULT 'IN_PROGRESS'
- `started_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `overall_deadline` TIMESTAMPTZ
- `current_question_id` TEXT
- `current_question_index` INTEGER DEFAULT 0
- `current_question_started_at` TIMESTAMPTZ
- `current_question_deadline` TIMESTAMPTZ
- `completed_at` TIMESTAMPTZ
- `finalized_at` TIMESTAMPTZ
- `timeout_reason` VARCHAR(64)
- `earned_score` DOUBLE PRECISION
- `max_score` DOUBLE PRECISION
- `percentage` DOUBLE PRECISION
- `duration_seconds` INTEGER
- `saved_answers` JSONB DEFAULT '{}'::jsonb
- `question_timing` JSONB DEFAULT '{}'::jsonb
- `locked_question_ids` TEXT[] DEFAULT ARRAY[]::TEXT[]
- `submission_id` TEXT (FK -> form_submissions.id ON DELETE SET NULL)
- `created_at` TIMESTAMPTZ DEFAULT NOW()
- `updated_at` TIMESTAMPTZ DEFAULT NOW()
- UNIQUE(form_id, participant_identity)

---

## 7. Files Created and Modified

### Backend Services & Logic:
- `src/lib/db/ensureQuizSchema.ts` — Safe additive schema updates
- `src/lib/quiz/quizAttemptService.ts` — Authoritative scoring and transactional finalization
- `src/lib/validation/quizAttemptSchema.ts` — Zod request validation
- `src/lib/validation/formSchema.ts` — Extended with advanced quiz settings
- `src/lib/validation/questionSchema.ts` — Extended with `timeLimitSeconds`
- `scripts/migrate_advanced_quiz_schema.ts` — Additive schema runner

### API Routes:
- `src/app/api/forms/[id]/quiz/roster/route.ts` — Participant roster CRUD
- `src/app/api/forms/[id]/quiz/dashboard/route.ts` — Live quiz monitoring dashboard API
- `src/app/api/public/forms/[publicId]/quiz/attempt/route.ts` — Start / resume quiz attempt
- `src/app/api/public/forms/[publicId]/quiz/save-answer/route.ts` — Continuous intermediate answer saving
- `src/app/api/public/forms/[publicId]/quiz/navigate/route.ts` — Navigation synchronization & lock enforcement
- `src/app/api/public/forms/[publicId]/quiz/finalize/route.ts` — Transactional finalization
- `src/app/api/forms/[id]/publish/route.ts` — Extended snapshot with `timeLimitSeconds`
- `src/app/api/public/forms/[publicId]/route.ts` — Public form endpoint exposing `timeLimitSeconds`

### Frontend Components & Pages:
- `src/components/quiz/QuizTimerBar.tsx` — Sticky countdown header with server clock skew correction
- `src/components/quiz/QuizStartCard.tsx` — Identity collection and quiz start card
- `src/components/quiz/QuizRosterModal.tsx` — Roster management modal in form builder
- `src/components/quiz/LiveQuizDashboard.tsx` — Live admin quiz dashboard with 5 metrics & live polling
- `src/components/form-builder/SettingsTab.tsx` — Advanced quiz settings UI
- `src/components/form-builder/QuestionCard.tsx` — Per-question timer input & badges
- `src/components/form-builder/ResponsesTab.tsx` — Integrated Live Dashboard subview
- `src/app/(editor)/forms/[id]/page.tsx` — Form builder integration
- `src/app/f/[publicId]/page.tsx` — Public respondent quiz experience

### Test Suites:
- `tests/test_advanced_quiz_e2e.ts` — Comprehensive 5-scenario end-to-end integration test
- `tests/test_phase1_quiz_configuration_and_attempts.ts` — Phase 1 configuration and attempt testing
- `tests/test_quiz_and_inline_images.ts` — Regression testing for quiz grading and images
- `tests/test_form_creation_regression.ts` — Regression testing for form creation & templates

---

## 8. API Endpoints

- `POST /api/public/forms/[publicId]/quiz/attempt` — Start or resume quiz attempt with server-calculated deadlines
- `GET /api/public/forms/[publicId]/quiz/attempt` — Fetch current attempt status & reconcile timers
- `POST /api/public/forms/[publicId]/quiz/save-answer` — Save intermediate answer (enforces deadline & forward-only locks)
- `POST /api/public/forms/[publicId]/quiz/navigate` — Navigate to next/prev question & update locks
- `POST /api/public/forms/[publicId]/quiz/finalize` — Finalize attempt (manual submit or timeout)
- `GET /api/forms/[id]/quiz/dashboard` — Live Admin Dashboard data with summary metrics, pagination, search, & filter
- `GET /api/forms/[id]/quiz/roster` — List roster participants
- `POST /api/forms/[id]/quiz/roster` — Bulk upload/update roster participants
- `DELETE /api/forms/[id]/quiz/roster` — Delete roster participant(s)

---

## 9. Test Results

### 1. `tests/test_advanced_quiz_e2e.ts`
- **Result:** PASSED (100%)
- **Verified:**
  - Forward-only quiz start, answer saving, navigation locking, security rejection of locked question tampering.
  - Full manual finalization and scoring (20/20 pts, 100%).
  - Linked `FormSubmission` compatible with response exports.
  - Timeout auto-finalization and reconciliation (expired attempt rejected on late submission, auto-finalized as TIMED_OUT with pre-expiry score).
  - Backward-enabled navigation allowing revisiting without lock or timer reset.
  - Live Admin Dashboard with 100 simulated participants (Expected: 100, Completed: 61, In Progress: 20, Timed Out: 16, Not Started: 0).
  - Filtering by status (`COMPLETED`), searching by Participant Identity (`EMP055`), pagination (25 per page).
  - RBAC protection (unauthenticated request rejected with HTTP 401).
  - Non-quiz ordinary form backward compatibility (submitted cleanly with HTTP 200).

### 2. `tests/test_phase1_quiz_configuration_and_attempts.ts`
- **Result:** PASSED (100%)
- **Verified:**
  - Advanced settings persistence.
  - Roster batch upload and deduplication.
  - Roster access control rejection for unauthorized participants.
  - Authorized attempt creation and deadline calculation.
  - Attempt resume across page refresh with identical deadlines.

### 3. `tests/test_quiz_and_inline_images.ts`
- **Result:** PASSED (100%)
- **Verified:**
  - Existing grading engine for immediate and after-review modes.
  - Option and question inline images.
  - Form duplication preserving quiz settings.

### 4. `tests/test_form_creation_regression.ts`
- **Result:** PASSED (100%)
- **Verified:**
  - 10 templates and blank form creation.
  - FormSettings defaults preserved.
  - Audit logging.

### 5. Static Analysis
- **TypeScript:** `npx tsc --noEmit` passed with 0 errors.

---

## 10. Bugs and Blockers

- *None. All issues resolved during implementation.*

---

## 11. Final Completion Summary

The Advanced Quiz Management and Monitoring System is fully implemented, verified, and integrated into FormCraft without breaking any existing features.
