#!/bin/bash
# ================================================================
# Prueba el fichero que siembra el día de ejemplo de los manuales.
#
# POR QUÉ EXISTE
# Las capturas de los manuales se hacen sobre datos sembrados con
# sql/dia-de-ejemplo.sql. Si ese fichero se rompe, las capturas no se
# pueden rehacer el día que cambie una pantalla, y un manual que no se
# puede rehacer envejece hasta que engaña.
#
# QUÉ COMPRUEBA
#   1. Monta una base desde cero: lo de Supabase y el instalador.
#   2. SIN el técnico de pruebas, la siembra tiene que PARARSE y
#      explicar qué falta. Si entrara a medias, dejaría una base con
#      visitas sin dueño y las capturas saldrían vacías.
#   3. Con el técnico, siembra las dos visitas de hoy.
#   4. Lanzada DOS veces, no duplica nada.
#   5. El bloque de deshacer del final funciona y deja la base limpia,
#      sin tocar la Nave, que es de la semilla del instalador.
#
#   Uso:  ./siembra.sh
# ================================================================
set -u
AQUI="$(cd "$(dirname "$0")" && pwd)"
PGBIN=/usr/lib/postgresql/16/bin
PGD=/var/lib/postgresql/ariza-siembra
PUERTO=5435
SOCK=/tmp
TEC='11111111-1111-1111-1111-111111111111'
export PATH="$PGBIN:$PATH"
BIEN=0; MAL=0
ok(){ BIEN=$((BIEN+1)); echo "  ok   $1"; }
no(){ MAL=$((MAL+1));  echo " FALLA $1"; }
q(){ psql -h $SOCK -p $PUERTO -U ariza -d siembra -tAc "$1" 2>/dev/null | tr -d ' '; }

echo "── Levantando Postgres ─────────────────────────"
su postgres -s /bin/bash -c "$PGBIN/pg_ctl -D $PGD stop -m immediate" >/dev/null 2>&1
rm -rf "$PGD"; mkdir -p "$PGD"
chown -R postgres:postgres /var/lib/postgresql; chmod 700 "$PGD"
su postgres -s /bin/bash -c "PATH=$PGBIN:\$PATH initdb -D $PGD -U ariza --auth=trust -E UTF8 --locale=C" >/dev/null 2>&1 \
  || { echo "No se ha podido crear la base."; exit 1; }
su postgres -s /bin/bash -c "PATH=$PGBIN:\$PATH pg_ctl -D $PGD -o '-p $PUERTO -k $SOCK' -l /var/lib/postgresql/pg-siembra.log start" >/dev/null 2>&1
sleep 3
psql -h $SOCK -p $PUERTO -U ariza -d postgres -c "select 1" >/dev/null 2>&1 \
  || { echo "El Postgres no ha arrancado."; exit 1; }
psql -h $SOCK -p $PUERTO -U ariza -d postgres -q -c "create database siembra" >/dev/null 2>&1

echo "── Montando la base ────────────────────────────"
psql -h $SOCK -p $PUERTO -U ariza -d siembra -v ON_ERROR_STOP=1 -q \
  -f "$AQUI/sql/supabase-minimo.sql" >/dev/null 2>&1 \
  || { echo "El andamio de Supabase no monta."; exit 1; }
psql -h $SOCK -p $PUERTO -U ariza -d siembra -v ON_ERROR_STOP=1 -q \
  -f "$AQUI/../servidor/instalar-ariza-sat.sql" >/dev/null 2>&1 \
  || { echo "El instalador no monta."; exit 1; }

echo "── La siembra del día de ejemplo ───────────────"

# 1. Sin el usuario, se para y lo cuenta.
SAL=$(psql -h $SOCK -p $PUERTO -U ariza -d siembra -v ON_ERROR_STOP=1 -q \
        -f "$AQUI/sql/dia-de-ejemplo.sql" 2>&1)
