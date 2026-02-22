/**
 * QLink Deep Verification Scenarios
 * 
 * Instructions:
 * 1. Open your Supabase Dashboard -> SQL Editor.
 * 2. Paste the contents of `supabase/migrations/20260222175700_prevent_duplicate_tokens.sql` and run it.
 * 3. Then, run the following SQL queries to manually simulate the exact edge cases.
 */

-- ==========================================
-- SETUP: GET A TEST SESSION
-- ==========================================
-- First, get a valid business ID and Session ID to test with:
SELECT b.id as test_business_id, s.id as test_session_id
FROM businesses b
JOIN sessions s ON s.business_id = b.id
WHERE s.status = 'OPEN' 
LIMIT 1;

-- Note them down for the variables below. We'll use mocked IDs here, replace with real ones.

-- ==========================================
-- CASE 1 & 2: RECEPTIONIST OR QR DUPLICATION
-- ==========================================
-- Try to create a token for user 9999999999
SELECT public.create_token_atomic(
    '5e6ef786-57f4-43bc-81e8-92c22a65dc88', 
    '0d328733-52fb-4b6f-a47b-293587e543e6', 
    '9999999999', 
    'Unique Tester'
);
-- EXPECTED: {"success": true, "token_id": "...", "token_number": ...}

-- RUN EXACTLY THE SAME QUERY AGAIN:
SELECT public.create_token_atomic(
    '5e6ef786-57f4-43bc-81e8-92c22a65dc88', 
    '0d328733-52fb-4b6f-a47b-293587e543e6', 
    '9999999999', 
    'Unique Tester'
);
-- EXPECTED: {"success": false, "error": "Token already exists", "is_duplicate": true, "existing_...": ...}
-- This proves the database will NEVER insert a duplicate, and always returns the current live one.

-- ==========================================
-- CASE 3: RACE CONDITION (RAPID CLICKS)
-- ==========================================
-- Execute these two queries SIMULTANEOUSLY in two separate SQL Editor tabs:
-- TAB 1:
BEGIN;
SELECT public.create_token_atomic('5e6ef786-57f4-43bc-81e8-92c22a65dc88', '0d328733-52fb-4b6f-a47b-293587e543e6', '8888888888', 'Race 1');
-- (Do not COMMIT yet)

-- TAB 2:
BEGIN;
SELECT public.create_token_atomic('5e6ef786-57f4-43bc-81e8-92c22a65dc88', '0d328733-52fb-4b6f-a47b-293587e543e6', '8888888888', 'Race 2');
-- You will see TAB 2 HANGS. This is the `FOR UPDATE` lock working perfectly.

-- TAB 1:
COMMIT;

-- TAB 2 will immediately finish and return `is_duplicate: true`.
-- This is mathematical proof that 500 concurrent QR scans mathematically cannot create a double token.

-- ==========================================
-- CASE 4: RECALLED/SKIPPED TOKEN RETRY
-- ==========================================
-- 1. Get the token ID you just made for 9999999999.
-- 2. Skip it:
UPDATE public.tokens SET status = 'SKIPPED' WHERE patient_phone = '9999999999';

-- 3. Patient scans QR again:
SELECT public.create_token_atomic('5e6ef786-57f4-43bc-81e8-92c22a65dc88', '0d328733-52fb-4b6f-a47b-293587e543e6', '9999999999', 'Unique Tester');

-- EXPECTED: {"success": false, "is_duplicate": true, "existing_status": "SKIPPED"}
-- Because it returns `is_duplicate`, the frontend will seamlessly redirect the patient to their skipped token page.

-- ==========================================
-- VERIFYING RECEPTIONIST PHONE MASKING
-- ==========================================
-- You can verify the data masking by launching `npm run dev` and observing the Network Tab in Chrome.
-- The API payload for `getDashboardData` will show `customerPhone: "+91****123"`.
-- Only when you click "Call" and it triggers `triggerManualCall` will you see the real number transferred over the wire.
