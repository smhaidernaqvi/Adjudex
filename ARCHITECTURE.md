# Freelancer–Client Trust Platform — Architecture

## Technology Stack

| Layer       | Technology                          |
| ----------- | ----------------------------------- |
| Framework   | Next.js 16 (App Router, Turbopack)  |
| Language    | TypeScript 5                        |
| Styling     | Tailwind CSS 4                      |
| Runtime     | React 19                            |

## Project Structure

```
src/
├── app/                          # Next.js App Router pages
│   ├── page.tsx                  # Landing page
│   ├── login/                    # Login page
│   ├── signup/                   # Signup page
│   ├── client/                   # Client-only routes
│   │   ├── dashboard/
│   │   └── projects/
│   │       ├── new/
│   │       └── [id]/
│   ├── freelancer/               # Freelancer-only routes
│   │   ├── dashboard/
│   │   └── projects/[id]/
│   ├── projects/[id]/            # Shared project routes
│   │   ├── submit/
│   │   ├── verify/
│   │   ├── review/
│   │   ├── payment/
│   │   ├── dispute/
│   │   └── complete/
│   └── admin/                    # Admin routes
│
├── components/                   # React components
│   ├── ui/                       # Primitives (Button, Input, Modal, Card, Badge, StatusBadge)
│   ├── layout/                   # Layout (Navbar, Sidebar)
│   ├── project/                  # Project domain (ProjectCard, Requirements, Timeline, etc.)
│   ├── payment/                  # Payment domain (PaymentStatus)
│   ├── verification/             # Verification domain (VerificationReport)
│   └── dispute/                  # Dispute domain (DisputePanel)
│
├── lib/                          # External service integrations
│   ├── auth/                     # Authentication & session management
│   ├── database/                 # Database ORM & connection
│   ├── ai/                       # AI integration (verification)
│   ├── payments/                 # Payment/escrow engine
│   └── security/                 # Input validation, guards
│
├── services/                     # Business logic layer
│   ├── projects/                 # Project CRUD + state machine
│   │   ├── index.ts
│   │   └── state-machine.ts      # State transition rules
│   ├── submissions/              # Submission handling
│   ├── verification/             # AI verification orchestration
│   ├── payments/                 # Escrow operations
│   └── disputes/                 # Dispute workflow
│
├── types/                        # TypeScript type definitions
│   └── index.ts                  # All entity types & enums
│
└── utils/                        # Shared utility functions
    └── index.ts
```

## Architectural Layers

```
UI (Pages + Components)
    ↓
Services (Business Logic)
    ↓
Lib (Database, AI, Payments, Auth, Security)
    ↓
External APIs / Database
```

Each layer only calls the layer directly below it. UI components never
directly access the database or external APIs.

## Core Transaction Flow

```
Client creates project (CREATED)
  → Freelancer accepts (FREELANCER_ACCEPTED)
  → Client locks payment (PAYMENT_LOCKED)
  → Freelancer works (IN_PROGRESS)
  → Freelancer submits (SUBMITTED)
  → AI verifies requirements (AI_VERIFICATION)
  → Client reviews preview (CLIENT_REVIEW)
    → Approved → Payment released → Deliverable unlocked → COMPLETED
    → Revision required → Back to IN_PROGRESS
    → Disputed → DISPUTED
```

State transitions are defined in `src/services/projects/state-machine.ts`.

## User Roles

| Role       | Dashboard Route            | Primary Actions                    |
| ---------- | -------------------------- | ---------------------------------- |
| Client     | `/client/dashboard`        | Create projects, review, approve   |
| Freelancer | `/freelancer/dashboard`    | Accept projects, submit work       |
| Admin      | `/admin`                   | Monitor, resolve disputes          |

## Key Design Decisions

1. **Separation of concerns** — UI, services, and infrastructure are
   strictly separated. Business logic lives in `services/`, not in
   components or API route handlers.

2. **State machine isolation** — Project state transitions are defined in
   a dedicated `state-machine.ts` file, making the workflow easy to audit
   and test.

