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
const RUTA_FORM = join(AQUI, '..', 'manuales', 'formacion.md');

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
const nombradas = ['Mi trabajo', 'Manual'];
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

/* ================================================================
   8. El manual, dentro de la aplicación.

   David, 15-10-2026: «¿dónde lo puede ver el técnico, en la misma
   aplicación o en un archivo aparte?». Dentro: el técnico lleva la
   aplicación en el bolsillo, se lee sin cobertura, y sobre todo el
   manual que ve es el de la versión que tiene instalada.

   Lo que más vigila este bloque: que NO haya dos copias del manual.
   La pantalla lee el mismo fichero del repositorio que comprueban los
   bloques de arriba. Si alguien copiara el texto dentro de la
   aplicación, las dos copias se separarían y una mentiría.
   ================================================================ */
bloque('8. El manual dentro de la aplicación');

const dentro = await T(async () => {
  const g = window.__T;
  g.S.tab = 'manual'; g.S.exp = null; g.S.ficha = null; g.S.fichaCliente = null;
  g.pintar();
  await new Promise(r => setTimeout(r, 1200));
  const v = document.getElementById('vista');
  return { texto: v.innerText, html: v.innerHTML,
           pestana: !!document.querySelector('#tabs button[data-tab="manual"]'),
           oculta: (document.querySelector('#tabs button[data-tab="manual"]')||{}).hidden,
           tablas: v.querySelectorAll('table').length,
           titulos: v.querySelectorAll('.manual h3').length,
           titulo: v.querySelectorAll('.manual h2').length };
});
paso('hay una pestaña «Manual»', dentro.pestana);
paso('Y LA VE EL TÉCNICO: no está escondida como Equipo o Gestión',
  dentro.oculta === false, 'oculta: '+dentro.oculta);
paso('el manual se abre dentro de la aplicación',
  /Manual del técnico/.test(dentro.texto));
paso('con su contenido, no un enlace a otro sitio',
  /Cerrar visita/.test(dentro.texto) && dentro.titulos >= 5,
  dentro.titulos + ' apartados y ' + dentro.titulo + ' título');
paso('las tablas del manual se ven como tablas', dentro.tablas >= 2, dentro.tablas);

/* Una sola copia: lo que se ve en pantalla sale del fichero del repositorio */
const frases = ['Llamar al sitio', 'Guardar sin cerrar', 'Cómo se comprueba'];
frases.forEach(f => paso('«'+f+'» está en el fichero y se ve en la pantalla: una sola copia',
  M.includes(f) && dentro.texto.indexOf(f) >= 0));
paso('y el texto del manual NO está copiado dentro del index.html',
  await T(() => !document.documentElement.innerHTML.includes('Lo que haces el 90')
                || document.getElementById('vista').innerHTML.includes('Lo que haces el 90')),
  'si estuviera copiado, habría dos manuales que se separarían');

/* La versión, arriba, que es lo que faltaba el día que se perdieron dos ratos */
const vApp = await T(() => window.__T.ARIZA_VERSION);
paso('la pantalla enseña la versión que tienes cargada',
  dentro.texto.indexOf(vApp) >= 0, vApp);
paso('y el manual describe ESA versión, sin avisos de descuadre',
  !/Este manual describe la versión/.test(dentro.texto),
  (dentro.texto.match(/Este manual describe[^.]*/)||[''])[0] || 'cuadran');

const descuadre = await T(async () => {
  const g = window.__T;
  const real = g.S.manuales.tecnico;
  g.S.manuales.tecnico = real.replace(/\d{4}\.\d{2}\.\d{2}-\d+/g, '2019.01.01-1');
  g.pintar();
  await new Promise(r => setTimeout(r, 500));
  const t = document.getElementById('vista').innerText;
  g.S.manuales.tecnico = real; g.pintar();
  return t;
});
paso('SI EL MANUAL DESCRIBE OTRA VERSIÓN, la pantalla lo dice en vez de callarlo',
  /Este manual describe la versión/.test(descuadre) && /2019\.01\.01-1/.test(descuadre));
paso('y dice qué hacer: avisar a la oficina', /Avisa a la oficina/.test(descuadre));

