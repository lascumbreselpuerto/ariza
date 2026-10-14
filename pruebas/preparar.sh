#!/bin/bash
# ================================================================
# Prepara el banco de pruebas de ARIZA SAT.
#
# Lo que hace:
#   1. Consigue el index.html que se va a probar: el de la carpeta de
#      arriba si existe, y si no lo descarga de arizapa.es.
#   2. Hace una copia para pruebas con tres cambios, y SOLO en la copia:
#        · el Supabase de internet se cambia por el simulador local
#        · la librería de QR de internet se cambia por la local
#        · se añade al final una línea que deja las funciones internas
#          a la vista del banco de pruebas, en window.__T
#   3. Arranca el servidor local en el puerto 8899.
#
# El index.html de producción NO se toca nunca.
#
#   Uso:  ./preparar.sh            (usa ../index.html, o descarga)
#         ./preparar.sh --bajar    (fuerza la descarga de arizapa.es)
# ================================================================
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
cd "$AQUI"

ORIGEN=""
if [ "$1" != "--bajar" ] && [ -f "../index.html" ]; then
  ORIGEN="../index.html"
  echo "Origen: ../index.html (copia de trabajo)"
else
  echo "Origen: https://arizapa.es/index.html (descargando)"
  if ! curl -fsS "https://arizapa.es/index.html?v=$(date +%s)" -o index-descargado.html; then
    echo
    echo "No se ha podido descargar el index.html publicado."
    echo "Suele ser que no hay internet, o que la red por la que sales lo bloquea."
    echo "Salidas:"
    echo "  · ./preparar.sh          usa ../index.html, la copia del repositorio"
    echo "  · o guarda a mano el fichero de https://arizapa.es/index.html"
    echo "    en esta carpeta como index-descargado.html y vuelve a lanzarlo"
    exit 1
  fi
  ORIGEN="index-descargado.html"
fi

cp "$ORIGEN" index.html

python3 - "$AQUI/index.html" <<'PY'
import sys, io

ruta = sys.argv[1]
s = io.open(ruta, encoding='utf-8').read()

cambios = [
  ('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm', './mock-supabase.js'),
  ('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js', './qrcode-local.js'),
]
for viejo, nuevo in cambios:
    if viejo not in s:
        print('AVISO: no se ha encontrado para sustituir: ' + viejo)
    s = s.replace(viejo, nuevo)

# Las funciones internas viven dentro de un módulo ES y no se ven desde fuera.
# Esta línea las deja a la vista para poder comprobar la lógica directamente,
# sin tener que simular clics para todo. Va SOLO en la copia de pruebas.
# Qué se deja a la vista. Cada nombre va en su propio try, de modo que si alguno
# desaparece o se renombra en el futuro el gancho no se rompe: el banco avisa de
# cuál falta en window.__T_FALTAN y las demás comprobaciones siguen funcionando.
NOMBRES = """
horasFacturables datosHoja acredita esAbierto marcoDeFecha criterioModificacion
evaluarIntervencion deduccionesIntervencion evaluarPeatonal evaluarCortafuegos
conservacionExpediente periodicidadMantenimiento datosMantenimiento
estadoEntregas pendientesAlFirmar salidaDocumental validarExpediente
expPendientes regimenDe prioridadDe oHueco nombrePeriodo perfilFuerza
periodicidadSugerida destinoDe nombreDoc docsPorDestino peligrosDe entregasDe
estadoExp versionesDe datosEmpresa fechaCorta fechaHora hoy procede
expIncumple EXP_ES_FABRICANTE migrarNotasCumple fotosQueFaltan
RECOM_PERIODICIDAD DOCS_EXPEDIENTE DESTINO_DOC HUECO EXP_ESTADO
SALIDAS_DOCUMENTALES RESULTADOS_INTERVENCION PREGUNTAS_MODIFICACION
SECUNDARIAS_MODIF RESPUESTAS_EQUIV RESPUESTAS_MODIF PREGUNTAS_PEATONAL
CAMPOS_CORTAFUEGOS EXP_COMPROBACIONES EXP_PRESTACIONES LIM_FUERZA_FABRICA
PRIORIDAD_DEFICIENCIA PRIORIDAD_ANTIGUA TIPOS_INTERVENCION
CONSERVACION_EXPEDIENTE ENTORNO_PUERTA ORIGEN_CICLOS MATRIZ_NO_APLICA_A
EXP_FAMILIA APLICA_COMPROBACION RESULTADO_COMPROBACION EXP_COMPONENTES
MODOS_ACCIONAMIENTO TIPOS_USUARIO MATRIZ_PROTECCION_FABRICA EXP_PUNTOS_FUERZA
PERFILES_FUERZA MEDIOS_ENTREGA RELACION_RECEPTOR CLASE_PENDIENTE
TIPOS_SIN_CUESTIONARIO PREGUNTAS_CRITICAS PREGUNTA_DESTINO VISTAS_FOTO
FOTOS_RECOMENDADAS CRITERIOS_MODIFICACION EXP_MARCO
REGLAS_FECHA ESTADO_REGLA fechaRegla reglaCompleta diasHasta reglasProximas
CLASES_VIDA recogerVida EXP_SITUACION ASISTENCIAS tipoAsis nombreTec
TABLAS_COPIA BUCKETS_COPIA crc32 crearZip sqlValor sqlInserts copiaUltima
copiaSeguridad listarBucket
normTxt buscarClientes lineaCliente elegirCliente estadoCliente pintarListaCliente
clienteDeLaPuertaDelAviso condicionesDelForm clausulasFabrica condicionCambiada
clausulasDelForm pintarClausulas
sumaMesesDia sumaMeses sumaDias opts dondeAsistencia periodicidadDe contratoVivo
iso deIso mesActual valoracionDe nombreCliente guardarCierre materialesDelForm
subirFotos subirDocs cambiarVisibilidad pintarFotos pintarDocs
correoDelParte enviarParte accionesAsis
centroDe centrosDe centroDePuerta direccionCentro puertasDeCentro sitioPuerta
datosCentro bloqueSitio dlgCentro pintarCentros pistaCentro centroElegido
componentesDe componentesMinimos familiaDePuerta proteccionDePuerta
seguridadSegunComponentes catalogoComponentes nombreComponente
COMPONENTE_SEGURIDAD COMPONENTES_SIEMPRE COMPONENTES_POR_NIVEL COMPONENTES_POR_TIPO
dlgComponente anadirComponentesMinimos sincronizarSeguridad
expTraerComponentes expGuardarComponentes subirDeComponente
expDe limitesFuerza
INFORME_MINISTERIO citaInforme informeAplicaA
COMPROBACIONES_A_CONTRASTAR comprobacionSinContrastar
FORMAS_PUERTA formaDePuerta nombreForma correderaGuiada porQueSinPeligros
PELIGROS_POR_TIPO TIPOS COMPONENTES_POR_TIPO FAMILIA_POR_TIPO APLICA_COMPROBACION
guionDe claveGuion GUION_POR_FORMA GUION_PROPIO guionDeForma GUIONES_FABRICA
panelLista guardarLista lista
guardarBorradorPuerta aplicarBorradorPuerta CAMPOS_PUERTA dlgPuerta dlgCliente
libroExpediente informeSituacion propuestaActuaciones actaEntrega vidaPuerta
hojaDeCampo libroMantenimiento etiquetaCE documentoDTE documentoCPF hojaParte
hojaContrato hojaImprimible etiquetaTermica expDe puertaDe clienteDe cargar
pintar peligrosDe cerrarDlg
S sb
""".split()

