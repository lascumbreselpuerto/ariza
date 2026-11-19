-- ============================================================================
-- ARIZA SAT · LIMPIEZA · PASO 2 DE 2 · BORRAR
--
--                 ESTO BORRA, Y NO TIENE VUELTA ATRÁS.
--
-- Antes de ejecutarlo, tres cosas:
--
--   1. Haber ejecutado limpiar-1-mirar.sql y haber visto los números.
--   2. Tener la copia de seguridad completa, con fotos y firmas, FUERA del
--      ordenador. Si no la tienes, para aquí.
--   3. Estar seguro de en qué proyecto estás. Mira arriba del editor.
--
-- QUÉ HACE
-- Vacía las tablas de trabajo: clientes, puertas, asistencias, presupuestos,
-- contratos, expedientes, material y todo lo que cuelga de ellos.
--
-- QUÉ NO TOCA
--   · ajustes        la ficha de la empresa, los logos, las listas, los
--                    festivos y los límites de fuerza
--   · tarifas        los precios y las cinco rutas, con sus nombres
--   · perfiles       el equipo. Si se borrara, tus técnicos entrarían y la
--                    aplicación no sabría quiénes son
--   · ubicaciones    la nave y las furgonetas
--   · config_interna las claves de los avisos. Sin ellas dejarían de salir
--   · etiquetas      LAS 50 SE QUEDAN, con sus códigos de seguridad intactos
--   · textos_presu   tus cláusulas de presupuesto
--
-- POR QUÉ NO SE BORRAN LAS ETIQUETAS
-- Porque una etiqueta no guarda a qué puerta pertenece: está libre cuando
-- ninguna puerta lleva su código. Al borrar las puertas quedan libres solas.
-- Si se borraran y se generaran otras, los códigos de seguridad cambiarían y
-- las pegatinas que ya estén impresas dejarían de funcionar.
--
-- LO QUE ESTE FICHERO NO PUEDE HACER
-- Vaciar los almacenes de ficheros. Las fotos, las firmas, los documentos y
-- los expedientes se borran a mano, desde el panel de Supabase, en Storage.
-- Están en el LEEME, con el orden.
--
-- SE PUEDE EJECUTAR DOS VECES. La segunda no encontrará nada que borrar.
-- ============================================================================


-- ============================================================================
-- PARA QUE ESTO FUNCIONE HAY QUE QUITAR LOS DOS GUIONES DE LA LÍNEA DE ABAJO
--
-- Está así a propósito. Si se te va el dedo y le das a Run sin haberlo leído,
-- no pasa nada: se para y te lo dice.
-- ============================================================================

-- select set_config('ariza.confirmo', 'SI BORRA', false);


do $$
declare
  n_cli bigint; n_pue bigint; n_avi bigint; n_exp bigint; n_pre bigint;
  n_eti bigint; n_per bigint;
begin
  if coalesce(current_setting('ariza.confirmo', true), '') <> 'SI BORRA' then
    raise exception E'\n\nNo se ha borrado nada, y es lo que tenía que pasar.\n'
      'Para borrar de verdad, quita los dos guiones de la línea que pone\n'
      '«select set_config(...)», unas líneas más arriba, y vuelve a ejecutar.\n';
  end if;

  select count(*) into n_cli from public.clientes;
  select count(*) into n_pue from public.puertas;
  select count(*) into n_avi from public.avisos;
  select count(*) into n_exp from public.expedientes;
  select count(*) into n_pre from public.presupuestos;

  raise notice 'Antes de borrar: % clientes, % puertas, % asistencias, % expedientes, % presupuestos',
    n_cli, n_pue, n_avi, n_exp, n_pre;

  /* El orden importa: primero lo que cuelga y al final de lo que cuelga. Hay
     claves ajenas que lo harían solas en cascada, pero no todas, y una lista
     explícita se lee y se comprueba. En cascada, lo que se borra de más no se
     ve venir. */

  -- Lo que cuelga de una asistencia
  delete from public.telegram_enviados;
  delete from public.mensajes;
  delete from public.conformidad_visita;
  delete from public.revisiones;
  delete from public.entregas_obra;
  delete from public.materiales;
  delete from public.materiales_previstos;
  delete from public.aviso_puertas;
  delete from public.jornadas;
  delete from public.valoraciones;
  delete from public.peticiones_material;

  -- El expediente de normativa
  delete from public.expediente_fotos;
  delete from public.expediente_docs;
  delete from public.expedientes;

  -- Lo comercial
  delete from public.presupuesto_adjuntos;
  delete from public.presupuesto_envios;
  delete from public.presupuesto_visitas;
  delete from public.presupuesto_lineas;
  delete from public.presupuestos;
  delete from public.conjunto_lineas;
  delete from public.conjuntos;

  -- Los contratos de mantenimiento
  delete from public.contrato_puertas;
  delete from public.contratos;

  -- Lo que cuelga de una puerta
  delete from public.medidas;
  delete from public.componentes;
  delete from public.documentos;
  delete from public.fotos;

  -- Y ahora sí, el tronco
  delete from public.avisos;
  delete from public.puertas;      -- al irse, las 50 etiquetas quedan libres
  delete from public.contactos;
  delete from public.centros;
  delete from public.clientes;

  -- El almacén: los movimientos antes que los artículos
  delete from public.movimientos_material;
  delete from public.articulos;
  delete from public.proveedores;

  select count(*) into n_eti from public.etiquetas;
  select count(*) into n_per from public.perfiles;

  raise notice 'Borrado. Se quedan % etiquetas libres y % personas en el equipo.',
    n_eti, n_per;
  raise notice 'Te falta vaciar los almacenes de ficheros a mano, desde Storage.';
end $$;


-- ============================================================================
-- COMPROBACIÓN
--
-- Lo de arriba tiene que quedar a cero y lo de abajo con sus filas.
-- ============================================================================

select 'VACIO' as como, 'clientes' as tabla, count(*) as filas from public.clientes
union all select 'VACIO', 'puertas',      count(*) from public.puertas
union all select 'VACIO', 'avisos',       count(*) from public.avisos
union all select 'VACIO', 'expedientes',  count(*) from public.expedientes
union all select 'VACIO', 'presupuestos', count(*) from public.presupuestos
union all select 'VACIO', 'articulos',    count(*) from public.articulos
union all select 'QUEDA', 'etiquetas',    count(*) from public.etiquetas
union all select 'QUEDA', 'perfiles',     count(*) from public.perfiles
union all select 'QUEDA', 'ajustes',      count(*) from public.ajustes
union all select 'QUEDA', 'tarifas',      count(*) from public.tarifas
union all select 'QUEDA', 'ubicaciones',  count(*) from public.ubicaciones
order by como, tabla;
