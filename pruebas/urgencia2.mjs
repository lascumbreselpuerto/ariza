/* ================================================================
   urgencia2.mjs — el recargo lo elige la oficina al crear.
                                                      07-11-2026

   POR QUÉ EXISTE
   David, probando las asistencias en campo:

     «El recargo de urgencia debe aparecer en la creación de la
      asistencia de urgencia, no en el cierre. La oficina elige:
      primero, fuera de horario; segundo, urgencia; tercero, fuera de
      horario más urgencia. Siendo un por dos en fuera de horario, un
      por dos en urgencia y un por tres en fuera de horario más
      urgencia. Esta info no es relevante para el técnico.»

   Y: «Urgencia fuera de horario no lo valoro correcto. Debería ser
   urgencia / fuera de horario, ya que puede ser una cosa o las dos.»

   LO QUE ESTABA MAL
   El factor lo decidía el RELOJ: salía de la hora a la que el técnico
   sellaba «He llegado». Eso deja fuera la mitad del caso real, porque
   una visita puede ser urgente sin ser de noche: el comercio que no
   puede cerrar la persiana a las once de la mañana paga una urgencia,
   y el reloj decía que era horario laboral.

   LO QUE SE VIGILA AQUÍ
     · los tres motivos, con sus multiplicadores (2, 2 y 3);
     · que sin motivo no se pueda guardar una urgencia;
     · que el motivo escriba el factor, que es lo que cobra;
     · que al técnico no se le pregunte nada en el cierre;
     · que una urgencia DE ANTES, sin motivo, siga funcionando como
       funcionaba: eso es dinero ya cobrado.
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
    /* Una urgencia DE ANTES del 07-11-2026: con factor guardado y sin motivo.
       Es la que no se puede tocar, porque su importe ya está cobrado. */
    db.avisos.push({ id:'ur-vieja', tipo:'urgencia', estado:'asignado', prioridad:'urgente',
      tecnico_id:'usuario-admin', cliente_id:cli, puerta_id:db.puertas[0].id,
      urgencia_factor: 3, descripcion:'Urgencia de las de antes',
      hora_inicio:'2026-10-20T23:30:00.000Z',
      creado:'2026-10-20T23:00:00.000Z' });
    /* Y una nueva, ya con motivo elegido */
    db.avisos.push({ id:'ur-nueva', tipo:'urgencia', estado:'asignado', prioridad:'urgente',
      tecnico_id:'usuario-admin', cliente_id:cli, puerta_id:db.puertas[0].id,
      urgencia_modo:'ambas', urgencia_factor: 3, descripcion:'Urgencia de hoy',
      creado:new Date().toISOString() });
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
   1. El nombre y los tres motivos
   ================================================================ */
bloque('1. Los tres motivos');

const cat = await T(() => {
  const g = window.__T;
  return {
    nombreTipo: g.ASISTENCIAS.urgencia,
    claves: g.URGENCIA_MODOS.map(x => x[0]),
    nombres: g.URGENCIA_MODOS.map(x => x[1]),
    fuera: g.factorDeModo('fuera'),
    urgente: g.factorDeModo('urgente'),
    ambas: g.factorDeModo('ambas'),
    inventado: g.factorDeModo('lo_que_sea'),
    vacio: g.factorDeModo(''),
    nulo: g.factorDeModo(null),
    nombre: g.nombreUrgModo('ambas'),
    nombreMalo: g.nombreUrgModo('no_existe'),
  };
});
/* El nombre del tipo: una visita puede ser urgente sin ser de noche */
paso('el tipo se llama «Urgencia / fuera de horario»',
  cat.nombreTipo === 'Urgencia / fuera de horario', cat.nombreTipo);
paso('hay tres motivos', cat.claves.join(',') === 'fuera,urgente,ambas', cat.claves.join(' · '));
paso('una sola cosa son ×2', cat.fuera === 2 && cat.urgente === 2,
  cat.fuera+' / '+cat.urgente);
paso('las dos a la vez son ×3', cat.ambas === 3, cat.ambas);
/* Un motivo que no existe NO puede dar factor: daría un recargo salido de la
   nada sobre una factura. */
