-- ============================================================================
-- ARIZA SAT · La matrícula de la puerta (alta en obra)
--
-- POR QUÉ
-- Una puerta que no está dada de alta no existe para la empresa: no tiene ficha,
-- ni QR, ni historial, ni expediente, y no se le puede sacar una hoja de campo.
-- El único momento en que se puede documentar de verdad es cuando el técnico
-- está delante de ella: las medidas se toman allí con el flexómetro, las fotos
-- se hacen allí y la placa de características se lee allí. De vuelta al taller
-- ya no se puede, y lo que pasa entonces es que no se documenta nunca.
--
-- La aplicación ya guardaba las medidas (ancho_mm, alto_mm), las fotos (tabla
-- «fotos») y el número de serie de cada elemento montado (tabla «componentes»).
-- Lo que no tenía sitio era la MATRÍCULA DE LA PUERTA: la placa del conjunto,
-- que es la que dice quién la fabricó, qué modelo es y de qué año, y de la que
-- depende el marco legal que se le aplica.
--
-- QUÉ AÑADE
--   · matricula      lo que dice la placa, copiado tal cual: marca, modelo,
--                    número de serie y año. No se interpreta ni se completa.
--   · sin_matricula   por qué no hay matrícula: no tiene placa, está pintada,
--                    está ilegible, se perdió al cambiar la hoja. Esto también
--                    es un dato, y dejarlo escrito vale; dejarlo en blanco, no.
--
-- Las dos son opcionales en la base de datos. Quien decide cuándo son
-- obligatorias es la aplicación, y solo en las asistencias que tocan la puerta
-- de lleno: instalación, puesta en servicio, adecuación a normativa y
-- preventiva. Ahí no deja cerrar la visita sin el mínimo de obra.
--
-- MIENTRAS NO SE EJECUTE
-- La aplicación sigue funcionando: detecta que las columnas no están (S.sinObra),
-- no intenta guardarlas, no enseña esos dos campos en la ficha de la puerta, y el
-- mínimo de matrícula se cumple con la de los componentes, que sí se puede tomar
-- igual. Lo dice en el propio parte para que no parezca que falta un dato.
--
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

alter table public.puertas add column if not exists matricula     text;
alter table public.puertas add column if not exists sin_matricula text;

comment on column public.puertas.matricula is
  'Placa de características de la puerta, copiada tal cual: marca, modelo, '
  'número de serie y año. La del motor y la del cuadro van en «componentes».';

comment on column public.puertas.sin_matricula is
  'Por qué no hay matrícula: sin placa, ilegible, pintada, perdida. Se exige '
  'escribir el motivo en vez de dejar el dato en blanco.';

-- Buscar una puerta por su número de serie es consulta de taller: llega un
-- repuesto o una campaña del fabricante y hay que saber a qué puertas afecta.
create index if not exists puertas_matricula_idx
  on public.puertas (matricula)
  where matricula is not null;

-- ============================================================================
-- Comprobación: debe devolver las dos columnas.
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'puertas'
--    and column_name in ('matricula','sin_matricula');
-- ============================================================================