3. **Barrel exports** — Each component directory has an `index.ts` barrel
   file for clean imports.

4. **Type-first** — All entity shapes are defined in `src/types/index.ts`
   before any implementation begins.

5. **No premature dependencies** — Only Next.js, React, TypeScript, and
   Tailwind CSS are installed. Database, AI, and payment libraries
   will be added when those features are implemented.

## Authentication (Feature 1)

**Approach:** Zero-dependency auth using the Web Crypto API.

| Layer | What it does |
|---|---|
| `src/lib/auth/index.ts` | Core: signup, login, logout, token create/verify, password hashing |
| `src/middleware.ts` | Edge middleware: verifies `auth_token` cookie for protected routes |
| `src/components/auth/AuthProvider.tsx` | React context: shares user state across client components |
| `src/app/client/layout.tsx` | Auth guard: redirects unauthed users from `/client/*` |
| `src/app/freelancer/layout.tsx` | Auth guard: redirects unauthed users from `/freelancer/*` |

- **Password storage:** PBKDF2-SHA-256 with 100 000 iterations + per-user salt
- **Session token:** HMAC-SHA-256-signed payload (userId, role, expiry) in a cookie
- **User data:** localStorage (migrate to DB later)
- **Route protection:** Dual layer — middleware (server) + layout guards (client)
- **Role-based redirect:** Client → `/client/dashboard`, Freelancer → `/freelancer/dashboard`

## Project Creation (Feature 2)

**Approach:** Service-layer CRUD with localStorage persistence.

| Layer | What it does |
|---|---|
| `src/services/projects/index.ts` | `createProject()`, `getProjectsByClientId()`, `getProjectById()`, `getRequirementsByProjectId()`, `transitionProject()` |
| `src/app/client/dashboard/page.tsx` | Client dashboard with project list + empty state |
| `src/app/client/projects/new/page.tsx` | Project creation form with dynamic requirements |
| `src/app/client/projects/[id]/page.tsx` | Project detail view with requirements checklist |
| `src/components/project/ProjectCard.tsx` | Clickable project summary card |

- **Storage keys:** `tf_projects` and `tf_requirements` in localStorage
- **Initial state:** `CREATED` (first state in the state machine)
- **Project type:** Added `currency: string` field to support multi-currency budgets

## Freelancer Discovery & Acceptance (Feature 3)

**Approach:** Freelancers browse available projects and accept via the state machine.

| Layer | What it does |
|---|---|
| `src/lib/auth/index.ts` | `getUserById()` — public user lookup without sensitive fields |
| `src/services/projects/index.ts` | `getAvailableProjects()`, `getProjectsByFreelancerId()`, `getRequirementCount()`, `acceptProject()` |
| `src/app/freelancer/dashboard/page.tsx` | Available Projects + My Projects sections |
| `src/app/freelancer/projects/[id]/page.tsx` | Project detail + Accept button with confirmation modal |
| `src/app/client/projects/[id]/page.tsx` | Updated to show assigned freelancer name + role |

- **Transition used:** `CREATED → FREELANCER_ACCEPTED` (via existing state machine)
- **Validation:** Cannot accept already-assigned projects, wrong status, or non-CREATED projects
- **User lookup:** Stored freelancer ID only; name resolved via `getUserById()` at render time

## Simulated Escrow / Payment Lock (Feature 4)

**Approach:** Payment status is kept separate from project status. No real money moves.

| Layer | What it does |
|---|---|
| `src/services/payments/index.ts` | `createPayment()`, `lockPayment()`, `getPaymentByProjectId()`, `releasePayment()` |
| `src/components/payment/PaymentStatus.tsx` | Reusable payment display with status-specific messages |
| `src/app/client/projects/[id]/page.tsx` | Escrow section with "Lock Payment" button + confirmation modal |
| `src/app/freelancer/projects/[id]/page.tsx` | Escrow section showing lock state to freelancer |

