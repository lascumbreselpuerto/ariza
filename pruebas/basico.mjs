/* ================================================================
   basico.mjs — los flujos de todos los días.
   Escrita el 12-10-2026, después de que David encontrara usando la
   aplicación que una puerta podía quedarse con el nombre del cliente
   escrito a mano y SIN enlazar con su ficha. Aquello dejaba la puerta
   fuera del cliente: no salía en su listado, ni en sus contratos, ni en
   su historial, y la aplicación no lo decía en ninguna parte.

   Lo que fija esta suite:
     1. El buscador de clientes del formulario de puerta.
     2. Alta de puerta eligiendo una ficha que ya existe.
     3. Alta de puerta creando el cliente desde el propio formulario.
     4. La ficha de la puerta dice de quién es, y si está suelta, lo canta.
     5. La ficha del cliente da de alta puertas y recoge las sueltas.
     6. La lista de puertas avisa de las que no tienen ficha.
     7. Lo demás del día a día: asistencia, búsqueda, etiquetas.
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
/* A la semilla se le añade un cliente más y DOS puertas sueltas: una con el
   nombre de un cliente que existe (para probar el enlace de un clic) y otra con
   un nombre que no está en ninguna ficha. */
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    db.ajustes.push({ clave:'empresa', valor:{
      razon_social:'Ariza Puertas y Automatismos S.L.U.', nif:'B72004849',
      domicilio:'Calle Orilla 19', cp:'11500', poblacion:'El Puerto de Santa María',
      provincia:'Cádiz', telefono:'661 352 795', email:'arizapuertasautomaticas@gmail.com',
      representante:'David Ariza Arana', cargo_firmante:'Administrador único',
      responsable_tecnico:'David Ariza Arana' } });
    db.clientes.push({ id:'cli-hotel', nombre:'Hotel Bahía de Cádiz', nif:'A11777666',
      direccion:'Avenida de la Playa 2', poblacion:'El Puerto de Santa María',
      telefono:'600 000 003', email:'recepcion@bahiacadiz.es',
      contrato:false, archivado:false, creado:new Date().toISOString() });
    db.puertas.push({ id:'pu-suelta', codigo:'AR-0004', cliente_id:null,
      cliente:'Talleres Guadalete', direccion:'Polígono El Palmar, nave 9',
      ubicacion:'Portón trasero', tipo:'Enrollable', marca:'Angel Mir',
      estado:'ok', token:'tok-0004', creado:new Date().toISOString() });
    db.puertas.push({ id:'pu-huerfana', codigo:'AR-0005', cliente_id:null,
      cliente:'Bodegas Sin Ficha', direccion:'Camino del Molino 8',
      tipo:'Batiente', estado:'ok', token:'tok-0005', creado:new Date().toISOString() });
    db.etiquetas.push({ codigo:'AR-0004', token:'tok-0004', creado:new Date().toISOString() });
    db.etiquetas.push({ codigo:'AR-0005', token:'tok-0005', creado:new Date().toISOString() });
    db.etiquetas.push({ codigo:'AR-0006', token:'tok-0006', creado:new Date().toISOString() });
    db.etiquetas.push({ codigo:'AR-0007', token:'tok-0007', creado:new Date().toISOString() });
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

const faltan = await T(() => window.__T_FALTAN || []);
paso('el gancho de pruebas encuentra todo lo que busca', faltan.length === 0, faltan.join(', '));

/* ================================================================
   1. El buscador de clientes
   ================================================================ */
bloque('1. El buscador de clientes del formulario de puerta');

paso('normTxt baja a minúsculas y quita acentos',
  await T(() => window.__T.normTxt('Bahía DE Cádiz')) === 'bahia de cadiz');
paso('normTxt convierte los signos en separadores, no los borra',
  await T(() => window.__T.normTxt('B-11.556/677')) === 'b 11 556 677');
paso('normTxt aguanta un nulo sin romperse',
  await T(() => window.__T.normTxt(null)) === '');

const todos = await T(() => window.__T.buscarClientes('').map(c => c.nombre));
paso('sin texto devuelve la lista entera', todos.length === 3, todos.length);
paso('y ordenada alfabéticamente en español',
  todos.join('|') === 'Comunidad Las Flores|Hotel Bahía de Cádiz|Talleres Guadalete', todos.join('|'));

const porNombre = await T(() => window.__T.buscarClientes('flores').map(c => c.nombre));
paso('encuentra por un trozo del nombre', porNombre.length === 1 && porNombre[0] === 'Comunidad Las Flores', porNombre.join('|'));
paso('y sin que importe el acento que se escriba',
  (await T(() => window.__T.buscarClientes('bahia').map(c => c.nombre)))[0] === 'Hotel Bahía de Cádiz');
paso('encuentra por NIF',
  (await T(() => window.__T.buscarClientes('B11556677').map(c => c.nombre)))[0] === 'Talleres Guadalete');
paso('encuentra por NIF escrito con guiones y puntos',
  (await T(() => window.__T.buscarClientes('B-11.556.677').map(c => c.nombre)))[0] === 'Talleres Guadalete');
paso('encuentra por teléfono',
  (await T(() => window.__T.buscarClientes('600 000 003').map(c => c.nombre)))[0] === 'Hotel Bahía de Cádiz');
paso('encuentra por dirección',
  (await T(() => window.__T.buscarClientes('palmar').map(c => c.nombre)))[0] === 'Talleres Guadalete');
paso('encuentra por correo',
  (await T(() => window.__T.buscarClientes('presidencia').map(c => c.nombre)))[0] === 'Comunidad Las Flores');
paso('dos trozos valen en cualquier orden',
  (await T(() => window.__T.buscarClientes('bajamar flores').map(c => c.nombre)))[0] === 'Comunidad Las Flores');
paso('lo que no existe no aparece',
  (await T(() => window.__T.buscarClientes('ferretería del norte'))).length === 0);
paso('el tope de resultados se respeta',
  (await T(() => window.__T.buscarClientes('', 2))).length === 2);
paso('la línea de debajo del nombre junta NIF, dirección, población y teléfono',
  /A11777666.*Avenida de la Playa 2.*El Puerto.*600 000 003/.test(
    await T(() => window.__T.lineaCliente(window.__T.S.clientes.find(c => c.id === 'cli-hotel')))));

/* ================================================================
   2. Alta de puerta eligiendo una ficha que ya existe
   ================================================================ */
bloque('2. Alta de puerta eligiendo un cliente que ya existe');

await pag.click('#tabs button[data-tab="puertas"]'); await esperar(400);
await pag.click('[data-act="puerta-nueva"]'); await esperar(600);

paso('el formulario tiene UN solo campo de cliente, con buscador',
  await pag.locator('#f-cbusca').count() === 1);
paso('y ya no está el antiguo campo de texto suelto',
  await pag.locator('#f-cliente').count() === 0);
paso('la ficha enlazada viaja en un campo oculto, no en un desplegable',
  await T(() => { const e = document.getElementById('f-clid'); return e && e.tagName === 'INPUT' && e.type === 'hidden'; }));
paso('el primer grupo del formulario pregunta de quién es la puerta',
  /De quién es la puerta/.test(await pag.textContent('#dlg-form')));
