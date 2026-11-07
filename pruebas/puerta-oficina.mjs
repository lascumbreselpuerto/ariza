/* ================================================================
   puerta-oficina.mjs — la puerta, creada desde la oficina.
                                                      07-11-2026

   POR QUÉ EXISTE
   David, probando las asistencias en campo:

     · «En la creación de asistencia desde la oficina se debe poder
       crear puertas. No obligatoria, pero sí conveniente. Con una
       creación básica, con el tipo de puerta sería suficiente, con
       la posibilidad de cambiar el tipo el técnico.»
     · «En la preventiva, en qué puertas se revisan, la oficina debe
       poder crear de manera básica la puerta, al menos el tipo.»
     · «En puesta en servicio debe ser obligatorio elegir la puerta,
       que ya se debió documentar en la primera actuación.»
     · «Al dar de alta la puerta desde una asistencia, el cliente que
       debe salir marcado es el de la asistencia.»
     · «Si elegimos un centro, la dirección que debe salir es la del
       centro elegido. Ahora sale la que ya estaba.»
     · «En instalador y año deberíamos poder elegir desconocido.»

   LO QUE SE VIGILA AQUÍ
     · que el alta rápida pida el tipo y NADA más;
     · que lo escrito en la asistencia no se pierda al crear la
       puerta, que es el fallo que ya pasó una vez con el cliente;
     · que una puesta en servicio no se guarde sin puerta, pero que
       una ya cerrada se siga pudiendo corregir;
     · que el cliente de la asistencia llegue solo a la ficha;
     · que elegir centro cambie la dirección Y diga cuál había;
     · que «no se sabe» y un valor escrito no convivan.
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
    /* Dos centros del mismo cliente, para lo de la dirección */
    db.centros = db.centros || [];
    db.centros.push(
      { id:'ce-a', cliente_id:cli, nombre:'Nave A', direccion:'Polígono El Palmar 4',
        poblacion:'El Puerto de Santa María' },
      { id:'ce-b', cliente_id:cli, nombre:'Nave B', direccion:'Camino de los Enamorados 22',
        poblacion:'Jerez' });
    /* Una puesta en servicio abierta y SIN puerta: la que no debe poder guardarse */
    db.avisos.push({ id:'po-ps', tipo:'puesta_servicio', estado:'asignado', prioridad:'normal',
      cliente_id:cli, puerta_id:null, descripcion:'Rematar la obra de la nave',
      creado:new Date().toISOString() });
    /* Y una ya cerrada sin puerta, de las de antes: esa sí se puede corregir.
       Lleva causa puesta a propósito: lo que se prueba aquí es la regla de la
       puerta, no la de la causa, que es de la entrega del 05-11-2026 y tiene su
       propia suite. */
    db.avisos.push({ id:'po-ps-vieja', tipo:'puesta_servicio', estado:'cerrado', prioridad:'normal',
      ps_causa:'sin_corriente',
      cliente_id:cli, puerta_id:null, descripcion:'Remate antiguo',
      creado:'2026-10-01T09:00:00.000Z', cerrado:'2026-10-01T13:00:00.000Z',
      trabajo:'Hecho', horas:2 });
    /* Una avería con cliente, para crear la puerta desde ella */
    db.avisos.push({ id:'po-av', tipo:'averia', estado:'asignado', prioridad:'normal',
      cliente_id:cli, puerta_id:null, descripcion:'No cierra del todo',
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
   1. El alta rápida: solo el tipo
   ================================================================ */
bloque('1. El alta rápida');

const rapida = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  let creada = null;
  g.dlgPuertaRapida(cli.id, 'C/ Larga 4', id => { creada = id; });
  await new Promise(r => setTimeout(r, 700));
  const f = document.getElementById('dlg-form');
  /* Los campos que se pueden escribir, por su id. Se miran solo los que tienen
     id: el diálogo trae alguno suyo sin identificar y no es del formulario. */
  const campos = [...f.querySelectorAll('input:not([type=hidden]), select, textarea')]
    .filter(e => !e.disabled && e.id).map(e => e.id);
  /* El nombre del cliente está en el VALOR de un campo apagado, no en el texto
     de la página: textContent no lee los valores de los inputs. */
  const cliEnPantalla = [...f.querySelectorAll('input[disabled]')].map(e => e.value).join(' | ');
  /* Guardar sin elegir tipo: no debe dejar */
  f.querySelector('button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 500));
  const err = (f.querySelector('.err') || {}).textContent || '';
  /* Ahora con tipo */
  document.getElementById('pr-tipo').value = 'Seccional';
  document.getElementById('pr-ubi').value = 'Portón del muelle';
  f.querySelector('button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 1800));
  const p = creada ? g.puertaDe(creada) : null;
  return { campos, err, cliEnPantalla, cliNombre: cli.nombre,
           creada: !!creada,
           tipo: p ? p.tipo : '', ubi: p ? p.ubicacion : '', dir: p ? p.direccion : '',
           cid: p ? p.cliente_id : '', cliEsperado: cli.id,
           nombreCli: p ? p.cliente : '', codigo: p ? (p.codigo || '') : 'x' };
});
/* Lo que se pide es UNA cosa. Si esto crece, el alta rápida deja de ser rápida
   y vuelve a pasar lo de siempre: la puerta no se crea. */
paso('solo se piden dos campos, y uno es opcional',
  rapida.campos.join(',') === 'pr-tipo,pr-ubi', rapida.campos.join(','));
paso('el cliente sale escrito y no se puede cambiar aquí',
  rapida.cliEnPantalla.includes(rapida.cliNombre), rapida.cliEnPantalla);
paso('sin tipo no se crea', /Elige el tipo/i.test(rapida.err), rapida.err);
paso('con el tipo se crea', rapida.creada === true);
paso('con su tipo guardado', rapida.tipo === 'Seccional', rapida.tipo);
paso('el sitio que escribió la oficina', rapida.ubi === 'Portón del muelle', rapida.ubi);
paso('la dirección de la asistencia', rapida.dir === 'C/ Larga 4', rapida.dir);
paso('y colgada del cliente de la asistencia',
  rapida.cid === rapida.cliEsperado && rapida.nombreCli === rapida.cliNombre, rapida.nombreCli);
/* La etiqueta se pega en obra: una puerta creada por teléfono no puede tener
   una etiqueta asignada que nadie ha pegado en ninguna parte. */
paso('nace sin etiqueta, que se pega en obra', rapida.codigo === '', rapida.codigo);

/* ================================================================
   2. Crear la puerta sin perder la asistencia a medias
   ================================================================ */
bloque('2. Sin perder lo escrito');

const desdeAviso = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null);
  await new Promise(r => setTimeout(r, 900));
  document.getElementById('a-cliente').value = g.S.clientes[0].id;
  document.getElementById('a-cliente').dispatchEvent(new Event('change', { bubbles:true }));
  document.getElementById('a-desc').value = 'Lo que había escrito antes de crear la puerta';
  document.getElementById('a-notas').value = 'Preguntar por Manuel';
  await new Promise(r => setTimeout(r, 300));
  /* Se pulsa «Crear la puerta» */
  document.querySelector('[data-act="puerta-rapida"]').click();
  await new Promise(r => setTimeout(r, 800));
  const esRapida = !!document.getElementById('pr-tipo');
  document.getElementById('pr-tipo').value = 'Batiente automática de dos hojas';
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 2200));
  const sel = document.getElementById('a-puerta');
  const p = sel && sel.value ? g.puertaDe(sel.value) : null;
  const r = { esRapida,
    desc: (document.getElementById('a-desc') || {}).value || '',
    notas: (document.getElementById('a-notas') || {}).value || '',
    elegida: !!(sel && sel.value),
    tipo: p ? p.tipo : '' };
  g.cerrarDlg();
  return r;
});
paso('el botón abre el alta rápida', desdeAviso.esRapida === true);
/* Esto es exactamente lo que David nos dijo que pasaba con el cliente: salir a
   crear algo y volver con el formulario en blanco. */
