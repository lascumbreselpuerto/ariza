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
    /* Una avería abierta para el cobro en obra (27-11-2026). Lleva una puerta y
       una foto, que es lo que hace falta para poder cerrarla. */
    db.avisos.push({ id:'fa-cobro', tipo:'averia', subtipo:'averia', estado:'asignado',
      prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:db.puertas[0].cliente_id,
      puerta_id:db.puertas[0].id, ruta:'ruta1', descripcion:'No cierra del todo',
      creado:new Date().toISOString() });
    db.fotos.push({ id:'fa-cobro-foto', aviso_id:'fa-cobro', puerta_id:db.puertas[0].id,
      ruta:'fa-cobro/1.jpg', autor:'prueba', etapa:'hecho', creado:new Date().toISOString() });
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
  /* Fechas en días de CALENDARIO LOCAL, no en milisegundos (04-11-2026).
     Restar d*86400000 parecía lo mismo y no lo es: España pasó de CEST a CET el
     25 de octubre, así que a partir de las 23:00 de Madrid restar 30 días de
     milisegundos caía en el día 29, y tres comprobaciones de fecha se ponían
     rojas solas de noche. La aplicación cuenta días locales (dias()), así que
     la prueba también: mediodía de hoy y luego setDate, que respeta el cambio
     de hora. */
  const hace = d => { const x = new Date(); x.setHours(12,0,0,0);
                      x.setDate(x.getDate() - d); return x.toISOString(); };
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
  const ayer = g.iso(new Date(Date.now() - 86400000));   // en local, como cuenta la aplicación
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
/* ---- Las fechas, en hora LOCAL (02-11-2026) ----
   Estas pruebas se caían una hora al día: calculaban las fechas en UTC y la
   aplicación cuenta los días en hora de Madrid, así que entre las 23:00 y la
   medianoche «hoy» era un día distinto para cada uno. Ahora el día lo da la
   propia aplicación, que es quien manda. */
const hoyIso = await T(() => window.__T.hoy());
const ayerIso = await T(() => window.__T.iso(new Date(Date.now() - 86400000)));
const mas30 = n => { const [a, m, d] = n.split('-').map(Number);
  const f = new Date(a, m-1, d); f.setDate(f.getDate()+30);
  return f.getFullYear()+'-'+String(f.getMonth()+1).padStart(2,'0')+'-'+String(f.getDate()).padStart(2,'0'); };
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
  const hace = d => { const x = new Date(); x.setHours(12,0,0,0);
                      x.setDate(x.getDate() - d); return x.toISOString(); };
  /* En hora local, igual que cuenta la aplicación: en UTC, una hora al día
     daba un día de diferencia y la prueba se caía sola. */
  const dIso = n => { const x = new Date(); x.setHours(12,0,0,0);
                      x.setDate(x.getDate() + n); return window.__T.iso(x); };
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

/* ================================================================
   5. La propuesta de factura                         02-11-2026

   La aplicación no emite facturas. Lo que sí puede hacer es dejarlo
   todo preparado: las líneas, la base, el IVA y el total, con los
   datos fiscales del cliente, para teclear la factura en un minuto.

   Lo que esta parte vigila por encima de todo es que ese papel NO se
   pueda confundir con una factura: sin numeración, sin serie, y
   diciéndolo en grande. Si algún día alguien le pone un número a esto
   «para que quede mejor», esta prueba se tiene que poner roja.
   ================================================================ */
bloque('5. La propuesta de factura');

