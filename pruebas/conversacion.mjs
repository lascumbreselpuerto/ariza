/* ================================================================
   conversacion.mjs — El hilo de conversación         12-11-2026

   DE DÓNDE SALE
   David, el 12-11-2026, preguntando qué me parecía meter un chat en
   la aplicación: un canal de todo el grupo, otro entre dos usuarios
   y otro desde el QR para que el cliente escriba.

   Se descartaron los tres y se hizo otra cosa: conversación ANCLADA
   al trabajo. Un hilo dentro de la asistencia y otro en la ficha de
   la puerta que junta los de todas sus visitas.

   LO QUE VIGILA ESTA SUITE, y por qué cada cosa
     1. Que el hilo de la puerta recoja lo escrito en sus visitas.
        Es la razón de ser de todo esto: que no se pierda.
     2. QUE NO SE PUEDA EDITAR NI BORRAR. Es un registro, no un
        chat. Si algún día alguien añade un botón de borrar, esto se
        pone en rojo.
     3. Que la chincheta sea lo ÚNICO que se puede cambiar.
     4. QUE EL CLIENTE NO LO VEA NUNCA. Ni en el parte, ni en la
        vista pública del QR, ni en ningún documento que salga de la
        empresa. Es la comprobación más importante de las cinco:
        aquí la gente escribe «este cliente es un pesado» y eso no
        puede acabar impreso.
     5. Que los fijados salgan arriba y en la ficha de la puerta,
        que es donde hay que leerlos antes de ir.
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
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    const pu = db.puertas[0];
    /* Dos visitas de la MISMA puerta: hace falta para comprobar que el hilo de
       la puerta junta lo escrito en las dos, que es el punto de todo esto. */
    db.avisos.push({ id:'av-m1', tipo:'averia', estado:'asignado', prioridad:'normal',
      tecnico_id:'usuario-admin', puerta_id: pu.id, cliente_id: pu.cliente_id,
      descripcion:'No invierte al tocar el suelo', creado:'2026-03-01T09:00:00.000Z',
      fecha_prevista:'2026-03-01' });
    db.avisos.push({ id:'av-m2', tipo:'mantenimiento', estado:'asignado', prioridad:'normal',
      tecnico_id:'usuario-admin', puerta_id: pu.id, cliente_id: pu.cliente_id,
      descripcion:'Revisión semestral', creado:'2026-09-01T09:00:00.000Z',
      fecha_prevista:'2026-09-01' });
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
const T = (f, arg) => arg === undefined ? pag.evaluate(f) : pag.evaluate(f, arg);

let ok = 0, mal = 0;
const paso = (t, bien, detalle) => {
  if (bien){ ok++; console.log('  OK  '+t+(detalle!==undefined?' → '+detalle:'')); }
  else { mal++; console.log(' FALLA '+t+(detalle!==undefined?' → '+detalle:'')); }
};
const bloque = t => console.log('\n· '+t);

/* ================================================================
   1. Escribir en una asistencia
   ================================================================ */
bloque('1. Escribir en el hilo de una asistencia');

const escribir = await T(async () => {
  const g = window.__T;
  await g.dlgConversacion('av-m1');
  await new Promise(r => setTimeout(r, 400));
  const vacio = document.getElementById('msj-lista').innerText;
  document.getElementById('msj-txt').value =
    'El cuadro es un Erreka viejo, no el que pone en la ficha.';
  document.querySelector('[data-act="msj-enviar"]').click();
  await new Promise(r => setTimeout(r, 600));
  const lista = document.getElementById('msj-lista');
  const enBase = (window.__DB.mensajes || []);
  return {
    decia: vacio,
    cuantos: enBase.length,
    guardado: enBase[0] || {},
    seVe: /Erreka viejo/.test(lista.innerText),
    campoVacio: document.getElementById('msj-txt').value === '',
  };
});
paso('al abrir un hilo sin nada, se dice qué es y para qué sirve',
  /Todavía no hay nada escrito/.test(escribir.decia));
paso('se guarda el mensaje', escribir.cuantos === 1);
paso('y se ve en el hilo sin recargar', escribir.seVe === true);
paso('queda escrito quién lo escribió', !!escribir.guardado.quien, escribir.guardado.quien);
paso('y de qué asistencia es', escribir.guardado.aviso_id === 'av-m1');
paso('el campo se vacía, para no mandarlo dos veces', escribir.campoVacio === true);