paso('al volver, lo escrito sigue ahí',
  /Lo que había escrito/.test(desdeAviso.desc), desdeAviso.desc);
paso('las notas de oficina también', /Manuel/.test(desdeAviso.notas));
paso('y la puerta nueva queda elegida en la asistencia', desdeAviso.elegida === true);
paso('con el tipo que puso la oficina',
  desdeAviso.tipo === 'Batiente automática de dos hojas', desdeAviso.tipo);

/* ================================================================
   3. La puesta en servicio necesita su puerta
   ================================================================ */
bloque('3. La puesta en servicio');

const ps = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null, 'po-ps');
  await new Promise(r => setTimeout(r, 1200));
  const f = document.getElementById('dlg-form');
  f.querySelector('button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 700));
  const err = (f.querySelector('.err') || {}).textContent || '';
  /* Se elige una puerta y una causa, y ahora sí guarda. La causa es de la
     entrega del 05-11-2026 y se rellena para no mezclar dos reglas. */
  const sel = document.getElementById('a-puerta');
  const op = [...sel.querySelectorAll('option')].find(o => o.value);
  sel.value = op.value;
  sel.dispatchEvent(new Event('change', { bubbles:true }));
  const causa = document.getElementById('a-pscausa');
  if (causa){ causa.value = 'sin_corriente'; causa.dispatchEvent(new Event('change', { bubbles:true })); }
  await new Promise(r => setTimeout(r, 300));
  f.querySelector('button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 2000));
  /* Que haya guardado se mira por si el diálogo se ha CERRADO, no por el nodo ni
     por el texto del error: el formulario se queda en el DOM al cerrarse y
     conserva el mensaje del intento anterior, así que mirar eso daba un rojo que
     no era verdad. */
  const cerrado = !document.getElementById('dlg').open;
  const a = g.S.avisos.find(x => x.id === 'po-ps');
  return { err, cerrado, puerta: a ? a.puerta_id : null };
});
paso('una puesta en servicio sin puerta no se guarda',
  /Elige la puerta/i.test(ps.err), ps.err);
