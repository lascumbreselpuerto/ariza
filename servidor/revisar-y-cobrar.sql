-- ================================================================
-- SAFE2DOOR · REVISAR UN PARTE, DECIDIR SI SE FACTURA, Y COBRAR A MEDIAS
--
-- QUÉ RESUELVE
--
-- David, 27-11-2026:
--
--   «Sobre partes realizados. Oficina debe de poder marcar los revisado
--    (facturados etc) y pasarlos a otra sección dentro de realizados que diga
--    cerrados. Y estos cerrados deben de poderse marcar como cobrados
--    completo, cobrado parcial y o no cobrado por oficina.»
--
--   «En el punto 2 yo incluiría en los partes realizados la decisión de mandar
--    a facturar o no. Lo no facturado calculará sus márgenes igualmente con
--    costes de personal y el material enviado a material roto dando de baja en
--    almacén y calculando su coste, pero en apartado diferente.»
--
-- Y eligió: dos pasos (revisado primero, facturado después), y el cobro
-- parcial con el importe cobrado y lo que queda pendiente.
--
-- CÓMO QUEDA EL CAMINO DE UN PARTE
--
--   1. El técnico lo cierra en la obra.
--   2. La oficina lo REVISA: las horas, el material valorado, el importe. Al
--      marcarlo revisado pasa a «Cerrados».
--   3. Y decide: se factura, o NO SE FACTURA. Lo que no se factura va a
--      «Partes eliminados», con su coste contado.
--   4. Lo facturado se apunta con su número, y después se cobra: del todo, a
--      medias, o nada.
--
-- POR QUÉ EL REVISADO ES UN PASO PROPIO
--
-- Porque repasar y facturar no se hacen el mismo día. Se repasa el parte
-- cuando llega, con el técnico localizable para preguntarle, y se factura a
-- fin de mes. Sin este paso, un parte repasado y uno sin repasar se ven igual.
--
-- EL MATERIAL DE LO QUE NO SE FACTURA
--
-- Esto lo hablé con David antes de escribirlo, porque tenía trampa: el
-- material de un parte YA SE DESCONTÓ del almacén al cerrarlo. Darle una baja
-- nueva lo descontaría dos veces y la furgoneta quedaría a cero de algo que sí
-- tiene.
--
-- Así que no se mueve ni una unidad más y tampoco se le cambia el motivo al
-- movimiento: se identifica POR SU PARTE. La vista material_perdido une los
-- movimientos con la valoración de su visita y saca el material de los partes
-- que no se facturan, con su coste. Eso no se puede descuadrar, porque no
-- escribe nada: solo mira.
--
-- (Cambiarle el motivo al movimiento sí habría descuadrado: la aplicación
-- borra y rehace los movimientos de un parte por su motivo cada vez que se
-- guarda, así que un movimiento con el motivo cambiado se habría quedado
-- huérfano y el siguiente guardado habría creado otro encima.)
--
-- EL COBRO A MEDIAS
--
-- Se guarda lo COBRADO, y lo que queda pendiente se calcula. Al revés (guardar
-- el pendiente) sería peor: el total puede cambiar y entonces el pendiente
-- guardado dejaría de cuadrar sin que nadie lo tocara.
--
-- Se puede ejecutar las veces que haga falta.
--
-- 27-11-2026
-- ================================================================

-- ---- El paso de revisado ----
alter table public.valoraciones add column if not exists revisado_en timestamptz;
alter table public.valoraciones add column if not exists revisado_por text;

comment on column public.valoraciones.revisado_en is
  'Cuándo repasó la oficina este parte: horas, material valorado e importe. Es '
  'el paso anterior a facturar, y lo que pasa el parte a «Cerrados». Vacío '
  'significa que está por revisar.';

comment on column public.valoraciones.revisado_por is 'Quién lo repasó.';

-- ---- La decisión de no facturarlo ----
alter table public.valoraciones add column if not exists no_facturar boolean not null default false;
alter table public.valoraciones add column if not exists no_facturar_motivo text;
alter table public.valoraciones add column if not exists no_facturar_por text;
alter table public.valoraciones add column if not exists no_facturar_en timestamptz;

comment on column public.valoraciones.no_facturar is
  'La oficina ha decidido que esta visita NO se factura. No es lo mismo que '
  'avisos.sin_cargo, que lo marca el técnico en obra: esta es la decisión de la '
  'oficina al revisar el parte. La visita sigue existiendo y su coste se sigue '
  'contando: va al apartado «Partes eliminados» y al informe mensual del '
  'administrador.';

comment on column public.valoraciones.no_facturar_motivo is
  'Por qué no se factura: cortesía, error nuestro, entra en contrato, el '
  'cliente no lo acepta… Hace falta para que el informe del mes diga algo más '
  'que un número.';

comment on column public.valoraciones.no_facturar_por is 'Quién lo decidió.';
comment on column public.valoraciones.no_facturar_en is 'Cuándo se decidió.';

