-- Creates a user_profile row when a new user signs up via Supabase Auth.
-- Run this in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_profile(id, email, created_at, updated_at)
  VALUES (new.id, new.email, now(), now())
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
