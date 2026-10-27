CREATE TABLE public.codes (
  code text PRIMARY KEY CHECK (code ~ '^[A-HJ-NP-Z2-9]{4}$'),
  prize_id text NOT NULL,
  player_id text NOT NULL UNIQUE,
  ip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz
);
CREATE INDEX codes_ip_time ON public.codes (ip, created_at);
GRANT ALL ON public.codes TO service_role;
ALTER TABLE public.codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.staff_pin_fails (
  ip text PRIMARY KEY,
  n int NOT NULL DEFAULT 0,
  locked_until timestamptz
);
GRANT ALL ON public.staff_pin_fails TO service_role;
ALTER TABLE public.staff_pin_fails ENABLE ROW LEVEL SECURITY;

-- Atomic spin. p_prizes: [{id, weight, stock|null}]
CREATE OR REPLACE FUNCTION public.spin_wheel(p_player text, p_ip text, p_prizes jsonb, p_max int, p_ip_limit int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existing public.codes;
  total_weight int := 0;
  roll int;
  pr jsonb;
  open_prizes jsonb := '[]'::jsonb;
  chosen text;
  new_code text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
BEGIN
  PERFORM pg_advisory_xact_lock(424242);
  SELECT * INTO existing FROM public.codes WHERE player_id = p_player;
  IF FOUND THEN
    RETURN jsonb_build_object('fresh', false, 'code', existing.code, 'prize_id', existing.prize_id, 'redeemed', existing.redeemed_at IS NOT NULL);
  END IF;
  IF (SELECT count(*) FROM public.codes) >= p_max THEN
    RETURN jsonb_build_object('error', 'soldout', 'message', 'Every bag has been claimed. The wheel is closed.');
  END IF;
  IF (SELECT count(*) FROM public.codes WHERE ip = p_ip AND created_at > now() - interval '24 hours') >= p_ip_limit THEN
    RETURN jsonb_build_object('error', 'limited', 'message', 'Too many spins from this connection. Try again tomorrow.');
  END IF;
  FOR pr IN SELECT * FROM jsonb_array_elements(p_prizes) LOOP
    IF pr->'stock' IS NULL OR jsonb_typeof(pr->'stock') = 'null'
       OR (SELECT count(*) FROM public.codes WHERE prize_id = pr->>'id') < (pr->>'stock')::int THEN
      open_prizes := open_prizes || jsonb_build_array(pr);
      total_weight := total_weight + (pr->>'weight')::int;
    END IF;
  END LOOP;
  IF total_weight = 0 THEN
    RETURN jsonb_build_object('error', 'soldout', 'message', 'All prizes have been claimed.');
  END IF;
  roll := floor(random() * total_weight)::int;
  FOR pr IN SELECT * FROM jsonb_array_elements(open_prizes) LOOP
    IF roll < (pr->>'weight')::int THEN chosen := pr->>'id'; EXIT; END IF;
    roll := roll - (pr->>'weight')::int;
  END LOOP;
  IF chosen IS NULL THEN chosen := open_prizes->-1->>'id'; END IF;
  LOOP
    new_code := '';
    FOR i IN 1..4 LOOP
      new_code := new_code || substr(alphabet, 1 + floor(random() * 32)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.codes WHERE code = new_code);
  END LOOP;
  INSERT INTO public.codes (code, prize_id, player_id, ip) VALUES (new_code, chosen, p_player, p_ip);
  RETURN jsonb_build_object('fresh', true, 'code', new_code, 'prize_id', chosen, 'redeemed', false);
END $$;
REVOKE ALL ON FUNCTION public.spin_wheel(text, text, jsonb, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spin_wheel(text, text, jsonb, int, int) TO service_role;