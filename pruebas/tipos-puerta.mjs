/* ================================================================
   tipos-puerta.mjs — tipos de puerta nuevos, cantidades y fijos
   de la comercial.                                    06-11-2026

   SE LLAMA ASÍ Y NO «tipos.mjs» POR ALGO
   tipos.mjs ya existía: es la suite de «qué forma tiene la puerta»,
   99 comprobaciones sobre el reconocimiento del tipo, los peligros,
   los componentes mínimos y la familia. El 06-11-2026 este fichero
   se escribió con ese nombre y la machacó. Se recuperó del
   repositorio y se comprobó que volvía byte a byte (la misma huella
   de git), pero el aviso queda escrito aquí: antes de crear una
   suite, mirar si el nombre está cogido.

   POR QUÉ EXISTE
   David, revisando la creación de asistencias en campo:

     · «COMERCIAL: incluiría tipos de puertas como enrollable de
       garaje, peatonal manual, peatonal de chalet, batiente
       automática de 1 y de 2 hojas, peatonal automática
       telescópica.»
     · «E incluso un punto por si las puertas, sobre todo las
       peatonales, tienen que llevar fijos, tanto practicables (como
       si fuera una hoja) o fijos.»
     · «Además esto lo haría tipo desplegable para que no nos haga
       muy intensa la vista general del parte.»
     · «Además el poder elegir más de una unidad por tipo de puerta.»

   LA PARTE DELICADA, Y POR QUÉ ESTA SUITE EXISTE
   En esta aplicación el tipo de puerta no es una etiqueta: decide el
   guión de revisión, los peligros propios, los puntos de medida de
   fuerzas y el límite que se les aplica. La familia se reconoce por
   el NOMBRE del tipo, con expresiones regulares.

   Y ahí había una trampa: «peatonal manual» y «peatonal de chalet»
   llevan la palabra peatonal, pero no llevan automatismo. Si cayeran
   en la familia de las peatonales automáticas se les aplicaría el
   guión de los sensores y el régimen de la UNE-EN 16005, que es para
   puertas MOTORIZADAS: el técnico comprobaría lo que no existe y el
   papel diría que se revisó. David decidió el 06-11-2026 que van a
   la familia batiente, que es lo que son mecánicamente.

   Si alguien añade un tipo nuevo y esta suite se pone roja, no es un
   capricho: es que ese tipo se ha quedado sin su guión o ha cogido
   el de otra puerta.
   ================================================================ */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const AQUI = dirname(fileURLToPath(import.meta.url));
const URL_APP = process.env.ARIZA_URL || 'http://127.0.0.1:8899/index.html';

const ajustes = JSON.parse(readFileSync(join(AQUI,'ajustes.json'),'utf8'));
const ENV = { ...process.env, LANG:'es_ES.UTF-8', LANGUAGE:'es_ES:es', LC_ALL:'es_ES.UTF-8' };
const nav = await chromium.launch({ env: ENV, args:['--lang=es-ES'] });
const errores = [];
const ctx = await nav.newContext({ viewport:{width:1320,height:2400},
  locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    const cli = db.puertas[0].cliente_id;
    /* Una comercial con tres seccionales y una peatonal: cuatro huecos */
    db.avisos.push({ id:'tp-com', tipo:'comercial', estado:'asignado', prioridad:'normal',
      tecnico_id:'usuario-admin', cliente_id:cli, ruta:'ruta2',
      tipos_puerta:['Seccional','Peatonal automática telescópica'],
      tipos_uds:[{ tipo:'Seccional', uds:3 }, { tipo:'Peatonal automática telescópica', uds:1 }],
      descripcion:'Tres portones y la entrada', creado:new Date().toISOString() });
    /* Y una comercial de las de antes: tipos sin unidades */
    db.avisos.push({ id:'tp-vieja', tipo:'comercial', estado:'asignado', prioridad:'normal',
      tecnico_id:'usuario-admin', cliente_id:cli, ruta:'ruta2',
      tipos_puerta:['Seccional','Batiente'],
      descripcion:'De antes de las unidades', creado:new Date().toISOString() });
  };
});
const pag = await ctx.newPage();
pag.on('pageerror', e => errores.push('JS: '+e.message));
pag.on('console', m => { if (m.type() === 'error') errores.push('consola: '+m.text()); });
await pag.goto(URL_APP);
await pag.waitForTimeout(1700);

let ok = 0, mal = 0;
const paso = (t, bien, extra='') => { bien ? ok++ : mal++;
  console.log((bien?'  OK  ':' FALLA ')+t+(extra!==''&&extra!==undefined?' → '+String(extra):'')); };
