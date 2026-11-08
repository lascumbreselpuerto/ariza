/* ===========================================================================
   Descifrador de QR escrito para ARIZA SAT · 08-11-2026
   ---------------------------------------------------------------------------
   Por qué está escrito a mano y no es una librería de fuera:
   Safari no trae lector de códigos (BarcodeDetector), así que en el iPhone de
   David la cámara no servía y había que teclear el código de la etiqueta. Esto
   lo arregla. Va incrustado en index.html para que siga funcionando sin
   cobertura, que es como se trabaja en una nave o en un sótano.

   Las tres tablas de la norma ISO 18004 que hacen falta NO están copiadas de
   memoria: se deducen en lector/laboratorio.py de los códigos que genera
   OpenCV, y se comprueban con la propia corrección de errores y reconstruyendo
   el texto. Volver a ejecutar ese fichero es la manera de comprobar que siguen
   bien.

   Entra: luminancia (0-255) de una imagen, ancho y alto.
   Sale: el texto del código, o null si no hay código legible.
   =========================================================================== */
(function (raiz) {
'use strict';

/* ---------------------------------------------------------------- tablas
   Deducidas y comprobadas por lector/laboratorio.py. No tocar a mano:
   se regeneran ejecutando ese fichero. */
var ALINEACION = {1:[],2:[18],3:[22],4:[26],5:[30],6:[34],7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50],11:[6,30,54],12:[6,32,58],13:[6,34,62],14:[6,26,46,66],15:[6,26,48,70],16:[6,26,50,74],17:[6,30,54,78],18:[6,30,56,82],19:[6,30,58,86],20:[6,34,62,90]};
var BLOQUES = {1:{L:{total:26,bloques:1,ec:7,tam:[19]},M:{total:26,bloques:1,ec:10,tam:[16]},Q:{total:26,bloques:1,ec:13,tam:[13]},H:{total:26,bloques:1,ec:17,tam:[9]}},2:{L:{total:44,bloques:1,ec:10,tam:[34]},M:{total:44,bloques:1,ec:16,tam:[28]},Q:{total:44,bloques:1,ec:22,tam:[22]},H:{total:44,bloques:1,ec:28,tam:[16]}},3:{L:{total:70,bloques:1,ec:15,tam:[55]},M:{total:70,bloques:1,ec:26,tam:[44]},Q:{total:70,bloques:2,ec:18,tam:[17,17]},H:{total:70,bloques:2,ec:22,tam:[13,13]}},4:{L:{total:100,bloques:1,ec:20,tam:[80]},M:{total:100,bloques:2,ec:18,tam:[32,32]},Q:{total:100,bloques:2,ec:26,tam:[24,24]},H:{total:100,bloques:4,ec:16,tam:[9,9,9,9]}},5:{L:{total:134,bloques:1,ec:26,tam:[108]},M:{total:134,bloques:2,ec:24,tam:[43,43]},Q:{total:134,bloques:4,ec:18,tam:[15,15,16,16]},H:{total:134,bloques:4,ec:22,tam:[11,11,12,12]}},6:{L:{total:172,bloques:2,ec:18,tam:[68,68]},M:{total:172,bloques:4,ec:16,tam:[27,27,27,27]},Q:{total:172,bloques:4,ec:24,tam:[19,19,19,19]},H:{total:172,bloques:4,ec:28,tam:[15,15,15,15]}},7:{L:{total:196,bloques:2,ec:20,tam:[78,78]},M:{total:196,bloques:4,ec:18,tam:[31,31,31,31]},Q:{total:196,bloques:6,ec:18,tam:[14,14,15,15,15,15]},H:{total:196,bloques:5,ec:26,tam:[13,13,13,13,14]}},8:{L:{total:242,bloques:2,ec:24,tam:[97,97]},M:{total:242,bloques:4,ec:22,tam:[38,38,39,39]},Q:{total:242,bloques:6,ec:22,tam:[18,18,18,18,19,19]},H:{total:242,bloques:6,ec:26,tam:[14,14,14,14,15,15]}},9:{L:{total:292,bloques:2,ec:30,tam:[116,116]},M:{total:292,bloques:5,ec:22,tam:[36,36,36,37,37]},Q:{total:292,bloques:8,ec:20,tam:[16,16,16,16,17,17,17,17]},H:{total:292,bloques:8,ec:24,tam:[12,12,12,12,13,13,13,13]}},10:{L:{total:346,bloques:4,ec:18,tam:[68,68,69,69]},M:{total:346,bloques:5,ec:26,tam:[43,43,43,43,44]},Q:{total:346,bloques:8,ec:24,tam:[19,19,19,19,19,19,20,20]},H:{total:346,bloques:8,ec:28,tam:[15,15,15,15,15,15,16,16]}},11:{L:{total:404,bloques:4,ec:20,tam:[81,81,81,81]},M:{total:404,bloques:5,ec:30,tam:[50,51,51,51,51]},Q:{total:404,bloques:8,ec:28,tam:[22,22,22,22,23,23,23,23]},H:{total:404,bloques:11,ec:24,tam:[12,12,12,13,13,13,13,13,13,13,13]}},12:{L:{total:466,bloques:4,ec:24,tam:[92,92,93,93]},M:{total:466,bloques:8,ec:22,tam:[36,36,36,36,36,36,37,37]},Q:{total:466,bloques:10,ec:26,tam:[20,20,20,20,21,21,21,21,21,21]},H:{total:466,bloques:11,ec:28,tam:[14,14,14,14,14,14,14,15,15,15,15]}},13:{L:{total:532,bloques:4,ec:26,tam:[107,107,107,107]},M:{total:532,bloques:9,ec:22,tam:[37,37,37,37,37,37,37,37,38]},Q:{total:532,bloques:12,ec:24,tam:[20,20,20,20,20,20,20,20,21,21,21,21]},H:{total:532,bloques:16,ec:22,tam:[11,11,11,11,11,11,11,11,11,11,11,11,12,12,12,12]}},14:{L:{total:581,bloques:4,ec:30,tam:[115,115,115,116]},M:{total:581,bloques:9,ec:24,tam:[40,40,40,40,41,41,41,41,41]},Q:{total:581,bloques:16,ec:20,tam:[16,16,16,16,16,16,16,16,16,16,16,17,17,17,17,17]},H:{total:581,bloques:16,ec:24,tam:[12,12,12,12,12,12,12,12,12,12,12,13,13,13,13,13]}},15:{L:{total:655,bloques:6,ec:22,tam:[87,87,87,87,87,88]},M:{total:655,bloques:10,ec:24,tam:[41,41,41,41,41,42,42,42,42,42]},Q:{total:655,bloques:12,ec:30,tam:[24,24,24,24,24,25,25,25,25,25,25,25]},H:{total:655,bloques:18,ec:24,tam:[12,12,12,12,12,12,12,12,12,12,12,13,13,13,13,13,13,13]}},16:{L:{total:733,bloques:6,ec:24,tam:[98,98,98,98,98,99]},M:{total:733,bloques:10,ec:28,tam:[45,45,45,45,45,45,45,46,46,46]},Q:{total:733,bloques:17,ec:24,tam:[19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,20,20]},H:{total:733,bloques:16,ec:30,tam:[15,15,15,16,16,16,16,16,16,16,16,16,16,16,16,16]}},17:{L:{total:815,bloques:6,ec:28,tam:[107,108,108,108,108,108]},M:{total:815,bloques:11,ec:28,tam:[46,46,46,46,46,46,46,46,46,46,47]},Q:{total:815,bloques:16,ec:28,tam:[22,23,23,23,23,23,23,23,23,23,23,23,23,23,23,23]},H:{total:815,bloques:19,ec:28,tam:[14,14,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15]}},18:{L:{total:901,bloques:6,ec:30,tam:[120,120,120,120,120,121]},M:{total:901,bloques:13,ec:26,tam:[43,43,43,43,43,43,43,43,43,44,44,44,44]},Q:{total:901,bloques:18,ec:28,tam:[22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,22,23]},H:{total:901,bloques:21,ec:28,tam:[14,14,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15]}},19:{L:{total:991,bloques:7,ec:28,tam:[113,113,113,114,114,114,114]},M:{total:991,bloques:14,ec:26,tam:[44,44,44,45,45,45,45,45,45,45,45,45,45,45]},Q:{total:991,bloques:21,ec:26,tam:[21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,22,22,22,22]},H:{total:991,bloques:25,ec:26,tam:[13,13,13,13,13,13,13,13,13,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14]}},20:{L:{total:1085,bloques:8,ec:28,tam:[107,107,107,108,108,108,108,108]},M:{total:1085,bloques:16,ec:26,tam:[41,41,41,42,42,42,42,42,42,42,42,42,42,42,42,42]},Q:{total:1085,bloques:20,ec:30,tam:[24,24,24,24,24,24,24,24,24,24,24,24,24,24,24,25,25,25,25,25]},H:{total:1085,bloques:25,ec:28,tam:[15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,16,16,16,16,16,16,16,16,16,16]}}};
/* Orden de los niveles tal y como los numera el formato del QR */
var NIVEL = ['M', 'L', 'H', 'Q'];

/* ---------------------------------------------------- cuerpo finito GF(256)
   Aritmética, no tabla: se construye sola al arrancar. */
var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(function () {
  for (var i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i;
    x <<= 1; if (x & 0x100) x ^= 0x11D; }
  for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
})();
function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }
function div(a, b) { return a === 0 ? 0 : EXP[LOG[a] + 255 - LOG[b]]; }

