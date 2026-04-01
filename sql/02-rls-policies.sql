-- Row Level Security policies for user_profile and item tables.
-- Run this in the Supabase SQL Editor AFTER running 01-trigger.sql.

-- ============================================
-- user_profile
-- ============================================
ALTER TABLE public.user_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.user_profile FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.user_profile FOR UPDATE
  USING (auth.uid() = id);

-- INSERT is handled by the trigger, so no user-facing INSERT policy needed.

-- ============================================
-- item
-- ============================================
ALTER TABLE public.item ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own items"
  ON public.item FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own items"
  ON public.item FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own items"
  ON public.item FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own items"
  ON public.item FOR DELETE
  USING (auth.uid() = user_id);