-- ---- El cobro, que puede ser a medias ----
alter table public.valoraciones add column if not exists cobrado_importe numeric;

comment on column public.valoraciones.cobrado_importe is
  'Cuánto se ha cobrado de esta factura. Si es igual o mayor que imp_total, '
  'está cobrada del todo; si es menor y mayor que cero, está cobrada a medias y '
  'lo pendiente es la diferencia; vacío con cobrado_el puesto es una factura de '
  'antes del 27-11-2026, cobrada entera. Se guarda lo cobrado y NO lo '
  'pendiente: el total puede cambiar, y entonces un pendiente guardado dejaría '
  'de cuadrar sin que nadie lo hubiera tocado.';

-- Para las dos preguntas que se hacen cada día: qué hay por revisar y qué
-- partes no se facturan. Las dos son de pocos registros sobre muchos, así que
-- van con índice parcial.
create index if not exists valoraciones_por_revisar_idx
  ON public.valoraciones USING btree (revisado_en)
  WHERE (revisado_en IS NULL);

create index if not exists valoraciones_no_facturar_idx
  ON public.valoraciones USING btree (no_facturar_en)
  WHERE (no_facturar IS TRUE);

-- ============================================================================
-- El material de los partes que no se facturan.
--
-- No mueve nada y no escribe nada: une cada movimiento de material con la
-- valoración de su visita y saca los de los partes no facturados, con su
-- coste. Es la lista de material que se ha puesto y no se va a cobrar, que es
-- lo que David llama material roto.
-- ============================================================================
create or replace view public.material_perdido as
  select m.id,
         m.aviso_id,
         a.cerrado,
         to_char(a.cerrado at time zone 'Europe/Madrid', 'YYYY-MM') as mes,
         a.cliente_id,
         a.puerta_id,
         m.articulo_id,
         ar.descripcion,
         m.cantidad,
         coalesce(m.coste, ar.coste, 0)                      as coste_unidad,
         round(coalesce(m.coste, ar.coste, 0) * coalesce(m.cantidad, 0), 2) as coste,
         v.no_facturar_motivo
    from public.materiales m
    join public.avisos a       on a.id = m.aviso_id
    join public.valoraciones v on v.aviso_id = m.aviso_id
    left join public.articulos ar on ar.id = m.articulo_id
   where v.no_facturar is true
     and a.anulada is not true;

comment on view public.material_perdido is
  'El material de los partes que la oficina ha decidido no facturar, con su '
  'coste. No da de baja nada ni cambia ningún movimiento: el material ya salió '
  'del almacén cuando se cerró el parte, y volver a descontarlo lo contaría dos '
  'veces. Esta vista solo mira.';

-- ============================================================================
-- Y el resumen del mes, que es lo que va en los dos correos al administrador.
-- Una vista y no dos consultas sueltas: así el documento, el correo y la
-- pantalla dicen exactamente lo mismo.
-- ============================================================================
create or replace view public.margen_por_mes as
  select to_char(a.cerrado at time zone 'Europe/Madrid', 'YYYY-MM') as mes,
         count(*)                                              as visitas,
         count(*) filter (where v.no_facturar is true)          as no_facturadas,
         count(*) filter (where v.facturado)                    as facturadas,
         round(coalesce(sum(v.imp_total)    filter (where v.no_facturar is not true), 0), 2) as facturable,
         round(coalesce(sum(v.coste_total)  filter (where v.no_facturar is not true), 0), 2) as coste,
         round(coalesce(sum(v.margen)       filter (where v.no_facturar is not true), 0), 2) as margen,
         round(coalesce(sum(v.coste_total)  filter (where v.no_facturar is true), 0), 2)     as coste_perdido,
         round(coalesce(sum(v.cobrado_importe), 0), 2)          as cobrado
    from public.avisos a
    join public.valoraciones v on v.aviso_id = a.id
   where a.cerrado is not null
     and a.anulada is not true
   group by 1
   order by 1 desc;

comment on view public.margen_por_mes is
  'Un mes por fila: visitas cerradas, lo facturable, el coste, el margen, el '
  'coste de lo que se decidió no facturar y lo cobrado. El margen y el coste '
  'del mes NO incluyen los partes no facturados: esos van aparte, en '
  'coste_perdido, porque mezclarlos haría parecer que el mes vendió menos de lo '
  'que vendió. Lo usan la pantalla de Gestión y los dos correos mensuales, para '
  'que digan el mismo número.';

-- ============================================================================
-- Comprobación rápida:
--
--   select column_name from information_schema.columns
--    where table_name = 'valoraciones'
--      and column_name in ('revisado_en','revisado_por','no_facturar',
--                          'no_facturar_motivo','cobrado_importe');
--   select * from public.margen_por_mes limit 3;
--   select * from public.material_perdido limit 5;
-- ============================================================================