/* Reed-Solomon: Berlekamp-Massey para encontrar los errores, Forney para
   saber en cuánto se han equivocado. Devuelve false si no se puede arreglar,
   y entonces el código se descarta en vez de dar un dato falso, que sería
   mucho peor que no leer nada. */
/* Sistema de ecuaciones en GF(256), por eliminación. Se usa para sacar en
   cuánto se ha equivocado cada byte una vez se sabe dónde están los errores.
   Se hace así, y no con la fórmula de Forney, porque la fórmula tiene varias
   convenciones que se parecen mucho y equivocarse no da error: da un dato
   falso. El sistema no tiene ese problema, y con trece errores como máximo el
   cálculo no se nota. */
function resolverGF(A, b) {
  var n = b.length, i, j, k;
  var M = A.map(function (f, idx) { return f.concat([b[idx]]); });
  for (i = 0; i < n; i++) {
    var piv = -1;
    for (j = i; j < n; j++) if (M[j][i] !== 0) { piv = j; break; }
    if (piv < 0) return null;
    var tmp = M[i]; M[i] = M[piv]; M[piv] = tmp;
    var inv = div(1, M[i][i]);
    for (k = i; k <= n; k++) M[i][k] = mul(M[i][k], inv);
    for (j = 0; j < n; j++) {
      if (j === i || M[j][i] === 0) continue;
      var f = M[j][i];
      for (k = i; k <= n; k++) M[j][k] ^= mul(f, M[i][k]);
    }
  }
  return M.map(function (f) { return f[n]; });
}

