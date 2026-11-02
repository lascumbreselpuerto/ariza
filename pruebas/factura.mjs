/* ================================================================
   factura.mjs — cobrar no es facturar, y facturar no es cobrar.
                                                       02-11-2026

   POR QUÉ EXISTE ESTA SUITE
   Tres cosas distintas que la aplicación trataba como una o como
   ninguna:

     COBRAR EN OBRA   el técnico cobra en el momento y lo apunta.
     FACTURAR         la oficina emite la factura y la manda.
     COBRAR LA FACTURA que es lo que de verdad acaba el circuito.

   La lista de pendiente de facturar excluía lo cobrado en obra, así
   que en esta casa (se cobra en obra, factura la oficina) esas
   visitas desaparecían y no las facturaba nadie: dinero cobrado sin
   factura. Y del otro lado no había nada: una factura emitida y no
   cobrada no salía en ninguna pantalla, porque no se guardaba su
   vencimiento.

   Esta aplicación NO emite facturas ni las numera: eso se hace con
   el programa de facturación, por el reglamento antifraude. Aquí se
   apunta el número y las fechas. Esta suite también fija eso: que no
   aparezca ninguna numeración propia.
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
const errores = []; let ok = 0, mal = 0;
const paso = (t, bien, extra='') => { bien ? ok++ : mal++;
  console.log((bien?'  OK  ':' FALLA ')+t+(extra!==''&&extra!==undefined?' → '+String(extra):'')); };
const bloque = t => console.log('\n· '+t);

const ctx = await nav.newContext({ viewport:{width:1320,height:2200},
  locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    db.tarifas = [{ id:1, precio_hora:45, coste_hora:22, minimo_horas:1,
                    desplazamiento_fijo:30, precio_km:0.45, coste_km:0.2,
                    recargo_material:40, iva:21 }];
    /* Un cliente que paga a 30 días y otro que paga al contado */
    db.clientes.push(
      { id:'cli-30', nombre:'Comunidad Los Olivos', nif:'H11000001',
        plazo_pago_dias:30, forma_pago:'Transferencia' },
      { id:'cli-0',  nombre:'Particular de la esquina', nif:'11111111H' });
  };
});
const pag = await ctx.newPage();
pag.on('pageerror', e => errores.push('JS: '+e.message));
pag.on('console', m => { if (m.type() === 'error') errores.push('consola: '+m.text()); });
await pag.goto(URL_APP);
await pag.waitForTimeout(1700);
const T = (f, arg) => arg === undefined ? pag.evaluate(f) : pag.evaluate(f, arg);

/* ================================================================
   1. Cobrar en obra no es facturar
   ================================================================ */
bloque('1. Cobrar en obra no es facturar');

const cobro = await T(async () => {
  const g = window.__T;
  const hace = d => new Date(Date.now() - d*86400000).toISOString();
  const pon = async (id, cli, o, v) => {
    await g.sb.from('avisos').insert(Object.assign({ id, tipo:'averia', estado:'cerrado',
      prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:cli, horas:2,
      cerrado:hace(5), creado:hace(6) }, o));
    await g.sb.from('valoraciones').insert(Object.assign({ aviso_id:id, imp_mano_obra:90,
      imp_desplazamiento:30, imp_materiales:0, imp_total:120, coste_total:50, margen:70,
      facturado:false }, v));
  };
  /* La que se cobró en obra: es la que desaparecía */
  await pon('f-obra', 'cli-30', { cobrado:true, cobro_importe:145.20, cobro_forma:'efectivo' }, {});
  /* Una normal, sin cobrar y sin facturar */
  await pon('f-normal', 'cli-30', {}, {});
  /* Una ya facturada: esa no tiene que salir */
  await pon('f-hecha', 'cli-30', {}, { facturado:true, factura_ref:'F-2026-0001',
    facturado_el: new Date().toISOString().slice(0,10) });
  await g.cargar();

  g.S.tab = 'gestion'; g.pintar();
  await new Promise(r => setTimeout(r, 900));
  const v = document.getElementById('vista');
  const texto = v.innerText;
  return { texto,
    saleLaDeObra: !!v.querySelector('[data-act="marcar-facturado"][data-id="f-obra"]'),
    saleLaNormal: !!v.querySelector('[data-act="marcar-facturado"][data-id="f-normal"]'),
    saleLaHecha:  !!v.querySelector('[data-act="marcar-facturado"][data-id="f-hecha"]') };
});
paso('una visita cobrada en obra sigue pendiente de FACTURAR',
  cobro.saleLaDeObra === true);