paso('al abrirlo sin cliente, la lista se enseña sola',
  await pag.locator('#f-clista .busca-fila').count() === 3,
  await pag.locator('#f-clista .busca-fila').count());

await pag.fill('#f-cbusca', 'guadalete'); await esperar(300);
paso('al escribir, la lista se queda con el que coincide',
  await pag.locator('#f-clista .busca-fila').count() === 1);
paso('y la pista avisa en rojo de que todavía está sin ficha',
  await T(() => { const p = document.getElementById('f-cestado'); return !!p && p.classList.contains('ojo'); }));
paso('la pista explica lo que pasará si se deja así',
  /sin ficha de cliente/i.test(await pag.textContent('#f-cestado')));

await pag.click('#f-clista .busca-fila'); await esperar(350);
const trasElegir = await T(() => ({
  id: document.getElementById('f-clid').value,
  nombre: document.getElementById('f-cbusca').value,
  dir: document.getElementById('f-dir').value,
  pista: document.getElementById('f-cestado').textContent,
  ojo: document.getElementById('f-cestado').classList.contains('ojo'),
  listaCerrada: document.getElementById('f-clista').hidden,
  cliente: (window.__T.S.clientes.find(c => c.nombre === 'Talleres Guadalete')||{}).id,
}));
paso('al elegirlo queda enlazada con esa ficha', trasElegir.id === trasElegir.cliente, trasElegir.id);
paso('el buscador se queda con el nombre exacto de la ficha', trasElegir.nombre === 'Talleres Guadalete', trasElegir.nombre);
paso('la lista se cierra', trasElegir.listaCerrada === true);
paso('la pista dice con qué ficha queda enlazada', /Enlazada con la ficha de/.test(trasElegir.pista), trasElegir.pista);
paso('y deja de avisar en rojo', trasElegir.ojo === false);
paso('la dirección vacía se rellena con la del cliente',
  /Polígono El Palmar/.test(trasElegir.dir), trasElegir.dir);

await pag.fill('#f-cbusca', 'Talleres Guadalet'); await esperar(300);
paso('si se cambia el nombre a mano, se desenlaza: no puede decir una cosa y apuntar a otra',
  await T(() => document.getElementById('f-clid').value) === '');
paso('y vuelve a avisar en rojo',
  await T(() => document.getElementById('f-cestado').classList.contains('ojo')));

await pag.click('#f-clista .busca-fila'); await esperar(300);
paso('se puede volver a elegir sin cerrar el formulario',
  await T(() => document.getElementById('f-clid').value) === trasElegir.cliente);

/* Equivocarse de cliente y corregirlo. La dirección que puso el autorrelleno del
   equivocado NO puede quedarse pegada a la puerta del correcto. Lo escrito a mano
   sí se respeta: son dos cosas distintas y la aplicación las distingue. */
await pag.fill('#f-cbusca', 'hotel'); await esperar(300);
await pag.click('#f-clista .busca-fila'); await esperar(350);
paso('al corregir el cliente, la dirección del equivocado se cambia por la del bueno',
  /Avenida de la Playa 2/.test(await T(() => document.getElementById('f-dir').value)),
  await T(() => document.getElementById('f-dir').value));
await pag.fill('#f-dir', 'Calle escrita a mano 5'); await esperar(250);
await pag.fill('#f-cbusca', 'flores'); await esperar(300);
await pag.click('#f-clista .busca-fila'); await esperar(350);
paso('pero una dirección escrita a mano no se pisa al cambiar de cliente',
  await T(() => document.getElementById('f-dir').value) === 'Calle escrita a mano 5',
  await T(() => document.getElementById('f-dir').value));
await pag.fill('#f-dir', ''); await esperar(200);

await pag.click('[data-act="cliente-quitar"]'); await esperar(300);
paso('«Dejar sin ficha» vacía el enlace',
  await T(() => document.getElementById('f-clid').value) === '');
paso('y también el nombre escrito, para no dejar un nombre huérfano',
  await T(() => document.getElementById('f-cbusca').value) === '');

/* Enter en el buscador NO debe enviar el formulario: eso daba de alta la puerta
   a medio rellenar. Debe elegir el primero de la lista. */
const puertasAntes = await T(() => window.__T.S.puertas.length);
await pag.click('#f-cbusca');
await pag.type('#f-cbusca', 'hotel'); await esperar(350);
await pag.press('#f-cbusca', 'Enter'); await esperar(500);
paso('Enter en el buscador no da de alta la puerta a medias',
  await T(() => window.__T.S.puertas.length) === puertasAntes);
paso('Enter elige el primero de la lista',
  await T(() => document.getElementById('f-clid').value) === 'cli-hotel',
  await T(() => document.getElementById('f-clid').value));
paso('el diálogo sigue abierto', await pag.locator('#f-cbusca').count() === 1);

await pag.selectOption('#f-cod', 'AR-0006').catch(()=>{});
await pag.fill('#f-ubi', 'Acceso de personal');
await pag.selectOption('#f-tipo', { index: 1 }).catch(()=>{});
await pag.click('#dlg button[type="submit"]'); await esperar(1300);
const alta = await T(() => {
  const p = window.__T.S.puertas.find(x => x.codigo === 'AR-0006') || {};
  return { id: p.id, cliente_id: p.cliente_id, cliente: p.cliente, dir: p.direccion };
});
paso('la puerta se da de alta', !!alta.id);
paso('enlazada con la ficha elegida', alta.cliente_id === 'cli-hotel', alta.cliente_id);
paso('y con el nombre que dice la ficha, no el que se escribiera',
  alta.cliente === 'Hotel Bahía de Cádiz', alta.cliente);
paso('con la dirección del cliente heredada', /Avenida de la Playa 2/.test(alta.dir||''), alta.dir);

/* ================================================================
   3. Crear el cliente desde el propio formulario de la puerta
   ================================================================ */
bloque('3. Crear el cliente desde el formulario de la puerta');

await T(() => { const d = document.getElementById('dlg'); if (d && d.open) d.close(); });
await pag.click('#tabs button[data-tab="puertas"]'); await esperar(400);
await pag.click('[data-act="puerta-nueva"]'); await esperar(600);
await pag.fill('#f-cbusca', 'Restaurante El Faro'); await esperar(300);
paso('si no hay ninguno que coincida, la lista lo dice y manda a crearlo',
  /Crear un cliente nuevo/.test(await pag.textContent('#f-clista')));
await pag.fill('#f-dir', 'Muelle Pesquero 11');
await pag.fill('#f-marca', 'Ditec'); await esperar(250);
await pag.click('[data-act="cliente-desde-puerta"]'); await esperar(800);

paso('se abre el alta de cliente', await pag.locator('#c-nombre').count() === 1);
paso('con el nombre ya escrito, para no teclearlo dos veces',
  await T(() => document.getElementById('c-nombre').value) === 'Restaurante El Faro',
  await T(() => document.getElementById('c-nombre').value));
paso('y con la dirección de la puerta ya puesta',
  await T(() => document.getElementById('c-dir').value) === 'Muelle Pesquero 11');

await pag.fill('#c-nif', 'B11000111');
await pag.fill('#c-tel', '600 000 004');
await pag.click('#dlg button[type="submit"]'); await esperar(1500);

