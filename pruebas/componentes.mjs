/* ================================================================
   componentes.mjs — el inventario de lo que hay montado en la puerta.

   Por qué existe: la puerta tenía una lista de casillas («lleva
   fotocélulas») y el expediente pedía marca, modelo y número de serie
   de cada elemento. Lo segundo vivía DENTRO del expediente, así que en
   el segundo expediente de la misma puerta había que teclearlo otra
   vez, y la puerta nunca sabía qué llevaba montado.

   Ahora el inventario vive en la puerta, el expediente lo trae cuando
   se le pide, y lo que se rellena en el expediente puede quedarse en la
   puerta para la próxima.

   Lo que fija esta suite:
     1. Qué componentes le tocan a cada puerta y de dónde sale cada uno.
     2. Que lo que viene de la matriz se ofrece como recordatorio, nunca
        como exigencia acreditada, porque la matriz está sin validar.
     3. Alta, edición, retirada y borrado de un componente.
     4. Que las casillas de seguridad se marcan solas sin perder nada.
     5. El puente con el expediente, en los dos sentidos.
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
const ctx = await nav.newContext({ viewport:{width:1320,height:1800}, locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    db.ajustes.push({ clave:'empresa', valor:{
      razon_social:'Ariza Puertas y Automatismos S.L.U.', nif:'B72004849',
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
await pag.waitForTimeout(1700);

let ok = 0, mal = 0;
const paso = (t, bien, extra='') => { bien ? ok++ : mal++;
  console.log((bien?'  OK  ':' FALLA ')+t+(extra!==''&&extra!==undefined?' → '+String(extra):'')); };
const bloque = t => console.log('\n· '+t);
const T = (f, arg) => arg === undefined ? pag.evaluate(f) : pag.evaluate(f, arg);
const esperar = (ms=350) => pag.waitForTimeout(ms);

/* ================================================================
   1. Qué componentes le tocan a cada puerta
   ================================================================ */
bloque('1. Qué componentes le tocan a cada puerta');

const seccional = await T(() => {
  const g = window.__T;
  const p = g.S.puertas.find(x => x.codigo === 'AR-0002');   // Seccional
  const m = g.componentesMinimos(p);
  return { familia: m.familia, aviso: m.aviso, proteccion: m.proteccion,
           claves: m.todos.map(x => x.clave), porques: m.todos.map(x => x.porque) };
});
paso('una seccional sin expediente se trata como industrial',
  seccional.familia === 'industrial', seccional.familia);
paso('le tocan los componentes propios de la familia',
  ['motor','cuadro','desbloqueo','placa'].every(c => seccional.claves.includes(c)),
  seccional.claves.join(','));
paso('y el paracaídas, por ser de maniobra vertical',
  seccional.claves.includes('paracaidas'));
paso('cada componente dice de dónde sale',
  seccional.porques.every(p => p && p.length > 10));
paso('sin expediente no se inventa qué protección le toca',
  !seccional.claves.includes('fotocelulas') && !seccional.claves.includes('banda'),
  seccional.claves.filter(c => ['fotocelulas','banda','limitador'].includes(c)).join(',') || '(ninguno)');
paso('y lo dice en vez de callárselo',
  /no tiene todavía ningún expediente/.test(seccional.aviso), seccional.aviso.slice(0, 80));

const corredera = await T(() => {
  const g = window.__T;
  const p = g.S.puertas.find(x => x.codigo === 'AR-0001');   // Corredera
  return g.componentesMinimos(p).todos.map(x => x.clave);
});
paso('una corredera no lleva paracaídas: no puede caerse encima de nadie',
  !corredera.includes('paracaidas'), corredera.join(','));

