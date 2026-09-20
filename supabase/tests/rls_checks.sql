-- Who can read and write what, checked as each kind of person. Every check
-- raises an exception starting with FALHOU when the database allows something
-- it should refuse, or refuses something it should allow.

-- ------------------------------------------------------------- fixtures ----

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'central@istn.test'),
  ('00000000-0000-0000-0000-0000000000e1', 'editor@istn.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'membro@istn.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'servo@istn.test');

insert into public.admin_profiles (id, full_name, role, church_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'Equipa central', 'central', null),
  ('00000000-0000-0000-0000-0000000000e1', 'Editor local', 'local',
   (select id from public.churches where record_id = 'ao-kifica'));

insert into public.servos (id, full_name, gender, role, church_id) values
  ('00000000-0000-0000-0000-00000000005a', 'Servo Um', 'masculino', 'pastor',
   (select id from public.churches where record_id = 'ao-kifica')),
  ('00000000-0000-0000-0000-00000000005b', 'Servo Dois', 'masculino', 'obreiro',
   (select id from public.churches where record_id = 'ao-estalagem')),
  ('00000000-0000-0000-0000-00000000005c', 'Servo Três', 'feminino', 'obreira',
   (select id from public.churches where record_id = 'ao-estalagem'));

insert into public.servo_contacts (servo_id, phone) values
  ('00000000-0000-0000-0000-00000000005a', '+244 900 000 001'),
  ('00000000-0000-0000-0000-00000000005b', '+244 900 000 002');

insert into public.app_users (id, display_name, phone, gender, claimed_role, home_church_id, servo_claim_status) values
  ('00000000-0000-0000-0000-0000000000a2', 'Pedido Obreiro', '+244 900 000 009', 'masculino', 'obreiro',
   (select id from public.churches where record_id = 'ao-kifica'), 'pendente');

-- The import turned the records announced once per service into one record
-- per place, and a second run of every migration changed nothing.
do $$
declare kifica public.churches := (select c from public.churches c where record_id = 'ao-kifica');
begin
  if (select count(*) from public.data_imports) <> 1 then
    raise exception 'FALHOU: a importação do diretório não ficou registada uma vez';
  end if;
  if exists (select 1 from public.churches where record_id like 'source\_record\_%' or record_id like 'online\_record\_%') then
    raise exception 'FALHOU: ficaram registos antigos por juntar';
  end if;
  if (select count(*) from public.churches) <> 73 then
    raise exception 'FALHOU: esperados 73 lugares, há %', (select count(*) from public.churches);
  end if;
  if not kifica.former_record_ids @> array['source_record_001', 'source_record_064'] then
    raise exception 'FALHOU: Kifica esqueceu os identificadores que tinha';
  end if;
  if kifica.address is null or kifica.seat <> 'mundial' then
    raise exception 'FALHOU: Kifica ficou sem morada ou sem a sede mundial';
  end if;
  if (select count(*) from public.church_services where church_id = kifica.id) <> 3 then
    raise exception 'FALHOU: Kifica devia ter os cultos de quinta, sábado e domingo';
  end if;
  if (select jsonb_array_length(other_leaders) from public.churches where record_id = 'br-alto-garcas') <> 1 then
    raise exception 'FALHOU: Alto Garças perdeu o segundo responsável';
  end if;
  if (select count(*) from public.churches where seat = 'mundial') <> 1 then
    raise exception 'FALHOU: tem de haver exatamente uma sede mundial';
  end if;
end $$;

-- ------------------------------------------------------------ anónimo ------

set role anon;
set request.jwt.claim.sub = '';

do $$ begin
  if (select count(*) from public.servo_contacts) > 0 then
    raise exception 'FALHOU: um visitante anónimo leu números que nenhum servo escolheu mostrar';
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'servos' and column_name = 'phone') then
    raise exception 'FALHOU: servos.phone continua a existir e a ser público';
  end if;

  if (select count(*) from public.servos) < 3 then
    raise exception 'FALHOU: o diretório público deixou de ver os servos';
  end if;
  if (select count(*) from public.churches) < 70 then
    raise exception 'FALHOU: o diretório público deixou de ver as igrejas';
  end if;
  if (select count(*) from public.church_services) = 0 then
    raise exception 'FALHOU: os horários de culto não foram migrados ou não são públicos';
  end if;
