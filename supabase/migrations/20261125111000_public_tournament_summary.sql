-- Only aggregate active tournament status (game, timing, player counts, announced prize).
-- No account data or wallet write is granted to unauthenticated callers.
grant execute on function public.play80_tournament_public() to anon;