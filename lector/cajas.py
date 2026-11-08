#!/usr/bin/env python3
# ============================================================================
# ARIZA SAT · Preparar las fotos de cajas reales para el banco del lector
#
# David mandó ocho fotos de cajas de cuatro proveedores (Fullwat, ABM, Geba y
# Beninca) el 08-11-2026, hechas con su iPhone como las haría en el almacén:
# a pulso, en ángulo, con el código pequeño dentro del encuadre.
#
# Esto las deja como las ve el lector dentro de la aplicación: en escala de
# grises y REDUCIDAS, que es justo lo que se está poniendo a prueba. El lector
# reducía el fotograma a 480 píxeles por el lado mayor, y la sospecha es que a
# ese tamaño una barra ocupa menos de dos píxeles y no hay nada que leer.
#
# Saca un fichero por foto y por tamaño: ancho(4) + alto(4) + un byte de gris
# por píxel. Lo lee pruebas de node sin necesitar ninguna librería de imagen.
#                                                                  08-11-2026
# ============================================================================
import os, struct, sys
from PIL import Image

TAMANOS = [480, 720, 960, 1280, 1600, 2000]

def preparar(origen, salida):
    os.makedirs(salida, exist_ok=True)
    hechos = []
    for n in sorted(os.listdir(origen)):
        if not n.endswith('.png'):
            continue
        im = Image.open(os.path.join(origen, n)).convert('L')
        for t in TAMANOS:
            e = min(1.0, t / max(im.size))
            an = max(1, int(im.width * e))
            al = max(1, int(im.height * e))
            # El navegador reduce con suavizado, así que aquí igual.
            ch = im.resize((an, al), Image.BILINEAR)
            d = struct.pack('>II', an, al) + ch.tobytes()
            f = os.path.join(salida, '%s-%d.gris' % (n[:-4], t))
            open(f, 'wb').write(d)
            hechos.append(f)
    return hechos

if __name__ == '__main__':
    hechos = preparar(sys.argv[1], sys.argv[2])
    print('%d ficheros preparados' % len(hechos))