/* El hilo cuelga también de la puerta, aunque se escriba desde la visita. Lo
   hace el disparador de la base; aquí se comprueba que la aplicación manda lo
   que ese disparador necesita. */
const laPuerta = await T(() => {
  const g = window.__T;
  const m = (window.__DB.mensajes || [])[0] || {};
  const a = g.S.avisos.find(x => x.id === 'av-m1');
  return { enMensaje: m.puerta_id || null, deLaVisita: a ? a.puerta_id : null };
});
paso('el mensaje sabe de qué puerta es, no solo de qué visita',
  laPuerta.enMensaje && laPuerta.enMensaje === laPuerta.deLaVisita);

/* ================================================================
   2. El hilo de la puerta junta las visitas
   ================================================================ */
bloque('2. El hilo de la puerta junta lo escrito en todas sus visitas');

const juntar = await T(async () => {
  const g = window.__T;
  /* Un segundo mensaje, en la OTRA visita de la misma puerta */
  await g.dlgConversacion('av-m2');
  await new Promise(r => setTimeout(r, 400));
  document.getElementById('msj-txt').value = 'Cambiada la banda de seguridad.';
  document.querySelector('[data-act="msj-enviar"]').click();
  await new Promise(r => setTimeout(r, 600));
  /* Y ahora el hilo de la puerta: tienen que salir los dos */
  const pu = g.S.puertas[0];
  await g.dlgConversacionPuerta(pu.id);
  await new Promise(r => setTimeout(r, 500));
  const t = document.getElementById('msj-lista').innerText;
  return {
    elPrimero: /Erreka viejo/.test(t),
    elSegundo: /banda de seguridad/.test(t),
    /* En el hilo de la puerta se mezclan visitas: hay que decir de cuál es
       cada mensaje, o no se entiende nada */
    diceDeQueVisita: /Correctiva|Preventiva/.test(t),
  };
});
paso('sale lo escrito en la primera visita', juntar.elPrimero === true);
paso('y lo escrito en la segunda',          juntar.elSegundo === true);
paso('y cada mensaje dice de qué visita viene', juntar.diceDeQueVisita === true);

/* ================================================================
   3. No se edita y no se borra
   ================================================================ */
bloque('3. Es un registro, no un chat');

const registro = await T(() => {
  const g = window.__T;
  const html = document.getElementById('dlg-form').innerHTML;
  return {
    /* Si algún día alguien mete un botón de borrar o de editar, esto se pone
       en rojo y hay que venir a leer por qué no debe estar. */
    sinBorrar: !/data-act="msj-borrar"|data-act="msj-editar"/.test(html),
    /* Y se le dice a quien escribe, para que no lo descubra después */
    seAvisa: /no se puede.*editar ni borrar/i.test(document.getElementById('dlg-form').innerText),
    /* La única acción sobre un mensaje ya escrito */
    soloChincheta: /data-act="msj-fijar"/.test(html),
  };
});
paso('NO hay botón de borrar ni de editar un mensaje', registro.sinBorrar === true);
paso('y se avisa de que lo escrito no se toca',        registro.seAvisa === true);
paso('lo único que se puede cambiar es la chincheta',  registro.soloChincheta === true);

/* ================================================================
   4. La chincheta
   ================================================================ */
bloque('4. La chincheta: lo que hay que saber antes de ir');

const chincheta = await T(async () => {
  const g = window.__T;
  const ms = window.__DB.mensajes || [];
  const id = ms[0].id;
  await g.fijarMensaje(id);
  await new Promise(r => setTimeout(r, 500));
  const tras = (window.__DB.mensajes || []).find(m => m.id === id) || {};
  /* Lo fijado sale arriba del todo, aunque sea el más antiguo */
  const orden = g.ordenMensajes(window.__DB.mensajes || []).map(m => m.id);
  return { fijado: tras.fijado === true, primero: orden[0] === id,
           texto: tras.texto, queSeToco: Object.keys(tras).length };
});
paso('poner la chincheta la guarda', chincheta.fijado === true);
paso('y el mensaje fijado sale arriba del hilo', chincheta.primero === true);
paso('fijar NO cambia el texto del mensaje',
  /Erreka viejo/.test(chincheta.texto || ''));

