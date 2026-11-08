"""Banco duro: los mismos QR de OpenCV, pero como llegan de verdad desde la
cámara de un móvil en una nave.

Cada caso lleva escrito qué se le ha hecho a la imagen, para que al mirar los
resultados se sepa dónde está el límite del lector y no haya que adivinarlo.

Lo que de verdad importa de este banco no es el porcentaje de acierto: es que
la columna de «ha leído OTRA COSA» esté a cero. Un lector que no lee se nota
al momento y el técnico escribe el código; un lector que lee mal mete material
equivocado en un parte y eso llega a una factura.
"""
import cv2, numpy as np, json, os, random

AQUI = os.path.dirname(os.path.abspath(__file__))
SAL = os.path.join(AQUI, 'casos-duro')
os.makedirs(SAL, exist_ok=True)
r = random.Random(20261108)

ETIQUETAS = [
    'https://arizapa.es/#M-MAT0012-A3K9',
    'https://arizapa.es/#P-0042-7HJ2',
    'MAT-0007',
]

def base(texto, modulo=8, borde=4):
    m = cv2.QRCodeEncoder_create().encode(texto)
    extra = max(0, borde - 2)
    g = cv2.copyMakeBorder(m, extra, extra, extra, extra, cv2.BORDER_CONSTANT, value=255)
    return cv2.resize(g, None, fx=modulo, fy=modulo, interpolation=cv2.INTER_NEAREST)

def pgm(ruta, img):
    h, w = img.shape
    with open(ruta, 'wb') as f:
        f.write(('P5\n%d %d\n255\n' % (w, h)).encode())
        f.write(np.ascontiguousarray(img.astype(np.uint8)).tobytes())

# ------------------------------------------------------------- maltratos
def girar(img, grados):
    h, w = img.shape
    lado = int((h**2 + w**2) ** 0.5) + 4
    lienzo = np.full((lado, lado), 255, np.uint8)
    o = (lado - h) // 2
    lienzo[o:o+h, o:o+w] = img
    M = cv2.getRotationMatrix2D((lado/2, lado/2), grados, 1.0)
    return cv2.warpAffine(lienzo, M, (lado, lado), flags=cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=255)

