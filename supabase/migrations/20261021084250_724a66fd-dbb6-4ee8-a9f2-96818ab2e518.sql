CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.project_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 5000),
  goal text CHECK (goal IS NULL OR char_length(goal) <= 500),
  additional_context text CHECK (additional_context IS NULL OR char_length(additional_context) <= 5000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.project_requests TO service_role;
ALTER TABLE public.project_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX project_requests_created_at_idx ON public.project_requests (created_at DESC);
CREATE INDEX project_requests_status_idx ON public.project_requests (status);
CREATE TRIGGER update_project_requests_updated_at BEFORE UPDATE ON public.project_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.project_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.project_requests(id) ON DELETE CASCADE,
  summary text NOT NULL,
  project_goal text,
  phases jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(phases) = 'array'),
  recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(recommended_actions) = 'array'),
  risks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(risks) = 'array'),
  estimated_duration text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.project_plans TO service_role;
ALTER TABLE public.project_plans ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_project_plans_updated_at BEFORE UPDATE ON public.project_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();