/* ================================================================
   remate.mjs — la puesta en servicio.                05-11-2026

   POR QUÉ EXISTE
   David, 05-11-2026: «La puesta en marcha no se hará siempre, es
   solo cuando no se ha podido terminar por algún motivo. Pero no es
   algo que siempre va a ocurrir y como tal no es facturable. Es un
   punto de finalización de un proyecto o instalación que ya se debe
   de haber terminado y facturado, a excepción de la puesta en
   servicio.»

   LO QUE ESTABA MAL
   «Puesta en servicio» era un tipo de visita como otro cualquiera:
   se abría sola, sin decir de qué obra venía ni por qué se había
   quedado a medias, y se facturaba con sus horas y su
   desplazamiento. Así que el segundo viaje a terminar una obra no
   se distinguía de una visita nueva, y la pregunta que importa
   (¿cuántas obras se quedan sin terminar, y por culpa de qué?) no
   se podía responder con números.

   LO QUE SE VIGILA AQUÍ
     · las tres preguntas salen SOLO en la puesta en servicio;
     · la lista de obras es la del cliente elegido, y cambia con él;
     · no se abre un remate sin decir por qué se quedó pendiente;
     · «otra» sin explicación no pasa;
     · no se puede enlazar con la obra de otro cliente;
     · el parte dice de qué obra viene y por qué, sin dejar
       cambiarlo desde ahí;
     · la casilla de «se le cobra al cliente» la ve la oficina y NO
       el técnico, y guardar el parte como técnico no la borra;
     · el panel de Gestión saca las obras que esperan remate, y las
       saca solo cuando el remate está hecho, no cuando se apunta;
     · el botón abre el remate con la obra, el cliente y la puerta
       ya puestos;
     · y la de siempre: el remate no se factura, salvo que la
       oficina lo marque.
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
const ctx = await nav.newContext({ viewport:{width:1320,height:2200},
  locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    const cli = db.puertas[0].cliente_id;
    const hace = d => { const x = new Date(); x.setHours(12,0,0,0);
                        x.setDate(x.getDate() - d); return x.toISOString(); };
    /* La obra: instalación cerrada hace 40 días con algo pendiente */
    db.avisos.push({ id:'ob-1', tipo:'instalacion', subtipo:'puerta_automatica',
      estado:'cerrado', prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:cli,
      puerta_id:db.puertas[0].id, horas:8, num_tecnicos:2, ruta:'ruta2',
      trabajo:'Montada la puerta', creado:hace(45), cerrado:hace(40),
      pendiente:true, pendiente_texto:'Falta programar el cuadro: no había corriente definitiva' });
    /* Otra obra cerrada SIN nada pendiente: no espera remate */
    db.avisos.push({ id:'ob-2', tipo:'instalacion', subtipo:'puerta_peatonal',
      estado:'cerrado', prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:cli,
      horas:6, num_tecnicos:2, ruta:'ruta2', trabajo:'Montada y entregada',
      creado:hace(30), cerrado:hace(28), pendiente:false });
    /* Una obra de OTRO cliente, que no debe ofrecerse para este remate */
    db.clientes.push({ id:'cli-otro', nombre:'Otro cliente', creado:hace(100) });
    db.avisos.push({ id:'ob-ajena', tipo:'instalacion', subtipo:'puerta_automatica',
      estado:'cerrado', prioridad:'normal', cliente_id:'cli-otro',
      creado:hace(60), cerrado:hace(55), pendiente:true, pendiente_texto:'Falta el remate' });
    /* Y un remate ya abierto para la obra 1, para probar el parte */
    db.avisos.push({ id:'rm-1', tipo:'puesta_servicio', estado:'asignado', prioridad:'normal',
      tecnico_id:'usuario-admin', cliente_id:cli, puerta_id:db.puertas[0].id,
      instalacion_id:'ob-1', ps_causa:'sin_corriente',
      ps_causa_detalle:'El cuadro general no estaba montado el día del montaje',
      descripcion:'Remate: programar el cuadro', ruta:'ruta2', creado:new Date().toISOString() });
    db.valoraciones.push({ aviso_id:'rm-1', imp_mano_obra:0, imp_desplazamiento:0,
      imp_materiales:0, imp_total:0, coste_total:59, margen:-59 });
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

