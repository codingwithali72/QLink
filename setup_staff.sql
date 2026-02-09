-- ⚠️ IMPORTANT: YOU MUST CREATE THE USER IN SUPABASE AUTH FIRST!
-- Go to: Supabase Dashboard -> Authentication -> Users -> Add User
-- Email: admin@primecare.com
-- Password: password123
-- Auto-Confirm: Make sure to auto-confirm the email if asked.

-- AFTER CREATING THE USER, COPY THEIR "User UID" (looks like 'abc-123-...')
-- AND PASTE IT BELOW WHERE IT SAYS 'PASTE_USER_UID_HERE'

INSERT INTO staff_users (id, clinic_id, email, role)
VALUES (
    'PASTE_USER_UID_HERE', 
    (SELECT id FROM clinics WHERE slug='prime-care'), 
    'admin@primecare.com', 
    'admin'
)
ON CONFLICT (id) DO UPDATE 
SET clinic_id = EXCLUDED.clinic_id, email = EXCLUDED.email;

-- Verify it worked:
SELECT * FROM staff_users;
