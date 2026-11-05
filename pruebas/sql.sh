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
tarifas2.sql catalogo.sql obra2.sql obra3.sql ficha2.sql ficha3.sql presupuestos3.sql valoracion.sql \
parado.sql factura.sql rutas.sql ruta-cliente.sql telegram.sql subtipo.sql urgencia.sql \
medidas.sql"

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

# Y las pruebas de la fórmula que valora una visita. Los ficheros de arriba
# solo comprueban que se puedan EJECUTAR; esto comprueba que la función
# CALCULE bien, con datos de verdad y números esperados uno a uno.
if [ "$fallos" -eq 0 ] && [ -f "$AQUI/sql/valoracion-pruebas.sql" ]; then
  echo ""
  echo "── Lo que calcula la valoración ────────────────"
  if $PSQL -f "$AQUI/sql/valoracion-pruebas.sql" > /tmp/val-pruebas.log 2>&1; then
    grep -a "NOTICE" /tmp/val-pruebas.log | sed 's/^psql:[^ ]* //; s/^NOTICE:  /  OK   /'
  else
    fallos=$((fallos+1))
    echo " FALLA la valoración:"
    grep -a -m3 -E "ERROR|EXCEPTION" /tmp/val-pruebas.log | sed 's/^/         /'
  fi
fi

# Y las dos fechas que dicen desde cuándo algo está quieto: las sella un
# disparador, así que hay que comprobar que las sella cuando toca y, sobre todo,
# que NO las sella cuando no toca.
if [ "$fallos" -eq 0 ] && [ -f "$AQUI/sql/parado-pruebas.sql" ]; then
  echo ""
  echo "── Desde cuándo está quieto ────────────────────"
  if $PSQL -f "$AQUI/sql/parado-pruebas.sql" > /tmp/parado-pruebas.log 2>&1; then
    grep -a "NOTICE" /tmp/parado-pruebas.log | sed 's/^psql:[^ ]* //; s/^NOTICE:  /  OK   /'
  else
    fallos=$((fallos+1))
    echo " FALLA lo parado:"
    grep -a -m3 -E "ERROR|EXCEPTION" /tmp/parado-pruebas.log | sed 's/^/         /'
  fi
fi

# Y lo que entra y no entra en pendiente de facturar y en impagados. Cobrar no
# es facturar, y confundirlo dejaba visitas cobradas que no facturaba nadie.
if [ "$fallos" -eq 0 ] && [ -f "$AQUI/sql/factura-pruebas.sql" ]; then
  echo ""
  echo "── Cobrar no es facturar ───────────────────────"
  if $PSQL -f "$AQUI/sql/factura-pruebas.sql" > /tmp/factura-pruebas.log 2>&1; then
    grep -a "NOTICE" /tmp/factura-pruebas.log | sed 's/^psql:[^ ]* //; s/^NOTICE:  /  OK   /'
  else
    fallos=$((fallos+1))
    echo " FALLA la factura:"
    grep -a -m3 -E "ERROR|EXCEPTION" /tmp/factura-pruebas.log | sed 's/^/         /'
  fi
fi

# El desplazamiento por ruta: cambia lo que se cobra en TODAS las visitas, así
# que los números se comprueban uno a uno y calculados a mano.
if [ "$fallos" -eq 0 ] && [ -f "$AQUI/sql/rutas-pruebas.sql" ]; then
  echo ""
  echo "── El desplazamiento por ruta ──────────────────"
  if $PSQL -f "$AQUI/sql/rutas-pruebas.sql" > /tmp/rutas-pruebas.log 2>&1; then
    grep -a "NOTICE" /tmp/rutas-pruebas.log | sed 's/^psql:[^ ]* //; s/^NOTICE:  /  OK   /'
  else
    fallos=$((fallos+1))
    echo " FALLA el desplazamiento por ruta:"
    grep -a -m3 -E "ERROR|EXCEPTION" /tmp/rutas-pruebas.log | sed 's/^/         /'
  fi
fi

# La ruta habitual del cliente. Lo que se vigila aquí no es que se proponga bien,
# que eso es pantalla, sino que NO decida lo que se cobra: una ruta que nadie ha
# elegido en esa visita no puede acabar en la factura.
if [ "$fallos" -eq 0 ] && [ -f "$AQUI/sql/ruta-cliente-pruebas.sql" ]; then
  echo ""
  echo "── La ruta habitual del cliente ────────────────"
  if $PSQL -f "$AQUI/sql/ruta-cliente-pruebas.sql" > /tmp/ruta-cliente-pruebas.log 2>&1; then
    grep -a "NOTICE" /tmp/ruta-cliente-pruebas.log | sed 's/^psql:[^ ]* //; s/^NOTICE:  /  OK   /'
  else
    fallos=$((fallos+1))
    echo " FALLA la ruta habitual del cliente:"
    grep -a -m3 -E "ERROR|EXCEPTION" /tmp/ruta-cliente-pruebas.log | sed 's/^/         /'
  fi
