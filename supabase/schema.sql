-- ==========================================
-- QLink Schema Setup (RESET SCRIPT - LOGIC FIX v2)
-- ==========================================

-- 1. Drop old tables to ensure clean slate
DROP TABLE IF EXISTS message_logs CASCADE;
DROP TABLE IF EXISTS tokens CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS staff_users CASCADE;
DROP TABLE IF EXISTS clinics CASCADE;

-- 2. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 3. Create Tables
CREATE TABLE clinics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL
);

CREATE TABLE staff_users (
    id UUID PRIMARY KEY, -- This maps to auth.users.id
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'admin'
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT DEFAULT 'OPEN',
    current_token_number INTEGER DEFAULT 0,
    last_token_number INTEGER DEFAULT 0,
    last_emergency_number INTEGER DEFAULT 0, -- NEW: Separate counter for Emergency
    UNIQUE(clinic_id, date)
);

CREATE TABLE tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    token_number INTEGER NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    source TEXT DEFAULT 'QR',
    status TEXT DEFAULT 'WAITING',
    is_priority BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE message_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID,
    token_id UUID,
    phone TEXT,
    message_text TEXT,
    channel TEXT,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Enable RLS
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- A. PUBLIC ACCESS (Customers)
CREATE POLICY "Public Read Clinics" ON clinics FOR SELECT USING (true);
CREATE POLICY "Public Read Sessions" ON sessions FOR SELECT USING (true);
CREATE POLICY "Public Read Tokens" ON tokens FOR SELECT USING (true);
CREATE POLICY "Public Cancel Token" ON tokens FOR UPDATE USING (true) WITH CHECK (status = 'CANCELLED');

-- B. STAFF ACCESS (Receptionists)
CREATE POLICY "Staff Full Access Clinics" ON clinics FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Staff Full Access Users" ON staff_users FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Staff Full Access Sessions" ON sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Staff Full Access Tokens" ON tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Staff Full Access Logs" ON message_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ==========================================
-- 6. SEED CLINIC
-- ==========================================
INSERT INTO clinics (id, slug, name) 
VALUES (gen_random_uuid(), 'prime-care', 'Prime Care Specialist Clinic');
