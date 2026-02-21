-- =================================================================================
-- QLINK MIGRATION: ROLE-BASED ACCESS CONTROL (RBAC)
-- Execution Phase 2: Updating the `staff_users` table to enforce structured roles
-- =================================================================================

-- 1. Create the structured role ENUM
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_role') THEN
        CREATE TYPE public.staff_role AS ENUM ('SUPER_ADMIN', 'OWNER', 'RECEPTIONIST');
    END IF;
END $$;

-- 2. Update existing 'role' column from text to the new enum type
-- We assume current roles in the db are valid text strings like 'RECEPTIONIST'.
-- We temporarily change the column type and map values.
ALTER TABLE "public"."staff_users" 
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE public.staff_role 
    USING (role::public.staff_role),
  ALTER COLUMN "role" SET DEFAULT 'RECEPTIONIST'::public.staff_role;

-- Note: The `SUPER_ADMIN` enum is added for future extensibility if we decide to
-- bring super admins into the `staff_users` table rather than just relying on the ADMIN_EMAIL env var.
