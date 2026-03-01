-- Drop the old conflicting function explicitly
DROP FUNCTION IF EXISTS public.rpc_create_clinical_visit(uuid, uuid, text, text, text, text, text, boolean, uuid, text);
