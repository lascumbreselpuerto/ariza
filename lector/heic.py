#!/usr/bin/env python3
# ============================================================================
# ARIZA SAT · Abrir las fotos del iPhone (HEIC) sin librerías de HEIC
#
# POR QUÉ EXISTE ESTO
# David manda las fotos de las cajas desde el iPhone, y el iPhone las guarda
# en HEIC. Aquí no hay nada que sepa abrir un HEIC: ffmpeg no entiende el
# envoltorio, ImageMagick no tiene el códec y no hay red para instalar nada.
#
# Pero sí hay un descodificador de HEVC dentro de ffmpeg, y el HEIC no es más
# que una imagen HEVC metida en un envoltorio de los de Apple (el mismo de los
# .mov). Así que el trabajo es abrir el envoltorio a mano, sacar el flujo HEVC
# y dárselo a ffmpeg ya masticado.
#
# El iPhone no guarda la foto de una pieza: la parte en baldosas de 512x512 y
# guarda aparte un plano («grid») que dice cuántas filas y columnas hay. Hay
# que descodificar cada baldosa y volver a montar la foto.
#
# NO ADIVINA NADA: todo lo que lee sale del fichero. Si algo no cuadra, avisa
# y se para, que es mejor que devolver una foto mal montada.
#                                                                  08-11-2026
# ============================================================================
import struct, subprocess, sys, os, shutil

def cajas(d, ini, fin):
    """Recorre las cajas (boxes) de un trozo del fichero."""
    p = ini
    while p + 8 <= fin:
        tam = struct.unpack('>I', d[p:p+4])[0]
        tipo = d[p+4:p+8]
        cab = 8
        if tam == 1:
            tam = struct.unpack('>Q', d[p+8:p+16])[0]; cab = 16
        elif tam == 0:
            tam = fin - p
        if tam < cab or p + tam > fin:
            raise ValueError('caja %r mal medida en %d' % (tipo, p))
        yield tipo, p + cab, p + tam
        p += tam

def buscar(d, ini, fin, camino):
    """Baja por un camino de cajas, p.ej. ['meta','iprp','ipco']."""
    if not camino:
        return ini, fin
    for tipo, a, b in cajas(d, ini, fin):
        if tipo == camino[0].encode():
            # 'meta' lleva delante una version+flags que no es una caja
            if camino[0] == 'meta':
                a += 4
            return buscar(d, a, b, camino[1:])
    return None

def leer_ent(d, p, n):
    v = 0
    for i in range(n):
        v = (v << 8) | d[p+i]
    return v

# ---------------------------------------------------------------------------
# iinf: qué hay dentro del fichero y de qué tipo es cada cosa
# ---------------------------------------------------------------------------
def leer_iinf(d, ini, fin):
    ver = d[ini]
    p = ini + 4
    if ver == 0:
        p += 2
    else:
        p += 4
    tipos = {}
    for tipo, a, b in cajas(d, p, fin):
        if tipo != b'infe':
            continue
        v = d[a]
        q = a + 4
        if v < 3:
            idi = leer_ent(d, q, 2); q += 2
        else:
            idi = leer_ent(d, q, 4); q += 4
        q += 2                      # item_protection_index
        tipos[idi] = d[q:q+4].decode('latin1')
    return tipos

# ---------------------------------------------------------------------------
# iloc: dónde está metido cada trozo
# ---------------------------------------------------------------------------
def leer_iloc(d, ini, fin):
    ver = d[ini]
    p = ini + 4
    b0 = d[p]; b1 = d[p+1]
    t_off, t_len = b0 >> 4, b0 & 15
    t_base, t_idx = b1 >> 4, b1 & 15
    p += 2
    if ver < 2:
        n = leer_ent(d, p, 2); p += 2
    else:
        n = leer_ent(d, p, 4); p += 4
    sitios = {}
    for _ in range(n):
        if ver < 2:
            idi = leer_ent(d, p, 2); p += 2
        else:
            idi = leer_ent(d, p, 4); p += 4
        metodo = 0
        if ver in (1, 2):
            metodo = leer_ent(d, p, 2) & 15; p += 2
        p += 2                              # data_reference_index
        base = leer_ent(d, p, t_base); p += t_base
        ne = leer_ent(d, p, 2); p += 2
        trozos = []
        for _ in range(ne):
            if ver in (1, 2) and t_idx > 0:
                p += t_idx
            off = leer_ent(d, p, t_off); p += t_off
            lon = leer_ent(d, p, t_len); p += t_len
            trozos.append((base + off, lon))
        sitios[idi] = (metodo, trozos)
    return sitios