lineas = ['\n/* ===== Inyectado por preparar.sh SOLO en la copia de pruebas ===== */',
          'window.__T = {}; window.__T_FALTAN = [];']
for nombre in NOMBRES:
    lineas.append('try { window.__T.%s = %s; } catch(e){ window.__T_FALTAN.push("%s"); }'
                  % (nombre, nombre, nombre))
GANCHO = '\n'.join(lineas) + '\n'
marca = '\narranque();\n</script>'
if marca not in s:
    print('ERROR: no se ha encontrado el final del módulo para inyectar el gancho.')
    sys.exit(1)
s = s.replace(marca, GANCHO + marca)

io.open(ruta, 'w', encoding='utf-8').write(s)
print('index.html de pruebas preparado: %d bytes' % len(s.encode('utf-8')))
PY

# Playwright. Las suites son módulos ES, y ahí no vale NODE_PATH: hace falta un
# node_modules en esta carpeta. Si está instalado globalmente, se enlaza.
tiene_pw() { node --input-type=module -e "await import('playwright')" 2>/dev/null; }
if ! tiene_pw; then
  for G in /opt/npm-tools/node_modules /opt/node22/lib/node_modules "$(npm root -g 2>/dev/null)"; do
    if [ -d "$G/playwright" ] && [ ! -e "$AQUI/node_modules" ]; then
      ln -s "$G" "$AQUI/node_modules"
      echo "node_modules enlazado a $G"
      break
    fi
  done
fi
if ! tiene_pw; then
  echo "AVISO: no se encuentra playwright. Instálalo aquí con:  npm i playwright"
fi

# El servidor que hubiera, fuera. Se mata CUALQUIER servidor del banco, no solo el
# de esta carpeta: si quedó uno de otra copia del banco se queda con el puerto 8899
# y las pruebas acabarían midiendo un index.html que no es el que acabas de preparar.
pkill -f "servidor.py" 2>/dev/null || true
sleep 1
setsid nohup python3 "$AQUI/servidor.py" > "$AQUI/servidor.log" 2>&1 &
sleep 2
if curl -fsS -o /dev/null "http://127.0.0.1:8899/index.html"; then
  # Y se comprueba que quien responde es ESTA copia, no otra que se quedara el puerto
  SERVIDO="$(curl -fsS "http://127.0.0.1:8899/index.html" | wc -c)"
  LOCAL="$(wc -c < "$AQUI/index.html")"
  if [ "$SERVIDO" != "$LOCAL" ]; then
    echo "ERROR: en el puerto 8899 responde otra copia del banco ($SERVIDO bytes"
    echo "       frente a los $LOCAL de esta carpeta). Cierra ese servidor y repite."
    exit 1
  fi
  echo "Servidor en marcha: http://127.0.0.1:8899/index.html"
  echo "Ahora:  ./todas.sh"
else
  echo "ERROR: el servidor no responde. Mira servidor.log"
  exit 1
fi
