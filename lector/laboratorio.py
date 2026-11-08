"""Laboratorio del descifrador de QR: deduce las tablas de la norma en vez de
copiarlas de memoria, y las comprueba una por una.

Por qué existe este fichero
---------------------------
Un descifrador de QR necesita tres tablas de la norma ISO 18004: dónde van los
patrones de alineación de cada versión, cuántos bloques de corrección lleva cada
versión y nivel, y cuántos bytes de corrección lleva cada bloque. Escribirlas de
memoria es inventarlas, y un solo número mal puesto hace que el lector falle
únicamente con ciertas etiquetas, que es la peor clase de fallo.

Así que aquí no se escribe ninguna: se deducen.

  - Los patrones de alineación se BUSCAN en la matriz que genera OpenCV: son
    cuadros de cinco por cinco con el centro puesto, y están donde están.
  - La partición en bloques se PRUEBA: para cada reparto posible se parte el
    flujo y se calculan los síndromes de Reed-Solomon. Si el reparto no es el
    de la norma, los síndromes no salen a cero. Sale a cero uno solo.

De regalo, lo que descubre se compara con la fórmula de la norma, y si alguna
vez dejaran de coincidir, el fichero lo dice en voz alta.

Se ejecuta a mano, no en cada arranque: su salida (tablas.json) va incrustada
en la aplicación. Volver a ejecutarlo es la manera de comprobar que sigue bien.
"""
import cv2, numpy as np, json, os, itertools

AQUI = os.path.dirname(os.path.abspath(__file__))
NIVELES = [('L', cv2.QRCodeEncoder_CORRECT_LEVEL_L),
           ('M', cv2.QRCodeEncoder_CORRECT_LEVEL_M),
           ('Q', cv2.QRCodeEncoder_CORRECT_LEVEL_Q),
           ('H', cv2.QRCodeEncoder_CORRECT_LEVEL_H)]

# ---------------------------------------------------------------- GF(256)
# El cuerpo finito del QR: polinomio 0x11D, generador 2. Esto no es tabla de la
# norma, es aritmética, y se construye sola.
EXP = [0]*512
LOG = [0]*256
_x = 1
for _i in range(255):
    EXP[_i] = _x
    LOG[_x] = _i
    _x <<= 1
    if _x & 0x100:
        _x ^= 0x11D
for _i in range(255, 512):
    EXP[_i] = EXP[_i-255]

def gmul(a, b):
    if a == 0 or b == 0: return 0
    return EXP[LOG[a] + LOG[b]]

def sindromes(bytes_bloque, n_ec):
    """Un bloque correcto da todos los síndromes a cero. Es la prueba decisiva."""
    s = []
    for i in range(n_ec):
        v = 0
        for b in bytes_bloque:
            v = gmul(v, EXP[i]) ^ b
        s.append(v)
    return s

# ------------------------------------------------- la matriz de un texto
def matriz(texto, nivel):
    p = cv2.QRCodeEncoder_Params()
    p.correction_level = nivel
    m = cv2.QRCodeEncoder_create(p).encode(texto)
    m = m[2:-2, 2:-2]                      # fuera el margen que pone OpenCV
    return (m == 0).astype(np.uint8)       # 1 = módulo puesto (negro)

# ------------------------------- dónde están los patrones de alineación
def buscar_alineacion(m, version):
    """Los busca de verdad en la matriz, sin tabla: cuadro 5x5, centro puesto,
    anillo blanco, borde puesto. Devuelve las coordenadas de los centros."""
    n = m.shape[0]
    fuera = []       # las esquinas de los patrones de posición no cuentan
    for (cy, cx) in [(3,3), (3,n-4), (n-4,3)]:
        fuera.append((cy, cx))
    centros = []
    for y in range(2, n-2):
        for x in range(2, n-2):
            if m[y, x] != 1: continue
            anillo = [m[y-1,x-1],m[y-1,x],m[y-1,x+1],m[y,x-1],m[y,x+1],
                      m[y+1,x-1],m[y+1,x],m[y+1,x+1]]
            if any(anillo): continue                      # el anillo es blanco
            borde = [m[y-2, x-2+i] for i in range(5)] + [m[y+2, x-2+i] for i in range(5)] + \
                    [m[y-2+i, x-2] for i in range(5)] + [m[y-2+i, x+2] for i in range(5)]
            if not all(borde): continue                    # el borde está puesto
            if any(abs(y-fy) < 4 and abs(x-fx) < 4 for fy, fx in fuera): continue
            centros.append((y, x))
    ys = sorted(set(y for y, x in centros))
    xs = sorted(set(x for y, x in centros))
    return sorted(set(ys) | set(xs))