const hoja = await T(async () => {
  const g = window.__T;
  const hace = d => { const x = new Date(); x.setHours(12,0,0,0);
                      x.setDate(x.getDate() - d); return x.toISOString(); };
  /* Una visita con de todo: horas, desplazamiento y tres materiales, uno de
     ellos sin precio, que es el que NO puede colarse en la cuenta. */
  await g.sb.from('avisos').insert({ id:'pf-1', tipo:'averia', estado:'cerrado',
    prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:'cli-30',
    horas:2, num_tecnicos:1, cerrado:hace(3), creado:hace(4) });
  await g.sb.from('materiales').insert({ aviso_id:'pf-1', descripcion:'Fotocélula de espejo',
    cantidad:2, unidad:'ud', coste:25, precio:40 });
  await g.sb.from('materiales').insert({ aviso_id:'pf-1', descripcion:'Banda de seguridad',
    cantidad:1, unidad:'ud', coste:38.5, precio:53.9 });
  await g.sb.from('materiales').insert({ aviso_id:'pf-1', descripcion:'Tornillería varia',
    cantidad:1, unidad:'ud' });
  await g.sb.from('valoraciones').insert({ aviso_id:'pf-1', imp_mano_obra:90,
    imp_desplazamiento:45, imp_materiales:133.9, imp_total:268.9,
    coste_total:120, margen:148.9, facturado:false });
  await g.cargar();

  const hojas = [];
  const orig = window.open;
  window.open = () => ({ document:{ write: h => hojas.push(h), close(){} },
                         print(){}, focus(){}, close(){} });
  try {
    await g.documentoPropuestaFactura('pf-1');
    await new Promise(r => setTimeout(r, 600));
  } finally { window.open = orig; }
  return { n: hojas.length, h: hojas[0] || '' };
});
const sinEtiquetas = (hoja.h || '').replace(/<[^>]*>/g, ' ');
paso('la hoja se genera', hoja.n === 1 && hoja.h.length > 500, hoja.h.length+' caracteres');
paso('y dice en grande que NO es una factura',
  /ESTO NO ES UNA FACTURA/.test(hoja.h));
paso('explicando lo que eso significa: ni justifica gasto ni deduce IVA',
  /no sirve para justificar un gasto/.test(sinEtiquetas) && /deducir el IVA/.test(sinEtiquetas));
/* La comprobación que importa de verdad: que no se parezca a una factura.
   Se buscan los RÓTULOS que llevaría una factura de verdad («Nº de factura»,
   «Serie:», «Factura nº»). Ojo con buscar la palabra «serie» a secas: el
   propio documento dice «no lleva número ni serie», y eso haría saltar la
   comprobación por la frase que precisamente demuestra que está bien. */
/* Ojo también con la «o» de la abreviatura: escribir n[ºo°] hace que «FACTURA
   No lleva número...» cuente como «Factura nº». Solo el símbolo. */
paso('no lleva número ni serie, ni nada que lo parezca',
  !/Serie\s*:|N[º°]\s*de\s*factura|Factura\s*n[º°]|Número\s*de\s*factura/i.test(sinEtiquetas),
  (sinEtiquetas.match(/.{0,20}[Ss]erie.{0,20}/)||[''])[0]);
paso('y lo dice con todas las letras', /No lleva número ni serie/.test(sinEtiquetas));
paso('lleva los datos fiscales del cliente, que es para lo que sirve',
  /Comunidad Los Olivos/.test(sinEtiquetas) && /H11000001/.test(sinEtiquetas));
paso('y los de la empresa', /Ariza Puertas y Automatismos/.test(sinEtiquetas));
paso('con sus líneas: mano de obra, desplazamiento y cada material',
  /Mano de obra/.test(sinEtiquetas) && /Desplazamiento/.test(sinEtiquetas) &&
  /Fotocélula de espejo/.test(sinEtiquetas) && /Banda de seguridad/.test(sinEtiquetas));
/* 2 × 40,00 = 80,00 de las fotocélulas. Si la hoja pusiera 40 sin multiplicar,
   la factura saldría corta por la cantidad, que es el error clásico. */
paso('el material multiplica cantidad por precio',
  /80,00/.test(sinEtiquetas), (sinEtiquetas.match(/.{0,24}80,00/)||[''])[0]);
/* base 268,90 · IVA 21 % = 56,47 · total 325,37 */
paso('la base, el IVA y el total, calculados',
  /268,90/.test(sinEtiquetas) && /56,47/.test(sinEtiquetas) && /325,37/.test(sinEtiquetas),
  (sinEtiquetas.match(/Total.{0,16}/)||[''])[0]);
/* Lo que no puede pasar: que un material sin precio se cuele a cero y nadie
   lo note. Sale avisado, fuera de la cuenta. */
paso('el material sin precio NO entra en la cuenta, y se avisa',
  /Tornillería varia/.test(sinEtiquetas) && /no tiene precio/.test(sinEtiquetas));
paso('y el desplazamiento dice de qué ruta sale',
  /Desplazamiento/.test(sinEtiquetas));

