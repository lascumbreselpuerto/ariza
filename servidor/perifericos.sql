-- ============================================================================
-- ARIZA SAT · Los trabajos que no son una puerta entera:
--             periféricos, sustitución de motor, sustitución de central, otros
--
-- POR QUÉ
-- David, 06-11-2026, revisando la creación de asistencias en campo, sobre la
-- instalación:
--
--   · «Periféricos tipo fotocélula sincronizada, fotocélula compacta, banda de
--     seguridad, etc.»
--   · «Sustitución de motor.»
--   · «Sustitución de central.»
--   · «Otros, dejando abierto un lugar donde oficina escriba.»
--
-- Hasta hoy la instalación solo tenía cinco subtipos, todos de puerta entera o
-- de automatismo. La visita que iba a poner una fotocélula tenía que elegir
-- «puerta completa» o «automatismo», y ninguna de las dos era verdad. Eso
-- ensucia el histórico y hace imposible contar cuántas de esas visitas se hacen
-- al año, que es lo que dice qué merece la pena tener en el almacén.
--
-- Los cuatro subtipos nuevos están en AVERÍA y en INSTALACIÓN (decisión de
-- David, 06-11-2026): un motor quemado se atiende como avería y uno que se
-- cambia por mejora como instalación, y el trabajo es el mismo. El tipo sigue
-- decidiendo cómo se factura; el subtipo solo dice qué se hizo.
--
-- QUÉ AÑADE
--   · avisos.perifericos       qué se monta, varios a la vez
--   · avisos.perifericos_otro  el texto de «otro periférico»
--   · avisos.subtipo_detalle   lo que la oficina escribe en «otros trabajos»
--
-- POR QUÉ perifericos es text[] y no una columna de texto suelta
-- En una visita se montan a menudo dos fotocélulas y una banda. Con un solo
-- hueco de texto, la mitad del trabajo se quedaría sin apuntar o escrito de
-- cualquier manera, y la cuenta de qué periférico se pone más no se podría
-- hacer. Como lista, se cuenta con un desglose de una línea.
--
-- QUÉ NO HACE
--   · No toca valorar_aviso ni ningún importe: estos trabajos se cobran como
--     siempre, por su tipo, sus horas y sus materiales.
--   · No cambia nada de lo ya guardado. Las asistencias de antes del 06-11-2026
--     se quedan con sus columnas vacías, que es lo que les corresponde.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- Hace falta subtipo.sql ejecutado antes.
-- ============================================================================

-- 1. Los cuatro subtipos nuevos, admitidos en la base
-- subtipo.sql puso un check con la lista cerrada de subtipos. Sin ampliarlo, la
-- aplicación los ofrecería y el guardado fallaría. Se tira y se vuelve a poner
-- con la lista completa: así ejecutar esto dos veces deja el mismo resultado,
-- que es lo que no haría un «if not exists» (dejaría el viejo intacto).
alter table public.avisos drop constraint if exists avisos_subtipo_valido;
alter table public.avisos
  add constraint avisos_subtipo_valido
  check (subtipo is null or subtipo in (
    'averia','garantia',
    'puerta_automatica','puerta_manual','puerta_peatonal',
    'automatismo','normativa',
    -- desde el 06-11-2026, en avería y en instalación
    'perifericos','sust_motor','sust_central','otros'));

-- 2. Qué se monta
alter table public.avisos add column if not exists perifericos text[];
alter table public.avisos add column if not exists perifericos_otro text;
alter table public.avisos add column if not exists subtipo_detalle text;

comment on column public.avisos.perifericos is
  'En el subtipo «perifericos», qué elementos se montan en esta visita. Varios a '
  'la vez, porque lo normal es montar dos fotocélulas y una banda en el mismo '
  'viaje. De aquí sale la cuenta de qué periférico se pone más.';
comment on column public.avisos.perifericos_otro is
  'Qué es ese «otro periférico» que no está en la lista. Obligatorio en la '
  'aplicación cuando se marca «otro»: «otro» sin explicación no dice nada a '
  'nadie dentro de seis meses.';
comment on column public.avisos.subtipo_detalle is
  'Lo que la oficina escribe cuando el subtipo es «otros trabajos». Es la '
  'salida para lo que no entra en ninguna de las opciones, no un cajón de '
  'sastre: si un trabajo se repite aquí, merece su propio subtipo.';