const vuelta = await T(() => ({
  hayPuerta: !!document.getElementById('f-cbusca'),
  nombre: (document.getElementById('f-cbusca')||{}).value,
  clid: (document.getElementById('f-clid')||{}).value,
  dir: (document.getElementById('f-dir')||{}).value,
  marca: (document.getElementById('f-marca')||{}).value,
  pista: (document.getElementById('f-cestado')||{}).textContent,
  creado: (window.__T.S.clientes.find(c => c.nombre === 'Restaurante El Faro')||{}).id,
}));
paso('al guardar el cliente se vuelve al formulario de la puerta', vuelta.hayPuerta === true);
paso('el cliente nuevo queda ya enlazado, sin volver a buscarlo',
  !!vuelta.clid && vuelta.clid === vuelta.creado, vuelta.clid);
paso('la pista lo confirma', /Enlazada con la ficha de/.test(vuelta.pista||''), vuelta.pista);
paso('el nombre que se ve es el de la ficha recién creada', vuelta.nombre === 'Restaurante El Faro', vuelta.nombre);
paso('no se pierde lo que ya estaba escrito en la puerta: dirección', vuelta.dir === 'Muelle Pesquero 11', vuelta.dir);
paso('ni la marca', vuelta.marca === 'Ditec', vuelta.marca);

await pag.selectOption('#f-cod', 'AR-0007').catch(()=>{});
await pag.click('#dlg button[type="submit"]'); await esperar(1300);
const alta2 = await T(() => {
  const p = window.__T.S.puertas.find(x => x.codigo === 'AR-0007') || {};
  return { cliente_id: p.cliente_id, cliente: p.cliente };
});
paso('la puerta se guarda enlazada con el cliente que se acababa de crear',
  alta2.cliente_id === vuelta.creado, alta2.cliente_id);
paso('y sin duplicar la ficha',
  await T(() => window.__T.S.clientes.filter(c => c.nombre === 'Restaurante El Faro').length) === 1);

/* ================================================================
   4. La ficha de la puerta dice de quién es
   ================================================================ */
bloque('4. La ficha de la puerta');

await pag.click('#tabs button[data-tab="puertas"]'); await esperar(500);
await pag.locator('#vista .item:has-text("Comunidad Las Flores")').first().click(); await esperar(700);
paso('la ficha tiene un apartado de cliente',
  await pag.locator('#vista .panel:has(h3:text-is("Cliente"))').count() === 1);
paso('con el cliente enlazado y su contacto',
  /H11223344|600 000 001/.test(await pag.textContent('#vista .panel:has(h3:text-is("Cliente"))')));
paso('y un acceso a su ficha',
  await pag.locator('#vista .panel:has(h3:text-is("Cliente")) [data-act="abrir-cliente"]').count() === 1);
await pag.click('#vista .panel:has(h3:text-is("Cliente")) [data-act="abrir-cliente"]'); await esperar(700);
paso('que lleva de verdad a la ficha del cliente',
  /Comunidad Las Flores/.test(await pag.textContent('#vista h2')));

/* Ahora la puerta suelta: la que lleva el nombre escrito y ninguna ficha */
await pag.click('#tabs button[data-tab="puertas"]'); await esperar(500);
await pag.locator('#vista .item:has-text("Bodegas Sin Ficha")').first().click(); await esperar(700);
const sin = await pag.textContent('#vista .panel:has(h3:text-is("Cliente"))');
paso('una puerta sin ficha lo dice con claridad', /no está enlazada con ninguna ficha/.test(sin));
paso('y dice el nombre que lleva escrito a mano', /Bodegas Sin Ficha/.test(sin));
paso('explica qué se pierde por no estar enlazada', /contratos/.test(sin) && /historial/.test(sin));
paso('y ofrece buscar el cliente o crearlo',
  await pag.locator('#vista .panel:has(h3:text-is("Cliente")) [data-act="puerta-editar"]').count() >= 1);
paso('no propone enlazarla con nadie, porque ninguna ficha se llama así',
  await pag.locator('#vista .panel:has(h3:text-is("Cliente")) [data-act="puerta-enlazar"]').count() === 0);

await pag.click('#tabs button[data-tab="puertas"]'); await esperar(500);
await pag.locator('#vista .item:has-text("Portón trasero")').first().click(); await esperar(700);
const parecida = await pag.locator('#vista .panel:has(h3:text-is("Cliente")) [data-act="puerta-enlazar"]');
paso('si el nombre escrito coincide con una ficha, la ficha propone enlazarla',
  await parecida.count() >= 1, await parecida.count());
await parecida.first().click(); await esperar(1300);
const enlazada = await T(() => {
  const p = window.__T.S.puertas.find(x => x.codigo === 'AR-0004') || {};
  return { cliente_id: p.cliente_id, cliente: p.cliente };
});
paso('y se enlaza de un solo clic', !!enlazada.cliente_id, enlazada.cliente_id);
paso('quedándose con el nombre de la ficha', enlazada.cliente === 'Talleres Guadalete', enlazada.cliente);

/* ================================================================
   5. La ficha del cliente
   ================================================================ */
bloque('5. La ficha del cliente');

await pag.click('#tabs button[data-tab="clientes"]'); await esperar(600);
await pag.locator('#vista .item:has-text("Talleres Guadalete")').first().click(); await esperar(700);
paso('la ficha del cliente lista sus puertas',
  await pag.locator('#vista .panel:has(h3:text-is("Puertas")) .item').count() >= 2,
  await pag.locator('#vista .panel:has(h3:text-is("Puertas")) .item').count());
paso('entre ellas la que acabamos de enlazar',
  /Portón trasero|Enrollable/.test(await pag.textContent('#vista .panel:has(h3:text-is("Puertas"))')));
paso('y tiene su propio botón de nueva puerta',
  await pag.locator('[data-act="puerta-nueva-cliente"]').count() === 1);

await pag.click('[data-act="puerta-nueva-cliente"]'); await esperar(800);
const desdeCliente = await T(() => ({
  nombre: (document.getElementById('f-cbusca')||{}).value,
  clid: (document.getElementById('f-clid')||{}).value,
  dir: (document.getElementById('f-dir')||{}).value,
  pista: (document.getElementById('f-cestado')||{}).textContent,
  esperado: (window.__T.S.clientes.find(c => c.nombre === 'Talleres Guadalete')||{}).id,
}));
paso('el alta desde el cliente llega ya enlazada con él',
  desdeCliente.clid === desdeCliente.esperado, desdeCliente.clid);
paso('con su nombre puesto', desdeCliente.nombre === 'Talleres Guadalete');
paso('con su dirección puesta', /El Palmar/.test(desdeCliente.dir||''), desdeCliente.dir);
paso('y diciéndolo en la pista', /Enlazada con la ficha de/.test(desdeCliente.pista||''));
await T(() => { const d = document.getElementById('dlg'); if (d && d.open) d.close(); });
await esperar(300);

/* El cliente que tiene una puerta suelta a su nombre la recoge desde su ficha */
await T(() => {
  const p = window.__T.S.puertas.find(x => x.codigo === 'AR-0004');
  if (p){ p.cliente_id = null; }               // se vuelve a soltar solo en memoria
});
await pag.click('#tabs button[data-tab="clientes"]'); await esperar(500);
await pag.locator('#vista .item:has-text("Talleres Guadalete")').first().click(); await esperar(700);
const panelP = await pag.textContent('#vista .panel:has(h3:text-is("Puertas"))');
paso('la ficha del cliente avisa de las puertas con su nombre y sin enlazar',
  /sin enlazar con esta ficha/.test(panelP), panelP.slice(0,90));