end $$;

do $$
declare changed integer;
begin
  update public.churches set locality = 'Alterado' where record_id = 'ao-kifica';
  get diagnostics changed = row_count;
  if changed > 0 then raise exception 'FALHOU: um visitante anónimo alterou uma igreja'; end if;
end $$;

reset role;

-- ------------------------------------------------------ membro com conta ---

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

do $$ begin
  if (select count(*) from public.servo_contacts) > 0 then
    raise exception 'FALHOU: um membro sem funções de equipa leu contactos de servos';
  end if;
end $$;

reset role;

-- -------------------------------------------------------- editor local -----

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';

do $$
declare
  own uuid := (select id from public.churches where record_id = 'ao-kifica');
  other uuid := (select id from public.churches where record_id = 'ao-estalagem');
  before_other integer := (select count(*) from public.church_services where church_id = (select id from public.churches where record_id = 'ao-estalagem'));
begin
  perform public.replace_church_services(own, '[{"weekday":0,"start_time":"09:00","label":null},{"weekday":6,"start_time":null,"label":"Culto dos servos"}]');
  if (select count(*) from public.church_services where church_id = own) <> 2 then
    raise exception 'FALHOU: o editor local não conseguiu substituir os horários da sua igreja';
  end if;

  -- Two identical rows: the call fails and the two saved above stay.
  begin
    perform public.replace_church_services(own, '[{"weekday":0,"start_time":"09:00"},{"weekday":0,"start_time":"09:00"}]');
    raise exception 'FALHOU: horários repetidos foram aceites';
  exception when unique_violation then null;
  end;
  if (select count(*) from public.church_services where church_id = own) <> 2 then
    raise exception 'FALHOU: uma gravação falhada apagou os horários que já existiam';
  end if;

  begin
    perform public.replace_church_services(other, '[{"weekday":0,"start_time":"10:00"}]');
    raise exception 'FALHOU: o editor local substituiu os horários de outra igreja';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';

do $$ begin
  if (select count(*) from public.servo_contacts) <> 1 then
    raise exception 'FALHOU: o editor local devia ver só o contacto do servo da sua igreja';
  end if;

  begin
    insert into public.servo_contacts (servo_id, phone)
    values ('00000000-0000-0000-0000-00000000005c', '+244 900 000 003');
    raise exception 'FALHOU: o editor local escreveu o contacto de um servo de outra igreja';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

do $$ begin
  if (select count(*) from public.church_services where church_id = (select id from public.churches where record_id = 'ao-estalagem')) = 0 then
    raise exception 'FALHOU: a tentativa recusada apagou os horários de outra igreja';
  end if;
end $$;

-- ------------------------------------------------------- equipa central ----

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

do $$
declare servant uuid;
begin
  if (select count(*) from public.servo_contacts) <> 2 then
    raise exception 'FALHOU: a equipa central devia ver todos os contactos';
  end if;

  servant := public.approve_servo_claim('00000000-0000-0000-0000-0000000000a2', null);
  if not exists (select 1 from public.servo_contacts where servo_id = servant and phone = '+244 900 000 009') then
    raise exception 'FALHOU: aprovar um pedido não guardou o telefone em servo_contacts';
  end if;

  begin
    update public.meetings set zoom_url = 'javascript:alert(1)' where kind = 'geral';
    raise exception 'FALHOU: a base de dados aceitou um link do Zoom que não é https';
  exception when check_violation then null;
  end;

  begin
    update public.churches set whatsapp_group_url = 'javascript:alert(1)' where record_id = 'ao-kifica';
    raise exception 'FALHOU: a base de dados aceitou um link de grupo que não é https';
  exception when check_violation then null;
  end;
end $$;

reset role;

-- ------------------------------------------ visibilidade do número do servo --

