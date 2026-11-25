-- Public skill leaderboard: game-visible names, scores and AI labels only. No UUID/email/wallet.
create or replace function public.play80_tournament_public_leaderboard(p_tournament_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb;
begin
 if p_tournament_id is null or not exists (
   select 1 from public.tournaments t where t.id=p_tournament_id and t.status in ('registration_open','running','finished')
 ) then return '[]'::jsonb; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'rank',(item->>'rank')::integer,'username',left(coalesce(item->>'username','Player'),32),
 'type',item->>'type','avatar',item->>'avatar',
 'total_score',(item->>'total_score')::bigint,'games_played',(item->>'games_played')::integer,
 'maximum_rank_reward',(item->>'maximum_rank_reward')::integer
 ) order by (item->>'rank')::integer),'[]'::jsonb)
 into v
 from (select item from jsonb_array_elements(public.play80_tournament_leaderboard(p_tournament_id)) as a(item)
 limit 150) q;
 return v;
end $$;
revoke all on function public.play80_tournament_public_leaderboard(uuid) from public;
grant execute on function public.play80_tournament_public_leaderboard(uuid) to anon,authenticated;