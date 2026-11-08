/* ===========================================================================
   El lector de códigos, dentro de la aplicación de verdad · 08-11-2026
   ---------------------------------------------------------------------------
   Qué se prueba aquí:
     1. Que el descifrador que va incrustado en index.html lee los QR de las
        etiquetas de Ariza desde un fotograma, igual que los leería de la
        cámara. Los códigos los ha dibujado OpenCV, no nosotros, y están en
        casos-qr.json con la confirmación de que OpenCV mismo los lee.
     2. Que de un código leído sale la línea de material en el parte, con su
        comprobación de que la etiqueta cuadra con el material.
     3. Que el aviso de «este teléfono no sabe leer» ya no sale cuando hay
        cámara, que es lo que dejaba a David escribiendo el código a mano en su
        iPhone.
     4. Que lo que no es un código no se lee como si lo fuera.

   Lo que NO prueba, y hay que probar con el móvil en la mano: que la cámara de
   un iPhone de verdad entregue fotogramas aprovechables. Eso no lo puede
   hacer un navegador sin cámara.
   =========================================================================== */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const AQUI = dirname(fileURLToPath(import.meta.url));
const URL_APP = process.env.ARIZA_URL || 'http://127.0.0.1:8899/index.html';
const CASOS = JSON.parse(readFileSync(join(AQUI, 'casos-qr.json'), 'utf8'));
const ajustes = JSON.parse(readFileSync(join(AQUI, 'ajustes.json'), 'utf8'));

const ENV = { ...process.env, LANG: 'es_ES.UTF-8', LANGUAGE: 'es_ES:es', LC_ALL: 'es_ES.UTF-8' };
const nav = await chromium.launch({ env: ENV, args: ['--lang=es-ES'] });
const ctx = await nav.newContext({ viewport: { width: 1320, height: 2200 },
  locale: 'es-ES', timezoneId: 'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    /* Dos materiales con etiqueta, de los que llevan QR impreso, y uno de
       antes del almacén sin código, que es lo que hay en el catálogo viejo. */
    const arts = [
      { id: 'art-banda', descripcion: 'Banda de seguridad resistiva 2 m', unidad: 'ud',
        familia: 'Seguridad', marca: 'ASO', referencia: 'Sentir 45.25',
        codigo: 'MAT-0012', token: 'A3K9', activo: true },
      { id: 'art-foto', descripcion: 'Fotocélula de espejo', unidad: 'ud',
        familia: 'Seguridad', marca: 'Erreka', referencia: 'FT-20',
        codigo: 'MAT-0007', token: 'B4L0', activo: true },
      { id: 'art-viejo', descripcion: 'Tornillería variada', unidad: 'kg', activo: true },
    ];
    db.articulos.push(...arts);
    db.catalogo = db.articulos;
    /* Una avería abierta y asignada, que es la visita donde el técnico lee la
       etiqueta de la caja mientras rellena el parte. */
    db.avisos.push({ id: 'qr-1', tipo: 'averia', subtipo: 'averia', estado: 'asignado',
      prioridad: 'normal', tecnico_id: 'usuario-admin',
      cliente_id: db.puertas[0].cliente_id, puerta_id: db.puertas[0].id,
      descripcion: 'No cierra del todo', creado: new Date().toISOString(),
      fecha_prevista: new Date().toISOString().slice(0, 10) });
  };
});
const errores = [];
const pag = await ctx.newPage();
pag.on('pageerror', e => errores.push('JS: ' + e.message));
/* La letra de Google no se puede descargar desde donde corren las pruebas, y
   eso no es un fallo de la aplicación: la aplicación tiene letras de respaldo.
   Se descarta a propósito y se deja escrito, para que no tape otros errores. */
const esLaLetraDeGoogle = t => /fonts\.(googleapis|gstatic)\.com/.test(t) ||
  /Failed to load resource/.test(t);
pag.on('console', m => { if (m.type() === 'error' && !esLaLetraDeGoogle(m.text()))
  errores.push('consola: ' + m.text()); });
await pag.goto(URL_APP);
await pag.waitForTimeout(1700);

let ok = 0, mal = 0;
const paso = (t, bien, extra = '') => { bien ? ok++ : mal++;
  console.log((bien ? '  OK  ' : ' FALLA ') + t + (extra !== '' && extra !== undefined ? ' → ' + String(extra) : '')); };
