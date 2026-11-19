-- ============================================================================
-- ARIZA SAT · INVENTARIO DE LO QUE HAY EN LA BASE
--
-- QUÉ ES
-- Cuenta cuántas filas tiene cada tabla y cuántos ficheros hay en cada almacén.
-- Nada más.
--
-- ES DE SOLO LECTURA. No crea, no cambia y no borra NADA. Se puede ejecutar
-- las veces que haga falta, con gente trabajando, y a cualquier hora.
--
-- PARA QUÉ
-- Para saber qué hay dentro antes de decidir qué se limpia. Borrar a ciegas en
-- la base que va a llevar la empresa no es una opción.
--
-- CÓMO SE USA
--   1. Editor de SQL del proyecto que quieras mirar.
--   2. Pegar entero y ejecutar.
--   3. Mandarme las dos tablas que devuelve.
-- ============================================================================

-- ---- 1. Las filas de cada tabla ----
-- Las que están a cero no salen, para no llenar la pantalla de ceros.
select 'TABLA' as que, t.tabla as nombre, t.filas
  from (
    select 'ajustes' as tabla, count(*) as filas from public.ajustes
    union all select 'articulos',            count(*) from public.articulos
    union all select 'aviso_puertas',        count(*) from public.aviso_puertas
    union all select 'avisos',               count(*) from public.avisos
    union all select 'centros',              count(*) from public.centros
    union all select 'clientes',             count(*) from public.clientes
    union all select 'componentes',          count(*) from public.componentes
    union all select 'config_interna',       count(*) from public.config_interna
    union all select 'conformidad_visita',   count(*) from public.conformidad_visita
    union all select 'conjunto_lineas',      count(*) from public.conjunto_lineas
    union all select 'conjuntos',            count(*) from public.conjuntos
    union all select 'contactos',            count(*) from public.contactos
    union all select 'contrato_puertas',     count(*) from public.contrato_puertas
    union all select 'contratos',            count(*) from public.contratos
    union all select 'documentos',           count(*) from public.documentos
    union all select 'entregas_obra',        count(*) from public.entregas_obra
    union all select 'etiquetas',            count(*) from public.etiquetas
    union all select 'expediente_docs',      count(*) from public.expediente_docs
    union all select 'expediente_fotos',     count(*) from public.expediente_fotos
    union all select 'expedientes',          count(*) from public.expedientes
    union all select 'fotos',                count(*) from public.fotos
    union all select 'jornadas',             count(*) from public.jornadas
    union all select 'materiales',           count(*) from public.materiales
    union all select 'materiales_previstos', count(*) from public.materiales_previstos
    union all select 'medidas',              count(*) from public.medidas
    union all select 'mensajes',             count(*) from public.mensajes
    union all select 'movimientos_material', count(*) from public.movimientos_material
    union all select 'perfiles',             count(*) from public.perfiles
    union all select 'peticiones_material',  count(*) from public.peticiones_material
    union all select 'presupuesto_adjuntos', count(*) from public.presupuesto_adjuntos
    union all select 'presupuesto_envios',   count(*) from public.presupuesto_envios
    union all select 'presupuesto_lineas',   count(*) from public.presupuesto_lineas
    union all select 'presupuesto_visitas',  count(*) from public.presupuesto_visitas
    union all select 'presupuestos',         count(*) from public.presupuestos
    union all select 'proveedores',          count(*) from public.proveedores
    union all select 'puertas',              count(*) from public.puertas
    union all select 'revisiones',           count(*) from public.revisiones
    union all select 'tarifas',              count(*) from public.tarifas
    union all select 'telegram_enviados',    count(*) from public.telegram_enviados
    union all select 'textos_presu',         count(*) from public.textos_presu
    union all select 'ubicaciones',          count(*) from public.ubicaciones
    union all select 'valoraciones',         count(*) from public.valoraciones
  ) t
 where t.filas > 0

union all

-- ---- 2. Los ficheros de cada almacén ----
-- Importa, porque borrar una fila de la base NO borra la foto que cuelga de
-- ella. Si solo se vacían las tablas, las fotos se quedan ahí ocupando sitio y
-- sin que nada las nombre.
select 'ALMACEN', b.id, count(o.id)
  from storage.buckets b
  left join storage.objects o on o.bucket_id = b.id
 group by b.id
having count(o.id) > 0

order by 1, 3 desc, 2;
