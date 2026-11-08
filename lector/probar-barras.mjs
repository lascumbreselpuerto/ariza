/* Examen del lector de códigos de barras.
   Las dos columnas que importan:
     · «ha leído OTRA COSA» tiene que ser 0 siempre. Es lo único inadmisible.
     · los casos cuyo dibujo NO confirma OpenCV se cuentan aparte, para no
       confundir un dibujo dudoso con un lector que no lee. */
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const mod = await import('./barras.gen.js');
const L = mod.ARIZA_BARRAS || mod.default.ARIZA_BARRAS;
function pgm(r){const b=fs.readFileSync(r);let i=0;const s=()=>{while(/\s/.test(String.fromCharCode(b[i])))i++;let o='';while(i<b.length&&!/\s/.test(String.fromCharCode(b[i])))o+=String.fromCharCode(b[i++]);return o;};s();const an=+s(),al=+s();s();i++;return{an,al,lum:b.subarray(i,i+an*al)};}
const casos = JSON.parse(fs.readFileSync(path.join(AQUI,'casos-barras','casos.json'),'utf8'));
const g = { conf:{bien:0,no:0,mal:0}, sinconf:{bien:0,no:0,mal:0}, nada:{bien:0,mal:0} };
const detalle = [], tiempos = [];
for (const c of casos) {
  const img = pgm(path.join(AQUI,'casos-barras',c.fichero));
  let r=null, t0=Date.now();
  try { r = L.leer(img.lum, img.an, img.al); } catch(e) { r = {texto:'ERROR '+e.message}; }
  const ms = Date.now()-t0;
  if (c.texto === null) {
    if (!r) g.nada.bien++; else { g.nada.mal++; detalle.push(['MIENTE', c.nota, r.texto]); }
    continue;
  }
  tiempos.push(ms);
  const caja = c.opencv ? g.conf : g.sinconf;
  if (r && r.texto === c.texto) caja.bien++;
  else if (!r) { caja.no++; detalle.push(['no lee', c.nota, '']); }
  else { caja.mal++; detalle.push(['MIENTE', c.nota, r.texto + ' en vez de ' + c.texto]); }
}
console.log(`\nDibujo CONFIRMADO por OpenCV:      ${g.conf.bien} bien · ${g.conf.no} no lee · ${g.conf.mal} OTRA COSA`);
console.log(`Dibujo sin confirmar (Code 128 y demás): ${g.sinconf.bien} bien · ${g.sinconf.no} no lee · ${g.sinconf.mal} OTRA COSA`);
console.log(`Imágenes sin código:               ${g.nada.bien} bien · ${g.nada.mal} ha leído algo`);
const miente = detalle.filter(d=>d[0]==='MIENTE');
if (miente.length) { console.log('\nGRAVE, ha leído otra cosa:'); miente.forEach(d=>console.log('   ', d[1], '→', d[2])); }
const nolee = detalle.filter(d=>d[0]==='no lee');
if (nolee.length) { console.log('\nno ha podido leer:'); nolee.forEach(d=>console.log('   ', d[1])); }
if (tiempos.length) { tiempos.sort((a,b)=>b-a); console.log('\nlo que tarda: el más lento', tiempos[0], 'ms, la mitad por debajo de', tiempos[Math.floor(tiempos.length/2)], 'ms'); }
process.exit(g.conf.mal + g.sinconf.mal + g.nada.mal ? 1 : 0);
