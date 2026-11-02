-- ============================================================================
-- Pruebas de las dos fechas que dicen desde cuándo algo está quieto
--
-- POR QUÉ EXISTEN
-- El panel de «lo que se ha quedado parado» cuenta días, y los cuenta desde
-- avisos.movido_el y avisos.estado_el. Esas dos fechas las sella un disparador
-- del servidor, así que si el disparador no hace lo que se cree, la pantalla
-- dice números inventados con toda la confianza del mundo.
--
-- Lo que se comprueba, uno a uno:
--   1. Al nacer, las dos fechas quedan puestas.
--   2. Cualquier cambio sella movido_el.
--   3. Un cambio que NO toca el estado deja estado_el como estaba. Esta es la
--      importante: si cada nota de oficina reseteara estado_el, un aviso
--      esperando repuesto desde marzo parecería recién cambiado.
--   4. Un cambio de estado sella estado_el.
--   5. El relleno de lo antiguo no se inventa fechas: usa la de cierre si está
--      cerrado y la de creación si no.
--   6. La vista avisos_parados cuenta desde el último rastro de vida, y el
--      parte de obra cuenta como rastro de vida.
-- ============================================================================

insert into public.clientes (id, nombre) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Cliente de lo parado')
  on conflict (id) do nothing;

delete from public.avisos where id in (
  'aaaaaaaa-0000-0000-0000-00000000000a',
  'aaaaaaaa-0000-0000-0000-00000000000b',
  'aaaaaaaa-0000-0000-0000-00000000000c');

do $$
declare
  m1 timestamptz; m2 timestamptz; m3 timestamptz;
  e1 timestamptz; e2 timestamptz; e3 timestamptz;
  q  timestamptz;
  mot text;