echo "$SAL" | grep -q "No encuentro al usuario" \
  && ok "sin el usuario se para y dice qué falta" \
  || no "sin el usuario NO avisa"
echo "$SAL" | grep -qi "Authentication" \
  && ok "y dice dónde crearlo" \
  || no "el aviso no dice dónde hacerlo"
[ "$(q 'select count(*) from clientes')" = "0" ] \
  && ok "y no deja nada a medias" \
  || no "ha dejado filas pese a pararse"

# 2. Solo la credencial, SIN ficha de equipo. Es el caso que se dio de verdad
#    el 19-11-2026: el usuario estaba creado, se había entrado con él, y en
#    perfiles no había nada. La aplicación, si ese alta le falla, sigue con una
#    ficha que solo existe en la memoria del navegador y no avisa. Así que la
#    siembra no da por hecha la ficha: si falta, la crea.
psql -h $SOCK -p $PUERTO -U ariza -d siembra -q >/dev/null 2>&1 <<EOF
insert into auth.users (id, email) values ('$TEC','tecnico@prueba.es');
EOF
psql -h $SOCK -p $PUERTO -U ariza -d siembra -v ON_ERROR_STOP=1 -q \
  -f "$AQUI/sql/dia-de-ejemplo.sql" >/dev/null 2>&1
[ "$(q "select count(*) from perfiles where id='$TEC' and rol='tecnico' and activo")" = "1" ] \
  && ok "con la credencial pero sin ficha, se la crea como técnico activo" \
  || no "no crea la ficha que falta"
[ "$(q "select nombre from perfiles where id='$TEC'")" = "DaniRuiz" ] \
  && ok "y le pone el nombre del ejemplo" \
  || no "la ficha no se llama Dani Ruiz"

# 3. Primera vuelta.
psql -h $SOCK -p $PUERTO -U ariza -d siembra -v ON_ERROR_STOP=1 -q \
  -f "$AQUI/sql/dia-de-ejemplo.sql" >/dev/null 2>&1 \
  && ok "la siembra entra sin errores" \
  || no "la siembra falla"

[ "$(q 'select count(*) from clientes')" = "2" ]    && ok "dos clientes"    || no "clientes: $(q 'select count(*) from clientes')"
[ "$(q 'select count(*) from puertas')" = "2" ]     && ok "dos puertas"     || no "puertas: $(q 'select count(*) from puertas')"
[ "$(q 'select count(*) from componentes')" = "3" ] && ok "tres componentes" || no "componentes: $(q 'select count(*) from componentes')"
[ "$(q 'select count(*) from mensajes')" = "2" ]    && ok "dos mensajes"    || no "mensajes: $(q 'select count(*) from mensajes')"

# 4. Lo que hace falta para que «Mi trabajo» las enseñe: del técnico,
#    con fecha de hoy, sin cerrar y sin archivar.
[ "$(q "select count(*) from avisos where tecnico_id='$TEC' and fecha_prevista=current_date and cerrado is null and archivado=false")" = "2" ] \
  && ok "las dos visitas salen en «Mi trabajo» de hoy" \
  || no "las visitas no cumplen el filtro de «Mi trabajo»"

# 5. Los valores tienen que ser los de las listas de la aplicación. Si se pone
#    otra palabra, la fila entra igual pero la pantalla la enseña en crudo, y
#    una captura con un dato en crudo enseña un fallo que no existe.
[ "$(q "select count(*) from puertas where estado='operativa'")" = "2" ] \
  && ok "estado de puerta «operativa», el de la aplicación" \
  || no "el estado de las puertas no es el de la aplicación"
[ "$(q "select count(*) from avisos where estado='asignado'")" = "2" ] \
  && ok "estado de aviso «asignado»" \
  || no "el estado de los avisos no es «asignado»"
[ "$(q "select count(*) from puertas where tipo in ('Corredera autoportante','Seccional')")" = "2" ] \
  && ok "tipos de puerta de la lista TIPOS" \
  || no "algún tipo de puerta no está en TIPOS"