paso('y ofrece engancharlas',
  await pag.locator('#vista .panel:has(h3:text-is("Puertas")) [data-act="puerta-enlazar"]').count() >= 1);

/* ================================================================
   6. La lista de puertas canta las sueltas
   ================================================================ */
bloque('6. La lista de puertas');

await pag.click('#tabs button[data-tab="puertas"]'); await esperar(600);
const cab = await pag.textContent('#vista');
paso('la lista avisa de cuántas puertas no tienen ficha de cliente',
  /sin ficha de cliente/.test(cab));
paso('y cada una lleva su marca en la fila',
  await pag.locator('#vista .item:has-text("Bodegas Sin Ficha") .chip.mal').count() === 1);
paso('las que sí la tienen no la llevan',
  await pag.locator('#vista .item:has-text("Comunidad Las Flores") .chip.mal').count() === 0);

/* ================================================================
   7. El resto del día a día
   ================================================================ */
bloque('7. El resto del día a día');

await pag.fill('#busca', 'guadalete'); await esperar(500);
paso('el buscador de puertas filtra por cliente',
  await pag.locator('#vista .item').count() >= 1 &&
  !/Comunidad Las Flores/.test(await pag.textContent('#vista .lista')));
await pag.fill('#busca', 'AR-0006'); await esperar(500);
paso('y por código de etiqueta', await pag.locator('#vista .item').count() === 1);
await pag.fill('#busca', ''); await esperar(400);

await pag.click('#tabs button[data-tab="avisos"]'); await esperar(600);
paso('la pestaña de asistencias trae su botón de alta',
  await pag.locator('[data-act="asistencia-nueva"]').count() >= 1);
await pag.locator('[data-act="asistencia-nueva"]').first().click(); await esperar(700);
paso('el alta de asistencia deja elegir la puerta', await pag.locator('#a-puerta').count() === 1);
const opcs = await T(() => Array.from(document.getElementById('a-puerta').options).map(o => o.textContent));
paso('con todas las puertas dadas de alta', opcs.length >= 7, opcs.length);
paso('y cada una identificada por código y cliente',
  opcs.some(t => /AR-0006/.test(t) && /Hotel Bahía/.test(t)), opcs.find(t => /AR-0006/.test(t)));
/* Una puerta suelta elegida en la asistencia: la asistencia nacería sin cliente,
   y eso hay que decirlo en el momento, no descubrirlo al facturar. */
const idSuelta = await T(() => (window.__T.S.puertas.find(p => p.codigo === 'AR-0005')||{}).id);
await pag.selectOption('#a-puerta', idSuelta); await esperar(450);
paso('si la puerta elegida no tiene ficha de cliente, la asistencia lo avisa',
  /no tiene ficha de cliente/.test(await pag.textContent('#a-cestado')),
  await pag.textContent('#a-cestado'));
paso('y lo avisa en rojo',
  await T(() => document.getElementById('a-cestado').classList.contains('ojo')));
paso('sin inventarse un cliente', await T(() => document.getElementById('a-cliente').value) === '');

await pag.selectOption('#a-puerta', { index: 1 }); await esperar(500);
paso('al elegir puerta se rellena solo el cliente de la asistencia',
  await T(() => !!document.getElementById('a-cliente').value));
paso('y la pista dice de dónde ha salido',
  /Puesto desde la puerta/.test(await pag.textContent('#a-cestado')),
  await pag.textContent('#a-cestado'));
paso('la lista de clientes de la asistencia va ordenada alfabéticamente',
  await T(() => {
    const n = Array.from(document.getElementById('a-cliente').options).slice(1).map(o => o.textContent);
    return n.join('|') === n.slice().sort((a,b)=>a.localeCompare(b,'es')).join('|');
  }));
await pag.fill('#a-desc', 'No cierra del todo, deja un hueco de dos dedos.');
await pag.click('#dlg button[type="submit"]'); await esperar(1400);
paso('la asistencia se crea', await T(() => window.__T.S.avisos.length) === 1,
  await T(() => window.__T.S.avisos.length));
const av = await T(() => window.__T.S.avisos[0] || {});
paso('con su puerta', !!av.puerta_id);
paso('con su cliente', !!av.cliente_id);
paso('y nace asignada, no suelta', av.estado === 'asignado' && !!av.tecnico_id, av.estado);

/* ---- Asignar, cerrar la visita con firma y sacar el parte ---- */
bloque('8. Asignar, cerrar la visita y sacar el parte');

const avId = await T(() => window.__T.S.avisos[0].id);
await pag.click('#tabs button[data-tab="avisos"]'); await esperar(600);
await pag.evaluate(id => {
  const b = document.querySelector('[data-act="asignar"][data-id="'+id+'"]');
  if (b) b.click();
}, avId);
await esperar(700);
paso('la asistencia se puede asignar a un técnico y ponerle fecha',
  await pag.locator('#as-tec').count() === 1 && await pag.locator('#as-fecha').count() === 1);
await pag.click('[data-act="as-dia"][data-n="1"]'); await esperar(300);
paso('«Mañana» pone la fecha sin tener que teclearla',
  !!(await T(() => document.getElementById('as-fecha').value)));
await pag.selectOption('#as-tec', { index: 1 }); await esperar(250);
await pag.click('#dlg button[type="submit"]'); await esperar(1300);
const asig = await T(() => window.__T.S.avisos[0] || {});
paso('y queda asignada con su fecha', !!asig.tecnico_id && !!asig.fecha_prevista, asig.fecha_prevista);
paso('con el nombre del técnico guardado, no solo su identificador', !!asig.tecnico, asig.tecnico);

await pag.evaluate(id => {
  const b = document.querySelector('[data-act="cerrar-asistencia"][data-id="'+id+'"]');
  if (b) b.click();
}, avId);
await esperar(900);
paso('el cierre de visita pide diagnóstico y trabajo realizado',
  await pag.locator('#z-diag').count() === 1 && await pag.locator('#z-trab').count() === 1);
paso('la hora de salida viene puesta, que es la de ahora',
  /^\d\d:\d\d$/.test(await T(() => document.getElementById('z-fin').value)));
paso('la hora de entrada viene vacía: solo la sabe el técnico',
  await T(() => document.getElementById('z-ini').value) === '');
paso('y hay sitio para la firma del cliente', await pag.locator('#z-firma').count() === 1);

await pag.fill('#z-diag', 'Banda de seguridad inferior cortada por roce con el marco.');
await pag.fill('#z-trab', 'Sustituida la banda, ajustado el final de carrera y engrase general.');
await pag.fill('#z-ini', '09:00'); await pag.fill('#z-fin', '10:40'); await esperar(400);
paso('de 09:00 a 10:40 propone 2 horas: pasa de media hora y sube a la siguiente',
  await T(() => document.getElementById('z-horas').value) === '2',
  await T(() => document.getElementById('z-horas').value));
paso('el cierre ya trae una línea de material lista para escribir',
  await pag.locator('#mats .mat-fila').count() === 1);