/* Con expediente, la matriz entra en juego */
const conMatriz = await T(() => {
  const g = window.__T, S = g.S;
  const p = S.puertas.find(x => x.codigo === 'AR-0002');
  S.expedientes.push({ id:'xp-prueba', puerta_id:p.id, familia:'industrial',
    creado:new Date().toISOString(),
    datos:{ puerta:{ modo:'impulso_sin_vista', usuarios:'no_informados' } } });
  const m = g.componentesMinimos(p);
  S.expedientes.pop();
  return { claves: m.todos.map(x => x.clave), aviso: m.aviso,
           porque: (m.todos.find(x => x.clave === 'fotocelulas')||{}).porque,
           prot: m.proteccion };
});
paso('con un expediente que dice el modo de accionamiento, la matriz entra',
  !!conMatriz.prot, JSON.stringify(conMatriz.prot));
paso('un impulso sin vista para personas no informadas pide limitación de fuerza',
  conMatriz.claves.includes('limitador'));
paso('y detección de presencia',
  conMatriz.claves.includes('fotocelulas'));
paso('diciendo el nivel y la combinación de la que sale',
  /Nivel D/.test(conMatriz.porque||'') && /no informadas/.test(conMatriz.porque||''),
  conMatriz.porque);
paso('Y AVISANDO de que la matriz está sin validar: no acredita por sí sola',
  /PENDIENTE DE VALIDAR/.test(conMatriz.aviso), conMatriz.aviso.slice(0, 90));

const peatonal = await T(() => {
  const g = window.__T, S = g.S;
  const p = S.puertas.find(x => x.codigo === 'AR-0001');
  S.expedientes.push({ id:'xp-pea', puerta_id:p.id, familia:'peatonal',
    creado:new Date().toISOString(), datos:{} });
  const m = g.componentesMinimos(p);
  S.expedientes.pop();
  return { familia: m.familia, claves: m.todos.map(x => x.clave), aviso: m.aviso };
});
paso('una peatonal manda sobre el tipo: la familia la fija el expediente',
  peatonal.familia === 'peatonal', peatonal.familia);
paso('y pide lo suyo: radares, presencia y apertura antipánico',
  ['radar_ext','radar_int','presencia','breakout'].every(c => peatonal.claves.includes(c)),
  peatonal.claves.join(','));
paso('la matriz no se le aplica, y se dice',
  /no se rige por la matriz/.test(peatonal.aviso), peatonal.aviso.slice(0, 70));

/* ================================================================
   2. Alta, edición y retirada
   ================================================================ */
bloque('2. Alta, edición y retirada de un componente');

await pag.click('#tabs button[data-tab="puertas"]'); await esperar(500);
await pag.locator('#vista .item:has-text("Talleres Guadalete")').first().click(); await esperar(800);
paso('la ficha de la puerta tiene su apartado de componentes',
  await pag.locator('#vista .panel:has(h3:text-is("Componentes"))').count() === 1);
paso('dice que no hay ninguno todavía',
  /Todavía no hay ningún componente/.test(await pag.textContent('#vista .panel:has(h3:text-is("Componentes"))')));
paso('y ofrece añadir los que faltan',
  await pag.locator('[data-act="comp-minimos"]').count() === 1);

await pag.click('[data-act="comp-nuevo"]'); await esperar(700);
paso('el alta de componente deja elegir qué es', await pag.locator('#o-clave').count() === 1);
paso('y pide marca, modelo y número de serie',
  await pag.locator('#o-marca').count() === 1 && await pag.locator('#o-modelo').count() === 1 &&
  await pag.locator('#o-serie').count() === 1);
paso('más la fecha en que se puso', await pag.locator('#o-fecha').count() === 1);
await pag.selectOption('#o-clave', 'fotocelulas'); await esperar(250);
await pag.fill('#o-marca', 'Erreka');
await pag.fill('#o-modelo', 'FT-20');
await pag.fill('#o-serie', 'SN-0099');
await pag.fill('#o-fecha', '2026-03-15');
await pag.fill('#o-notas', 'Par inferior a 40 cm del suelo');
const nombreAuto = await T(() => document.getElementById('o-nombre').value);
await pag.click('#dlg button[type="submit"]'); await esperar(1400);