[ "$(q "select count(*) from puertas where uso in ('Residencial','Industrial')")" = "2" ] \
  && ok "usos de la lista USOS" \
  || no "algún uso no está en USOS"
[ "$(q "select count(*) from clientes where tipo in ('Comunidad','Industria')")" = "2" ] \
  && ok "tipos de cliente de la lista CLIENTES" \
  || no "algún tipo de cliente no está en CLIENTES"
[ "$(q "select count(*) from avisos where origen in ('Teléfono','Interno')")" = "2" ] \
  && ok "orígenes de la lista ORIGENES" \
  || no "algún origen no está en ORIGENES"
[ "$(q "select count(*) from movimientos_material where motivo='compra'")" = "3" ] \
  && ok "motivo «compra», el que escribe una entrada" \
  || no "el motivo de los movimientos no es «compra»"
[ "$(q "select count(*) from componentes where clave in ('motor','cuadro','fotocelulas')")" = "3" ] \
  && ok "claves de componente de las de la aplicación" \
  || no "alguna clave de componente no es de la aplicación"

# 6. El motor y el cuadro de la ficha tienen que decir lo mismo que el
#    componente: son el mismo dato escrito en dos sitios.
[ "$(q "select motor from puertas where codigo='AR-9001'")" = "ErrekaRino4" ] \
  && ok "la ficha y el componente dicen el mismo motor" \
  || no "la ficha dice otro motor que el componente"

# 7. Nada de esto puede ser un cliente de verdad.
[ "$(q "select count(*) from clientes where nombre not in ('Comunidad Las Flores','Talleres Guadalete')")" = "0" ] \
  && ok "solo los dos clientes inventados" \
  || no "hay algún cliente que no es de los inventados"

# 8. Segunda vuelta: no duplica.
psql -h $SOCK -p $PUERTO -U ariza -d siembra -v ON_ERROR_STOP=1 -q \
  -f "$AQUI/sql/dia-de-ejemplo.sql" >/dev/null 2>&1
[ "$(q 'select count(*) from clientes')" = "2" ] && [ "$(q 'select count(*) from avisos')" = "2" ] \
  && [ "$(q 'select count(*) from mensajes')" = "2" ] && [ "$(q 'select count(*) from movimientos_material')" = "3" ] \
  && ok "lanzado dos veces no duplica nada" \
  || no "la segunda vuelta duplica filas"

# 9. El bloque de deshacer del final.
TMP=$(mktemp -d)
sed -n '/^-- delete from/,$p' "$AQUI/sql/dia-de-ejemplo.sql" | sed 's/^-- //' > "$TMP/deshacer.sql"
grep -q "delete from public.clientes" "$TMP/deshacer.sql" \
  && ok "el fichero trae su bloque de deshacer" \
  || no "no encuentro el bloque de deshacer"
psql -h $SOCK -p $PUERTO -U ariza -d siembra -v ON_ERROR_STOP=1 -q -f "$TMP/deshacer.sql" >/dev/null 2>&1 \
  && ok "deshacer entra sin errores" \
  || no "deshacer falla"
[ "$(q 'select count(*) from clientes')" = "0" ] && [ "$(q 'select count(*) from puertas')" = "0" ] \
  && [ "$(q 'select count(*) from avisos')" = "0" ] \
  && ok "deshacer deja la base limpia" \
  || no "deshacer se deja filas"
# La Nave es de la semilla del instalador: no es del ejemplo y no se toca.
[ "$(q "select count(*) from ubicaciones where tipo='nave'")" = "1" ] \
  && ok "deshacer no se lleva la Nave del instalador" \
  || no "deshacer ha tocado la Nave"
rm -rf "$TMP"

su postgres -s /bin/bash -c "$PGBIN/pg_ctl -D $PGD stop -m fast" >/dev/null 2>&1

echo
echo "── $BIEN bien, $MAL mal ────────────────────────"
[ "$MAL" = "0" ] || exit 1
