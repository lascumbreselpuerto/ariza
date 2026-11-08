"""Banco de códigos de barras para examinar el lector.

Cada caso lleva dos cosas escritas: el número que debe salir y si OpenCV, que
es de fuera, confirma que el dibujo está bien. Los casos que OpenCV no
confirma se marcan, y en el resultado se cuentan aparte: así no se confunde
«mi dibujo está mal» con «mi lector no lee».

Code 128 no lo lee OpenCV, así que esos casos van marcados como sin juez de
fuera y se dicen aparte en el resultado. Quedan pendientes de las cajas reales
del almacén.
"""
import cv2, numpy as np, json, os, random, barras

AQUI = os.path.dirname(os.path.abspath(__file__))
SAL = os.path.join(AQUI, 'casos-barras')
os.makedirs(SAL, exist_ok=True)
r = random.Random(20261108)

def pgm(ruta, img):
    h, w = img.shape
    with open(ruta, 'wb') as f:
        f.write(('P5\n%d %d\n255\n' % (w, h)).encode())
        f.write(np.ascontiguousarray(img.astype(np.uint8)).tobytes())

def juez(bits, numero):
    """Busca una escala donde OpenCV confirme el dibujo. El detector de OpenCV
    es quisquilloso con el tamaño, así que no encontrarla no quiere decir que
    el dibujo esté mal; solo que no se ha podido confirmar."""
    d = cv2.barcode.BarcodeDetector()
    for mod, alto in [(2,160),(2,200),(2,120),(3,170),(2,240),(4,200)]:
        img = barras.imagen(bits, modulo=mod, alto=alto)
        ok, t, tip, _ = d.detectAndDecodeWithType(img)
        if ok and t:
            for x in t:
                if x == numero or ('0' + x) == numero:
                    return True
    return False

# ------------------------------------------------------------- maltratos
def girar(img, grados):
    h, w = img.shape
    lado = int((h*h + w*w) ** 0.5) + 4
    l = np.full((lado, lado), 255, np.uint8)
    oy, ox = (lado - h)//2, (lado - w)//2
    l[oy:oy+h, ox:ox+w] = img
    M = cv2.getRotationMatrix2D((lado/2, lado/2), grados, 1.0)
    return cv2.warpAffine(l, M, (lado, lado), flags=cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=255)

def desenfocar(img, k): return cv2.GaussianBlur(img, (k, k), 0)

def ruido(img, s):
    n = np.random.default_rng(5).normal(0, s, img.shape)
    return np.clip(img.astype(np.float32) + n, 0, 255).astype(np.uint8)

def sombra(img, f):
    h, w = img.shape
    g = np.outer(np.linspace(1, 1-f/2, h), np.linspace(1, 1-f, w))
    return np.clip(img.astype(np.float32) * g, 0, 255).astype(np.uint8)

def en_caja(img, ancho=640, alto=480):
    """El código como está de verdad: pegado en una caja de cartón, con letras
    y rayas alrededor que el lector tiene que descartar."""
    h, w = img.shape
    esc = min(1.0, (ancho * 0.7) / w)
    peq = cv2.resize(img, (max(20, int(w*esc)), max(10, int(h*esc))), interpolation=cv2.INTER_AREA)
    ph, pw = peq.shape
    fondo = np.full((alto, ancho), 196, np.uint8)
    rng = np.random.default_rng(9)
    for _ in range(18):            # letras y rayas del cartón
        x, y = int(rng.integers(0, max(1, ancho-80))), int(rng.integers(0, max(1, alto-30)))
        fondo[y:y+int(rng.integers(3, 14)), x:x+int(rng.integers(10, 70))] = int(rng.integers(60, 160))
    oy, ox = (alto - ph)//2, (ancho - pw)//2
    fondo[oy:oy+ph, ox:ox+pw] = peq
    return fondo

def tapar_abajo(img, parte):
    """Un dedo o un trozo de precinto por la parte baja: el código se lee por
    las líneas de arriba, que es para lo que es alto."""
    out = img.copy()
    h = out.shape[0]
    out[int(h*(1-parte)):, :] = 255
    return out

casos = []
def meter(nombre, numero, tipo, img, nota, confirmado):
    pgm(os.path.join(SAL, nombre + '.pgm'), img)
    casos.append({'nombre': nombre, 'texto': numero, 'tipo': tipo, 'nota': nota,
                  'fichero': nombre + '.pgm', 'opencv': confirmado})

# ---- EAN-13, EAN-8, UPC-A: con juez de fuera
PRUEBAS = []
for n in ['8412345678905', '4006381333931', '8400123456784']:
    PRUEBAS.append(('ean13', n[:12], 'EAN-13'))
for n in ['12345670', '96385074']:
    PRUEBAS.append(('ean8', n[:7], 'EAN-8'))
for n in ['036000291452', '012345678905']:
    PRUEBAS.append(('upca', n[:11], 'UPC-A'))