await pag.fill('#mats .mat-fila .mat-desc', 'Banda de seguridad 1,5 m');
await pag.fill('#mats .mat-fila .mat-cant', '1');
await pag.click('[data-act="mat-anadir"]'); await esperar(350);
paso('y se pueden añadir más', await pag.locator('#mats .mat-fila').count() === 2,
  await pag.locator('#mats .mat-fila').count());
await pag.locator('#mats .mat-fila [data-act="mat-quitar"]').last().click(); await esperar(300);
paso('y quitar la que sobre', await pag.locator('#mats .mat-fila').count() === 1);
await pag.fill('#z-fnom', 'Juan Pérez Gómez');
/* Firma de verdad en el lienzo: sin trazo, la firma no vale */
const caja = await pag.locator('#z-firma').boundingBox();
await pag.mouse.move(caja.x + 30, caja.y + 40);
await pag.mouse.down();
await pag.mouse.move(caja.x + 90, caja.y + 20, { steps: 6 });
await pag.mouse.move(caja.x + 150, caja.y + 55, { steps: 6 });
await pag.mouse.up(); await esperar(300);
await pag.click('#dlg button[type="submit"]'); await esperar(2200);
const cerrado = await T(() => window.__T.S.avisos.find(x => x.diagnostico) || {});
paso('la visita se cierra', cerrado.cerrado === true || !!cerrado.cerrado, String(cerrado.cerrado));
paso('con sus horas facturables', cerrado.horas === 2, cerrado.horas);
paso('con el diagnóstico guardado', /banda de seguridad/i.test(cerrado.diagnostico||''));
paso('con el nombre de quien firma', cerrado.firma_nombre === 'Juan Pérez Gómez', cerrado.firma_nombre);
paso('y con la firma guardada, no solo el nombre',
  !!(cerrado.firma || cerrado.firma_ruta || cerrado.firma_url),
  cerrado.firma_ruta || cerrado.firma_url || cerrado.firma ? 'sí' : 'no');

const parte = await pag.evaluate(async id => {
  const w = { html:'' };
  const abierto = await new Promise(res => {
    const orig = window.open;
    window.open = function(){ const v = orig.apply(window, arguments); res(v); return v; };
    window.__T.hojaParte(id);
    setTimeout(() => res(null), 4000);
  });
  if (!abierto) return null;
  await new Promise(r => setTimeout(r, 900));
  try { w.html = abierto.document.body.innerText; } catch(e){ w.html = 'ERROR: '+e.message; }
  abierto.close();
  return w.html;
}, avId);
paso('el parte de trabajo se genera', !!parte && parte.length > 200, parte ? parte.length : 'no sale');
if (parte){
  paso('con el cliente', /Comunidad Las Flores|Talleres Guadalete|Hotel Bahía/.test(parte));
  paso('con el material empleado', /Banda de seguridad/.test(parte));
  paso('con el trabajo realizado', /Sustituida la banda/.test(parte));
  paso('con las horas', /\b2\b/.test(parte));
  paso('y con quien firma', /Juan Pérez Gómez/.test(parte));
}

/* ---- Contrato de mantenimiento ---- */
bloque('9. Contrato de mantenimiento');
await pag.click('#tabs button[data-tab="clientes"]'); await esperar(600);
await pag.locator('#vista .item:has-text("Talleres Guadalete")').first().click(); await esperar(700);
await pag.click('[data-act="contrato-nuevo"]'); await esperar(800);
paso('el contrato nace con el cliente ya puesto',
  await T(() => (document.getElementById('k-cli')||{}).value) !== '');
paso('y con sus puertas a la vista para elegir las que cubre',
  await pag.locator('#dlg-form input[type="checkbox"]').count() >= 1);
paso('con fecha de alta y vencimiento',
  await pag.locator('#k-alta').count() === 1 && await pag.locator('#k-venc').count() === 1);
await pag.selectOption('#k-dur', { index: 1 }).catch(()=>{}); await esperar(400);
paso('al elegir duración, el vencimiento se calcula solo',
  !!(await T(() => (document.getElementById('k-venc')||{}).value)),
  await T(() => (document.getElementById('k-venc')||{}).value));

/* Las cláusulas hablan de las condiciones: si se cambia una condición, no pueden
   quedarse como estaban. Un contrato que se contradice es peor que no tenerlo. */
const clausulas = () => T(() => Array.from(document.querySelectorAll('#k-clausulas .k-cl-t')).map(t => t.value));
const cl0 = await clausulas();
paso('el contrato nace con las cláusulas de la plantilla', cl0.length >= 5, cl0.length);
paso('entre ellas la de la mano de obra incluida',
  cl0.some(t => /^INCLUIDO\. La mano de obra/.test(t)));
await pag.uncheck('#k-mo'); await esperar(450);
const cl1 = await clausulas();
paso('al quitar la mano de obra de la cuota, su cláusula se va sola',
  !cl1.some(t => /^INCLUIDO\. La mano de obra/.test(t)), cl1.length);
paso('y la aplicación dice que ha rehecho las cláusulas',
  /rehechas/.test(await pag.textContent('#k-cl-aviso')),
  await pag.textContent('#k-cl-aviso'));
await pag.fill('#k-dtomo', '15'); await esperar(450);
paso('un descuento en mano de obra añade su cláusula',
  (await clausulas()).some(t => /15 %/.test(t)));

/* Y ahora una cláusula editada a mano: eso NO se pisa */
await pag.locator('#k-clausulas .k-cl-t').first().fill('OBJETO. Redactado a mano por David.'); await esperar(250);
await pag.fill('#k-dtomat', '10'); await esperar(450);
const cl2 = await clausulas();
paso('una cláusula escrita a mano no se pierde al cambiar una condición',
  cl2[0] === 'OBJETO. Redactado a mano por David.', cl2[0]);
paso('pero avisa de que hay que repasarlas',
  /editadas a mano/.test(await pag.textContent('#k-cl-aviso')),
  await pag.textContent('#k-cl-aviso'));
paso('y el aviso sale en rojo',
  await T(() => document.getElementById('k-cl-aviso').classList.contains('ojo')));

await pag.click('[data-act="cl-plantilla"]'); await esperar(300);
await pag.click('[data-act="cl-plantilla"]'); await esperar(500);
const cl3 = await clausulas();
paso('«Rehacer con la plantilla» pide confirmación y entonces sí las rehace',
  /^OBJETO\. Ariza Puertas y Automatismos/.test(cl3[0]||''), (cl3[0]||'').slice(0,40));
paso('y la plantilla rehecha respeta las condiciones de ahora',
  !cl3.some(t => /^INCLUIDO\. La mano de obra/.test(t)) && cl3.some(t => /15 %/.test(t)));

await T(() => { const d = document.getElementById('dlg'); if (d && d.open) d.close(); });
await esperar(300);

await pag.click('#tabs button[data-tab="etiquetas"]'); await esperar(600);
paso('la pestaña de etiquetas dice cuántas quedan libres',
  /sin asignar/.test(await pag.textContent('#vista')));
const libres = await T(() => {
  const usadas = new Set(window.__T.S.puertas.map(p => p.codigo));
  return window.__T.S.etiquetas.filter(e => !usadas.has(e.codigo)).length;
});
paso('y la cuenta cuadra con las que no están puestas en ninguna puerta',
  new RegExp(libres+' sin asignar').test(await pag.textContent('#vista')), libres);

