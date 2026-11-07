/* ================================================================
   falso.mjs — el desplazamiento en falso lo marca el técnico.
                                                      07-11-2026

   POR QUÉ EXISTE
   David, probando las asistencias en campo:

     «El desplazamiento en falso es un punto que me parece
      importante, pero no está donde debe. Este punto lo deben
      activar los técnicos. No en oficina, ni como parte de la
      creación de ninguna asistencia. Por lo tanto, debe aparecer en
      cualquiera de las diferentes asistencias que crea oficina. Y
      cuando el técnico valore que es una asistencia en falso,
      explicándolo en la app, pueda activarla, cerrando el parte para
      que desde oficina se vuelva a gestionar la asistencia con el
      cliente, pero cobrándole al cliente el desplazamiento.»

   LO QUE ESTABA MAL, Y ERA DOBLE
   Nadie sabe que un viaje ha sido en balde hasta que llega, así que
   pedirle a la oficina que lo elija al crear la visita es pedirle
   que adivine. Y además: la aplicación DECÍA que un falso no se
   factura, y se facturaba entero, con mano de obra de un trabajo
   que nadie hizo. Se comprobó con números antes de tocar nada.

   LO QUE SE VIGILA AQUÍ
     · que el tipo ya no se ofrezca al crear, pero las visitas
       antiguas con ese tipo se sigan pudiendo abrir;
     · que la casilla esté en CUALQUIER visita y pida explicación;
     · que al marcarla el parte se cierre sin pedir horas, ni ficha
       de puerta, ni firma: no se ha trabajado y no había nadie;
     · que la visita aparezca en la lista de la oficina y salga de
       ella solo cuando alguien lo dice;
     · que la visita nueva deje el rastro de cuál sustituye.
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
    /* Una avería abierta, que va a salir en balde */
    db.avisos.push({ id:'fa-1', tipo:'averia', estado:'asignado', prioridad:'normal',
      tecnico_id:'usuario-admin', cliente_id:cli, puerta_id:db.puertas[0].id,
      descripcion:'La corredera no cierra del todo', creado:new Date().toISOString() });
    /* Una instalación, de las que exigen documentar la puerta: ahí el viaje en
       balde tiene que poder cerrarse igual, sin ficha ni fotos. */
    db.avisos.push({ id:'fa-obra', tipo:'instalacion', estado:'asignado', prioridad:'normal',
      tecnico_id:'usuario-admin', cliente_id:cli, puerta_id:null,
      descripcion:'Montar la puerta nueva del muelle', creado:new Date().toISOString() });
    /* Y una DE ANTES, del tipo viejo, ya cerrada */
    db.avisos.push({ id:'fa-vieja', tipo:'falso', estado:'cerrado', prioridad:'normal',
      tecnico_id:'usuario-admin', cliente_id:cli,
      descripcion:'No había nadie', trabajo:'Viaje en balde', horas:1,
      creado:'2026-10-15T09:00:00.000Z', cerrado:'2026-10-15T10:00:00.000Z' });
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
   1. Ya no se crea desde la oficina
   ================================================================ */
bloque('1. El tipo deja de ofrecerse');

const tipos = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null);
  await new Promise(r => setTimeout(r, 900));
  const nueva = [...document.querySelectorAll('#a-tipo option')].map(o => o.value);
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 400));
  /* Pero una que YA es de ese tipo se tiene que poder abrir y editar */
  g.dlgAviso(null, 'fa-vieja');
  await new Promise(r => setTimeout(r, 1000));
  const vieja = [...document.querySelectorAll('#a-tipo option')].map(o => o.value);
  const elegido = (document.getElementById('a-tipo') || {}).value || '';
  g.cerrarDlg();
  return { nueva, vieja, elegido, reglas: {
    marcado: g.esFalso({ falso:true }), porTipo: g.esFalso({ tipo:'falso' }),
    normal: g.esFalso({ tipo:'averia' }), nulo: g.esFalso(null) } };
});
paso('al crear una asistencia ya no se ofrece «desplazamiento en falso»',
  !tipos.nueva.includes('falso'), tipos.nueva.join(' · '));
