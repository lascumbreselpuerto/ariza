/* Prueba dura: los QR como llegan de una cámara de móvil en una nave.
   Lo que no se puede fallar NUNCA es la última columna: leer otra cosa. */
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const mod = await import('./qr.gen.js');
const leer = mod.leerQR || mod.default.leerQR;
function pgm(r){const b=fs.readFileSync(r);let i=0;const s=()=>{while(/\s/.test(String.fromCharCode(b[i])))i++;let o='';while(i<b.length&&!/\s/.test(String.fromCharCode(b[i])))o+=String.fromCharCode(b[i++]);return o;};s();const an=+s(),al=+s();s();i++;return{an,al,lum:b.subarray(i,i+an*al)};}
const casos = JSON.parse(fs.readFileSync(path.join(AQUI,'casos-duro','casos.json'),'utf8'));
let bien=0, nolee=0, miente=0;
const detalle = [];
for (const c of casos) {
  const img = pgm(path.join(AQUI,'casos-duro',c.fichero));
  let t=null, err=null, ms=Date.now();
  try { t = leer(img.lum, img.an, img.al); } catch(e){ err=e.message; }
  ms = Date.now()-ms;
  if (c.texto === null) {
    if (t === null) bien++; else { miente++; detalle.push(['MIENTE', c.nombre, c.trato, String(t).slice(0,30)]); }
  } else if (t === c.texto) { bien++; detalle.push(['ok', c.nombre, c.trato, ms+' ms']); }
  else if (t === null) { nolee++; detalle.push(['no lee', c.nombre, c.trato, err||'']); }
  else { miente++; detalle.push(['MIENTE', c.nombre, c.trato, String(t).slice(0,30)]); }
}
console.log(`\n${bien} bien · ${nolee} no ha podido leer · ${miente} ha leído OTRA COSA`);
console.log('\nlos que no ha podido leer:');
detalle.filter(d=>d[0]==='no lee').forEach(d=>console.log('   ', d[2]));
if (miente) { console.log('\nGRAVE, ha leído otra cosa:'); detalle.filter(d=>d[0]==='MIENTE').forEach(d=>console.log('   ', d[1], d[2], '->', d[3])); }
const lentos = detalle.filter(d=>d[0]==='ok').map(d=>parseInt(d[3])).sort((a,b)=>b-a);
console.log('\nlo que tarda: el más lento', lentos[0], 'ms, la mitad por debajo de', lentos[Math.floor(lentos.length/2)], 'ms');
process.exit(miente ? 1 : 0);
