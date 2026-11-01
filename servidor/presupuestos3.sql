-- ============================================================================
-- ARIZA SAT · El trabajo se acuerda de su presupuesto
--
-- POR QUÉ
-- Un presupuesto aceptado se convierte en trabajo, y en esa conversión se
-- perdía lo más importante: EL PRECIO.
--
-- Al abrir el trabajo se copiaban la descripción, las condiciones y las
-- cantidades de material, pero no el importe ni ningún enlace al presupuesto.
-- Después, al cerrar el parte, la valoración se calculaba desde cero: horas por
-- tarifa, más ruta, más el material del catálogo.
--
-- Resultado: un presupuesto firmado de 3.200 € con seis horas de trabajo
-- aparecía en Gestión como 400 y pico euros. El precio pactado, el que el
-- cliente aceptó y firmó, no estaba en ninguna pantalla del circuito de cobro:
-- había que acordarse de ir a buscarlo al presupuesto.
--
-- CÓMO SE RESUELVE
-- Una columna: avisos.presupuesto_id. El importe NO se copia a propósito, se
-- lee del presupuesto, que es donde está congelado desde que se emitió. Un
-- importe copiado en dos sitios acaba diciendo dos cosas distintas.
--
-- Esto NO cambia ninguna fórmula de valoración. La valoración sigue calculando
-- lo que calculaba; lo que cambia es que al lado aparece el precio pactado, y
-- quien factura ve los dos números en la misma pantalla.
--
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

alter table public.avisos add column if not exists presupuesto_id uuid;

-- La clave ajena va aparte y con su nombre, para poder volver a ejecutarlo:
-- «add constraint» no admite «if not exists».
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'avisos_presupuesto_fk') then
    alter table public.avisos
      add constraint avisos_presupuesto_fk
      foreign key (presupuesto_id) references public.presupuestos(id) on delete set null;
  end if;
end $$;

comment on column public.avisos.presupuesto_id is
  'El presupuesto del que nació este trabajo. El importe no se copia: se lee '
  'del presupuesto, donde quedó congelado al emitirlo. Así el precio pactado y '
  'el calculado se ven juntos a la hora de facturar.';

create index if not exists avisos_presupuesto_idx on public.avisos (presupuesto_id);

-- ---------------------------------------------------------------------------
-- Lo que ya estaba
--
-- Los presupuestos que se convirtieron antes de esto ya guardaban a qué aviso
-- fueron, en presupuestos.convertido_aviso. Ese enlace se aprovecha para
-- rellenar el nuevo en sentido contrario, así que los trabajos antiguos
-- recuperan su precio pactado sin que nadie toque nada.
-- ---------------------------------------------------------------------------
update public.avisos a
   set presupuesto_id = p.id
  from public.presupuestos p
 where p.convertido_aviso = a.id
   and a.presupuesto_id is null;

-- ---------------------------------------------------------------------------
-- Dónde se escapa el dinero, de un vistazo
--
-- Trabajos cerrados que venían de un presupuesto, con lo pactado al lado de lo
-- valorado. La diferencia es lo que se estaba dejando de facturar sin que nada
-- lo dijera. No la usa la aplicación: es para mirarla.
-- ---------------------------------------------------------------------------
create or replace view public.obras_contra_presupuesto as
select a.id              as aviso_id,
       a.tipo,
       a.cerrado,
       p.referencia,
       p.titulo,
       -- la base, no el total: imp_total de la valoración también va sin IVA,
       -- y comparar un importe con IVA contra otro sin IVA es inventarse un 21 %
       p.base             as pactado_sin_iva,
       v.imp_total        as valorado_sin_iva,
       (coalesce(p.base, 0) - coalesce(v.imp_total, 0)) as diferencia,
       v.facturado
  from public.avisos a
  join public.presupuestos p on p.id = a.presupuesto_id
  left join public.valoraciones v on v.aviso_id = a.id
 where a.cerrado is not null
   and coalesce(a.anulada, false) = false;

comment on view public.obras_contra_presupuesto is
  'Lo pactado contra lo valorado, trabajo por trabajo. La columna diferencia '
  'es lo que se dejaba de facturar cuando el precio del presupuesto no llegaba '
  'al circuito de cobro.';

-- ---------------------------------------------------------------------------
-- Comprobación
--
--   select count(*) from public.avisos where presupuesto_id is not null;
--   select * from public.obras_contra_presupuesto where diferencia <> 0;
--
-- La primera tiene que dar, como mínimo, tantos como presupuestos convertidos
-- haya. La segunda enseña los trabajos donde lo pactado y lo valorado no
-- coinciden: eso es exactamente lo que había que poder ver.
-- ---------------------------------------------------------------------------
