/* ===========================================================================
   Lector de códigos de barras del fabricante · ARIZA SAT · 08-11-2026
   ---------------------------------------------------------------------------
   Lee EAN-13, EAN-8, UPC-A y Code 128 de un fotograma de la cámara. Va junto
   al lector de QR, dentro del index.html, para que funcione sin cobertura.

   Las tablas vienen de lector/barras.py, que es la única fuente, y que están
   comprobadas por OpenCV: se dibujan 200 códigos con esas tablas y OpenCV, que
   es de fuera, lee el número correcto. Las de Code 128 no las puede juzgar
   OpenCV, así que ahí se comprueba lo que manda la norma (107 patrones de 11
   módulos, tres barras y tres espacios cada uno, todos distintos) y el dígito
   de control, que es lo que impide que una tabla mal puesta dé una lectura
   falsa en vez de un «no se lee».

   LA REGLA QUE IMPIDE MENTIR
   Un código solo se da por leído cuando DOS líneas distintas de la imagen
   dicen exactamente lo mismo. Una sola línea puede cuadrar por casualidad con
   la sombra de un cartón; dos líneas separadas, no. Si no coinciden dos, el
   lector dice que no lee, y el técnico escribe el código, que es lo que hay
   que hacer.

   EL CERO DE DELANTE
   Un EAN-13 que empieza por cero es, por norma, el mismo código que un UPC-A
   de doce cifras: los lectores devuelven unas veces trece cifras y otras doce.
   Para que la misma caja no acabe dando de alta dos artículos, aquí se
   normaliza SIEMPRE a trece cifras, rellenando con cero por delante. Eso es lo
   que se guarda en el catálogo.
   =========================================================================== */
