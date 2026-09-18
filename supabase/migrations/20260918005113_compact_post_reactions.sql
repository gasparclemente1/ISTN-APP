-- Expand the existing constraint without rewriting or deleting reactions.
-- Deploy this migration before the frontend that offers the new options.
begin;
alter table public.post_reactions drop constraint if exists post_reactions_kind_check;
alter table public.post_reactions add constraint post_reactions_kind_check
  check (kind in ('amem', 'gosto', 'oracao', 'curtir', 'celebrar', 'emocionado', 'elias_deus'));
commit;