const bloque = t => console.log('\n· '+t);
const T = (f, arg) => arg === undefined ? pag.evaluate(f) : pag.evaluate(f, arg);

const montado = await T(() => ({ lista: Array.isArray(window.__T_FALTAN),
  faltan: Array.isArray(window.__T_FALTAN) ? window.__T_FALTAN : ['(no existe)'],
  cuantas: window.__T ? Object.keys(window.__T).length : 0 }));
paso('el banco está montado', montado.lista === true && montado.cuantas > 200, montado.cuantas);
paso('y ve todas las funciones nuevas', montado.faltan.length === 0, montado.faltan.join(' · '));

/* ================================================================
   1. Los tipos nuevos están, y en su familia
   ================================================================ */
bloque('1. Los nueve tipos nuevos');

const NUEVOS = [
  ['Enrollable de garaje',             'enrollable'],
  ['Batiente automática de una hoja',  'batiente'],
  ['Batiente automática de dos hojas', 'batiente'],
  ['Peatonal automática telescópica',  'peatonal'],
  ['Peatonal manual',                  'batiente'],
  ['Peatonal de chalet',               'batiente'],
];
const clasif = await T(ns => {
  const g = window.__T;
  const out = {};
  ns.forEach(n => { out[n] = { esta: g.TIPOS.includes(n), forma: g.formaDePuerta(n) }; });
  /* Y los de siempre, que no se pueden haber movido de sitio */
  ['Seccional','Corredera autoportante','Peatonal automática corredera','Barrera','Batiente']
    .forEach(n => { out[n] = { esta: g.TIPOS.includes(n), forma: g.formaDePuerta(n) }; });
  return out;
}, NUEVOS.map(x => x[0]));
NUEVOS.forEach(([n, f]) => {
  paso('«'+n+'» está en la lista de tipos', clasif[n].esta === true);
  paso('   y se clasifica como '+f, clasif[n].forma === f, clasif[n].forma);
});
/* LA QUE IMPORTA: los tipos de siempre no se han movido. Si una regla nueva se
   pusiera delante y se tragara a otra puerta, esa puerta cambiaría de guión sin
   que nadie lo hubiera decidido. */
paso('la seccional sigue siendo seccional', clasif['Seccional'].forma === 'seccional');
paso('la corredera autoportante sigue siendo corredera',
  clasif['Corredera autoportante'].forma === 'corredera');
paso('y la peatonal automática corredera sigue siendo peatonal automática',
  clasif['Peatonal automática corredera'].forma === 'peatonal');
paso('la barrera, barrera', clasif['Barrera'].forma === 'barrera');
paso('y la batiente, batiente', clasif['Batiente'].forma === 'batiente');

/* El efecto de la clasificación: qué guión recibe cada una */
const guiones = await T(() => {
  const g = window.__T;
  const de = t => {
    const gu = g.guionDe(t) || [];
    const cab = gu.filter(x => x && x.h).map(x => x.h);
    const textos = gu.filter(x => x && x.t).map(x => x.t).join(' | ');
    return { bloques: cab, sensores: /Sensores de apertura|Sensores de presencia/.test(textos),
             bisagras: /Bisagras/.test(textos), n: gu.filter(x => x && x.t).length };
  };
  return { manual: de('Peatonal manual'), chalet: de('Peatonal de chalet'),
           auto: de('Peatonal automática telescópica'), gar: de('Enrollable de garaje') };
});
/* Esto es lo que se venía a evitar: que una puerta sin automatismo reciba los
   puntos de los sensores de una puerta motorizada. */
paso('la peatonal manual NO recibe los puntos de sensores de una motorizada',
  guiones.manual.sensores === false);
paso('la peatonal de chalet tampoco', guiones.chalet.sensores === false);
paso('y las dos reciben el guión de la batiente, con sus bisagras',
  guiones.manual.bisagras === true && guiones.chalet.bisagras === true);
paso('la peatonal automática telescópica SÍ recibe los de sensores, que los tiene',
  guiones.auto.sensores === true);
paso('el enrollable de garaje recibe un guión con puntos', guiones.gar.n > 10, guiones.gar.n);

/* ================================================================
   2. El desplegable de tipos, con su resumen
   ================================================================ */
bloque('2. Plegado, y diciendo lo que lleva marcado');

const plegado = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null, null, g.S.clientes[0].id);
  await new Promise(r => setTimeout(r, 1100));
  const tipo = document.getElementById('a-tipo');
  tipo.value = 'comercial'; tipo.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 400));
  const caja = document.getElementById('a-caja-tp');
  return { esDetalle: caja ? caja.tagName.toLowerCase() : '(no está)',
    visible: !!(caja && !caja.hidden),
    resumenVacio: (document.getElementById('a-tp-cuenta') || {}).textContent || '',
    filas: document.querySelectorAll('#a-tp .tp-fila').length,
    cantidades: document.querySelectorAll('#a-tp .a-tp-u').length };
});
paso('la lista de tipos es un desplegable, no veinte casillas sueltas',
  plegado.esDetalle === 'details', plegado.esDetalle);