(function (raiz) {
'use strict';

var TABLA_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
var TABLA_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
var TABLA_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
var PARIDAD = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
var C128 = ["212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232", "233111"];              /* los 107 patrones, como anchos */
var C39 = {"101100000": "3", "100110000": "5", "100100100": "8", "100100001": "1", "001110000": "6", "001100100": "9", "001100001": "2", "000110100": "0", "000110001": "4", "000100101": "7", "101001000": "C", "100011000": "E", "100001100": "H", "100001001": "A", "001011000": "F", "001001100": "I", "001001001": "B", "000011100": "J", "000011001": "D", "000001101": "G", "101000010": "M", "100010010": "O", "100000110": "R", "100000011": "K", "001010010": "P", "001000110": "S", "001000011": "L", "000010110": "T", "000010011": "N", "000000111": "Q", "111000000": "W", "110010000": "Y", "110000100": ".", "110000001": "U", "011010000": "Z", "011000100": " ", "011000001": "V", "010010100": "*", "010010001": "X", "010000101": "-", "010101000": "$", "010100010": "/", "010001010": "+", "000101010": "%"};                /* patrón de nueve anchos → carácter */

/* De una cadena de bits al ancho de sus rachas: '0001101' → [3,2,1,1] */
function rachasDeBits(bits) {
  var out = [], n = 1;
  for (var i = 1; i <= bits.length; i++) {
    if (i < bits.length && bits[i] === bits[i-1]) n++;
    else { out.push(n); n = 1; }
  }
  return out;
}
/* Las tablas de dígitos, en anchos: cuatro elementos que suman siete módulos */
var ANCHOS_L = TABLA_L.map(rachasDeBits);
var ANCHOS_G = TABLA_G.map(rachasDeBits);
var ANCHOS_R = TABLA_R.map(rachasDeBits);

/* --------------------------------------------------- de la imagen a rachas
   Una línea horizontal de la imagen se convierte en la lista de anchos de sus
   zonas claras y oscuras. El umbral se saca de la propia línea, con el punto
   medio entre su parte más clara y la más oscura: así una etiqueta con sombra
   de un lado se sigue leyendo. */
function rachasDeMuestras(muestras) {
  /* El umbral se saca por tramos, con una ventana que va avanzando, en vez de
     uno solo para toda la línea. Hace falta porque una caja con la luz de un
     lado tiene la parte derecha más oscura que la izquierda: con un umbral
     único, media etiqueta sale toda negra. */
  var n = muestras.length;
  if (n < 30) return null;
  /* La ventana tiene que ser del tamaño de unas pocas barras, no del tamaño
     de la línea. Era n/12 sin tope, y en una línea de mil y pico píxeles eso
     son más de cien: dentro de esa ventana cabe la etiqueta entera y media
     mesa, el umbral se va a un punto medio que no separa nada y las barras
     desaparecen. Con tope en cuarenta píxeles el umbral mira solo el vecindario
     de verdad. */
  var VENT = Math.max(16, Math.min(40, Math.round(n / 12)));
  var minG = 255, maxG = 0, i;
  for (i = 0; i < n; i++) { if (muestras[i] < minG) minG = muestras[i];
                            if (muestras[i] > maxG) maxG = muestras[i]; }
  if (maxG - minG < 35) return null;            /* tramo liso: no hay código */
  var umbrales = new Float32Array(n);
  for (i = 0; i < n; i++) {
    var a = Math.max(0, i - VENT), b = Math.min(n - 1, i + VENT);
    var mn = 255, mx = 0;
    for (var j = a; j <= b; j += 2) {
      var v = muestras[j];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    /* Si el tramo es liso, se usa el contraste general: así un trozo de cartón
       sin barras no se parte en rachas falsas. */
    umbrales[i] = (mx - mn < 30) ? (minG + maxG) / 2 : (mn + mx) / 2;
  }
  var rachas = [], color = muestras[0] < umbrales[0] ? 1 : 0, c0 = color, run = 0;
  for (i = 0; i < n; i++) {
    var c = muestras[i] < umbrales[i] ? 1 : 0;
    if (c === color) run++;
    else { rachas.push(run); color = c; run = 1; }
  }
  rachas.push(run);
  return limpiar({ rachas: rachas, primero: c0 });
}

/* Quitar el ruido de uno o dos píxeles                            08-11-2026
   -------------------------------------------------------------------------
   En las fotos que mandó David aparecían rachas de uno y dos píxeles en medio
   de un código perfectamente sano: una mota del cartón, el grano de la foto o
   una barra que la compresión del iPhone parte por la mitad. Una racha así no
   es una barra de nada, pero rompe la cuenta de todo lo que viene detrás, y
   por una sola de esas el código entero se queda sin leer.

   Se juntan con sus vecinas (las tres pasan a ser una del color de fuera). El
   listón es una cuarta parte de la racha típica de esa línea, así que en un
   código grande se limpia más ruido y en uno pequeño casi nada, que es lo
   suyo: cuando el módulo mide dos píxeles, un píxel SÍ puede ser una barra. */
function limpiar(info) {
  var r = info.rachas;
  if (r.length < 9) return info;
  var orden = r.slice().sort(function (a, b) { return a - b; });
  var tipica = orden[Math.floor(orden.length / 2)];      /* la mediana */
  var liston = tipica / 4;
  if (liston < 1.2) return info;                         /* código pequeño: no se toca */

  var out = [r[0]], i;
  for (i = 1; i < r.length; i++) {
    /* una racha ruidosa entre dos sanas: se funden las tres */
    if (r[i] < liston && i + 1 < r.length && out.length) {
      out[out.length - 1] += r[i] + r[i+1];
      i++;
    } else out.push(r[i]);
  }
  return { rachas: out, primero: info.primero };
}

function rachasDeLinea(lum, an, y, salto) {
  var m = [], base = y * an;
  for (var i = 0; i < an; i += salto) m.push(lum[base + i]);
  return rachasDeMuestras(m);
}

function rachasDeColumna(lum, an, al, x, salto) {
  var m = [];
  for (var y = 0; y < al; y += salto) m.push(lum[y * an + x]);
  return rachasDeMuestras(m);
}

/* La misma línea leída del revés. Hace falta porque la etiqueta se puede
   apuntar al derecho o boca abajo, y boca abajo el código sale en espejo. */
function alReves(info) {
  if (!info) return null;
  var r = info.rachas.slice().reverse();
  /* el color de la primera racha al revés es el de la última al derecho */
  var ultimo = ((info.rachas.length - 1) % 2 === 0) ? info.primero : (1 - info.primero);
  return { rachas: r, primero: ultimo };
}

/* Cuál de las tablas se parece más a estos cuatro anchos. Devuelve
   {digito, error} o null si no se parece a ninguna lo bastante. */
function mejorDigito(anchos, tabla, modulo) {
  var mejor = -1, mejorErr = Infinity, segundaErr = Infinity;
  for (var d = 0; d < 10; d++) {
    var err = 0, t = tabla[d];
    for (var i = 0; i < 4; i++) {
      var e = anchos[i] / modulo - t[i];
      err += e * e;
    }
    if (err < mejorErr) { segundaErr = mejorErr; mejorErr = err; mejor = d; }
    else if (err < segundaErr) segundaErr = err;
  }
  /* Se exige que el ganador sea claramente mejor que el siguiente: si dos
     dígitos se parecen igual, la lectura no es de fiar. */
  if (mejorErr > 1.4) return null;
  if (segundaErr < mejorErr * 1.6) return null;
  return { digito: mejor, error: mejorErr };
}

function controlEan13(doce) {
  var s = 0;
  for (var i = 0; i < 12; i++) s += (+doce[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - s % 10) % 10);
}
function controlEan8(siete) {
  var s = 0;
  for (var i = 0; i < 7; i++) s += (+siete[i]) * (i % 2 === 0 ? 3 : 1);
  return String((10 - s % 10) % 10);
}

/* --------------------------------------------------------------- EAN y UPC
   Estructura: guarda 1-1-1, seis dígitos, separador 1-1-1-1-1, seis dígitos,
   guarda 1-1-1. El EAN-8 lleva cuatro y cuatro. */
function leerEanDesde(rachas, inicio, esBarra) {
  if (!esBarra) return null;
  var i = inicio;
  if (i + 3 > rachas.length) return null;
  var g = (rachas[i] + rachas[i+1] + rachas[i+2]) / 3;
  if (g < 0.8) return null;
  /* la guarda son tres rachas del mismo ancho */
  for (var k = 0; k < 3; k++) if (Math.abs(rachas[i+k] - g) > g * 0.6) return null;
  var modulo = g;
  i += 3;

  function seisDigitos(cuantos, usarRG) {
    var digitos = '', juego = '';
    for (var d = 0; d < cuantos; d++) {
      if (i + 4 > rachas.length) return null;
      var a = [rachas[i], rachas[i+1], rachas[i+2], rachas[i+3]];
      var total = a[0] + a[1] + a[2] + a[3];
      var mod = total / 7;                      /* cada dígito son siete módulos */
      if (mod < modulo * 0.55 || mod > modulo * 1.8) return null;
      var r;
      if (usarRG) {
        r = mejorDigito(a, ANCHOS_R, mod);
        if (!r) return null;
        juego += 'R';
      } else {
        var rl = mejorDigito(a, ANCHOS_L, mod);
        var rg = mejorDigito(a, ANCHOS_G, mod);
        if (rl && (!rg || rl.error <= rg.error)) { r = rl; juego += 'L'; }
        else if (rg) { r = rg; juego += 'G'; }
        else return null;
      }
      digitos += String(r.digito);
      modulo = (modulo * 3 + mod) / 4;          /* el módulo se va ajustando */
      i += 4;
    }
    return { digitos: digitos, juego: juego };
  }
  function separador() {
    if (i + 5 > rachas.length) return false;
    for (var k = 0; k < 5; k++)
      if (Math.abs(rachas[i+k] - modulo) > modulo * 0.7) return false;
    i += 5;
    return true;
  }

  /* --- EAN-13 / UPC-A --- */
  var guardado = i;
  var izq = seisDigitos(6, false);
  if (izq && separador()) {
    var der = seisDigitos(6, true);
    if (der && i + 3 <= rachas.length) {
      var finOk = true;
      for (var k = 0; k < 3; k++)
        if (Math.abs(rachas[i+k] - modulo) > modulo * 0.8) finOk = false;
      if (finOk) {
        var primero = PARIDAD.indexOf(izq.juego);
        if (primero >= 0) {
          var num = String(primero) + izq.digitos + der.digitos;
          if (controlEan13(num.slice(0, 12)) === num[12])
            return { texto: num, tipo: num[0] === '0' ? 'UPC-A' : 'EAN-13',
                     fin: i + 3 };
        }
      }
    }
  }
  /* --- EAN-8 --- */
  i = guardado;
  modulo = g;
  var iz8 = seisDigitos(4, false);
  if (iz8 && iz8.juego === 'LLLL' && separador()) {
    var de8 = seisDigitos(4, true);
    if (de8 && i + 3 <= rachas.length) {
      var fin8 = true;
      for (var k2 = 0; k2 < 3; k2++)
        if (Math.abs(rachas[i+k2] - modulo) > modulo * 0.8) fin8 = false;
      if (fin8) {
        var n8 = iz8.digitos + de8.digitos;
        if (controlEan8(n8.slice(0, 7)) === n8[7])
          return { texto: n8, tipo: 'EAN-8', fin: i + 3 };
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------ Code 128 */
var C128_ANCHOS = C128.map(function (p) {
  return p.split('').map(Number);
});
function mejorC128(anchos, modulo) {
  var mejor = -1, mejorErr = Infinity, segunda = Infinity;
  for (var v = 0; v < C128_ANCHOS.length; v++) {
    var t = C128_ANCHOS[v], err = 0;
    for (var i = 0; i < 6; i++) {
      var e = anchos[i] / modulo - t[i];
      err += e * e;
    }
    if (err < mejorErr) { segunda = mejorErr; mejorErr = err; mejor = v; }
    else if (err < segunda) segunda = err;
  }
  if (mejorErr > 1.6) return null;
  if (segunda < mejorErr * 1.5) return null;
  return mejor;
}

function leerC128Desde(rachas, inicio, esBarra) {
  if (!esBarra) return null;
  if (inicio + 6 > rachas.length) return null;
  var total = 0, i;
  for (i = 0; i < 6; i++) total += rachas[inicio + i];
  var modulo = total / 11;                      /* cada carácter son once módulos */
  if (modulo < 0.8) return null;
  var primero = mejorC128(rachas.slice(inicio, inicio + 6), modulo);
  if (primero === null || primero < 103 || primero > 105) return null;   /* START A/B/C */

  var valores = [primero], p = inicio + 6;
  while (p + 6 <= rachas.length) {
    var tot = 0;
    for (i = 0; i < 6; i++) tot += rachas[p + i];
    var mod = tot / 11;
    if (mod < modulo * 0.55 || mod > modulo * 1.8) return null;
    var v = mejorC128(rachas.slice(p, p + 6), mod);
    if (v === null) return null;
    if (v === 106) {                            /* STOP */
      valores.push(v);
      break;
    }
    valores.push(v);
    modulo = (modulo * 3 + mod) / 4;
    p += 6;
    if (valores.length > 90) return null;       /* no hay etiquetas tan largas */
  }
  if (valores[valores.length - 1] !== 106) return null;
  if (valores.length < 4) return null;          /* inicio, un dato, control, stop */

  /* El dígito de control: inicio + cada dato por su posición, módulo 103 */
  var datos = valores.slice(1, valores.length - 2);
  var control = valores[valores.length - 2];
  var suma = valores[0];
  for (i = 0; i < datos.length; i++) suma += datos[i] * (i + 1);
  if (suma % 103 !== control) return null;

  /* De los valores al texto, con los cambios de juego de la norma */
  var juego = valores[0] === 103 ? 'A' : (valores[0] === 104 ? 'B' : 'C');
  var texto = '';
  for (i = 0; i < datos.length; i++) {
    var d = datos[i];
    if (d === 99) { juego = 'C'; continue; }
    if (d === 100) { juego = juego === 'B' ? 'A' : 'B'; if (juego !== 'A') juego = 'B'; continue; }
    if (d === 101) { juego = 'A'; continue; }
    if (d === 102) continue;                    /* FNC1: separador de GS1, no es texto */
    if (d >= 96 && d <= 98) continue;           /* FNC2/3/4 y SHIFT: no los usamos */
    if (juego === 'C') {
      if (d > 99) return null;
      texto += (d < 10 ? '0' : '') + String(d);
    } else if (juego === 'B') {
      texto += String.fromCharCode(d + 32);
    } else {                                     /* juego A */
      texto += d < 64 ? String.fromCharCode(d + 32) : String.fromCharCode(d - 64);
    }
  }
  if (!texto) return null;
  return { texto: texto, tipo: 'Code 128', fin: p + 6 };
}

/* ------------------------------------------------------------------ Code 39
   Añadido el 08-11-2026, después de ver las cajas que mandó David: la de la
   fotocélula Geba no lleva ni EAN ni Code 128, lleva Code 39, y sin esto no
   había manera de leerla. Es el formato que usan muchos fabricantes para su
   referencia de artículo, así que en este sector sale a menudo.

   Cada carácter son nueve elementos (cinco barras y cuatro espacios) de los
   que exactamente tres son anchos, y entre carácter y carácter va un espacio
   estrecho de separación. El código empieza y acaba por un asterisco.

   Aquí no hay dígito de control (la norma no lo obliga y casi nadie lo pone),
   así que lo que impide una lectura falsa es: que cada grupo tenga justo tres
   anchos, que el ancho y el estrecho se distingan de verdad, que arranque y
   acabe en asterisco, y la regla de las dos líneas coincidentes. */
function leerC39Desde(rachas, inicio, esBarra) {
  if (!esBarra) return null;
  if (inicio + 9 > rachas.length) return null;

  /* De nueve anchos al patrón de anchos y estrechos, con el corte en medio.
     Se exige que lo ancho sea de verdad ancho: al menos el doble. */
  function patron(p) {
    if (p + 9 > rachas.length) return null;
    var g = rachas.slice(p, p + 9).slice().sort(function (a, b) { return a - b; });
    var estrecho = g[5], ancho = g[6];
    if (ancho < estrecho * 1.6) return null;      /* no se distinguen: no vale */
    var corte = (estrecho + ancho) / 2, bits = '', anchos = 0;
    for (var i = 0; i < 9; i++) {
      var es = rachas[p + i] > corte ? 1 : 0;
      anchos += es;
      bits += es;
    }
    if (anchos !== 3) return null;                /* «3 de 9»: ni más ni menos */
    return bits;
  }

  var b = patron(inicio);
  if (b === null || C39[b] !== '*') return null;  /* tiene que arrancar en * */

  var texto = '', p = inicio + 10;                /* 9 + el espacio separador */
  while (p + 9 <= rachas.length) {
    var pb = patron(p);
    if (pb === null) return null;
    var c = C39[pb];
    if (c === undefined) return null;
    if (c === '*') {
      if (!texto) return null;
      return { texto: texto, tipo: 'Code 39', fin: p + 9 };
    }
    texto += c;
    p += 10;
    if (texto.length > 40) return null;           /* no hay referencias así */
  }
  return null;                                    /* sin asterisco de cierre */
}

/* ------------------------------------------------------- una línea completa */
function leerLinea(info) {
  if (!info) return [];
  var rachas = info.rachas, salidas = [];
  /* Se prueba a empezar en cada racha oscura: el código puede estar en
     cualquier parte de la línea, con cartón y letras alrededor. */
  for (var i = 0; i + 10 < rachas.length; i++) {
    var esBarra = ((i % 2) === 0) === (info.primero === 1);
    if (!esBarra) continue;
    var r = leerEanDesde(rachas, i, true);
    if (r) { salidas.push(r); i = Math.max(i, r.fin - 1); continue; }
    r = leerC128Desde(rachas, i, true);
    if (r) { salidas.push(r); i = Math.max(i, r.fin - 1); continue; }
    r = leerC39Desde(rachas, i, true);
    if (r) { salidas.push(r); i = Math.max(i, r.fin - 1); }
  }
  return salidas;
}

/* El cero de delante: un EAN-13 que empieza por cero y un UPC-A de doce
   cifras son el MISMO código. Se guarda siempre con trece. */
function normalizar(texto, tipo) {
  if (tipo === 'UPC-A' && texto.length === 12) return '0' + texto;
  if (tipo === 'EAN-13' && texto.length === 13) return texto;
  return texto;
}

/* ===========================================================================
   ENCONTRAR EL CÓDIGO ANTES DE LEERLO                            08-11-2026

   POR QUÉ SE AÑADIÓ ESTO
   Hasta hoy el lector barría el fotograma entero a rayas y probaba a leer en
   cada una. Eso funciona cuando el código ocupa casi toda la imagen, que es
   como estaban hechas las pruebas, y NO funciona con una foto de verdad: con
   las ocho cajas que mandó David leía 0 de 8, ni siquiera recorriendo todas
   las líneas de la imagen. Recortando el código a mano, el mismo descifrador
   lo leía a la primera. O sea: lo que fallaba era la búsqueda.

   La razón es el umbral. Para decidir qué es barra y qué es papel, cada punto
   se compara con lo más claro y lo más oscuro que tiene alrededor. Si en ese
   «alrededor» hay madera, letras y sombras además de las barras, el umbral se
   va a un punto medio que no separa nada y las barras se pierden.

   LA SOLUCIÓN, QUE ES LA DE LOS LECTORES DE VERDAD
   Mirar primero DÓNDE hay rayas verticales apretadas, que es una huella que
   no deja ninguna otra cosa de una foto, quedarse con esas manchas y leer
   solo dentro de ellas. Dentro de la mancha casi todo son barras, así que el
   umbral vuelve a tener sentido.

   Se busca en las dos orientaciones, porque la etiqueta puede estar de pie, y
   se mira también el fotograma entero al final, por si el código llena la
   pantalla y no hay mancha que destaque.
   =========================================================================== */
function mapaDeRayas(lum, an, al, bloque) {
  var nx = Math.floor(an / bloque), ny = Math.floor(al / bloque);
  if (nx < 1 || ny < 1) return null;
  var hor = new Float32Array(nx * ny), ver = new Float32Array(nx * ny);
  for (var by = 0; by < ny; by++) {
    for (var bx = 0; bx < nx; bx++) {
      var h = 0, v = 0, x0 = bx * bloque, y0 = by * bloque;
      for (var y = y0 + 1; y < y0 + bloque - 1; y += 2) {
        var f = y * an;
        for (var x = x0 + 1; x < x0 + bloque - 1; x++) {
          h += Math.abs(lum[f + x + 1] - lum[f + x - 1]);
          v += Math.abs(lum[f + an + x] - lum[f - an + x]);
        }
      }
      hor[by * nx + bx] = h - v;        /* barras de pie: mucho cambio al andar en horizontal */
      ver[by * nx + bx] = v - h;        /* barras tumbadas */
    }
  }
  return { hor: hor, ver: ver, nx: nx, ny: ny };
}

/* Junta los bloques vecinos que pasan el listón y devuelve sus rectángulos,
   del más marcado al menos. */
function manchasDe(m, nx, ny, bloque, cuantas) {
  var mx = 0, i;
  for (i = 0; i < m.length; i++) if (m[i] > mx) mx = m[i];
  if (mx <= 0) return [];
  var liston = mx * 0.30;
  var visto = new Uint8Array(nx * ny), out = [];
  var vecinos = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
  for (i = 0; i < nx * ny; i++) {
    if (visto[i] || m[i] < liston) continue;
    var pila = [i], x0 = nx, x1 = 0, y0 = ny, y1 = 0, fuerza = 0;
    visto[i] = 1;
    while (pila.length) {
      var p = pila.pop(), px = p % nx, py = (p / nx) | 0;
      fuerza += m[p];
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
      for (var k = 0; k < 8; k++) {
        var qx = px + vecinos[k][0], qy = py + vecinos[k][1];
        if (qx < 0 || qy < 0 || qx >= nx || qy >= ny) continue;
        var q = qy * nx + qx;
        if (!visto[q] && m[q] >= liston) { visto[q] = 1; pila.push(q); }
      }
    }
    out.push({ fuerza: fuerza,
               x0: x0 * bloque, y0: y0 * bloque,
               x1: (x1 + 1) * bloque, y1: (y1 + 1) * bloque });
  }
  out.sort(function (a, b) { return b.fuerza - a.fuerza; });
  return out.slice(0, cuantas);
}

function recorte(lum, an, al, r, margen) {
  var x0 = Math.max(0, r.x0 - margen), y0 = Math.max(0, r.y0 - margen);
  var x1 = Math.min(an, r.x1 + margen), y1 = Math.min(al, r.y1 + margen);
  var a = x1 - x0, b = y1 - y0;
  if (a < 40 || b < 8) return null;
  var out = new Uint8Array(a * b);
  for (var y = 0; y < b; y++)
    out.set(lum.subarray((y0 + y) * an + x0, (y0 + y) * an + x1), y * a);
  return { lum: out, an: a, al: b };
}

/* Ampliar un trozo pequeño antes de leerlo                       08-11-2026
   -------------------------------------------------------------------------
   Ampliar no añade información: lo que no está en la foto no aparece. Lo que
   sí hace es que el paso de barra a papel deje de ser un salto de un píxel y
   pase a ser una cuesta de varios, y entonces el umbral local acierta mucho
   mejor dónde está el borde de verdad. Con un código de cuatro píxeles por
   módulo eso cambia bastante. OpenCV, que es de fuera, falla con la caja
   Fullwat de David a tamaño natural y acierta al doble: no es cosa nuestra,
   es cómo se comportan estos descifradores. */
function ampliar(c, veces) {
  var an = c.an * veces, al = c.al * veces;
  var out = new Uint8Array(an * al);
  for (var y = 0; y < al; y++) {
    var sy = (y + 0.5) / veces - 0.5;
    var y0 = Math.floor(sy), fy = sy - y0;
    if (y0 < 0) { y0 = 0; fy = 0; }
    if (y0 > c.al - 2) { y0 = c.al - 2; fy = 1; }
    for (var x = 0; x < an; x++) {
      var sx = (x + 0.5) / veces - 0.5;
      var x0 = Math.floor(sx), fx = sx - x0;
      if (x0 < 0) { x0 = 0; fx = 0; }
      if (x0 > c.an - 2) { x0 = c.an - 2; fx = 1; }
      var a = c.lum[y0 * c.an + x0], b = c.lum[y0 * c.an + x0 + 1];
      var d = c.lum[(y0+1) * c.an + x0], e = c.lum[(y0+1) * c.an + x0 + 1];
      out[y * an + x] = (a + (b - a) * fx) + ((d + (e - d) * fx) - (a + (b - a) * fx)) * fy;
    }
  }
  return { lum: out, an: an, al: al };
}

/* Rachas a lo largo de una recta cualquiera                       08-11-2026
   -------------------------------------------------------------------------
   Hasta hoy solo se barría en horizontal y en vertical. Pero la etiqueta de
   la caja Beninca de David está pegada en diagonal, a ojo unos treinta y
   cinco grados, y así es como se van a fotografiar casi todas: nadie encuadra
   recto con una caja en una mano y el móvil en la otra.

   Una raya que cruza el código en diagonal sirve igual, porque TODAS las
   barras se estiran lo mismo y lo que cuenta son las proporciones. Solo hacía
   falta poder trazarla. */
function rachasDeRecta(lum, an, al, x0, y0, dx, dy, pasos) {
  var m = [], x = x0, y = y0;
  for (var i = 0; i < pasos; i++) {
    var xi = Math.floor(x), yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= an - 1 || yi >= al - 1) {
      if (m.length) break;                /* se salió por el otro lado */
      x += dx; y += dy;
      continue;                           /* todavía no ha entrado */
    }
    /* Se mezclan los cuatro píxeles de alrededor en vez de coger el más
       cercano. En diagonal, coger el más cercano hace dientes de sierra, y
       esos dientes se cuelan luego como barras de mentira. */
    var fx = x - xi, fy = y - yi, f = yi * an + xi;
    var a = lum[f], b = lum[f+1], c = lum[f+an], d = lum[f+an+1];
    m.push((a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy);
    x += dx; y += dy;
  }
  if (m.length < 30) return null;
  return rachasDeMuestras(m);
}

/* El barrido de siempre, pero sobre un trozo: filas, columnas, al derecho y
   del revés, con la regla de las dos líneas coincidentes. */
function barrer(lum, an, al, soloFilas) {
  var vistos = {}, encontrado = null, k, info;

  function apuntar(salidas) {
    for (var j = 0; j < salidas.length; j++) {
      var s = salidas[j];
      var clave = s.tipo + '|' + normalizar(s.texto, s.tipo);
      vistos[clave] = (vistos[clave] || 0) + 1;
      /* DOS líneas distintas diciendo lo mismo: esa es la regla */
      if (vistos[clave] >= 2 && !encontrado)
        encontrado = { texto: normalizar(s.texto, s.tipo), tipo: s.tipo, lineas: vistos[clave] };
    }
  }

  /* Una línea por cada tres píxeles de alto, con un tope para no eternizarse.
     Antes eran cuarenta en toda la imagen, y con un código de cincuenta
     píxeles de alto caía UNA línea dentro: con una sola línea la regla de las
     dos coincidentes no se puede cumplir nunca. Ese era el otro fallo. */
  var filas = Math.min(120, Math.max(12, Math.round(al / 3)));
  for (k = 0; k < filas && !encontrado; k++) {
    var y = Math.round((al - 1) * (k + 0.5) / filas);
    info = rachasDeLinea(lum, an, y, 1);
    if (!info) continue;
    apuntar(leerLinea(info));
    if (!encontrado) apuntar(leerLinea(alReves(info)));
  }
  if (encontrado || soloFilas) return encontrado;

  var cols = Math.min(120, Math.max(12, Math.round(an / 3)));
  for (k = 0; k < cols && !encontrado; k++) {
    var x = Math.round((an - 1) * (k + 0.5) / cols);
    info = rachasDeColumna(lum, an, al, x, 1);
    if (!info) continue;
    apuntar(leerLinea(info));
    if (!encontrado) apuntar(leerLinea(alReves(info)));
  }
  return encontrado;
}

/* El ángulo al que están las barras                               08-11-2026
   -------------------------------------------------------------------------
   La etiqueta de la caja Beninca de David está pegada en diagonal, y así es
   como se van a fotografiar casi todas: nadie encuadra recto con una caja en
   una mano y el móvil en la otra. Probar a ciegas en diagonal a cuarenta y
   cinco grados no vale: a esa caja hay que entrarle a treinta y cinco, y a la
   siguiente a otro.

   Así que el ángulo se MIDE. Donde hay barras, el cambio de claro a oscuro
   apunta siempre en la misma dirección: perpendicular a las barras, que es
   justo la dirección en la que hay que leer. Sumando esos cambios en todo el
   trozo sale esa dirección, y es un cálculo barato. */
function anguloDeBarras(lum, an, al) {
  var sxx = 0, syy = 0, sxy = 0;
  for (var y = 2; y < al - 2; y += 2) {
    var f = y * an;
    for (var x = 2; x < an - 2; x += 2) {
      var gx = lum[f + x + 1] - lum[f + x - 1];
      var gy = lum[f + an + x] - lum[f - an + x];
      if (Math.abs(gx) + Math.abs(gy) < 24) continue;   /* zona lisa: no dice nada */
      sxx += gx * gx; syy += gy * gy; sxy += gx * gy;
    }
  }
  if (sxx + syy < 1) return null;
  /* La dirección dominante del cambio. Sale entre -90 y 90 grados, que es lo
     que hace falta: leer de izquierda a derecha o al revés da igual, porque
     el lector prueba las dos. */
  var ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  /* Y cuánto manda esa dirección sobre el resto: si no manda, es que ahí no
     hay barras y no merece la pena hacerle caso. */
  var fuerza = Math.sqrt((sxx - syy) * (sxx - syy) + 4 * sxy * sxy) / (sxx + syy);
  return { ang: ang, fuerza: fuerza };
}

/* Barrer rectas paralelas en la dirección que se le diga. */
function barrerEnAngulo(lum, an, al, ang) {
  var ux = Math.cos(ang), uy = Math.sin(ang);
  var vx = -uy, vy = ux;
  var largo = Math.round(Math.abs(an * ux) + Math.abs(al * uy));
  var ancho = Math.round(Math.abs(an * vx) + Math.abs(al * vy));
  if (largo < 40 || ancho < 4) return null;
  var n = Math.min(120, Math.max(12, Math.round(ancho / 3)));
  var cx = an / 2, cy = al / 2;
  var vistos = {}, encontrado = null;

  function apuntar(salidas) {
    for (var j = 0; j < salidas.length; j++) {
      var s = salidas[j];
      var clave = s.tipo + '|' + normalizar(s.texto, s.tipo);
      vistos[clave] = (vistos[clave] || 0) + 1;
      if (vistos[clave] >= 2 && !encontrado)
        encontrado = { texto: normalizar(s.texto, s.tipo), tipo: s.tipo, lineas: vistos[clave] };
    }
  }

  for (var k = 0; k < n && !encontrado; k++) {
    var d = ((k + 0.5) / n - 0.5) * ancho;
    var x0 = cx + d * vx - (largo / 2) * ux;
    var y0 = cy + d * vy - (largo / 2) * uy;
    var info = rachasDeRecta(lum, an, al, x0, y0, ux, uy, largo);
    if (!info) continue;
    apuntar(leerLinea(info));
    if (!encontrado) apuntar(leerLinea(alReves(info)));
  }
  return encontrado;
}

function barrer2(c) { return barrer(c.lum, c.an, c.al, false); }

/* Un trozo, mirado por todos los lados. Cuando se va «a fondo» se prueba un
   abanico de ángulos en vez de fiarse solo del que se midió: la medida se
   ensucia si en el recorte entra madera con vetas, y a las vetas de una mesa
   les pasa lo mismo que a las barras. */
function exprimir(c) {
  var med = anguloDeBarras(c.lum, c.an, c.al), r;
  if (med && med.fuerza > 0.25) {
    r = barrerEnAngulo(c.lum, c.an, c.al, med.ang);
    if (r) return r;
  }
  return barrer(c.lum, c.an, c.al, false);
}

/* El abanico: de cinco en cinco grados. No de quince, que fue lo primero que
   probé y se saltaba justo la caja Beninca de David, que hay que leerla a
   treinta y cinco o a cuarenta y a treinta y a cuarenta y cinco no sale. */
function abanico(c) {
  for (var g = 0; g < 180; g += 5) {
    var r = barrerEnAngulo(c.lum, c.an, c.al, g * Math.PI / 180);
    if (r) return r;
  }
  return null;
}

/* aFondo: lo que hace el botón de leer. En el bucle de la cámara no se puede
   gastar tanto (hay que seguir el vídeo), pero cuando el técnico aprieta el
   botón sí: más vale tardar un segundo que no leer. */
function leer(lum, an, al, aFondo) {
  if (!lum || an < 40 || al < 10) return null;

  /* 1. Las manchas de rayas, en las dos orientaciones. El bloque se ajusta al
        tamaño del fotograma para que el mapa salga siempre parecido. */
  var bloque = Math.max(12, Math.min(40, Math.round(Math.max(an, al) / 60)));
  var mp = mapaDeRayas(lum, an, al, bloque);
  if (mp) {
    var cand = [];
    var a = manchasDe(mp.hor, mp.nx, mp.ny, bloque, 5);
    var b = manchasDe(mp.ver, mp.nx, mp.ny, bloque, 5);
    var i;
    for (i = 0; i < a.length; i++) cand.push({ r: a[i], filas: true });
    for (i = 0; i < b.length; i++) cand.push({ r: b[i], filas: false });
    cand.sort(function (p, q) { return q.r.fuerza - p.r.fuerza; });

    /* Primera vuelta, barata, por todas las manchas. */
    var trozos = [];
    for (i = 0; i < cand.length; i++) {
      if (!aFondo && i >= 4) break;      /* en el bucle, solo las mejores */
      var c = recorte(lum, an, al, cand[i].r, bloque * 2);
      if (!c) continue;
      trozos.push(c);
      var r = exprimir(c);
      if (r) return r;
      /* Si el trozo es pequeño, otra vuelta al doble de tamaño: ampliar no
         añade nada a la foto, pero el borde entre barra y papel deja de ser
         un escalón de un píxel y el umbral lo encuentra mejor. */
      if (c.an * c.al <= 600 * 600) {
        r = exprimir(ampliar(c, 2));
        if (r) return r;
      }
    }

    /* 2. Antes de nada caro: el fotograma entero, por si el código lo llena de
          lado a lado y entonces no hay mancha que destaque. */
    var entero = barrer(lum, an, al, false);
    if (entero) return entero;

    /* 3. Y la vuelta cara, solo cuando el técnico aprieta el botón: el
          abanico de ángulos, primero en cada mancha y después en el fotograma
          entero. Lo último hace falta porque la mancha puede salir mal
          recortada: con la caja Beninca de las fotos de David, el recorte se
          come medio código y se lleva media mesa, y el abanico sobre el
          fotograma completo sí lo coge. */
    if (aFondo) {
      var r2;
      for (i = 0; i < trozos.length; i++) {
        r2 = abanico(trozos[i]);
        if (r2) return r2;
        if (trozos[i].an * trozos[i].al <= 450 * 450) {
          r2 = abanico(ampliar(trozos[i], 2));
          if (r2) return r2;
        }
      }
      r2 = abanico({ lum: lum, an: an, al: al });
      if (r2) return r2;
    }
    return null;
  }

  return barrer(lum, an, al, false);
}

raiz.ARIZA_BARRAS = {
  leer: leer,
  leerCodigo: function (lum, an, al) { var r = leer(lum, an, al); return r ? r.texto : null; },
  normalizar: normalizar,
};
raiz.__barrasInterno = { rachasDeLinea: rachasDeLinea, leerLinea: leerLinea,
                         rachasDeColumna: rachasDeColumna, alReves: alReves,
                         mapaDeRayas: mapaDeRayas, manchasDe: manchasDe,
                         recorte: recorte, ampliar: ampliar, barrer: barrer,
                         anguloDeBarras: anguloDeBarras, barrerEnAngulo: barrerEnAngulo,
                         rachasDeRecta: rachasDeRecta,
                         leerC39Desde: leerC39Desde, C39: C39,
                         leerEanDesde: leerEanDesde, leerC128Desde: leerC128Desde,
                         controlEan13: controlEan13, controlEan8: controlEan8,
                         ANCHOS_L: ANCHOS_L, ANCHOS_G: ANCHOS_G, ANCHOS_R: ANCHOS_R,
                         C128_ANCHOS: C128_ANCHOS };

})(typeof module !== 'undefined' && module.exports ? module.exports : (typeof window !== 'undefined' ? window : this));