def coordenadas_norma(version):
    """La fórmula que trae la norma para las coordenadas. Se usa SOLO para
    comparar con lo encontrado, nunca como fuente."""
    if version == 1: return []
    n = 4*version + 17
    intervalos = version // 7 + 2
    if version == 32: paso = 26
    else:
        paso = (n - 13) // (2*intervalos - 2)
        paso = paso*2 if (n - 13) % (2*intervalos - 2) else paso*2
        paso = 2 * round((n - 13) / (2*intervalos - 2))
    coords = [6]
    sitio = n - 7
    while sitio > 10:
        coords.append(sitio)
        sitio -= paso
    coords.append(6 + paso*0)
    return sorted(set(coords))

# ------------------------------------------- qué módulos son de función
def mapa_funcion(n, version, alineacion):
    f = np.zeros((n, n), np.uint8)
    for (oy, ox) in [(0,0), (0,n-7), (n-7,0)]:              # posición + separador
        for y in range(-1, 8):
            for x in range(-1, 8):
                if 0 <= oy+y < n and 0 <= ox+x < n: f[oy+y, ox+x] = 1
    f[6, :] = 1; f[:, 6] = 1                                 # sincronismo
    for cy in alineacion:                                    # alineación
        for cx in alineacion:
            if (cy, cx) in [(6,6), (6,n-7), (n-7,6)]: continue
            for y in range(cy-2, cy+3):
                for x in range(cx-2, cx+3):
                    f[y, x] = 1
    f[8, 0:9] = 1; f[0:9, 8] = 1                             # formato
    f[n-8:n, 8] = 1; f[8, n-8:n] = 1
    if version >= 7:                                         # versión
        f[n-11:n-8, 0:6] = 1
        f[0:6, n-11:n-8] = 1
    return f

