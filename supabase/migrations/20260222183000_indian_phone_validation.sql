-- Migration: Enforce Strict 10-Digit Indian Mobile Numbers
-- Description: Nullifies historically invalid data formats to allow placing a strict check constraint enforcing Indian numbering schemes globally natively preventing duplicate errors.

-- 1. Sanitize the existing database
-- Nullify any row where the phone number is not exactly 10 digits starting with 6, 7, 8, or 9
UPDATE public.tokens 
SET patient_phone = NULL 
WHERE patient_phone !~ '^[6-9][0-9]{9}$' AND patient_phone IS NOT NULL;

-- 2. Apply strict verification check constraint
-- New tokens will be totally rejected by pgsql if they contain +91, spaces, or non-indian schemas.
ALTER TABLE public.tokens
ADD CONSTRAINT chk_indian_phone 
CHECK (patient_phone IS NULL OR patient_phone ~ '^[6-9][0-9]{9}$');
