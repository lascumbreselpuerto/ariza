-- ================================================================
-- ARIZA SAT · REVISIÓN DE ARRANQUE
--
-- QUÉ ES ESTO
-- Una radiografía de la base antes de empezar a usarla de verdad. No
-- cambia nada: son consultas de lectura. Se puede ejecutar las veces
-- que haga falta, a cualquier hora y con gente dentro de la
-- aplicación, sin riesgo.
--
-- PARA QUÉ SIRVE
-- La aplicación arranca aunque falten cosas. Si no hay tarifas, no se
-- queja: valora a cero. Si no hay etiquetas generadas, el alta de una
-- puerta se queda a medias. Si falta un cubo de ficheros, la foto que
-- sube el técnico se pierde sin avisar. Todo eso se ve aquí de un
-- vistazo, antes de que lo descubra un cliente delante.
--
-- CÓMO SE LEE
-- Tres estados, y solo uno exige parar:
--
--   FALTA     no está puesto y hace falta para trabajar.
--   REVISAR   está puesto pero con pinta de a medias o de valor
--             por defecto sin tocar.
--   LISTO     puesto y con sentido.
--   (aviso)   información, no un problema.
--
-- La columna «dónde se arregla» dice la pantalla exacta.
--
-- 22-11-2026
-- ================================================================

with t as (
  select * from public.tarifas order by id limit 1
),
rutas as (
  select count(*) filter (where nom is not null and btrim(nom) <> '' and coalesce(imp,0) > 0) as puestas,
         count(*) filter (where nom is not null and btrim(nom) <> '' and coalesce(cos,0) > 0) as con_coste
    from (
      select (select ruta1_nombre from t) as nom, (select ruta1_importe from t) as imp, (select ruta1_coste from t) as cos
      union all select (select ruta2_nombre from t), (select ruta2_importe from t), (select ruta2_coste from t)
      union all select (select ruta3_nombre from t), (select ruta3_importe from t), (select ruta3_coste from t)
      union all select (select ruta4_nombre from t), (select ruta4_importe from t), (select ruta4_coste from t)
      union all select (select ruta5_nombre from t), (select ruta5_importe from t), (select ruta5_coste from t)
    ) r
),
cubos as (
  select x as nombre, exists (select 1 from storage.buckets b where b.id = x) as hay
    from unnest(array['fotos','firmas','expedientes','ofertas','equipo','documentos']) as x
)

select orden as "#", que as "qué se revisa", estado as "cómo está",
       detalle as "lo que hay", donde as "dónde se arregla"
