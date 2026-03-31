-- Soft delete para listas
ALTER TABLE public.lists ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.lists ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);
