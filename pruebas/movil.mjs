/* ================================================================
   movil.mjs — Que no se salga nada de la pantalla del móvil
                                                     19-11-2026

   DE DÓNDE SALE
   Haciendo las capturas del manual del técnico, con la aplicación
   puesta a 375 de ancho, que es un móvil normal. La ficha de una
   puerta se salía: el contenido medía 540 en una pantalla de 375.

   Lo que se quedaba fuera no era adorno:
     · el chip del estado de la puerta
     · el botón de editar la ficha
     · el final de los mensajes de oficina
     · el teléfono y la población del cliente

   Y lo peor: la página NO se desplaza a lo ancho. Así que esos
   trozos no estaban escondidos esperando un arrastre. Estaban
   perdidos. En un móvil no había manera de verlos.

   LA CAUSA
   .stack es una rejilla. Una rejilla no deja que sus bloques se
   encojan por debajo de lo que mide su contenido más ancho, salvo
   que se le diga. En las listas no se notaba porque no hay nada
   ancho; en la ficha sí.

   POR QUÉ ESTA SUITE Y NO UNA COMPROBACIÓN SUELTA
   Porque el fallo no era de la ficha: era del contenedor que usan
   TODAS las pantallas. Mañana se añade un panel con una línea larga
   en cualquier otro sitio y vuelve a pasar. Así que esto no mira la
   ficha: mide la aplicación entera a lo ancho de un móvil.

   CÓMO SE MIDE, Y POR QUÉ ASÍ
   No vale con mirar scrollWidth. Una tabla ancha metida en un
   contenedor con su propio desplazamiento lateral infla ese número
   sin que nada se salga de verdad: la tabla del manual de dentro de
   la aplicación es justo ese caso, y está BIEN. Lo que se mide aquí
   es lo que de verdad importa:

     un elemento se da por perdido cuando su borde derecho pasa del
     ancho de la pantalla Y no está dentro de ningún contenedor que
     se pueda desplazar a lo ancho.

   Primero lo medí mal y di por roto el manual de dentro de la
   aplicación, que no lo estaba. La medida buena es esta.

   Uso:  ./preparar.sh  y luego  node movil.mjs
   ================================================================ */
import { chromium, devices } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const AQUI = dirname(fileURLToPath(import.meta.url));
const URL_APP = process.env.ARIZA_URL || 'http://127.0.0.1:8899/index.html';
let ajustes = {};
try { ajustes = JSON.parse(readFileSync(join(AQUI, 'ajustes.json'), 'utf8')); } catch(_){}

const ANCHO = 375;   // iPhone SE, 8, X, 11, 12 mini, 13 mini. El suelo razonable.

const nav = await chromium.launch({ args: ['--lang=es-ES'] });
const ctx = await nav.newContext({
  ...devices['iPhone 13'], viewport: { width: ANCHO, height: 812 },
  locale: 'es-ES', timezoneId: 'Europe/Madrid', isMobile: true, hasTouch: true,
});
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);

/* ---- Una puerta con componentes dados de alta ----
   Sin esto la suite no servía para nada, y lo comprobé: con el arreglo
   quitado seguía diciendo que la ficha entraba en la pantalla.

   El motivo es que lo que desborda la ficha es la TABLA DE COMPONENTES, que
   tiene seis columnas, y la puerta del simulador no tenía ninguno. O sea, la
   comprobación miraba una ficha a la que le faltaba justo la parte que falla.

   Una prueba que no se pone roja cuando el fallo está delante es peor que no
   tener prueba: da por bueno lo que no lo está. (19-11-2026) */
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    const p1 = db.puertas[0];
    db.componentes.push(
      { id:'cm-1', puerta_id:p1.id, clave:'motor', nombre:'Automatismo o motorreductor',
        marca:'Erreka', modelo:'Rino 4', num_serie:'RN4-88213', activo:true,
        creado:new Date().toISOString() },
      { id:'cm-2', puerta_id:p1.id, clave:'cuadro', nombre:'Cuadro de maniobra',
        marca:'Erreka', modelo:'Vivo-D102', num_serie:'VD-41002', activo:true,
        creado:new Date().toISOString() },
      { id:'cm-3', puerta_id:p1.id, clave:'fotocelulas', nombre:'Fotocélulas',
        marca:'Erreka', modelo:'Reflex', activo:true, creado:new Date().toISOString() },
    );
    /* Y un mensaje fijado, que es el otro texto largo que lleva una ficha. */
    db.mensajes.push({ id:'mm-1', puerta_id:p1.id, aviso_id:null, fijado:true,
      texto:'El cuadro es el viejo, no el que pone la ficha. Lo cambiaron el año pasado.',
      quien:'Christian, oficina', perfil_id:null, creado:new Date().toISOString() });
  };
});

const errores = [];
const esLaLetraDeGoogle = t => /fonts\.(googleapis|gstatic)\.com/.test(t) ||
  /Failed to load resource/.test(t);
const pag = await ctx.newPage();
pag.on('console', m => { if (m.type() === 'error' && !esLaLetraDeGoogle(m.text())) errores.push(m.text()); });
pag.on('pageerror', e => errores.push(String(e)));
await pag.goto(URL_APP);
await pag.waitForFunction(() => window.__T && window.__T.S && window.__T.S.perfil, null, { timeout: 30000 });

let ok = 0, mal = 0;
const paso = (t, bien, detalle) => {
  if (bien){ ok++; console.log('  OK  '+t+(detalle!==undefined?' → '+detalle:'')); }
  else { mal++; console.log(' FALLA '+t+(detalle!==undefined?' → '+detalle:'')); }
};
const bloque = t => console.log('\n· '+t);

