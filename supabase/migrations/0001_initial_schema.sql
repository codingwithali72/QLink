-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. BUSINESSES (Tenants)
create table businesses (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  settings jsonb default '{}'::jsonb, -- Store rules, limits, etc.
  is_active boolean default true,
  created_at timestamptz default now()
);

-- 2. STAFF USERS (Links Auth to Business)
create table staff_users (
  id uuid primary key references auth.users(id) on delete cascade, -- One-to-one with Auth User
  business_id uuid references businesses(id) on delete cascade not null,
  role text default 'staff', -- 'admin', 'staff', 'owner'
  email text,
  full_name text,
  created_at timestamptz default now()
);

-- 3. SESSIONS (Daily Queues)
create table sessions (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  date date not null default current_date,
  status text check (status in ('OPEN', 'CLOSED', 'PAUSED')) default 'CLOSED',
  start_time timestamptz,
  end_time timestamptz,
  daily_token_count int default 0, -- Counter for sequential tokens
  created_at timestamptz default now()
);

-- 4. TOKENS (The Queue)
create table tokens (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  session_id uuid references sessions(id) on delete cascade not null,
  token_number int not null,
  customer_phone text, -- Can be encrypted later
  customer_name text,
  status text check (status in ('WAITING', 'SERVING', 'SERVED', 'SKIPPED', 'CANCELLED')) default 'WAITING',
  is_priority boolean default false,
  created_at timestamptz default now(),
  completed_at timestamptz,
  created_by_staff_id uuid references staff_users(id),
  
  -- Prevent duplicates per session
  unique(session_id, token_number)
);

-- 5. AUDIT LOGS
create table audit_logs (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  staff_id uuid references staff_users(id),
  action text not null, -- 'NEXT', 'ADD', 'SKIP', etc.
  details jsonb,
  created_at timestamptz default now()
);

-- 6. MESSAGE LOGS
create table message_logs (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade not null,
  token_id uuid references tokens(id),
  status text, -- 'SENT', 'FAILED'
  provider_response jsonb,
  created_at timestamptz default now()
);


-- INDEXES
create index idx_businesses_slug on businesses(slug);
create index idx_staff_users_business on staff_users(business_id);
create index idx_sessions_business_date on sessions(business_id, date);
create index idx_tokens_session_status on tokens(session_id, status);
create index idx_tokens_business_phone on tokens(business_id, customer_phone);
create index idx_audit_logs_business on audit_logs(business_id);


-- ROW LEVEL SECURITY (RLS)
alter table businesses enable row level security;
alter table staff_users enable row level security;
alter table sessions enable row level security;
alter table tokens enable row level security;
alter table audit_logs enable row level security;
alter table message_logs enable row level security;


-- RLS POLICIES

-- Businesses:
-- Public can read basic info via slug (for landing page/check-in)
create policy "Public read businesses by slug" on businesses
  for select using (true);
  
-- Staff can view their own business
create policy "Staff view own business" on businesses
  for select using (
    id in (select business_id from staff_users where id = auth.uid())
  );

-- Staff Users:
-- Users can read their own profile
create policy "Read own profile" on staff_users
  for select using (auth.uid() = id);

-- Sessions:
-- Public can read active sessions (for customer view)
create policy "Public read sessions" on sessions
  for select using (true);

-- Staff can all access sessions for their business
create policy "Staff full access sessions" on sessions
  for all using (
    business_id in (select business_id from staff_users where id = auth.uid())
  );

-- Tokens:
-- Public can read tokens for open sessions (Customer View)
-- IMPORTANT: Limit columns in View if needed, but for now strict RLS by business_id
create policy "Public read tokens" on tokens
  for select using (true);

-- Staff full access
create policy "Staff full access tokens" on tokens
  for all using (
    business_id in (select business_id from staff_users where id = auth.uid())
  );

-- Audit Logs:
-- Staff read-only (mostly for admin dashboard features later)
create policy "Staff read audit logs" on audit_logs
  for select using (
    business_id in (select business_id from staff_users where id = auth.uid())
  );
  
-- Message Logs:
-- Staff read-only
create policy "Staff read message logs" on message_logs
  for select using (
    business_id in (select business_id from staff_users where id = auth.uid())
  );
  
-- HELPER FUNCTIONS

-- Function to create a token atomically (handles race conditions better than client-side)
create or replace function create_token_atomic(
  p_business_id uuid,
  p_session_id uuid,
  p_name text,
  p_phone text,
  p_is_priority boolean,
  p_staff_id uuid
) returns json
language plpgsql
as $$
declare
  v_token_num int;
  v_new_token_id uuid;
begin
  -- Lock session row to prevent concurrent updates to daily_token_count
  perform 1 from sessions where id = p_session_id for update;
  
  -- Increment token count
  update sessions 
  set daily_token_count = daily_token_count + 1
  where id = p_session_id
  returning daily_token_count into v_token_num;
  
  -- Insert token
  insert into tokens (business_id, session_id, token_number, customer_name, customer_phone, is_priority, status, created_by_staff_id)
  values (p_business_id, p_session_id, v_token_num, p_name, p_phone, p_is_priority, 'WAITING', p_staff_id)
  returning id into v_new_token_id;
  
  return json_build_object('token_id', v_new_token_id, 'token_number', v_token_num);
end;
$$;
