#!/usr/bin/env python3
# ============================================================================
# Safe2door · Monta la aplicación de ENSAYO a partir de la de producción
#
# POR QUÉ ES UN GUION Y NO UNA COPIA A MANO
# Porque la aplicación de ensayo tiene que ser la MISMA que la buena, salvo
# cuatro cosas. Si se hace a mano, al tercer cambio ya no lo es, y entonces
# probar en ensayo deja de demostrar nada sobre producción, que es justo para
# lo que existe.
#
# Esto se lanza después de cada entrega y vuelve a generarla entera.
#
# QUÉ CAMBIA, Y SOLO ESTO
#   1. La base de datos: apunta al proyecto de pruebas, no al de los clientes.
#   2. Se ve A SIMPLE VISTA que es la de ensayo: la cabecera cambia de color y
#      pone PRUEBAS, y arriba sale un aviso. Dos aplicaciones iguales con datos
#      distintos es la receta de meter la pata.
#   3. No se instala como aplicación ni guarda copia en el móvil: sin service
#      worker y sin manifiesto. En ensayo interesa que SIEMPRE cargue la última
#      versión, y no tener dos iconos iguales en la pantalla del teléfono.
#   4. Las rutas que suben un nivel, porque vive en una subcarpeta.
#
# Uso:  python3 pruebas/montar-ensayo.py
# ============================================================================
import io, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
ORIGEN = os.path.join(RAIZ, 'index.html')
CARPETA = os.path.join(RAIZ, 'ensayo')
DESTINO = os.path.join(CARPETA, 'index.html')

# ---- La base de pruebas ----
# La clave publishable es pública a propósito: va dentro de la página y la ve
# cualquiera que la abra. Quien de verdad decide qué se puede ver son las 67
# políticas de seguridad de la base. La secreta NO entra aquí ni en ningún otro
# sitio que acabe en el navegador.
URL_ENSAYO = 'https://djswcgeddryoateikmty.supabase.co'
KEY_ENSAYO = 'sb_publishable_cpVTC1priRmt6LS3JyckAQ_i_IDICyZ'

s = io.open(ORIGEN, encoding='utf-8').read()
original = s
cambios = []

def cambia(viejo, nuevo, nombre, veces=1):
    global s
    n = s.count(viejo)
    if n != veces:
        print('ERROR: «%s» aparece %d veces y esperaba %d.' % (nombre, n, veces))
        print('       La aplicación ha cambiado y este guion se ha quedado viejo.')
        sys.exit(1)
    s = s.replace(viejo, nuevo)
    cambios.append(nombre)

# ---- 1. A qué base apunta ----
u = re.search(r"const SUPA_URL = '([^']+)'", s)
k = re.search(r"const SUPA_KEY = '([^']+)'", s)
if not u or not k:
    print('ERROR: no encuentro SUPA_URL o SUPA_KEY en index.html.'); sys.exit(1)
if u.group(1) == URL_ENSAYO:
    print('ERROR: el index.html de la raíz ya apunta a la base de PRUEBAS.')
    print('       Eso no puede ser: la raíz es la aplicación buena. Párate aquí.')
    sys.exit(1)
cambia("const SUPA_URL = '%s'" % u.group(1),
       "const SUPA_URL = '%s'" % URL_ENSAYO, 'la URL de la base')
cambia("const SUPA_KEY = '%s'" % k.group(1),
       "const SUPA_KEY = '%s'" % KEY_ENSAYO, 'la clave de la base')

# ---- 2. Que se note ----
cambia('<title>Safe2door</title>',
       '<title>Safe2door · PRUEBAS</title>', 'el título de la pestaña')
cambia('<meta name="apple-mobile-web-app-title" content="Safe2door">',
       '<meta name="apple-mobile-web-app-title" content="Safe2door PRUEBAS">',
       'el nombre en el móvil')
cambia('<meta name="theme-color" content="#1C1817">',
       '<meta name="theme-color" content="#7A1F1F">', 'el color del navegador')

# La cabecera, que es lo único que se ve SIEMPRE, esté donde esté la pantalla.
cambia('<span class="marca"><i></i>safe<b>2</b>door</span>',
       '<span class="marca"><i></i>safe<b>2</b>door'
       '<span class="ens-eti">PRUEBAS</span></span>',
       'la marca de la cabecera')