/* ================================================================
   6. El fichero para el programa de facturación
   ================================================================ */
bloque('6. El fichero para pasarlo al programa de facturación');

const fichero = await T(async () => {
  const g = window.__T;
  let bajado = null;
  const orig = g.bajarFichero;
  /* Se le cambia la bajada por una que se queda con el texto */
  const leer = blob => new Promise(r => { const f = new FileReader();
    f.onload = () => r(f.result); f.readAsText(blob); });
  window.__BAJADO = null;
  const urlOrig = URL.createObjectURL;
  URL.createObjectURL = blob => { window.__BLOB = blob; return urlOrig.call(URL, blob); };
  const av = g.S.avisos.filter(a => a.id === 'pf-1');
  await g.exportarFacturacion(av);
  await new Promise(r => setTimeout(r, 400));
  URL.createObjectURL = urlOrig;
  const texto = window.__BLOB ? await leer(window.__BLOB) : '';
  return { texto, lineas: texto.split('\r\n').filter(Boolean) };
});
paso('se genera el fichero', fichero.lineas.length > 1, fichero.lineas.length+' líneas');
paso('con su cabecera de columnas',
  /referencia;fecha;cliente;nif/.test(fichero.texto), fichero.lineas[0]);
/* Una fila por línea de factura: mano de obra, desplazamiento y dos
   materiales. El tercero no, que no tiene precio. */
paso('una fila por cada línea que se va a facturar',
  fichero.lineas.length === 5, (fichero.lineas.length-1)+' líneas de factura');
paso('todas con la misma referencia, para que el programa las agrupe en una factura',
  (() => { const refs = new Set(fichero.lineas.slice(1).map(l => l.split(';')[0]));
           return refs.size === 1; })(),
  fichero.lineas[1].split(';')[0]);
paso('con el NIF del cliente, que es lo que pide cualquier programa',
  /H11000001/.test(fichero.texto));
paso('los números en coma decimal, que es como los lee Excel en español',
  /;40,00?;|;80;|;53,9;/.test(fichero.texto) || /,\d/.test(fichero.lineas[1]),
  fichero.lineas[1]);
paso('y el material sin precio tampoco se cuela aquí',
  !/Torniller/.test(fichero.texto));

/* ================================================================
   El precio puesto a mano, y el acumulado del año (27-11-2026)

   David: «Si veo necesario que oficina pueda modificar el precio a
   mano. Estos importes sumarán en ingresos positivos y se le calculará
   el margen con los costes estipulados.»

   Y: «me he dado cuenta de que el margen no termina en sumatorio, cosa
   necesaria para hacer cálculos.»

   La cuenta la hace el servidor y se prueba contra Postgres de verdad
   en sql/precio-a-mano-pruebas.sql. Aquí se prueba la PANTALLA: que se
   vean los dos números (el calculado y el de la factura), que no se
   pueda poner sin decir por qué, que el técnico no llegue a esto, y que
   el acumulado del año salga en Gestión.
   ================================================================ */
bloque('El precio puesto a mano');

const precioMano = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 250));
  g.dlgValoracion('pf-1');
  await new Promise(r => setTimeout(r, 900));
  const hayBoton = !!document.querySelector('[data-act="precio-mano"]');
  const hayQuitar = !!document.querySelector('[data-act="precio-mano-quitar"]');
  document.querySelector('[data-act="precio-mano"]').click();
  await new Promise(r => setTimeout(r, 900));
  const txt = document.getElementById('dlg-form').innerText;
  /* Se intenta guardar sin motivo */
  document.getElementById('pm-imp').value = '250';
  const form = document.getElementById('dlg-form');
  form.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true }));
  await new Promise(r => setTimeout(r, 900));
  const err = (document.querySelector('#dlg-form .err') || {}).textContent || '';
  const v = g.valoracionDe('pf-1') || {};
  return { hayBoton, hayQuitar, txt, err, manualTodavia: v.imp_manual == null };
});
paso('en la valoración hay botón para poner el importe a mano', precioMano.hayBoton === true);
paso('y todavía no hay botón de volver al calculado: no hay importe a mano',
  precioMano.hayQuitar === false);
/* Sin distinguir mayúsculas: los rótulos de una lista de datos los pone el
   CSS en mayúsculas, y la prueba no está para vigilar el CSS. (27-11-2026) */
