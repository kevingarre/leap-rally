-- ════════════════════════════════════════════════════════════
-- Migration 07: update_final_score RPC
-- Allows updating a score row after "keep playing" flow.
-- Only increases score (never decreases), anon-callable.
-- ════════════════════════════════════════════════════════════

create or replace function update_final_score(
  p_score_id      uuid,
  p_final_score   integer,
  p_level_reached integer default null,
  p_ghost_overtaken boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update scores
  set
    score           = greatest(score, p_final_score),
    level_reached   = coalesce(p_level_reached, level_reached),
    ghost_overtaken = coalesce(p_ghost_overtaken, ghost_overtaken)
  where id = p_score_id;
end;
$$;

-- Anon key can call this RPC
grant execute on function update_final_score(uuid, integer, integer, boolean) to anon;
