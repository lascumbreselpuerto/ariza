-- ============================================================================
-- ARIZA SAT · UN DÍA DE EJEMPLO, PARA LOS MANUALES
--
--        ESTO VA EN EL PROYECTO DE PRUEBAS. EN EL BUENO NO.
--
-- QUÉ HACE
-- Siembra una jornada inventada de un técnico, para poder hacer las capturas
-- de pantalla de los manuales con la aplicación de verdad, y con datos que se
-- lean bien, en vez de pantallas vacías.
--
-- Lo que crea:
--   · Dos clientes:  Comunidad Las Flores  y  Talleres Guadalete
--   · Dos puertas:   AR-9001 (corredera)   y  AR-9002 (seccional)
--   · Los componentes montados en la primera
--   · Dos visitas para HOY, a nombre del técnico de pruebas
--   · Una conversación en la primera visita
--   · Una furgoneta con material dentro, y material en la nave
--
-- NADA DE ESTO EXISTE. Son nombres inventados a propósito, para que los
-- manuales se puedan repartir sin que salga ni un cliente de verdad.
--
-- ANTES DE EJECUTARLO HACE FALTA
-- Solo una cosa: que exista el usuario  tecnico@prueba.es  en Authentication
-- -> Users, con «Auto Confirm User» marcado. No hace falta haber entrado con
-- él: si le falta la ficha del equipo, este fichero se la crea. Si el usuario
-- no existe, se para y te lo dice.
--
-- SE PUEDE EJECUTAR DOS VECES. La segunda no duplica nada. Y si lo lanzas otro
-- día, mueve las dos visitas al día que sea, para que sigan saliendo en «Hoy».
--
-- VALORES COMPROBADOS CONTRA LA APLICACIÓN (19-11-2026)
-- Los estados, tipos, usos, orígenes y motivos de aquí no son inventados: están
-- sacados de las listas del propio index.html. Si se pone otra palabra, la fila
-- entra igual (la base no lo impide) pero la pantalla la enseña en crudo, y una
-- captura con un dato en crudo enseña un fallo que no existe.
-- ============================================================================

do $$
declare
  v_tec   uuid;
  v_cli1  uuid;
  v_cli2  uuid;
  v_pue1  uuid;
  v_pue2  uuid;
  v_furgo uuid;
  v_nave  uuid;
  v_av1   uuid;
  -- ---- Hoy, pero el de El Puerto, no el del servidor ----
  -- Supabase corre en UTC. A las once de la noche en España allí todavía es
  -- el día anterior, así que current_date sembraba las visitas con fecha de
  -- AYER y «Mi trabajo» las enseñaba en «Se pasaron de fecha» en vez de en
  -- «Hoy». Lo encontró David el 19-11-2026, mirando la pantalla, cuando
  -- llevábamos un rato dándole vueltas a por qué no salían. (19-11-2026)
  v_hoy   date := (now() at time zone 'Europe/Madrid')::date;
