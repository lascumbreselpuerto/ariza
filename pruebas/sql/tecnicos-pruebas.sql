-- ============================================================================
-- Pruebas de los varios técnicos en una asistencia
--
-- POR QUÉ EXISTEN
-- Este cambio toca la asignación, que es lo que decide a quién le sale el
-- trabajo en la pantalla. Hay tres maneras de hacerlo mal y las tres se notan
-- el mismo día:
--
--   · que al volcar lo que ya estaba cargado se pierda una asignación, y un
--     técnico llegue por la mañana sin su trabajo;
--   · que el principal deje de contar como asignado, porque la pantalla mira
--     la tabla nueva y el de siempre está solo en avisos.tecnico_id;
--   · que el mismo técnico salga dos veces, porque está en los dos sitios.
--
-- Las tres están probadas aquí.
--
-- Y una cuarta, que es de las que no se ven hasta que pasan: que al quitarle
-- el acceso a alguien queden asignaciones apuntando a una ficha que ya no
-- existe.
-- ============================================================================

insert into public.clientes (id, nombre) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'Cliente de los tecnicos')
  on conflict (id) do nothing;

-- Tres fichas de equipo. Van en auth.users primero porque perfiles las exige.
insert into auth.users (id, email) values
  ('eeeeeeee-1111-0000-0000-000000000001','tec1@prueba.es'),
  ('eeeeeeee-1111-0000-0000-000000000002','tec2@prueba.es'),
  ('eeeeeeee-1111-0000-0000-000000000003','tec3@prueba.es')
  on conflict (id) do nothing;

insert into public.perfiles (id, nombre, rol, activo) values
  ('eeeeeeee-1111-0000-0000-000000000001','Tecnico Uno','tecnico',true),
  ('eeeeeeee-1111-0000-0000-000000000002','Tecnico Dos','tecnico',true),
  ('eeeeeeee-1111-0000-0000-000000000003','Tecnico Tres','tecnico',true)
  on conflict (id) do nothing;

delete from public.aviso_tecnicos where aviso_id::text like 'eeeeeeee-2222-%';
delete from public.avisos         where id::text      like 'eeeeeeee-2222-%';

do $$
declare
  n int;
  v_quien uuid;