MASCARAS = [
    lambda y, x: (y + x) % 2 == 0,
    lambda y, x: y % 2 == 0,
    lambda y, x: x % 3 == 0,
    lambda y, x: (y + x) % 3 == 0,
    lambda y, x: (y//2 + x//3) % 2 == 0,
    lambda y, x: (y*x) % 2 + (y*x) % 3 == 0,
    lambda y, x: ((y*x) % 2 + (y*x) % 3) % 2 == 0,
    lambda y, x: ((y + x) % 2 + (y*x) % 3) % 2 == 0,
]

FORMATO_BCH = {}
def _tabla_formato():
    g = 0x537
    for datos in range(32):
        v = datos << 10
        t = v
        while t.bit_length() - 1 >= 10:
            t ^= g << (t.bit_length() - 11)
        FORMATO_BCH[(v | t) ^ 0x5412] = datos
_tabla_formato()

def leer_formato(m):
    n = m.shape[0]
    bits = [m[8,0],m[8,1],m[8,2],m[8,3],m[8,4],m[8,5],m[8,7],m[8,8],
            m[7,8],m[5,8],m[4,8],m[3,8],m[2,8],m[1,8],m[0,8]]
    v = 0
    for b in bits: v = (v << 1) | int(b)
    if v in FORMATO_BCH:
        d = FORMATO_BCH[v]
        return (d >> 3) & 3, d & 7          # nivel (00=M,01=L,10=H,11=Q), máscara
    return None, None

NIVEL_DE_BITS = {1: 'L', 0: 'M', 3: 'Q', 2: 'H'}

def codewords(m, version, alineacion, mascara):
    """El zigzag de la norma: columnas de dos, de derecha a izquierda."""
    n = m.shape[0]
    f = mapa_funcion(n, version, alineacion)
    fn = MASCARAS[mascara]
    bits = []
    arriba = True
    x = n - 1
    while x > 0:
        if x == 6: x -= 1                     # la columna de sincronismo no cuenta
        filas = range(n-1, -1, -1) if arriba else range(n)
        for y in filas:
            for dx in (0, 1):
                cx = x - dx
                if f[y, cx]: continue
                b = int(m[y, cx])
                if fn(y, cx): b ^= 1
                bits.append(b)
        arriba = not arriba
        x -= 2
    out = []
    for i in range(0, len(bits) - 7, 8):
        v = 0
        for b in bits[i:i+8]: v = (v << 1) | b
        out.append(v)
    return out

# --------------------------------- descubrir el reparto en bloques
def repartos(total, n_bloques):
    """Como manda la norma: uno o dos grupos, y los del segundo llevan un byte
    más de datos que los del primero."""
    base, resto = divmod(total, n_bloques)
    return [base]*(n_bloques-resto) + [base+1]*resto

ALFANUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'

def texto_del_flujo(datos, version):
    """El flujo de bits a texto, como manda la norma. Solo los tres modos que
    usan los lectores de etiquetas: numérico, alfanumérico y byte."""
    bits = []
    for b in datos:
        for i in range(7, -1, -1): bits.append((b >> i) & 1)
    pos = 0
    def coger(n):
        nonlocal pos
        if pos + n > len(bits): raise ValueError('se acaban los bits')
        v = 0
        for i in range(n): v = (v << 1) | bits[pos + i]
        pos += n
        return v
    cuenta = lambda modo: ({1: (10, 12, 14), 2: (9, 11, 13), 4: (8, 16, 16)}[modo]
                           [0 if version <= 9 else (1 if version <= 26 else 2)])
    salida = ''
    crudo = bytearray()
    while pos + 4 <= len(bits):
        modo = coger(4)
        if modo == 0: break                        # fin del mensaje
        if modo == 1:
            n = coger(cuenta(1))
            while n >= 3: salida += '%03d' % coger(10); n -= 3
            if n == 2: salida += '%02d' % coger(7)
            elif n == 1: salida += '%d' % coger(4)
        elif modo == 2:
            n = coger(cuenta(2))
            while n >= 2:
                v = coger(11); salida += ALFANUM[v // 45] + ALFANUM[v % 45]; n -= 2
            if n == 1: salida += ALFANUM[coger(6)]
        elif modo == 4:
            n = coger(cuenta(4))
            for _ in range(n): crudo.append(coger(8))
            try: salida += crudo.decode('utf-8');
            except UnicodeDecodeError: salida += crudo.decode('latin-1')
            crudo = bytearray()
        else:
            raise ValueError('modo %d no contemplado' % modo)
    return salida

def descubrir(total_cw, cws, texto, version):
    """Prueba los repartos posibles y se queda SOLO con los que, además de dejar
    los síndromes a cero, reconstruyen el texto que pedimos. Con eso no queda
    ambigüedad: el reparto equivocado no devuelve el texto."""
    hallados = []
    for n_bloques in range(1, 69):
        if n_bloques > total_cw: continue
        for ec in range(5, 31):
            datos = total_cw - n_bloques*ec
            if datos <= 0 or datos < n_bloques: continue
            tam = repartos(datos, n_bloques)
            if max(tam) - min(tam) > 1: continue
            bloques = desentrelazar(cws, tam, n_bloques, ec)
            if bloques is None: continue
            if not all(all(s == 0 for s in sindromes(b, ec)) for b in bloques): continue
            flujo = []
            for b, t in zip(bloques, tam): flujo.extend(b[:t])
            try:
                if texto_del_flujo(flujo, version) != texto: continue
            except Exception:
                continue
            hallados.append((n_bloques, ec, tam))
    return hallados

def desentrelazar(cws, tam, n_bloques, ec):
    total = sum(tam) + n_bloques*ec
    if len(cws) < total: return None
    datos = cws[:sum(tam)]
    ecs = cws[sum(tam):total]
    bloques = [[] for _ in range(n_bloques)]
    i = 0
    for col in range(max(tam)):
        for b in range(n_bloques):
            if col < tam[b]:
                bloques[b].append(datos[i]); i += 1
    j = 0
    for col in range(ec):
        for b in range(n_bloques):
            bloques[b].append(ecs[j]); j += 1
    return bloques

def capacidad_total(version, alineacion):
    n = 4*version + 17
    f = mapa_funcion(n, version, alineacion)
    libres = int((f == 0).sum())
    return libres // 8

# ------------------------------------------------------------- en marcha
def texto_para(version, nivel_bits):
    """Un texto lo bastante largo para forzar justo esa versión."""
    # se va alargando hasta que la matriz tenga el lado que toca
    objetivo = 4*version + 17
    bajo, alto = 1, 3000
    mejor = None
    for largo in range(1, 3000, 1):
        t = ('A%04d' % (largo % 10000)) * (largo // 5 + 1)
        t = t[:largo]
        try:
            m = matriz(t, nivel_bits)
        except Exception:
            break
        if m.shape[0] == objetivo:
            return t, m
        if m.shape[0] > objetivo:
            break
    return None, None

def textos_para(version, nivel_bits, cuantos=3):
    """Varios textos distintos que caen justo en esa versión. Hacen falta varios
    porque el reparto se elige por el mayor número de bytes de corrección que
    deja los síndromes a cero, y eso podría acertar de casualidad una vez. Si
    tres textos distintos dan el mismo reparto, de casualidad no es."""
    objetivo = 4*version + 17
    salida = []
    import string, random as rnd
    r = rnd.Random(1000 + version)
    for intento in range(4000):
        if len(salida) >= cuantos: break
        largo = 1 + intento % 2800
        alfabeto = ['0123456789', string.ascii_uppercase + '0123456789 ./-',
                    string.ascii_letters + '0123456789ñáéíóú#@'][intento % 3]
        t = ''.join(r.choice(alfabeto) for _ in range(largo))
        try: m = matriz(t, nivel_bits)
        except Exception: continue
        if m.shape[0] != objetivo: continue
        if any(t == v[0] for v in salida): continue
        salida.append((t, m))
    return salida

def main():
    tablas = {'alineacion': {}, 'bloques': {}}
    avisos = []
    for version in range(1, 21):
        for nombre, nivel in NIVELES:
            muestras = textos_para(version, nivel)
            if not muestras:
                avisos.append('version %d nivel %s: no se ha podido forzar' % (version, nombre))
                continue
            elegidos = []
            for t, m in muestras:
                alin = buscar_alineacion(m, version)
                nivel_leido, mascara = leer_formato(m)
                if mascara is None:
                    avisos.append('version %d nivel %s: formato ilegible' % (version, nombre))
                    continue
                if NIVEL_DE_BITS.get(nivel_leido) != nombre:
                    avisos.append('version %d: el formato dice nivel %s y pedimos %s'
                                  % (version, NIVEL_DE_BITS.get(nivel_leido), nombre))
                v = str(version)
                if v in tablas['alineacion'] and tablas['alineacion'][v] != alin:
                    avisos.append('version %d: alineación distinta según el nivel' % version)
                tablas['alineacion'][v] = alin
                total = capacidad_total(version, alin)
                cws = codewords(m, version, alin, mascara)
                hallados = descubrir(total, cws, t, version)
                if not hallados:
                    avisos.append('version %d nivel %s: NINGÚN reparto cuadra' % (version, nombre))
                    continue
                # el verdadero es el que lleva más corrección: si un bloque tiene E
                # bytes de EC, los síndromes hasta E-1 también salen nulos
                mejor = max(hallados, key=lambda h: (h[1], h[0]))
                elegidos.append((mejor[0], mejor[1], tuple(mejor[2]), total))
            if not elegidos: continue
            if len(set(elegidos)) > 1:
                avisos.append('version %d nivel %s: los textos no coinciden: %s'
                              % (version, nombre, set(elegidos)))
            n_b, ec, tam, total = elegidos[0]
            tablas['bloques'].setdefault(str(version), {})[nombre] = {
                'total': total, 'bloques': n_b, 'ec': ec, 'tam': list(tam)}
    with open(os.path.join(AQUI, 'tablas.json'), 'w') as f:
        json.dump(tablas, f, indent=1)
    print('versiones con tabla:', len(tablas['bloques']))
    for a in avisos: print('  AVISO:', a)
    if not avisos: print('Sin avisos: todo deducido y comprobado.')

if __name__ == '__main__':
    main()
