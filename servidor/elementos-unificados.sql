-- ================================================================
-- SAFE2DOOR · UNA SOLA LISTA DE ELEMENTOS
--
-- QUÉ RESUELVE
-- David, al ver la pantalla en uso el 25-11-2026: «los componentes no coinciden
-- con los seleccionados en función de la familia de puerta que seleccionamos en
-- el excel».
--
-- Tenía razón. Había DOS listas de elementos que no se hablaban:
--
--   · la de la ficha, de la hoja que él rellenó: 11 familias de puerta
--     (corredera, batiente, plegable, seccional, basculante, enrollable,
--     rápida, guillotina, cortafuegos, peatonal, barrera) y 24 elementos.
--   · la del expediente, que era de antes: solo 4 familias (industrial,
--     peatonal, barrera, cortafuegos) y otros 24 elementos distintos, los de
--     cerrajería y mecánica (hoja, guías, equilibrado, paracaídas, finales de
--     carrera, protecciones eléctricas, señalización…).
--
-- Marcabas una cosa en el alta y el expediente te pedía otra.
--
-- Ahora hay una sola tabla, de 47 elementos por 11 familias, y vive en la
-- aplicación (ELEMENTOS_PUERTA y CAMPOS_FAMILIA en index.html). Lo que hace
-- falta aquí es una cosa sola: poder distinguir los expedientes que usan el
-- catálogo nuevo de los que usan el viejo.
--
-- POR QUÉ NO SE LES CAMBIA EL CATÁLOGO A LOS EXPEDIENTES QUE YA EXISTEN
--
-- Porque sus respuestas están guardadas con las claves viejas y hay claves que
-- no se corresponden una a una. El «mandos» de antes era el conjunto de
-- emisores y pulsadores; el de ahora es cuántos mandos se entregaron. Y el
-- «selector» de antes significaba el selector de programa en una peatonal y el
-- selector de cierre en una cortafuegos: dos cosas distintas con el mismo
-- nombre.
--
-- Cambiarle el catálogo a un expediente a medias sería perderle respuestas, y a
-- uno ya emitido, cambiar lo que dice un documento firmado por el cliente. Eso
-- no se hace nunca.
--
-- Así que: los expedientes nuevos nacen con catalogo = 'familia47' y los de
-- antes se quedan sin marca, que es lo que la aplicación lee como «el de
-- siempre». Los dos siguen funcionando, cada uno con el suyo.
--
-- QUÉ NO CAMBIA
-- El número de expediente. Sigue siendo EXP-año-correlativo, lo sigue dando
-- este mismo servidor y la base de datos sigue sin dejar que se repita.
--
-- Se puede ejecutar las veces que haga falta.
--
-- 25-11-2026
-- ================================================================

alter table public.expedientes add column if not exists catalogo text;

comment on column public.expedientes.catalogo is
  'Con qué catálogo de elementos se rellena este expediente. ''familia47'': la '
  'tabla de 47 elementos por 11 familias de puerta, la que rellenó David. '
  'Vacío: el catálogo de antes del 25-11-2026, de 4 familias. Un expediente NO '
  'cambia de catálogo nunca, ni en borrador: sus respuestas están guardadas con '
  'las claves de su catálogo, y hay claves que no se corresponden una a una.';

-- ---- El expediente nuevo nace con el catálogo nuevo ----------------
-- Es la misma función de siempre con una sola línea cambiada: la columna
-- «catalogo» en el insert. Lo demás se copia tal cual, incluidas las tres
-- comprobaciones de permiso, situación y familia, y el correlativo por año.

CREATE OR REPLACE FUNCTION public.crear_expediente(p_puerta uuid, p_situacion text, p_familia text, p_aviso uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_id uuid; v_num int; v_ref text; v_cli uuid; v_quien text; v_anio int;
begin
  if not public.es_equipo() then
    return json_build_object('ok', false, 'motivo', 'permiso');
  end if;
  if p_situacion not in ('nueva_fabricante','nueva_instalador','adecuacion','modificacion') then
    return json_build_object('ok', false, 'motivo', 'situacion');
  end if;
  if p_familia not in ('industrial','peatonal','barrera','cortafuegos') then
    return json_build_object('ok', false, 'motivo', 'familia');
  end if;

  select cliente_id into v_cli from public.puertas where id = p_puerta;
  select coalesce(nombre, '') into v_quien from public.perfiles where id = auth.uid();

  v_anio := extract(year from (now() at time zone 'Europe/Madrid'))::int;
  select coalesce(max(e.numero), 0) + 1 into v_num
    from public.expedientes e
   where extract(year from e.fecha_apertura) = v_anio;
  v_ref := 'EXP-' || v_anio || '-' || lpad(v_num::text, 3, '0');

  insert into public.expedientes (referencia, numero, puerta_id, cliente_id, aviso_id,
                                  situacion, familia, autor, catalogo)
  values (v_ref, v_num, p_puerta, v_cli, p_aviso, p_situacion, p_familia,
          nullif(v_quien, ''), 'familia47')
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id, 'referencia', v_ref);
end $function$
;