-- The central team may correct a number but not publish it.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  update public.servo_contacts set phone_public = true where servo_id = '00000000-0000-0000-0000-00000000005a';
  if (select phone_public from public.servo_contacts where servo_id = '00000000-0000-0000-0000-00000000005a') then
    raise exception 'FALHOU: a equipa central tornou público o número de um servo';
  end if;
  insert into public.servo_contacts (servo_id, phone, phone_public) values ('00000000-0000-0000-0000-00000000005c', '+244 900 000 003', true);
  if (select phone_public from public.servo_contacts where servo_id = '00000000-0000-0000-0000-00000000005c') then
    raise exception 'FALHOU: um número criado pela equipa nasceu público';
  end if;
end $$;
reset role;

-- A member who is not that servant cannot change it.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare changed integer;
begin
  update public.servo_contacts set phone_public = true;
  get diagnostics changed = row_count;
  if changed > 0 then raise exception 'FALHOU: um membro mudou a visibilidade do número de outra pessoa'; end if;
end $$;
reset role;

-- The approved servant chooses to show their number.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$
declare mine uuid := (select servo_id from public.app_users where id = '00000000-0000-0000-0000-0000000000a2');
begin
  update public.servo_contacts set phone_public = true where servo_id = mine;
  if not (select phone_public from public.servo_contacts where servo_id = mine) then
    raise exception 'FALHOU: o próprio servo não conseguiu tornar o seu número visível';
  end if;
end $$;
reset role;

set role anon;
set request.jwt.claim.sub = '';
do $$ begin
  if (select count(*) from public.servo_contacts) <> 1 or (select phone from public.servo_contacts) <> '+244 900 000 009' then
    raise exception 'FALHOU: o público devia ver só o número que o servo escolheu mostrar';
  end if;
end $$;
reset role;

-- If the team changes that number, it goes back to private.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$
declare mine uuid := (select servo_id from public.app_users where id = '00000000-0000-0000-0000-0000000000a2');
begin
  update public.servo_contacts set phone = '+244 900 000 010' where servo_id = mine;
  if (select phone_public from public.servo_contacts where servo_id = mine) then
    raise exception 'FALHOU: um número mudado pela equipa continuou público';
  end if;
end $$;
reset role;

-- ------------------------------------------------ anúncios e publicações ----

-- Fixtures: an approved servant who is not a minister, and one more member.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a3', 'obreira@istn.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'membro2@istn.test');
insert into public.app_users (id, display_name, gender, claimed_role, servo_id, servo_claim_status, home_church_id) values
  ('00000000-0000-0000-0000-0000000000a3', 'Servo Três', 'feminino', 'obreira',
   '00000000-0000-0000-0000-00000000005c', 'aprovado',
   (select id from public.churches where record_id = 'ao-estalagem')),
  ('00000000-0000-0000-0000-0000000000a4', 'Membro Comum', null, null, null, 'nenhum',
   (select id from public.churches where record_id = 'ao-kifica'));

-- A member with no right to publish cannot.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
do $$ begin
  begin
    insert into public.posts (body) values ('Um membro qualquer a anunciar');
    raise exception 'FALHOU: um membro sem direito publicou';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.app_users set publish_scope = 'global' where id = auth.uid();
    if (select publish_scope from public.app_users where id = auth.uid()) <> 'nenhum' then
      raise exception 'FALHOU: um membro deu-se a si próprio o direito de publicar';
    end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The central team publishes for the whole ISTN, and grants the right.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$
declare geral uuid;
begin
  insert into public.posts (body, title, highlighted) values ('Vigília de sexta às 20:00.', 'Vigília', true) returning id into geral;
  if (select author_id from public.posts where id = geral) <> '00000000-0000-0000-0000-0000000000c1' then
    raise exception 'FALHOU: o autor do anúncio não é quem o escreveu';
  end if;
  update public.app_users set publish_scope = 'igreja' where id = '00000000-0000-0000-0000-0000000000a3';
  if (select publish_scope from public.app_users where id = '00000000-0000-0000-0000-0000000000a3') <> 'igreja' then
    raise exception 'FALHOU: a equipa central não conseguiu atribuir o direito de publicar';
  end if;
end $$;
reset role;