def perspectiva(img, fuerza):
    """Sobre un lienzo más grande, para que el código no se corte contra el
    borde: si se corta, el ojo de la esquina se queda sin margen blanco y no se
    puede encontrar, y eso no es un fallo del lector sino de la prueba. En la
    realidad siempre hay cartón o pared alrededor."""
    h, w = img.shape
    marg = int(min(h, w) * (fuerza + 0.15))
    g = cv2.copyMakeBorder(img, marg, marg, marg, marg, cv2.BORDER_CONSTANT, value=255)
    H, W = g.shape
    m = int(min(h, w) * fuerza)
    orig = np.float32([[marg, marg], [marg+w, marg], [marg+w, marg+h], [marg, marg+h]])
    dest = np.float32([[marg+m, marg+m//2], [marg+w-m//3, marg],
                       [marg+w, marg+h-m//2], [marg+m//2, marg+h]])
    M = cv2.getPerspectiveTransform(orig, dest)
    return cv2.warpPerspective(g, M, (W, H), flags=cv2.INTER_LINEAR,
                               borderMode=cv2.BORDER_CONSTANT, borderValue=255)

def desenfocar(img, k):
    return cv2.GaussianBlur(img, (k, k), 0)

def ruido(img, sigma):
    n = np.random.default_rng(7).normal(0, sigma, img.shape)
    return np.clip(img.astype(np.float32) + n, 0, 255).astype(np.uint8)

def sombra(img, fuerza):
    h, w = img.shape
    gx = np.linspace(1.0, 1.0 - fuerza, w)
    gy = np.linspace(1.0, 1.0 - fuerza/2, h)
    g = np.outer(gy, gx)
    return np.clip(img.astype(np.float32) * g, 0, 255).astype(np.uint8)

def dentro_de_foto(img, ancho=640, alto=480, escala=0.35):
    """El QR como lo que es en la realidad: una parte pequeña de una foto, con
    cosas alrededor (cartón, una estantería, un papel)."""
    h, w = img.shape
    lado = int(min(ancho, alto) * escala)
    peq = cv2.resize(img, (lado, lado), interpolation=cv2.INTER_AREA)
    fondo = np.full((alto, ancho), 200, np.uint8)
    rng = np.random.default_rng(11)
    for _ in range(14):      # manchas y rayas, para que haya algo que descartar
        x, y = rng.integers(0, ancho-60), rng.integers(0, alto-40)
        fondo[y:y+rng.integers(6, 36), x:x+rng.integers(6, 56)] = rng.integers(40, 170)
    ox, oy = (ancho - lado)//2 + 40, (alto - lado)//2 - 20
    ox = max(0, min(ancho-lado, ox)); oy = max(0, min(alto-lado, oy))
    fondo[oy:oy+lado, ox:ox+lado] = peq
    return fondo

def tapar(img, parte):
    """Una esquina rozada o con un dedo encima: lo tiene que arreglar la
    corrección de errores del propio código."""
    h, w = img.shape
    out = img.copy()
    lado = int(min(h, w) * parte)
    out[h-lado-32:h-32, w-lado-32:w-32] = 255
    return out

casos = []
def meter(nombre, texto, img, trato):
    pgm(os.path.join(SAL, nombre + '.pgm'), img)
    casos.append({'nombre': nombre, 'texto': texto, 'fichero': nombre + '.pgm', 'trato': trato})

for i, t in enumerate(ETIQUETAS):
    b = base(t)
    meter('limpio%d' % i, t, b, 'tal cual')
    for grados in (3, 7, 15, 30, 45, 90, 180, 270):
        meter('giro%d-%d' % (i, grados), t, girar(b, grados), 'girado %dº' % grados)
    for f, nom in ((0.06, 'suave'), (0.12, 'medio'), (0.20, 'fuerte')):
        meter('persp%d-%s' % (i, nom), t, perspectiva(b, f), 'en ángulo %s' % nom)
    for k in (3, 5, 9, 15):
        meter('borroso%d-%d' % (i, k), t, desenfocar(b, k), 'desenfoque %d' % k)
    for s in (10, 25, 45):
        meter('ruido%d-%d' % (i, s), t, ruido(b, s), 'ruido %d' % s)
    for f in (0.3, 0.55, 0.75):
        meter('sombra%d-%d' % (i, int(f*100)), t, sombra(b, f), 'sombra %d%%' % int(f*100))
    for mod in (2, 3, 4, 6):
        meter('chico%d-%d' % (i, mod), t, base(t, modulo=mod), 'módulo de %d píxeles' % mod)
    for esc in (0.25, 0.35, 0.55):
        meter('enfoto%d-%d' % (i, int(esc*100)), t, dentro_de_foto(b, escala=esc),
              'dentro de una foto, ocupando el %d%%' % int(esc*100))
    for p in (0.08, 0.15, 0.25):
        meter('tapado%d-%d' % (i, int(p*100)), t, tapar(b, p), 'tapado un %d%%' % int(p*100))
    # combinaciones, que es lo que pasa de verdad: torcido, borroso y con sombra
    meter('real%d-a' % i, t, desenfocar(girar(b, 12), 5), 'girado 12º y desenfocado')
    meter('real%d-b' % i, t, sombra(perspectiva(b, 0.1), 0.5), 'en ángulo y con sombra')
    meter('real%d-c' % i, t, ruido(desenfocar(dentro_de_foto(b, escala=0.4), 3), 18),
          'dentro de una foto, desenfocado y con ruido')
    meter('real%d-d' % i, t, desenfocar(girar(base(t, modulo=4), 25), 3),
          'pequeño, girado 25º y desenfocado')

# ---- y lo que NO debe leer: imágenes sin ningún código
rng = np.random.default_rng(3)
for n in range(12):
    img = np.full((360, 360), 210, np.uint8)
    for _ in range(40):
        x, y = rng.integers(0, 300), rng.integers(0, 300)
        img[y:y+rng.integers(4, 50), x:x+rng.integers(4, 50)] = rng.integers(0, 255)
    casos.append({'nombre': 'nada%d' % n, 'texto': None, 'fichero': 'nada%d.pgm' % n,
                  'trato': 'una imagen sin código: no debe leer nada'})
    pgm(os.path.join(SAL, 'nada%d.pgm' % n), img)
# un tablero de ajedrez, que es lo que más se parece a un código sin serlo
tab = np.indices((360, 360)).sum(axis=0) // 9 % 2 * 255
casos.append({'nombre': 'ajedrez', 'texto': None, 'fichero': 'ajedrez.pgm',
              'trato': 'un cuadriculado: no debe leer nada'})
pgm(os.path.join(SAL, 'ajedrez.pgm'), tab.astype(np.uint8))

with open(os.path.join(SAL, 'casos.json'), 'w') as f:
    json.dump(casos, f, ensure_ascii=False, indent=1)
print('%d casos duros generados (%d con código, %d sin código)'
      % (len(casos), sum(1 for c in casos if c['texto']), sum(1 for c in casos if not c['texto'])))
