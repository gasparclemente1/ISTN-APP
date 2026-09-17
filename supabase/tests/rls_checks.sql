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
  begin
    perform 1 from public.servo_contacts;
    raise exception 'FALHOU: um visitante anónimo leu servo_contacts';
  exception when insufficient_privilege then null;
  end;

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