paso('pero siguen estando los demás tipos',
  ['averia','instalacion','mantenimiento','urgencia'].every(t => tipos.nueva.includes(t)));
/* Si no se dejara, una visita de octubre no se podría ni abrir para corregir un
   teléfono: al guardar le cambiaría el tipo sin querer. */
paso('una visita antigua de ese tipo sí se puede abrir, con su tipo puesto',
  tipos.vieja.includes('falso') && tipos.elegido === 'falso', tipos.elegido);
paso('la marca nueva y el tipo viejo cuentan los dos como viaje en balde',
  tipos.reglas.marcado === true && tipos.reglas.porTipo === true);
paso('y una visita normal no', tipos.reglas.normal === false && tipos.reglas.nulo === false);

/* ================================================================
   2. La casilla, en el cierre de cualquier visita
   ================================================================ */
bloque('2. La casilla del técnico');

const casilla = await T(async () => {
  const g = window.__T;
  g.dlgCierre('fa-1');
  await new Promise(r => setTimeout(r, 1500));
  const hay = !!document.getElementById('z-falso');
  const motivoOculto = document.getElementById('z-caja-falso').hidden;
  const c = document.getElementById('z-falso');
  c.checked = true; c.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 300));
  const motivoVisible = !document.getElementById('z-caja-falso').hidden;
  /* Cerrar sin explicar */
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 900));
  const err = (document.querySelector('#dlg-form .err') || {}).textContent || '';
  return { hay, motivoOculto, motivoVisible, err };
});
paso('la casilla está en el cierre de una avería', casilla.hay === true);
paso('y la explicación no estorba mientras no se marque', casilla.motivoOculto === true);
paso('al marcarla, se pide la explicación', casilla.motivoVisible === true);
/* Un viaje en balde sin explicación no se le puede reclamar a nadie */
paso('sin explicar, el parte no se cierra',
  /desplazamiento en falso/i.test(casilla.err) && /encontrado/i.test(casilla.err), casilla.err);

const cerrado = await T(async () => {
  const g = window.__T;
  document.getElementById('z-falsomot').value = 'Nave cerrada a las 9:15, nadie contesta al teléfono';
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 2500));
  const abierto = !!document.getElementById('dlg').open;
  const a = g.S.avisos.find(x => x.id === 'fa-1');
  return { abierto, falso: !!a.falso, motivo: a.falso_motivo || '',
           estado: a.estado, cerrado: !!a.cerrado, trabajo: a.trabajo || '',
           firmaSin: a.firma_sin || '', resuelto: !!a.falso_resuelto };
});
/* Lo que pidió David: «cerrando el parte». Sin horas, sin firma y sin ficha. */
paso('con la explicación, el parte se cierra', cerrado.abierto === false && cerrado.cerrado === true);
paso('queda marcado como viaje en balde', cerrado.falso === true);
paso('con lo que se encontró el técnico', /Nave cerrada/.test(cerrado.motivo), cerrado.motivo);
paso('el parte dice lo que pasó, sin que el técnico escriba dos veces',
  /Desplazamiento en falso: Nave cerrada/.test(cerrado.trabajo), cerrado.trabajo);
/* No había nadie: por eso no hay firma, y esa es la explicación que se guarda */
paso('y la falta de firma queda explicada sola',
  /Desplazamiento en falso/.test(cerrado.firmaSin), cerrado.firmaSin);
paso('nace sin gestionar: hay que volver a quedar', cerrado.resuelto === false);

const obra = await T(async () => {
  const g = window.__T;
  /* Una instalación SIN puerta dada de alta: normalmente no deja cerrar */
  g.dlgCierre('fa-obra');
  await new Promise(r => setTimeout(r, 1500));
  const c = document.getElementById('z-falso');
  c.checked = true; c.dispatchEvent(new Event('change', { bubbles:true }));
  document.getElementById('z-falsomot').value = 'La obra civil no estaba hecha, no había hueco';
  await new Promise(r => setTimeout(r, 300));
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 2500));
  const err = document.getElementById('dlg-form')
    ? ((document.querySelector('#dlg-form .err') || {}).textContent || '') : '';
  const a = g.S.avisos.find(x => x.id === 'fa-obra');
  if (document.getElementById('dlg').open) g.cerrarDlg();
  return { err, cerrado: !!a.cerrado, falso: !!a.falso };
});
/* Un bloqueo imposible de cumplir se acaba sorteando: el técnico no ha visto la
   puerta, así que no puede documentarla. */
