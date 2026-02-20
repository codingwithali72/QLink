-- NEXT PATIENT ATOMIC
create or replace function next_patient_atomic(
  p_business_id uuid,
  p_session_id uuid
) returns json
language plpgsql
as $$
declare
  v_current_token_id uuid;
  v_next_token_id uuid;
  v_next_token_num int;
  v_next_phone text;
  v_next_name text;
  v_next_is_priority boolean;
begin
  -- 1. Mark current SERVING as SERVED
  update tokens 
  set status = 'SERVED', completed_at = now()
  where business_id = p_business_id 
    and session_id = p_session_id 
    and status = 'SERVING';
    
  -- 2. Find next WAITING token
  -- Order: Priority first, then Token Number
  select id, token_number, customer_phone, customer_name, is_priority
  into v_next_token_id, v_next_token_num, v_next_phone, v_next_name, v_next_is_priority
  from tokens
  where business_id = p_business_id 
    and session_id = p_session_id 
    and status = 'WAITING'
  order by is_priority desc, token_number asc
  limit 1
  for update; -- Lock the row
  
  if v_next_token_id is not null then
    -- 3. Mark next as SERVING
    update tokens 
    set status = 'SERVING'
    where id = v_next_token_id;
    
    return json_build_object(
      'success', true,
      'token_id', v_next_token_id,
      'token_number', v_next_token_num,
      'customer_phone', v_next_phone,
      'customer_name', v_next_name,
      'is_priority', v_next_is_priority
    );
  else
    return json_build_object(
      'success', true,
      'message', 'No waiting patients'
    );
  end if;
end;
$$;
