/* Prueba del descifrador de QR contra los códigos que generó OpenCV.
   Se ejecuta con: node probar.mjs
   Los casos están en casos/ y los generó generar.py; el texto de cada uno lo
   sabe OpenCV, no nosotros, así que si el descifrador acierta es que lee QR de
   verdad y no solo los que dibujamos nosotros. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const mod = await import('./qr.gen.js');
const leer = mod.leerQR || mod.default.leerQR;

function pgm(ruta) {
  const b = fs.readFileSync(ruta);
  /* cabecera P5: tres números y luego los bytes */
  let i = 0, campos = [];
  const siguiente = () => {
    while (i < b.length && /\s/.test(String.fromCharCode(b[i]))) i++;
    if (String.fromCharCode(b[i]) === '#') { while (b[i] !== 10) i++; return siguiente(); }
    let s = '';
    while (i < b.length && !/\s/.test(String.fromCharCode(b[i]))) s += String.fromCharCode(b[i++]);
    return s;
  };
  if (siguiente() !== 'P5') throw new Error('no es PGM binario: ' + ruta);
  const an = +siguiente(), al = +siguiente(), max = +siguiente();
  i++;
  return { an, al, max, lum: b.subarray(i, i + an * al) };
}

let ok = 0, mal = 0;
const fallos = [];
const casos = JSON.parse(fs.readFileSync(path.join(AQUI, 'casos', 'casos.json'), 'utf8'));
for (const c of casos) {
  const img = pgm(path.join(AQUI, 'casos', c.fichero));
  let leido = null, error = null;
  try { leido = leer(img.lum, img.an, img.al); } catch (e) { error = e.message; }
  if (leido === c.texto) { ok++; }
  else {
    mal++;
    fallos.push({ nombre: c.nombre, esperado: c.texto.slice(0, 40),
                  leido: leido === null ? '(nada)' : String(leido).slice(0, 40), error });
  }
}
console.log(`${ok} bien, ${mal} mal, de ${casos.length} códigos`);
for (const f of fallos.slice(0, 12))
  console.log(`  FALLA ${f.nombre}: esperaba «${f.esperado}» y ha leído «${f.leido}»` +
              (f.error ? ' [' + f.error + ']' : ''));
process.exit(mal ? 1 : 0);
