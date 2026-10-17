-- ============================================================================
-- ARIZA SAT · Cómo se acciona la puerta y quién la usa
--
-- POR QUÉ
-- El modo de accionamiento (hombre presente, impulso con el hueco a la vista,
-- impulso sin verlo, automático) y el tipo de usuario (personas informadas en
-- uso privado, informadas en uso público, no informadas) son los dos datos de
-- los que sale QUÉ PROTECCIÓN le toca a una puerta y, con ella, qué elementos de
-- seguridad debería llevar.
--
-- Hasta ahora solo se preguntaban dentro del expediente. Consecuencia práctica,
-- vista por David probando el alta en obra: una puerta recién dada de alta no
-- podía decir nada. El panel de componentes se quedaba en los elementos genéricos
-- del tipo de puerta y ponía «esta puerta no tiene todavía ningún expediente...»,
-- aunque el técnico estuviera delante de ella viendo perfectamente cómo se
-- acciona y quién pasa por ahí.
--
-- Son dos datos que se ven mirando la puerta, así que pasan a su ficha.
--
-- QUÉ AÑADE
--   · modo       clave del modo de accionamiento ('hombre_presente',
--                'impulso_vista', 'impulso_sin_vista', 'automatico')
--   · usuarios   clave del tipo de usuario ('informados_privado',
--                'informados_publico', 'no_informados')
--
-- Se guardan como texto libre a propósito: las claves las fija la aplicación, y
-- una restricción en la base de datos obligaría a tocar el SQL cada vez que se
-- afine la lista. La aplicación solo ofrece las suyas en un desplegable.
--
-- QUIÉN MANDA
-- La ficha. Es el dato vivo de la puerta: si mañana se le pone un mando a
-- distancia, se corrige ahí. El expediente es la foto del día en que se emitió y
-- no se toca. Si la ficha está vacía (puertas dadas de alta antes de este
-- cambio), la aplicación sigue usando el último expediente que lo diga.
--
-- MIENTRAS NO SE EJECUTE
-- La aplicación sigue funcionando igual que hasta ahora: detecta que las columnas
-- no están, no las guarda, no enseña esos dos desplegables en la ficha y deduce
-- la protección del expediente, como antes.
--
-- Se puede ejecutar varias veces sin romper nada.
-- ============================================================================

alter table public.puertas add column if not exists modo     text;
alter table public.puertas add column if not exists usuarios text;

comment on column public.puertas.modo is
  'Modo de accionamiento de la puerta. Claves de la aplicación: hombre_presente, '
  'impulso_vista, impulso_sin_vista, automatico. Manda sobre lo que diga el '
  'expediente, que es la foto del día en que se emitió.';

comment on column public.puertas.usuarios is
  'Tipo de usuario. Claves de la aplicación: informados_privado, '
  'informados_publico, no_informados.';

-- ============================================================================
-- Comprobación: debe devolver las dos columnas.
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'puertas'
--    and column_name in ('modo','usuarios');
-- ============================================================================
