"""Generador de códigos de barras del fabricante, para examinar nuestro lector.

Por qué hace falta generarlos aquí
----------------------------------
OpenCV sabe LEER códigos de barras 1D, pero no sabe dibujarlos. Así que el
dibujo lo hace este fichero, y el examen lo pone OpenCV: si OpenCV lee en
nuestro dibujo exactamente el número que le pedimos, es que el dibujo está
bien, y entonces ese dibujo sirve para examinar a nuestro lector. Si una tabla
estuviera mal puesta, OpenCV no leería el número correcto y se sabría al
momento.

Eso cubre EAN-13, EAN-8 y UPC-A.

Code 128 es distinto: OpenCV no lo lee, así que para ese no hay juez de fuera.
Lo que se comprueba aquí son las reglas de la propia norma, que son
comprobables sin juez:
  · los 107 patrones miden 11 módulos cada uno,
  · cada patrón tiene tres barras y tres espacios,
  · los 107 patrones son distintos entre sí,
  · y el dígito de control es el de la norma, módulo 103.
Con eso, una tabla mal puesta no puede dar una lectura falsa: fallaría el
dígito de control y el lector diría que no lee, que es lo que tiene que hacer.
Pero Code 128 no quedará dado por bueno hasta probarlo con cajas de verdad del
almacén.
"""
import cv2, numpy as np, os, json

AQUI = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- EAN / UPC
# Los tres juegos de barras de la norma. Cada dígito son siete módulos.
L = ['0001101','0011001','0010011','0111101','0100011',
     '0110001','0101111','0111011','0110111','0001011']
G = ['0100111','0110011','0011011','0100001','0011101',
     '0111001','0000101','0010001','0001001','0010111']
R = [''.join('1' if c == '0' else '0' for c in p) for p in L]   # R es el inverso de L
# Qué juego usa cada uno de los seis dígitos de la izquierda, según el primero
PARIDAD = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG',
           'LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL']

def control_ean13(doce):
    """El dígito de control de la norma: pesos 1 y 3 alternos desde la izquierda."""
    s = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(doce))
    return str((10 - s % 10) % 10)

def control_ean8(siete):
    s = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(siete))
    return str((10 - s % 10) % 10)

def ean13(numero):
    """Devuelve (modulos, numero_completo). Acepta 12 cifras y le pone el control."""
    n = ''.join(ch for ch in str(numero) if ch.isdigit())
    if len(n) == 12: n += control_ean13(n)
    if len(n) != 13: raise ValueError('un EAN-13 son 12 o 13 cifras: ' + n)
    if control_ean13(n[:12]) != n[12]: raise ValueError('el dígito de control no cuadra: ' + n)
    izq = PARIDAD[int(n[0])]
    bits = '101'
    for i, d in enumerate(n[1:7]):
        bits += (L if izq[i] == 'L' else G)[int(d)]
    bits += '01010'
    for d in n[7:]:
        bits += R[int(d)]
    return bits + '101', n

def ean8(numero):
    n = ''.join(ch for ch in str(numero) if ch.isdigit())
    if len(n) == 7: n += control_ean8(n)
    if len(n) != 8: raise ValueError('un EAN-8 son 7 u 8 cifras: ' + n)
    bits = '101' + ''.join(L[int(d)] for d in n[:4]) + '01010' + \
           ''.join(R[int(d)] for d in n[4:]) + '101'
    return bits, n

def upca(numero):
    """UPC-A son doce cifras y se dibuja como un EAN-13 que empieza por cero."""
    n = ''.join(ch for ch in str(numero) if ch.isdigit())
    if len(n) == 11: n += control_ean13('0' + n)
    if len(n) != 12: raise ValueError('un UPC-A son 11 o 12 cifras: ' + n)
    bits, completo = ean13('0' + n)
    return bits, n

# ------------------------------------------------------------------ Code 128
# Los 107 patrones de la norma, como anchos de sus seis elementos: barra,
# espacio, barra, espacio, barra, espacio. Cada patrón suma 11 módulos.
C128_ANCHOS = [
    '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
    '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
    '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
    '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
    '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
    '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
    '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
    '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
    '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
    '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
    '114131','311141','411131','211412','211214','211232','233111',
]
C128_START_A, C128_START_B, C128_START_C = 103, 104, 105
C128_STOP = 106