-- The granted servant publishes for their own church and for no other.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$
declare
  minha uuid := (select home_church_id from public.app_users where id = auth.uid());
  outra uuid := (select id from public.churches where record_id = 'ao-kifica');
begin
  insert into public.posts (body, church_id) values ('Culto especial no sábado.', minha);
  begin
    insert into public.posts (body, church_id) values ('Anúncio noutra igreja', outra);
    raise exception 'FALHOU: publicou numa igreja que não é a sua';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.posts (body) values ('Anúncio para toda a ISTN');
    raise exception 'FALHOU: um direito de igreja permitiu publicar para toda a ISTN';
  exception when insufficient_privilege then null;
  end;

  -- A verified servant may comment.
  insert into public.post_comments (post_id, body)
  select id, 'Amém! Estaremos presentes.' from public.posts where title = 'Vigília';
  -- And react.
  insert into public.post_reactions (post_id, user_id, kind)
  select id, auth.uid(), 'amem' from public.posts where title = 'Vigília';
end $$;
reset role;

-- A member who is not a verified servant may react but not comment.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
do $$ begin
  insert into public.post_reactions (post_id, user_id)
  select id, auth.uid() from public.posts where title = 'Vigília';
  -- Every new picker option must persist, replace and preserve one-per-person.
  update public.post_reactions set kind = 'curtir' where user_id = auth.uid();
  update public.post_reactions set kind = 'gosto' where user_id = auth.uid();
  update public.post_reactions set kind = 'oracao' where user_id = auth.uid();
  update public.post_reactions set kind = 'celebrar' where user_id = auth.uid();
  update public.post_reactions set kind = 'emocionado' where user_id = auth.uid();
  update public.post_reactions set kind = 'elias_deus' where user_id = auth.uid();
  if (select count(*) from public.post_reactions where user_id = auth.uid() and kind = 'elias_deus') <> 1 then
    raise exception 'FALHOU: a reação especial não foi guardada';
  end if;
  begin
    update public.post_reactions set kind = 'invalida' where user_id = auth.uid();
    raise exception 'FALHOU: aceitou uma reação desconhecida';
  exception when check_violation then null;
  end;
  begin
    insert into public.post_comments (post_id, body)
    select id, 'Também quero comentar' from public.posts where title = 'Vigília';
    raise exception 'FALHOU: um membro sem selo de servo comentou';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.post_reactions (post_id, user_id)
    select id, '00000000-0000-0000-0000-0000000000a3' from public.posts where title = 'Vigília';
    raise exception 'FALHOU: reagiu em nome de outra pessoa';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Anyone reads what is published; nobody reads what was hidden.
set role anon;
set request.jwt.claim.sub = '';
do $$ begin
  if (select count(*) from public.posts) <> 2 then
    raise exception 'FALHOU: o público devia ver os dois anúncios publicados';
  end if;
  if (select count(*) from public.post_comments) <> 1 then
    raise exception 'FALHOU: o público devia ver o comentário';
  end if;
  if (select count(*) from public.post_reactions) <> 2 then
    raise exception 'FALHOU: as reações são contadas em público';
  end if;
  if (select count(*) from public.post_authors where verified) < 1 then
    raise exception 'FALHOU: a vista de autores devia dizer quem está verificado';
  end if;
  begin
    insert into public.posts (body) values ('Anúncio de um anónimo');
    raise exception 'FALHOU: um visitante anónimo publicou';
  -- Sem sessão não há autor, e é indiferente se a recusa vem da política ou da
  -- coluna: o anúncio não entra.
  exception when insufficient_privilege or not_null_violation then null;
  end;
end $$;
reset role;

-- Moderation: the central team hides a post, and the database records who did.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$
declare alvo uuid := (select id from public.posts where title = 'Vigília');
begin
  update public.posts set hidden = true where id = alvo;
  if (select hidden_by from public.posts where id = alvo) <> auth.uid() then
    raise exception 'FALHOU: esconder um anúncio não registou quem o fez';
  end if;
end $$;
reset role;

