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

var TABLA_L = __TABLA_L__;
var TABLA_G = __TABLA_G__;
var TABLA_R = __TABLA_R__;
var PARIDAD = __PARIDAD__;
var C128 = __C128__;              /* los 107 patrones, como anchos */

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
  var VENT = Math.max(16, Math.round(n / 12));
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
  return { rachas: rachas, primero: c0 };
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

function leer(lum, an, al) {
  if (!lum || an < 40 || al < 10) return null;
  var salto = Math.max(an, al) > 1400 ? 2 : 1;
  var vistos = {};
  var encontrado = null;

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

  /* Se barre por filas y también por columnas, porque la etiqueta puede estar
     de pie: pegada en el lomo de la caja, o el móvil girado. Y cada barrido se
     prueba al derecho y del revés, porque boca abajo el código sale en espejo.
     Los códigos de barras son altos a propósito, así que una línea estropeada
     (un dedo, un brillo) la arregla la siguiente. */
  var filas = Math.min(40, Math.max(12, Math.round(al / 12)));
  var k, info;
  for (k = 0; k < filas && !encontrado; k++) {
    var y = Math.round((al - 1) * (k + 0.5) / filas);
    info = rachasDeLinea(lum, an, y, salto);
    if (!info) continue;
    apuntar(leerLinea(info));
    if (!encontrado) apuntar(leerLinea(alReves(info)));
  }
  if (encontrado) return encontrado;

  var cols = Math.min(40, Math.max(12, Math.round(an / 12)));
  for (k = 0; k < cols && !encontrado; k++) {
    var x = Math.round((an - 1) * (k + 0.5) / cols);
    info = rachasDeColumna(lum, an, al, x, salto);
    if (!info) continue;
    apuntar(leerLinea(info));
    if (!encontrado) apuntar(leerLinea(alReves(info)));
  }
  return encontrado;
}

raiz.ARIZA_BARRAS = {
  leer: leer,
  leerCodigo: function (lum, an, al) { var r = leer(lum, an, al); return r ? r.texto : null; },
  normalizar: normalizar,
};
raiz.__barrasInterno = { rachasDeLinea: rachasDeLinea, leerLinea: leerLinea,
                         rachasDeColumna: rachasDeColumna, alReves: alReves,
                         leerEanDesde: leerEanDesde, leerC128Desde: leerC128Desde,
                         controlEan13: controlEan13, controlEan8: controlEan8,
                         ANCHOS_L: ANCHOS_L, ANCHOS_G: ANCHOS_G, ANCHOS_R: ANCHOS_R,
                         C128_ANCHOS: C128_ANCHOS };

})(typeof module !== 'undefined' && module.exports ? module.exports : (typeof window !== 'undefined' ? window : this));