function corregir(bloque, nEc) {
  var n = bloque.length, i, j, k;
  /* Dentro se trabaja con el polinomio en orden creciente: p[k] es el
     coeficiente de x elevado a k. El QR viene al revés, el primer byte es el
     de mayor grado. */
  var p = new Array(n);
  for (i = 0; i < n; i++) p[n - 1 - i] = bloque[i];

  function sindrome(i) {
    var s = 0;
    for (var kk = 0; kk < n; kk++) s ^= mul(p[kk], EXP[(i * kk) % 255]);
    return s;
  }
  var S = new Array(nEc), hayError = false;
  for (i = 0; i < nEc; i++) { S[i] = sindrome(i); if (S[i] !== 0) hayError = true; }
  if (!hayError) return true;

  /* Berlekamp-Massey: el polinomio que dice dónde están los errores */
  var sigma = [1], B = [1], L = 0, m = 1, b = 1;
  for (var r = 0; r < nEc; r++) {
    var d = S[r];
    for (i = 1; i <= L; i++) d ^= mul(sigma[i] || 0, S[r - i]);
    if (d === 0) { m++; continue; }
    var T = sigma.slice();
    var esc = div(d, b);
    var nuevo = sigma.slice();
    for (i = 0; i < B.length; i++) nuevo[m + i] = (nuevo[m + i] || 0) ^ mul(esc, B[i]);
    for (i = 0; i < nuevo.length; i++) if (nuevo[i] === undefined) nuevo[i] = 0;
    sigma = nuevo;
    if (2 * L <= r) { L = r + 1 - L; B = T; b = d; m = 1; }
    else m++;
  }
  if (L === 0 || L > (nEc >> 1)) return false;

  /* Chien: las raíces de sigma dicen qué bytes están mal */
  var sitios = [];
  for (i = 0; i < 255; i++) {
    var v = 0;
    for (j = 0; j < sigma.length; j++) v ^= mul(sigma[j], EXP[(i * j) % 255]);
    if (v === 0) {
      var kk = (255 - i) % 255;
      if (kk >= n) return false;      /* un error fuera del bloque: no es de fiar */
      sitios.push(kk);
    }
  }
  if (sitios.length !== L) return false;

  /* Y en cuánto se ha equivocado cada uno */
  var A = [], bb = [];
  for (i = 0; i < L; i++) {
    var fila = [];
    for (j = 0; j < L; j++) fila.push(EXP[(i * sitios[j]) % 255]);
    A.push(fila); bb.push(S[i]);
  }
  var e = resolverGF(A, bb);
  if (!e) return false;
  for (j = 0; j < L; j++) p[sitios[j]] ^= e[j];

  /* Comprobación final: todos los síndromes a cero o no vale. Más vale no leer
     que dar un código que no es. */
  for (i = 0; i < nEc; i++) if (sindrome(i) !== 0) return false;
  for (i = 0; i < n; i++) bloque[i] = p[n - 1 - i];
  return true;
}

/* ----------------------------------------------------------- binarizar
   Umbral por bloques de 8x8 con la media de los vecinos, como hacen los
   lectores buenos: una etiqueta con sombra de un lado se lee igual. */
function binarizar(lum, an, al) {
  var TAM = 8, bloquesX = Math.max(1, Math.ceil(an / TAM)), bloquesY = Math.max(1, Math.ceil(al / TAM));
  var medias = new Int32Array(bloquesX * bloquesY);
  var bx, by, x, y;
  for (by = 0; by < bloquesY; by++) for (bx = 0; bx < bloquesX; bx++) {
    var suma = 0, cuenta = 0, min = 255, max = 0;
    for (y = by * TAM; y < Math.min(al, (by + 1) * TAM); y++)
      for (x = bx * TAM; x < Math.min(an, (bx + 1) * TAM); x++) {
        var v = lum[y * an + x]; suma += v; cuenta++;
        if (v < min) min = v; if (v > max) max = v;
      }
    var med = cuenta ? suma / cuenta : 128;
    /* Un bloque casi liso no se puede partir por su propia media: sería mitad
       tinta y mitad papel por puro ruido. Se decide con los vecinos que ya
       están calculados, y solo si no hay ninguno se supone papel. Esto es lo
       que hacía falta para que el cuadro negro del centro del ojo no saliera
       blanco, que es lo que pasaba. */
    if (max - min <= 24) {
      med = min / 2;
      if (by > 0 && bx > 0) {
        var vecinos = (medias[(by - 1) * bloquesX + bx] +
                       2 * medias[by * bloquesX + bx - 1] +
                       medias[(by - 1) * bloquesX + bx - 1]) / 4;
        if (min < vecinos) med = vecinos;
      }
    }
    medias[by * bloquesX + bx] = med;
  }
  var bits = new Uint8Array(an * al);
  for (y = 0; y < al; y++) for (x = 0; x < an; x++) {
    bx = Math.min(bloquesX - 1, x >> 3); by = Math.min(bloquesY - 1, y >> 3);
    var acc = 0, n = 0;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var qx = bx + dx, qy = by + dy;
      if (qx >= 0 && qx < bloquesX && qy >= 0 && qy < bloquesY) { acc += medias[qy * bloquesX + qx]; n++; }
    }
    bits[y * an + x] = lum[y * an + x] < (acc / n) ? 1 : 0;   /* 1 = tinta */
  }
  return bits;
}

/* --------------------------------------------- los tres ojos del código
   Se busca la proporción 1:1:3:1:1 por filas, y cada candidato se confirma
   mirando en vertical y en diagonal. */