fi

# Los avisos al grupo de la oficina. Lo que se vigila es lo contrario de lo que
# parece: que un aviso que falla NO pueda impedir que el técnico guarde. Aquí no
# hay pg_net ni config_interna, o sea el peor caso, y aun así tiene que guardar.
if [ "$fallos" -eq 0 ] && [ -f "$AQUI/sql/telegram-pruebas.sql" ]; then
  echo ""
  echo "── Los avisos al grupo ─────────────────────────"
  if $PSQL -f "$AQUI/sql/telegram-pruebas.sql" > /tmp/telegram-pruebas.log 2>&1; then
    grep -a "NOTICE" /tmp/telegram-pruebas.log | sed 's/^psql:[^ ]* //; s/^NOTICE:  /  OK   /'
  else
    fallos=$((fallos+1))
    echo " FALLA el aviso al grupo:"
    grep -a -m3 -E "ERROR|EXCEPTION" /tmp/telegram-pruebas.log | sed 's/^/         /'
  fi
fi

# El subtipo de las asistencias. Lo que se vigila es la regla de la garantía, en
# las dos direcciones: que la nueva no se facture y que la vieja tampoco.
if [ "$fallos" -eq 0 ] && [ -f "$AQUI/sql/subtipo-pruebas.sql" ]; then
  echo ""
  echo "── El subtipo de las asistencias ───────────────"
  if $PSQL -f "$AQUI/sql/subtipo-pruebas.sql" > /tmp/subtipo-pruebas.log 2>&1; then
    grep -a "NOTICE" /tmp/subtipo-pruebas.log | sed 's/^psql:[^ ]* //; s/^NOTICE:  /  OK   /'
  else
    fallos=$((fallos+1))
    echo " FALLA el subtipo:"
    grep -a -m3 -E "ERROR|EXCEPTION" /tmp/subtipo-pruebas.log | sed 's/^/         /'
  fi
fi

# El recargo de urgencia. Multiplica por dos o por tres lo que se cobra, así que
# los números van calculados a mano. Y hay una prueba que vale por todas: que una
# urgencia anterior al 04-11-2026 siga valiendo exactamente lo que valía.
if [ "$fallos" -eq 0 ] && [ -f "$AQUI/sql/urgencia-pruebas.sql" ]; then
  echo ""
  echo "── El recargo de urgencia ──────────────────────"
  if $PSQL -f "$AQUI/sql/urgencia-pruebas.sql" > /tmp/urgencia-pruebas.log 2>&1; then
    grep -a "NOTICE" /tmp/urgencia-pruebas.log | sed 's/^psql:[^ ]* //; s/^NOTICE:  /  OK   /'
  else
    fallos=$((fallos+1))
    echo " FALLA el recargo de urgencia:"
    grep -a -m3 -E "ERROR|EXCEPTION" /tmp/urgencia-pruebas.log | sed 's/^/         /'
  fi
fi

# La toma de medidas de la comercial. Lo que se comprueba aquí es que los
# límites paran el error de dedo (40 mm en vez de 4000) y que una comercial
# cerrada sin medidas aparece en la lista de la oficina.
if [ "$fallos" -eq 0 ] && [ -f "$AQUI/sql/medidas-pruebas.sql" ]; then
  echo ""
  echo "── La toma de medidas ──────────────────────────"
  if $PSQL -f "$AQUI/sql/medidas-pruebas.sql" > /tmp/medidas-pruebas.log 2>&1; then
    grep -a "NOTICE" /tmp/medidas-pruebas.log | sed 's/^psql:[^ ]* //; s/^NOTICE:  /  OK   /'
  else
    fallos=$((fallos+1))
    echo " FALLA la toma de medidas:"
    grep -a -m3 -E "ERROR|EXCEPTION" /tmp/medidas-pruebas.log | sed 's/^/         /'
  fi
fi

echo ""
echo "═══════════════════════════════════════"
if [ "$fallos" -eq 0 ]; then
  echo "Los $(echo $ORDEN | wc -w) ficheros pasan las tres vueltas. Todo en verde."
else
  echo "$fallos fallos. NO se entrega así."
fi
su postgres -s /bin/bash -c "$PGBIN/pg_ctl -D $PGD stop -m fast" >/dev/null 2>&1
exit $([ "$fallos" -eq 0 ] && echo 0 || echo 1)