/* Sin cobertura y sin haberlo abierto nunca: se dice, no se queda en blanco */
const sinRed = await T(async () => {
  const g = window.__T;
  const guardado = g.S.manuales;
  g.S.manuales = {};
  const real = window.fetch;
  window.fetch = async (u, o) => {
    if (String(u).indexOf('manuales/') >= 0) throw new Error('sin red, provocado por la prueba');
    return real(u, o);
  };
  await g.cargarManual('tecnico');
  window.fetch = real;
  await new Promise(r => setTimeout(r, 400));
  const t = document.getElementById('vista').innerText;
  g.S.manuales = guardado; g.pintar();
  return t;
});
paso('sin cobertura y sin haberlo abierto nunca, lo dice',
  /No se ha podido abrir el manual/.test(sinRed));
paso('y explica que abriéndolo una vez con conexión se queda guardado',
  /se queda guardado/.test(sinRed));

/* El manual ya no manda a una pestaña que el técnico no tiene */
paso('EL MANUAL NO MANDA A «EQUIPO», que el técnico no ve',
  !/\bEquipo\b/.test(M), (M.match(/.{0,40}Equipo.{0,40}/)||[''])[0] || 'no lo nombra');

/* ================================================================
   9. El manual de formación.

   Es el hermano largo del del técnico: enseña el oficio, no solo la
   aplicación. Por eso lleva dentro NÚMEROS NORMATIVOS, y ahí está el
   peligro: un manual de formación con un límite equivocado enseña mal
   a quien todavía no sabe distinguirlo.

   Lo que más vigila este bloque: que los límites del manual sean
   EXACTAMENTE los que la aplicación tiene cargados de la norma. Si
   alguien cambia uno de los dos, esto se pone en rojo.
   ================================================================ */
bloque('9. El manual de formación');

paso('el manual de formación está en el repositorio', existsSync(RUTA_FORM));
const F = existsSync(RUTA_FORM) ? readFileSync(RUTA_FORM, 'utf8') : '';
paso('y tiene cuerpo de material formativo, no un resumen',
  F.length > 8000, F.length + ' caracteres');
paso('dice qué versión describe, y es la actual',
  (F.match(/\d{4}\.\d{2}\.\d{2}-\d+/g) || []).every(x => x === v) &&
  F.indexOf(v) >= 0, [...new Set(F.match(/\d{4}\.\d{2}\.\d{2}-\d+/g) || [])].join(','));

const norma = await T(() => {
  const g = window.__T, Fz = g.FUERZA_12453;
  return { td: Fz.td_s, trasTd: Fz.tras_td_n, residual: Fz.residual_n, tt: Fz.tt_s,
           sup: Fz.superficie.n,
           horizontal: Fz.dinamica.horizontal.map(x => x.n),
           vertical: Fz.dinamica.vertical.map(x => x.n),
           paralelo: Fz.dinamica.paralelo.map(x => x.n),
           manual: g.FUERZA_MANUAL.casos.map(c => [c.normal_n, c.emergencia_n]),
           puntos: g.PUNTOS_12453 };
});
/* Los límites, uno a uno, contra lo que tiene cargado la aplicación */
paso('Td del manual = Td de la aplicación',
  F.includes(String(norma.td).replace('.', ',') + ' s'), norma.td);
paso('la fuerza tras Td coincide', F.includes(norma.trasTd + ' N'), norma.trasTd);
paso('la fuerza residual coincide', F.includes(norma.residual + ' N'), norma.residual);
paso('el tiempo total Tt coincide', F.includes(norma.tt + ' s'), norma.tt);
paso('los 400 N y los 1.400 N son los de la aplicación',
  norma.horizontal.join(',') === '400,1400' &&
  F.includes('400 N') && F.includes('1.400 N'), norma.horizontal.join(','));
paso('Y EL MANUAL ENSEÑA QUE EN VERTICAL SON 400 N EN TODO EL RECORRIDO',
  norma.vertical.join(',') === '400' &&
  /\*\*Vertical[^|]*\*\*[^|]*\|[^|]*400 N[^|]*\|[^|]*400 N/.test(F),
  'aplicación: ' + norma.vertical.join(','));