def _c128_bits(valores):
    """De una lista de valores de la tabla a los módulos."""
    bits = ''
    for v in valores:
        anchos = C128_ANCHOS[v]
        negro = True
        for a in anchos:
            bits += ('1' if negro else '0') * int(a)
            negro = not negro
    return bits

def code128(texto, juego='B'):
    """Code 128 en juego B (letras y números) o C (parejas de cifras)."""
    t = str(texto)
    if juego == 'C':
        if len(t) % 2 or not t.isdigit():
            raise ValueError('el juego C son parejas de cifras: ' + t)
        datos = [int(t[i:i+2]) for i in range(0, len(t), 2)]
        inicio = C128_START_C
    else:
        for ch in t:
            if not (32 <= ord(ch) <= 126):
                raise ValueError('el juego B solo lleva caracteres imprimibles: ' + t)
        datos = [ord(ch) - 32 for ch in t]
        inicio = C128_START_B
    # dígito de control de la norma: suma ponderada por la posición, módulo 103
    suma = inicio
    for i, v in enumerate(datos, start=1):
        suma += v * i
    control = suma % 103
    valores = [inicio] + datos + [control, C128_STOP]
    # el stop lleva dos módulos más de barra final, que son parte del patrón
    bits = _c128_bits(valores) + '11'
    return bits, t

# ------------------------------------------------------- de módulos a imagen
def imagen(bits, modulo=3, alto=120, margen=10, borde_blanco=True):
    """Los módulos a una imagen, con la zona muda que pide la norma."""
    muda = 10 * modulo if borde_blanco else 0
    an = len(bits) * modulo + 2 * muda
    img = np.full((alto + 2 * margen, an), 255, np.uint8)
    for i, b in enumerate(bits):
        if b == '1':
            x = muda + i * modulo
            img[margen:margen + alto, x:x + modulo] = 0
    return img

def comprueba_con_opencv(img, esperado):
    """El examen de fuera: OpenCV tiene que leer lo que pedimos."""
    d = cv2.barcode.BarcodeDetector()
    ok, textos, tipos, _ = d.detectAndDecodeWithType(img)
    if not ok or not textos: return False, ''
    leido = [t for t in textos if t]
    return (esperado in leido), (leido[0] if leido else '')

# ------------------------------------- comprobaciones de la tabla de Code 128
def comprobar_tabla_c128():
    fallos = []
    if len(C128_ANCHOS) != 107:
        fallos.append('la tabla tiene %d patrones y la norma son 107' % len(C128_ANCHOS))
    for i, a in enumerate(C128_ANCHOS):
        if len(a) != 6:
            fallos.append('el patrón %d no tiene seis elementos: %s' % (i, a))
        if sum(int(c) for c in a) != 11:
            fallos.append('el patrón %d no suma 11 módulos: %s' % (i, a))
    if len(set(C128_ANCHOS)) != len(C128_ANCHOS):
        from collections import Counter
        rep = [p for p, n in Counter(C128_ANCHOS).items() if n > 1]
        fallos.append('hay patrones repetidos: %s' % rep)
    return fallos

if __name__ == '__main__':
    fallos = comprobar_tabla_c128()
    print('tabla de Code 128:', 'bien' if not fallos else 'CON FALLOS')
    for f in fallos: print('   ', f)
    # y una prueba rápida de que OpenCV lee lo que dibujamos
    for nombre, (bits, num) in [('EAN-13', ean13('840012345678')),
                                ('EAN-8', ean8('1234567')),
                                ('UPC-A', upca('03600029145'))]:
        img = imagen(bits, modulo=3)
        ok, leido = comprueba_con_opencv(img, num)
        print('%-7s %-14s OpenCV lee: %-14s %s' % (nombre, num, leido or '(nada)', 'OK' if ok else 'NO'))

