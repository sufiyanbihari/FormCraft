# FormCraft — Full-Stack Google Forms Alternative

FormCraft is an enterprise-ready, open-source alternative to Google Forms built on Next.js 16 (App Router), TypeScript, Tailwind CSS, Prisma ORM, PostgreSQL, and Recharts. It replicates the core capabilities and fluid UX of Google Forms while providing enhanced customization, security, and developer control.

---

## Key Features

- **Intuitive Visual Form Builder**: Live WYSIWYG editor with drag-and-drop question reordering (`@dnd-kit`), section management, undo/redo history, and debounced auto-save.
- **15+ Supported Question Types**:
  - Short Answer, Paragraph, Multiple Choice, Checkboxes, Dropdown
  - Linear Scale (configurable min/max and custom labels)
  - Rating (Stars, Hearts, Numbers)
  - Multiple Choice Grid and Checkbox Grid
  - Date & Time
  - File Upload (MIME validation, size restrictions)
  - Number, Email, Phone, Website
  - Non-question content blocks: Section headers, Text blocks, Image cards, Video embeds
- **Multi-Section Forms & Conditional Branching**:
  - Split long surveys into logical multi-step sections
  - Jump to specific sections or submit based on respondent answers
  - Cycle detection and unreachable question protection
- **Theme & Appearance Customizer**:
  - Custom brand colors, background tints, fonts (Inter, Roboto, Playfair, Outfit), corner radiuses, and header banner images
  - Live preview with automatic contrast calculation
- **Form Settings & Availability Rules**:
  - Toggle response acceptance
  - Schedule response start dates and closing deadlines
  - Set maximum submission quotas
  - Restrict to 1 response per authenticated user
  - Enable/disable response editing via secure tokens
  - Presentation options: progress bar, question shuffling, custom confirmation message
- **Quiz Mode with Automatic Grading**:
  - Convert any form into an interactive quiz
  - Assign point values per question
  - Set correct answer keys and explanations
  - Automatic grading for multiple choice, checkboxes, and short answers
  - Instant respondent score display with celebratory confetti animation
- **Real-Time Analytics & Response Management**:
  - **Summary View**: Recharts AreaChart for submission timelines, PieCharts and BarCharts for question distributions, average score summaries
  - **Question View**: Group and filter responses by question
  - **Individual View**: Paginated browser through individual responses with full answer detail
  - **Exports**: One-click export to CSV (with formula injection defense and UTF-8 BOM), Excel (.xlsx), and JSON
- **Team Collaboration & Role-Based Access Control**:
  - Invite collaborators by email
  - Granular roles: **Owner**, **Editor**, **Viewer**, and **Response Analyst**
- **10 Pre-Built Production Templates**:
  - Customer Satisfaction Survey, Contact Information, Event Registration, Job Application, Employee Survey, Web Engineering Quiz, Course Evaluation, Product Feedback, Appointment Request, Party RSVP

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack, React 19) |
| **Language** | TypeScript (Strict Typing) |
| **Styling** | Tailwind CSS v4, Lucide React Icons |
| **UI Primitives** | Radix UI (Dialog, DropdownMenu, Tabs, Select, Switch, Tooltip) |
| **Forms & Validation** | React Hook Form, Zod |
| **Drag & Drop** | `@dnd-kit/core`, `@dnd-kit/sortable` |
| **Data Visualization**| Recharts (Area, Bar, Pie charts) |
| **Database** | PostgreSQL 18 with Prisma ORM |
| **Authentication** | Secure HttpOnly Cookie Session + JWT + bcrypt password hashing |
| **File Handling** | Local secure storage with MIME validation / S3 compatible |
| **Spreadsheet Engine**| xlsx (Excel & CSV export) |

---

## Quick Start

### 1. Prerequisites
- Node.js 18+ (tested on Node v24.19)
- npm 9+
- PostgreSQL database (or local instance)

### 2. Clone and Install
```bash
git clone https://github.com/your-org/formcraft.git
cd formcraft
npm install --legacy-peer-deps
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure your `DATABASE_URL` is set:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/formcraft?schema=public"
JWT_SECRET="your-super-secret-jwt-key"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 4. Database Setup & Seeding
Push the Prisma schema and seed test accounts and templates:
```bash
npx prisma db push
npx tsx prisma/seed.ts
```

### 5. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Pre-Seeded Accounts

For testing, use these credentials or click **Instant Demo Access** on the login screen:

| Email | Password | Role | Description |
|---|---|---|---|
| `admin@formcraft.app` | `Password123!` | Admin | Form Owner with pre-seeded forms & responses |
| `jane@formcraft.app` | `Password123!` | User | Collaborator and respondent account |

---

## Running Automated Tests

Run the full end-to-end integration test suite:
```bash
npx tsx tests/integration.test.ts
```

To run TypeScript verification:
```bash
npx tsc --noEmit
```

To run a production build:
```bash
npm run build
```

---

## License
MIT License. Free to use and customize.