paso('y lo marca como el error que hay que grabarse',
  /movimiento vertical lleva 400 N en todo el recorrido/.test(F));
/* Ojo: toLocaleString en Node no da el punto de los miles, así que se compara
   contra el número tal como se escribe en español, que es lo que lleva el manual. */
const conMiles = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
paso('la superficie plana grande, con su límite',
  F.includes('0,1 m²') && F.includes(conMiles(norma.sup) + ' N'),
  conMiles(norma.sup) + ' N');

/* Las fuerzas de maniobra manual */
norma.manual.forEach(([n, e]) => {
  paso('la maniobra manual de '+n+' N y '+e+' N está en el manual',
    F.includes(n + ' N') && F.includes(e + ' N'));
});

/* Los puntos de medida: lo que enseña tiene que ser lo que la aplicación aplica */
/* El manual los escribe en una tabla, más apretados («300 mm bajo el borde
   superior» en vez de «...de la hoja»). Lo que tiene que coincidir es la MEDIDA
   y la referencia, no la frase entera: se compara normalizando. */
const norm = x => x.toLowerCase().replace(/ de la hoja/g, '')
  .replace(/[^a-z0-9áéíóúñ ]/g, '').replace(/\s+/g, ' ').trim();
const Fn = norm(F);
const faltan = norma.puntos.corredera.puntos.filter(p => Fn.indexOf(norm(p)) < 0);
paso('los puntos de la corredera coinciden con los de la aplicación',
  faltan.length === 0, faltan.join(' | ') || 'los tres');
const faltanV = norma.puntos.vertical.puntos.filter(p => Fn.indexOf(norm(p)) < 0);
paso('y los de una puerta de movimiento vertical también',
  faltanV.length === 0, faltanV.join(' | ') || 'los tres');
paso('el caso de más de 2.800 mm está enseñado',
  F.includes('2.800 mm') && F.includes('2.500 mm sobre el suelo'));
paso('y las tres lecturas por punto',
  norma.puntos.corredera.lecturas === 3 && /tres lecturas por punto/i.test(F));

/* La parte honrada: lo que NO está cargado tiene que decirse también aquí */
const sinCargar = await T(() => window.__T.LIM_OBRA_CAMPOS.map(x => x[1]));
paso('el manual dedica un apartado a lo que todavía no está cargado',
  /no está cargado|no tiene cargados/i.test(F));
paso('nombrando los valores que faltan, no en abstracto',
  sinCargar.filter(n => F.indexOf(n.split(' (')[0].slice(0, 28)) >= 0).length >= 3,
  sinCargar.join(' | '));
paso('y diciendo que se mida igualmente',
  /[Mm]ide y anota igualmente/.test(F));
paso('la matriz de protección sigue dicha como no contrastada',
  /sin contrastar con el texto de la norma/.test(F));

/* Que no enseñe la 12453 donde no toca */
paso('enseña que a las peatonales NO se les aplica la matriz de la 12453',
  /no se les aplica/.test(F) && /16005/.test(F));

/* Y que esté dentro de la aplicación, como el otro */
const dosManuales = await T(async () => {
  const g = window.__T;
  g.S.tab = 'manual'; g.S.manual = 'formacion'; g.pintar();
  await new Promise(r => setTimeout(r, 1400));
  const v2 = document.getElementById('vista');
  const r = { n: g.MANUALES.length, texto: v2.innerText,
              botones: Array.from(v2.querySelectorAll('[data-act="manual-ver"]')).map(x=>x.textContent.trim()) };
  g.S.manual = null; g.pintar();
  return r;
});
paso('hay dos manuales en la aplicación', dosManuales.n === 2, dosManuales.n);
paso('con botones para pasar de uno a otro',
  dosManuales.botones.length === 2, dosManuales.botones.join(' | '));
paso('y el de formación se abre y se lee',
  /Una puerta automática es una máquina/.test(dosManuales.texto));
paso('con sus tablas de límites dentro',
  /1\.400 N/.test(dosManuales.texto) && /Td/.test(dosManuales.texto));

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