/* El porqué tiene que estar escrito donde se lee, no solo en el manual */
paso('y se explica por qué: la puerta ya se documentó en su día',
  /ya se document/i.test(ps.err));
paso('se dice además cómo salir del paso: crearla aquí mismo',
  /Crear la puerta/i.test(ps.err));
paso('con la puerta elegida sí se guarda, y el formulario se cierra',
  ps.cerrado === true);
paso('y queda enganchada', !!ps.puerta);

const psVieja = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null, 'po-ps-vieja');
  await new Promise(r => setTimeout(r, 1200));
  document.getElementById('a-desc').value = 'Se corrige el teléfono';
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 2000));
  const cerrado = !document.getElementById('dlg').open;
  g.cerrarDlg();
  const a = g.S.avisos.find(x => x.id === 'po-ps-vieja');
  return { cerrado, desc: a ? a.descripcion : '' };
});
/* Un bloqueo que impide corregir un teléfono de una visita de hace un mes no
   documenta nada: solo estorba. Las cerradas son historia. */
paso('una puesta en servicio YA CERRADA sin puerta se sigue pudiendo corregir',
  psVieja.cerrado === true);
paso('y el cambio se guarda', /teléfono/.test(psVieja.desc), psVieja.desc);

/* ================================================================
   4. El cliente llega solo a la ficha de la puerta
   ================================================================ */
bloque('4. El cliente, desde la asistencia');

const cliente = await T(async () => {
  const g = window.__T;
  const av = g.S.avisos.find(x => x.id === 'po-av');
  g.dlgPuerta(null, 'po-av');
  await new Promise(r => setTimeout(r, 900));
  const nombre = (document.getElementById('f-cbusca') || {}).value || '';
  const id = (document.getElementById('f-clid') || {}).value || '';
  const dir = (document.getElementById('f-dir') || {}).value || '';
  g.cerrarDlg();
  const c = g.clienteDe(av.cliente_id);
  return { nombre, id, esperado: av.cliente_id, cli: c ? c.nombre : '', dir };
});
/* El técnico en obra, con prisa, buscando el cliente a mano en una lista de
   cientos: el que se equivoca cuelga la puerta del cliente de al lado. */
paso('el cliente de la asistencia sale ya puesto',
  cliente.id === cliente.esperado, cliente.id);