- **Storage key:** `tf_payments` in localStorage
- **Payment states:** `pending` → `locked` → `released` (or `refunded`)
- **Project status remains independent** — payment lock does NOT change `FREELANCER_ACCEPTED`
- **Validation:** Only project client can create/lock; freelancer must be assigned; double-lock rejected

## Freelancer Deliverable Submission (Feature 5)

**Approach:** Plain-text deliverable submission with sequential state transitions.

| Layer | What it does |
|---|---|
| `src/services/submissions/index.ts` | `createSubmission()`, `getSubmissionByProjectId()`, `updateSubmissionStatus()` |
| `src/app/freelancer/projects/[id]/page.tsx` | Submission form (title + description + optional URL) + submitted state display |
| `src/app/client/projects/[id]/page.tsx` | Read-only deliverable section showing submitted content |
| `src/types/index.ts` | Updated `Submission` type with `title` and `status` fields |

- **Storage key:** `tf_submissions` in localStorage
- **Submission statuses:** `submitted` → `under_review` / `approved` / `revision_requested`
- **State machine transitions:** On submission, project moves `FREELANCER_ACCEPTED → PAYMENT_LOCKED → IN_PROGRESS → SUBMITTED` (sequential calls to `transitionProject()`)
- **Validation:** Only assigned freelancer can submit; payment must be locked; title and description required; URL validated if provided; duplicate submissions blocked
- **Content storage:** Description is plain text — Feature 6 (AI Verification) will use this as evidence against project requirements

### What Feature 6 should consume:

- `getSubmissionByProjectId(projectId)` — returns the latest submission with `title`, `description`, and `fileUrl`
- Project will be in `SUBMITTED` state after successful submission
- `SUBMITTED → AI_VERIFICATION` transition is already defined in the state machine
- Project requirements are available via `getRequirementsByProjectId(projectId)`

## AI-Powered Deliverable Verification (Feature 6)

**Approach:** Real AI integration via OpenAI-compatible API. No mock/fake AI.

| Layer | What it does |
|---|---|
| `src/lib/ai/index.ts` | AI client: prompt construction, API call, structured response parsing & validation |
| `src/services/verification/index.ts` | Orchestration: validates project/submission, calls AI, persists results, transitions project |
| `src/components/verification/VerificationReport.tsx` | Displays per-requirement results with color-coded badges (✓/⚠/✗) |
| `src/app/client/projects/[id]/page.tsx` | "Run AI Verification" button + report display + error handling |
| `src/app/freelancer/projects/[id]/page.tsx` | Read-only verification report after client runs it |
| `src/types/index.ts` | Updated `AIVerificationResult`, added `RequirementResult`, `RequirementStatus`, `VerificationStatus` |

### Data Model

```
AIVerificationResult {
  id, projectId, submissionId,
  overallScore (0–100),
  summary (text),
  requirementResults: RequirementResult[],
  status: "pending" | "completed" | "failed",
  createdAt
}

RequirementResult {
  requirementId, requirementText,
  status: "VERIFIED" | "UNCLEAR" | "MISSING",
  explanation, confidence (0.0–1.0)
}
```

### AI Service Abstraction

- **Environment variables** (set in `.env.local`, prefixed `NEXT_PUBLIC_` for client-side):
  - `NEXT_PUBLIC_AI_API_KEY` — API key (required)
  - `NEXT_PUBLIC_AI_API_URL` — API endpoint (optional, defaults to OpenAI)
  - `NEXT_PUBLIC_AI_MODEL` — Model name (optional, defaults to `gpt-4o-mini`)
- **No API key hardcoded** — `isAIConfigured()` checks env var availability
- **Structured JSON output** — system prompt enforces JSON response format
- **Response validation** — parsed and validated before storage; malformed responses throw

### Verification Flow

