/* ===========================================================================
   ARIZA SAT · El lector contra cajas de verdad                   08-11-2026
   ---------------------------------------------------------------------------
   Hasta hoy el lector solo se había probado contra códigos que dibujaba yo
   mismo. Eso vale para saber que las tablas están bien, y no vale para saber
   si lee la caja que tiene David en la mano, con la luz de su comedor, el
   cartón arrugado y el código en diagonal.

   David mandó ocho fotos de cajas de Fullwat, ABM, Geba y Beninca. Esto pasa
   cada foto por el lector a seis tamaños distintos, que son los tamaños a los
   que la aplicación puede reducir el fotograma de la cámara.

   Lo que se busca saber, con números y no con suposiciones:
     · a qué tamaño empieza a leer, para fijar el del fotograma;
     · si alguna lectura sale MAL, que sería mucho peor que no leer.
   =========================================================================== */
import fs from 'fs';
import path from 'path';

const dir = process.argv[2] || 'cajas-gris';
const mod = await import('./barras.gen.js');
const B = mod.ARIZA_BARRAS || mod.default?.ARIZA_BARRAS;

function cargar(f) {
  const d = fs.readFileSync(f);
  const an = d.readUInt32BE(0), al = d.readUInt32BE(4);
  return { an, al, lum: new Uint8Array(d.buffer, d.byteOffset + 8, an * al) };
}

const ficheros = fs.readdirSync(dir).filter(f => f.endsWith('.gris')).sort();
const porFoto = {};
for (const f of ficheros) {
  const m = f.match(/^(.*)-(\d+)\.gris$/);
  const foto = m[1], tam = +m[2];
  const g = cargar(path.join(dir, f));
  const t0 = Date.now();
  let r = null, error = null;
  try { r = B.leer(g.lum, g.an, g.al); } catch (e) { error = e.message; }
  const ms = Date.now() - t0;
  (porFoto[foto] = porFoto[foto] || []).push({ tam, r, ms, error, an: g.an, al: g.al });
}

let leidas = 0, total = 0;
for (const foto of Object.keys(porFoto).sort()) {
  console.log('\n' + foto);
  total++;
  let alguna = false;
  for (const p of porFoto[foto]) {
    const txt = p.error ? 'ERROR ' + p.error
              : p.r ? p.r.texto + '  (' + p.r.tipo + ')'
              : '—';
    if (p.r) alguna = true;
    console.log('   %s px (%dx%d)  %s   %d ms',
      String(p.tam).padStart(4), p.an, p.al, txt.padEnd(26), p.ms);
  }
  if (alguna) leidas++;
}
console.log('\nLeídas %d de %d fotos.', leidas, total);
