"""Mete en barras.js las tablas de barras.py y escribe barras.gen.js.

Igual que con el QR: una sola fuente para las tablas, para que el generador
que examina y el lector que se examina no puedan separarse sin que se note.
"""
import os, json, barras

AQUI = os.path.dirname(os.path.abspath(__file__))

def main():
    fallos = barras.comprobar_tabla_c128() + barras.comprobar_tabla_c39()
    if fallos:
        raise SystemExit('las tablas no cumplen la norma: %s' % fallos)
    js = open(os.path.join(AQUI, 'barras.js')).read()
    rep = {
        '__TABLA_L__': json.dumps(barras.L),
        '__TABLA_G__': json.dumps(barras.G),
        '__TABLA_R__': json.dumps(barras.R),
        '__PARIDAD__': json.dumps(barras.PARIDAD),
        '__C128__': json.dumps(barras.C128_ANCHOS),
        '__C39__': json.dumps(barras.C39),
    }
    for k, v in rep.items():
        js = js.replace(k, v)
    for k in rep:
        assert k not in js, k
    open(os.path.join(AQUI, 'barras.gen.js'), 'w').write(js)
    print('barras.gen.js escrito, %.1f KB' % (len(js)/1024.0))

if __name__ == '__main__':
    main()
