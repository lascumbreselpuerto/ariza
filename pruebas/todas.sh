#!/bin/bash
# Lanza todas las suites, una detrás de otra, y resume al final.
#   Uso:  ./todas.sh              todas
#         ./todas.sh regresion    solo esa
AQUI="$(cd "$(dirname "$0")" && pwd)"
cd "$AQUI"

if ! curl -fsS -o /dev/null "http://127.0.0.1:8899/index.html"; then
  echo "El servidor no responde. Ejecuta primero ./preparar.sh"
  exit 1
fi

SUITES="${*:-humo version basico componentes centros tipos ayudas fuerzas obra ficha importar almacen presupuestos parado factura rutas campo avisos subtipos urgencia preventiva comercial remate alta reloj partes tipos-puerta regresion fase6 fase7 fase8 copias manuales}"
RESUMEN="$AQUI/resultado.txt"
: > "$RESUMEN"
TOTAL=0; FALLOS=0

for s in $SUITES; do
  [ -f "$s.mjs" ] || { echo "No existe $s.mjs"; continue; }
  echo "── $s ─────────────────────────────────"
  SALIDA="$(timeout 1800 node "$s.mjs" 2>&1)"
  CODIGO=$?
  echo "$SALIDA" | grep -aE "FALLA|bien,|Errores de JavaScript|^JS:" || true
  LINEA="$(echo "$SALIDA" | grep -aoE '[0-9]+ bien, [0-9]+ mal' | tail -1)"
  B="$(echo "$LINEA" | grep -aoE '^[0-9]+')"
  M="$(echo "$LINEA" | grep -aoE '[0-9]+ mal' | grep -aoE '^[0-9]+')"
  TOTAL=$((TOTAL + ${B:-0} + ${M:-0}))
  FALLOS=$((FALLOS + ${M:-0}))
  if [ "$CODIGO" != "0" ] && [ -z "$LINEA" ]; then
    echo "  la suite ha muerto sin terminar (código $CODIGO)"
    FALLOS=$((FALLOS + 1))
    echo "$SALIDA" | tail -12
    echo "$s: no ha terminado" >> "$RESUMEN"
  elif [ "$CODIGO" != "0" ]; then
    # Agujero tapado el 02-11-2026: una suite sin ninguna comprobación en rojo
    # pero con un error de JavaScript sale con código 1, y hasta hoy el resumen
    # solo miraba el «0 mal» y decía «Todo en verde». Un banco que esconde un
    # error de consola es un banco en el que no se mira la consola.
    #
    # Y afinado el 06-11-2026: el mensaje decía «errores de JavaScript» SIEMPRE
    # que el código no era cero, también cuando lo que había era una
    # comprobación en rojo. Mandaba a buscar un error de consola que no existía.
    # Ahora se distingue mirando si la salida trae líneas de JS o de consola.
    if echo "$SALIDA" | grep -qaE "^JS:|^consola:"; then
      echo "  la suite acaba con errores de JavaScript (código $CODIGO)"
      echo "$SALIDA" | grep -aE "^JS:|^consola:" | head -6
      echo "$s: ${LINEA} y con errores de JavaScript" >> "$RESUMEN"
    else
      echo "  la suite acaba en rojo (código $CODIGO), sin errores de consola"
      echo "$s: ${LINEA} y acaba en rojo" >> "$RESUMEN"
    fi
    FALLOS=$((FALLOS + 1))
  else
    echo "$s: ${LINEA}" >> "$RESUMEN"
  fi
done

# Los SQL también se prueban: son código, y hasta el 27-10-2026 nadie los
# ejecutaba antes de pegarlos en producción. Van al final porque levantan su
# propio Postgres y tardan lo suyo.
if [ -z "${1:-}" ] && [ -x "$AQUI/sql.sh" ]; then
  echo "── sql ─────────────────────────────────"
  SALIDA_SQL="$("$AQUI/sql.sh" 2>&1)"
  CODIGO_SQL=$?
  echo "$SALIDA_SQL" | grep -aE "FALLA|pasan las|fallos\." || true
  if [ "$CODIGO_SQL" = "0" ]; then
    # El número de ficheros lo dice sql.sh, que es quien los cuenta. Estaba
    # escrito a mano («los 18 ficheros») y se quedó viejo el día que entró el
    # fichero 19: el resumen daba un número y el detalle otro. Corregido el
    # 02-11-2026.
    FRASE="$(echo "$SALIDA_SQL" | grep -aoE 'Los [0-9]+ ficheros pasan las tres vueltas' | tail -1)"
    echo "sql: ${FRASE:-pasa las tres vueltas}" >> "$RESUMEN"
  else
    N="$(echo "$SALIDA_SQL" | grep -acE '^ FALLA')"
    FALLOS=$((FALLOS + ${N:-1}))
    echo "sql: ${N:-1} ficheros rotos" >> "$RESUMEN"
  fi
fi

echo
echo "═══════════════════════════════════════"
cat "$RESUMEN"
echo "───────────────────────────────────────"
echo "TOTAL: $TOTAL comprobaciones, $FALLOS fallos"
[ "$FALLOS" = "0" ] && echo "Todo en verde." || echo "HAY FALLOS."
exit $([ "$FALLOS" = "0" ] && echo 0 || echo 1)
