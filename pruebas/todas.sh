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

SUITES="${*:-humo regresion fase6 fase7}"
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
  fi
  echo "$s: ${LINEA:-no ha terminado}" >> "$RESUMEN"
done

echo
echo "═══════════════════════════════════════"
cat "$RESUMEN"
echo "───────────────────────────────────────"
echo "TOTAL: $TOTAL comprobaciones, $FALLOS fallos"
[ "$FALLOS" = "0" ] && echo "Todo en verde." || echo "HAY FALLOS."
exit $([ "$FALLOS" = "0" ] && echo 0 || echo 1)