for idx, (clase, dato, tipo) in enumerate(PRUEBAS):
    if clase == 'ean13': bits, num = barras.ean13(dato)
    elif clase == 'ean8': bits, num = barras.ean8(dato)
    else:
        bits, doce = barras.upca(dato)
        num = '0' + doce                      # normalizado a trece, como el lector
    conf = juez(bits, num if clase != 'upca' else num[1:])
    base = barras.imagen(bits, modulo=3, alto=140)
    meter('%s%d-limpio' % (clase, idx), num, tipo, base, '%s tal cual' % tipo, conf)
    for gr in (2, 5, 10, 90, 180):
        meter('%s%d-giro%d' % (clase, idx, gr), num, tipo, girar(base, gr),
              '%s girado %dº' % (tipo, gr), conf)
    for k in (3, 5, 9):
        meter('%s%d-borroso%d' % (clase, idx, k), num, tipo, desenfocar(base, k),
              '%s desenfocado %d' % (tipo, k), conf)
    for s in (10, 25, 40):
        meter('%s%d-ruido%d' % (clase, idx, s), num, tipo, ruido(base, s),
              '%s con ruido %d' % (tipo, s), conf)
    for f in (0.3, 0.6):
        meter('%s%d-sombra%d' % (clase, idx, int(f*100)), num, tipo, sombra(base, f),
              '%s con sombra %d%%' % (tipo, int(f*100)), conf)
    for mod in (1, 2, 5):
        b2 = barras.imagen(bits, modulo=mod, alto=120)
        meter('%s%d-mod%d' % (clase, idx, mod), num, tipo, b2,
              '%s con barras de %d píxel%s' % (tipo, mod, '' if mod == 1 else 'es'), conf)
    meter('%s%d-encaja' % (clase, idx), num, tipo, en_caja(base),
          '%s pegado en una caja, con cosas alrededor' % tipo, conf)
    for p in (0.3, 0.6):
        meter('%s%d-tapado%d' % (clase, idx, int(p*100)), num, tipo, tapar_abajo(base, p),
              '%s con la parte de abajo tapada un %d%%' % (tipo, int(p*100)), conf)
    meter('%s%d-real' % (clase, idx), num, tipo,
          ruido(desenfocar(girar(en_caja(base), 4), 3), 12),
          '%s en una caja, torcido, desenfocado y con ruido' % tipo, conf)

# ---- Code 128: SIN juez de fuera
C128 = [('ERREKA-FT20', 'B'), ('ASO 45.25', 'B'), ('REF/1234-A', 'B'),
        ('12345678', 'C'), ('8412345678905', None)]
for idx, (dato, juego) in enumerate(C128):
    if juego is None:
        bits, txt = barras.code128(dato, 'C' if len(dato) % 2 == 0 else 'B')
    else:
        bits, txt = barras.code128(dato, juego)
    base = barras.imagen(bits, modulo=3, alto=140)
    meter('c128_%d-limpio' % idx, txt, 'Code 128', base,
          'Code 128 «%s» tal cual' % txt, False)
    meter('c128_%d-giro5' % idx, txt, 'Code 128', girar(base, 5),
          'Code 128 «%s» girado 5º' % txt, False)
    meter('c128_%d-borroso' % idx, txt, 'Code 128', desenfocar(base, 5),
          'Code 128 «%s» desenfocado' % txt, False)
    meter('c128_%d-encaja' % idx, txt, 'Code 128', en_caja(base),
          'Code 128 «%s» pegado en una caja' % txt, False)
    meter('c128_%d-sombra' % idx, txt, 'Code 128', sombra(base, 0.5),
          'Code 128 «%s» con sombra' % txt, False)

# ---- y lo que NO debe leer
rng = np.random.default_rng(4)
for n in range(10):
    img = np.full((200, 400), 210, np.uint8)
    for _ in range(50):
        x, y = int(rng.integers(0, 380)), int(rng.integers(0, 180))
        img[y:y+int(rng.integers(3, 20)), x:x+int(rng.integers(2, 12))] = int(rng.integers(0, 120))
    casos.append({'nombre': 'nada%d' % n, 'texto': None, 'tipo': None,
                  'nota': 'rayas al azar: no debe leer nada',
                  'fichero': 'nada%d.pgm' % n, 'opencv': False})
    pgm(os.path.join(SAL, 'nada%d.pgm' % n), img)
# rayas regulares, que es lo que más se parece a un código sin serlo
for i, paso in enumerate((4, 6, 9)):
    img = np.full((200, 400), 255, np.uint8)
    for x in range(0, 400, paso):
        img[:, x:x+paso//2] = 0
    casos.append({'nombre': 'rayas%d' % i, 'texto': None, 'tipo': None,
                  'nota': 'rayas iguales cada %d píxeles: no debe leer nada' % paso,
                  'fichero': 'rayas%d.pgm' % i, 'opencv': False})
    pgm(os.path.join(SAL, 'rayas%d.pgm' % i), img)

with open(os.path.join(SAL, 'casos.json'), 'w') as f:
    json.dump(casos, f, ensure_ascii=False, indent=1)

conj = sum(1 for c in casos if c['texto'] and c['opencv'])
sinj = sum(1 for c in casos if c['texto'] and not c['opencv'])
sin = sum(1 for c in casos if not c['texto'])
print('%d casos: %d con el dibujo confirmado por OpenCV, %d sin confirmar, %d sin código'
      % (len(casos), conj, sinj, sin))