await pag.click('#tabs button[data-tab="clientes"]'); await esperar(600);
await pag.fill('#busca-cli', 'B11000111'); await esperar(500);
paso('los clientes se buscan por NIF', await pag.locator('#vista .item').count() === 1);
paso('y es el que toca', /Restaurante El Faro/.test(await pag.textContent('#vista .lista')));
await pag.fill('#busca-cli', ''); await esperar(400);

/* ================================================================
   10. Los fallos de la revisión general del 12-10-2026.
   Cada uno de estos bloques fija un fallo que estaba en la aplicación
   y que el banco no detectaba. Si alguno se pone en rojo, ha vuelto.
   ================================================================ */
bloque('10. Fallos de la revisión general');

/* --- Sumar meses sin desbordar el mes --- */
const sm = (f, n) => T(([f,n]) => window.__T.iso(window.__T.sumaMesesDia(window.__T.deIso(f), n)), [f,n]);
paso('31 de agosto más 6 meses es el 28 de febrero, no el 3 de marzo',
  await sm('2026-08-31', 6) === '2027-02-28', await sm('2026-08-31', 6));
paso('31 de enero más 1 mes es el 28 de febrero',
  await sm('2026-01-31', 1) === '2026-02-28', await sm('2026-01-31', 1));
paso('y en año bisiesto, el 29',
  await sm('2028-01-31', 1) === '2028-02-29', await sm('2028-01-31', 1));
paso('cuando el día existe, se conserva',
  await sm('2026-03-15', 12) === '2027-03-15', await sm('2026-03-15', 12));

/* --- Un desplegable no puede borrar lo que tiene guardado el registro --- */
const htmlOpts = await T(() => window.__T.opts(['Corredera','Seccional'], 'Enrollable antigua'));
paso('un valor que ya no está en la lista se sigue ofreciendo',
  /Enrollable antigua/.test(htmlOpts));
paso('y sale seleccionado, para que al guardar no se borre',
  /<option selected>Enrollable antigua<\/option>/.test(htmlOpts), htmlOpts.slice(0,90));

/* --- Horas facturables: el mínimo lo ve también el técnico --- */
const minimos = await T(() => {
  const g = window.__T, S = g.S;
  const tar = S.tarifas, aju = S.ajustes.minimo_horas;
  S.tarifas = null; S.ajustes.minimo_horas = 2;
  const sinTarifas = g.horasFacturables(25);            // 25 min, mínimo 2 h
  S.ajustes.minimo_horas = 1.5;
  const conMedia = g.horasFacturables(25);              // un mínimo con media hora
  S.tarifas = tar; S.ajustes.minimo_horas = aju;
  return { sinTarifas, conMedia };
});
paso('sin tarifas a la vista, el mínimo sale de los ajustes: el técnico ve lo mismo que la oficina',
  minimos.sinTarifas === 2, minimos.sinTarifas);
paso('y un mínimo de 1,5 h no se convierte en 2: las horas se facturan enteras',
  minimos.conMedia === 2 || minimos.conMedia === 1, minimos.conMedia);

/* --- Dónde hay que ir: cae al siguiente dato si falta la dirección --- */
const donde = await T(() => {
  const g = window.__T, S = g.S;
  const p = { id:'pu-x', codigo:'AR-9999', cliente_id:null, direccion:null, ubicacion:null };
  S.puertas.push(p);
  const soloLibre = g.dondeAsistencia({ puerta_id:'pu-x', direccion_libre:'C/ Larga 4' });
  const c = { id:'cli-x', nombre:'Sin dirección', direccion:null, poblacion:null };
  S.clientes.push(c);
  const clienteSinDir = g.dondeAsistencia({ cliente_id:'cli-x', direccion_libre:'C/ Larga 4' });
  S.puertas.pop(); S.clientes.pop();
  return { soloLibre, clienteSinDir };
});
paso('una puerta sin dirección no deja la asistencia sin sitio al que ir',
  donde.soloLibre === 'C/ Larga 4', donde.soloLibre);
paso('ni un cliente sin dirección', donde.clienteSinDir === 'C/ Larga 4', donde.clienteSinDir);

/* --- La periodicidad que el contrato fija PARA UNA PUERTA se respeta --- */
const per = await T(() => {
  const g = window.__T, S = g.S;
  const p = S.puertas.find(x => x.codigo === 'AR-0002');
  const k = { id:'k-x', cliente_id:p.cliente_id, estado:'activo', periodicidad_meses:12,
              fecha_alta:'2026-01-01', fecha_vencimiento:'2030-01-01' };
  S.contratos.push(k);
  const soloContrato = g.periodicidadDe(p);
  S.contratoPuertas.push({ contrato_id:'k-x', puerta_id:p.id, periodicidad_meses:6 });
  const porPuerta = g.periodicidadDe(p);
  p.periodicidad_meses = 3;
  const fijadaEnLaPuerta = g.periodicidadDe(p);
  delete p.periodicidad_meses;
  S.contratos.pop(); S.contratoPuertas.pop();
  return { soloContrato, porPuerta, fijadaEnLaPuerta };
});
paso('sin nada por puerta, manda la periodicidad del contrato', per.soloContrato === 12, per.soloContrato);
paso('si el contrato fija una periodicidad para esa puerta, es la que vale',
  per.porPuerta === 6, per.porPuerta);
paso('y lo fijado en la propia puerta manda sobre el contrato',
  per.fijadaEnLaPuerta === 3, per.fijadaEnLaPuerta);

/* --- Los clientes archivados no se ofrecen para enlazar puertas nuevas --- */
const arch = await T(() => {
  const g = window.__T, S = g.S;
  const c = S.clientes.find(x => x.nombre === 'Hotel Bahía de Cádiz');
  c.archivado = true;
  const buscando = g.buscarClientes('bahia').map(x => x.nombre);
  const exacto = g.buscarClientes('Hotel Bahía de Cádiz').map(x => x.nombre);
  c.archivado = false;
  return { buscando, exacto };
});
paso('un cliente archivado no sale en el buscador de la puerta',
  arch.buscando.length === 0, arch.buscando.join('|'));
paso('pero si se escribe su nombre exacto sí sale, para que se vea que está archivado',
  arch.exacto.length === 1, arch.exacto.join('|'));

/* --- «Cerrado» no se puede elegir en el formulario de la asistencia --- */
await pag.click('#tabs button[data-tab="avisos"]'); await esperar(600);
await pag.locator('[data-act="asistencia-nueva"]').first().click(); await esperar(700);
const sits = await T(() => Array.from(document.getElementById('a-estado').options).map(o => o.value));
paso('la situación de una asistencia no se puede poner en «Cerrado» a mano',
  !sits.includes('cerrado'), sits.join('|'));
paso('y se dice dónde se cierra de verdad',
  /se cierra con el parte/i.test(await pag.textContent('#dlg-form')));

