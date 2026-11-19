-- ============================================================================
-- ARIZA SAT · LIMPIEZA · PASO 1 DE 2 · MIRAR
--
-- ESTO NO BORRA NADA. Solo enseña, fila por fila, qué se borraría y qué se
-- quedaría si ejecutaras el paso 2.
--
-- Se ejecuta antes. Siempre. Un borrado en la base que lleva la empresa no se
-- lanza a ciegas, y menos uno que no tiene vuelta atrás.
--
-- Léelo, comprueba que los números cuadran con lo que esperas, y solo
-- entonces pasa al fichero limpiar-2-borrar.sql.
-- ============================================================================

select
  caso,
  tabla,
  filas,
  case caso when 'SE BORRA' then 'desaparece' else 'no se toca' end as que_pasa
from (

  -- ---- LO QUE SE QUEDA ----
  -- La configuración de la empresa, el equipo y las etiquetas.
  select 'SE QUEDA' as caso, 'ajustes'        as tabla, count(*) as filas from public.ajustes
  union all select 'SE QUEDA', 'tarifas',        count(*) from public.tarifas
  union all select 'SE QUEDA', 'perfiles',       count(*) from public.perfiles
  union all select 'SE QUEDA', 'ubicaciones',    count(*) from public.ubicaciones
  union all select 'SE QUEDA', 'config_interna', count(*) from public.config_interna
  union all select 'SE QUEDA', 'etiquetas',      count(*) from public.etiquetas
  union all select 'SE QUEDA', 'textos_presu',   count(*) from public.textos_presu

  -- ---- LO QUE SE BORRA ----
  union all select 'SE BORRA', 'avisos',               count(*) from public.avisos
  union all select 'SE BORRA', 'aviso_puertas',        count(*) from public.aviso_puertas
  union all select 'SE BORRA', 'valoraciones',         count(*) from public.valoraciones
  union all select 'SE BORRA', 'materiales',           count(*) from public.materiales
  union all select 'SE BORRA', 'materiales_previstos', count(*) from public.materiales_previstos
  union all select 'SE BORRA', 'jornadas',             count(*) from public.jornadas
  union all select 'SE BORRA', 'entregas_obra',        count(*) from public.entregas_obra
  union all select 'SE BORRA', 'revisiones',           count(*) from public.revisiones
  union all select 'SE BORRA', 'conformidad_visita',   count(*) from public.conformidad_visita
  union all select 'SE BORRA', 'mensajes',             count(*) from public.mensajes
  union all select 'SE BORRA', 'medidas',              count(*) from public.medidas
  union all select 'SE BORRA', 'componentes',          count(*) from public.componentes
  union all select 'SE BORRA', 'fotos',                count(*) from public.fotos
  union all select 'SE BORRA', 'documentos',           count(*) from public.documentos
  union all select 'SE BORRA', 'expedientes',          count(*) from public.expedientes
  union all select 'SE BORRA', 'expediente_fotos',     count(*) from public.expediente_fotos
  union all select 'SE BORRA', 'expediente_docs',      count(*) from public.expediente_docs
  union all select 'SE BORRA', 'puertas',              count(*) from public.puertas
  union all select 'SE BORRA', 'centros',              count(*) from public.centros
  union all select 'SE BORRA', 'contactos',            count(*) from public.contactos
  union all select 'SE BORRA', 'clientes',             count(*) from public.clientes
  union all select 'SE BORRA', 'contratos',            count(*) from public.contratos
  union all select 'SE BORRA', 'contrato_puertas',     count(*) from public.contrato_puertas
  union all select 'SE BORRA', 'presupuestos',         count(*) from public.presupuestos
  union all select 'SE BORRA', 'presupuesto_lineas',   count(*) from public.presupuesto_lineas
  union all select 'SE BORRA', 'presupuesto_envios',   count(*) from public.presupuesto_envios
  union all select 'SE BORRA', 'presupuesto_visitas',  count(*) from public.presupuesto_visitas
  union all select 'SE BORRA', 'presupuesto_adjuntos', count(*) from public.presupuesto_adjuntos
  union all select 'SE BORRA', 'conjuntos',            count(*) from public.conjuntos
  union all select 'SE BORRA', 'conjunto_lineas',      count(*) from public.conjunto_lineas
  union all select 'SE BORRA', 'articulos',            count(*) from public.articulos
  union all select 'SE BORRA', 'proveedores',          count(*) from public.proveedores
  union all select 'SE BORRA', 'movimientos_material', count(*) from public.movimientos_material
  union all select 'SE BORRA', 'peticiones_material',  count(*) from public.peticiones_material
  union all select 'SE BORRA', 'telegram_enviados',    count(*) from public.telegram_enviados
) t
where filas > 0
order by caso desc, filas desc, tabla;


-- ============================================================================
-- Y LOS FICHEROS, QUE NO LOS BORRA ESTE SQL
--
-- Borrar una fila de la base NO borra la foto que cuelga de ella. Los ficheros
-- viven en los almacenes y se vacían desde el panel de Supabase, en Storage,
-- a mano. Esto solo dice cuántos hay en cada uno.
--
-- El almacén «equipo» NO se vacía: son las fotos de los técnicos, y el equipo
-- se queda.
-- ============================================================================

select
  b.id as almacen,
  count(o.id) as ficheros,
  case when b.id = 'equipo' then 'SE QUEDA · son las fotos del equipo'
       else 'hay que vaciarlo a mano desde Storage' end as que_hacer
from storage.buckets b
left join storage.objects o on o.bucket_id = b.id
group by b.id
order by case when b.id = 'equipo' then 1 else 0 end, count(o.id) desc;