from (

-- ---- 1. Lo que decide lo que se cobra -------------------------------
select 10 as orden, 'Tarifas · mano de obra' as que,
  case when (select count(*) from t) = 0 then 'FALTA'
       when coalesce((select precio_hora from t),0) <= 0
         or coalesce((select coste_hora from t),0) <= 0 then 'FALTA'
       when (select precio_hora from t) <= (select coste_hora from t) then 'REVISAR'
       when btrim(coalesce((select actualizado_por from t),'')) = '' then 'REVISAR'
       else 'LISTO' end as estado,
  case when (select count(*) from t) = 0
         then 'no hay ninguna fila de tarifas: todas las visitas valdrían 0 €'
       when btrim(coalesce((select actualizado_por from t),'')) = ''
         then 'siguen los valores con los que viene el instalador (' ||
              to_char((select precio_hora from t),'FM999990.00') || ' €/h y ' ||
              to_char((select coste_hora from t),'FM999990.00') ||
              ' €/h de coste): nadie las ha guardado todavía desde la aplicación. ' ||
              'Hay que entrar, poner tus números y guardar aunque sea una vez'
       else 'se cobra ' || to_char((select precio_hora from t),'FM999990.00') ||
            ' €/h y cuesta ' || to_char((select coste_hora from t),'FM999990.00') ||
            ' €/h · mínimo ' || to_char(coalesce((select minimo_horas from t),0),'FM999990.00') ||
            ' h · guardadas por ' || (select actualizado_por from t) ||
            ' el ' || to_char((select actualizado from t) at time zone 'Europe/Madrid','DD-MM-YYYY') end as detalle,
  'Ajustes → Tarifas' as donde

union all
select 11, 'Tarifas · por tipo de cliente',
  case when (select count(*) from t) = 0 then 'FALTA'
       when coalesce((select precio_hora_particular from t),0) > 0
         and coalesce((select precio_hora_retail from t),0) > 0
         and coalesce((select precio_hora_industria from t),0) > 0 then 'LISTO'
       else '(aviso)' end,
  case when (select count(*) from t) = 0 then 'sin fila de tarifas'
       when coalesce((select precio_hora_particular from t),0) = 0
        and coalesce((select precio_hora_retail from t),0) = 0
        and coalesce((select precio_hora_industria from t),0) = 0
         then 'sin precios por tipo: todos pagan el precio general, que es correcto si así lo quieres'
       else 'particular ' || coalesce(to_char((select precio_hora_particular from t),'FM999990.00'),'—') ||
            ' · comercio ' || coalesce(to_char((select precio_hora_retail from t),'FM999990.00'),'—') ||
            ' · industria ' || coalesce(to_char((select precio_hora_industria from t),'FM999990.00'),'—') end,
  'Ajustes → Tarifas'

union all
select 12, 'Tarifas · desplazamiento',
  case when (select count(*) from t) = 0 then 'FALTA'
       when coalesce((select desplazamiento_fijo from t),0) <= 0
        and coalesce((select precio_km from t),0) <= 0 then 'FALTA'
       else 'LISTO' end,
  case when (select count(*) from t) = 0 then 'sin fila de tarifas'
       else 'fijo ' || to_char(coalesce((select desplazamiento_fijo from t),0),'FM999990.00') ||
            ' € · km a ' || to_char(coalesce((select precio_km from t),0),'FM999990.00') ||
            ' € (cuesta ' || to_char(coalesce((select coste_km from t),0),'FM999990.00') || ')' ||
            case when btrim(coalesce((select actualizado_por from t),'')) = '' then ' · valor del instalador, sin tocar' else '' end end,
  'Ajustes → Tarifas'

union all
select 13, 'Las cinco rutas',
  case when (select puestas from rutas) = 0 then 'FALTA'
       when (select con_coste from rutas) < (select puestas from rutas) then 'REVISAR'
       else 'LISTO' end,
  case when (select puestas from rutas) = 0
         then 'ninguna ruta con nombre e importe: el desplazamiento irá siempre por el fijo'
       when (select con_coste from rutas) < (select puestas from rutas)
         then 'con importe: ' || (select puestas from rutas) || ', pero con coste solo ' ||
              (select con_coste from rutas) || ': el margen de esas visitas saldrá inflado'
       else 'rutas con importe y coste: ' || (select puestas from rutas) end,
  'Ajustes → Tarifas'

union all
select 14, 'Recargo de urgencia',
  case when (select count(*) from t) = 0 then 'FALTA'
       when coalesce((select urgencia_x_laboral from t),0) > 0
        and coalesce((select urgencia_x_fuera from t),0) > 0 then 'LISTO'
       else 'REVISAR' end,
  case when (select count(*) from t) = 0 then 'sin fila de tarifas'
       else 'en jornada x' || coalesce(to_char((select urgencia_x_laboral from t),'FM990.00'),'—') ||
            ' · fuera de jornada x' || coalesce(to_char((select urgencia_x_fuera from t),'FM990.00'),'—') ||
            ' · jornada de ' || coalesce((select urgencia_desde from t)::text,'—') ||
            ' a ' || coalesce((select urgencia_hasta from t)::text,'—') || ' h' end,
  'Ajustes → Tarifas'

union all
select 15, 'IVA',
  case when coalesce((select iva from t),0) > 0 then 'LISTO' else 'FALTA' end,
  coalesce(to_char((select iva from t),'FM990.00') || ' %', 'sin poner') ||
  case when btrim(coalesce((select actualizado_por from t),'')) = '' then ' · valor del instalador, sin tocar' else '' end,
  'Ajustes → Tarifas'

union all
select 16, 'Recargo del material',
  case when coalesce((select recargo_material from t),0) > 0 then 'LISTO' else 'REVISAR' end,
  coalesce(to_char((select recargo_material from t),'FM990.00'),'0') ||
  ' % sobre el coste del material' ||
  case when btrim(coalesce((select actualizado_por from t),'')) = '' then ' · valor del instalador, sin tocar' else '' end,
  'Ajustes → Tarifas'

-- ---- 2. Quién entra y con qué papel ---------------------------------
union all
select 20, 'El equipo',
  case when (select count(*) from public.perfiles where activo) = 0 then 'FALTA'
       when (select count(*) from public.perfiles where activo and rol = 'admin') = 0 then 'REVISAR'
       else 'LISTO' end,
  coalesce((select string_agg(
              case rol when 'admin' then 'administrador'
                       when 'oficina' then 'oficina'
                       when 'tecnico' then 'técnico'
                       else rol end || ': ' || n, ' · ' order by rol)
              from (select rol, count(*) as n from public.perfiles
                     where activo group by rol) q), 'nadie dado de alta'),
  'Oficina → Equipo'

union all
-- Cómo sale escrito cada uno en los partes que firma el cliente. La base no
-- deja guardar un nombre vacío, así que lo que se busca aquí es otra cosa: el
-- nombre de una sola palabra, que casi siempre es el correo sin el dominio
-- («arizapuertasautomaticas»), porque es lo que pone la aplicación cuando se
-- crea la ficha sola. Es una pista, no una certeza: hay nombres de una palabra
-- que están bien puestos.
select 21, 'Cómo sale el nombre en los partes',
  case when (select count(*) from public.perfiles where activo) = 0 then '(aviso)'
       when (select count(*) from public.perfiles
              where activo and btrim(coalesce(nombre,'')) not like '% %') = 0 then 'LISTO' else 'REVISAR' end,
  case when (select count(*) from public.perfiles where activo) = 0 then 'todavía no hay nadie'
       when (select count(*) from public.perfiles
              where activo and btrim(coalesce(nombre,'')) not like '% %') = 0
         then 'todos con nombre y apellido'
       else 'de una sola palabra: ' ||
            (select string_agg(btrim(nombre), ', ' order by nombre) from public.perfiles
              where activo and btrim(coalesce(nombre,'')) not like '% %') ||
            ' · así es como saldrá en el parte que firma el cliente' end,
  'Oficina → Equipo → Cambiar el nombre'

-- ---- 3. Las etiquetas, que son lo que hace falta para dar de alta ---
union all
select 30, 'Etiquetas generadas',
  case when (select count(*) from public.etiquetas) = 0 then 'FALTA'
       when (select count(*) from public.etiquetas e
              where not exists (select 1 from public.puertas p
                                 where lower(btrim(coalesce(p.codigo,''))) = lower(btrim(e.codigo)))) < 10
         then 'REVISAR'
       else 'LISTO' end,
  'en total: ' || (select count(*) from public.etiquetas) || ' · libres, sin puerta detrás: ' ||
  (select count(*) from public.etiquetas e
    where not exists (select 1 from public.puertas p
                       where lower(btrim(coalesce(p.codigo,''))) = lower(btrim(e.codigo)))),
  'Oficina → Etiquetas → Generar serie'

-- ---- 4. Los cubos de ficheros ---------------------------------------
union all
select 40, 'Cubos de ficheros',
  case when (select count(*) from cubos where not hay) = 0 then 'LISTO' else 'FALTA' end,
  case when (select count(*) from cubos where not hay) = 0
         then 'los seis están: ' || (select string_agg(nombre, ', ' order by nombre) from cubos)
       else 'faltan ' || (select string_agg(nombre, ', ' order by nombre) from cubos where not hay) ||
            ': lo que se suba ahí se perderá sin avisar' end,
  'Supabase → Storage → New bucket (privado)'

union all
select 41, 'Permisos de los cubos',
  case when (select count(*) from cubos c where c.hay and not exists (
               select 1 from pg_policies p
                where p.schemaname = 'storage' and p.tablename = 'objects'
                  and coalesce(p.qual,'') || coalesce(p.with_check,'') like '%' || c.nombre || '%')) = 0
       then 'LISTO' else 'FALTA' end,
  coalesce('sin ninguna regla de acceso: ' || (select string_agg(c.nombre, ', ' order by c.nombre)
     from cubos c where c.hay and not exists (
       select 1 from pg_policies p
        where p.schemaname = 'storage' and p.tablename = 'objects'
          and coalesce(p.qual,'') || coalesce(p.with_check,'') like '%' || c.nombre || '%')),
   'todos los cubos tienen sus reglas'),
  'SQL: las políticas de storage de cada entrega'

-- ---- 5. El catálogo y el almacén ------------------------------------
union all
select 50, 'Almacenes y furgonetas',
  case when (select count(*) from public.ubicaciones where activo) = 0 then 'REVISAR' else 'LISTO' end,
  coalesce((select string_agg(nombre, ' · ' order by coalesce(orden, 99), nombre)
              from public.ubicaciones where activo), 'ninguno: el material no tendrá sitio donde estar'),
  'Oficina → Almacén → Sitios'

union all
select 51, 'Catálogo de material',
  case when (select count(*) from public.articulos where activo) = 0 then 'REVISAR' else 'LISTO' end,
  'artículos activos: ' || (select count(*) from public.articulos where activo) ||
  ' · con coste puesto: ' || (select count(*) from public.articulos where activo and coalesce(coste,0) > 0),
  'Oficina → Almacén → Material'

-- ---- 6. Lo que todavía está vacío y toca cargar ---------------------
union all
select 60, 'Clientes',
  case when (select count(*) from public.clientes where not archivado) = 0 then 'FALTA' else 'LISTO' end,
  'clientes: ' || (select count(*) from public.clientes where not archivado) ||
  ' · con ruta asignada: ' ||
  (select count(*) from public.clientes where not archivado and btrim(coalesce(ruta,'')) <> ''),
  'Oficina → Importar → Clientes'

union all
select 61, 'Puertas',
  case when (select count(*) from public.puertas) = 0 then 'FALTA' else 'LISTO' end,
  'puertas: ' || (select count(*) from public.puertas) ||
  ' · colgadas de su cliente: ' || (select count(*) from public.puertas where cliente_id is not null) ||
  ' · con etiqueta: ' || (select count(*) from public.puertas where btrim(coalesce(codigo,'')) <> ''),
  'Oficina → Importar → Puertas'

union all
select 62, 'Puertas sin cliente',
  case when (select count(*) from public.puertas) = 0 then '(aviso)'
       when (select count(*) from public.puertas where cliente_id is null) = 0 then 'LISTO' else 'REVISAR' end,
  case when (select count(*) from public.puertas) = 0 then 'todavía no hay puertas'
       when (select count(*) from public.puertas where cliente_id is null) = 0
         then 'todas las puertas cuelgan de un cliente'
       else 'sin cliente: ' || (select count(*) from public.puertas where cliente_id is null) ||
            ' · esas no salen al buscar por cliente' end,
  'Oficina → Puertas → abrir la ficha'

union all
select 63, 'Mantenimientos programados',
  case when (select count(*) from public.puertas
              where not sin_mantenimiento and proxima_revision is not null) = 0
       then '(aviso)' else 'LISTO' end,
  'con próxima revisión: ' ||
  (select count(*) from public.puertas where not sin_mantenimiento and proxima_revision is not null) ||
  ' · ya pasadas de fecha: ' ||
  (select count(*) from public.puertas where not sin_mantenimiento
     and proxima_revision is not null
     and proxima_revision < (now() at time zone 'Europe/Madrid')::date),
  'Oficina → Preventivo'

-- ---- 7. Lo de la casa: datos, logo y avisos -------------------------
union all
select 70, 'Datos de la empresa',
  case when exists (select 1 from public.ajustes where clave = 'empresa') then 'LISTO' else '(aviso)' end,
  case when exists (select 1 from public.ajustes where clave = 'empresa')
         then 'guardados a mano: ' || coalesce((select valor->>'razon_social' from public.ajustes
                                                 where clave = 'empresa'), 'sin razón social')
       else 'sin guardar: los documentos usan los datos que lleva la aplicación dentro ' ||
            '(Ariza Puertas y Automatismos S.L.U., B72004849, Calle Orilla 19). ' ||
            'Solo hay que tocarlo si algo de eso ha cambiado' end,
  'Ajustes → Empresa'

union all
select 71, 'Logo en los documentos',
  case when btrim(coalesce((select valor->>'logo' from public.ajustes where clave = 'marca'),'')) <> ''
       then 'LISTO' else 'REVISAR' end,
  case when btrim(coalesce((select valor->>'logo' from public.ajustes where clave = 'marca'),'')) <> ''
         then 'cargado · ' ||
              coalesce(jsonb_array_length((select valor->'sellos' from public.ajustes where clave = 'marca')), 0) ||
              ' sellos'
       else 'sin logo: los presupuestos saldrán con el nombre escrito a pelo' end,
  'Ajustes → Marca'

union all
select 72, 'Avisos al grupo de la oficina',
  case when exists (select 1 from public.config_interna where clave = 'avisos_url')
        and exists (select 1 from public.config_interna where clave = 'avisos_secreto')
       then 'LISTO' else '(aviso)' end,
  case when exists (select 1 from public.config_interna where clave = 'avisos_url')
        and exists (select 1 from public.config_interna where clave = 'avisos_secreto')
         then 'configurados: cuando un técnico cierra una visita, salta el aviso'
       else 'sin configurar: nadie recibirá el aviso de una visita cerrada. ' ||
            'No impide trabajar' end,
  'SQL: servidor/telegram.sql'

union all
select 73, 'Teléfono de avisos',
  case when btrim(coalesce((select valor #>> '{}' from public.ajustes where clave = 'telefono_avisos'),'')) <> ''
       then 'LISTO' else '(aviso)' end,
  coalesce(nullif(btrim((select valor #>> '{}' from public.ajustes where clave = 'telefono_avisos')), ''),
           'sin poner: es el número que ve el cliente en el parte'),
  'Ajustes → Avisos'

-- ---- 8. Y lo que ya se ha trabajado ---------------------------------
union all
select 80, 'Visitas en la base',
  '(aviso)',
  'en total: ' || (select count(*) from public.avisos) ||
  ' · abiertas: ' || (select count(*) from public.avisos where cerrado is null) ||
  ' · cerradas: ' || (select count(*) from public.avisos where cerrado is not null),
  '—'

union all
select 81, 'Pendiente de valorar',
  case when (select count(*) from public.avisos a
              where a.cerrado is not null
                and not exists (select 1 from public.valoraciones v where v.aviso_id = a.id)) = 0
       then 'LISTO' else 'REVISAR' end,
  'visitas cerradas sin valoración: ' || (select count(*) from public.avisos a
    where a.cerrado is not null
      and not exists (select 1 from public.valoraciones v where v.aviso_id = a.id)),
  'Oficina → Gestión'

) todo
order by orden;