paso('el diálogo enseña la suma del cálculo y el coste real, para decidir con los dos',
  /suma del cálculo/i.test(precioMano.txt) && /coste real/i.test(precioMano.txt),
  precioMano.txt.replace(/\n/g, ' · ').slice(0, 100));
paso('y dice que el coste no cambia y que el margen sale de ese coste',
  /El coste no cambia/.test(precioMano.txt) && /margen se calcula contra ese coste/.test(precioMano.txt));
paso('sin decir por qué, no se guarda', /Escribe por qué se pone a mano/.test(precioMano.err),
  precioMano.err.slice(0, 70));
paso('y no se ha puesto nada', precioMano.manualTodavia === true);

const puesto = await T(async () => {
  const g = window.__T;
  document.getElementById('pm-imp').value = '250';
  document.getElementById('pm-nota').value = 'Precio acordado con el administrador';
  document.getElementById('dlg-form').dispatchEvent(
    new Event('submit', { bubbles:true, cancelable:true }));
  await new Promise(r => setTimeout(r, 2200));
  const v = g.valoracionDe('pf-1') || {};
  /* Y se vuelve a abrir la valoración para ver los dos números */
  g.dlgValoracion('pf-1');
  await new Promise(r => setTimeout(r, 900));
  const txt = document.getElementById('dlg-form').innerText;
  const hayQuitar = !!document.querySelector('[data-act="precio-mano-quitar"]');
  g.cerrarDlg();
  return { manual: v.imp_manual, total: v.imp_total, margen: v.margen,
    coste: v.coste_total, por: v.manual_por, nota: v.manual_nota, txt, hayQuitar };
});
paso('con el motivo, se guarda el importe a mano', Number(puesto.manual) === 250, puesto.manual);
paso('y pasa a ser lo que se factura', Number(puesto.total) === 250, puesto.total);
/* La que de verdad importa: el margen contra el coste real, no contra lo escrito */
paso('el margen se calcula contra el coste real',
  Math.round((250 - (+puesto.coste)) * 100) === Math.round((+puesto.margen) * 100),
  puesto.margen+' con coste '+puesto.coste);
paso('queda guardado quién lo puso y por qué',
  !!puesto.por && /acordado/.test(puesto.nota || ''), puesto.por+' · '+puesto.nota);
paso('al volver a abrirla se ven los DOS números, el calculado y el de la factura',
  /suma del cálculo/i.test(puesto.txt) && /puesto a mano/i.test(puesto.txt) &&
  /268,90/.test(puesto.txt) && /250,00/.test(puesto.txt),
  puesto.txt.replace(/\n/g, ' · ').slice(0, 130));
paso('y ya se ofrece volver al calculado', puesto.hayQuitar === true);

/* Y se quita, que es la salida. Esto además deja la visita como estaba para las
   pruebas de más abajo: la primera versión de esta sección se la dejaba con el
   precio a mano puesto y las dos comprobaciones del total de la tarjeta se
   ponían rojas sin que nada estuviera mal. (27-11-2026) */
const quitado = await T(async () => {
  const g = window.__T;
  g.dlgValoracion('pf-1');
  await new Promise(r => setTimeout(r, 900));
  const b1 = document.querySelector('[data-act="precio-mano-quitar"]');
  b1.click();                                   // primer toque: pide confirmación
  await new Promise(r => setTimeout(r, 300));
  const pide = /Confirmar/i.test(b1.textContent || '');
  const vMedio = g.valoracionDe('pf-1') || {};
  b1.click();                                   // segundo toque: lo quita
  await new Promise(r => setTimeout(r, 2200));
  const v = g.valoracionDe('pf-1') || {};
  g.cerrarDlg();
  return { pide, aMedias: vMedio.imp_manual, manual: v.imp_manual,
    total: v.imp_total, nota: v.manual_nota };
});
paso('quitar el importe a mano pide confirmación: es una decisión de dinero',
  quitado.pide === true && Number(quitado.aMedias) === 250, quitado.aMedias);
paso('con el segundo toque se quita', quitado.manual == null, String(quitado.manual));
paso('y vuelve a valer el calculado', Number(quitado.total) === 268.9, quitado.total);
paso('sin dejar el motivo de antes colgado', quitado.nota == null, String(quitado.nota));