function buscarOjos(bits, an, al) {
  var cand = [];
  var paso = Math.max(1, Math.floor(al / 300));
  function anchoDe(c) { return (c[0] + c[1] + c[2] + c[3] + c[4]) / 7; }
  function proporcion(c) {
    var total = c[0] + c[1] + c[2] + c[3] + c[4];
    if (total < 7) return false;
    var mod = total / 7, tol = mod / 2;
    return Math.abs(mod - c[0]) < tol && Math.abs(mod - c[1]) < tol &&
           Math.abs(3 * mod - c[2]) < 3 * tol && Math.abs(mod - c[3]) < tol &&
           Math.abs(mod - c[4]) < tol;
  }
  /* El ojo visto en vertical, para confirmar que no es una raya cualquiera.
     Cada tramo tiene tope: sin tope, la cuenta se come la mancha negra de al
     lado y cualquier cosa parece un ojo, que es lo que pasaba. */
  function confirmarVertical(cx, cy, tope) {
    var c = [0, 0, 0, 0, 0], y = cy;
    while (y >= 0 && bits[y * an + cx] && c[2] <= tope) { c[2]++; y--; }
    if (y < 0 || c[2] > tope) return null;
    while (y >= 0 && !bits[y * an + cx] && c[1] <= tope) { c[1]++; y--; }
    if (y < 0 || c[1] > tope) return null;
    while (y >= 0 && bits[y * an + cx] && c[0] <= tope) { c[0]++; y--; }
    if (c[0] > tope) return null;
    var arriba = y + 1;                      /* primera fila con tinta del ojo */
    y = cy + 1;
    while (y < al && bits[y * an + cx] && c[2] <= tope) { c[2]++; y++; }
    if (y >= al || c[2] > tope) return null;
    while (y < al && !bits[y * an + cx] && c[3] <= tope) { c[3]++; y++; }
    if (y >= al || c[3] > tope) return null;
    while (y < al && bits[y * an + cx] && c[4] <= tope) { c[4]++; y++; }
    if (c[4] > tope) return null;
    if (!proporcion(c)) return null;
    var abajo = y;                           /* primera fila ya sin tinta */
    return { mod: anchoDe(c), centro: (arriba + abajo - 1) / 2 };
  }
  /* Cinco contadores: tinta, blanco, tinta, blanco, tinta. Los pares cuentan
     tinta. Al cerrarse una ventana se desplazan dos posiciones, y por eso el
     recuento se recoloca solo al pasar del margen blanco al primer módulo. */
  function mirar(c, x, y) {
    if (!proporcion(c)) return;
    var mod = anchoDe(c);
    var cx = Math.round(x - c[4] - c[3] - c[2] / 2);
    if (cx < 0 || cx >= an || !bits[y * an + cx]) return;
    /* El tope es el doble del tramo central medido en horizontal, no ese
       mismo tramo: visto en ángulo el ojo mide algo más de alto que de ancho,
       y con el tope justo se rechazaba por dos píxeles. La proporción de
       1:1:3:1:1 sigue siendo la que decide. */
    var ver = confirmarVertical(cx, y, Math.round(c[2] * 2) + 2);
    if (ver && Math.abs(ver.mod - mod) < Math.max(1, mod * 0.8))
      cand.push({ x: cx, y: ver.centro, mod: (mod + ver.mod) / 2 });
  }
  for (var y = 0; y < al; y += paso) {
    var c = [0, 0, 0, 0, 0], est = 0;
    for (var x = 0; x < an; x++) {
      if (bits[y * an + x]) {                       /* tinta */
        if ((est & 1) === 1) est++;                 /* veníamos de blanco */
        c[est]++;
      } else {                                      /* blanco */
        if ((est & 1) === 0) {                      /* veníamos de tinta */
          if (est === 4) {
            mirar(c, x, y);
            c = [c[2], c[3], c[4], 1, 0]; est = 3;
          } else { est++; c[est]++; }
        } else c[est]++;
      }
    }
    if (est === 4) mirar(c, an, y);
  }
  /* Se juntan los candidatos que son el mismo ojo visto en varias filas */
  var grupos = [];
  cand.forEach(function (p) {
    for (var i = 0; i < grupos.length; i++) {
      var g = grupos[i];
      if (Math.abs(g.x - p.x) < g.mod * 2 && Math.abs(g.y - p.y) < g.mod * 2 &&
          Math.abs(g.mod - p.mod) < Math.max(1, g.mod * 0.7)) {
        g.x = (g.x * g.n + p.x) / (g.n + 1); g.y = (g.y * g.n + p.y) / (g.n + 1);
        g.mod = (g.mod * g.n + p.mod) / (g.n + 1); g.n++;
        return;
      }
    }
    grupos.push({ x: p.x, y: p.y, mod: p.mod, n: 1 });
  });
  return grupos.filter(function (g) { return g.n >= 2; })
               .sort(function (a, b) { return b.n - a.n; });
}

/* De tres ojos, cuál es cada uno: el de la esquina es el del ángulo recto */
function ordenarOjos(t) {
  function d2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
  var ab = d2(t[0], t[1]), ac = d2(t[0], t[2]), bc = d2(t[1], t[2]);
  var esq, p, q;
  if (bc >= ab && bc >= ac) { esq = t[0]; p = t[1]; q = t[2]; }
  else if (ac >= ab && ac >= bc) { esq = t[1]; p = t[0]; q = t[2]; }
  else { esq = t[2]; p = t[0]; q = t[1]; }
  /* Producto cruzado para saber cuál de los dos es el de la derecha. En
     pantalla la Y crece hacia abajo, así que el giro de «derecha» a «abajo»
     tiene que dar positivo; si da negativo, están al revés. */
  var cruz = (p.x - esq.x) * (q.y - esq.y) - (p.y - esq.y) * (q.x - esq.x);
  if (cruz < 0) { var t2 = p; p = q; q = t2; }
  return { esquina: esq, derecha: p, abajo: q };
}