/* En la ficha de la puerta, lo fijado se lee sin abrir nada */
const enFicha = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  const pu = g.S.puertas[0];
  g.S.ficha = pu.id; g.S.tab = 'puertas'; g.pintar();
  await new Promise(r => setTimeout(r, 700));
  const caja = document.getElementById('fijados-ficha');
  const t = caja ? caja.innerText : '';
  return {
    hay: !!caja,
    seLee: /Erreka viejo/.test(t),
    loDice: /saberlo antes de ir/i.test(t),
    /* Lo NO fijado no se enseña aquí: si saliera todo, esto dejaría de ser
       «lo que hay que saber» y sería el hilo entero otra vez */
    soloLoFijado: !/banda de seguridad/.test(t),
  };
});
paso('la ficha de la puerta tiene su sitio para lo fijado', enFicha.hay === true);
paso('y se lee sin abrir ningún botón',        enFicha.seLee === true);
paso('diciendo para qué es',                   enFicha.loDice === true);
paso('solo lo fijado, no la conversación entera', enFicha.soloLoFijado === true);

/* ================================================================
   5. EL CLIENTE NO LO VE. NUNCA.
   ================================================================
   La comprobación más importante de la suite. En un hilo interno se
   escriben cosas que no pueden salir impresas jamás.
   ================================================================ */
bloque('5. El cliente no lo ve en ningún sitio');

const fuera = await T(async () => {
  const g = window.__T;
  /* Un mensaje con una frase que no debe aparecer en ningún papel */
  await g.dlgConversacion('av-m1');
  await new Promise(r => setTimeout(r, 400));
  document.getElementById('msj-txt').value = 'OJO ESTE CLIENTE NO PAGA A TIEMPO';
  document.querySelector('[data-act="msj-enviar"]').click();
  await new Promise(r => setTimeout(r, 600));
  g.cerrarDlg();

  const mira = async fn => {
    let h = '';
    const abrir = window.open;
    window.open = () => ({ document:{ write: t => { h += t; }, close(){} } });
    try { await fn(); } catch(e){ h += ' ERROR:'+e.message; }
    window.open = abrir;
    return h;
  };
  const parte = await mira(() => g.hojaParte('av-m1'));
  const pu = g.S.puertas[0];
  const vida = await mira(() => g.vidaPuerta(pu.id, 'cliente'));
  return {
    enElParte: /NO PAGA A TIEMPO/.test(parte),
    enLaVida:  /NO PAGA A TIEMPO/.test(vida),
    parteSalio: parte.length > 500,
    vidaSalio:  vida.length > 500,
  };
});
paso('los documentos de prueba se han generado de verdad',
  fuera.parteSalio && fuera.vidaSalio);
paso('EL PARTE DEL CLIENTE NO LLEVA LA CONVERSACIÓN', fuera.enElParte === false);
paso('LA VIDA DE LA PUERTA DEL CLIENTE TAMPOCO',      fuera.enLaVida  === false);

/* Y que no haya ninguna función pública que lea la tabla, que es por donde
   entraría el cliente desde el QR sin tener sesión. */
const publico = await T(() => {
  const fn = Object.keys(window.__DB.__rpc || {});
  return { rpc: fn.filter(n => /mensaje/i.test(n)) };
});
paso('ninguna función pública del QR lee los mensajes',
  publico.rpc.length === 0, publico.rpc.join(', ') || 'ninguna');

/* ================================================================
   6. El botón y su número
   ================================================================ */
bloque('6. El botón de la tarjeta');

const boton = await T(async () => {
  const g = window.__T;
  await g.contarMensajes();
  const h = g.botonConversacion('av-m1');
  const n = (g.S.nMensajes || {})['av-m1'] || {};
  return {
    lleva: /Conversación/.test(h),
    cuenta: /Conversación · \d/.test(h),
    total: n.total || 0,
    avisaFijado: /📌/.test(h),
    /* Sin la tabla en la base, no sale nada y la aplicación va igual */
    sinTabla: (() => { const antes = g.S.sinMensajes; g.S.sinMensajes = true;
      const r = g.botonConversacion('av-m1'); g.S.sinMensajes = antes; return r; })(),
  };
});
paso('el botón dice «Conversación»',            boton.lleva === true);
paso('y cuántos mensajes hay',                  boton.cuenta === true, boton.total+' mensajes');
paso('y avisa si alguno va con chincheta',      boton.avisaFijado === true);
paso('sin la tabla en la base, no sale el botón', boton.sinTabla === '');

/* ================================================================
   Final
   ================================================================ */
console.log('\n'+ok+' bien, '+mal+' mal.');
if (errores.length) console.log('Errores de JavaScript:\n'+errores.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || errores.length ? 1 : 0);