/* Y el acumulado del año, que es lo del sumatorio */
const acumulado = await T(async () => {
  const g = window.__T;
  const rolAntes = g.S.perfil.rol;
  g.S.perfil.rol = 'admin';
  g.S.vista = 'gestion';
  g.pintar();
  await new Promise(r => setTimeout(r, 1200));
  const txt = (document.getElementById('vista') || document.body).innerText;
  g.S.perfil.rol = rolAntes;
  return { txt, hay: /Acumulado de \d{4}/.test(txt) };
});
paso('en Gestión sale el acumulado del año, no solo el del mes',
  acumulado.hay === true, (acumulado.txt.match(/Acumulado de \d{4}/) || [''])[0]);
paso('con facturable, coste y margen del año',
  /Facturable del año/.test(acumulado.txt) && /Coste del año/.test(acumulado.txt) &&
  /Margen del año/.test(acumulado.txt));

/* ================================================================
   La tarjeta de una visita realizada (27-11-2026)

   David: «quiero que salga asistencia realizada, tiempo y valoración
   total por partes (horas técnicos, desplazamiento y materiales) para
   que la oficina pueda gestionar el cobro y no tener que calcular el
   importe», y «la fecha que marca es de entrada del parte pero no del
   cierre de la asistencia y esta última fecha es muy importante que
   aparezca aquí».

   El importe estaba calculado desde que se cierra la visita, pero solo
   se veía en Gestión o abriendo la valoración una por una.

   LO QUE MÁS SE VIGILA AQUÍ: que el DINERO siga siendo de la oficina y
   de la administración. Esta es una lista que el técnico abre en su
   móvil, y meter importes en una tarjeta es la manera más fácil de
   saltarse esa regla sin darse cuenta.
   ================================================================ */
bloque('La tarjeta de una visita realizada');

