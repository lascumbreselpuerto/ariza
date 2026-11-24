/* ================================================================
   posicion.mjs — Que la pantalla se quede donde la dejaste
                                                     23-11-2026

   DE DÓNDE SALE

   Christian, en la oficina, con la aplicación abierta toda la
   jornada: «se recarga sola constantemente». Y David, rellenando
   una puerta: «cada vez que cargo un componente me saca de esa
   pantalla llevándome a la principal».

   Parecían dos cosas y era una.

   QUÉ PASABA

   Después de CADA guardado la aplicación recarga los datos. Y
   mientras esperaba, borraba la pantalla entera y ponía «Cargando
   datos…»: una sola línea, dos centímetros de alto.

   El código sí guardaba por dónde ibas. Pero lo leía en el momento
   de repintar, y en ese momento la página medía dos centímetros,
   así que el navegador ya te había llevado al principio. Lo que se
   guardaba era un cero, y un cero es lo que se restauraba.

   O sea que el mecanismo estaba puesto y lo rompía el «Cargando
   datos…» del medio.

   QUÉ SE VIGILA AQUÍ

   1. Que al recargar datos NO se borre lo que estás mirando.
   2. Que la posición sobreviva a esa recarga.
   3. Que la primera carga SÍ enseñe «Cargando datos…», porque
      entonces no hay nada que conservar.
   4. Y que cambiar de pantalla siga llevando arriba, que eso
      estaba bien: al abrir una ficha uno quiere empezar a leer.

   Uso:  ./preparar.sh  y luego  node posicion.mjs
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
const ctx = await nav.newContext({ viewport:{width:1320,height:900},
  locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
const pag = await ctx.newPage();
await pag.goto(URL_APP);
await pag.waitForFunction(() => window.__T && window.__T.S && window.__T.S.perfil, null, { timeout: 30000 });
const T = (f, arg) => arg === undefined ? pag.evaluate(f) : pag.evaluate(f, arg);
const esperar = ms => new Promise(f => setTimeout(f, ms));

let ok = 0, mal = 0;
const paso = (t, bien, detalle) => {
  if (bien){ ok++; console.log('  OK  '+t+(detalle!==undefined?' → '+detalle:'')); }
  else { mal++; console.log(' FALLA '+t+(detalle!==undefined?' → '+detalle:'')); }
};
const bloque = t => console.log('\n· '+t);

/* Hace falta una pantalla más alta que la ventana. El manual lo es siempre:
   son miles de palabras y no depende de cuántos datos haya en el simulador. */
async function pantallaLarga(){
  await T(() => { const g = window.__T;
    g.S.tab = 'manual'; g.S.tabElegida = true; g.S.ficha = null; g.S.fichaCliente = null;
    g.pintar(); });
  await esperar(900);
  return T(() => document.documentElement.scrollHeight);
}

bloque('1. La pantalla es más alta que la ventana');
const alto = await pantallaLarga();
paso('hay de dónde desplazarse', alto > 1400, alto + 'px');

bloque('2. Recargar datos no te mueve del sitio');
await pag.evaluate(() => window.scrollTo(0, 700));
await esperar(300);
const antes = await T(() => window.scrollY);
paso('estamos a media pantalla', antes > 600, antes + 'px');

/* Esto es lo que pasa en cada guardado: se recargan los datos. */
await T(async () => { await window.__T.cargar(); });
await esperar(1200);
const despues = await T(() => window.scrollY);
paso('después de recargar seguimos donde estábamos',
     Math.abs(despues - antes) < 80, antes + 'px → ' + despues + 'px');

bloque('3. Lo que se ve mientras se recarga');
/* Durante la recarga la pantalla NO puede quedarse en una línea: eso es lo
   que Christian veía como un parpadeo.

   OJO CON CÓMO SE MIDE ESTO. El primer intento fue mirar el alto cada 30 ms
   mientras se recargaba de verdad, y daba verde SIN el arreglo: en el banco los
   datos vienen de un simulador que contesta al instante, así que el momento en
   blanco no llegaba a durar ni un fotograma. Una prueba que solo pasa porque la
   red del banco es infinitamente rápida no prueba nada de lo que pasa en una
   oficina.

   Así que no se mide el tiempo: se pone a la aplicación en el estado exacto en
   que está mientras recarga (datos ya vistos y recargando) y se mira QUÉ
   DIBUJA. Eso no depende de lo que tarde nadie. */
const durante = await pag.evaluate(async () => {
  const g = window.__T, S = g.S;
  const antesC = S.cargando, antesH = S.huboDatos;
  S.huboDatos = true;          // ya se habían visto datos alguna vez
  S.cargando = true;           // y ahora se está recargando, como tras guardar
  g.pintar();
  await new Promise(f => setTimeout(f, 400));
  const alto = document.documentElement.scrollHeight;
  /* Se mira DENTRO de #vista, que es donde la aplicación dibuja la pantalla.
     Dos trampas, las dos pisadas al escribir esto:
       · body.textContent incluye el código fuente del propio fichero, y ahí
         está escrita la frase «Cargando datos…». Buscándola así salía siempre.
       · querySelector('.cargando') a secas tampoco vale: el armazón tiene un
         <div id="arranque" class="cargando"> fijo, que está desde que se abre
         la página. También salía siempre. */
  const enBlanco = !!document.querySelector('#vista .cargando');
  S.cargando = antesC; S.huboDatos = antesH; g.pintar();
  await new Promise(f => setTimeout(f, 400));
  return { alto, enBlanco };
});
paso('al recargar NO se borra lo que estabas mirando',
     durante.enBlanco === false, durante.enBlanco ? 'pone «Cargando datos…»' : 'la pantalla sigue ahí');
paso('y la pantalla conserva su alto', durante.alto > 1400, durante.alto + 'px');

bloque('4. La primera carga sí avisa');
const primera = await T(() => {
  const g = window.__T, S = g.S;
  const hubo = S.huboDatos;
  S.huboDatos = false; S.cargando = true;
  g.pintar();
  return new Promise(f => setTimeout(() => {
    const sale = !!document.querySelector('#vista .cargando');
    S.cargando = false; S.huboDatos = hubo; g.pintar();
    setTimeout(() => f(sale), 300);
  }, 300));
});
paso('la primera vez sí dice «Cargando datos…»', primera === true);

bloque('5. Cambiar de pantalla sigue llevando arriba');
await pag.evaluate(() => window.scrollTo(0, 700));
await esperar(300);
await T(() => { const g = window.__T;
  g.S.tab = 'clientes'; g.S.tabElegida = true; g.pintar(); });
await esperar(700);
const tras = await T(() => window.scrollY);
paso('al cambiar de pestaña se empieza arriba', tras < 60, tras + 'px');

bloque('6. Y al volver, donde lo dejaste');
await T(() => { const g = window.__T;
  g.S.tab = 'manual'; g.S.tabElegida = true; g.pintar(); });
await esperar(900);
const vuelta = await T(() => window.scrollY);
paso('volver a una pantalla te devuelve a su sitio', vuelta > 600, vuelta + 'px');

console.log('\n── '+ok+' bien, '+mal+' mal ──────────────────────');
await nav.close();
process.exit(mal ? 1 : 0);
