/* ================================================================
   alta-ficha.mjs — Dos avisos que se callaban
                                                     19-11-2026

   DE DÓNDE SALEN LOS DOS

   1) LA FICHA DEL EQUIPO QUE NO SE GUARDA

   Montando la aplicación de pruebas, David creó el usuario del
   técnico, entró con él, y el SQL siguió diciendo que ese técnico
   no existía. Él insistió: «pero si ya lo hice». Y tenía razón.

   La aplicación, cuando entra alguien que todavía no tiene ficha
   del equipo, intenta crearla. Si ese alta falla, SEGUÍA ADELANTE
   con una ficha inventada en la memoria del navegador, y no decía
   nada. Esa persona entra, lo ve todo normal, y para la base de
   datos no existe: no se le pueden asignar visitas ni sale en
   Equipo. Nadie entiende por qué, porque por su lado todo va bien.

   Un fallo que no se nota cuesta más que uno que revienta.

   2) EL MANUAL QUE SE QUEDABA VIEJO

   La aplicación pedía el manual sin decir qué versión quería, así
   que el navegador servía la copia guardada de antes. Y como el
   manual lleva dentro la versión que describe, la aplicación
   comparaba el manual VIEJO con la versión NUEVA y sacaba el cartel
   de «este manual describe otra versión, avisa a la oficina».

   O sea: daba la alarma por un desajuste que ya no existía, y no
   había manera de quitarlo. Un aviso que se equivoca enseña a la
   gente a no hacer caso de los avisos, y el día que acierte tampoco
   se lo harán.

   Uso:  ./preparar.sh  y luego  node alta-ficha.mjs
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
const pag = await ctx.newPage();
await pag.goto(URL_APP);
await pag.waitForFunction(() => window.__T && window.__T.S && window.__T.S.perfil, null, { timeout: 30000 });

let ok = 0, mal = 0;
const paso = (t, bien, detalle) => {
  if (bien){ ok++; console.log('  OK  '+t+(detalle!==undefined?' → '+detalle:'')); }
  else { mal++; console.log(' FALLA '+t+(detalle!==undefined?' → '+detalle:'')); }
};
const bloque = t => console.log('\n· '+t);

const src = readFileSync(join(AQUI, '..', 'index.html'), 'utf8');

/* ================================================================
   1. La ficha del equipo que no se guarda
   ================================================================ */
bloque('1. Cuando el alta de la ficha del equipo no entra');

/* Lo primero, en el código: que el aviso se encienda. Antes la línea era
   «per = ins.data || {...}» y ahí se acababa todo. */