# ---------------------------------------------------------------------------
# ipco + ipma: las propiedades (entre ellas el hvcC, que lleva las cabeceras
# del HEVC) y a qué trozo pertenece cada una
# ---------------------------------------------------------------------------
def leer_ipco(d, ini, fin):
    props = []
    for tipo, a, b in cajas(d, ini, fin):
        props.append((tipo.decode('latin1'), d[a:b]))
    return props

def leer_ipma(d, ini, fin):
    ver = d[ini]
    flags = leer_ent(d, ini+1, 3)
    p = ini + 4
    n = leer_ent(d, p, 4); p += 4
    mapa = {}
    for _ in range(n):
        if ver < 1:
            idi = leer_ent(d, p, 2); p += 2
        else:
            idi = leer_ent(d, p, 4); p += 4
        na = d[p]; p += 1
        lista = []
        for _ in range(na):
            if flags & 1:
                v = leer_ent(d, p, 2); p += 2
                lista.append(v & 0x7fff)
            else:
                v = d[p]; p += 1
                lista.append(v & 0x7f)
        mapa[idi] = lista
    return mapa

# ---------------------------------------------------------------------------
# iref: qué trozos componen la foto (referencia 'dimg' del plano a sus
# baldosas), en el orden en que hay que montarlas
# ---------------------------------------------------------------------------
def leer_iref(d, ini, fin):
    ver = d[ini]
    refs = {}
    for tipo, a, b in cajas(d, ini+4, fin):
        p = a
        if ver == 0:
            de = leer_ent(d, p, 2); p += 2
        else:
            de = leer_ent(d, p, 4); p += 4
        n = leer_ent(d, p, 2); p += 2
        hacia = []
        for _ in range(n):
            if ver == 0:
                hacia.append(leer_ent(d, p, 2)); p += 2
            else:
                hacia.append(leer_ent(d, p, 4)); p += 4
        refs.setdefault(tipo.decode('latin1'), {})[de] = hacia
    return refs

# ---------------------------------------------------------------------------
# hvcC -> las cabeceras del HEVC en Annex B, y de cuántos bytes es el prefijo
# de longitud de cada NAL
# ---------------------------------------------------------------------------
def leer_hvcc(datos):
    n_long = (datos[21] & 3) + 1
    n_arr = datos[22]
    p = 23
    cabeceras = b''
    for _ in range(n_arr):
        p += 1
        n_nal = leer_ent(datos, p, 2); p += 2
        for _ in range(n_nal):
            lon = leer_ent(datos, p, 2); p += 2
            cabeceras += b'\x00\x00\x00\x01' + datos[p:p+lon]
            p += lon
    return cabeceras, n_long

def a_annexb(datos, n_long):
    """De NALs con prefijo de longitud a NALs con marca de arranque."""
    salida = b''
    p = 0
    while p + n_long <= len(datos):
        lon = leer_ent(datos, p, n_long); p += n_long
        if lon == 0 or p + lon > len(datos):
            break
        salida += b'\x00\x00\x00\x01' + datos[p:p+lon]
        p += lon
    return salida