paso('con su nombre escrito', cliente.nombre === cliente.cli, cliente.nombre);
paso('y una dirección de partida', cliente.dir.length > 0, cliente.dir);

/* ================================================================
   5. El centro manda sobre la dirección
   ================================================================ */
bloque('5. La dirección del centro');

const centro = await T(async () => {
  const g = window.__T;
  g.dlgPuerta(null, 'po-av');
  await new Promise(r => setTimeout(r, 900));
  const dir = document.getElementById('f-dir');
  dir.value = 'Una dirección escrita a mano';
  const sel = document.getElementById('f-centro');
  const hayCentros = [...sel.querySelectorAll('option')].map(o => o.value).filter(Boolean);
  sel.value = 'ce-a';
  sel.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 300));
  const tras = dir.value;
  const pista = (document.getElementById('f-ceestado') || {}).textContent || '';
  /* Y cambiando al otro centro, otra vez */
  sel.value = 'ce-b';
  sel.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 300));
  const segunda = dir.value;
  g.cerrarDlg();
  return { hayCentros, tras, pista, segunda };
});
paso('los centros del cliente salen en la lista', centro.hayCentros.length === 2,
  centro.hayCentros.join(' · '));
/* Esto es lo que David encontró mal: la dirección escrita antes se quedaba y la
   ficha decía que la puerta estaba en un centro con la dirección de otro sitio. */
paso('al elegir un centro, su dirección sustituye a la que había',
  /Polígono El Palmar 4/.test(centro.tras), centro.tras);
paso('y se dice cuál había antes, por si era la buena',
  /Una dirección escrita a mano/.test(centro.pista), centro.pista);
paso('cambiar de centro vuelve a cambiar la dirección',
  /Camino de los Enamorados 22/.test(centro.segunda), centro.segunda);

/* ================================================================
   6. «No se sabe» en el año y en quién la instaló
   ================================================================ */
bloque('6. No se sabe');

const nose = await T(async () => {
  const g = window.__T;
  const p = g.S.puertas[0];
  g.dlgPuerta(p.id);
  await new Promise(r => setTimeout(r, 1000));
  const anio = document.getElementById('f-anio');
  const inst = document.getElementById('f-instalador');
  anio.value = '1998'; inst.value = 'Alguien';
  const cA = document.getElementById('f-anio-nose');
  const cI = document.getElementById('f-inst-nose');
  const hay = !!cA && !!cI;
  cA.checked = true; cA.dispatchEvent(new Event('change', { bubbles:true }));
  cI.checked = true; cI.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 300));
  const apagados = anio.disabled && inst.disabled;
  const vacios = anio.value === '' && inst.value === '';
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 2200));
  const g2 = g.puertaDe(p.id);
  return { hay, apagados, vacios,
    anioDesc: !!g2.anio_desconocido, instDesc: !!g2.instalador_desconocido,
    anio: g2.anio, inst: g2.instalador,
    pintadoAnio: g.anioPuerta(g2), pintadoInst: g.instaladorPuerta(g2),
    pintadoVacio: g.anioPuerta({ anio:null }), pintadoNormal: g.anioPuerta({ anio:2019 }) };
});
paso('la ficha tiene las dos casillas de «no se sabe»', nose.hay === true);
paso('al marcarlas, el campo se apaga', nose.apagados === true);
/* Marcado «no se sabe» con un año escrito dentro es decir dos cosas a la vez, y
   una de ellas es mentira. */
paso('y se queda vacío, para no decir dos cosas a la vez', nose.vacios === true);
paso('se guarda que el año no se sabe', nose.anioDesc === true && nose.anio == null);
paso('y que el instalador tampoco',
  nose.instDesc === true && !String(nose.inst || '').trim());
paso('donde se pinta, pone «No se sabe» y no un hueco',
  nose.pintadoAnio === 'No se sabe' && nose.pintadoInst === 'No se sabe',
  nose.pintadoAnio+' / '+nose.pintadoInst);
/* Y lo de siempre se sigue leyendo igual: en blanco es «no lo he rellenado» */
paso('un año sin rellenar sigue saliendo vacío', nose.pintadoVacio === '');
paso('y un año puesto, tal cual', nose.pintadoNormal === 2019, nose.pintadoNormal);

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
