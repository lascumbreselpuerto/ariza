/* ===========================================================================
   ARIZA SAT · El lector contra cajas de verdad                   08-11-2026
   ---------------------------------------------------------------------------
   DE DÓNDE SALE ESTO

   El 08-11-2026 David contó que el lector «abre la cámara pero no hace nada», y
   mandó ocho fotos de cajas de cuatro proveedores hechas con su iPhone, tal
   como las haría en el almacén. Pasadas por el lector de entonces: 0 de 8. El
   banco que había hasta ese día solo tenía códigos dibujados por nosotros
   mismos, y con esos iba perfecto. Esa es exactamente la diferencia entre un
   banco que sirve y uno que solo da tranquilidad.

   Estas cuatro imágenes son recortes de aquellas fotos, del tamaño con el que
   un técnico encuadra un código al acercar el móvil. No están limpias a
   propósito: llevan el cartón arrugado, el brillo del flexo, la madera de la
   mesa y el grano del iPhone.

   QUIÉN DICE CUÁL ES EL NÚMERO BUENO, QUE ES LO QUE IMPORTA
     · fullwat-ean13: lo leyó OpenCV, que es de fuera, en OTRA foto de la misma
       caja (IMG_2223). Dos fotos distintas, dos lectores distintos, el mismo
       número: 8422551306967.
     · geba-code39: lo pone impreso en la etiqueta, en «Art.Nr.: 505.LS6A.RP».
       Aquí OpenCV no sirve de juez porque no lee Code 39; de hecho sobre esa
       misma foto devolvió CUATRO números distintos, los cuatro falsos, uno por
       recorte. El nuestro dice 505.LS6A.RP o no dice nada.
     · beninca-code128 y beninca-torcida: 7301627, comprobado contando barras y
       módulos a mano sobre la foto: hay 25 barras y 90 módulos, que son los de
       7301627. Ojo, que la caja lleva impreso «967301627» debajo: las dos
       cifras de delante son de la referencia y no están en las barras.
     · beninca-sin-codigo: una caja SIN código de barras a la vista, con el
       dibujo de un circuito impreso que se le parece bastante. Aquí lo que se
       comprueba es que el lector NO se inventa nada, que es más importante que
       leer: un número inventado entra en el almacén y nadie lo pilla.
   =========================================================================== */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CAJAS = path.join(AQUI, 'cajas');

const CASOS = [
  { fichero: 'fullwat-ean13.jpg',      espera: '8422551306967', tipo: 'EAN-13',
    quien: 'OpenCV, sobre otra foto de la misma caja' },
  { fichero: 'geba-code39.jpg',        espera: '505.LS6A.RP',   tipo: 'Code 39',
    quien: 'lo impreso en la etiqueta, en Art.Nr.' },
  { fichero: 'beninca-code128.jpg',    espera: '7301627',       tipo: 'Code 128',
    quien: 'contadas las barras y los módulos a mano' },
  { fichero: 'beninca-torcida.jpg',    espera: '7301627',       tipo: 'Code 128',
    quien: 'la misma caja, con la etiqueta pegada torcida' },
  { fichero: 'beninca-sin-codigo.jpg', espera: null,            tipo: null,
    quien: 'no hay código: no se puede leer nada' },
];

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
await pagina.goto('http://127.0.0.1:8899/index.html');
await pagina.waitForFunction(() => window.ARIZA_BARRAS, null, { timeout: 30000 });

let bien = 0, mal = 0;
for (const c of CASOS) {
  const ruta = path.join(CAJAS, c.fichero);
  if (!fs.existsSync(ruta)) { console.log('   FALTA la imagen ' + c.fichero); mal++; continue; }
  const datos = 'data:image/jpeg;base64,' + fs.readFileSync(ruta).toString('base64');

  /* Se descifra dentro del navegador, con el mismo código que va en el móvil y
     pasando por el mismo canvas, para que lo que se prueba sea lo que corre. */
  const salida = await pagina.evaluate(async ({ datos }) => {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = datos; });
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const lum = new Uint8Array(cv.width * cv.height);
    for (let i = 0, j = 0; i < lum.length; i++, j += 4)
      lum[i] = (d[j] * 77 + d[j+1] * 151 + d[j+2] * 28) >> 8;
    const t0 = performance.now();
    const rapido = window.ARIZA_BARRAS.leer(lum, cv.width, cv.height, false);
    const t1 = performance.now();
    const fondo = window.ARIZA_BARRAS.leer(lum, cv.width, cv.height, true);
    const t2 = performance.now();
    return { rapido, fondo, msRapido: Math.round(t1 - t0), msFondo: Math.round(t2 - t1) };
  }, { datos });

  const r = salida.fondo || salida.rapido;
  if (c.espera === null) {
    /* Lo que no se puede permitir es que se invente un número. */
    if (r) {
      console.log('   SE HA INVENTADO UN CÓDIGO en %s: «%s» (%s). %s',
        c.fichero, r.texto, r.tipo, c.quien);
      mal++;
    } else {
      console.log('   %s  no lee nada, que es lo correcto: %s', c.fichero.padEnd(24), c.quien);
      bien++;
    }
    continue;
  }
  if (!r) {
    console.log('   NO LEE %s, y debería leer «%s» (%s). Juez: %s',
      c.fichero, c.espera, c.tipo, c.quien);
    mal++;
  } else if (r.texto !== c.espera) {
    console.log('   LEE MAL %s: dice «%s» y es «%s». Juez: %s',
      c.fichero, r.texto, c.espera, c.quien);
    mal++;
  } else if (r.tipo !== c.tipo) {
    console.log('   %s dice el tipo equivocado: «%s» y es «%s»', c.fichero, r.tipo, c.tipo);
    mal++;
  } else {
    console.log('   %s  %s  [%s]  %s ms en el bucle, %s ms a fondo',
      c.fichero.padEnd(24), c.espera.padEnd(14), c.tipo,
      String(salida.msRapido).padStart(4), String(salida.msFondo).padStart(4));
    bien++;
  }
}

await navegador.close();
console.log('%d bien, %d mal.', bien, mal);
process.exit(mal ? 1 : 0);
