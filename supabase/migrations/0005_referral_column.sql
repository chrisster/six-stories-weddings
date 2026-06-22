-- Add participant type and freelancer budget to crew assignments
ALTER TABLE public.crew_assignments
  ADD COLUMN IF NOT EXISTS participant_type VARCHAR(20) NOT NULL DEFAULT 'in_house',
  ADD COLUMN IF NOT EXISTS freelancer_budget NUMERIC(10, 2);

-- Add referral field to projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS referral TEXT;