begin
  -- ---- 1. Lo que ya estaba cargado no se pierde --------------------------
  -- Una asistencia como las de hoy: con técnico en la columna de siempre y
  -- sin ninguna fila en la tabla nueva. Es el caso de la instalación que
  -- David dejó cargada la víspera.
  insert into public.avisos (id, tipo, estado, cliente_id, tecnico_id)
  values ('eeeeeeee-2222-0000-0000-000000000001','instalacion','asignado',
          'eeeeeeee-0000-0000-0000-000000000001','eeeeeeee-1111-0000-0000-000000000001');

  select count(*) into n from public.tecnicos_de_aviso('eeeeeeee-2222-0000-0000-000000000001');
  if n <> 1 then
    raise exception 'Una asistencia de las de antes tiene que seguir con su tecnico, y salen %', n;
  end if;
  select * into v_quien from public.tecnicos_de_aviso('eeeeeeee-2222-0000-0000-000000000001');
  if v_quien <> 'eeeeeeee-1111-0000-0000-000000000001' then
    raise exception 'Y tiene que ser EL SUYO, no otro';
  end if;
  raise notice 'lo que ya estaba asignado sigue asignado, sin tocar nada';

  -- ---- 2. El volcado no duplica al principal -----------------------------
  -- Es lo que hace el final de tecnicos.sql. Se lanza aquí a mano para
  -- comprobar que, pasándolo dos veces, el tecnico no sale dos veces.
  insert into public.aviso_tecnicos (aviso_id, tecnico_id)
  select a.id, a.tecnico_id from public.avisos a
   where a.id = 'eeeeeeee-2222-0000-0000-000000000001' and a.tecnico_id is not null
  on conflict (aviso_id, tecnico_id) do nothing;

  insert into public.aviso_tecnicos (aviso_id, tecnico_id)
  select a.id, a.tecnico_id from public.avisos a
   where a.id = 'eeeeeeee-2222-0000-0000-000000000001' and a.tecnico_id is not null
  on conflict (aviso_id, tecnico_id) do nothing;

  select count(*) into n from public.tecnicos_de_aviso('eeeeeeee-2222-0000-0000-000000000001');
  if n <> 1 then
    raise exception 'El principal esta en los dos sitios y tiene que contar UNA vez, y cuenta %', n;
  end if;
  raise notice 'el principal cuenta una vez aunque este en los dos sitios, y el volcado se puede relanzar';

  -- ---- 3. Dos técnicos de verdad -----------------------------------------
  insert into public.aviso_tecnicos (aviso_id, tecnico_id) values
    ('eeeeeeee-2222-0000-0000-000000000001','eeeeeeee-1111-0000-0000-000000000002');

  select count(*) into n from public.tecnicos_de_aviso('eeeeeeee-2222-0000-0000-000000000001');
  if n <> 2 then raise exception 'Tenian que salir dos asignados y salen %', n; end if;

  -- y al segundo le tiene que salir en SU lista
  select count(*) into n from public.avisos a
   where a.id = 'eeeeeeee-2222-0000-0000-000000000001'
     and 'eeeeeeee-1111-0000-0000-000000000002' in
         (select public.tecnicos_de_aviso(a.id));
  if n <> 1 then raise exception 'Al segundo tecnico no le sale el trabajo en su pantalla'; end if;
  raise notice 'dos asignados, y al segundo le sale el trabajo en su pantalla';

  -- ---- 4. Uno que no esta asignado, no lo esta ---------------------------
  select count(*) into n from public.tecnicos_de_aviso('eeeeeeee-2222-0000-0000-000000000001') t
   where t = 'eeeeeeee-1111-0000-0000-000000000003';
  if n <> 0 then raise exception 'Un tecnico sin asignar no puede aparecer como asignado'; end if;
  raise notice 'el que no esta asignado no sale';

  -- ---- 5. Una asistencia sin nadie ---------------------------------------
  insert into public.avisos (id, tipo, estado, cliente_id)
  values ('eeeeeeee-2222-0000-0000-000000000002','averia','nuevo',
          'eeeeeeee-0000-0000-0000-000000000001');
  select count(*) into n from public.tecnicos_de_aviso('eeeeeeee-2222-0000-0000-000000000002');
  if n <> 0 then raise exception 'Una asistencia sin asignar tiene que dar cero y da %', n; end if;
  raise notice 'una asistencia sin asignar da cero, no da error';

  -- ---- 6. El dueño del parte ---------------------------------------------
  update public.avisos set parte_lo_lleva = 'eeeeeeee-1111-0000-0000-000000000001',
                           parte_lo_lleva_desde = now()
   where id = 'eeeeeeee-2222-0000-0000-000000000001';
  select parte_lo_lleva into v_quien from public.avisos
   where id = 'eeeeeeee-2222-0000-0000-000000000001';
  if v_quien <> 'eeeeeeee-1111-0000-0000-000000000001' then
    raise exception 'El parte tenia que quedar a nombre del primero';
  end if;

  -- y el segundo lo abre: pasa a llevarlo el
  update public.avisos set parte_lo_lleva = 'eeeeeeee-1111-0000-0000-000000000002',
                           parte_lo_lleva_desde = now()
   where id = 'eeeeeeee-2222-0000-0000-000000000001';
  select parte_lo_lleva into v_quien from public.avisos
   where id = 'eeeeeeee-2222-0000-0000-000000000001';
  if v_quien <> 'eeeeeeee-1111-0000-0000-000000000002' then
    raise exception 'Abrir el parte es cogerlo, y no ha cambiado de dueño';
  end if;
  raise notice 'el parte cambia de dueno cuando lo abre otro de los asignados';

  -- ---- 7. Quitarle el acceso a alguien no deja basura --------------------
  -- Si se borra la ficha del equipo, sus asignaciones se van con ella. Si
  -- no, quedarian filas apuntando a nadie y la pantalla intentaria pintar
  -- el nombre de un tecnico que ya no existe.
  delete from public.perfiles where id = 'eeeeeeee-1111-0000-0000-000000000002';
  select count(*) into n from public.aviso_tecnicos
   where tecnico_id = 'eeeeeeee-1111-0000-0000-000000000002';
  if n <> 0 then
    raise exception 'Al borrar la ficha de un tecnico tienen que irse sus asignaciones, y quedan %', n;
  end if;
  select count(*) into n from public.tecnicos_de_aviso('eeeeeeee-2222-0000-0000-000000000001');
  if n <> 1 then
    raise exception 'Quitado uno, tenia que quedar el otro asignado, y quedan %', n;
  end if;
  raise notice 'quitarle el acceso a un tecnico se lleva sus asignaciones y deja las de los demas';

  -- ---- 8. Y borrar la asistencia se lleva sus asignaciones ---------------
  delete from public.avisos where id = 'eeeeeeee-2222-0000-0000-000000000001';
  select count(*) into n from public.aviso_tecnicos
   where aviso_id = 'eeeeeeee-2222-0000-0000-000000000001';
  if n <> 0 then raise exception 'Borrada la asistencia, no pueden quedar asignaciones sueltas'; end if;
  raise notice 'borrada la asistencia, sus asignaciones se van con ella';
end $$;