paso('y la lista lo dice con su etiqueta y el importe que ya se cobró',
  /Cobrada en obra/.test(cobro.texto) && /145,20/.test(cobro.texto),
  (cobro.texto.match(/Cobrada en obra.{0,15}/)||[''])[0]);
paso('el panel explica la diferencia, que es lo que no se entendía',
  /cobrar no es facturar/i.test(cobro.texto));
paso('y dice qué pasaba antes, con su fecha',
  /desaparec/i.test(cobro.texto) && /2 de noviembre de 2026/.test(cobro.texto));
paso('la visita sin cobrar sigue saliendo, como siempre', cobro.saleLaNormal === true);
paso('y la ya facturada no sale', cobro.saleLaHecha === false);
/* El texto viejo decía «visitas que nadie ha cobrado todavía», y eso era
   justamente la confusión: la lista no es de cobros, es de facturas. */
paso('la lista ya no habla de cobros, habla de facturas',
  /sin factura/i.test(cobro.texto) && !/que nadie ha cobrado todav/i.test(cobro.texto));

/* ================================================================
   2. El plazo lo pone el cliente
   ================================================================ */
bloque('2. El plazo lo pone el cliente');

const plazos = await T(() => {
  const g = window.__T;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const iso = d => d.toISOString().slice(0,10);
  const mas = n => { const d = new Date(hoy); d.setDate(d.getDate()+n); return iso(d); };
  return {
    treinta: g.plazoDe(g.S.clientes.find(c => c.id === 'cli-30')),
    contado: g.plazoDe(g.S.clientes.find(c => c.id === 'cli-0')),
    venceCon: g.venceProponer(iso(hoy), 'cli-30'),
    venceSin: g.venceProponer(iso(hoy), 'cli-0'),
    esperado30: mas(30), esperado0: iso(hoy) };
});
paso('el plazo se lee de la ficha del cliente', plazos.treinta === 30, plazos.treinta);
paso('y un cliente sin plazo puesto es al contado', plazos.contado === null, plazos.contado);
paso('el vencimiento se propone sumando ese plazo a la fecha de la factura',
  plazos.venceCon === plazos.esperado30, plazos.venceCon+' / '+plazos.esperado30);
paso('y sin plazo, el mismo día: al contado',
  plazos.venceSin === plazos.esperado0, plazos.venceSin);

const ficha = await T(async () => {
  const g = window.__T;
  g.dlgCliente('cli-0');
  await new Promise(r => setTimeout(r, 500));
  const hay = !!document.getElementById('c-plazo');
  document.getElementById('c-plazo').value = '60';
  document.getElementById('c-forma').value = 'Pagaré';
  document.querySelector('#dlg-form [type="submit"]').click();
  await new Promise(r => setTimeout(r, 1200));
  const c = g.S.clientes.find(x => x.id === 'cli-0');
  return { hay, plazo: c.plazo_pago_dias, forma: c.forma_pago };
});
paso('la ficha del cliente tiene el campo del plazo', ficha.hay === true);
paso('y lo guarda, con su forma de pago',
  ficha.plazo === 60 && ficha.forma === 'Pagaré', ficha.plazo+' · '+ficha.forma);

/* ================================================================
   3. Apuntar la factura que se emitió fuera
   ================================================================ */
bloque('3. Apuntar la factura que se emitió fuera');