begin
  -- ---- El técnico de pruebas ----
  -- Basta con que exista la credencial. La ficha del equipo la crea la
  -- aplicación la primera vez que alguien entra, pero si ese alta falla, la
  -- aplicación sigue con una ficha que solo existe en la memoria del navegador
  -- y no avisa de nada: se entra, se ve todo normal, y en la base no hay nada.
  -- Así que aquí no se da por hecho: si la ficha falta, se crea. (19-11-2026)
  select u.id into v_tec
    from auth.users u
   where lower(u.email) = 'tecnico@prueba.es';

  if v_tec is null then
    raise exception E'\n\nNo encuentro al usuario del técnico de pruebas.\n'
      'Antes de ejecutar esto hay que crear el usuario  tecnico@prueba.es\n'
      'en Authentication -> Users, con «Auto Confirm User» marcado.\n'
      'Y entonces volver aquí.\n';
  end if;

  insert into public.perfiles (id, nombre, rol, activo)
  select v_tec, 'Dani Ruiz', 'tecnico', true
   where not exists (select 1 from public.perfiles where id = v_tec);

  update public.perfiles set nombre = 'Dani Ruiz', rol = 'tecnico', activo = true
   where id = v_tec;

  -- ---- Los dos clientes ----
  -- «tipo» sale de la lista CLIENTES de la aplicación.
  insert into public.clientes (nombre, direccion, poblacion, telefono, tipo)
  select 'Comunidad Las Flores', 'Avenida de la Bajamar 14', 'El Puerto de Santa María',
         '600 00 00 01', 'Comunidad'
   where not exists (select 1 from public.clientes where nombre = 'Comunidad Las Flores');
  select id into v_cli1 from public.clientes where nombre = 'Comunidad Las Flores' limit 1;

  insert into public.clientes (nombre, direccion, poblacion, telefono, tipo)
  select 'Talleres Guadalete', 'Polígono El Palmar, nave 7', 'El Puerto de Santa María',
         '600 00 00 02', 'Industria'
   where not exists (select 1 from public.clientes where nombre = 'Talleres Guadalete');
  select id into v_cli2 from public.clientes where nombre = 'Talleres Guadalete' limit 1;

  -- ---- Las etiquetas de esas dos puertas ----
  -- El código de una puerta cuelga de la tabla de etiquetas, así que primero la
  -- etiqueta. Se usan números altos, de la AR-9001 en adelante, para no pisar la
  -- serie de verdad que genera la aplicación.
  insert into public.etiquetas (codigo, token) values ('AR-9001', 'K7M2')
    on conflict (codigo) do nothing;
  insert into public.etiquetas (codigo, token) values ('AR-9002', 'P4XQ')
    on conflict (codigo) do nothing;

  -- ---- Las dos puertas ----
  -- «tipo» sale de TIPOS, «uso» de USOS y «estado» de ESTADOS. Los campos motor
  -- y cuadro llevan «marca modelo» pegado, que es como los escribe la propia
  -- aplicación cuando se da de alta el componente.
  insert into public.puertas (codigo, cliente_id, cliente, direccion, ubicacion,
                              tipo, uso, tipo_cliente, marca, modelo, motor, cuadro,
                              anio, estado, seguridad, periodicidad_meses)
  select 'AR-9001', v_cli1, 'Comunidad Las Flores', 'Avenida de la Bajamar 14',
         'Rampa del garaje', 'Corredera autoportante', 'Residencial', 'Comunidad',
         'Erreka', 'Rino 4', 'Erreka Rino 4', 'Erreka Vivo-D102',
         2019, 'operativa', '{Fotocélulas,Desbloqueo manual}'::text[], 12
   where not exists (select 1 from public.puertas where codigo = 'AR-9001');
  select id into v_pue1 from public.puertas where codigo = 'AR-9001' limit 1;

  insert into public.puertas (codigo, cliente_id, cliente, direccion, ubicacion,
                              tipo, uso, tipo_cliente, marca, modelo,
                              anio, estado, periodicidad_meses)
  select 'AR-9002', v_cli2, 'Talleres Guadalete', 'Polígono El Palmar, nave 7',
         'Muelle 2', 'Seccional', 'Industrial', 'Industria',
         'Hörmann', 'SPU F42', 2021, 'operativa', 6
   where not exists (select 1 from public.puertas where codigo = 'AR-9002');
  select id into v_pue2 from public.puertas where codigo = 'AR-9002' limit 1;

  -- ---- Lo que lleva montado la puerta de la avería ----
  -- Las claves (motor, cuadro, fotocelulas) son las de la aplicación.
  insert into public.componentes (puerta_id, clave, nombre, marca, modelo, num_serie, creado_por)
  select v_pue1, 'motor', 'Automatismo o motorreductor', 'Erreka', 'Rino 4', 'RN4-88213', 'ejemplo'
   where not exists (select 1 from public.componentes where puerta_id = v_pue1 and clave = 'motor');
  insert into public.componentes (puerta_id, clave, nombre, marca, modelo, num_serie, creado_por)
  select v_pue1, 'cuadro', 'Cuadro de maniobra', 'Erreka', 'Vivo-D102', 'VD-41002', 'ejemplo'
   where not exists (select 1 from public.componentes where puerta_id = v_pue1 and clave = 'cuadro');
  insert into public.componentes (puerta_id, clave, nombre, marca, modelo, creado_por)
  select v_pue1, 'fotocelulas', 'Fotocélulas', 'Erreka', 'Reflex', 'ejemplo'
   where not exists (select 1 from public.componentes where puerta_id = v_pue1 and clave = 'fotocelulas');

  -- ---- La furgoneta del técnico, y la nave ----
  select id into v_nave from public.ubicaciones where tipo = 'nave' order by creado limit 1;

  insert into public.ubicaciones (nombre, tipo, perfil_id, creado_por)
  select 'Furgo 1', 'furgoneta', v_tec, 'ejemplo'
   where not exists (select 1 from public.ubicaciones where nombre = 'Furgo 1');
  select id into v_furgo from public.ubicaciones where nombre = 'Furgo 1' limit 1;

  -- ---- Material de catálogo ----
  insert into public.articulos (descripcion, referencia, marca, familia, unidad, coste)
  select 'Fotocélula espejo 20 m', 'FT-20', 'Erreka', 'Seguridad', 'ud', 28.40
   where not exists (select 1 from public.articulos where referencia = 'FT-20');
  insert into public.articulos (descripcion, referencia, marca, familia, unidad, coste)
  select 'Mando 4 canales 433 MHz', 'MD-4C', 'Erreka', 'Mandos', 'ud', 12.60
   where not exists (select 1 from public.articulos where referencia = 'MD-4C');
  insert into public.articulos (descripcion, referencia, marca, familia, unidad, coste)
  select 'Muelle torsión 2,5 mm', 'MT-25', 'Hörmann', 'Mecánica', 'ud', 41.90
   where not exists (select 1 from public.articulos where referencia = 'MT-25');

  -- ---- Y ese material, repartido ----
  -- Una entrada de compra es «hasta» sin «desde», con motivo «compra», que es
  -- exactamente lo que escribe la aplicación en una entrada.
  insert into public.movimientos_material (articulo_id, cantidad, hasta, motivo, nota, creado_por)
  select a.id, 2, v_furgo, 'compra', 'ejemplo para el manual', 'ejemplo'
    from public.articulos a
   where a.referencia = 'FT-20'
     and not exists (select 1 from public.movimientos_material m
                      where m.articulo_id = a.id and m.hasta = v_furgo);
  insert into public.movimientos_material (articulo_id, cantidad, hasta, motivo, nota, creado_por)
  select a.id, 5, v_furgo, 'compra', 'ejemplo para el manual', 'ejemplo'
    from public.articulos a
   where a.referencia = 'MD-4C'
     and not exists (select 1 from public.movimientos_material m
                      where m.articulo_id = a.id and m.hasta = v_furgo);
  insert into public.movimientos_material (articulo_id, cantidad, hasta, motivo, nota, creado_por)
  select a.id, 8, v_nave, 'compra', 'ejemplo para el manual', 'ejemplo'
    from public.articulos a
   where a.referencia = 'MT-25' and v_nave is not null
     and not exists (select 1 from public.movimientos_material m
                      where m.articulo_id = a.id and m.hasta = v_nave);

  -- ---- Las dos visitas de hoy ----
  -- «Mi trabajo» enseña lo que no está cerrado ni archivado, es del técnico que
  -- ha entrado, y lleva la fecha de hoy. Eso es lo que se siembra aquí.
  insert into public.avisos (tipo, subtipo, estado, prioridad, tecnico_id, tecnico,
                             cliente_id, puerta_id, descripcion, notas_oficina,
                             contacto_nombre, contacto_telefono, fecha_prevista, origen)
  select 'averia', 'averia', 'asignado', 'normal', v_tec, 'Dani Ruiz',
         v_cli1, v_pue1,
         'La puerta no cierra del todo y hace ruido al bajar. Llaman del portal, '||
           'dicen que lleva así dos días.',
         'Entrar por la rampa. El portero tiene la llave del cuarto de contadores.',
         'Rosa, la presidenta', '600 00 00 01', v_hoy, 'Teléfono'
   where not exists (select 1 from public.avisos where puerta_id = v_pue1);
  select id into v_av1 from public.avisos where puerta_id = v_pue1 limit 1;

  insert into public.avisos (tipo, estado, prioridad, tecnico_id, tecnico,
                             cliente_id, puerta_id, descripcion, fecha_prevista, origen)
  select 'mantenimiento', 'asignado', 'normal', v_tec, 'Dani Ruiz',
         v_cli2, v_pue2, 'Revisión semestral de la seccional del muelle 2.',
         v_hoy, 'Interno'
   where not exists (select 1 from public.avisos where puerta_id = v_pue2);

  -- Si el fichero se lanza otro día, las visitas se mueven a hoy. Así las
  -- capturas siempre salen en el bloque «Hoy» y no en «Se pasaron de fecha».
  -- Y se reabren, por si se cerró alguna haciendo pruebas: una visita cerrada
  -- desaparece de «Mi trabajo» y deja la pantalla vacía.
  update public.avisos
     set fecha_prevista = v_hoy, cerrado = null, estado = 'asignado'
   where puerta_id in (v_pue1, v_pue2);

  -- ---- Una conversación, para la pantalla del hilo ----
  insert into public.mensajes (aviso_id, puerta_id, texto, fijado, quien)
  select v_av1, v_pue1,
         'El cuadro es el viejo, no el que pone la ficha. Lo cambiaron el año pasado.',
         true, 'Christian, oficina'
   where not exists (select 1 from public.mensajes where aviso_id = v_av1);

  insert into public.mensajes (aviso_id, puerta_id, texto, fijado, perfil_id, quien)
  select v_av1, v_pue1, 'Voy de camino, llego sobre las 10.',
         false, v_tec, 'Dani Ruiz'
   where not exists (select 1 from public.mensajes
                      where aviso_id = v_av1 and perfil_id = v_tec);

  raise notice 'Listo. Dos clientes, dos puertas y dos visitas para hoy, a nombre de Dani Ruiz.';
