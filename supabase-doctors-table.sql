-- Create DOCTORS table in Supabase
-- Run this in Supabase SQL Editor

create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),

  clinic_id uuid not null,
  clinic_code text not null,

  full_name text,
  email text,
  phone text,

  license_number text,

  status text default 'PENDING', -- PENDING | ACTIVE | REJECTED
  role text default 'DOCTOR',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add indexes for performance
create index if not exists idx_doctors_clinic_code on public.doctors(clinic_code);
create index if not exists idx_doctors_status on public.doctors(status);
create index if not exists idx_doctors_email on public.doctors(email);
create index if not exists idx_doctors_phone on public.doctors(phone);

-- Enable RLS (Row Level Security)
alter table public.doctors enable row level security;

-- Create policy for admin access
create policy "Admins can view all doctors" on public.doctors
  for select using (auth.jwt() ->> 'role' = 'ADMIN');

create policy "Admins can update doctors" on public.doctors  
  for update using (auth.jwt() ->> 'role' = 'ADMIN');

-- Create policy for doctors to view their own profile
create policy "Doctors can view own profile" on public.doctors
  for select using (auth.jwt() ->> 'doctorId'::text = id::text);

-- Grant permissions
grant usage on schema public to anon, authenticated;
grant select on public.doctors to anon, authenticated;
grant insert on public.doctors to authenticated;
grant update on public.doctors to authenticated;