const apuntar = await T(async () => {
  const g = window.__T;
  g.dlgFacturar('f-obra');
  await new Promise(r => setTimeout(r, 600));
  const texto = document.getElementById('dlg-form').innerText;
  const venc0 = (document.getElementById('fa-vence') || {}).value;
  const cobMarcada = !!(document.getElementById('fa-cob') || {}).checked;
  /* Se cambia la fecha de la factura: el vencimiento se tiene que recalcular */
  const f = document.getElementById('fa-fecha');
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0,10);
  f.value = ayer;
  f.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 300));
  const vencTrasCambio = document.getElementById('fa-vence').value;
  /* Y si se toca a mano, ya no se pisa */
  const v = document.getElementById('fa-vence');
  v.value = '2027-03-01';
  v.dispatchEvent(new Event('change', { bubbles:true }));
  f.value = new Date().toISOString().slice(0,10);
  f.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 300));
  const vencTrasTocar = document.getElementById('fa-vence').value;

  document.getElementById('fa-ref').value = 'F-2026-0184';
  document.getElementById('fa-cob-forma').value = 'Efectivo';
  document.getElementById('fa-cob-ref').value = 'Recibo 12';
  document.querySelector('#dlg-form [type="submit"]').click();
  await new Promise(r => setTimeout(r, 1400));
  const val = (await g.sb.from('valoraciones').select('*').eq('aviso_id','f-obra')).data[0];
  const av = g.S.avisos.find(x => x.id === 'f-obra');
  return { texto, venc0, cobMarcada, vencTrasCambio, vencTrasTocar,
    cierre: String(av.cerrado || '').slice(0,10),
    ref: val.factura_ref, vence: val.vence_el, cobradoEl: val.cobrado_el,
    cobroForma: val.cobro_forma, cobroRef: val.cobro_ref, facturado: val.facturado };
});
const hoyIso = new Date().toISOString().slice(0,10);
const ayerIso = new Date(Date.now() - 86400000).toISOString().slice(0,10);
const mas30 = n => { const d = new Date(n); d.setDate(d.getDate()+30); return d.toISOString().slice(0,10); };
paso('el diálogo deja claro que la factura se emite fuera',
  /se emite con tu programa de facturación/i.test(apuntar.texto));
paso('y no propone ninguna numeración propia: el número se escribe',
  !/serie|numeraci[óo]n autom/i.test(apuntar.texto));
paso('propone el vencimiento con el plazo de ese cliente',
  apuntar.venc0 === mas30(hoyIso), apuntar.venc0);
paso('diciendo de dónde sale ese número',
  /30 días de plazo de este cliente/.test(apuntar.texto));
paso('al cambiar la fecha de la factura, el vencimiento se recalcula',
  apuntar.vencTrasCambio === mas30(ayerIso), apuntar.vencTrasCambio);
paso('pero si alguien lo escribe a mano, no se le pisa',
  apuntar.vencTrasTocar === '2027-03-01', apuntar.vencTrasTocar);
paso('avisa de que esa visita se cobró en obra y hay que facturarla igual',
  /cobró en obra/.test(apuntar.texto) && /emitirla y mandarla igual/.test(apuntar.texto));
paso('y enseña los dos importes para poder comparar lo que se cobró',
  /120,00/.test(apuntar.texto) && /145,20/.test(apuntar.texto),
  (apuntar.texto.match(/compáralo con.{0,12}/)||[''])[0]);
paso('con la casilla de cobrada ya marcada, porque el dinero está',
  apuntar.cobMarcada === true);
paso('se guarda el número de la factura que emitiste fuera',
  apuntar.ref === 'F-2026-0184' && apuntar.facturado === true, apuntar.ref);
paso('su vencimiento', apuntar.vence === '2027-03-01', apuntar.vence);
/* La fecha de cobro que se propone para una visita cobrada en obra es el día de
   la visita, que es cuando el cliente pagó de verdad. No el día en que la
   oficina se acuerda de apuntarlo: eso mueve el cobro de mes y descuadra la
   caja. */
paso('y el cobro, en la fecha en que se cobró de verdad: el día de la visita',
  apuntar.cobradoEl === apuntar.cierre,
  apuntar.cobradoEl+' (visita: '+apuntar.cierre+')');
paso('la forma y la referencia quedan tal cual se escribieron',
  apuntar.cobroForma === 'Efectivo' && apuntar.cobroRef === 'Recibo 12');

/* ================================================================
   4. Facturas vencidas sin cobrar
   ================================================================ */
bloque('4. Facturas vencidas sin cobrar');

