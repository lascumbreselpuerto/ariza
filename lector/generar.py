"""Banco de QR de prueba, generados por OpenCV (tercero independiente).

No los dibuja nuestro código: los dibuja OpenCV. Así, si nuestro descifrador
los lee bien, es que lee QR de verdad y no solo los que dibujamos nosotros.
Cada caso se guarda como PGM (P5), que Node lee sin librerías.
"""
import cv2, numpy as np, json, os, random

SAL = os.path.join(os.path.dirname(__file__), 'casos')
os.makedirs(SAL, exist_ok=True)

def pgm(ruta, img):
    h, w = img.shape
    with open(ruta, 'wb') as f:
        f.write(('P5\n%d %d\n255\n' % (w, h)).encode())
        f.write(img.astype(np.uint8).tobytes())

def hacer_qr(texto, modulo=6, borde=4, correccion=cv2.QRCodeEncoder_CORRECT_LEVEL_M):
    p = cv2.QRCodeEncoder_Params()
    p.correction_level = correccion
    enc = cv2.QRCodeEncoder_create(p)
    """OpenCV devuelve ya la imagen lista, 0 negro y 255 blanco, y con dos
    módulos de margen incluidos. Le añadimos margen hasta los cuatro módulos
    que pide la norma, que es lo que lleva impreso nuestra etiqueta."""
    m = enc.encode(texto)                      # trae dos módulos de margen ya puestos
    lado = m.shape[0] - 4                      # el lado de verdad, sin ese margen
    extra = max(0, borde - 2)                  # lo que falta hasta el margen pedido
    g = cv2.copyMakeBorder(m, extra, extra, extra, extra, cv2.BORDER_CONSTANT, value=255)
    return cv2.resize(g, None, fx=modulo, fy=modulo, interpolation=cv2.INTER_NEAREST), lado

def comprobar(img, texto):
    """OpenCV se lee a sí mismo: si no, el caso está mal generado y no se usa."""
    d = cv2.QRCodeDetector().detectAndDecode(img)[0]
    return d == texto

casos = []
random.seed(7)

# 1. Las etiquetas de verdad de Ariza: material y puerta
etiquetas = [
    'https://arizapa.es/#M-MAT0012-A3K9',
    'https://arizapa.es/#M-MAT0001-ZQ4T',
    'https://arizapa.es/#P-0042-7HJ2',
    'https://arizapa.es/#P-1137-KK08',
]
for i, t in enumerate(etiquetas):
    for mod in (3, 5, 8):
        img, lado = hacer_qr(t, modulo=mod)
        casos.append(('etiqueta%d-m%d' % (i, mod), t, img, {'lado': lado, 'modulo': mod}))

# 2. Niveles de corrección y modos de contenido
for nivel, nom in [(cv2.QRCodeEncoder_CORRECT_LEVEL_L, 'L'),
                   (cv2.QRCodeEncoder_CORRECT_LEVEL_M, 'M'),
                   (cv2.QRCodeEncoder_CORRECT_LEVEL_Q, 'Q'),
                   (cv2.QRCodeEncoder_CORRECT_LEVEL_H, 'H')]:
    for t, nt in [('MAT-0012', 'alfanum'), ('123456789012', 'numerico'),
                  ('Puerta corredera nº3 · acceso almacén', 'acentos')]:
        img, lado = hacer_qr(t, modulo=5, correccion=nivel)
        casos.append(('nivel%s-%s' % (nom, nt), t, img, {'lado': lado, 'nivel': nom}))

# 3. Versiones grandes: textos largos
for n in (40, 120, 300, 700):
    t = 'ARIZA ' + ''.join(random.choice('ABCDEFGHJKLMNPQRSTUVWXYZ0123456789-') for _ in range(n))
    img, lado = hacer_qr(t, modulo=4)
    casos.append(('largo%d' % n, t, img, {'lado': lado}))

buenos = []
for nom, txt, img, extra in casos:
    if not comprobar(img, txt):
        print('  OJO: OpenCV no se lee a sí mismo en', nom, '- caso descartado')
        continue
    pgm(os.path.join(SAL, nom + '.pgm'), img)
    buenos.append(dict(nombre=nom, texto=txt, fichero=nom + '.pgm', **extra))

with open(os.path.join(SAL, 'casos.json'), 'w') as f:
    json.dump(buenos, f, ensure_ascii=False, indent=1)
print('%d casos generados y verificados por OpenCV' % len(buenos))