const faltan = await T(() => window.__T_FALTAN || []);
paso('el banco ve todas las funciones nuevas', faltan.length === 0, faltan.join(' · '));

/* ================================================================
   1. Las tres preguntas salen solo donde tienen que salir
   ================================================================ */
bloque('1. Dónde se preguntan la obra y la causa');

const donde = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null, null, g.S.clientes[0].id);
  await new Promise(r => setTimeout(r, 1000));
  const ver = () => ['a-caja-ps','a-caja-psc','a-caja-psd']
    .map(id => { const c = document.getElementById(id); return c ? !c.hidden : null; });
  const enAveria = ver();
  const tipo = document.getElementById('a-tipo');
  tipo.value = 'puesta_servicio';
  tipo.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 400));
  const enPS = ver();
  const obras = [...document.querySelectorAll('#a-obra option')].map(o => o.value);
  const causas = [...document.querySelectorAll('#a-pscausa option')].map(o => o.value).filter(Boolean);
  const texto = document.getElementById('dlg-form').innerText;
  return { enAveria, enPS, obras, causas, texto };
});
paso('en una avería no se pregunta nada de esto',
  donde.enAveria.join(',') === 'false,false,false', donde.enAveria.join(' · '));
paso('al poner «puesta en servicio» aparecen las tres',
  donde.enPS.join(',') === 'true,true,true', donde.enPS.join(' · '));
paso('la lista de causas es cerrada, con las seis de David',
  donde.causas.join(',') === 'sin_corriente,albanileria,remates,material_cli,nuestra,otra',
  donde.causas.join(' · '));
paso('se ofrecen las dos obras de ese cliente, y la de otro no',
  donde.obras.includes('ob-1') && donde.obras.includes('ob-2') && !donde.obras.includes('ob-ajena'),
  donde.obras.join(' · '));
paso('y se puede decir que la obra es antigua y no está en la aplicación',
  donde.obras.includes(''), donde.obras.length+' opciones');

const pista = await T(async () => {
  const sel = document.getElementById('a-pscausa');
  const leer = () => (document.getElementById('a-pscpista') || {}).textContent || '';
  const r = {};
  for (const c of ['sin_corriente','nuestra','otra']){
    sel.value = c; sel.dispatchEvent(new Event('change', { bubbles:true }));
    await new Promise(x => setTimeout(x, 150));
    r[c] = leer();
  }
  return r;
});
paso('con una causa del cliente se avisa de que se puede repercutir',
  /repercutible/i.test(pista.sin_corriente), pista.sin_corriente);
paso('con la causa nuestra se dice que lo paga la empresa',
  /paga la empresa/i.test(pista.nuestra), pista.nuestra);
paso('y «otra» pide que se explique', /Explícalo/i.test(pista.otra), pista.otra);

/* ================================================================
   2. Lo que no deja abrir un remate
   ================================================================ */
bloque('2. Lo que no deja guardarlo');

const sinCausa = await T(async () => {
  const g = window.__T;
  /* ---- La puerta, desde el 07-11-2026 ----
     David pidió que una puesta en servicio no se pueda guardar sin puerta: el
     remate es el final de una obra que ya se documentó. Esa comprobación va
     ANTES que la de la causa, así que sin elegir puerta estas pruebas veían el
     mensaje de la puerta en vez del de la causa y salían en rojo. El cambio es
     deliberado: se elige una puerta y se sigue probando lo de la causa, que es
     lo que mira esta suite. */
  const selP = document.getElementById('a-puerta');
  const opP = [...selP.querySelectorAll('option')].find(o => o.value);
  if (opP){ selP.value = opP.value; selP.dispatchEvent(new Event('change', { bubbles:true })); }
  await new Promise(r => setTimeout(r, 200));
  document.getElementById('a-pscausa').value = '';
  document.getElementById('a-desc').value = 'Remate del cuadro';
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 700));
  return { err: (document.querySelector('#dlg-form .err') || {}).textContent || '' };
});
paso('no deja abrir un remate sin decir por qué se quedó pendiente',
  /por qué se quedó pendiente/i.test(sinCausa.err), sinCausa.err);
paso('y se explica para qué sirve saberlo',
  /no se puede reclamar/i.test(sinCausa.err));