const impag = await T(async () => {
  const g = window.__T;
  const hace = d => new Date(Date.now() - d*86400000).toISOString();
  const dIso = n => { const d = new Date(Date.now() + n*86400000); return d.toISOString().slice(0,10); };
  const pon = async (id, v) => {
    await g.sb.from('avisos').insert({ id, tipo:'averia', estado:'cerrado', prioridad:'normal',
      tecnico_id:'usuario-admin', cliente_id:'cli-30', horas:2, cerrado:hace(70), creado:hace(75) });
    await g.sb.from('valoraciones').insert(Object.assign({ aviso_id:id, imp_mano_obra:90,
      imp_desplazamiento:30, imp_materiales:0, imp_total:200, coste_total:50, margen:150 }, v));
  };
  /* Vencida hace 10 días: impagada, pero no en rojo */
  await pon('i-10', { facturado:true, factura_ref:'F-10', facturado_el:dIso(-40), vence_el:dIso(-10) });
  /* Vencida hace 45: en rojo */
  await pon('i-45', { facturado:true, factura_ref:'F-45', facturado_el:dIso(-75), vence_el:dIso(-45) });
  /* Vence dentro de 5 días: dinero en camino, no impagado */
  await pon('i-futura', { facturado:true, factura_ref:'F-FUT', facturado_el:dIso(-25), vence_el:dIso(5) });
  /* Vencida pero COBRADA */
  await pon('i-cobrada', { facturado:true, factura_ref:'F-COB', facturado_el:dIso(-60),
    vence_el:dIso(-30), cobrado_el:dIso(-2) });
  /* Facturada y SIN vencimiento apuntado: no se inventa */
  await pon('i-sinvence', { facturado:true, factura_ref:'F-SIN', facturado_el:dIso(-60) });
  await g.cargar();

  const lista = g.impagados();
  g.S.tab = 'gestion'; g.pintar();
  await new Promise(r => setTimeout(r, 900));
  const v = document.getElementById('vista');
  return { ids: lista.map(x => x.a.id), dias: lista.map(x => x.dias),
    rojos: lista.filter(x => x.rojo).map(x => x.a.id),
    enCamino: g.porCobrar().map(x => x.a.id),
    texto: v.innerText,
    botonCobro: !!v.querySelector('[data-act="marcar-facturado"][data-id="i-45"]') };
});
paso('una factura vencida y sin cobrar sale como impagada',
  impag.ids.includes('i-10') && impag.ids.includes('i-45'), impag.ids.join(' · '));
paso('la más atrasada primero', impag.ids[0] === 'i-45', impag.dias.join(' · '));
paso('con los días de retraso bien contados',
  impag.dias.includes(10) && impag.dias.includes(45), impag.dias.join(' · '));
paso('en rojo a partir de un mes de retraso, y no antes',
  impag.rojos.includes('i-45') && !impag.rojos.includes('i-10'), impag.rojos.join(' · '));
paso('una factura que todavía no ha vencido NO es un impagado',
  !impag.ids.includes('i-futura') && impag.enCamino.includes('i-futura'));
paso('y se dice aparte: eso es dinero en camino',
  /dinero en camino/.test(impag.texto));
paso('una factura cobrada no sale', !impag.ids.includes('i-cobrada'));
/* La importante: sin fecha de vencimiento no se puede afirmar que algo esté
   vencido, y reclamar a un cliente que no debe nada se paga caro. */
paso('y una factura sin vencimiento apuntado tampoco: no se inventa',
  !impag.ids.includes('i-sinvence') && impag.enCamino.includes('i-sinvence'));
paso('el panel está en Gestión con su importe sumado',
  /Facturas vencidas sin cobrar/.test(impag.texto) && /400,00/.test(impag.texto),
  (impag.texto.match(/Facturas vencidas sin cobrar.{0,24}/)||[''])[0]);
paso('y desde la propia lista se apunta el cobro', impag.botonCobro === true);

/* Y si falta el SQL, lo dice en vez de decir que no hay impagados */
const faltaSql = await T(async () => {
  const g = window.__T;
  const antes = g.S.sinFactura;
  g.S.sinFactura = true;
  g.pintar();
  await new Promise(r => setTimeout(r, 700));
  const texto = document.getElementById('vista').innerText;
  g.S.sinFactura = antes;
  return texto;
});
paso('sin el SQL de la factura, el panel dice que no puede calcularlos',
  /factura\.sql/.test(faltaSql));
paso('y que no se inventa que nadie te deba dinero',
  /no se lo inventa/.test(faltaSql));

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
