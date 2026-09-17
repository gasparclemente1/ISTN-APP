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
   (select id from public.churches where record_id = 'source_record_001'));

insert into public.servos (id, full_name, gender, role, church_id) values
  ('00000000-0000-0000-0000-00000000005a', 'Servo Um', 'masculino', 'pastor',
   (select id from public.churches where record_id = 'source_record_001')),
  ('00000000-0000-0000-0000-00000000005b', 'Servo Dois', 'masculino', 'obreiro',
   (select id from public.churches where record_id = 'source_record_002')),
  ('00000000-0000-0000-0000-00000000005c', 'Servo Três', 'feminino', 'obreira',
   (select id from public.churches where record_id = 'source_record_002'));

insert into public.servo_contacts (servo_id, phone) values
  ('00000000-0000-0000-0000-00000000005a', '+244 900 000 001'),
  ('00000000-0000-0000-0000-00000000005b', '+244 900 000 002');

insert into public.app_users (id, display_name, phone, gender, claimed_role, home_church_id, servo_claim_status) values
  ('00000000-0000-0000-0000-0000000000a2', 'Pedido Obreiro', '+244 900 000 009', 'masculino', 'obreiro',
   (select id from public.churches where record_id = 'source_record_001'), 'pendente');

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
  if (select count(*) from public.churches) < 80 then
    raise exception 'FALHOU: o diretório público deixou de ver as igrejas';
  end if;
  if (select count(*) from public.church_services) = 0 then
    raise exception 'FALHOU: os horários de culto não foram migrados ou não são públicos';
  end if;
end $$;

do $$
declare changed integer;
begin
  update public.churches set locality = 'Alterado' where record_id = 'source_record_001';
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
  own uuid := (select id from public.churches where record_id = 'source_record_001');
  other uuid := (select id from public.churches where record_id = 'source_record_002');
  before_other integer := (select count(*) from public.church_services where church_id = (select id from public.churches where record_id = 'source_record_002'));
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
  if (select count(*) from public.church_services where church_id = (select id from public.churches where record_id = 'source_record_002')) = 0 then
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
    update public.churches set whatsapp_group_url = 'javascript:alert(1)' where record_id = 'source_record_001';
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
   (select id from public.churches where record_id = 'source_record_002')),
  ('00000000-0000-0000-0000-0000000000a4', 'Membro Comum', null, null, null, 'nenhum',
   (select id from public.churches where record_id = 'source_record_001'));

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
  outra uuid := (select id from public.churches where record_id = 'source_record_001');
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
  minha uuid := (select id from public.churches where record_id = 'source_record_001');
  outra uuid := (select id from public.churches where record_id = 'source_record_002');
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
