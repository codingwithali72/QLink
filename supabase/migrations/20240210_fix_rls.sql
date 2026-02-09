-- FIX RLS POLICIES FOR PUBLIC ACCESS
-- Run this in Supabase SQL Editor to resolve "Ticket not found" errors

-- 1. Enable RLS (Ensure it's on)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;

-- 2. Sessions: Allow Public Read (Anon)
DROP POLICY IF EXISTS "Public Read Sessions" ON sessions;
CREATE POLICY "Public Read Sessions" ON sessions 
FOR SELECT 
TO public 
USING (true);

-- 3. Tokens: Allow Public Read (Anon)
DROP POLICY IF EXISTS "Public Read Tokens" ON tokens;
CREATE POLICY "Public Read Tokens" ON tokens 
FOR SELECT 
TO public 
USING (true);

-- 4. Verify Clinic Access just in case
DROP POLICY IF EXISTS "Public Read Clinics" ON clinics;
CREATE POLICY "Public Read Clinics" ON clinics 
FOR SELECT 
TO public 
USING (true);
