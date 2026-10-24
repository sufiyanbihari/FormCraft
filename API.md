# FormCraft — API Reference

This document provides documentation for all FormCraft RESTful API endpoints.

---

## 1. Authentication Endpoints

### `POST /api/auth/register`
Creates a new user account and sets an HttpOnly session cookie.
- **Request Body**:
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "Password123!"
  }
  ```
- **Responses**:
  - `200 OK`: Registration successful, returns user object.
  - `400 Bad Request`: Validation failure.
  - `409 Conflict`: Email already in use.

### `POST /api/auth/login`
Authenticates user with email and password.
- **Request Body**:
  ```json
  {
    "email": "admin@formcraft.app",
    "password": "Password123!"
  }
  ```
- **Responses**:
  - `200 OK`: Login successful, sets `formcraft_session` cookie.
  - `401 Unauthorized`: Invalid credentials.

### `POST /api/auth/logout`
Clears session cookie.
- **Response**: `200 OK`.

### `GET /api/auth/me`
Retrieves currently authenticated user.
- **Response**:
  ```json
  {
    "user": {
      "id": "cmvg...",
      "email": "admin@formcraft.app",
      "name": "Alex Admin",
      "role": "ADMIN",
      "avatarUrl": "..."
    }
  }
  ```

---

## 2. Forms Endpoints

### `GET /api/forms`
List forms accessible to user.
- **Query Parameters**:
  - `filter`: `all`, `owned`, `shared`, `published`, `draft`, `trash`
  - `search`: search substring in title/description
- **Response**: Array of form cards with response counts.

### `POST /api/forms`
Creates a new form (blank or from template).
- **Request Body**:
  ```json
  {
    "title": "Customer Feedback Survey",
    "templateId": "customer-feedback"
  }
  ```

### `GET /api/forms/:id`
Retrieves full form structure (sections, questions, options, theme, settings, user role).

### `PATCH /api/forms/:id`
Updates form metadata, theme, or settings.
- **Request Body**:
  ```json
  {
    "title": "Updated Title",
    "theme": {
      "primaryColor": "#059669"
    },
    "settings": {
      "isAcceptingResponses": true
    }
  }
  ```

### `DELETE /api/forms/:id`
Moves form to trash or permanently deletes if `?permanent=true`.

### `POST /api/forms/:id/publish`
Takes an immutable `FormVersion` snapshot and marks the form as `PUBLISHED`.
- **Response**:
  ```json
  {
    "message": "Form published successfully",
    "publicUrl": "/f/cuid..."
  }
  ```

### `POST /api/forms/:id/duplicate`
Creates an exact clone of the form and all its nested sections and questions.

---

## 3. Question & Section Endpoints

### `POST /api/forms/:id/questions`
Adds a question to a section.
- **Request Body**:
  ```json
  {
    "sectionId": "sec-123",
    "title": "How would you rate our service?",
    "type": "LINEAR_SCALE",
    "isRequired": true,
    "config": {
      "scaleMin": 1,
      "scaleMax": 5,
      "scaleMinLabel": "Poor",
      "scaleMaxLabel": "Excellent"
    }
  }
  ```

### `PATCH /api/forms/:id/questions/:questionId`
Updates question title, validation, options, branching rules, or quiz keys.

### `DELETE /api/forms/:id/questions/:questionId`
Deletes a question card.

### `POST /api/forms/:id/questions/reorder`
Batch updates order indices and section assignments for drag-and-drop:
```json
{
  "items": [
    { "id": "q1", "sectionId": "s1", "orderIndex": 0 },
    { "id": "q2", "sectionId": "s1", "orderIndex": 1 }
  ]
}
```

---

## 4. Responses & Analytics Endpoints

### `GET /api/forms/:id/responses`
Retrieves paginated list of submissions with respondent emails, dates, and scores.

### `GET /api/forms/:id/responses/analytics`
Returns computed aggregate metrics for Recharts visualizations:
- Submissions timeline by date (for AreaChart)
- Question selection distributions (count, percentage for Pie/Bar charts)
- Rating averages
- Quiz score distributions

### `GET /api/forms/:id/responses/export?format=csv|xlsx|json`
Streams or downloads exported responses with CSV formula injection protection.

---

## 5. Public Respondent Endpoints

### `GET /api/public/forms/:publicId`
Returns public published form schema. Automatically sanitizes and removes secret quiz answers.

### `POST /api/public/forms/:publicId/submissions`
Submits respondent answers. Performs server validation, enforces deadlines, auto-grades quizzes, and saves transactionally.
- **Request Body**:
  ```json
  {
    "respondentEmail": "respondent@example.com",
    "idempotencyKey": "uuid-...",
    "answers": [
      { "questionId": "q1", "value": "Option 1" },
      { "questionId": "q2", "value": 5 }
    ]
  }
  ```
- **Response**:
  ```json
  {
    "message": "Your response has been recorded.",
    "submissionId": "sub-123",
    "score": { "total": 10, "max": 10 }
  }
  ```