paso('el código mira si el alta devolvió fila y enciende el aviso',
     /if\s*\(!ins\.data\)\s*\{[\s\S]{0,200}altaFichaFallida\s*=\s*true/.test(src));
paso('y guarda el motivo que da la base, para poder arreglarlo',
     /altaFichaMotivo\s*=\s*\(ins\.error/.test(src));
paso('y lo deja también en la consola del navegador',
     /console\.error\('ARIZA SAT · el alta de la ficha del equipo no ha entrado:/.test(src));

/* Y en pantalla: el cartel se pinta delante de todo, en cualquier pestaña. */
paso('el cartel se pone por delante de la pantalla que toque',
     /if\s*\(S\.altaFichaFallida\)\s*h\s*=\s*avisoFichaSinGuardar\(\)\s*\+\s*h/.test(src));

/* Lo que DICE el cartel importa tanto como que salga. Un aviso que solo dice
   «ha habido un error» no sirve de nada en una furgoneta. */
const cartel = (src.match(/function avisoFichaSinGuardar\(\)\{[\s\S]*?\n\}/) || [''])[0];
paso('dice qué ha pasado', /ficha del equipo no se ha guardado/.test(cartel));
paso('dice qué significa: que no se le pueden asignar visitas',
     /no se te pueden asignar visitas/.test(cartel));
paso('dice a quién avisar', /Avisa a la oficina/.test(cartel));
paso('y dice que no se arregla volviendo a entrar',
     /no se arregla volviendo a entrar/.test(cartel));
paso('no echa la culpa a quien lo lee', /No es culpa tuya/.test(cartel));

/* Y ahora de verdad: se enciende la bandera y se mira la pantalla. */
bloque('2. El cartel, en pantalla');

/* OJO: pintar() no pinta en el acto, lo deja para el siguiente fotograma
   (requestAnimationFrame). La primera versión de esta prueba leía el DOM justo
   después de llamarla y veía la pantalla ANTERIOR. Peor todavía: miraba
   document.body.textContent, que incluye el texto de los <script>, o sea el
   propio código de la aplicación. Así que encontraba la frase del cartel
   dentro del código fuente y daba el OK sin que el cartel estuviera pintado.
   Dos maneras distintas de aprobar un examen en blanco. (19-11-2026) */
const pintado = () => pag.evaluate(() => new Promise(f =>
  requestAnimationFrame(() => requestAnimationFrame(() =>
    f((document.querySelector('main')||document.body).textContent)))));

await pag.evaluate(() => {
  const S = window.__T.S;
  S.altaFichaFallida = true;
  S.altaFichaMotivo = 'new row violates row-level security policy';
  S.tab = 'trabajo'; S.tabElegida = true; S.ficha = null; S.exp = null; S.fichaCliente = null;
  window.__T.pintar();
});
const t1 = await pintado();
const enPantalla = { sale: /no se ha guardado/.test(t1), motivo: /row-level security/.test(t1) };
paso('sale en Mi trabajo', enPantalla.sale);
paso('y enseña el motivo técnico, para quien lo tenga que arreglar', enPantalla.motivo);

const enOtras = {};
for (const t of ['puertas','avisos','almacen','manual']){
  await pag.evaluate(tab => {
    const S = window.__T.S;
    S.tab = tab; S.ficha = null; S.exp = null; S.fichaCliente = null;
    window.__T.pintar();
  }, t);
  enOtras[t] = /no se ha guardado/.test(await pintado());
}
paso('y en todas las demás pestañas, no solo en una',
     Object.values(enOtras).every(Boolean), JSON.stringify(enOtras));

await pag.evaluate(() => {
  const S = window.__T.S;
  S.altaFichaFallida = false; S.altaFichaMotivo = null;
  S.tab = 'trabajo'; window.__T.pintar();
});
const sinFallo = /no se ha guardado/.test(await pintado());
paso('y cuando no hay fallo, no sale', sinFallo === false);

/* ================================================================
   3. El manual que se quedaba viejo
   ================================================================ */
bloque('3. El manual se pide con la versión pegada');

paso('cargarManual pide el fichero con ?v= y la versión',
     /fetch\(m\.fichero \+ '\?v=' \+ ARIZA_VERSION\)/.test(src));
paso('y queda escrito por qué, con la fecha',
     /navegador guarda el manual y lo sigue sirviendo/.test(src) && /19-11-2026/.test(src));

/* El aviso de versión del manual tiene que seguir existiendo: lo que estaba
   mal no era el aviso, era que se disparaba sin motivo. */
paso('el aviso de «este manual describe otra versión» sigue en su sitio',
     /Este manual describe la versión/.test(src));

/* Y que de verdad se pida así, mirando lo que sale por la red. */
bloque('4. Y mirando la red, no solo el código');

const pedidos = [];
pag.on('request', r => { if (/manuales\/.*\.md/.test(r.url())) pedidos.push(r.url()); });
await pag.evaluate(async () => {
  const S = window.__T.S;
  S.manuales = {};
  S.tab = 'manual'; S.tabElegida = true;
  window.__T.pintar();
  await new Promise(f => setTimeout(f, 1500));
});
await pag.waitForTimeout(500);
paso('se ha pedido algún manual', pedidos.length > 0, pedidos.length + ' peticiones');
paso('y todas llevan la versión en la dirección',
     pedidos.length > 0 && pedidos.every(u => /\?v=\d{4}\.\d{2}\.\d{2}-\d/.test(u)),
     (pedidos[0] || '').split('/').pop());

console.log('\n── '+ok+' bien, '+mal+' mal ──────────────────────────\n');
await nav.close();
process.exit(mal ? 1 : 0);