```
Client opens SUBMITTED project
  → Sees "Deliverable Submitted" + "AI Verification" section
  → Clicks "Run AI Verification"
  → Service validates: project exists, status = SUBMITTED, submission exists, no existing verification
  → Project transitions: SUBMITTED → AI_VERIFICATION → CLIENT_REVIEW
  → AI receives: project requirements + freelancer submission text
  → AI returns: per-requirement VERIFIED/UNCLEAR/MISSING + score + summary
  → Result stored in tf_verifications (localStorage)
  → Client sees: VerificationReport with score + per-requirement badges
  → Freelancer sees: read-only VerificationReport on next visit
```

### State Machine Transitions

`SUBMITTED → AI_VERIFICATION → CLIENT_REVIEW` (both transitions already defined in state-machine.ts)

### Error Handling

- Missing API key → amber info box: "Add NEXT_PUBLIC_AI_API_KEY to .env.local"
- API request failure → error banner + failed verification record stored
- Malformed AI response → error with specific field name
- Duplicate verification → rejected with error message
- `clearFailedVerification()` — allows retry after failure

### localStorage

- **Key:** `tf_verifications`
- **Stored shape:** ISO date strings for `createdAt`

### What Feature 7 (Client Review / Approval) should consume:

- `getVerificationByProjectId(projectId)` — returns the completed verification with all requirement results
- Project will be in `CLIENT_REVIEW` state after successful verification
- `CLIENT_REVIEW → APPROVED` / `REVISION_REQUIRED` / `DISPUTED` transitions are defined in the state machine
- Overall score and per-requirement statuses inform the client's approval decision

## Client Review: Approve or Dispute (Feature 7)

**Approach:** Client reviews requirements + deliverable + AI report, then approves or disputes.

| Layer | What it does |
|---|---|
| `src/services/approval/index.ts` | `approveDeliverable()`, `getApprovalByProjectId()` — validates + transitions to APPROVED |
| `src/services/disputes/index.ts` | `createDispute()`, `getDisputeByProjectId()`, `getAnyDisputeByProjectId()` — validates + transitions to DISPUTED |
| `src/app/client/projects/[id]/page.tsx` | "Review Deliverable" section with approve/dispute buttons + confirmation modals + state displays |
| `src/app/freelancer/projects/[id]/page.tsx` | Read-only approved/disputed state display for freelancer |
| `src/types/index.ts` | Added `DisputeCategory` type; expanded `Dispute` with `submissionId`, `category` |

### Data Models

```
Approval { id, projectId, approvedBy, approvedAt, notes }
Dispute  { id, projectId, submissionId, raisedBy, reason, category, status, createdAt }

DisputeCategory = "missing_requirement" | "incorrect_implementation"
                | "does_not_match_agreement" | "other"
```

### State Transitions

```
CLIENT_REVIEW → APPROVED    (client clicks "Approve Deliverable")
CLIENT_REVIEW → DISPUTED    (client clicks "Dispute / Request Review")
```

Both transitions were already defined in the state machine.

### Approval Flow

```
Client opens CLIENT_REVIEW project
  → Sees requirements + deliverable + AI report
  → Clicks "Approve Deliverable"
  → Confirmation modal: "By approving, you confirm the work satisfies the requirements"
  → Client confirms
  → Service validates: client is project owner, status = CLIENT_REVIEW, submission + verification exist
  → Project transitions: CLIENT_REVIEW → APPROVED
  → Approval record stored (tf_approvals)
  → Client sees: "Deliverable Approved — Payment ready for release"
  → Freelancer sees: "Deliverable Approved — Payment ready for release"
```

### Dispute Flow

```
Client opens CLIENT_REVIEW project
  → Clicks "Dispute / Request Review"
  → Modal: select category + enter reason
  → Client submits
  → Service validates: client is project owner, status = CLIENT_REVIEW, submission + verification exist, no active dispute
  → Project transitions: CLIENT_REVIEW → DISPUTED
  → Dispute record stored (tf_disputes)
  → Client sees: "Dispute Submitted — Payment remains locked"
  → Freelancer sees: "Deliverable Disputed — Payment remains locked"
```

### Payment Safety

