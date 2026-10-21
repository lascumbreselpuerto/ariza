// Prueba de humo: ¿arranca la aplicación contra el simulador reconstruido?
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
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    db.ajustes.push({ clave:'empresa', valor:{
      razon_social:'Ariza p y automatismos S.L.U.', nif:'B72004849',
      domicilio:'Calle Orilla 19', cp:'11500', poblacion:'El Puerto de Santa María',
      provincia:'Cádiz', telefono:'661 352 795', email:'arizapuertasautomaticas@gmail.com',
      representante:'David Ariza Arana', cargo_firmante:'Administrador único',
      responsable_tecnico:'David Ariza Arana' } });
  };
});
const pag = await ctx.newPage();
pag.on('pageerror', e => errores.push('JS: '+e.message));
pag.on('console', m => { if (m.type() === 'error') errores.push('consola: '+m.text()); });
await pag.goto(URL_APP);
await pag.waitForTimeout(1600);

let ok = 0, mal = 0;
const paso = (t, bien, extra='') => { bien ? ok++ : mal++;
  console.log((bien?'  OK  ':' FALLA ')+t+(extra?' → '+extra:'')); };

paso('la aplicación arranca sin pedir contraseña', await pag.locator('#login').isHidden());
const nPest = await pag.locator('#tabs button').count();
/* Once desde el 15-10-2026: se añadió «Manual», para que el técnico lleve el
   manual dentro de la aplicación y pueda leerlo sin cobertura. */
/* Doce desde el 21-10-2026: entró «Almacén». El número se escribe a mano a
   propósito, para que añadir una pestaña sin querer salte en rojo. */
paso('monta sus doce pestañas', nPest === 12, String(nPest));
paso('y reconoce al usuario', /David Ariza Arana/.test(await pag.textContent('#quien')));

await pag.click('#tabs button[data-tab="puertas"]'); await pag.waitForTimeout(400);
paso('la lista de puertas trae las dos de la semilla',
     await pag.locator('#vista .item').count() >= 2);
paso('entre ellas la de Comunidad Las Flores',
     await pag.locator('#vista .item:has-text("Comunidad Las Flores")').count() === 1);

await pag.locator('#vista .item:has-text("Comunidad Las Flores")').first().click();
await pag.waitForTimeout(600);
paso('la ficha de la puerta deja abrir un expediente',
     await pag.locator('[data-act="exp-nuevo"]').count() >= 1);
await pag.locator('[data-act="exp-nuevo"]').first().click(); await pag.waitForTimeout(500);
paso('el diálogo pide situación y familia',
     await pag.locator('#xp-sit').count() === 1 && await pag.locator('#xp-fam').count() === 1);
await pag.selectOption('#xp-sit', 'adecuacion'); await pag.waitForTimeout(200);
await pag.selectOption('#xp-fam', 'peatonal'); await pag.waitForTimeout(250);
await pag.click('#dlg button[type="submit"]'); await pag.waitForTimeout(1100);
const nPasos = await pag.locator('[data-act="exp-paso"]').count();
paso('el expediente se crea con sus pasos', nPasos >= 10, String(nPasos));
paso('y una peatonal trae su paso propio',
     await pag.locator('[data-act="exp-paso"][data-v="familia"]').count() === 1);

console.log('\n'+ok+' bien, '+mal+' mal.');
/* El único error de consola esperable es la fuente de Google, que el entorno de
   pruebas no puede descargar. No cuenta como fallo. */
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
