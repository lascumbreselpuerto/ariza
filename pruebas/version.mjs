/* ================================================================
   version.mjs — saber qué versión se está usando.

   Por qué existe: el 15-10-2026 se perdió un rato entero. David
   buscaba en Equipo un panel que ya estaba escrito y publicado, pero
   su navegador tenía cargada la versión anterior. Ni él ni yo
   teníamos forma de saber qué versión estaba usando, así que los dos
   dimos palos de ciego: yo describiendo una pantalla que él no tenía,
   y él buscando algo que no estaba.

   Una versión vieja da respuestas viejas. Esto lo corta.

   Lo que fija:
     1. Que la versión existe, tiene forma de fecha y NO se queda vieja.
     2. Que se puede leer del fichero publicado con la misma expresión
        que usa la aplicación: si alguien cambia la línea, falla aquí.
     3. Que cuando el servidor tiene otra versión, se avisa.
     4. Que «Luego» calla ESTA versión, no todas.
     5. Que sin cobertura no se inventa un aviso.
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
const ctx = await nav.newContext({ viewport:{width:1320,height:1600}, locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
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

/* ================================================================
   1. La versión existe y no se queda vieja
   ================================================================ */
bloque('1. La versión');

const v = await T(() => window.__T.ARIZA_VERSION);
paso('la aplicación lleva un número de versión', !!v, v);
paso('con forma de fecha y número de entrega del día',
  /^\d{4}\.\d{2}\.\d{2}-\d+$/.test(v || ''), v);

/* Esta es la que de verdad importa: una versión que se queda sin tocar en una
   entrega es peor que no tener versión, porque miente con cara de verdad. */
const hoy = new Date();
const limite = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 30);
const [a, m, d] = (v || '0000.00.00-0').split('-')[0].split('.').map(Number);
const fv = new Date(a, m - 1, d);
paso('Y NO SE HA QUEDADO VIEJA: menos de 30 días desde la última entrega',
  fv >= limite, v + ' frente al límite ' +
  [limite.getFullYear(), String(limite.getMonth()+1).padStart(2,'0'),
   String(limite.getDate()).padStart(2,'0')].join('.'));
paso('y no está puesta en el futuro, que sería un despiste al escribirla',
  fv <= new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1), v);

/* ================================================================
   2. Se puede leer del fichero publicado
   ================================================================ */
bloque('2. Leerla del fichero publicado');

const leida = await T(async () => {
  const g = window.__T;
  return { delFichero: await g.versionPublicada(), enMemoria: g.ARIZA_VERSION,
           re: String(g.ARIZA_VERSION_RE) };
});
paso('la versión se puede leer del index.html servido',
  !!leida.delFichero, leida.delFichero);
paso('Y COINCIDE con la que tiene cargada la aplicación',
  leida.delFichero === leida.enMemoria, leida.delFichero + ' / ' + leida.enMemoria);
paso('la expresión que la busca es la misma que está en el fichero',
  /const ARIZA_VERSION = /.test(leida.re), leida.re);

/* ================================================================
   3. Cuando hay una nueva, se avisa
   ================================================================ */
bloque('3. El aviso de versión nueva');

const avisa = await T(async () => {
  const g = window.__T;
  /* Se finge que el servidor tiene otra versión, interceptando la lectura. */
  const real = window.fetch;
  window.fetch = async (u, o) => {
    if (String(u).indexOf('index.html?v=') >= 0)
      return new Response("const ARIZA_VERSION = '2099.01.01-9';", { status:200 });
    return real(u, o);
  };
  g.S.versionAvisada = null;
  await g.comprobarVersion();
  window.fetch = real;
  const b = document.getElementById('barra-version');
  return { visible: b && !b.hidden,
           texto: (document.getElementById('barra-version-txt')||{}).textContent || '',
           botones: Array.from(document.querySelectorAll('#barra-version button')).map(x => x.textContent.trim()) };
});
paso('con una versión distinta en el servidor, sale la barra de aviso', avisa.visible);
paso('diciendo la que hay y la que tienes, no solo «hay una nueva»',
  /2099\.01\.01-9/.test(avisa.texto) && avisa.texto.indexOf(v) >= 0, avisa.texto);
paso('con un botón para recargar en el momento',
  avisa.botones.some(x => /Recargar/.test(x)), avisa.botones.join(' | '));