const alta = await T(() => {
  const g = window.__T;
  const p = g.S.puertas.find(x => x.codigo === 'AR-0002');
  const c = g.componentesDe(p.id)[0];
  return c ? { nombre: c.nombre, marca: c.marca, modelo: c.modelo, serie: c.num_serie,
               fecha: c.fecha_instalacion, clave: c.clave, activo: c.activo,
               seguridad: p.seguridad } : null;
});
paso('el componente se da de alta', !!alta);
paso('con su marca y modelo', alta.marca === 'Erreka' && alta.modelo === 'FT-20');
paso('con su número de serie', alta.serie === 'SN-0099', alta.serie);
paso('con la fecha en que se puso', alta.fecha === '2026-03-15', alta.fecha);
paso('y el nombre se pone solo al elegir qué es',
  /Fotocélulas/i.test(nombreAuto || alta.nombre), nombreAuto || alta.nombre);
paso('Y LA CASILLA DE SEGURIDAD SE MARCA SOLA',
  (alta.seguridad||[]).includes('Fotocélulas'), JSON.stringify(alta.seguridad));

await pag.click('#tabs button[data-tab="puertas"]'); await esperar(400);
await pag.locator('#vista .item:has-text("Talleres Guadalete")').first().click(); await esperar(700);
const tabla = await pag.textContent('#vista .panel:has(h3:text-is("Componentes"))');
paso('la ficha enseña el componente con sus datos',
  /Erreka/.test(tabla) && /FT-20/.test(tabla) && /SN-0099/.test(tabla));

await pag.locator('[data-act="comp-editar"]').first().click(); await esperar(700);
await pag.check('#o-retirado'); await esperar(200);
await pag.fill('#o-rmotivo', 'Sustituida por avería'); await esperar(200);
await pag.click('#dlg button[type="submit"]'); await esperar(1400);
const retirado = await T(() => {
  const g = window.__T;
  const p = g.S.puertas.find(x => x.codigo === 'AR-0002');
  const c = g.componentesDe(p.id)[0];
  return { activo: c.activo, fecha: c.retirado_el, motivo: c.retirado_motivo };
});
paso('un componente retirado no se borra: se marca', retirado.activo === false);
paso('con la fecha puesta sola', !!retirado.fecha, retirado.fecha);
paso('y el motivo', retirado.motivo === 'Sustituida por avería');

/* ================================================================
   3. Añadir los que faltan
   ================================================================ */
bloque('3. Añadir de una vez los que faltan');

await pag.click('#tabs button[data-tab="puertas"]'); await esperar(400);
await pag.locator('#vista .item:has-text("Talleres Guadalete")').first().click(); await esperar(700);
const antes = await T(() => {
  const g = window.__T;
  const p = g.S.puertas.find(x => x.codigo === 'AR-0002');
  return g.componentesDe(p.id).length;
});
await pag.click('[data-act="comp-minimos"]'); await esperar(400);
await pag.click('[data-act="comp-minimos"]'); await esperar(1600);
const despues = await T(() => {
  const g = window.__T;
  const p = g.S.puertas.find(x => x.codigo === 'AR-0002');
  const cs = g.componentesDe(p.id);
  return { n: cs.length, vacios: cs.filter(c => !c.marca && !c.modelo).length,
           claves: cs.map(c => c.clave) };
});
paso('añade de una vez los que faltaban', despues.n > antes, antes+' → '+despues.n);
paso('y los deja EN BLANCO: la aplicación no se inventa de qué marca son',
  despues.vacios >= despues.n - 1, despues.vacios+' de '+despues.n+' sin marca');
paso('sin duplicar el que ya estaba',
  despues.claves.filter(c => c === 'fotocelulas').length === 1);

/* ================================================================
   4. El puente con el expediente
   ================================================================ */
bloque('4. El puente con el expediente');

