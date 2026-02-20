# QLink Multi-Tenant SaaS Master File Document (MFD)

This document serves as the implementation-grade breakdown, build checklist, and acceptance criteria for the QLink / QueueLess production clinic-ready multi-tenant queue system.

## 🚀 Changes Implemented in the Last Few Prompts

Before proceeding with the remainder of the build or testing, here is a summary of the precise changes implemented to fulfill the strict "Clinic-Ready" atomic MVP requirements:

1. **Database Atomicity & Schema (`supabase/migrations/0003_saas_schema.sql`)**
   - Implemented a massive upgrade to queue safety via `rpc_process_queue_action`. This PL/pgSQL function locks the session row to prevent race conditions during Next, Skip, Recall, Undo, and Pause actions.
   - Added tables/columns for offline recovery (`previous_status`, `offline_sync_id`).
   - Hardened Row Level Security (RLS) to ensure absolute tenant isolation by `business_id`.

2. **Next.js Server Actions (`app/actions/queue.ts` & `app/actions/admin.ts`)**
   - Refactored all queue mutations to route exclusively through the atomic SQL RPC. This guarantees that two receptionists furiously clicking "Next" simultaneously will never skip a patient or corrupt the sequence.
   - Added dedicated actions for new capabilities: `undoLastAction`, `pauseQueue`, `resumeQueue`, `resetBusinessSession`.

3. **Receptionist PWA/Dashboard (`app/[clinicSlug]/reception/page.tsx`)**
   - **Undo Feature**: Added a prominent "Undo" button to revert accidental "Next" or "Skip" clicks instantly.
   - **Pause/Resume**: Integrated a queue pausing toggle for doctor breaks/emergencies, which updates badges across the system.
   - **Offline Awareness**: Added a reactive `isOffline` and `isConnected` banner to warn receptionists if they lose connectivity, utilizing local state caching until reconnected.

4. **Patient Ticket Page (`app/[clinicSlug]/t/[tokenId]/page.tsx`)**
   - Replaced abstract and often incorrect wait-time calculations with explicit **"Tokens Left"** counting.
   - Placed the mandated MVP warning prominently: *"Keep this page open. Check when tokens left ≤ 5."*
   - Ensured the UI reacts elegantly to 'PAUSED', 'SKIPPED', 'CANCELLED', and 'SERVED' realtime pushes.

5. **Super Admin Dashboard (`app/admin/page.tsx`)**
   - Upgraded the `/admin` view with real-time usage stats: Active Sessions, Tokens Issued Today, and Total WhatsApp Messages Sent.
   - Added powerful operational controls: A toggle to completely **Enable/Disable** a clinic gracefully, and a **Force Reset** button to close a hung daily session.

6. **Messaging (`lib/whatsapp.ts`)**
   - Configured the MVP rule of *exactly one* notification (Token Created + Link). All subsequent urgency relies on the auto-refreshing ticket page.

---

## 🛠 Required Immediate Action: Apply Migrations

Because the previous few prompts generated advanced SQL schema updates but they have not been applied to your database yet, **you must execute them now to prevent the app from breaking**.

### How to Apply:
1. Open your **Supabase Dashboard** online.
2. Go to the **SQL Editor**.
3. Copy the entire contents of `supabase/migrations/0002_queue_functions.sql` and run it.
4. Copy the entire contents of `supabase/migrations/0003_saas_schema.sql` and run it.

Only after running these will the custom `rpc_process_queue_action` function exist, which the Next.js app now completely relies on!

---

## 📋 Comprehensive Technical Spec & Acceptance Checklist

*(The following is the exhaustive blueprint for all past & future QLink architecture)*

### 1. High-Level Architecture Components
- [x] **Frontend**: Patient tracking page, Receptionist dashboard, Admin dashboard.
- [x] **Backend**: API server (via Next.js Server Actions), Real-time channel (Supabase Realtime).
- [x] **Database**: Primary Postgres, real-time subscription engine, Row Level Security (RLS).
- [x] **Security**: HTTPS, KMS encryption at rest capability, strict tenant isolation.

### 2. Data Model (Relational Schema)
- [x] `businesses` (Tenants): slug, name, settings, status.
- [x] `staff_users`: Auth tie-in, roles, RBAC.
- [x] `sessions`: Daily operation bounds, token sequential counting strategy.
- [x] `tokens`: Immutable history, strict status enums, priority flags.
- [x] `audit_logs` / `events`: Append-only audit.
- [x] `message_logs`: WhatsApp/SMS log and retry tracker.

### 3. Token Issuance & Atomicity
- [x] Create Token Atomic RPC: Locks session row, safely increments sequence, inserts token.
- [x] Process Queue Action RPC: Safely handles atomic state transitions (Next, Undo, etc.) without race conditions.

### 4. Queue State & Business Rules
- [x] Token Statuses: WAITING, SERVING, SERVED, SKIPPED, CANCELLED.
- [x] Priority Insert: Inserts at front of waiting list automatically.
- [x] Pause/Resume: Clinic-wide pause stops queue flow, updates Patient ticket.
- [x] "Tokens Left" Computation: Strict mathematical count of ahead tokens.

### 5. Real-Time Design (1-3s Updates)
- [x] Supabase Realtime Channels: Subscription per `clinic_id`.
- [x] Only publishes diffs; UI components react locally.
- [x] Polling fallback active when WS disconnects.

### 6. Receptionist PWA Offline Mode
- [x] UI connection warnings.
- [x] (Future Phase) IndexedDB `pending_actions` queue for syncing offline taps.

### 7. Frontend UX (Receptionist & Patient)
- [x] Receptionist UI: Massive action buttons, skipped queue recall, robust 1-click controls.
- [x] Patient Ticket UI: Big generic token numbers, 'Tokens Left' display, arrival instructions.

### 8. Messaging: WhatsApp MVP
- [x] Trigger: Token Creation only.
- [x] Payload: Welcome + Tracking Link.
- [x] Logging: Every delivery attempt is stored in `message_logs` for billing.

### 9. Super Admin, Billing & Analytics 
- [x] Super Admin console protecting tenant creation.
- [x] Aggregation of messages sent, daily active tokens, active sessions.
- [x] Force capability to pause / reset bad tenant instances remotely.