end $$;


-- ---- Comprobación ----
select 'clientes'       as cosa, count(*) as cuantos from public.clientes
union all select 'puertas',        count(*) from public.puertas
union all select 'componentes',    count(*) from public.componentes
union all select 'material',       count(*) from public.articulos
union all select 'movimientos',    count(*) from public.movimientos_material
union all select 'mensajes',       count(*) from public.mensajes
union all select 'visitas de hoy', count(*) from public.avisos
   where fecha_prevista = (now() at time zone 'Europe/Madrid')::date
order by 1;


-- ============================================================================
-- PARA DESHACERLO
--
-- Cuando los manuales estén hechos y quieras dejar la base de pruebas vacía
-- otra vez, quita los guiones de las líneas de abajo y ejecútalas.
-- ============================================================================
-- delete from public.mensajes;
-- delete from public.movimientos_material;
-- delete from public.avisos;
-- delete from public.componentes;
-- delete from public.puertas    where codigo in ('AR-9001','AR-9002');
-- delete from public.etiquetas  where codigo in ('AR-9001','AR-9002');
-- delete from public.clientes   where nombre in ('Comunidad Las Flores','Talleres Guadalete');
-- delete from public.articulos  where referencia in ('FT-20','MD-4C','MT-25');
-- delete from public.ubicaciones where nombre = 'Furgo 1';