const tarjeta = await T(async () => {
  const g = window.__T;
  const a = g.S.avisos.find(x => x.id === 'pf-1');
  const rolAntes = g.S.perfil.rol;
  const comoOficina = g.tarjetaAviso(a);
  g.S.perfil.rol = 'tecnico';
  const comoTecnico = g.tarjetaAviso(a);
  g.S.perfil.rol = rolAntes;
  const abierta = g.S.avisos.find(x => !x.cerrado && !x.anulada);
  return { comoOficina, comoTecnico,
    laAbierta: abierta ? g.tarjetaAviso(abierta) : '',
    texto: comoOficina.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') };
});
/* El punto 3: la fecha de cierre, que es la que se busca en Realizadas */
paso('la tarjeta de una cerrada dice CUÁNDO se cerró',
  /Cerrada el/.test(tarjeta.texto), (tarjeta.texto.match(/Cerrada el [^·]+/) || [''])[0]);
paso('y deja la fecha de entrada detrás, para saber lo que se tardó en atenderla',
  /entró el/i.test(tarjeta.texto));
paso('una visita todavía abierta sigue diciendo «Entró el», que es lo suyo',
  /Entró el/.test(tarjeta.laAbierta) && !/Cerrada el/.test(tarjeta.laAbierta));
/* El punto 1: el tiempo y el desglose */
paso('se ve el tiempo de la visita', /2 h/.test(tarjeta.texto), '2 h');
paso('y el desglose por partes: mano de obra, desplazamiento y material',
  /Mano de obra/.test(tarjeta.texto) && /Desplazamiento/.test(tarjeta.texto) &&
  /Material/.test(tarjeta.texto));
paso('con los importes de cada parte', /90,00/.test(tarjeta.texto) &&
  /45,00/.test(tarjeta.texto) && /133,90/.test(tarjeta.texto),
  (tarjeta.texto.match(/Mano de obra[^·]+·[^·]+·[^·]+/) || [''])[0]);
paso('el total sin IVA', /268,90/.test(tarjeta.texto));
paso('y el total con IVA, que es lo que se le pide al cliente',
  /325,37/.test(tarjeta.texto), (tarjeta.texto.match(/[\d.,]+ € con el \d+/) || [''])[0]);
paso('se dice si está facturada o no', /Sin facturar/.test(tarjeta.texto));
paso('y si se cobró en obra o no', /Sin cobrar en obra/.test(tarjeta.texto));
/* ---- Reescrita el 27-11-2026 ----
   Pedía el atajo de «apuntar la factura» en cualquier parte cerrado. Desde hoy
   hay dos pasos (revisar y luego facturar), así que en un parte por revisar el
   atajo que toca es el de revisar: ofrecer facturar antes de haberlo repasado
   es saltarse el paso que David pidió. Se comprueban los dos casos. */
paso('el atajo de ver la valoración está siempre',
  /data-act="ver-valoracion"/.test(tarjeta.comoOficina));
paso('en un parte por revisar, el atajo que sale es el de revisarlo',
  /data-act="revisar-parte"/.test(tarjeta.comoOficina) &&
  !/data-act="marcar-facturado"/.test(tarjeta.comoOficina));
paso('y una vez revisado, sale el de apuntar la factura', await T(async () => {
  const g = window.__T;
  const v = g.valoracionDe('pf-1');
  const antes = v.revisado_en;
  v.revisado_en = new Date().toISOString(); v.revisado_por = 'Oficina';
  const html = g.tarjetaAviso(g.S.avisos.find(x => x.id === 'pf-1'));
  v.revisado_en = antes;                     // se deja como estaba
  return /data-act="marcar-facturado"/.test(html);
}) === true);
/* Y la que de verdad cierra la puerta */
const dineroTec = tarjeta.comoTecnico.replace(/<[^>]+>/g, ' ');
paso('un TÉCNICO ve la fecha de cierre y las horas',
  /Cerrada el/.test(dineroTec) && /2 h/.test(dineroTec));
paso('pero NO ve ningún importe: el dinero es de la oficina',
  !/Mano de obra/.test(dineroTec) && !/268,90/.test(dineroTec) &&
  !/Total/.test(dineroTec) && !/€/.test(dineroTec),
  dineroTec.replace(/\s+/g, ' ').slice(0, 110));

/* Una visita cerrada SIN valorar: eso es una que nadie va a facturar, así que
   se dice y se ofrece calcularla ahí mismo. */
const sinValorar = await T(async () => {
  const g = window.__T;
  await g.sb.from('avisos').insert({ id:'pf-sv', tipo:'averia', estado:'cerrado',
    prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:'cli-30',
    horas:1, cerrado:new Date().toISOString(), creado:new Date().toISOString() });
  await g.cargar();
  const a = g.S.avisos.find(x => x.id === 'pf-sv');
  const html = g.tarjetaAviso(a);
  return { html, texto: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') };
});
paso('una cerrada sin valorar lo dice', /Sin valorar/.test(sinValorar.texto));
paso('y ofrece calcularla ahí mismo, sin ir a buscarla a Gestión',
  /data-act="revalorar"/.test(sinValorar.html));

/* ================================================================
   Lo que el técnico tiene que cobrar, con IVA (27-11-2026)

   David: «Para un cobro en obra, al técnico le debe de sacar el importe
   a pagar más IVA, en función de horas, desplazamiento y materiales.»

   Hasta hoy el técnico escribía el importe de su cabeza. Lo que se
   vigila aquí es la PANTALLA, no la cuenta: la cuenta la hace el
   servidor con la misma función que factura la oficina, y se prueba
   contra Postgres de verdad en sql/cobro-en-obra-pruebas.sql.

   Y lo que más importa de todo: que en esa pantalla no aparezcan el
   coste ni el margen. El técnico no ve precios de coste, y este
   apartado es la única excepción de la aplicación, así que es justo
   donde hay que vigilarlo.
   ================================================================ */
bloque('Lo que hay que cobrar en obra');

const cobroObra = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  g.dlgCierre('fa-cobro');
  await new Promise(r => setTimeout(r, 1600));
  const hayBoton = !!document.querySelector('[data-act="cobro-calcular"]');
  /* Se rellena el parte como lo haría el técnico: dos horas y lo hecho */
  document.getElementById('z-trab').value = 'Cambiada la banda de seguridad.';
  document.getElementById('z-horas').value = '2';
  const horasAntes = (g.S.avisos.find(x => x.id === 'fa-cobro') || {}).horas;
  document.querySelector('[data-act="cobro-calcular"]').click();
  await new Promise(r => setTimeout(r, 2600));
  const caja = document.getElementById('z-cobro-cuenta');
  return { hayBoton, horasAntes,
    horasDespues: (g.S.avisos.find(x => x.id === 'fa-cobro') || {}).horas,
    texto: (caja || {}).innerText || '',
    importe: (document.getElementById('z-imp') || {}).value || '' };
});
paso('el apartado del cobro trae el botón de calcular', cobroObra.hayBoton === true);
/* Esto es lo que hace que la cuenta sea de verdad: las horas tienen que estar
   guardadas antes de preguntar, porque la cuenta la hace el servidor con lo
   guardado, no con lo que haya en pantalla. */