const bloque = t => console.log('\n· ' + t);
const T = (f, arg) => arg === undefined ? pag.evaluate(f) : pag.evaluate(f, arg);

/* Pinta el PNG del caso en un canvas y le da al lector la luminancia, que es
   exactamente lo que le llega desde la cámara. */
const leerCaso = (png) => T(async (b64) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, c.width, c.height).data;
  const lum = new Uint8Array(c.width * c.height);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4)
    lum[i] = (d[j] * 77 + d[j+1] * 151 + d[j+2] * 28) >> 8;
  const t0 = performance.now();
  const txt = window.ARIZA_QR ? window.ARIZA_QR.leerQR(lum, c.width, c.height) : '(no hay lector)';
  return { txt, ms: Math.round(performance.now() - t0) };
}, png);

bloque('1. El descifrador está dentro de la aplicación');
const presente = await T(() => ({
  hay: !!window.ARIZA_QR,
  versiones: window.ARIZA_QR ? window.ARIZA_QR.versiones : 0,
  nativo: typeof BarcodeDetector !== 'undefined',
}));
paso('el lector de códigos viaja dentro del index.html', presente.hay === true);
paso('y trae las tablas de la norma para muchas versiones de QR',
  presente.versiones >= 20, presente.versiones);
console.log('    (este navegador ' + (presente.nativo ? 'SÍ' : 'NO') +
            ' trae lector propio, como Safari, que no lo trae)');

bloque('2. Lee los códigos de las etiquetas de Ariza');
const tiempos = [];
for (const c of CASOS) {
  const r = await leerCaso(c.png);
  tiempos.push(r.ms);
  paso(c.nota, r.txt === c.texto, r.txt === null ? '(no ha leído nada)' : r.txt);
}
paso('y lo hace lo bastante rápido para leer en vivo',
  Math.max(...tiempos) < 400, 'el más lento ' + Math.max(...tiempos) + ' ms');

bloque('3. Lo que no es un código no se lee');
const falsos = await T(async () => {
  const salida = [];
  const c = document.createElement('canvas');
  c.width = 320; c.height = 320;
  const cx = c.getContext('2d');
  /* un cuadriculado, que es lo que más se parece a un código sin serlo */
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, 320, 320);
  cx.fillStyle = '#000';
  for (let y = 0; y < 320; y += 16) for (let x = 0; x < 320; x += 16)
    if (((x + y) / 16) % 2 === 0) cx.fillRect(x, y, 16, 16);
  const lee = () => {
    const d = cx.getImageData(0, 0, 320, 320).data;
    const lum = new Uint8Array(320 * 320);
    for (let i = 0, j = 0; i < lum.length; i++, j += 4)
      lum[i] = (d[j] * 77 + d[j+1] * 151 + d[j+2] * 28) >> 8;
    return window.ARIZA_QR.leerQR(lum, 320, 320);
  };
  salida.push(lee());
  /* manchas al azar */
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, 320, 320);
  for (let i = 0; i < 60; i++) {
    cx.fillStyle = 'rgb(' + (i * 4 % 255) + ',' + (i * 7 % 255) + ',' + (i * 11 % 255) + ')';
    cx.fillRect((i * 37) % 300, (i * 53) % 300, 10 + i % 30, 10 + i % 20);
  }
  salida.push(lee());
  /* todo blanco */
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, 320, 320);
  salida.push(lee());
  return salida;
});
paso('un cuadriculado no se lee como un código', falsos[0] === null, falsos[0]);
paso('unas manchas tampoco', falsos[1] === null, falsos[1]);
paso('y una pantalla en blanco tampoco', falsos[2] === null, falsos[2]);