-- La lista cerrada de periféricos, la misma que la aplicación enseña. Va aquí
-- también para que una carga de datos a mano o desde otro sitio no pueda meter
-- una clave que la aplicación luego no sepa nombrar.
--
-- Si algún día se añade un periférico a la lista de la aplicación, hay que
-- añadirlo también a este check, o el guardado fallará. Es a propósito: más
-- vale que falle el guardado del que añade la clave que descubrir medio año
-- después que había visitas con un periférico que nadie sabe cuál era.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_perifericos_validos') then
    alter table public.avisos
      add constraint avisos_perifericos_validos check (
        perifericos is null or (
          -- el coalesce no es adorno: array_length de una lista vacía devuelve
          -- NULL, y un check que da NULL se considera cumplido. Sin él, una
          -- lista vacía entraba, y una visita de periféricos sin ninguno es
          -- exactamente lo que esto tiene que impedir.
          coalesce(array_length(perifericos, 1), 0) between 1 and 16
          and perifericos <@ array[
            'foto_sinc','foto_comp','barrera','radar',
            'banda','banda_cuadro','limitador',
            'bucle','lector','mandos','columna',
            'semaforo','destellante','senal','paro',
            'otro']::text[]
        )
      );
  end if;
end $$;

-- 3. Las dos reglas que la aplicación ya exige, también en la base
-- Si «otro» está marcado, su texto hace falta; y el detalle de «otros trabajos»
-- no puede estar vacío. Las pantallas lo piden, pero una asistencia creada
-- desde otro sitio se colaría, y lo que entra sin explicación se queda sin
-- explicación para siempre.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_perif_otro_explicado') then
    alter table public.avisos
      add constraint avisos_perif_otro_explicado check (
        perifericos is null
        or not ('otro' = any(perifericos))
        or coalesce(btrim(perifericos_otro), '') <> ''
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'avisos_otros_explicado') then
    alter table public.avisos
      add constraint avisos_otros_explicado check (
        subtipo is distinct from 'otros'
        or coalesce(btrim(subtipo_detalle), '') <> ''
      );
  end if;
end $$;

-- 4. Qué periférico se monta más
-- Una fila por periférico, con cuántas visitas lo llevaron y cuándo fue la
-- última. Es la cuenta que dice qué merece la pena tener en la furgoneta y qué
-- se pide al proveedor cuando toca.
create or replace view public.perifericos_mas_montados as
  select k as periferico,
         count(*) as visitas,
         count(*) filter (where a.tipo = 'averia') as como_averia,
         count(*) filter (where a.tipo = 'instalacion') as como_instalacion,
         max(a.cerrado) as ultima
    from public.avisos a
         cross join lateral unnest(a.perifericos) as k
   where a.perifericos is not null
     and a.anulada is not true
   group by k
   order by count(*) desc, k;

comment on view public.perifericos_mas_montados is
  'Cuántas visitas montaron cada periférico, separando las que fueron avería de '
  'las que fueron instalación. Para decidir qué tener en el almacén y en la '
  'furgoneta.';

-- 5. Las visitas de «otros trabajos», para vaciar el cajón
-- Si el mismo trabajo aparece aquí tres veces, deja de ser una excepción y
-- merece su propio subtipo. Esta lista es la que permite verlo.
create or replace view public.otros_trabajos as
  select a.id, a.tipo, a.cliente_id, a.puerta_id, a.tecnico_id,
         a.creado, a.cerrado, a.subtipo_detalle
    from public.avisos a
   where a.subtipo = 'otros'
     and a.anulada is not true
   order by a.creado desc;

comment on view public.otros_trabajos is
  'Las visitas registradas como «otros trabajos», con lo que escribió la '
  'oficina. Si un trabajo se repite aquí, merece su propio subtipo en vez de '
  'seguir en el cajón.';

-- ============================================================================
-- Comprobación rápida:
--
--   select column_name from information_schema.columns
--    where table_name = 'avisos'
--      and column_name in ('perifericos','perifericos_otro','subtipo_detalle');
--   select * from public.perifericos_mas_montados;
--   select * from public.otros_trabajos;
-- ============================================================================
