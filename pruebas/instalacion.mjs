/* ================================================================
   instalacion.mjs — «Qué falta por instalar en el servidor»
                                                     08-11-2026

   POR QUÉ EXISTE ESTE APARTADO Y POR QUÉ ESTA SUITE
   El 08-11-2026 se fueron cinco mensajes averiguando si David había
   ejecutado un fichero SQL. Yo le mandé a mirar un panel al sitio
   equivocado, él dedujo que faltaba, y acabó ejecutando un SQL que
   ya estaba puesto.

   Y la aplicación lo sabía desde el principio: al arrancar hace 36
   comprobaciones contra la base de datos para encender o apagar
   funciones enteras. Esa información existía y no se enseñaba.

   LO QUE VIGILA ESTA SUITE, Y LO PRIMERO ES LO IMPORTANTE
     1. QUE LA LISTA NO SE QUEDE ATRÁS. Cada entrega que traiga un
        SQL nuevo tiene que añadir su línea. Si se olvida, el
        apartado MIENTE: dice que está todo bien cuando falta algo.
        Aquí se compara la lista con las comprobaciones que la
        aplicación hace de verdad, y si no cuadran, rojo.
     2. Que lo que falta salga, con su fichero y con qué te pierdes.
     3. Que cuando no falta nada lo diga en una línea y no ocupe
        media pantalla.
     4. Que el técnico NO lo vea: es de la oficina.
     5. Y que NO toque la base de datos. Solo lee.
   ================================================================ */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const AQUI = dirname(fileURLToPath(import.meta.url));
const URL_APP = process.env.ARIZA_URL || 'http://127.0.0.1:8899/index.html';
let ajustes = {};
try { ajustes = JSON.parse(readFileSync(join(AQUI, 'ajustes.json'), 'utf8')); } catch(_){}

