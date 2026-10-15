/* ================================================================
   manuales.mjs — que los manuales no mientan.

   Por qué existe: un manual escrito a mano envejece sin avisar. El
   15-10-2026 se perdió un rato porque el orden de los paneles que yo
   di de memoria no era el real. Un manual hace eso mismo, pero
   durante meses y con varias personas leyéndolo.

   Aquí no se comprueba la redacción, que es cosa de quien lo escribe.
   Se comprueban los DATOS QUE CARGAN PESO: los nombres de las
   pestañas, los de los botones, los de los apartados del parte y la
   versión que el manual dice describir. Si alguno cambia en la
   aplicación y no se cambia en el manual, esto se pone en rojo y
   obliga a corregirlo en la misma entrega.
   ================================================================ */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const AQUI = dirname(fileURLToPath(import.meta.url));
const URL_APP = process.env.ARIZA_URL || 'http://127.0.0.1:8899/index.html';
const RUTA = join(AQUI, '..', 'manuales', 'tecnico.md');

const ajustes = JSON.parse(readFileSync(join(AQUI,'ajustes.json'),'utf8'));
const ENV = { ...process.env, LANG:'es_ES.UTF-8', LANGUAGE:'es_ES:es', LC_ALL:'es_ES.UTF-8' };
const nav = await chromium.launch({ env: ENV, args:['--lang=es-ES'] });
const errores = [];
const ctx = await nav.newContext({ viewport:{width:1320,height:1800}, locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
const pag = await ctx.newPage();
pag.on('pageerror', e => errores.push('JS: '+e.message));
await pag.goto(URL_APP);
await pag.waitForTimeout(1700);

let ok = 0, mal = 0;
const paso = (t, bien, extra='') => { bien ? ok++ : mal++;
  console.log((bien?'  OK  ':' FALLA ')+t+(extra!==''&&extra!==undefined?' → '+String(extra):'')); };
const bloque = t => console.log('\n· '+t);
const T = (f, arg) => arg === undefined ? pag.evaluate(f) : pag.evaluate(f, arg);

bloque('0. El manual existe');
paso('el manual del técnico está en el repositorio', existsSync(RUTA), RUTA.replace(/^.*ariza-sat/, 'ariza-sat'));
if (!existsSync(RUTA)){
  console.log('\n'+ok+' bien, '+(mal+1)+' mal.');
  await nav.close(); process.exit(1);
}
const M = readFileSync(RUTA, 'utf8');
paso('y tiene contenido de verdad, no un esqueleto', M.length > 2000, M.length + ' caracteres');

/* ================================================================
   1. La versión que dice describir
   ================================================================ */
bloque('1. La versión');

const v = await T(() => window.__T.ARIZA_VERSION);
const enManual = (M.match(/\d{4}\.\d{2}\.\d{2}-\d+/g) || []);
paso('el manual dice qué versión describe', enManual.length > 0, enManual.join(', '));
paso('Y ES LA VERSIÓN ACTUAL DE LA APLICACIÓN: si no, el manual describe otra cosa',
  enManual.every(x => x === v), 'manual: '+[...new Set(enManual)].join(',')+' · app: '+v);

/* ================================================================
   2. Las pestañas que nombra
   ================================================================ */
bloque('2. Las pestañas');

const pestanas = await T(() => Array.from(document.querySelectorAll('#tabs button'))
  .map(b => b.textContent.trim()));
const nombradas = ['Mi trabajo', 'Equipo'];
nombradas.forEach(n => paso('el manual manda a «'+n+'», y esa pestaña existe',
  M.includes(n) && pestanas.includes(n), pestanas.join(' | ')));

/* ================================================================
   3. Los botones que nombra
   ================================================================ */
bloque('3. Los botones');

const botones = await T(() => {
  const g = window.__T, S = g.S;
  const p = S.puertas[0];
  const a = { id:'a1', tipo:'averia', estado:'asignado', puerta_id:p.id, cliente_id:p.cliente_id,
              tecnico_id:S.perfil.id, fecha_prevista:g.hoy(), creado:new Date().toISOString() };
  const d = document.createElement('div');
  d.innerHTML = g.tarjetaTrabajo(a);
  return Array.from(d.querySelectorAll('.trab-btns a, .trab-btns button')).map(x => x.textContent.trim());
});
['Cómo llegar', 'Ficha de la puerta', 'Detalles', 'Cerrar visita'].forEach(n =>
  paso('la tarjeta de trabajo tiene el botón «'+n+'» que dice el manual',
    botones.some(b => b.indexOf(n) >= 0) && M.includes(n), botones.join(' | ')));

/* ================================================================
   4. Los apartados del parte, y en el orden del manual
   ================================================================ */
bloque('4. Los apartados de «Cerrar visita»');

const apartados = await T(async () => {
  const g = window.__T, S = g.S;
  const p = S.puertas[0];
  await g.sb.from('avisos').insert({ id:'av-man', tipo:'averia', estado:'asignado',
    puerta_id:p.id, cliente_id:p.cliente_id, tecnico_id:S.perfil.id,
    creado:new Date().toISOString() });
  await g.cargar();
  g.dlgCierre('av-man');
  await new Promise(r => setTimeout(r, 900));
  const t = Array.from(document.querySelectorAll('#dlg-form .grupo > h3')).map(x => x.textContent.trim());
  const et = {};
  document.querySelectorAll('#dlg-form label[for^="z-"]').forEach(l => { et[l.getAttribute('for')] = l.textContent.trim(); });
  const txt = document.getElementById('dlg-form').innerText;
  g.cerrarDlg();
  return { titulos: t, etiquetas: et, texto: txt };
});
const esperados = ['Qué has encontrado y qué has hecho', 'Materiales',
  'Tiempo y desplazamiento', 'Cobro en obra', 'Cómo queda', 'Firma del cliente'];
esperados.forEach(n => paso('el apartado «'+n+'» existe y el manual lo nombra',
  apartados.titulos.some(t => t.indexOf(n) >= 0) && M.includes(n),
  apartados.titulos.join(' | ')));
/* El orden NO se escribe aquí a mano: se saca de la aplicación y se comprueba
   que el manual lo sigue. Escribirlo a mano fue el primer error de esta misma
   comprobación, que es exactamente el fallo que viene a cazar. */
paso('y el manual los pone en el MISMO ORDEN que la aplicación',
  (() => {
    const enApp = apartados.titulos.filter(t => M.indexOf(t) >= 0);
    const pos = enApp.map(t => M.indexOf(t));
    return pos.length >= 5 && pos.slice().sort((a,b)=>a-b).join(',') === pos.join(',');
  })(),
  apartados.titulos.filter(t => M.indexOf(t) >= 0).join(' → '));

/* ================================================================
   5. Los campos que nombra, con su etiqueta exacta
   ================================================================ */
bloque('5. Los campos del parte');

const campos = [['z-diag','Diagnóstico'], ['z-trab','Trabajo realizado'],
  ['z-ini','Hora de entrada'], ['z-fin','Hora de salida'],
  ['z-horas','Horas a facturar'], ['z-km','Desplazamiento (km)'],
  ['z-ntec','Técnicos'], ['z-estado','Estado de la puerta'],
  ['z-fnom','Nombre de quien firma']];
campos.forEach(([id, et]) => paso('«'+et+'» se llama así en la aplicación y en el manual',
  (apartados.etiquetas[id] || '').indexOf(et) >= 0 && M.includes(et),
  apartados.etiquetas[id] || '(no está)'));

['Queda algo pendiente', 'He cobrado en el momento', 'Esta visita no se cobra'].forEach(n =>
  paso('la casilla «'+n+'» existe y el manual la nombra',
    apartados.texto.indexOf(n) >= 0 && M.includes(n)));
paso('y el botón «Guardar sin cerrar», que es la salida de «me he quedado a medias»',
  /Guardar sin cerrar/.test(apartados.texto) && M.includes('Guardar sin cerrar'));

/* ================================================================
   6. Lo que el manual promete del guión
   ================================================================ */
bloque('6. Lo que promete del guión de revisión');

const guion = await T(() => {
  const g = window.__T;
  const p = g.S.puertas[0];
  p.tipo = 'Corredera autoportante';
  const d = document.createElement('div');
  d.innerHTML = g.bloqueGuion({ id:'a1' }, p);
  return { ayudas: d.querySelectorAll('details.g-ayuda').length,
           todoBien: /Todo bien en este bloque/.test(d.textContent),
           respuestas: Array.from(d.querySelectorAll('.g-resp button')).slice(0,3).map(x => x.textContent.trim()) };
});
paso('el manual promete «Cómo se comprueba» y ahí está',
  guion.ayudas > 0 && M.includes('Cómo se comprueba'), guion.ayudas + ' puntos');
paso('promete «Todo bien en este bloque» y ahí está',
  guion.todoBien && M.includes('Todo bien en este bloque'));
paso('y promete marcar Bien, Mal o N/A, que son las tres respuestas reales',
  guion.respuestas.join('/') === 'Bien/Mal/N/A' &&
  M.includes('**Bien**') && M.includes('**Mal**') && M.includes('**N/A**'),
  guion.respuestas.join('/'));

/* ================================================================
   7. Lo que el manual dice de los límites
   ================================================================ */
bloque('7. Lo que dice de los límites');

const lim = await T(() => {
  const g = window.__T;
  const L = Object.fromEntries(g.lineasAyuda({ t:'Fuerza dinámica máxima medida', m:'num' }, 'corredera'));
  const L2 = Object.fromEntries(g.lineasAyuda({ t:'Separación entre hoja y elementos fijos, o protección equivalente', m:'num' }, 'corredera'));
  return { corr: L['Límite'], secc: Object.fromEntries(
    g.lineasAyuda({ t:'Fuerza dinámica máxima medida', m:'num' }, 'seccional'))['Límite'],
    sinCargar: L2['Límite'] };
});
paso('el manual dice que el límite no es el mismo en corredera que en seccional, y es cierto',
  lim.corr !== lim.secc &&
  M.includes('no es el mismo en una corredera que en una seccional'),
  'corredera: '+lim.corr.slice(0,30));
paso('dice que un límite puede salir «no cargado», y la aplicación lo dice así',
  /no cargado/i.test(lim.sinCargar) && M.includes('no cargado'));
paso('y manda medir igual, que es lo que dice la aplicación',
  /mide y anota el valor igualmente/i.test(lim.sinCargar) &&
  /mide y anota igual/i.test(M));

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