paso('un motivo inventado no da ningún factor',
  cat.inventado === null && cat.vacio === null && cat.nulo === null);
paso('cada motivo tiene su nombre', cat.nombre === 'Urgencia y fuera de horario', cat.nombre);
paso('y uno que no existe no se inventa nombre', cat.nombreMalo === '', cat.nombreMalo);

const explica = await T(() => {
  const g = window.__T;
  return { ambas: g.explicaUrgModo('ambas'), vacio: g.explicaUrgModo('') };
});
/* El dinero, dicho en claro en el momento de elegirlo: un recargo que no se ve
   al ponerlo se pone mal. */
paso('al elegir se dice qué se multiplica',
  /por 3/.test(explica.ambas) && /mano de obra/.test(explica.ambas) &&
  /desplazamiento/.test(explica.ambas), explica.ambas);
paso('y que el material no lleva recargo', /material/i.test(explica.ambas));
paso('sin elegir, se dice que hay que elegirlo', /Elígelo/i.test(explica.vacio), explica.vacio);

/* ================================================================
   2. Al crear la urgencia
   ================================================================ */
bloque('2. Crear una urgencia');

const alta = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null);
  await new Promise(r => setTimeout(r, 900));
  const caja = document.getElementById('a-caja-urg');
  const ocultoEnAveria = caja.hidden;
  const tipo = document.getElementById('a-tipo');
  tipo.value = 'urgencia';
  tipo.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 300));
  const visible = !caja.hidden;
  const ops = [...document.querySelectorAll('#a-urgmodo option')].map(o => o.textContent.trim());
  /* Guardar sin elegir motivo */
  document.getElementById('a-cliente').value = g.S.clientes[0].id;
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 700));
  const err = (document.querySelector('#dlg-form .err') || {}).textContent || '';
  /* Ahora con motivo */
  const sel = document.getElementById('a-urgmodo');
  sel.value = 'urgente';
  sel.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 200));
  const pista = (document.getElementById('a-urgpista') || {}).textContent || '';
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 2000));
  const nueva = g.S.avisos.filter(a => a.tipo === 'urgencia' && !['ur-vieja','ur-nueva'].includes(a.id))
    .sort((a,b) => String(b.creado||'').localeCompare(String(a.creado||'')))[0];
  return { ocultoEnAveria, visible, ops, err, pista,
           modo: nueva ? nueva.urgencia_modo : null,
           factor: nueva ? nueva.urgencia_factor : null };
});
paso('en una avería no se pregunta el recargo', alta.ocultoEnAveria === true);
paso('al poner urgencia, aparece', alta.visible === true);
/* El multiplicador va escrito en la opción: elegir a ciegas un ×3 es elegir mal */
paso('cada opción dice su multiplicador',
  alta.ops.filter(t => /×2|×3/.test(t)).length === 3, alta.ops.join(' | '));
paso('sin motivo no se guarda la urgencia', /Di por qué/i.test(alta.err), alta.err);
paso('y se dice que lo elige quien habla con el cliente',
  /hablando con él/i.test(alta.err));
paso('al elegirlo, la pista dice lo que supone', /por 2/.test(alta.pista), alta.pista);
paso('se guarda el motivo', alta.modo === 'urgente', alta.modo);
/* Esto es lo que de verdad cobra: el factor. Si el motivo se guardara y el
   factor no, la visita se valoraría sin recargo y nadie lo vería. */
paso('y el factor que le corresponde', Number(alta.factor) === 2, alta.factor);

const cambioTipo = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null, 'ur-nueva');
  await new Promise(r => setTimeout(r, 1100));
  const modoAlAbrir = (document.getElementById('a-urgmodo') || {}).value || '';
  /* Se cambia a preventiva: el recargo no puede quedarse pegado */
  const tipo = document.getElementById('a-tipo');
  tipo.value = 'mantenimiento';
  tipo.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 300));
  const oculto = document.getElementById('a-caja-urg').hidden;
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 2000));
  const a = g.S.avisos.find(x => x.id === 'ur-nueva');
  return { modoAlAbrir, oculto, modo: a ? a.urgencia_modo : 'x', factor: a ? a.urgencia_factor : 'x' };
});
paso('una urgencia ya creada se abre con su motivo puesto',
  cambioTipo.modoAlAbrir === 'ambas', cambioTipo.modoAlAbrir);