ESTILO = """
/* ===== Solo en la aplicación de ENSAYO · lo pone pruebas/montar-ensayo.py =====
   Dos aplicaciones idénticas con datos distintos se confunden, y el día que se
   confunden se mete un cliente de verdad en la base de juguete, o al revés. Por
   eso la de ensayo va pintada de otro color de arriba abajo. */
.top{background:#7A1F1F !important}
.ens-eti{margin-left:10px;padding:2px 8px;border-radius:4px;background:#FCBA1D;
  color:#1C1817;font-family:var(--sans);font-size:12px;font-weight:700;
  letter-spacing:.06em}
#ens-aviso{padding:10px 16px;background:#7A1F1F;color:#fff;font-size:14px;
  line-height:1.45;text-align:center}
#ens-aviso b{color:#FCBA1D}
</style>"""
# Se mete al final del bloque de estilos de la PÁGINA, que es el PRIMER
# </style> del fichero, justo antes del <body>.
#
# Ojo con esto, que me costó un rato el 17-11-2026: la primera versión buscaba
# el ÚLTIMO </style> del fichero, y resulta que hay más, dentro de las cadenas
# de JavaScript que construyen los documentos que se imprimen. Así que el CSS
# se metía en medio de un trozo de código, rompía la aplicación entera y además
# no pintaba nada. Lo cazó el navegador al abrirla, no la revisión del código.
corte = s.find('</style>')
cuerpo = s.find('<body>')
if corte < 0 or cuerpo < 0 or corte > cuerpo:
    print('ERROR: no encuentro el bloque de estilos de la página, el que va')
    print('       antes del <body>. La aplicación ha cambiado de forma.')
    sys.exit(1)
s = s[:corte] + ESTILO[:-len('</style>')] + s[corte:]
cambios.append('el estilo propio del ensayo')

AVISO = ("""<div id="ens-aviso">Esto es la <b>APLICACIÓN DE PRUEBAS</b>. """
         """Lo que hagas aquí no sale de aquí: es otra base de datos, vacía, """
         """y no manda avisos a nadie.<br>La buena, con los clientes de verdad, """
         """está en <b>arizapa.es</b></div>\n""")
cambia('<body>\n', '<body>\n' + AVISO, 'el aviso de arriba')

# ---- 3. Sin service worker y sin manifiesto ----
# Y además se da de baja el que pudiera haber quedado de una visita anterior:
# si no, el navegador sigue sirviendo una copia guardada y uno se vuelve loco
# preguntándose por qué no ve el cambio que acaba de subir.
cambia("""if ('serviceWorker' in navigator && location.protocol === 'https:')
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));""",
"""/* En ensayo NO hay service worker: interesa que cargue siempre lo último.
   Y se quita el que hubiera quedado de antes, que si no sigue sirviendo una
   copia vieja y parece que los cambios no suben. (17-11-2026) */
if ('serviceWorker' in navigator)
  navigator.serviceWorker.getRegistrations()
    .then(rs => rs.forEach(r => r.unregister())).catch(()=>{});""",
       'el service worker')

cambia('<link rel="manifest" href="manifest.webmanifest">\n', '',
       'el manifiesto, para que no se instale como aplicación')

# ---- 4. Las rutas, que ahora viven un nivel más abajo ----
cambia('href="icon-192.png"', 'href="../icon-192.png"', 'el icono')
cambia('href="apple-touch-icon.png"', 'href="../apple-touch-icon.png"',
       'el icono de Apple')
for m in ['tecnico', 'oficina', 'formacion']:
    cambia("'./manuales/%s.md'" % m, "'../manuales/%s.md'" % m,
           'el manual de %s' % m)

# ---- Comprobaciones antes de escribir ----
if KEY_ENSAYO not in s or URL_ENSAYO not in s:
    print('ERROR: la base de ensayo no ha quedado puesta.'); sys.exit(1)
if u.group(1) in s or k.group(1) in s:
    print('ERROR: ha quedado dentro la base de PRODUCCIÓN. No se escribe nada.')
    sys.exit(1)
if len(s) < len(original) * 0.98:
    print('ERROR: el resultado ha salido mucho más corto que el original.')
    sys.exit(1)

os.makedirs(CARPETA, exist_ok=True)
io.open(DESTINO, 'w', encoding='utf-8').write(s)

print('Aplicación de ensayo montada: ensayo/index.html (%d bytes)' % len(s.encode('utf-8')))
for c in cambios:
    print('  · ' + c)