# ---------------------------------------------------------------------------
def abrir(ruta, destino, carpeta_trabajo=None):
    d = open(ruta, 'rb').read()
    fin = len(d)

    meta = buscar(d, 0, fin, ['meta'])
    if not meta:
        raise ValueError('no es un HEIC: no tiene «meta»')
    m0, m1 = meta

    r = buscar(d, m0, m1, ['iinf']);  tipos  = leer_iinf(d, *r)
    r = buscar(d, m0, m1, ['iloc']);  sitios = leer_iloc(d, *r)
    r = buscar(d, m0, m1, ['iprp', 'ipco']); props = leer_ipco(d, *r)
    r = buscar(d, m0, m1, ['iprp', 'ipma']); mapa  = leer_ipma(d, *r)
    r = buscar(d, m0, m1, ['iref'])
    refs = leer_iref(d, *r) if r else {}
    r = buscar(d, m0, m1, ['pitm'])
    principal = leer_ent(d, r[0] + 4, 2) if r else None
    r = buscar(d, m0, m1, ['idat'])
    idat = d[r[0]:r[1]] if r else b''

    def trozo(idi):
        metodo, ext = sitios[idi]
        fuente = idat if metodo == 1 else d
        return b''.join(fuente[o:o+l] for o, l in ext)

    def prop_de(idi, nombre):
        for i in mapa.get(idi, []):
            if 1 <= i <= len(props) and props[i-1][0] == nombre:
                return props[i-1][1]
        return None

    # ¿la foto es una sola imagen o un mosaico de baldosas?
    tipo_pr = tipos.get(principal)
    if tipo_pr == 'grid':
        plano = trozo(principal)
        filas = plano[2] + 1
        cols  = plano[3] + 1
        if plano[1] & 1:
            an_sal = leer_ent(plano, 4, 4); al_sal = leer_ent(plano, 8, 4)
        else:
            an_sal = leer_ent(plano, 4, 2); al_sal = leer_ent(plano, 6, 2)
        baldosas = refs.get('dimg', {}).get(principal, [])
        if len(baldosas) != filas * cols:
            raise ValueError('el plano dice %dx%d baldosas y hay %d'
                             % (filas, cols, len(baldosas)))
    else:
        baldosas = [principal]
        filas = cols = 1
        isp = prop_de(principal, 'ispe')
        if isp is None:
            raise ValueError('no dice de qué tamaño es la foto')
        an_sal = leer_ent(isp, 4, 4); al_sal = leer_ent(isp, 8, 4)

    hv = prop_de(baldosas[0], 'hvcC')
    if hv is None:
        raise ValueError('no están las cabeceras del HEVC (hvcC)')
    cabeceras, n_long = leer_hvcc(hv)

    trabajo = carpeta_trabajo or (os.path.splitext(destino)[0] + '.tmp')
    if os.path.isdir(trabajo):
        shutil.rmtree(trabajo)
    os.makedirs(trabajo)

    # Todas las baldosas son imágenes completas e independientes, así que se
    # pueden encadenar y pedirle a ffmpeg que las saque como fotogramas.
    flujo = cabeceras
    for b in baldosas:
        flujo += a_annexb(trozo(b), n_long)
    bruto = os.path.join(trabajo, 'flujo.h265')
    open(bruto, 'wb').write(flujo)

    r = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error',
                        '-f', 'hevc', '-i', bruto,
                        os.path.join(trabajo, 'b%04d.png')],
                       capture_output=True)
    if r.returncode != 0:
        raise ValueError('ffmpeg no ha podido con el HEVC: %s'
                         % r.stderr.decode('utf8', 'replace')[:300])

    from PIL import Image
    piezas = sorted(os.listdir(trabajo))
    piezas = [p for p in piezas if p.endswith('.png')]
    if len(piezas) != len(baldosas):
        raise ValueError('salieron %d baldosas de %d' % (len(piezas), len(baldosas)))

    if filas * cols == 1:
        im = Image.open(os.path.join(trabajo, piezas[0])).convert('RGB')
    else:
        p0 = Image.open(os.path.join(trabajo, piezas[0]))
        anb, alb = p0.size
        im = Image.new('RGB', (anb * cols, alb * filas))
        for i, nombre in enumerate(piezas):
            f, c = divmod(i, cols)
            im.paste(Image.open(os.path.join(trabajo, nombre)).convert('RGB'),
                     (c * anb, f * alb))

    im = im.crop((0, 0, min(an_sal, im.width), min(al_sal, im.height)))

    # El iPhone guarda la foto en horizontal y escribe aparte cómo hay que
    # girarla ('irot'). Sin esto, las fotos verticales salen tumbadas.
    gir = prop_de(principal, 'irot')
    if gir is not None and (gir[0] & 3):
        im = im.rotate(90 * (gir[0] & 3), expand=True)

    im.save(destino)
    shutil.rmtree(trabajo)
    return im.size

if __name__ == '__main__':
    salida = abrir(sys.argv[1], sys.argv[2])
    print('%s -> %s  %dx%d' % (sys.argv[1], sys.argv[2], salida[0], salida[1]))
