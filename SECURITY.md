# FormCraft — Security Architecture & Threat Model

This document outlines the security controls, validation mechanisms, and defense-in-depth principles implemented across FormCraft.

---

## 1. Authentication & Session Security

- **Password Hashing**: Passwords are cryptographically hashed using `bcrypt` with 12 salt rounds. Plaintext passwords are never logged, stored, or transmitted back to clients.
- **Session Handling**: Authentication sessions are maintained via `HttpOnly`, `SameSite=Lax`, and `Secure` (in production) cookies, completely protecting tokens from malicious client-side JavaScript / XSS access.
- **Session Verification**: Every protected route handler verifies session tokens against the database and checks user state on each request.

---

## 2. Authorization & IDOR / BOLA Prevention

- **Server-Side Role Checks**: All mutations check permissions on the server via `src/lib/auth/rbac.ts`:
  - **Owner**: Full administrative control, deletion, collaborator management.
  - **Editor**: Modifies questions, themes, settings, and can publish.
  - **Viewer**: Read-only access to form editor configuration.
  - **Response Analyst**: Can view analytics and export response data, but cannot alter questions.
- **Resource Scoping**: Form queries strictly enforce `where: { ownerId: user.id }` or check membership in `FormCollaborator`. Users cannot view or mutate forms belonging to other users simply by guessing a cuid ID.

---

## 3. Public Form Security & Information Leakage Defense

- **Secret Answer Stripping**: When respondents fetch `/api/public/forms/[publicId]`, the server explicitly strips `quizAnswer` keys from questions. Respondents cannot inspect browser DevTools network payloads to locate the correct answers.
- **Server-Side Auto-Grading**: Grading calculations execute strictly on the server against the canonical answer keys stored in PostgreSQL.
- **Unpublished Form Masking**: Unpublished forms in `DRAFT` status return a generic `404 Not Found` to public requests, preventing unpublished leakages.

---

## 4. Input Validation & Injection Defenses

- **Strict Zod DTO Validation**: Every external input (registration, question creation, reordering, options, settings) is parsed and validated against strict Zod schemas before database execution.
- **SQL Injection Prevention**: All database queries are executed via Prisma ORM utilizing parameterized SQL statements.
- **Spreadsheet Formula Injection Defense (CWE-1236)**:
  - Exported cells starting with formula trigger symbols (`=`, `+`, `-`, `@`, `\t`, `\r`) are automatically escaped with a leading single quote (`'`) in `src/lib/utils.ts`.
  - Prevents malicious formulas from executing when exported spreadsheets are opened in Microsoft Excel or Google Sheets.

---

## 5. File Upload Security

- **MIME Allowlist**: Uploads are restricted to an explicit set of safe MIME types (`image/jpeg`, `image/png`, `application/pdf`, `text/plain`, etc.). Executable extensions (`.exe`, `.sh`, `.bat`, `.js`, `.html`) are rejected.
- **Randomized File Keys**: Stored file paths are constructed with high-entropy cryptographic hex strings, preventing path traversal attacks (`../`) and unguessable object discovery.
- **Size Limits**: Strict 25MB ceiling enforced on the server before disk writes.

---

## 6. Duplicate Submission Protection & Idempotency

- **Idempotency Keys**: Public submissions support client-provided idempotency keys to safely handle network retries without recording duplicate responses.
- **One-Response Restriction**: When enabled in form settings, authenticated users are blocked from submitting more than once per form.
- **Client IP Hashing**: Anonymous respondent submissions store a truncated SHA-256 hash of the client IP to support best-effort rate limiting and duplicate prevention.