/* El patrón de alineación de abajo a la derecha, que endereza la perspectiva */
function buscarAlineacion(bits, an, al, cx, cy, mod) {
  /* El patrón de alineación es un cuadro de cinco por cinco: tinta, blanco,
     tinta, en proporción 1:1:1 por su centro. Se busca igual que los ojos,
     con contadores por filas, pero solo en la ventana donde debería estar.
     Antes esto comparaba píxeles sueltos y por eso no lo encontraba casi
     nunca, que es lo que hacía fallar las lecturas en ángulo. */
  var radio = Math.max(4, Math.round(mod * 4));
  var x0 = Math.max(0, Math.round(cx - radio)), x1 = Math.min(an - 1, Math.round(cx + radio));
  var y0 = Math.max(0, Math.round(cy - radio)), y1 = Math.min(al - 1, Math.round(cy + radio));
  var mejor = null;
  function proporcion3(c) {
    var total = c[0] + c[1] + c[2];
    if (total < 3) return false;
    var m = total / 3, tol = m / 2 + 0.5;
    return Math.abs(m - c[0]) <= tol && Math.abs(m - c[1]) <= tol && Math.abs(m - c[2]) <= tol
           && m <= mod * 2.5 && m >= mod * 0.4;
  }
  function centroVertical(px, py, tope) {
    /* Arriba y abajo del punto: tinta en medio, blanco a los dos lados, en la
       misma proporción. Devuelve el centro del tramo de tinta. */
    var c = [0, 0, 0];
    var arriba = py;
    while (arriba - 1 >= 0 && bits[(arriba - 1) * an + px] && c[1] <= tope) { arriba--; c[1]++; }
    var abajo = py;
    while (abajo + 1 < al && bits[(abajo + 1) * an + px] && c[1] <= tope) { abajo++; c[1]++; }
    c[1]++;                                  /* el propio punto de partida */
    if (c[1] > tope) return null;
    var y = arriba - 1;
    while (y >= 0 && !bits[y * an + px] && c[0] <= tope) { c[0]++; y--; }
    y = abajo + 1;
    while (y < al && !bits[y * an + px] && c[2] <= tope) { c[2]++; y++; }
    if (c[0] === 0 || c[2] === 0 || c[0] > tope || c[2] > tope) return null;
    if (!proporcion3(c)) return null;
    return (arriba + abajo) / 2;
  }
  for (var y = y0; y <= y1; y++) {
    var c = [0, 0, 0], est = 0;
    for (var x = x0; x <= x1; x++) {
      if (bits[y * an + x]) {
        if (est === 1) est = 2;
        c[est]++;
      } else {
        if (est === 0) { est = 1; c[1]++; }
        else if (est === 2) {
          if (proporcion3(c)) {
            var px = Math.round(x - c[2] / 2);
            if (px >= 0 && px < an && bits[y * an + px]) {
              var cvy = centroVertical(px, y, Math.max(2, Math.round(mod * 2.5)));
              if (cvy !== null) {
                var dist = (px - cx) * (px - cx) + (cvy - cy) * (cvy - cy);
                if (!mejor || dist < mejor.d) mejor = { x: px, y: cvy, d: dist };
              }
            }
          }
          c = [c[2], 1, 0]; est = 1;
        } else c[est]++;
      }
    }
  }
  return mejor;
}

/* --------------------------------------------------------------- muestreo
   Cuatro esquinas conocidas a una rejilla de dimension x dimension. */
function perspectiva(pts, dim) {
  /* pts: [ [xOrigen,yOrigen] x4 ] para (0,0),(dim,0),(dim,dim),(0,dim) */
  var x0 = pts[0][0], y0 = pts[0][1], x1 = pts[1][0], y1 = pts[1][1],
      x2 = pts[2][0], y2 = pts[2][1], x3 = pts[3][0], y3 = pts[3][1];
  var dx3 = x0 - x1 + x2 - x3, dy3 = y0 - y1 + y2 - y3;
  if (dx3 === 0 && dy3 === 0) {
    return [x1 - x0, x2 - x1, x0, y1 - y0, y2 - y1, y0, 0, 0, 1];
  }
  var dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  var den = dx1 * dy2 - dx2 * dy1;
  var a13 = (dx3 * dy2 - dx2 * dy3) / den;
  var a23 = (dx1 * dy3 - dx3 * dy1) / den;
  return [x1 - x0 + a13 * x1, x3 - x0 + a23 * x3, x0,
          y1 - y0 + a13 * y1, y3 - y0 + a23 * y3, y0,
          a13, a23, 1];
}
function aplicar(m, u, v) {
  var d = m[6] * u + m[7] * v + m[8];
  return [(m[0] * u + m[1] * v + m[2]) / d, (m[3] * u + m[4] * v + m[5]) / d];
}

function muestrear(bits, an, al, m, dim) {
  var g = [];
  for (var y = 0; y < dim; y++) {
    var fila = new Uint8Array(dim);
    for (var x = 0; x < dim; x++) {
      var p = aplicar(m, (x + 0.5) / dim, (y + 0.5) / dim);
      var px = Math.round(p[0]), py = Math.round(p[1]);
      if (px < 0 || py < 0 || px >= an || py >= al) return null;
      /* tres por tres y manda la mayoría: aguanta mejor la tinta corrida */
      var votos = 0, cuenta = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var qx = px + dx, qy = py + dy;
        if (qx >= 0 && qy >= 0 && qx < an && qy < al) { cuenta++; votos += bits[qy * an + qx]; }
      }
      fila[x] = (votos * 2 > cuenta) ? 1 : 0;
    }
    g.push(fila);
  }
  return g;
}

/* ----------------------------------------------------- formato y versión */
var FORMATOS = (function () {
  var t = {};
  for (var d = 0; d < 32; d++) {
    var v = d << 10, x = v;
    while (bitsDe(x) - 1 >= 10) x ^= 0x537 << (bitsDe(x) - 11);
    t[(v | x) ^ 0x5412] = d;
  }
  return t;
  function bitsDe(n) { var c = 0; while (n) { c++; n >>= 1; } return c; }
})();
var VERSIONES = (function () {
  var t = {};
  for (var d = 7; d <= 40; d++) {
    var v = d << 12, x = v;
    while (bitsDe(x) - 1 >= 12) x ^= 0x1F25 << (bitsDe(x) - 13);
    t[v | x] = d;
  }
  return t;
  function bitsDe(n) { var c = 0; while (n) { c++; n >>= 1; } return c; }
})();
function masCercano(tabla, valor) {
  if (tabla[valor] !== undefined) return tabla[valor];
  var mejor = null, mejorD = 99;
  for (var k in tabla) {
    var d = 0, x = (k ^ valor);
    while (x) { d += x & 1; x >>= 1; }
    if (d < mejorD) { mejorD = d; mejor = tabla[k]; }
  }
  return mejorD <= 3 ? mejor : null;
}

