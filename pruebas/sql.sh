#!/bin/bash
# ================================================================
# Prueba los ficheros SQL de servidor/ contra un Postgres de verdad.
#
# POR QUÉ EXISTE
# El 27-10-2026 un SQL llegó a la base de David con el ALTER que añade
# una columna puesto DESPUÉS del comentario que la describe. Postgres
# ejecuta de arriba abajo: el comentario no encontraba la columna y
# abortaba el fichero entero. Fue la segunda vez que pasaba algo así.
#
# El banco probaba la aplicación con más de mil comprobaciones, pero
# los SQL no los probaba nadie hasta que se pegaban en producción.
#
# QUÉ HACE
#   1. Levanta un Postgres vacío.
#   2. Monta el andamio: lo que Supabase da por hecho (roles, auth,
#      storage y las tablas base de la aplicación).
#   3. Ejecuta todos los ficheros en orden, PARANDO al primer error.
#   4. Los vuelve a ejecutar TODOS otra vez, sobre la base que ya los
#      tiene, que es el caso de siempre.
#   5. Y una tercera vuelta, que es la que de verdad pilla el fallo de
#      arriba: quita de la base todas las columnas que los ficheros
#      añaden con «alter table ... add column if not exists» y los
#      vuelve a ejecutar.
#
#      Esa vuelta reproduce el caso real: una tabla creada por la
#      VERSIÓN ANTERIOR del fichero, a la que luego se le añade una
#      columna. En una base vacía no se nota, porque el «create table»
#      ya la crea; en la de producción sí, porque la tabla existe desde
#      antes. Si el fichero nombra esa columna (un comentario, un
#      índice, un update) antes de añadirla, aquí revienta.
#
#   Uso:  ./sql.sh
# ================================================================
set -u
AQUI="$(cd "$(dirname "$0")" && pwd)"
SRV="$AQUI/../servidor"
PGBIN=/usr/lib/postgresql/16/bin
PGD=/var/lib/postgresql/ariza-pruebas
PUERTO=5433
SOCK=/tmp
export PATH="$PGBIN:$PATH"

# El orden importa: un fichero que amplía una tabla tiene que ir después
# del que la crea. Es el mismo orden en que se fueron entregando.
ORDEN="componentes.sql centros.sql parte-por-correo.sql obra.sql ficha.sql \
almacen.sql presupuestos.sql presupuestos2.sql comercial.sql anexos.sql \
tarifas2.sql catalogo.sql obra2.sql obra3.sql"

echo "── Levantando Postgres ─────────────────────────"
su postgres -s /bin/bash -c "$PGBIN/pg_ctl -D $PGD stop -m immediate" >/dev/null 2>&1
rm -rf "$PGD"; mkdir -p "$PGD"
chown -R postgres:postgres /var/lib/postgresql; chmod 700 "$PGD"
su postgres -s /bin/bash -c "PATH=$PGBIN:\$PATH initdb -D $PGD -U ariza --auth=trust -E UTF8 --locale=C" >/dev/null 2>&1 \
  || { echo "No se ha podido crear la base de pruebas."; exit 1; }
su postgres -s /bin/bash -c "PATH=$PGBIN:\$PATH pg_ctl -D $PGD -o '-p $PUERTO -k $SOCK' -l /var/lib/postgresql/pg.log start" >/dev/null 2>&1
sleep 3
psql -h $SOCK -p $PUERTO -U ariza -d postgres -c "select 1" >/dev/null 2>&1 \
  || { echo "Postgres no ha arrancado. Mira /var/lib/postgresql/pg.log"; exit 1; }

psql -h $SOCK -p $PUERTO -U ariza -d postgres -c "drop database if exists ariza" >/dev/null 2>&1
psql -h $SOCK -p $PUERTO -U ariza -d postgres -c "create database ariza" >/dev/null 2>&1
PSQL="psql -h $SOCK -p $PUERTO -U ariza -d ariza -v ON_ERROR_STOP=1 --quiet"

echo "── Andamio ─────────────────────────────────────"
if ! $PSQL -f "$AQUI/sql/andamio.sql" > /tmp/andamio.log 2>&1; then
  echo " FALLA el andamio:"; sed -n '1,20p' /tmp/andamio.log; exit 1
fi
echo "  OK   lo que Supabase da por hecho"

fallos=0
vuelta () {
  local n="$1" etiqueta="$2"
  echo ""
  echo "── Vuelta $n: $etiqueta ─────────────────"
  for f in $ORDEN; do
    if [ ! -f "$SRV/$f" ]; then
      echo " FALLA $f → no existe en servidor/"; fallos=$((fallos+1)); continue
    fi
    if $PSQL -f "$SRV/$f" > "/tmp/sql-$f.log" 2>&1; then
      printf "  OK   %s\n" "$f"
    else
      fallos=$((fallos+1))
      printf " FALLA %s\n" "$f"
      grep -m3 -E "^psql:|ERROR" "/tmp/sql-$f.log" | sed 's/^/         /'
    fi
  done
}

# Primera vuelta: base limpia, como el día que se escribió el fichero.
vuelta 1 "sobre una base vacía"
# Segunda: sobre la base que YA los tiene.
vuelta 2 "otra vez, sobre la base que ya los tiene"

# Tercera: se le quitan a la base las columnas que los ficheros añaden
# con un alter, dejándola como una base creada por la versión anterior.
# Es el caso que ha fallado dos veces en producción.
echo ""
echo "── Quitando las columnas que añaden los alter ───"
QUITAR=$(grep -ohiP "alter table\s+(public\.)?\K\w+\s+add column if not exists\s+\w+" $SRV/*.sql \
  | awk '{print "alter table public." $1 " drop column if exists " $7 " cascade;"}' | sort -u)
N=$(echo "$QUITAR" | grep -c "drop column")
echo "$QUITAR" > /tmp/quitar.sql
if $PSQL -f /tmp/quitar.sql > /tmp/quitar.log 2>&1; then
  echo "  OK   $N columnas quitadas: la base queda como la de antes"
else
  echo " FALLA al quitar columnas:"; sed -n '1,8p' /tmp/quitar.log; fallos=$((fallos+1))
fi
vuelta 3 "sobre una base creada por la versión anterior"

echo ""
echo "═══════════════════════════════════════"
if [ "$fallos" -eq 0 ]; then
  echo "Los $(echo $ORDEN | wc -w) ficheros pasan las tres vueltas. Todo en verde."
else
  echo "$fallos fallos. NO se entrega así."
fi
su postgres -s /bin/bash -c "$PGBIN/pg_ctl -D $PGD stop -m fast" >/dev/null 2>&1
exit $([ "$fallos" -eq 0 ] && echo 0 || echo 1)