const nav = await chromium.launch({ args: ['--lang=es-ES'] });
const ctx = await nav.newContext({ viewport:{width:1320,height:2200},
  locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
const errores = [];
const esLaLetraDeGoogle = t => /fonts\.(googleapis|gstatic)\.com/.test(t) ||
  /Failed to load resource/.test(t);
const pag = await ctx.newPage();
pag.on('console', m => { if (m.type() === 'error' && !esLaLetraDeGoogle(m.text())) errores.push(m.text()); });
pag.on('pageerror', e => errores.push(String(e)));
await pag.goto(URL_APP);
await pag.waitForFunction(() => window.__T && window.__T.S && window.__T.S.perfil, null, { timeout: 30000 });
const T = (f, arg) => arg === undefined ? pag.evaluate(f) : pag.evaluate(f, arg);

let ok = 0, mal = 0;
const paso = (t, bien, detalle) => {
  if (bien){ ok++; console.log('  OK  '+t+(detalle!==undefined?' → '+detalle:'')); }
  else { mal++; console.log(' FALLA '+t+(detalle!==undefined?' → '+detalle:'')); }
};
const bloque = t => console.log('\n· '+t);

bloque('1. La lista no se queda atrás');
/* La comprobación que hace que todo lo demás sirva de algo. */
const cuadra = await T(() => {
  const g = window.__T;
  /* Las marcas que la aplicación pone de verdad al arrancar. */
  const puestas = Object.keys(g.S).filter(k => /^sin[A-Z]/.test(k));
  /* Los interruptores que pone el BANCO para apagar cosas a propósito no son
     comprobaciones del servidor: se excluyen por su nombre. */
  const deBanco = ['sinQRnativo','sinQRpropio','sinQRbarras'];
  /* Y esta se deduce del contenido del catálogo, no de un fallo del servidor. */
  const noEsDeSQL = ['sinCatalogoVentas'];
  const reales = puestas.filter(k => deBanco.indexOf(k) < 0 && noEsDeSQL.indexOf(k) < 0);
  const enLista = g.QUE_HACE_FALTA.map(c => c.marca);
  return { faltanEnLaLista: reales.filter(k => enLista.indexOf(k) < 0),
           sobranEnLaLista: enLista.filter(k => reales.indexOf(k) < 0),
           cuantas: enLista.length };
});
paso('toda comprobación que hace la aplicación está en la lista',
     cuadra.faltanEnLaLista.length === 0,
     cuadra.faltanEnLaLista.join(', ') || 'ninguna se ha quedado fuera');
paso('y en la lista no hay ninguna inventada',
     cuadra.sobranEnLaLista.length === 0,
     cuadra.sobranEnLaLista.join(', ') || 'ninguna sobra');
paso('son '+cuadra.cuantas+' y todas tienen fichero y explicación', cuadra.cuantas >= 30, cuadra.cuantas);

const completa = await T(() => {
  const g = window.__T;
  const malas = g.QUE_HACE_FALTA.filter(c =>
    !c.marca || !c.fichero || !c.que || !c.pierdes ||
    !/\.sql$/.test(c.fichero) || c.que.length < 4 || c.pierdes.length < 20);
  return malas.map(c => c.marca || '(sin marca)');
});
paso('cada línea dice qué es, qué te pierdes y qué fichero ejecutar',
     completa.length === 0, completa.join(', ') || 'todas completas');

bloque('2. Lo que falta sale, y se entiende');
const conFalta = await T(async () => {
  const g = window.__T;
  /* Se finge que faltan dos cosas, sin tocar la base de datos. */
  const antes = { a: g.S.sinPeticiones, b: g.S.sinFactura };
  g.S.sinPeticiones = true; g.S.sinFactura = true;
  const h = g.panelInstalacion();
  const n = g.faltaPorInstalar().length;
  g.S.sinPeticiones = antes.a; g.S.sinFactura = antes.b;
  return { h, n,
    diceBarras: /barras\.sql/.test(h), diceFactura: /factura\.sql/.test(h),
    dicePierdes: /no se entera|impagados/i.test(h),
    diceCuantas: /2 sin instalar/.test(h),
    diceDondePegarlo: /SQL Editor/i.test(h),
    diceQueSePuedeRepetir: /ya estén puestos|escritos para eso/i.test(h) };
});
paso('salen las dos que faltan', conFalta.n === 2, conFalta.n);
paso('con el nombre del fichero de cada una',
     conFalta.diceBarras && conFalta.diceFactura);
paso('y diciendo qué te pierdes mientras tanto', conFalta.dicePierdes === true);
paso('el titular dice cuántas faltan', conFalta.diceCuantas === true);
paso('explica dónde se pegan', conFalta.diceDondePegarlo === true);
paso('y que se pueden ejecutar aunque ya estén puestos',
     conFalta.diceQueSePuedeRepetir === true);

bloque('3. Cuando no falta nada, una línea y ya');
const sinFalta = await T(() => {
  const g = window.__T;
  const guardadas = {};
  g.QUE_HACE_FALTA.forEach(c => { guardadas[c.marca] = g.S[c.marca]; g.S[c.marca] = false; });
  const h = g.panelInstalacion();
  g.QUE_HACE_FALTA.forEach(c => { g.S[c.marca] = guardadas[c.marca]; });
  return { h, largo: h.length, diceTodo: /Está todo instalado/.test(h),
           sinLista: !/class="item"/.test(h) };
});
paso('dice que está todo', sinFalta.diceTodo === true);
paso('y no suelta la lista entera encima', sinFalta.sinLista === true, sinFalta.largo+' caracteres');

bloque('4. Es de la oficina, no del técnico');
const tecnico = await T(() => {
  const g = window.__T;
  const antes = g.S.perfil ? g.S.perfil.rol : null;
  if (g.S.perfil) g.S.perfil.rol = 'tecnico';
  const h = g.panelInstalacion();
  if (g.S.perfil) g.S.perfil.rol = antes;
  return h;
});
paso('el técnico no lo ve', tecnico === '');

bloque('5. No toca nada: solo mira');
const inocuo = await T(async () => {
  const g = window.__T;
  const antes = JSON.stringify({ a: (g.S.avisos||[]).length, c: (g.S.catalogo||[]).length,
                                 u: (g.S.ubicaciones||[]).length });
  g.panelInstalacion(); g.faltaPorInstalar();
  const despues = JSON.stringify({ a: (g.S.avisos||[]).length, c: (g.S.catalogo||[]).length,
                                   u: (g.S.ubicaciones||[]).length });
  /* y que no haya ninguna orden de escritura en su código */
  const fuente = String(g.panelInstalacion) + String(g.faltaPorInstalar);
  return { igual: antes === despues,
           escribe: /\.(insert|update|delete|upsert|rpc)\s*\(/.test(fuente) };
});
paso('mirarlo no cambia ningún dato', inocuo.igual === true);
paso('y su código no escribe en la base de datos', inocuo.escribe === false);

bloque('6. Sale en Gestión, y arriba cuando falta algo');
const enGestion = await T(async () => {
  const g = window.__T;
  const antes = g.S.sinPeticiones;
  g.S.sinPeticiones = true;
  g.S.vista = 'oficina'; g.S.tab = 'gestion'; g.pintar();
  await new Promise(r => setTimeout(r, 500));
  const txt = document.getElementById('vista').textContent;
  const pos = txt.indexOf('Lo que hace falta en el servidor');
  const posCifras = txt.indexOf('Visitas cerradas');
  g.S.sinPeticiones = antes;
  return { sale: pos >= 0, antesQueLasCifras: pos >= 0 && posCifras >= 0 && pos < posCifras };
});
paso('aparece en Gestión', enGestion.sale === true);
paso('y por delante de las cifras del mes cuando falta algo',
     enGestion.antesQueLasCifras === true);

console.log('\n'+ok+' bien, '+mal+' mal.');
if (errores.length){ console.log('Errores de JavaScript:'); errores.forEach(e => console.log('   '+e)); }
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || errores.length ? 1 : 0);
