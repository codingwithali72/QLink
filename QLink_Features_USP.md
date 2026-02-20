# QLink / QueueLess 🚀
## Your Clinic-Ready Queue Management SaaS

QLink is a modern, production-ready SaaS designed to completely eliminate crowded waiting rooms. It empowers clinics to manage patients effortlessly while giving patients the gift of time.

---

## 🌟 Unique Selling Proposition (USP)

**"A queue system so simple, both receptionists and patients instantly understand it."**

Unlike bloated hospital management software, QLink focuses 100% on the core problem: **Wait Time Transparency.** 
- **For the Clinic:** It prevents reception chaos with robust, atomic queue-state protection. A 5-minute onboarding ensures zero learning curve for non-technical staff.
- **For the Patient:** Absolutely no app download required. A simple scan gives them a beautiful, real-time ticket showing exactly how many people are ahead of them—allowing them to wait from a coffee shop, their car, or home.

---

## 🎯 Core Features Built-In

### 1. Bulletproof "Atomic" Backend
Two receptionists clicking "Next" at the exact same millisecond will never break the queue or skip a patient. The database uses strict transaction locking, ensuring 100% accuracy and preventing race conditions.

### 2. Multi-Tenant SaaS Architecture
Built on Row-Level Security (RLS), every single clinic on your platform is rigidly isolated from one another. Clinic A cannot access, see, or accidentally modify Clinic B's patients or data.

### 3. Patient Tracking Page (No App Required)
Patients receive an SMS or WhatsApp with a secure, unguessable link. The tracking page uses **Real-Time WebSockets** to instantly update their status.
- Shows a massive, clear Token Number.
- Shows explicit **"Tokens Left Ahead of You"** instead of inaccurate ETA guesses.
- Highlights emergency/priority tokens clearly.

### 4. Lightning-Fast Receptionist Dashboard
Designed Mobile-First for tablets and phones at the front desk.
- **One-Click Actions:** Next Patient, Skip, Cancel, and Recall.
- **The "Oops" Button:** A highly requested **Undo** button instantly corrects an accidental click.
- **Queue Pausing:** The receptionist can pause the queue when the doctor takes a break, and all waiting patients' phones instantly flash a "Queue Paused" warning.
- **Priority Inserts:** Easily slip an emergency patient to the absolute front of the line.

### 5. Resilient Offline-Aware Fallback
If the clinic's reception WiFi drops, the app doesn't crash. It detects the network loss, displays a warning banner, and uses cached Service Worker data to keep the current queue state visible until the connection is restored.

### 6. Super Admin Control Center
A dedicated global dashboard for you (the SaaS owner) to manage your entire business:
- View total active clinic sessions globally today.
- View total patients served today.
- One-click tenant creation (onboarding a new clinic takes 3 seconds).
- **Kill Switch:** Enable or Disable a non-paying clinic with a single click, instantly locking their dashboards and patient links.
- **Force Reset:** Clear hung sessions if a clinic forgets to close out for the day.

### 7. WhatsApp / SMS Integration (MVP)
The exact moment a patient is added to the queue, the system logs and triggers a clean, professional welcome message (via Meta Cloud API or standard SMS provider) containing their unique tracking link. Every message sent is tracked in an Audit Log for your future billing structures.