function leerFormato(g) {
  var n = g.length, bits = [g[8][0],g[8][1],g[8][2],g[8][3],g[8][4],g[8][5],g[8][7],g[8][8],
                            g[7][8],g[5][8],g[4][8],g[3][8],g[2][8],g[1][8],g[0][8]];
  var v = 0; bits.forEach(function (b) { v = (v << 1) | b; });
  var d = masCercano(FORMATOS, v);
  if (d === null) {
    /* la segunda copia, por si la primera está rozada */
    var b2 = [], i;
    for (i = 0; i < 7; i++) b2.push(g[n - 1 - i][8]);
    for (i = 0; i < 8; i++) b2.push(g[8][n - 8 + i]);
    v = 0; b2.forEach(function (b) { v = (v << 1) | b; });
    d = masCercano(FORMATOS, v);
    if (d === null) return null;
  }
  return { nivel: NIVEL[(d >> 3) & 3], mascara: d & 7 };
}

var MASCARAS = [
  function (y, x) { return (y + x) % 2 === 0; },
  function (y) { return y % 2 === 0; },
  function (y, x) { return x % 3 === 0; },
  function (y, x) { return (y + x) % 3 === 0; },
  function (y, x) { return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0; },
  function (y, x) { return (y * x) % 2 + (y * x) % 3 === 0; },
  function (y, x) { return (((y * x) % 2) + ((y * x) % 3)) % 2 === 0; },
  function (y, x) { return (((y + x) % 2) + ((y * x) % 3)) % 2 === 0; },
];

function mapaFuncion(n, version) {
  var f = [], y, x;
  for (y = 0; y < n; y++) f.push(new Uint8Array(n));
  [[0, 0], [0, n - 7], [n - 7, 0]].forEach(function (o) {
    for (y = -1; y < 8; y++) for (x = -1; x < 8; x++) {
      var yy = o[0] + y, xx = o[1] + x;
      if (yy >= 0 && xx >= 0 && yy < n && xx < n) f[yy][xx] = 1;
    }
  });
  for (x = 0; x < n; x++) { f[6][x] = 1; f[x][6] = 1; }
  var al = ALINEACION[version] || [];
  al.forEach(function (cy) {
    al.forEach(function (cx) {
      if ((cy === 6 && cx === 6) || (cy === 6 && cx === n - 7) || (cy === n - 7 && cx === 6)) return;
      for (y = cy - 2; y <= cy + 2; y++) for (x = cx - 2; x <= cx + 2; x++) f[y][x] = 1;
    });
  });
  for (x = 0; x < 9; x++) { f[8][x] = 1; f[x][8] = 1; }
  for (x = 0; x < 8; x++) { f[n - 1 - x][8] = 1; f[8][n - 1 - x] = 1; }
  if (version >= 7) {
    for (y = 0; y < 3; y++) for (x = 0; x < 6; x++) { f[n - 11 + y][x] = 1; f[x][n - 11 + y] = 1; }
  }
  return f;
}

function sacarCodewords(g, version, mascara) {
  var n = g.length, f = mapaFuncion(n, version), fn = MASCARAS[mascara];
  var bits = [], arriba = true;
  for (var x = n - 1; x > 0; x -= 2) {
    if (x === 6) x--;
    for (var i = 0; i < n; i++) {
      var y = arriba ? (n - 1 - i) : i;
      for (var dx = 0; dx < 2; dx++) {
        var cx = x - dx;
        if (f[y][cx]) continue;
        var b = g[y][cx];
        if (fn(y, cx)) b ^= 1;
        bits.push(b);
      }
    }
    arriba = !arriba;
  }
  var out = [];
  for (var k = 0; k + 8 <= bits.length; k += 8) {
    var v = 0;
    for (var j = 0; j < 8; j++) v = (v << 1) | bits[k + j];
    out.push(v);
  }
  return out;
}

var ALFANUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

function textoDeFlujo(datos, version) {
  var bits = [], i;
  for (i = 0; i < datos.length; i++)
    for (var k = 7; k >= 0; k--) bits.push((datos[i] >> k) & 1);
  var pos = 0;
  function coger(n) {
    if (pos + n > bits.length) throw new Error('bits');
    var v = 0;
    for (var j = 0; j < n; j++) v = (v << 1) | bits[pos + j];
    pos += n; return v;
  }
  function cuenta(modo) {
    var t = { 1: [10, 12, 14], 2: [9, 11, 13], 4: [8, 16, 16], 8: [8, 10, 12] }[modo];
    return t[version <= 9 ? 0 : (version <= 26 ? 1 : 2)];
  }
  var salida = '', bytes = [];
  while (pos + 4 <= bits.length) {
    var modo = coger(4);
    if (modo === 0) break;
    if (modo === 1) {
      var n1 = coger(cuenta(1));
      while (n1 >= 3) { var v3 = coger(10); salida += ('00' + v3).slice(-3); n1 -= 3; }
      if (n1 === 2) { var v2 = coger(7); salida += ('0' + v2).slice(-2); }
      else if (n1 === 1) salida += String(coger(4));
    } else if (modo === 2) {
      var n2 = coger(cuenta(2));
      while (n2 >= 2) { var v = coger(11); salida += ALFANUM[Math.floor(v / 45)] + ALFANUM[v % 45]; n2 -= 2; }
      if (n2 === 1) salida += ALFANUM[coger(6)];
    } else if (modo === 4) {
      var n4 = coger(cuenta(4));
      bytes = [];
      for (i = 0; i < n4; i++) bytes.push(coger(8));
      salida += decodificarBytes(bytes);
    } else if (modo === 7) {           /* ECI: solo nos dice el juego de letras */
      var primero = coger(8);
      if (primero & 0x80) { if (primero & 0x40) coger(16); else coger(8); }
    } else {
      throw new Error('modo ' + modo);
    }
  }
  return salida;
}