const otraSinDet = await T(async () => {
  document.getElementById('a-pscausa').value = 'otra';
  document.getElementById('a-psdet').value = '';
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 700));
  return { err: (document.querySelector('#dlg-form .err') || {}).textContent || '' };
});
paso('«otra» sin explicación no pasa', /explícala/i.test(otraSinDet.err), otraSinDet.err);

const otroCliente = await T(async () => {
  const g = window.__T;
  /* Se mete a mano la obra de otro cliente, como pasaría al cambiar el cliente
     después de elegir la obra: la aplicación tiene que darse cuenta. */
  const sel = document.getElementById('a-obra');
  sel.insertAdjacentHTML('beforeend', '<option value="ob-ajena">Obra de otro</option>');
  sel.value = 'ob-ajena'; sel.dataset.tocado = '1';
  document.getElementById('a-pscausa').value = 'albanileria';
  document.getElementById('a-psdet').value = '';
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 700));
  return { err: (document.querySelector('#dlg-form .err') || {}).textContent || '' };
});
paso('no se puede enlazar el remate con la obra de otro cliente',
  /otro cliente/i.test(otroCliente.err), otroCliente.err);

const guardado = await T(async () => {
  const g = window.__T;
  const sel = document.getElementById('a-obra');
  sel.value = 'ob-1';
  document.getElementById('a-pscausa').value = 'sin_corriente';
  document.getElementById('a-psdet').value = 'El cuadro general no estaba montado';
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 1800));
  const nuevo = (g.S.avisos || []).filter(x => x.tipo === 'puesta_servicio' && x.id !== 'rm-1')
    .sort((a, b) => String(b.creado||'').localeCompare(String(a.creado||'')))[0];
  return { hay: !!nuevo, obra: nuevo && nuevo.instalacion_id, causa: nuevo && nuevo.ps_causa,
           det: nuevo && nuevo.ps_causa_detalle, reperc: nuevo && nuevo.repercutible,
           cliente: nuevo && nuevo.cliente_id };
});
paso('con la obra y la causa puestas, el remate se guarda', guardado.hay === true);
paso('y queda enlazado con su obra', guardado.obra === 'ob-1', guardado.obra);
paso('con su causa y su explicación',
  guardado.causa === 'sin_corriente' && /cuadro general/.test(guardado.det || ''),
  guardado.causa+' · '+guardado.det);
paso('y nace SIN marcar que se le cobra al cliente: eso lo decide la oficina',
  !guardado.reperc, String(guardado.reperc));

/* ================================================================
   3. El parte del remate
   ================================================================ */
bloque('3. El parte dice de qué obra viene');

const parte = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  g.dlgCierre('rm-1');
  await new Promise(r => setTimeout(r, 1400));
  const t = document.getElementById('dlg-form').innerText;
  return { texto: t,
    titulo: [...document.querySelectorAll('#dlg-form .grupo > h3')].map(x => x.textContent.trim())
      .filter(x => /Remate/.test(x)),
    reperc: !!document.getElementById('z-reperc'),
    /* de qué obra viene NO se puede cambiar desde el parte */
    selObra: !!document.getElementById('a-obra') };
});
paso('en el parte hay un apartado del remate', parte.titulo.length === 1, parte.titulo.join(' | '));
paso('dice que no se factura porque la obra ya se facturó',
  /no se factura por sí sola/i.test(parte.texto));
paso('dice que las horas se apuntan igual, para saber lo que cuesta',
  /lo que cuesta volver a una obra/i.test(parte.texto));
paso('dice de qué obra viene', /Viene de/.test(parte.texto) && /Instalación|automática/i.test(parte.texto),
  (parte.texto.match(/Viene de[^\n]*/) || [''])[0]);
paso('y por qué se quedó pendiente',
  /corriente definitiva/i.test(parte.texto), (parte.texto.match(/pendiente por[^\n]*/) || [''])[0]);
paso('la obra no se puede cambiar desde el parte: eso se hace en la asistencia',
  parte.selObra === false);
paso('la oficina ve la casilla de «se le cobra al cliente»', parte.reperc === true);

/* ================================================================
   4. La casilla del dinero, solo para la oficina
   ================================================================ */
bloque('4. El técnico no decide quién paga');

