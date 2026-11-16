-- ============================================================================
-- ARIZA SAT · Los almacenes de ficheros, y quién entra en cada uno
--
-- POR QUÉ EXISTE ESTE FICHERO
-- Al preparar un segundo proyecto de Supabase para pruebas (14-11-2026)
-- apareció esto: la aplicación usa SIETE almacenes de ficheros y el SQL solo
-- creaba uno, «ofertas», dentro de anexos.sql. Los otros seis se crearon a
-- mano en su día, pinchando en el panel de Supabase.
--
-- Eso tiene dos consecuencias feas:
--   1. Montar un proyecto nuevo no es «ejecutar los SQL»: hay seis almacenes
--      que hay que acordarse de crear a mano, con sus permisos. Y lo que se
--      hace a mano se hace mal un día.
--   2. Y no falla al instalar: falla semanas después, la primera vez que
--      alguien sube una foto. Que es la peor manera de fallar.
--
-- Aquí quedan los siete, con sus permisos, de una vez y por escrito.
--
-- QUÉ ES PÚBLICO Y QUÉ NO, Y POR QUÉ
-- Un almacén público es el que se puede abrir con un enlace, sin haber entrado
-- en la aplicación. Solo lo son los dos que el CLIENTE tiene que poder abrir:
--
--   · publicos → los documentos que ve al escanear el QR de su puerta: el
--                desbloqueo de emergencia y las instrucciones de uso. Si no
--                fuera público, el QR no serviría para nada.
--   · ofertas  → los presupuestos que se mandan por enlace.
--
-- TODO LO DEMÁS ES PRIVADO, y se abre con enlaces firmados que caducan. Ahí
-- viven las fotos de las puertas de los clientes, sus documentos, los
-- expedientes y LAS FIRMAS DE LOS PARTES. Nada de eso puede quedar colgando de
-- una dirección que cualquiera pueda adivinar.
--
-- SE PUEDE EJECUTAR DOS VECES SIN HACER DAÑO.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Los siete almacenes
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('fotos',       'fotos',       false),   -- fotos de puertas y de visitas
  ('documentos',  'documentos',  false),   -- documentación interna de la puerta
  ('expedientes', 'expedientes', false),   -- lo que cuelga de un expediente
  ('firmas',      'firmas',      false),   -- firmas de partes y contratos
  ('equipo',      'equipo',      false),   -- fotos del equipo
  ('publicos',    'publicos',    true),    -- lo que ve el cliente al escanear
  ('ofertas',     'ofertas',     true)     -- presupuestos enviados por enlace
on conflict (id) do update set public = excluded.public;

-- ---------------------------------------------------------------------------
-- 2. Quién puede hacer qué
--
-- Las políticas van por almacén y no todas juntas, para que se pueda leer de
-- un vistazo quién entra dónde. Las de «ofertas» ya las creaba anexos.sql con
-- estos mismos nombres: se vuelven a crear igual y no pasa nada.
-- ---------------------------------------------------------------------------

-- ---- Los privados: solo quien ha entrado en la aplicación ----
do $$
declare b text;
begin
  foreach b in array array['fotos','documentos','expedientes','firmas','equipo'] loop
    execute format('drop policy if exists %I on storage.objects', b||' lectura');
    execute format('drop policy if exists %I on storage.objects', b||' escritura');
    execute format('drop policy if exists %I on storage.objects', b||' borrado');

    /* Leer: solo autenticados. Los enlaces firmados que reparte la aplicación
       salen de aquí, y caducan solos. */
    execute format(
      'create policy %I on storage.objects for select to authenticated using (bucket_id = %L)',
      b||' lectura', b);
    execute format(
      'create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L)',
      b||' escritura', b);
    execute format(
      'create policy %I on storage.objects for delete to authenticated using (bucket_id = %L)',
      b||' borrado', b);
  end loop;
end $$;

-- ---- Los públicos: cualquiera los LEE, solo el equipo los ESCRIBE ----
-- Que se puedan leer sin entrar es justo lo que se quiere: el cliente escanea
-- el QR de su puerta y abre el desbloqueo de emergencia. Lo que no puede es
-- subir nada, ni borrar.
do $$
declare b text;
begin
  foreach b in array array['publicos','ofertas'] loop
    execute format('drop policy if exists %I on storage.objects', b||' lectura');
    execute format('drop policy if exists %I on storage.objects', b||' escritura');
    execute format('drop policy if exists %I on storage.objects', b||' borrado');

    execute format(
      'create policy %I on storage.objects for select to anon, authenticated using (bucket_id = %L)',
      b||' lectura', b);
    execute format(
      'create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L)',
      b||' escritura', b);
    execute format(
      'create policy %I on storage.objects for delete to authenticated using (bucket_id = %L)',
      b||' borrado', b);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Comprobación
--
-- Al terminar, esto tiene que devolver los siete almacenes, con «publico» en
-- true SOLO en «publicos» y «ofertas», y tres políticas cada uno.
-- ---------------------------------------------------------------------------
select
  b.id                                   as almacen,
  b.public                               as publico,
  (select count(*) from pg_policies p
    where p.schemaname = 'storage' and p.tablename = 'objects'
      and p.policyname like b.id || ' %')  as politicas
from storage.buckets b
where b.id in ('fotos','documentos','expedientes','firmas','equipo','publicos','ofertas')
order by b.public desc, b.id;