function decodificarBytes(bytes) {
  /* UTF-8 si cuadra, y si no, el juego de letras de siempre (ISO-8859-1).
     Hace falta porque nuestras etiquetas llevan direcciones y hay QR de
     fabricantes con acentos. */
  var i = 0, s = '', n = bytes.length;
  var utf8 = '', valido = true;
  while (i < n) {
    var b = bytes[i];
    if (b < 0x80) { utf8 += String.fromCharCode(b); i++; }
    else if (b >= 0xC2 && b <= 0xDF && i + 1 < n && (bytes[i+1] & 0xC0) === 0x80) {
      utf8 += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i+1] & 0x3F)); i += 2;
    } else if (b >= 0xE0 && b <= 0xEF && i + 2 < n &&
               (bytes[i+1] & 0xC0) === 0x80 && (bytes[i+2] & 0xC0) === 0x80) {
      utf8 += String.fromCharCode(((b & 0x0F) << 12) | ((bytes[i+1] & 0x3F) << 6) | (bytes[i+2] & 0x3F));
      i += 3;
    } else if (b >= 0xF0 && b <= 0xF4 && i + 3 < n) {
      var cp = ((b & 7) << 18) | ((bytes[i+1] & 0x3F) << 12) | ((bytes[i+2] & 0x3F) << 6) | (bytes[i+3] & 0x3F);
      cp -= 0x10000;
      utf8 += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
      i += 4;
    } else { valido = false; break; }
  }
  if (valido) return utf8;
  for (i = 0; i < n; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/* --------------------------------------------------- de la rejilla al texto */
function descifrarRejilla(g) {
  var n = g.length;
  if ((n - 17) % 4 !== 0) return null;
  var version = (n - 17) / 4;
  if (version < 1) return null;
  if (version >= 7) {
    /* La versión va escrita dentro del código, en dos copias. Si la que se lee
       no es la que sale de la medida, la medida estaba mal y se descarta: más
       vale no leer que leer otra cosa. */
    var v1 = 0, i, j;
    for (i = 5; i >= 0; i--) for (j = 2; j >= 0; j--) v1 = (v1 << 1) | g[i][n - 11 + j];
    var leida = masCercano(VERSIONES, v1);
    if (leida === null) {
      var v2 = 0;
      for (j = 5; j >= 0; j--) for (i = 2; i >= 0; i--) v2 = (v2 << 1) | g[n - 11 + i][j];
      leida = masCercano(VERSIONES, v2);
    }
    if (leida !== null && leida !== version) return null;
  }
  var tabla = BLOQUES[version];
  if (!tabla) return { error: 'version-' + version };
  var fmt = leerFormato(g);
  if (!fmt) return null;
  var info = tabla[fmt.nivel];
  if (!info) return null;
  var cws = sacarCodewords(g, version, fmt.mascara);
  if (cws.length < info.total) return null;
  cws = cws.slice(0, info.total);

  /* desentrelazar según la tabla */
  var tam = info.tam, nb = info.bloques, ec = info.ec;
  var sumaDatos = tam.reduce(function (a, b) { return a + b; }, 0);
  var bloques = [], k;
  for (k = 0; k < nb; k++) bloques.push([]);
  var idx = 0, maxTam = Math.max.apply(null, tam);
  for (var col = 0; col < maxTam; col++)
    for (k = 0; k < nb; k++) if (col < tam[k]) bloques[k].push(cws[idx++]);
  for (var c2 = 0; c2 < ec; c2++)
    for (k = 0; k < nb; k++) bloques[k].push(cws[sumaDatos + c2 * nb + k]);

  var flujo = [];
  for (k = 0; k < nb; k++) {
    if (!corregir(bloques[k], ec)) return null;
    flujo = flujo.concat(bloques[k].slice(0, tam[k]));
  }
  try { return { texto: textoDeFlujo(flujo, version), version: version, nivel: fmt.nivel }; }
  catch (e) { return null; }
}

/* ------------------------------------------------------------- la entrada */
/* Suavizado de tres por tres: con la cámara de un móvil en una nave mal
   iluminada la imagen viene con grano, y el grano parte módulos por la mitad.
   Solo se usa en el segundo intento, porque suavizar estropea los códigos
   pequeños, que son los que más se leen. */
function suavizar(lum, an, al) {
  var out = new Uint8Array(an * al);
  for (var y = 0; y < al; y++) for (var x = 0; x < an; x++) {
    var s = 0, n = 0;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      var qx = x + dx, qy = y + dy;
      if (qx >= 0 && qy >= 0 && qx < an && qy < al) { s += lum[qy * an + qx]; n++; }
    }
    out[y * an + x] = s / n;
  }
  return out;
}

function leerUnaVez(lum, an, al) {
  var bits = binarizar(lum, an, al);
  var ojos = buscarOjos(bits, an, al);
  if (ojos.length < 3) return null;
  /* se prueban las combinaciones de tres ojos más sólidas */
  var tope = Math.min(ojos.length, 5);
  for (var a = 0; a < tope; a++)
    for (var b = a + 1; b < tope; b++)
      for (var c = b + 1; c < tope; c++) {
        var r = probarCombinacion(bits, an, al, [ojos[a], ojos[b], ojos[c]]);
        if (r && r.texto !== undefined) return r;
      }
  return null;
}

function leer(lum, an, al) {
  if (!lum || an < 21 || al < 21) return null;
  var r = leerUnaVez(lum, an, al);
  if (r) return r;
  /* segundo intento con la imagen suavizada, por el grano de la cámara */
  if (an * al <= 4000000) return leerUnaVez(suavizar(lum, an, al), an, al);
  return null;
}