const comoTecnico = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  /* Se marca primero como oficina, para ver que un técnico no lo borra */
  await g.sb.from('avisos').update({ repercutible: true }).eq('id', 'rm-1');
  await g.cargar();
  const rolAntes = g.S.perfil.rol;
  g.S.perfil.rol = 'tecnico';
  g.dlgCierre('rm-1');
  await new Promise(r => setTimeout(r, 1400));
  const hay = !!document.getElementById('z-reperc');
  const texto = document.getElementById('dlg-form').innerText;
  document.getElementById('z-trab').value = 'Programado el cuadro';
  document.getElementById('z-horas').value = '2';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'rm-1'), false);
  await new Promise(r => setTimeout(r, 1200));
  const { data } = await g.sb.from('avisos').select('repercutible').eq('id', 'rm-1');
  g.S.perfil.rol = rolAntes;
  return { hay, texto, sigue: data && data[0] ? data[0].repercutible : null };
});
paso('el técnico NO ve la casilla del cobro', comoTecnico.hay === false);
paso('se le dice que lo diga en la oficina, y que apunte las horas de verdad',
  /dilo en la oficina/i.test(comoTecnico.texto) && /horas de verdad/i.test(comoTecnico.texto));
/* Esta es la que importa: el técnico guarda el parte y lo que marcó la oficina
   sigue marcado. Si se mandara el campo siempre, guardar lo pondría en false y
   esa visita dejaría de facturarse sin que nadie lo hubiera decidido. */
paso('y al guardar el parte NO borra lo que la oficina había marcado',
  comoTecnico.sigue === true, String(comoTecnico.sigue));

const comoOficina = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  g.dlgCierre('rm-1');
  await new Promise(r => setTimeout(r, 1400));
  const c = document.getElementById('z-reperc');
  const marcada = c.checked;
  c.checked = false;
  document.getElementById('z-trab').value = 'Programado el cuadro';
  document.getElementById('z-horas').value = '2';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'rm-1'), false);
  await new Promise(r => setTimeout(r, 1200));
  const { data } = await g.sb.from('avisos').select('repercutible').eq('id', 'rm-1');
  g.cerrarDlg();
  return { marcada, ahora: data && data[0] ? data[0].repercutible : null };
});
paso('la casilla sale marcada si la oficina la había marcado', comoOficina.marcada === true);
paso('y la oficina puede quitarla', comoOficina.ahora === false, String(comoOficina.ahora));

/* ================================================================
   5. La valoración en cero, y el aviso cuando hay presupuesto
   ================================================================ */
bloque('5. El remate no se factura');

const cero = await T(() => {
  const g = window.__T;
  const rm = g.S.avisos.find(x => x.id === 'rm-1');
  const viejo = Object.assign({}, rm, { cerrado: '2026-10-20T13:00:00+02:00' });
  const marcado = Object.assign({}, rm, { repercutible: true });
  return {
    normal: g.seValoraEnCero(rm),
    marcado: g.seValoraEnCero(marcado),
    viejo: g.seValoraEnCero(viejo),
    averia: g.seValoraEnCero(g.S.avisos.find(x => x.tipo === 'instalacion')),
  };
});
paso('un remate se valora en cero', cero.normal === true);
paso('marcado como repercutible, NO', cero.marcado === false);
/* La misma regla que el servidor: lo cerrado antes del cambio ya se facturó, y
   la pantalla no puede decir que vale cero algo que tiene factura. */
paso('y uno cerrado antes del 05-11-2026 tampoco: ese ya se facturó',
  cero.viejo === false, String(cero.viejo));
paso('una instalación se factura como siempre', cero.averia === false);

/* ================================================================
   6. El panel de Gestión
   ================================================================ */
bloque('6. Las obras que esperan su remate');

const panel = await T(async () => {
  const g = window.__T;
  const pend = g.obrasConRematePendiente();
  const lista = pend.map(x => x.a.id);
  const dias = pend.map(x => x.dias);
  const deOb1 = (pend.find(x => x.a.id === 'ob-1') || {}).dias;
  g.S.tab = 'gestion'; g.pintar();
  await new Promise(r => setTimeout(r, 1000));
  const v = document.getElementById('vista');
  return { lista, dias, deOb1, texto: v.innerText,
           boton: !!v.querySelector('[data-act="remate-nuevo"][data-id="ob-1"]') };
});
paso('la obra con algo pendiente y sin remate hecho sale en la lista',
  panel.lista.includes('ob-1'), panel.lista.join(' · '));