begin
  -- ---- 1. Al nacer, las dos fechas puestas -------------------------------
  insert into public.avisos (id, tipo, estado, cliente_id, descripcion)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'averia', 'recibido',
            'aaaaaaaa-0000-0000-0000-000000000001', 'La puerta no abre');
  select movido_el, estado_el into m1, e1 from public.avisos
   where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  if m1 is null or e1 is null then
    raise exception 'Un aviso nuevo tenía que nacer con las dos fechas puestas, y son % y %', m1, e1;
  end if;

  -- ---- 2 y 3. Un cambio que no toca el estado ----------------------------
  -- Se retrasan las dos fechas a mano para que el paso del tiempo se note sin
  -- tener que esperar de verdad.
  update public.avisos set movido_el = now() - interval '9 days',
                           estado_el = now() - interval '9 days'
   where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  update public.avisos set notas_oficina = 'Ha llamado el cliente otra vez'
   where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  select movido_el, estado_el into m2, e2 from public.avisos
   where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  if m2 < now() - interval '1 minute' then
    raise exception 'Tocar el aviso tenía que sellar movido_el, y sigue en %', m2;
  end if;
  if e2 > now() - interval '8 days' then
    raise exception 'Una nota de oficina NO cambia el estado, así que estado_el tenía que seguir hace nueve días, y está en %', e2;
  end if;

  -- ---- 4. Un cambio de estado sí sella estado_el -------------------------
  update public.avisos set estado = 'repuesto'
   where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  select estado_el into e3 from public.avisos
   where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  if e3 < now() - interval '1 minute' then
    raise exception 'Cambiar de estado tenía que sellar estado_el, y sigue en %', e3;
  end if;

  -- ---- 5. El relleno de lo antiguo no se inventa nada --------------------
  -- Un aviso viejo al que se le vacían las dos fechas, como los que ya estaban
  -- en la base el día que se ejecutó parado.sql.
  insert into public.avisos (id, tipo, estado, cliente_id, creado)
    values ('aaaaaaaa-0000-0000-0000-00000000000b', 'averia', 'recibido',
            'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '100 days');
  update public.avisos set movido_el = null, estado_el = null
   where id = 'aaaaaaaa-0000-0000-0000-00000000000b';
  -- el mismo relleno que hace parado.sql
  update public.avisos
     set movido_el = coalesce(movido_el, cerrado, creado),
         estado_el = coalesce(estado_el, cerrado, creado)
   where movido_el is null or estado_el is null;
  select movido_el into m3 from public.avisos
   where id = 'aaaaaaaa-0000-0000-0000-00000000000b';
  if m3 is null or m3 > now() - interval '99 days' then
    raise exception 'A un aviso antiguo el relleno tenía que ponerle su fecha de creación, hace 100 días, y le ha puesto %', m3;
  end if;

  -- ---- 6. La vista cuenta desde el último rastro de vida -----------------
  -- Una obra creada hace 40 días, con un parte de obra de hace 2: no está
  -- parada, está en marcha, y la vista tiene que decir eso.
  -- con técnico puesto: si no lo tuviera saldría como «sin asignar», que es lo
  -- primero que mira la vista, y con razón
  insert into public.avisos (id, tipo, estado, cliente_id, tecnico_id, creado, obra_larga)
    values ('aaaaaaaa-0000-0000-0000-00000000000c', 'instalacion', 'en_curso',
            'aaaaaaaa-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-0000000000f1', now() - interval '40 days', true);
  update public.avisos set movido_el = now() - interval '40 days',
                           estado_el = now() - interval '40 days'
   where id = 'aaaaaaaa-0000-0000-0000-00000000000c';
  insert into public.jornadas (aviso_id, fecha, horas, trabajo)
    values ('aaaaaaaa-0000-0000-0000-00000000000c', (current_date - 2), 6, 'Montado el marco');
  -- el parte se apunta hoy, así que su «creado» es de hoy: se retrasa para que
  -- la prueba mida el día TRABAJADO y no el día en que se escribió
  update public.jornadas set creado = now() - interval '2 days'
   where aviso_id = 'aaaaaaaa-0000-0000-0000-00000000000c';
  select quieto_desde, motivo into q, mot from public.avisos_parados
   where id = 'aaaaaaaa-0000-0000-0000-00000000000c';
  if q is null or q < now() - interval '3 days' then
    raise exception 'Una obra con un parte de hace dos días no lleva 40 días quieta: la vista dice %', q;
  end if;
  if mot is distinct from 'obra sin movimiento' then
    raise exception 'Una obra larga abierta y asignada tenía que salir como «obra sin movimiento», y sale como %', mot;
  end if;

  -- Y el que no tiene técnico sale como sin asignar, por delante de todo lo
  -- demás: un aviso sin dueño es el peor de los parados.
  select motivo into mot from public.avisos_parados
   where id = 'aaaaaaaa-0000-0000-0000-00000000000b';
  if mot is distinct from 'sin asignar' then
    raise exception 'Un aviso abierto sin técnico tenía que salir como «sin asignar», y sale como %', mot;
  end if;

  raise notice 'Las dos fechas se sellan solas: al nacer, al tocar el aviso y al cambiar de estado.';
  raise notice 'Una nota de oficina no rejuvenece un aviso que lleva nueve días en el mismo estado.';
  raise notice 'Lo antiguo se rellena con la fecha que de verdad hay, sin inventar.';
  raise notice 'La vista cuenta desde el último rastro de vida, y un parte de obra cuenta.';
  raise notice 'Un aviso abierto sin técnico sale como sin asignar.';
end $$;

-- Se deja la base como estaba, que estos avisos no son de nadie.
delete from public.jornadas where aviso_id = 'aaaaaaaa-0000-0000-0000-00000000000c';
delete from public.avisos where id in (
  'aaaaaaaa-0000-0000-0000-00000000000a',
  'aaaaaaaa-0000-0000-0000-00000000000b',
  'aaaaaaaa-0000-0000-0000-00000000000c');
delete from public.clientes where id = 'aaaaaaaa-0000-0000-0000-000000000001';
