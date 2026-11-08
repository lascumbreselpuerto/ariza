"""Mete en qr.js las tablas deducidas por laboratorio.py y escribe qr.gen.js.

Se hace así, y no copiando los números a mano dentro del JavaScript, para que
la única fuente de las tablas sea el laboratorio y no haya forma de que una y
otro se separen sin que se note.
"""
import json, os

AQUI = os.path.dirname(os.path.abspath(__file__))

def cargar():
    t = json.load(open(os.path.join(AQUI, 'tablas.json')))
    altas = os.path.join(AQUI, 'tablas-altas.json')
    if os.path.exists(altas):
        a = json.load(open(altas))
        t['alineacion'].update(a['alineacion'])
        t['bloques'].update(a['bloques'])
    return t

def main():
    t = cargar()
    alin = {int(k): v for k, v in t['alineacion'].items()}
    blo = {int(k): v for k, v in t['bloques'].items()}
    js_alin = '{' + ','.join('%d:[%s]' % (v, ','.join(str(x) for x in alin[v]))
                             for v in sorted(alin)) + '}'
    partes = []
    for v in sorted(blo):
        niv = []
        for n in 'LMQH':
            if n not in blo[v]: continue
            b = blo[v][n]
            niv.append('%s:{total:%d,bloques:%d,ec:%d,tam:[%s]}'
                       % (n, b['total'], b['bloques'], b['ec'], ','.join(str(x) for x in b['tam'])))
        partes.append('%d:{%s}' % (v, ','.join(niv)))
    js_blo = '{' + ','.join(partes) + '}'

    fuente = open(os.path.join(AQUI, 'qr.js')).read()
    salida = fuente.replace('__ALINEACION__', js_alin).replace('__BLOQUES__', js_blo)
    assert '__ALINEACION__' not in salida and '__BLOQUES__' not in salida
    open(os.path.join(AQUI, 'qr.gen.js'), 'w').write(salida)
    print('qr.gen.js escrito: %d versiones con tabla de bloques, %d con alineación'
          % (len(blo), len(alin)))
    print('tamaño: %.1f KB' % (len(salida) / 1024.0))

if __name__ == '__main__':
    main()