function probarCombinacion(bits, an, al, tres) {
  var o = ordenarOjos(tres);
  var esq = o.esquina, der = o.derecha, aba = o.abajo;
  var mod = (esq.mod + der.mod + aba.mod) / 3;
  if (mod < 1) return null;
  var distH = Math.sqrt(Math.pow(der.x - esq.x, 2) + Math.pow(der.y - esq.y, 2));
  var distV = Math.sqrt(Math.pow(aba.x - esq.x, 2) + Math.pow(aba.y - esq.y, 2));
  var base = Math.round(((distH / mod) + (distV / mod)) / 2) + 7;
  base = base + ((4 - (base - 1) % 4) % 4);     /* la dimensión es 4k+1 */

  /* No se juega todo a una sola medida: en ángulo o desenfocado la cuenta de
     módulos se puede quedar corta o pasarse por uno, y el código tiene escrito
     dentro cuál es su versión, así que un tamaño equivocado se descarta solo.
     Se prueban el estimado y los dos de al lado, el estimado primero. */
  var dims = [base, base + 4, base - 4, base + 8, base - 8];
  for (var di = 0; di < dims.length; di++) {
    var dim = dims[di];
    if (dim < 21 || dim > 177) continue;
    var version = (dim - 17) / 4;
    var intentos = [];
    var listaAl = ALINEACION[version] || [];
    if (listaAl.length) {
      var ultima = listaAl[listaAl.length - 1];
      /* Dónde debería caer el patrón de alineación de abajo a la derecha.
         Los vectores entre ojos cubren (dim-7) módulos, de 3,5 a dim-3,5, y el
         centro del patrón está en ultima+0,5: hay que avanzar la diferencia. */
      var f = (ultima + 0.5 - 3.5) / (dim - 7);
      var fx = esq.x + (der.x - esq.x) * f + (aba.x - esq.x) * f;
      var fy = esq.y + (der.y - esq.y) * f + (aba.y - esq.y) * f;
      var cuarta = buscarAlineacion(bits, an, al, fx, fy, mod);
      if (cuarta) {
        var u = (ultima + 0.5) / dim;
        intentos.push({ pts: [[esq.x, esq.y], [der.x, der.y], [cuarta.x, cuarta.y], [aba.x, aba.y]],
                        uv: [[3.5 / dim, 3.5 / dim], [(dim - 3.5) / dim, 3.5 / dim],
                             [u, u], [3.5 / dim, (dim - 3.5) / dim]] });
      }
    }
    /* sin patrón de alineación a mano: se completa el paralelogramo */
    intentos.push({ pts: [[esq.x, esq.y], [der.x, der.y],
                          [der.x + aba.x - esq.x, der.y + aba.y - esq.y], [aba.x, aba.y]],
                    uv: [[3.5 / dim, 3.5 / dim], [(dim - 3.5) / dim, 3.5 / dim],
                         [(dim - 3.5) / dim, (dim - 3.5) / dim], [3.5 / dim, (dim - 3.5) / dim]] });

    for (var t = 0; t < intentos.length; t++) {
      var m = homografia(intentos[t].uv, intentos[t].pts);
      if (!m) continue;
      var g = muestrear(bits, an, al, m, dim);
      if (!g) continue;
      var r = descifrarRejilla(g);
      if (r && r.texto !== undefined) return r;
    }
  }
  return null;
}

/* Homografía de cuatro puntos a cuatro puntos, resolviendo el sistema 8x8.
   Se hace así, y no con la fórmula corta, porque los cuatro puntos de origen
   no son un cuadrado: son los centros de los ojos y del patrón de alineación,
   que caen dentro del código, no en su borde. */
function homografia(orig, dest) {
  var A = [], b = [];
  for (var i = 0; i < 4; i++) {
    var u = orig[i][0], v = orig[i][1], x = dest[i][0], y = dest[i][1];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  var s = resolver(A, b);
  if (!s) return null;
  return [s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], 1];
}
function resolver(A, b) {
  var n = b.length, i, j, k;
  var M = A.map(function (f, idx) { return f.concat([b[idx]]); });
  for (i = 0; i < n; i++) {
    var piv = i;
    for (j = i + 1; j < n; j++) if (Math.abs(M[j][i]) > Math.abs(M[piv][i])) piv = j;
    if (Math.abs(M[piv][i]) < 1e-12) return null;
    var tmp = M[i]; M[i] = M[piv]; M[piv] = tmp;
    for (j = i + 1; j < n; j++) {
      var f = M[j][i] / M[i][i];
      for (k = i; k <= n; k++) M[j][k] -= f * M[i][k];
    }
  }
  var x = new Array(n);
  for (i = n - 1; i >= 0; i--) {
    var acc = M[i][n];
    for (j = i + 1; j < n; j++) acc -= M[i][j] * x[j];
    x[i] = acc / M[i][i];
  }
  return x;
}

function leerQR(lum, an, al) {
  var r = leer(lum, an, al);
  return r && r.texto !== undefined ? r.texto : null;
}
/* Todo colgado de un solo nombre, para no llenar la aplicación de nombres
   sueltos que puedan chocar con otra cosa. */
raiz.ARIZA_QR = { leerQR: leerQR, leerDetalle: leer, versiones: Object.keys(BLOQUES).length };
raiz.leerQR = leerQR;
raiz.leerQRdetalle = leer;
raiz.__qrInterno = { binarizar: binarizar, buscarOjos: buscarOjos, corregir: corregir,
                     descifrarRejilla: descifrarRejilla, textoDeFlujo: textoDeFlujo,
                     ordenarOjos: ordenarOjos, probarCombinacion: probarCombinacion,
                     muestrear: muestrear, homografia: homografia, leerFormato: leerFormato,
                     buscarAlineacion: buscarAlineacion, ALINEACION: ALINEACION,
                     sacarCodewords: sacarCodewords, BLOQUES: BLOQUES };

})(typeof module !== 'undefined' && module.exports ? module.exports : (typeof window !== 'undefined' ? window : this));