bloque('4. De la etiqueta leída sale la línea de material');
await T(() => { const g = window.__T; g.S.tab = 'campo'; g.pintar(); });
await pag.waitForTimeout(400);
const mete = await T(async () => {
  const g = window.__T;
  const av = (g.S.avisos || []).find(a => a.id === 'qr-1');
  if (!av) return { error: 'no está la visita de prueba qr-1' };
  g.dlgCierre(av.id);
  await new Promise(r => setTimeout(r, 1500));
  const art = (g.S.catalogo || []).find(x => x.codigo && x.token);
  if (!art) return { error: 'el catálogo del simulador no trae materiales con etiqueta' };
  const etiqueta = 'https://arizapa.es/#M-' + String(art.codigo).replace('-', '') + '-' + art.token;
  const antes = document.querySelectorAll('#mats .mat-fila').length;
  const puesto = g.usarEtiqueta(etiqueta);
  await new Promise(r => setTimeout(r, 300));
  const filas = [...document.querySelectorAll('#mats .mat-fila')];
  /* la misma etiqueta otra vez: tiene que sumar una unidad, no repetir línea */
  g.usarEtiqueta(etiqueta);
  await new Promise(r => setTimeout(r, 300));
  const filas2 = [...document.querySelectorAll('#mats .mat-fila')];
  const cant = filas2.length ? (filas2.find(f => {
    const s = f.querySelector('.mat-art'); return s && s.value === art.id;
  }) || {}).querySelector ? null : null : null;
  const fila = filas2.find(f => { const s = f.querySelector('.mat-art'); return s && s.value === art.id; });
  /* y una etiqueta con el código de seguridad cambiado NO debe entrar */
  const falsa = 'https://arizapa.es/#M-' + String(art.codigo).replace('-', '') + '-XXXX';
  const antesFalsa = document.querySelectorAll('#mats .mat-fila').length;
  g.usarEtiqueta(falsa);
  await new Promise(r => setTimeout(r, 300));
  return { error: null, puesto, antes, despues: filas.length,
           descripcion: fila ? (fila.querySelector('.mat-desc') || {}).value : null,
           cantidad: fila ? (fila.querySelector('.mat-cant') || {}).value : null,
           trasFalsa: document.querySelectorAll('#mats .mat-fila').length, antesFalsa,
           esperado: art.descripcion };
});
if (mete.error) paso('se puede abrir una visita para probar el material', false, mete.error);
else {
  paso('leer la etiqueta pone el material en el parte', mete.puesto === true);
  paso('con su descripción, la del catálogo', mete.descripcion === mete.esperado, mete.descripcion);
  paso('leer dos veces la misma caja suma unidades, no repite línea',
    String(mete.cantidad) === '2', mete.cantidad);
  paso('una etiqueta con el código de seguridad cambiado no entra',
    mete.trasFalsa === mete.antesFalsa, mete.trasFalsa + ' vs ' + mete.antesFalsa);
}

bloque('5. El aviso que salía en el iPhone');
const aviso = await T(async () => {
  const g = window.__T;
  /* La caja del lector se mira con el parte abierto, que es donde vive. */
  g.dlgCierre('qr-1');
  await new Promise(r => setTimeout(r, 1500));
  const caja = document.getElementById('mat-lector');
  const boton = document.querySelector('[data-act="mat-leer"]');
  return { hayCaja: !!caja, hayBoton: !!boton, puede: g.puedeLeerCamara(),
           campo: !!document.getElementById('mat-cod') };
});
paso('el parte trae el botón de leer la etiqueta', aviso.hayBoton === true);
paso('y la caja del lector, dentro del propio parte', aviso.hayCaja === true);
paso('para leer ya solo se pide poder abrir la cámara, no que el navegador sepa descifrar',
  aviso.puede === true);
paso('y sigue estando el hueco para escribir el código a mano', aviso.campo === true);

const codigo = await T(() => {
  const g = window.__T;
  /* el código escrito a mano sigue funcionando, que es el camino de siempre */
  const art = (g.S.catalogo || []).find(x => x.codigo);
  if (!art) return null;
  const r1 = g.articuloDeEtiqueta(art.codigo);
  const soloNumero = String(art.codigo).replace(/\D/g, '').replace(/^0+/, '');
  const r2 = g.articuloDeEtiqueta(soloNumero);
  const r3 = g.articuloDeEtiqueta('esto no es un código');
  return { uno: !!r1.art, dos: !!r2.art, tres: !!r3.art, codigo: art.codigo, soloNumero };
});
if (codigo) {
  paso('el código escrito entero sigue valiendo', codigo.uno === true, codigo.codigo);
  paso('y escrito solo el número también', codigo.dos === true, codigo.soloNumero);
  paso('y lo que no es un código se rechaza', codigo.tres === false);
}

console.log('\n' + ok + ' bien, ' + mal + ' mal.');
if (errores.length) { console.log('Errores de JavaScript:'); errores.forEach(e => console.log('   ' + e)); }
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || errores.length ? 1 : 0);