paso('una instalación en balde se cierra sin exigir la ficha de la puerta',
  obra.cerrado === true, obra.err);
paso('y queda marcada igual', obra.falso === true);

/* ================================================================
   3. La lista de la oficina
   ================================================================ */
bloque('3. Hay que volver a quedar');

const lista = await T(() => {
  const g = window.__T;
  const xs = g.falsosPendientes();
  return { ids: xs.map(a => a.id), cuantos: xs.length };
});
paso('los dos viajes en balde salen en la lista',
  lista.ids.includes('fa-1') && lista.ids.includes('fa-obra'), lista.ids.join(' · '));
/* La de octubre es del tipo viejo y no tiene la marca: no se la reclama a nadie
   ahora, que es lo correcto. Lo que cuenta es lo que se cierra desde hoy. */
paso('la de octubre, del tipo viejo, no se cuela en la lista de hoy',
  !lista.ids.includes('fa-vieja'));

const gestionada = await T(async () => {
  const g = window.__T;
  g.S.tab = 'gestion';
  g.pintar();
  await new Promise(r => setTimeout(r, 1200));
  const panel = [...document.querySelectorAll('#vista .panel')]
    .find(p => /Viajes en balde/i.test(p.textContent || ''));
  const texto = panel ? panel.textContent : '';
  const btn = panel ? panel.querySelector('[data-act="falso-ok"]') : null;
  if (btn) btn.click();
  await new Promise(r => setTimeout(r, 2000));
  const a = g.S.avisos.find(x => x.id === 'fa-1');
  return { hayPanel: !!panel, texto, resuelto: !!a.falso_resuelto,
           quedan: g.falsosPendientes().map(x => x.id) };
});
paso('en Gestión hay un panel con los viajes en balde', gestionada.hayPanel === true);
paso('y dice lo que se le cobra al cliente',
  /desplazamiento/i.test(gestionada.texto), gestionada.texto.slice(0, 120));
paso('al decir que ya está gestionada, sale de la lista',
  gestionada.resuelto === true && !gestionada.quedan.includes('fa-1'),
  gestionada.quedan.join(' · '));

const nueva = await T(async () => {
  const g = window.__T;
  const panel = [...document.querySelectorAll('#vista .panel')]
    .find(p => /Viajes en balde/i.test(p.textContent || ''));
  const btn = panel ? panel.querySelector('[data-act="falso-nueva"]') : null;
  if (!btn) return { sinBoton: true };
  btn.click();
  await new Promise(r => setTimeout(r, 1200));
  const desc = (document.getElementById('a-desc') || {}).value || '';
  const notas = (document.getElementById('a-notas') || {}).value || '';
  const cli = (document.getElementById('a-cliente') || {}).value || '';
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 2500));
  const origen = g.S.avisos.find(x => x.id === 'fa-obra');
  return { desc, notas, cli,
           resuelto: !!origen.falso_resuelto, enlace: origen.falso_nueva_id || null,
           quedan: g.falsosPendientes().map(x => x.id) };
});
paso('el botón abre una visita nueva con lo que se iba a hacer',
  /puerta nueva del muelle/i.test(nueva.desc || ''), nueva.desc);
/* El técnico que vaya la segunda vez tiene que saber qué pasó la primera */
paso('y con el aviso de que ya se fue una vez en balde',
  /en balde/i.test(nueva.notas || '') && /obra civil/i.test(nueva.notas || ''), nueva.notas);
paso('con su cliente ya puesto', !!nueva.cli);
paso('al guardarla, la de origen queda gestionada', nueva.resuelto === true);
/* El rastro: cuántos viajes costó de verdad ese trabajo */
paso('y enlazada con la que la sustituye', !!nueva.enlace, nueva.enlace);
paso('la lista se queda vacía', nueva.quedan.length === 0, nueva.quedan.join(' · '));

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