# ---------------------------------------------------------------------------
# Code 39 · añadido el 08-11-2026
#
# POR QUÉ ESTABA FALTANDO
# David mandó ocho fotos de cajas reales. La caja de la fotocélula Geba lleva
# un código que no es EAN ni Code 128: es Code 39. Sin esto, el lector no
# podía leerla por bien que funcionase todo lo demás. Es un formato muy usado
# por los fabricantes para la referencia interna del artículo, y en este
# sector se lo vamos a encontrar a menudo.
#
# LA TABLA NO SE COPIA: SE DEDUCE
# Cada carácter son nueve elementos (cinco barras y cuatro espacios,
# alternando) de los que EXACTAMENTE tres son anchos. De ahí el nombre «3 de
# 9». La familia normal lleva dos barras anchas y un espacio ancho; eso son
# C(5,2) x C(4,1) = 40 combinaciones. Los cuatro caracteres especiales
# ($ / + %) llevan tres espacios anchos y ninguna barra ancha: 4 más. Total
# 44, que son justo los 44 caracteres de Code 39.
#
# El sitio de cada carácter dentro de su bloque de diez sale del viejo esquema
# «1-2-4-7»: las cuatro primeras barras pesan 1, 2, 4 y 7, la quinta solo está
# para que siempre haya dos barras anchas, y la suma de los pesos de las
# barras anchas da el sitio (el 11, que es 4+7, hace de décimo). Cuál de los
# cuatro espacios es el ancho dice de qué bloque se trata.
#
# QUIÉN LO DA POR BUENO
# OpenCV no lee Code 39, así que aquí tampoco hay juez de fuera. Lo que da por
# buena esta tabla es la foto de David: aplicada a las barras de la caja Geba
# sale «505.LS6A.RP», que es exactamente lo que lleva impreso la etiqueta en
# «Art.Nr.». Eso lo comprueba pruebas/barras.mjs con las rachas medidas en la
# foto, que están guardadas ahí para que la comprobación no dependa de tener
# la foto delante.
# ---------------------------------------------------------------------------
from itertools import combinations as _comb

C39_PESOS = [1, 2, 4, 7]
C39_BLOQUES = ['1234567890', 'ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZ-. *']
C39_ESPACIO_ANCHO = [1, 2, 3, 0]        # qué espacio es el ancho en cada bloque
C39_ESPECIALES = '$/+%'

def _c39_tabla():
    t = {}
    for nb, letras in enumerate(C39_BLOQUES):
        for i, j in _comb(range(5), 2):
            v = sum(C39_PESOS[k] for k in (i, j) if k < 4)
            sitio = 10 if v == 11 else v
            if sitio < 1 or sitio > 10:
                continue
            p = [0] * 9
            p[i*2] = 1
            p[j*2] = 1
            p[C39_ESPACIO_ANCHO[nb]*2 + 1] = 1
            t[''.join(map(str, p))] = letras[sitio-1]
    # los cuatro especiales: tres espacios anchos, ninguna barra ancha
    for n, ss in enumerate(_comb(range(4), 3)):
        p = [0] * 9
        for s in ss:
            p[s*2 + 1] = 1
        t[''.join(map(str, p))] = C39_ESPECIALES[n]
    return t

C39 = _c39_tabla()                       # patrón (9 ceros y unos) -> carácter
C39_POR_CARACTER = {v: k for k, v in C39.items()}

def code39(texto):
    """Dibuja un Code 39 con sus asteriscos de arranque y cierre.

    Ancho estrecho 1, ancho 3 (lo que manda la norma para lectura a distancia),
    y un módulo de separación entre carácter y carácter.
    """
    t = str(texto).upper()
    for ch in t:
        if ch not in C39_POR_CARACTER or ch == '*':
            raise ValueError('Code 39 no lleva el carácter «%s»' % ch)
    bits = ''
    for ch in '*' + t + '*':
        p = C39_POR_CARACTER[ch]
        for i, ancho in enumerate(p):
            bits += ('1' if i % 2 == 0 else '0') * (3 if ancho == '1' else 1)
        bits += '0'                      # el espacio que separa caracteres
    return bits[:-1], t

def comprobar_tabla_c39():
    """Las reglas de la norma, que se pueden comprobar sin juez de fuera."""
    fallos = []
    if len(C39) != 44:
        fallos.append('la tabla tiene %d patrones y Code 39 son 44' % len(C39))
    for p, c in C39.items():
        if len(p) != 9:
            fallos.append('el patrón de «%s» no tiene nueve elementos' % c)
        if p.count('1') != 3:
            fallos.append('el patrón de «%s» no tiene tres anchos: %s' % (c, p))
        barras_anchas = sum(1 for i in range(0, 9, 2) if p[i] == '1')
        if c in C39_ESPECIALES:
            if barras_anchas != 0:
                fallos.append('«%s» es especial y tiene barras anchas' % c)
        elif barras_anchas != 2:
            fallos.append('«%s» no tiene dos barras anchas: %s' % (c, p))
    if len(set(C39.values())) != 44:
        fallos.append('hay caracteres repetidos en la tabla')
    return fallos