paso('al cambiar el tipo, el recargo desaparece de la pantalla', cambioTipo.oculto === true);
/* Un recargo pegado a una preventiva es dinero cobrado sin motivo */
paso('y no se queda pegado al guardar',
  cambioTipo.modo === null && cambioTipo.factor === null,
  cambioTipo.modo+' / '+cambioTipo.factor);

/* ================================================================
   3. Al técnico no se le pregunta
   ================================================================ */
bloque('3. El cierre');

const cierre = await T(async () => {
  const g = window.__T;
  /* Se devuelve ur-nueva a urgencia con su motivo */
  await g.sb.from('avisos').update({ tipo:'urgencia', urgencia_modo:'ambas',
    urgencia_factor:3 }).eq('id','ur-nueva');
  await g.cargar();
  g.dlgCierre('ur-nueva');
  await new Promise(r => setTimeout(r, 1500));
  const hay = !!document.getElementById('z-urg');
  const texto = document.getElementById('dlg-form').textContent || '';
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 400));
  /* Y en una de las de antes, sin motivo, sí se sigue preguntando */
  g.dlgCierre('ur-vieja');
  await new Promise(r => setTimeout(r, 1500));
  const hayVieja = !!document.getElementById('z-urg');
  g.cerrarDlg();
  return { hay, hayVieja, recargoEnTexto: /Recargo de urgencia/i.test(texto) };
});
/* «Esta info no es relevante para el técnico»: ni se le enseña ni se le pide */
paso('en una urgencia con motivo elegido, el cierre no pregunta el recargo',
  cierre.hay === false);
paso('ni lo enseña', cierre.recargoEnTexto === false);
/* Pero las de antes no se quedan sin poder ajustarse: su factor salía de la
   hora de llegada y alguien tiene que poder corregirlo. */
paso('una urgencia de las de antes sí lo sigue teniendo', cierre.hayVieja === true);

const guardado = await T(async () => {
  const g = window.__T;
  const antes = g.S.avisos.find(x => x.id === 'ur-nueva').urgencia_factor;
  g.dlgCierre('ur-nueva');
  await new Promise(r => setTimeout(r, 1500));
  const t = document.getElementById('z-trab');
  if (t) t.value = 'Reparada la fotocélula';
  const d = document.getElementById('z-diag');
  if (d) d.value = 'Fotocélula desalineada';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'ur-nueva'), false);
  await new Promise(r => setTimeout(r, 1200));
  const a = g.S.avisos.find(x => x.id === 'ur-nueva');
  g.cerrarDlg();
  return { antes, despues: a ? a.urgencia_factor : null, modo: a ? a.urgencia_modo : null };
});
/* El fallo que había que evitar: que al guardar el parte se recalculara el
   factor con la hora de llegada y se pisara lo que decidió la oficina. */
paso('guardar el parte no cambia el factor que puso la oficina',
  Number(guardado.despues) === Number(guardado.antes),
  guardado.antes+' → '+guardado.despues);
paso('ni el motivo', guardado.modo === 'ambas', guardado.modo);

/* ================================================================
   4. Las urgencias de antes no se mueven
   ================================================================ */
bloque('4. El histórico');

const vieja = await T(() => {
  const g = window.__T;
  const a = g.S.avisos.find(x => x.id === 'ur-vieja');
  return { factor: a.urgencia_factor, modo: a.urgencia_modo == null,
           propuesta: g.factorUrgencia(a) };
});
paso('una urgencia de antes conserva su factor', Number(vieja.factor) === 3, vieja.factor);
paso('y no tiene motivo, porque entonces no se elegía', vieja.modo === true);
/* La cuenta vieja sigue viva para ellas: es de donde salía su factor */
paso('para esas, la aplicación sigue sabiendo proponer por la hora',
  !!vieja.propuesta && vieja.propuesta.factor > 0,
  vieja.propuesta ? (vieja.propuesta.factor+': '+vieja.propuesta.motivo) : 'sin propuesta');

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