**Feature 7 does NOT release or refund payment.** Payment remains LOCKED after both:
- Client approval (project → APPROVED)
- Client dispute (project → DISPUTED)

Feature 8 will handle:
- APPROVED → `releasePayment()` → PAYMENT_RELEASED
- DISPUTED → dispute resolution → refund / release

### Validation Rules

- Only the project client can approve or dispute
- Approval requires: CLIENT_REVIEW status + submission exists + verification completed
- Dispute requires: CLIENT_REVIEW status + submission exists + verification completed + non-empty reason
- Duplicate approval rejected
- Duplicate active dispute rejected
- Approval after dispute rejected (project no longer in CLIENT_REVIEW)
- Dispute after approval rejected (project no longer in CLIENT_REVIEW)

### localStorage Keys

- `tf_approvals` — approval records
- `tf_disputes` — dispute records

### Feature 8 Handoff

Feature 8 (Payment Release / Refund) should consume:
- `getApprovalByProjectId()` — check if deliverable was approved
- `getDisputeByProjectId()` — check if dispute is active
- Project will be in APPROVED or DISPUTED state
- `APPROVED → PAYMENT_RELEASED` transition is defined in the state machine
- DISPUTED state is a terminal state (no transitions defined) — Feature 8 will add resolution paths

## Payment Release & Project Completion (Feature 8)

**Approach:** Client releases simulated payment after approval. Project completes. **NO REAL MONEY MOVES.**

| Layer | What it does |
|---|---|
| `src/services/payments/index.ts` | `releasePayment()` — validates APPROVED status + client auth + locked payment, sets RELEASED, transitions project to COMPLETED |
| `src/app/client/projects/[id]/page.tsx` | "Release Payment" button + confirmation modal + completed state display |
| `src/app/freelancer/projects/[id]/page.tsx` | Read-only "Payment Released" completed state |

### Release Flow

```
Client opens APPROVED project (payment = LOCKED)
  → Sees "Deliverable Approved" + "Release Payment" button
  → Clicks "Release Payment"
  → Confirmation modal: amount + "simulated hackathon payment" disclaimer
  → Client confirms
  → Service validates: client is owner, status = APPROVED, payment = LOCKED, not already released
  → Payment: LOCKED → RELEASED (stored with releasedAt timestamp)
  → Project: APPROVED → PAYMENT_RELEASED → FINAL_DELIVERY_RELEASED → COMPLETED
  → Client sees: "Transaction Completed" + amount + release timestamp
  → Freelancer sees: "Payment Released" + amount + release timestamp
```

### Payment State Transition

`LOCKED → RELEASED` (with releasedAt timestamp)

### Project State Transitions

`APPROVED → PAYMENT_RELEASED → FINAL_DELIVERY_RELEASED → COMPLETED`

All transitions were already defined in the state machine. Sequential `transitionProject()` calls.

### Validation Rules

- Only the project client can release payment
- Project must be in APPROVED status
- Payment must be LOCKED (not PENDING, not already RELEASED)
- Duplicate release rejected: "Payment has already been released"
- Freelancer cannot release payment (service rejects)
- DISPUTED projects cannot release payment (project not in APPROVED status)

### Completed State

After release:
- Client sees: "Transaction Completed" with amount, currency, "Status: RELEASED", release timestamp
- Freelancer sees: "Payment Released" with same payment details
- Both states persist in localStorage across refreshes and re-logins

### Disputed Projects

- Payment remains LOCKED
- No "Release Payment" button shown
- Dispute information displayed
- DISPUTED is a terminal state in the state machine (no outbound transitions defined)
- Refund resolution is a documented future feature

### Security / Authorization

- `releasePayment()` now requires `clientId` parameter (was previously unauthenticated)
- Service validates caller is the project client before any operation
- Payment state guards: PENDING→RELEASED rejected, RELEASED→RELEASED rejected

### Limitations

- NO real money moves — all simulated in localStorage
- No Stripe/PayPal/bank integration
- No refund workflow (future feature)
- No invoice/receipt generation (future feature)