paso('y sale en una comercial', plegado.visible === true);
paso('plegado dice que no hay nada marcado', /sin marcar/.test(plegado.resumenVacio),
  plegado.resumenVacio);
paso('cada tipo tiene su fila y su cantidad',
  plegado.filas > 15 && plegado.cantidades === plegado.filas,
  plegado.filas+' filas · '+plegado.cantidades+' cantidades');

const marcando = await T(async () => {
  const g = window.__T;
  const marca = (valor, uds) => {
    const f = [...document.querySelectorAll('#a-tp .tp-fila')]
      .find(x => x.querySelector('.a-tp-c').value === valor);
    f.querySelector('.a-tp-c').checked = true;
    f.querySelector('.a-tp-c').dispatchEvent(new Event('change', { bubbles:true }));
    if (uds != null){
      const u = f.querySelector('.a-tp-u');
      u.value = String(uds);
      u.dispatchEvent(new Event('input', { bubbles:true }));
    }
  };
  marca('Seccional', 3);
  marca('Peatonal manual', null);
  await new Promise(r => setTimeout(r, 300));
  return { resumen: (document.getElementById('a-tp-cuenta') || {}).textContent || '',
           leidos: g.tiposMarcados() };
});
paso('el resumen dice cuántas puertas en total y cuáles',
  /4 puertas/.test(marcando.resumen) && /Seccional ×3/.test(marcando.resumen) &&
  /Peatonal manual/.test(marcando.resumen), marcando.resumen);
paso('y se leen con su cantidad: tres seccionales y una peatonal manual',
  marcando.leidos.length === 2 &&
  marcando.leidos.find(x => x.tipo === 'Seccional').uds === 3 &&
  marcando.leidos.find(x => x.tipo === 'Peatonal manual').uds === 1,
  JSON.stringify(marcando.leidos));

const guardado = await T(async () => {
  const g = window.__T;
  document.getElementById('a-desc').value = 'Oferta de tres portones y una peatonal';
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 2000));
  const nuevo = (g.S.avisos || []).filter(x => x.tipo === 'comercial' && /tres portones/.test(x.descripcion||''))[0];
  return { hay: !!nuevo, tipos: (nuevo && nuevo.tipos_puerta) || [],
           uds: (nuevo && nuevo.tipos_uds) || null };
});
paso('al guardar quedan los tipos marcados', guardado.tipos.length === 2, guardado.tipos.join(' · '));
/* Y las unidades aparte, sin cambiarle el sentido a la lista de tipos, que lee
   media aplicación. */
paso('y las unidades en su propia columna',
  Array.isArray(guardado.uds) && guardado.uds.find(x => x.tipo === 'Seccional').uds === 3,
  JSON.stringify(guardado.uds));

/* ================================================================
   3. Las unidades se convierten en huecos que medir
   ================================================================ */
bloque('3. Un hueco por puerta ofertada');

const huecos = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  g.dlgCierre('tp-com');
  await new Promise(r => setTimeout(r, 1500));
  const tipos = [...document.querySelectorAll('#dlg-form .medida')]
    .map(x => x.querySelector('.m-tipo').value);
  return { n: tipos.length, tipos };
});
/* Tres seccionales y una peatonal son CUATRO huecos, no dos. Antes salía uno por
   tipo y el técnico tenía que añadir los que faltaban a mano. */
paso('tres seccionales y una peatonal dan cuatro huecos que medir',
  huecos.n === 4, huecos.n);
paso('con su tipo ya puesto en cada uno',
  huecos.tipos.filter(x => x === 'Seccional').length === 3 &&
  huecos.tipos.filter(x => /telescópica/.test(x)).length === 1,
  huecos.tipos.join(' · '));

const vieja = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  g.dlgCierre('tp-vieja');
  await new Promise(r => setTimeout(r, 1500));
  const tipos = [...document.querySelectorAll('#dlg-form .medida')]
    .map(x => x.querySelector('.m-tipo').value);
  return { n: tipos.length, tipos };
});
/* LA QUE IMPORTA: una comercial de antes del 06-11-2026 no tiene unidades. Sin
   unidades es UNA de cada tipo, que es lo que significaba. Si se leyera como
   cero, el parte no pediría medir nada. */
paso('una comercial de antes, sin unidades, da una por tipo',
  vieja.n === 2, vieja.n+' huecos: '+vieja.tipos.join(' · '));