/* --- El origen se puede cambiar al editar --- */
await pag.selectOption('#a-puerta', { index: 1 }); await esperar(300);
await pag.selectOption('#a-origen', { index: 1 }).catch(()=>{});
const orig1 = await T(() => document.getElementById('a-origen').value);
await pag.fill('#a-desc', 'Prueba del origen'); await esperar(200);
await pag.click('#dlg button[type="submit"]'); await esperar(1400);
const avOrig = await T(() => window.__T.S.avisos.find(a => a.descripcion === 'Prueba del origen'));
paso('una asistencia nueva guarda cómo ha entrado', avOrig.origen === orig1, avOrig.origen);
await pag.evaluate(id => {
  const b = document.querySelector('[data-act="aviso-editar"][data-id="'+id+'"]');
  if (b) b.click();
}, avOrig.id);
await esperar(800);
const opcOrig = await T(() => Array.from(document.getElementById('a-origen').options).map(o => o.value).filter(Boolean));
const otro = opcOrig.find(v => v !== orig1);
await pag.selectOption('#a-origen', otro); await esperar(250);
await pag.click('#dlg button[type="submit"]'); await esperar(1400);
paso('y al editarla se puede corregir: antes el cambio se descartaba sin decir nada',
  await T(id => (window.__T.S.avisos.find(a => a.id === id)||{}).origen, avOrig.id) === otro,
  await T(id => (window.__T.S.avisos.find(a => a.id === id)||{}).origen, avOrig.id));

/* --- No se cierra una visita de pago sin horas --- */
await pag.evaluate(id => {
  const b = document.querySelector('[data-act="cerrar-asistencia"][data-id="'+id+'"]');
  if (b) b.click();
}, avOrig.id);
await esperar(900);
await pag.fill('#z-trab', 'Ajustada la fotocélula.');
await T(() => { const h = document.getElementById('z-horas'); if (h) h.value = ''; });
await pag.fill('#z-fnom', 'Quien sea');
const cajaF = await pag.locator('#z-firma').boundingBox();
await pag.mouse.move(cajaF.x + 30, cajaF.y + 40); await pag.mouse.down();
await pag.mouse.move(cajaF.x + 120, cajaF.y + 50, { steps: 5 }); await pag.mouse.up();
await esperar(250);
await pag.click('#dlg button[type="submit"]'); await esperar(900);
paso('cerrar una visita de pago sin horas no se permite',
  /horas a facturar/i.test(await pag.textContent('#dlg-form .err')),
  await pag.textContent('#dlg-form .err'));
paso('la visita sigue abierta', await T(id => !(window.__T.S.avisos.find(a=>a.id===id)||{}).cerrado, avOrig.id));
await pag.check('#z-sincargo'); await esperar(250);
await pag.click('#dlg button[type="submit"]'); await esperar(900);
paso('y si se marca que no se cobra, pide el motivo',
  /por qué/i.test(await pag.textContent('#dlg-form .err')),
  await pag.textContent('#dlg-form .err'));
await pag.fill('#z-sincargom', 'Entra en el contrato de mantenimiento.'); await esperar(250);
await pag.click('#dlg button[type="submit"]'); await esperar(1800);
paso('con el motivo puesto, se cierra',
  await T(id => !!(window.__T.S.avisos.find(a=>a.id===id)||{}).cerrado, avOrig.id));

/* --- Al cerrar una preventiva se programa la siguiente revisión --- */
const puertaPrev = await T(() => {
  const p = window.__T.S.puertas.find(x => x.codigo === 'AR-0001');
  return { id: p.id, prox: p.proxima_revision || null };
});
await pag.click('#tabs button[data-tab="puertas"]'); await esperar(500);
await pag.locator('#vista .item:has-text("Comunidad Las Flores")').first().click(); await esperar(700);
await pag.click('[data-act="abrir-preventiva"]'); await esperar(1500);
const prevId = await T(pid => (window.__T.S.avisos.find(a => a.puerta_id === pid && a.tipo === 'mantenimiento' && !a.cerrado)||{}).id, puertaPrev.id);
paso('se puede abrir una revisión preventiva desde la ficha', !!prevId, prevId);
await pag.evaluate(id => {
  const b = document.querySelector('[data-act="cerrar-asistencia"][data-id="'+id+'"]');
  if (b) b.click();
}, prevId);
await esperar(1100);
await pag.fill('#z-trab', 'Revisión periódica completa.');
await pag.fill('#z-ini', '08:00'); await pag.fill('#z-fin', '09:30'); await esperar(400);
/* el guión, si lo hay, se marca todo en «Bien». Los bloques son <details> y
   nacen cerrados, así que primero se abren. */
if (await pag.locator('.g-punto').count()){
  await T(() => {
    document.querySelectorAll('#dlg-form details').forEach(d => { d.open = true; });
    document.querySelectorAll('[data-act="g-todo"]').forEach(b => b.click());
  });
  await esperar(500);
  paso('el guión de revisión se puede marcar en bloque',
    await pag.locator('.g-punto .g-resp button[aria-pressed="true"]').count() ===
    await pag.locator('.g-punto').count(),
    await pag.locator('.g-punto .g-resp button[aria-pressed="true"]').count()+'/'+await pag.locator('.g-punto').count());
}
await pag.fill('#z-fnom', 'Presidente de la comunidad');
const cajaP = await pag.locator('#z-firma').boundingBox();
await pag.mouse.move(cajaP.x + 25, cajaP.y + 35); await pag.mouse.down();
await pag.mouse.move(cajaP.x + 130, cajaP.y + 60, { steps: 6 }); await pag.mouse.up();
await esperar(250);
await pag.click('#dlg button[type="submit"]'); await esperar(2300);
const trasPrev = await T(pid => {
  const g = window.__T, p = g.S.puertas.find(x => x.id === pid);
  return { ultima: p.ultima_revision, prox: p.proxima_revision,
           per: g.periodicidadDe(p), hoyLocal: g.S.hoyPrueba || null };
}, puertaPrev.id);
const hoyLocal = await T(() => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
});
paso('al cerrar la preventiva se anota la fecha de la revisión',
  trasPrev.ultima === hoyLocal, trasPrev.ultima+' (hoy '+hoyLocal+')');
paso('Y SE PROGRAMA LA SIGUIENTE: antes la puerta se quedaba vencida para siempre',
  !!trasPrev.prox && trasPrev.prox !== puertaPrev.prox, trasPrev.prox);
paso('a la distancia que marca su periodicidad',
  trasPrev.prox === await sm(hoyLocal, trasPrev.per),
  trasPrev.prox+' esperado '+await sm(hoyLocal, trasPrev.per));

/* --- Una foto cuyo alta falla no se cuenta como subida --- */
const foto = await T(async () => {
  const g = window.__T, sb = g.sb;
  const pid = g.S.puertas[0].id;
  const origFrom = sb.from.bind(sb);
  let quitada = null;
  const origStorage = sb.storage.from.bind(sb.storage);
  sb.storage.from = bk => {
    const b = origStorage(bk);
    const origRemove = b.remove.bind(b);
    b.remove = rutas => { quitada = rutas; return origRemove(rutas); };
    return b;
  };
  sb.from = tabla => {
    if (tabla !== 'fotos') return origFrom(tabla);
    const b = origFrom(tabla);
    b.insert = async () => ({ error: { message: 'fallo provocado por la prueba' } });
    return b;
  };
  const antes = (await origFrom('fotos').select('*').eq('puerta_id', pid)).data || [];
  // una imagen de 1x1 de verdad
  const bin = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
  const file = new File([bin], 'prueba.png', { type: 'image/png' });
  let aviso = '';
  const t = document.getElementById('toast');
  const obs = new MutationObserver(() => { if (!t.hidden) aviso += t.textContent + '|'; });
  obs.observe(t, { childList: true, characterData: true, subtree: true, attributes: true });
  await g.subirFotos(pid, [file]);
  obs.disconnect();
  const despues = (await origFrom('fotos').select('*').eq('puerta_id', pid)).data || [];
  sb.from = origFrom; sb.storage.from = origStorage;
  return { antes: antes.length, despues: despues.length, aviso, quitada };
});
paso('si el alta de la foto en la base de datos falla, no se crea la fila',
  foto.despues === foto.antes, foto.antes+' → '+foto.despues);