const luego = await T(async () => {
  const g = window.__T;
  document.querySelectorAll('#barra-version button').forEach(b => {
    if (/Luego/.test(b.textContent)) b.click();
  });
  const b = document.getElementById('barra-version');
  const tras = { oculta: b.hidden, avisada: g.S.versionAvisada };
  /* Con «Luego» pulsado, otra comprobación de LA MISMA versión no molesta más */
  const real = window.fetch;
  window.fetch = async (u, o) => {
    if (String(u).indexOf('index.html?v=') >= 0)
      return new Response("const ARIZA_VERSION = '2099.01.01-9';", { status:200 });
    return real(u, o);
  };
  await g.comprobarVersion();
  const sigueOculta = document.getElementById('barra-version').hidden;
  /* Pero una versión DISTINTA sí vuelve a avisar: «Luego» no es «nunca más» */
  window.fetch = async (u, o) => {
    if (String(u).indexOf('index.html?v=') >= 0)
      return new Response("const ARIZA_VERSION = '2099.02.02-1';", { status:200 });
    return real(u, o);
  };
  g.S.versionAvisada = tras.avisada;
  await g.comprobarVersion();
  const vuelveASalir = !document.getElementById('barra-version').hidden;
  window.fetch = real;
  return Object.assign(tras, { sigueOculta, vuelveASalir });
});
paso('«Luego» aparta el aviso', luego.oculta === true);
paso('y no vuelve a salir con la misma versión', luego.sigueOculta === true);
paso('PERO CON UNA VERSIÓN DISTINTA SÍ VUELVE: «Luego» no es «nunca más»',
  luego.vuelveASalir === true);

/* ================================================================
   4. Sin cobertura no se inventa nada
   ================================================================ */
bloque('4. Sin cobertura');

const sinRed = await T(async () => {
  const g = window.__T;
  const real = window.fetch;
  window.fetch = async (u, o) => {
    if (String(u).indexOf('index.html?v=') >= 0) throw new Error('sin red, provocado por la prueba');
    return real(u, o);
  };
  g.S.versionAvisada = null;
  const b0 = document.getElementById('barra-version');
  b0.hidden = true;
  const r = await g.versionPublicada();
  await g.comprobarVersion();
  window.fetch = real;
  return { devuelve: r, barra: !document.getElementById('barra-version').hidden };
});
paso('sin red, preguntar por la versión devuelve nada en vez de romperse',
  sinRed.devuelve === null, JSON.stringify(sinRed.devuelve));
paso('y NO se enseña ningún aviso: una nave sin cobertura no es una versión vieja',
  sinRed.barra === false);

/* ================================================================
   5. En Equipo, a la vista
   ================================================================ */
bloque('5. En la pantalla de Equipo');

const enEquipo = await T(() => {
  const g = window.__T;
  const d = document.createElement('div'); d.innerHTML = g.vistaEquipo();
  const titulos = Array.from(d.querySelectorAll('.panel-h h2, .panel-h h3')).map(x => x.textContent.trim());
  return { titulos, texto: d.textContent,
           boton: !!d.querySelector('[data-act="version-comprobar"]') };
});
paso('la versión es lo primero que se ve en Equipo',
  /Versión de la aplicación/.test(enEquipo.titulos[2] || ''), enEquipo.titulos.slice(0,4).join(' | '));
paso('con el número a la vista', enEquipo.texto.indexOf(v) >= 0);
paso('y un botón para preguntar al servidor en el momento', enEquipo.boton);
paso('diciendo para qué sirve: para citarlo cuando algo no cuadra',
  /di este número/.test(enEquipo.texto));

/* ================================================================
   6. El orden de los paneles de Equipo
   ================================================================ */
bloque('6. El orden de los paneles de Equipo');

/* Este bloque existe por el mismo rato perdido: al decirle a David dónde estaban
   los límites de obra, el orden que le di estaba mal y se puso a buscar cinco
   paneles más abajo de donde están. Si el orden cambia, esto se pone en rojo y
   obliga a corregir también lo que se le haya contado. */
const esperado = ['Técnicos con acceso', 'Dar de alta a alguien del equipo',
  'Versión de la aplicación', 'Datos de la empresa',
  'Protección exigida según accionamiento y usuario', 'Límites de fuerza',
  'Límites de obra', 'Fechas que deciden', 'Copia de seguridad',
  'Control de producción en fábrica', 'Elementos de seguridad',
  'Tipos de documento', 'Tipos de puerta', 'Guiones de revisión'];
paso('los paneles de Equipo salen en el orden documentado',
  JSON.stringify(enEquipo.titulos) === JSON.stringify(esperado),
  enEquipo.titulos.join(' | '));
paso('«Límites de obra» va justo detrás de «Límites de fuerza»',
  enEquipo.titulos.indexOf('Límites de obra') === enEquipo.titulos.indexOf('Límites de fuerza') + 1);
paso('y los dos están POR ENCIMA de «Tipos de puerta», que es donde se buscaron mal',
  enEquipo.titulos.indexOf('Límites de obra') < enEquipo.titulos.indexOf('Tipos de puerta'));

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