set role anon;
set request.jwt.claim.sub = '';
do $$ begin
  if (select count(*) from public.posts) <> 1 then
    raise exception 'FALHOU: um anúncio escondido continuou visível ao público';
  end if;
  if (select count(*) from public.post_comments) <> 0 then
    raise exception 'FALHOU: os comentários de um anúncio escondido continuaram visíveis';
  end if;
end $$;
reset role;

-- A equipa continua a ver o que escondeu, para o poder repor.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$
declare alvo uuid := (select id from public.posts where title = 'Vigília');
begin
  if alvo is null then
    raise exception 'FALHOU: a equipa deixou de ver o anúncio que escondeu';
  end if;
  update public.posts set hidden = false where id = alvo;
  if (select hidden_by from public.posts where id = alvo) is not null then
    raise exception 'FALHOU: repor um anúncio não limpou quem o tinha escondido';
  end if;
end $$;
reset role;

-- E o editor local esconde um comentário na publicação da sua igreja.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
do $$
declare
  minha uuid := (select id from public.churches where record_id = 'ao-kifica');
  outra uuid := (select id from public.churches where record_id = 'ao-estalagem');
begin
  begin
    update public.posts set hidden = true where church_id = outra;
    if exists (select 1 from public.posts where church_id = outra and hidden) then
      raise exception 'FALHOU: um editor local escondeu a publicação de outra igreja';
    end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ------------------------------------------- diretório da lista geral ----

-- Two records of one place become one, and nothing that pointed at the second
-- is lost: not a servant, a local editor, a member's church or an announcement.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'duplicado@istn.test');
insert into public.churches (record_id, modality, country_code, locality, address)
  values ('teste-a', 'physical', 'AO', 'Teste', null), ('teste-b', 'physical', 'AO', 'Teste', 'Rua do teste');
insert into public.servos (full_name, gender, role, church_id)
  values ('Servo do Duplicado', 'masculino', 'pastor', (select id from public.churches where record_id = 'teste-b'));
insert into public.admin_profiles (id, full_name, role, church_id)
  values ('00000000-0000-0000-0000-0000000000d1', 'Editor do duplicado', 'local', (select id from public.churches where record_id = 'teste-b'));
insert into public.app_users (id, display_name, home_church_id)
  values ('00000000-0000-0000-0000-0000000000d1', 'Membro do duplicado', (select id from public.churches where record_id = 'teste-b'));
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into public.posts (church_id, title, body)
  values ((select id from public.churches where record_id = 'teste-b'), 'Do duplicado', 'Anúncio de uma igreja duplicada');
set request.jwt.claim.sub = '';

do $$
declare
  a uuid := (select id from public.churches where record_id = 'teste-a');
  b uuid := (select id from public.churches where record_id = 'teste-b');
begin
  perform public.merge_church_into(a, b);
  if exists (select 1 from public.churches where id = b) then
    raise exception 'FALHOU: o registo duplicado não foi removido';
  end if;
  if (select church_id from public.servos where full_name = 'Servo do Duplicado') is distinct from a
     or (select church_id from public.admin_profiles where id = '00000000-0000-0000-0000-0000000000d1') is distinct from a
     or (select home_church_id from public.app_users where id = '00000000-0000-0000-0000-0000000000d1') is distinct from a then
    raise exception 'FALHOU: juntar dois registos deixou referências para trás';
  end if;
  if (select church_id from public.posts where title = 'Do duplicado') is distinct from a then
    raise exception 'FALHOU: juntar dois registos apagou ou esqueceu um anúncio';
  end if;
  if (select address from public.churches where id = a) is distinct from 'Rua do teste'
     or not (select former_record_ids from public.churches where id = a) @> array['teste-b'] then
    raise exception 'FALHOU: juntar dois registos perdeu o que a equipa escreveu no segundo';
  end if;
end $$;

delete from public.posts where title = 'Do duplicado';
delete from public.app_users where id = '00000000-0000-0000-0000-0000000000d1';
delete from public.admin_profiles where id = '00000000-0000-0000-0000-0000000000d1';
delete from public.servos where full_name = 'Servo do Duplicado';
delete from public.churches where record_id = 'teste-a';