/* La medida. Va entera al navegador, así que no usa nada de aquí fuera. */
const PERDIDOS = (ancho) => {
  const d = document.documentElement;
  const W = d.clientWidth;
  const enAlgoQueSeDesplaza = el => {
    let p = el.parentElement;
    while (p && p !== document.body){
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
      p = p.parentElement;
    }
    return false;
  };
  const fuera = [...document.querySelectorAll('main *, dialog *')]
    .filter(e => e.children.length === 0)
    .filter(e => {
      const r = e.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      return r.right > W + 2 && !enAlgoQueSeDesplaza(e);
    })
    .map(e => ((e.textContent||'').trim().slice(0, 28) || '<'+e.tagName.toLowerCase()+'>'));
  return { ancho: W, perdidos: fuera.length, cuales: fuera.slice(0, 5) };
};

const mirar = () => pag.evaluate(PERDIDOS, ANCHO);
const ver = async (tab, extra) => {
  await pag.evaluate(o => {
    const S = window.__T.S;
    S.exp = null; S.ficha = null; S.fichaCliente = null; S.cierre = null; S.abierta = null;
    S.tab = o.tab; S.tabElegida = true;
    if (o.ficha) S.ficha = (window.__T.S.puertas[0]||{}).id;
    if (o.cliente) S.fichaCliente = (window.__T.S.clientes[0]||{}).id;
    window.__T.pintar();
  }, Object.assign({ tab }, extra || {}));
  await pag.waitForTimeout(350);
  return mirar();
};

console.log('\n── La aplicación en una pantalla de '+ANCHO+' ──────────\n');

/* ================================================================
   1. La página no se desplaza a lo ancho
   ================================================================
   Esto es lo que convierte el fallo en grave. Si la página se
   desplazara, lo que se sale seguiría estando al alcance de un
   arrastre: feo, pero recuperable. Como no se desplaza, lo que se
   sale no se ve, y punto.
   ================================================================ */
bloque('1. Lo que se sale no se recupera arrastrando');

const seDesplaza = await pag.evaluate(async () => {
  window.scrollTo(400, 0);
  await new Promise(f => setTimeout(f, 200));
  const x = window.scrollX;
  window.scrollTo(0, 0);
  return x;
});
paso('la página no se desplaza a lo ancho, así que lo que se salga se pierde',
     seDesplaza === 0, 'desplazamiento: '+seDesplaza);

/* ================================================================
   2. Las pantallas, una por una
   ================================================================ */
bloque('2. Cada pantalla, con el administrador');

const PANTALLAS = [
  ['trabajo',    'Mi trabajo'],
  ['puertas',    'Puertas'],
  ['avisos',     'Asistencias'],
  ['realizadas', 'Realizadas'],
  ['calendario', 'Calendario'],
  ['clientes',   'Clientes'],
  ['contratos',  'Contratos'],
  ['almacen',    'Almacén'],
  ['etiquetas',  'Etiquetas'],
  ['equipo',     'Equipo'],
  ['gestion',    'Gestión'],
  ['presupuestos','Presupuestos'],
  ['manual',     'Manual de dentro de la aplicación'],
];

for (const [tab, nombre] of PANTALLAS){
  const r = await ver(tab);
  paso(nombre, r.perdidos === 0,
       r.perdidos ? r.perdidos+' fuera de la pantalla: '+r.cuales.join(' · ') : 'entra');
}

/* ================================================================
   3. Las fichas, que es donde apareció
   ================================================================
   Una ficha tiene nombres de cliente, direcciones y mensajes de
   oficina: texto largo que no se parte donde uno quiere. Es el sitio
   natural donde esto revienta, y el que más mira un técnico.
   ================================================================ */
bloque('3. Las fichas');

const fp = await ver('puertas', { ficha: true });
paso('la ficha de una puerta', fp.perdidos === 0,
     fp.perdidos ? fp.perdidos+' fuera: '+fp.cuales.join(' · ') : 'entra');

const fc = await ver('clientes', { cliente: true });
paso('la ficha de un cliente', fc.perdidos === 0,
     fc.perdidos ? fc.perdidos+' fuera: '+fc.cuales.join(' · ') : 'entra');

/* ================================================================
   4. Y que el arreglo siga puesto en el CSS
   ================================================================
   Las dos comprobaciones de arriba se pondrían verdes solas si un día
   alguien cambia el diseño de otra manera, y eso está bien. Esta mira
   el arreglo concreto, para que quitarlo «porque no se ve para qué
   sirve» salga en rojo con el motivo delante.
   ================================================================ */
bloque('4. El arreglo del contenedor sigue en su sitio');

const css = readFileSync(join(AQUI, '..', 'index.html'), 'utf8');
paso('la rejilla .stack declara su columna como minmax(0,1fr)',
     /\.stack\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(css));
paso('y sus bloques llevan min-width:0',
     /\.stack>\*\{[^}]*min-width:\s*0/.test(css));
paso('y queda escrito por qué, con la fecha',
     /no deja que sus bloques se encojan/.test(css) && /19-11-2026/.test(css));

/* ================================================================
   5. Sin errores por el camino
   ================================================================ */
bloque('5. La consola');
paso('ningún error de JavaScript recorriendo todo esto', errores.length === 0,
     errores.slice(0, 2).join(' | '));

console.log('\n── '+ok+' bien, '+mal+' mal ──────────────────────────\n');
await nav.close();
process.exit(mal ? 1 : 0);