paso('al calcular, primero guarda el parte: las horas quedan guardadas',
  Number(cobroObra.horasDespues) === 2,
  cobroObra.horasAntes+' → '+cobroObra.horasDespues);
paso('y sale el desglose de los tres conceptos',
  /Mano de obra/i.test(cobroObra.texto) && /Desplazamiento/i.test(cobroObra.texto) &&
  /Materiales/i.test(cobroObra.texto), cobroObra.texto.replace(/\n/g, ' · ').slice(0, 90));
paso('con su IVA y su total a cobrar',
  /IVA \(21/.test(cobroObra.texto) && /A cobrar/i.test(cobroObra.texto),
  cobroObra.texto.replace(/\n/g, ' · ').slice(0, 120));
/* La que de verdad cierra la puerta: el técnico no ve coste ni margen, y este
   es el único sitio de la aplicación donde se le dan importes. */
paso('y NO aparece el coste ni el margen, que el técnico no ve',
  !/coste/i.test(cobroObra.texto) && !/margen/i.test(cobroObra.texto),
  cobroObra.texto.replace(/\n/g, ' · ').slice(0, 120));
/* 2 h × 45 + 30 de desplazamiento = 120 de base, +21 % = 145,20 */
paso('el importe se pone solo, para no teclearlo delante del cliente',
  cobroObra.importe === '145.20', cobroObra.importe);

/* Y si el técnico ya había escrito un importe, no se le pisa: puede haber
   acordado otra cantidad con el cliente y perderla sería peor que no calcular. */
const noPisa = await T(async () => {
  const g = window.__T;
  document.getElementById('z-imp').value = '100';
  document.querySelector('[data-act="cobro-calcular"]').click();
  await new Promise(r => setTimeout(r, 2600));
  return { importe: document.getElementById('z-imp').value };
});
paso('si ya había un importe escrito, no se pisa', noPisa.importe === '100', noPisa.importe);

/* Nulo no es cero. El servidor devuelve nulo cuando la visita no es de ese
   técnico, y enseñarle «0,00 €» le haría cobrar de menos. */
const ajena = await T(async () => {
  const g = window.__T;
  /* La marca del simulador que le hace contestar nulo, igual que el servidor a
     un técnico que pregunta por una visita que no es suya */
  const db = window.__DB;
  if (db) db.__cobroAjeno = true;
  document.getElementById('z-imp').value = '';
  document.querySelector('[data-act="cobro-calcular"]').click();
  await new Promise(r => setTimeout(r, 2600));
  const t = (document.getElementById('z-cobro-cuenta') || {}).innerText || '';
  if (db) db.__cobroAjeno = false;
  g.cerrarDlg();
  return { texto: t, importe: document.getElementById('z-imp') ? document.getElementById('z-imp').value : '?' };
});
/* Se mira el mensaje CONCRETO, no uno parecido. Mi primera versión de esta
   comprobación solo pedía «no se ha podido calcular», y eso también sale cuando
   el nulo se cuela y revienta por dentro: el error se recoge y el aviso sale
   igual, así que la prueba pasaba con y sin la guarda y no probaba nada.
   El mensaje de este caso tiene que decirle al técnico QUÉ hacer, que es
   pedírselo a la oficina, no un fallo genérico. (27-11-2026) */
paso('si la visita no es suya, se le dice por qué y qué hacer, y NO se escribe cero',
  /no está a tu nombre/i.test(ajena.texto) && /oficina/i.test(ajena.texto) &&
  ajena.importe === '',
  ajena.texto.slice(0, 80)+' · importe «'+ajena.importe+'»');

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