-- Nobody reaches the merge through the API.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  begin
    perform public.merge_church_into(gen_random_uuid(), gen_random_uuid());
    raise exception 'FALHOU: juntar igrejas ficou acessível pela API';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The seat is the central team's: a local editor cannot give it to their own
-- church, not even by writing the column directly.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
do $$ begin
  update public.churches set seat = 'nacional', leader_name = 'Bp. Rufino Boaz' where record_id = 'ao-estalagem';
  update public.churches set seat = null where record_id = 'ao-kifica';
  if (select seat from public.churches where record_id = 'ao-kifica') is distinct from 'mundial' then
    raise exception 'FALHOU: um editor local tirou a sede mundial à sua igreja';
  end if;
  begin
    perform public.set_church_seat((select id from public.churches where record_id = 'ao-kifica'), null);
    raise exception 'FALHOU: um editor local usou set_church_seat';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
end $$;
reset role;

-- Giving a country's seat to another place takes it from the first, at once.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  perform public.set_church_seat((select id from public.churches where record_id = 'pt-caldas-da-rainha'), 'nacional');
  if (select seat from public.churches where record_id = 'pt-pontinha') is not null
     or (select seat from public.churches where record_id = 'pt-caldas-da-rainha') is distinct from 'nacional' then
    raise exception 'FALHOU: a sede nacional de Portugal não passou para Caldas da Rainha';
  end if;
  if (select count(*) from public.churches where seat = 'nacional') <> 7 then
    raise exception 'FALHOU: mudar a sede de um país mexeu nas dos outros';
  end if;
  perform public.set_church_seat((select id from public.churches where record_id = 'pt-pontinha'), 'nacional');
end $$;
reset role;

-- Full Admin saves must be all-or-nothing and keep local editors in scope.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
do $$
declare
  own uuid := (select id from public.churches where record_id = 'ao-kifica');
  other uuid := (select id from public.churches where record_id = 'ao-estalagem');
  denied boolean;
begin
  perform public.save_church(own, '{"name":"ISTN Esperança"}', '[{"weekday":0,"start_time":"10:00"}]');
  if (select name from public.churches where id=own) <> 'ISTN Esperança' then raise exception 'Nome não guardado'; end if;
  denied := false;
  begin
    perform public.save_church(own, '{"name":"Não guardar"}', '[{"weekday":8}]');
  exception when check_violation then denied := true; end;
  if not denied or (select name from public.churches where id=own) <> 'ISTN Esperança' then raise exception 'Gravação parcial'; end if;
  denied := false;
  begin
    perform public.save_church(other, '{"name":"Proibido"}', '[]');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Editor alterou outra igreja'; end if;
  denied := false;
  begin
    perform public.save_church(own, '{"name":"Proibido"}', '[]', true, 'mundial');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Editor alterou sede'; end if;
  perform public.save_church(own, '{"name":null}', '[]');
  if exists(select 1 from public.church_services where church_id=own)
    or exists(select 1 from public.churches where id=own and service_day is not null) then
    raise exception 'Horário antigo reapareceu'; end if;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
do $$
declare target uuid := (select id from public.churches where record_id='pt-caldas-da-rainha');
begin
  perform public.save_church(target, '{"name":"ISTN Caldas"}', '[{"weekday":0,"start_time":"09:00"}]', true, 'nacional');
  if not exists(select 1 from public.churches where id=target and name='ISTN Caldas' and seat='nacional') then
    raise exception 'Admin não guardou nome e sede'; end if;
  begin
    perform public.save_church(target, '{"name":"Não guardar"}', '[]', true, 'invalida');
  exception when raise_exception then null; end;
  if (select name from public.churches where id=target) <> 'ISTN Caldas'
    or not exists(select 1 from public.church_services where church_id=target) then
    raise exception 'Falha da sede não reverteu os dados e horários'; end if;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$
declare denied boolean := false;
begin
  begin
    perform public.save_church((select id from public.churches where record_id='ao-kifica'), '{"name":"Proibido"}', '[]');
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Conta sem perfil Admin acedeu à gravação'; end if;
end $$;
reset role;
