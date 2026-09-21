-- A página de uma pessoa: o que ela é na ISTN, e o que publicou.
--
-- Metade disto já existia sem dar por ela. Para um anúncio mostrar quem o
-- escreveu, a vista post_authors já dava nome, foto, função e selo de quem
-- publica ou comenta; a folha de «quem reagiu» passou a dar o mesmo. Faltava a
-- página — e faltava que os nomes que já aparecem levassem a algum lado.
--
-- Duas decisões, e as duas são de privacidade:
--
-- 1. A vista passa a incluir também quem apenas reagiu. Não é para dar perfil
--    a toda a gente: é porque o nome de quem reage já aparece na aplicação, e
--    um nome que se toca e não abre nada é uma porta pintada na parede.
--
-- 2. A vista ganha a igreja, e só de quem tem o selo. A igreja onde um servo
--    serve já é pública — está no diretório, ao lado do nome dele. A de um
--    membro não é, e continua a não ser: app_users fica fechada como estava, e
--    o que a página mostra é o que já era público em qualquer outro sítio.

begin;

-- Pelo mesmo motivo que em 009: a vista é substituída inteira, não remendada.
drop view if exists public.post_authors;
create view public.post_authors as
  select u.id,
         coalesce(nullif(btrim(u.display_name), ''), 'Sem nome') as display_name,
         u.photo_url,
         s.role as servo_role,
         (u.servo_claim_status = 'aprovado' and u.servo_id is not null) as verified,
         case when u.servo_claim_status = 'aprovado' and u.servo_id is not null then c.id end as church_id,
         case when u.servo_claim_status = 'aprovado' and u.servo_id is not null
              then coalesce(nullif(btrim(c.name), ''), nullif(btrim(c.locality), ''), c.country) end as church_name
    from public.app_users u
    left join public.servos s on s.id = u.servo_id
    left join public.churches c on c.id = s.church_id
   where exists (select 1 from public.posts p where p.author_id = u.id)
      or exists (select 1 from public.post_comments m where m.author_id = u.id)
      or exists (select 1 from public.post_reactions r where r.user_id = u.id);

grant select on public.post_authors to anon, authenticated;

commit;