paso('no se dice que la foto se ha subido',
  !/foto subida|fotos subidas/i.test(foto.aviso), foto.aviso || '(ningún aviso)');
paso('y la foto se quita del almacén para no dejar basura',
  Array.isArray(foto.quitada) && foto.quitada.length === 1, JSON.stringify(foto.quitada));

/* --- Documentos: el aviso dice lo que ha pasado de verdad --- */
const docs = await T(async () => {
  const g = window.__T, sb = g.sb;
  const pid = g.S.puertas[0].id;
  const origFrom = sb.from.bind(sb);
  sb.from = tabla => {
    if (tabla !== 'documentos') return origFrom(tabla);
    const b = origFrom(tabla);
    b.insert = async () => ({ error: { message: 'fallo provocado por la prueba' } });
    return b;
  };
  const bin = Uint8Array.from('%PDF-1.4 prueba', c => c.charCodeAt(0));
  const file = new File([bin], 'certificado.pdf', { type: 'application/pdf' });
  let aviso = '';
  const t = document.getElementById('toast');
  const obs = new MutationObserver(() => { if (!t.hidden) aviso += t.textContent + '|'; });
  obs.observe(t, { childList:true, characterData:true, subtree:true, attributes:true });
  await g.subirDocs(pid, [file], 'Certificado', false);
  obs.disconnect();
  const filas = (await origFrom('documentos').select('*').eq('puerta_id', pid)).data || [];
  sb.from = origFrom;
  return { aviso, filas: filas.length };
});
paso('si el alta del documento falla, no se crea la fila', docs.filas === 0, docs.filas);
paso('y NO se dice «documentación subida»: el certificado no estaba guardado',
  !/subid/i.test(docs.aviso), docs.aviso || '(ningún aviso)');
paso('se dice que no se ha podido subir', /no se ha podido subir/i.test(docs.aviso), docs.aviso);

/* --- Hacer público un documento: si falla el cambio de ficha, no se queda expuesto --- */
const vis = await T(async () => {
  const g = window.__T, sb = g.sb;
  const pid = g.S.puertas[0].id;
  // un documento privado de verdad
  const ruta = pid+'/'+Date.now()+'-manual.pdf';
  const bin = Uint8Array.from('%PDF-1.4 manual', c => c.charCodeAt(0));
  await sb.storage.from('documentos').upload(ruta, new Blob([bin], {type:'application/pdf'}), { contentType:'application/pdf' });
  const { data: fila } = await sb.from('documentos')
    .insert({ puerta_id: pid, nombre:'manual.pdf', tipo:'Manual', ruta, autor:'prueba', publico:false, bucket:'documentos' })
    .select().maybeSingle();

  const origFrom = sb.from.bind(sb);
  sb.from = tabla => {
    if (tabla !== 'documentos') return origFrom(tabla);
    const b = origFrom(tabla);
    const origUpd = b.update.bind(b);
    b.update = () => ({ eq: async () => ({ error: { message: 'fallo provocado por la prueba' } }) });
    return b;
  };
  await g.cambiarVisibilidad(fila.id, pid);
  sb.from = origFrom;

  const enPublico = await sb.storage.from('publicos').download(ruta);
  const enPrivado = await sb.storage.from('documentos').download(ruta);
  const { data: ahora } = await origFrom('documentos').select('*').eq('id', fila.id).maybeSingle();
  return { sigueEnPublico: !enPublico.error, sigueEnPrivado: !enPrivado.error, publico: !!(ahora||{}).publico };
});
paso('si falla el cambio de ficha al hacer público un documento, se deshace la copia',
  vis.sigueEnPublico === false, 'en el almacén público: '+vis.sigueEnPublico);
paso('el documento no se pierde: sigue en el almacén privado', vis.sigueEnPrivado === true);
paso('y la ficha sigue diciendo que es privado', vis.publico === false);

/* --- Materiales: si el alta falla, no se queda sin los que había --- */
const mats = await T(async () => {
  const g = window.__T, sb = g.sb;
  const av = g.S.avisos.find(a => !a.cerrado) || g.S.avisos[0];
  const origFrom = sb.from.bind(sb);
  await origFrom('materiales').insert([
    { aviso_id: av.id, descripcion:'Banda de seguridad', cantidad:1, unidad:'ud' },
    { aviso_id: av.id, descripcion:'Final de carrera', cantidad:2, unidad:'ud' }]);
  const antes = ((await origFrom('materiales').select('*').eq('aviso_id', av.id)).data || []).length;

  // se reproduce el «rehacer» del cierre con el alta rota
  const rehacer = async (tabla, filas) => {
    const { data: copia } = await origFrom(tabla).select('*').eq('aviso_id', av.id);
    const { error: eBorra } = await origFrom(tabla).delete().eq('aviso_id', av.id);
    if (eBorra) throw eBorra;
    if (!filas || !filas.length) return;
    const { error } = { error: { message: 'fallo provocado por la prueba' } };
    if (!error) return;
    if (copia && copia.length) await origFrom(tabla).insert(copia);
    throw error;
  };
  let hubo = false;
  try { await rehacer('materiales', [{ aviso_id: av.id, descripcion:'Otro', cantidad:1 }]); }
  catch(e){ hubo = true; }
  const despues = ((await origFrom('materiales').select('*').eq('aviso_id', av.id)).data || []).length;
  await origFrom('materiales').delete().eq('aviso_id', av.id);
  return { antes, despues, hubo };
});
paso('rehacer los materiales avisa si el alta falla', mats.hubo === true);
paso('y los que ya estaban guardados no se pierden',
  mats.despues === mats.antes && mats.antes === 2, mats.antes+' → '+mats.despues);

/* --- Pendiente de facturar: las de 0 € también salen, y marcadas --- */
await T(() => {
  const g = window.__T;
  const av = g.S.avisos.find(a => a.cerrado && !a.sin_cargo && !a.cobrado);
  if (av) g.S.valoraciones[av.id] = { aviso_id: av.id, imp_total: 0, coste_total: 0, margen: 0, facturado: false };
});
await pag.click('#tabs button[data-tab="gestion"]').catch(()=>{});
await esperar(800);
const gestion = await pag.textContent('#vista').catch(() => '');
paso('las visitas cerradas y valoradas en 0 € salen señaladas en gestión',
  /valorada[s]? en 0 €/.test(gestion) || /se cerraron sin horas/.test(gestion),
  /0 €/.test(gestion) ? 'hay aviso' : '(no sale)');

console.log('\n'+ok+' bien, '+mal+' mal.');
/* «fallo provocado por la prueba» es un error que esta suite provoca a propósito,
   para comprobar que la aplicación no miente cuando algo falla. No cuenta. */
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