const tope = await T(() => {
  const g = window.__T;
  /* Un error de dedo en las unidades no puede pintar cien bloques y dejar el
     parte inservible: lo que pase de veinte se añade a mano. */
  return { n: g.huecosPrevistos({ tipos_puerta:['Seccional'],
            tipos_uds:[{ tipo:'Seccional', uds:50 }] }).length };
});
paso('cincuenta unidades no pintan cincuenta bloques: se corta en veinte',
  tope.n === 20, tope.n);

/* ================================================================
   4. Los fijos del hueco
   ================================================================ */
bloque('4. Los fijos, que es lo que más se olvida ofertar');

const fijos = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  g.dlgCierre('tp-com');
  await new Promise(r => setTimeout(r, 1500));
  const b = document.querySelector('#dlg-form .medida');
  const sel = b.querySelector('.m-fijos');
  const opciones = sel ? [...sel.querySelectorAll('option')].map(o => o.value).filter(Boolean) : [];
  const texto = document.getElementById('dlg-form').innerText;
  /* Se rellena el primer hueco con un fijo practicable */
  b.querySelector('.m-ubi').value = 'Entrada de oficinas';
  b.querySelector('.m-ancho').value = '1600';
  b.querySelector('.m-alto').value = '2200';
  sel.value = 'practicable';
  b.querySelector('.m-fijosmm').value = '900';
  const leida = g.leerMedida(b);
  return { hay: !!sel, opciones, texto, leida };
});
paso('cada hueco pregunta por los fijos', fijos.hay === true);
paso('con las cinco opciones: ninguno, ciego, practicable, superior y varios',
  fijos.opciones.join(',') === 'ninguno,ciego,practicable,superior,varios',
  fijos.opciones.join(' · '));
paso('se explica que un fijo practicable es una hoja más',
  /como una hoja más/i.test(fijos.texto));
paso('y que si no se oferta, lo paga la empresa',
  /lo paga la empresa/i.test(fijos.texto));
paso('se leen el tipo de fijo y su ancho',
  fijos.leida.fijos === 'practicable' && fijos.leida.fijos_mm === 900,
  fijos.leida.fijos+' · '+fijos.leida.fijos_mm);

const fijosGuardados = await T(async () => {
  const g = window.__T;
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'tp-com'), false);
  await new Promise(r => setTimeout(r, 1400));
  const { data } = await g.sb.from('medidas').select('*').eq('aviso_id','tp-com');
  const m = (data || []).find(x => x.ubicacion === 'Entrada de oficinas');
  /* Y lo que de verdad importa de los fijos: que lleguen al presupuesto */
  const det = m ? g.detalleMedida(m) : '';
  return { fijos: m && m.fijos, mm: m && m.fijos_mm, det };
});
paso('los fijos se guardan con el hueco',
  fijosGuardados.fijos === 'practicable' && Number(fijosGuardados.mm) === 900,
  fijosGuardados.fijos+' · '+fijosGuardados.mm);
paso('y pasan al detalle que va al presupuesto, con su medida',
  /Fijos: Fijo practicable/.test(fijosGuardados.det) && /900 mm/.test(fijosGuardados.det),
  (fijosGuardados.det.match(/Fijos[^\n]*/) || [''])[0]);

/* ================================================================
   5. Las puertas de la preventiva, también plegadas
   ================================================================ */
bloque('5. Y la lista de puertas de la revisión');

const pts = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  g.dlgAviso(null, null, g.S.clientes[0].id);
  await new Promise(r => setTimeout(r, 1100));
  const tipo = document.getElementById('a-tipo');
  tipo.value = 'mantenimiento'; tipo.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 600));
  const caja = document.getElementById('a-caja-pts');
  const antes = (document.getElementById('a-pts-cuenta') || {}).textContent || '';
  const c = document.querySelector('#a-pts .a-pt');
  if (c){ c.checked = true; c.dispatchEvent(new Event('change', { bubbles:true })); }
  await new Promise(r => setTimeout(r, 300));
  const r = { esDetalle: caja ? caja.tagName.toLowerCase() : '(no está)', antes,
              despues: (document.getElementById('a-pts-cuenta') || {}).textContent || '' };
  g.cerrarDlg();
  return r;
});
paso('la lista de puertas de la revisión también es un desplegable',
  pts.esDetalle === 'details', pts.esDetalle);
paso('sin marcar dice que se revisa solo la puerta de arriba',
  /solo la puerta de arriba/.test(pts.antes), pts.antes);
paso('y al marcar una, el resumen dice cuál', /1 puerta: AR-/.test(pts.despues), pts.despues);

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