const puente = await T(async () => {
  const g = window.__T, S = g.S;
  const p = S.puertas.find(x => x.codigo === 'AR-0002');
  /* un componente con datos, para ver si llegan al expediente */
  const cuadro = g.componentesDe(p.id).find(c => c.clave === 'cuadro');
  await g.sb.from('componentes')
    .update({ marca:'Erreka', modelo:'CT-102', num_serie:'CU-77' }).eq('id', cuadro.id);
  await g.cargar();

  const { data: exp } = await g.sb.from('expedientes').insert({
    referencia:'EXP-PRUEBA-COMP', puerta_id:p.id, cliente_id:p.cliente_id,
    situacion:'adecuacion', familia:'industrial', estado:'borrador',
    datos:{ comp:{ motor:{ estado:'si', marca:'Ya escrito a mano' } } },
    creado:new Date().toISOString(),
  }).select().maybeSingle();
  await g.cargar();

  await g.expTraerComponentes(exp.id);
  const e2 = g.S.expedientes.find(x => x.id === exp.id);
  return { cuadro: (e2.datos.comp||{}).cuadro,
           motor: (e2.datos.comp||{}).motor,
           expId: exp.id, puertaId: p.id };
});
paso('traer del inventario rellena el expediente',
  puente.cuadro && puente.cuadro.marca === 'Erreka', JSON.stringify(puente.cuadro));
paso('con el modelo y el número de serie',
  puente.cuadro.modelo === 'CT-102' && puente.cuadro.serie === 'CU-77');
paso('y lo deja como instalado', puente.cuadro.estado === 'si');
paso('LO QUE YA ESTABA ESCRITO A MANO NO SE PISA',
  puente.motor.marca === 'Ya escrito a mano', puente.motor.marca);

const vuelta = await T(async id => {
  const g = window.__T;
  const e = g.expDe(id);
  e.datos.comp = e.datos.comp || {};
  e.datos.comp.banda = { estado:'si', marca:'Fraba', modelo:'OSE-C', serie:'BS-12' };
  await g.sb.from('expedientes').update({ datos: e.datos }).eq('id', id);
  await g.cargar();
  await g.expGuardarComponentes(id);
  const p = g.puertaDe(g.expDe(id).puerta_id);
  const inv = g.componentesDe(p.id);
  return { banda: inv.find(c => c.clave === 'banda'), seguridad: p.seguridad };
}, puente.expId);
paso('y al revés: lo rellenado en el expediente se guarda en el inventario',
  vuelta.banda && vuelta.banda.marca === 'Fraba', JSON.stringify(vuelta.banda && vuelta.banda.marca));
paso('con su modelo y número de serie',
  vuelta.banda.modelo === 'OSE-C' && vuelta.banda.num_serie === 'BS-12');
paso('y la seguridad de la puerta se pone al día',
  (vuelta.seguridad||[]).includes('Banda de seguridad'), JSON.stringify(vuelta.seguridad));

/* ================================================================
   5. Lo que ya estaba marcado a mano no se pierde
   ================================================================ */
bloque('5. Lo que estaba marcado a mano');

const manual = await T(async () => {
  const g = window.__T;
  const p = g.S.puertas.find(x => x.codigo === 'AR-0001');
  await g.sb.from('puertas').update({ seguridad:['Semáforo','Baliza'] }).eq('id', p.id);
  await g.cargar();
  const p2 = g.puertaDe(p.id);
  await g.sb.from('componentes').insert({ puerta_id:p.id, clave:'banda',
    nombre:'Banda de seguridad', marca:'X', activo:true });
  await g.cargar();
  await g.sincronizarSeguridad(p.id);
  await g.cargar();
  return { antes: p2.seguridad, despues: g.puertaDe(p.id).seguridad };
});
paso('lo marcado a mano sigue estando',
  ['Semáforo','Baliza'].every(x => (manual.despues||[]).includes(x)),
  JSON.stringify(manual.despues));
paso('y se le suma lo que viene de los componentes',
  (manual.despues||[]).includes('Banda de seguridad'));

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