paso('la obra cerrada sin nada pendiente no sale', !panel.lista.includes('ob-2'));
paso('y se cuentan los días que lleva esperando', panel.deOb1 === 40, panel.deOb1);
/* La lista es de todas las obras, de todos los clientes, y la que más tiempo
   lleva esperando va primera: es por donde hay que empezar a llamar. */
paso('la más antigua va primero',
  panel.dias.join(',') === panel.dias.slice().sort((a, b) => b - a).join(','),
  panel.dias.join(' · '));
paso('el panel está en Gestión y dice que el remate no se factura',
  /Obras con el remate pendiente/.test(panel.texto) && /no se factura/i.test(panel.texto));
paso('con un botón para abrir el remate', panel.boton === true);

/* Lo que saca una obra de la lista es el remate HECHO, no el apuntado. El
   remate rm-1 está abierto, así que ob-1 sigue en la lista; al cerrarlo, sale. */
const saleCuando = await T(async () => {
  const g = window.__T;
  const conAbierto = g.obrasConRematePendiente().map(x => x.a.id).includes('ob-1');
  await g.sb.from('avisos').update({ cerrado: new Date().toISOString(), estado:'cerrado' })
    .eq('id', 'rm-1');
  await g.cargar();
  const conCerrado = g.obrasConRematePendiente().map(x => x.a.id).includes('ob-1');
  await g.sb.from('avisos').update({ cerrado: null, estado:'asignado' }).eq('id', 'rm-1');
  await g.cargar();
  return { conAbierto, conCerrado };
});
paso('con el remate solo apuntado, la obra sigue esperando', saleCuando.conAbierto === true);
paso('y deja de salir cuando el remate está CERRADO', saleCuando.conCerrado === false);

/* ================================================================
   7. El botón que ahorra teclear
   ================================================================ */
bloque('7. Abrir el remate desde la obra');

const desdeObra = await T(async () => {
  const g = window.__T;
  g.rematePara('ob-1');
  await new Promise(r => setTimeout(r, 1200));
  const v = id => (document.getElementById(id) || {}).value || '';
  const r = { tipo: v('a-tipo'), obra: v('a-obra'), cliente: v('a-cliente'),
              puerta: v('a-puerta'), desc: v('a-desc'), det: v('a-psdet') };
  g.cerrarDlg();
  return r;
});
paso('se abre ya como puesta en servicio', desdeObra.tipo === 'puesta_servicio', desdeObra.tipo);
paso('con la obra enlazada', desdeObra.obra === 'ob-1', desdeObra.obra);
paso('y con el cliente y la puerta de la obra',
  !!desdeObra.cliente && !!desdeObra.puerta, desdeObra.cliente+' · '+desdeObra.puerta);
paso('lo que la obra dejó escrito como pendiente se copia a la descripción',
  /corriente definitiva/i.test(desdeObra.desc), desdeObra.desc);
paso('y a la explicación de la causa', /corriente definitiva/i.test(desdeObra.det), desdeObra.det);

/* ================================================================
   8. La hoja que firma el cliente
   ================================================================ */
bloque('8. El remate en el parte impreso');

const impreso = await T(async () => {
  const g = window.__T;
  let html = '';
  const abrir = window.open;
  window.open = () => ({ document: { write: t => { html += t; }, close(){}, title:'' },
                         focus(){}, print(){}, close(){} });
  await g.hojaParte('rm-1');
  await new Promise(r => setTimeout(r, 900));
  window.open = abrir;
  const limpio = html.replace(/<[^>]*>/g, ' ');
  return { tiene: /Remate de la instalación/.test(html),
           obra: /Obra/.test(limpio),
           causa: /corriente definitiva/i.test(limpio),
           det: /cuadro general/i.test(limpio) };
});
paso('el parte impreso lleva el apartado del remate', impreso.tiene === true);
paso('con la obra de la que viene', impreso.obra === true);
paso('la causa por la que se quedó pendiente', impreso.causa === true);
paso('y la explicación', impreso.det === true);

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
