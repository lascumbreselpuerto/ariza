/* ================================================================
   perifericos.mjs — los trabajos que no son una puerta entera.
                                                      06-11-2026

   POR QUÉ EXISTE
   David, 06-11-2026, revisando la creación de asistencias en campo,
   sobre la instalación: «Periféricos tipo fotocélula sincronizada,
   fotocélula compacta, banda de seguridad, etc. Sustitución de
   motor. Sustitución de central. Otros, dejando abierto un lugar
   donde oficina escriba.»

   LO QUE ESTABA MAL
   La instalación solo tenía cinco subtipos, todos de puerta entera
   o de automatismo. La visita que iba a poner una fotocélula tenía
   que elegir «puerta completa» o «automatismo», y ninguna de las
   dos era verdad: el histórico quedaba sucio y no se podía contar
   cuántas de esas visitas se hacen al año.

   LO QUE SE VIGILA AQUÍ
     · los cuatro subtipos nuevos están en avería Y en instalación,
       y los de siempre no se han movido;
     · se puede marcar más de un periférico a la vez, porque en una
       visita se montan dos fotocélulas y una banda;
     · «otro» sin explicar no se guarda, y «otros trabajos» sin
       explicar tampoco;
     · cambiar de subtipo no deja periféricos pegados al aviso
       diciendo que se montaron (el fallo clásico de los campos que
       aparecen y desaparecen);
     · lo que se monta se lee en la tarjeta del técnico ANTES de
       salir, y en el parte que firma el cliente;
     · crear un cliente a media asistencia no borra lo marcado.
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
    /* Una instalación de periféricos ya creada, para leerla sin crearla */
    db.avisos.push({ id:'pf-1', tipo:'instalacion', subtipo:'perifericos',
      estado:'asignado', prioridad:'normal', tecnico_id:'usuario-admin',
      cliente_id:cli, puerta_id:db.puertas[0].id,
      perifericos:['foto_sinc','banda','otro'],
      perifericos_otro:'bucle de masa en la rampa de bajada',
      descripcion:'Poner protección en el hueco', creado:new Date().toISOString(),
      fecha_prevista:new Date().toISOString().slice(0,10) });
    /* Y una de «otros trabajos», con lo que escribió la oficina */
    db.avisos.push({ id:'pf-otros', tipo:'instalacion', subtipo:'otros',
      estado:'asignado', prioridad:'normal', tecnico_id:'usuario-admin',
      cliente_id:cli, puerta_id:db.puertas[0].id,
      subtipo_detalle:'Montar tope mecánico nuevo y reponer la señalización de la nave 3',
      descripcion:'Lo de la nave 3', creado:new Date().toISOString() });
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
   1. El catálogo: los cuatro subtipos, en los dos tipos
   ================================================================ */
bloque('1. Los subtipos nuevos');

const cat = await T(() => {
  const g = window.__T;
  return {
    av: g.subtiposDe('averia').map(x => x[0]),
    ins: g.subtiposDe('instalacion').map(x => x[0]),
    trabajo: g.SUBTIPOS_TRABAJO.map(x => x[0]),
    nombres: g.SUBTIPOS_TRABAJO.map(x => x[1]),
    mant: g.subtiposDe('mantenimiento').map(x => x[0]),
    com: g.subtiposDe('comercial').map(x => x[0]),
  };
});
paso('los cuatro trabajos nuevos están en avería',
  ['perifericos','sust_motor','sust_central','otros'].every(k => cat.av.includes(k)),
  cat.av.join(' · '));
paso('y los mismos cuatro en instalación',
  ['perifericos','sust_motor','sust_central','otros'].every(k => cat.ins.includes(k)),
  cat.ins.join(' · '));
/* Lo de siempre no se ha movido: si al añadir los nuevos se hubiera perdido
   «garantía», las visitas de garantía dejarían de poder crearse y se facturarían
   como averías. Eso es dinero. */
paso('la avería y la garantía siguen estando, y en ese orden',
  cat.av[0] === 'averia' && cat.av[1] === 'garantia', cat.av.slice(0,2).join(' · '));
paso('los cinco de instalación de siempre siguen estando',
  ['puerta_automatica','puerta_manual','puerta_peatonal','automatismo','normativa']
    .every(k => cat.ins.includes(k)), cat.ins.join(' · '));
paso('el mantenimiento y la comercial siguen sin subtipos',
  cat.mant.length === 0 && cat.com.length === 0);
paso('se llaman como los dictó David',
  cat.nombres.join(' | ') === 'Periféricos y seguridad | Sustitución de motor | '+
    'Sustitución de central | Otros trabajos', cat.nombres.join(' | '));
paso('y se nombran bien desde cualquiera de los dos tipos',
  (await T(() => window.__T.nombreSubtipo('averia','sust_motor'))) === 'Sustitución de motor' &&
  (await T(() => window.__T.nombreSubtipo('instalacion','sust_motor'))) === 'Sustitución de motor');

const ayudas = await T(() => {
  const g = window.__T;
  return ['perifericos','sust_motor','sust_central','otros'].map(k => g.AYUDA_SUBTIPO[k] || '');
});
paso('los cuatro llevan su explicación escrita', ayudas.every(x => x.length > 40));
/* La central nueva viene con sus propios ajustes: la puerta que paraba antes
   puede no parar ahora. Si esto no está dicho, nadie vuelve a medir. */
paso('al cambiar la central se avisa de volver a comprobar las fuerzas',
  /fuerzas/i.test(ayudas[2]) && /detecci/i.test(ayudas[2]), ayudas[2]);

/* ================================================================
   2. La lista de periféricos
   ================================================================ */
bloque('2. Qué se monta');

const lista = await T(() => {
  const g = window.__T;
  return {
    grupos: g.PERIFERICOS.map(x => x[0]),
    claves: g.PERIF_TODOS.map(x => x[0]),
    dup: g.PERIF_TODOS.map(x => x[0]).filter((k, i, a) => a.indexOf(k) !== i),
    sinc: g.nombrePeriferico('foto_sinc'),
    comp: g.nombrePeriferico('foto_comp'),
    desconocido: g.nombrePeriferico('no_existe'),
    vale: g.esPerifericoValido('banda'),
    noVale: g.esPerifericoValido('banda_que_no_existe'),
  };
});
paso('hay cinco grupos, el último para lo que no esté en la lista',
  lista.grupos.length === 5 && /no est[ée]/i.test(lista.grupos[4]), lista.grupos.join(' · '));
paso('están los que dictó David', ['foto_sinc','foto_comp','banda'].every(k => lista.claves.includes(k)));
paso('y la salida para lo demás', lista.claves.includes('otro'));
paso('ninguna clave está repetida', lista.dup.length === 0, lista.dup.join(' · '));
/* Una fotocélula sincronizada y una compacta NO son la misma pieza: si los dos
   nombres se confundieran, el técnico cargaría la que no es y volvería otro día. */
paso('la sincronizada y la compacta se llaman distinto',
  lista.sinc === 'Fotocélula sincronizada' && lista.comp === 'Fotocélula compacta',
  lista.sinc+' / '+lista.comp);
paso('una clave que no existe no se inventa un nombre bonito',
  lista.desconocido === 'no_existe', lista.desconocido);
paso('y se sabe distinguir una clave buena de una mala',
  lista.vale === true && lista.noVale === false);

const reglas = await T(() => {
  const g = window.__T;
  return {
    pfIns: g.pidePerifericos('instalacion','perifericos'),
    pfAv: g.pidePerifericos('averia','perifericos'),
    pfMotor: g.pidePerifericos('instalacion','sust_motor'),
    pfVacio: g.pidePerifericos('instalacion',''),
    sdOtros: g.pideDetalleSubtipo('averia','otros'),
    sdPf: g.pideDetalleSubtipo('instalacion','perifericos'),
  };
});
paso('la lista se pregunta en su subtipo, venga de avería o de instalación',
  reglas.pfIns === true && reglas.pfAv === true);
paso('y no se pregunta en los otros tres',
  reglas.pfMotor === false && reglas.pfVacio === false);
paso('el texto libre solo se pide en «otros trabajos»',
  reglas.sdOtros === true && reglas.sdPf === false);

/* ================================================================
   3. Marcar varios, y la casilla de «otro»
   ================================================================ */
bloque('3. Marcar lo que se monta');

const marcar = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null);
  await new Promise(r => setTimeout(r, 900));
  document.getElementById('a-tipo').value = 'instalacion';
  document.getElementById('a-tipo').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 300));
  const antesDeElegirSub = document.getElementById('a-caja-pf').hidden;
  document.getElementById('a-sub').value = 'perifericos';
  document.getElementById('a-sub').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 300));
  const caja = document.getElementById('a-caja-pf');
  const abierta = !!caja.open;
  const cuantas = document.querySelectorAll('#a-pf .a-pf-c').length;
  /* Dos fotocélulas y una banda: el caso de todos los días */
  ['foto_sinc','foto_comp','banda'].forEach(k => {
    const c = document.querySelector('#a-pf .a-pf-c[value="'+k+'"]');
    c.checked = true; c.dispatchEvent(new Event('change', { bubbles:true }));
  });
  await new Promise(r => setTimeout(r, 200));
  const resumen = (document.getElementById('a-pf-cuenta') || {}).textContent || '';
  const otroCerrado = document.getElementById('a-caja-pfo').hidden;
  const marcados = g.perifMarcados();
  return { visible: !caja.hidden, antesDeElegirSub, abierta, cuantas, resumen,
           otroCerrado, marcados };
});
paso('sin elegir el subtipo, la lista no se enseña', marcar.antesDeElegirSub === true);
paso('al elegir «periféricos y seguridad» aparece la lista', marcar.visible === true);
/* Si hay que marcar algo ahí, se ve: plegada y vacía, nadie la abriría */
paso('y se abre sola la primera vez, porque está vacía', marcar.abierta === true);
paso('están las dieciséis casillas', marcar.cuantas === 16, marcar.cuantas);
paso('se pueden marcar tres a la vez',
  marcar.marcados.join(' · ') === 'foto_sinc · foto_comp · banda', marcar.marcados.join(' · '));
/* Plegado tiene que decir lo esencial sin abrirlo, que es para lo que se pliega */
paso('el resumen, plegado, dice qué se monta',
  /3 elementos/.test(marcar.resumen) && /sincronizada/i.test(marcar.resumen), marcar.resumen);
paso('y la casilla de «otro» sigue cerrada mientras no se marque',
  marcar.otroCerrado === true);

const otro = await T(async () => {
  const c = document.querySelector('#a-pf .a-pf-c[value="otro"]');
  c.checked = true; c.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 200));
  const abierto = !document.getElementById('a-caja-pfo').hidden;
  /* Guardar sin explicar qué es: no debe dejarse */
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 600));
  const err = (document.querySelector('#dlg-form .err') || {}).textContent || '';
  const sigueAbierto = !!document.getElementById('dlg-form');
  return { abierto, err, sigueAbierto };
});
paso('al marcar «otro» se abre su casilla en el momento', otro.abierto === true);
paso('y «otro» sin explicar no se guarda', /escribe al lado|qué es/i.test(otro.err), otro.err);
paso('el formulario se queda abierto para corregirlo', otro.sigueAbierto === true);

const guardado = await T(async () => {
  const g = window.__T;
  document.getElementById('a-pfotro').value = 'bucle de masa en la rampa';
  document.getElementById('a-cliente').value = g.S.clientes[0].id;
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 1800));
  const nuevo = g.S.avisos.filter(a => a.subtipo === 'perifericos' && a.id !== 'pf-1')
    .sort((a,b) => String(b.creado||'').localeCompare(String(a.creado||'')))[0];
  return nuevo ? { ks: nuevo.perifericos || [], txt: nuevo.perifericos_otro || '',
                   sd: nuevo.subtipo_detalle || null, det: g.detallePerifericos(nuevo) } : null;
});
paso('con la explicación puesta se guarda', !!guardado);
paso('y se guardan los cuatro marcados',
  guardado && guardado.ks.join(' · ') === 'foto_sinc · foto_comp · banda · otro',
  guardado && guardado.ks.join(' · '));
paso('con el texto de «otro» al lado',
  guardado && /bucle de masa/.test(guardado.txt), guardado && guardado.txt);
/* El detalle del subtipo es de «otros trabajos»: si se guardara aquí, en el
   parte saldrían dos explicaciones de la misma visita diciendo cosas distintas. */
paso('y sin el texto de «otros trabajos», que es de otro subtipo',
  guardado && guardado.sd === null, guardado && guardado.sd);
paso('el detalle se lee de una pasada',
  guardado && /fotoc[ée]lula sincronizada · fotoc[ée]lula compacta · banda de seguridad · otro \(bucle/i
    .test(guardado.det), guardado && guardado.det);

/* ================================================================
   4. Cambiar de subtipo no deja nada pegado
   ================================================================ */
bloque('4. Cambiar de idea');

const cambio = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null, 'pf-1');
  await new Promise(r => setTimeout(r, 1100));
  const marcadosAlAbrir = g.perifMarcados();
  const resumen = (document.getElementById('a-pf-cuenta') || {}).textContent || '';
  const otroAbierto = !document.getElementById('a-caja-pfo').hidden;
  /* Se cambia a sustitución de motor y se guarda */
  document.getElementById('a-sub').value = 'sust_motor';
  document.getElementById('a-sub').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 300));
  const ocultaAhora = document.getElementById('a-caja-pf').hidden;
  /* Las casillas siguen marcadas por dentro: volver atrás no debe borrar */
  const siguenMarcadas = g.perifMarcados().length;
  document.getElementById('a-sub').value = 'perifericos';
  document.getElementById('a-sub').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 300));
  const vuelve = g.perifMarcados();
  /* Y ahora sí se guarda como sustitución de motor */
  document.getElementById('a-sub').value = 'sust_motor';
  document.getElementById('a-sub').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 200));
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 1800));
  const a = g.S.avisos.find(x => x.id === 'pf-1');
  return { marcadosAlAbrir, resumen, otroAbierto, ocultaAhora, siguenMarcadas, vuelve,
           guardados: a ? a.perifericos : 'sin aviso', txt: a ? a.perifericos_otro : '',
           sub: a ? a.subtipo : '', det: a ? g.detalleSubtipo(a) : 'x' };
});
paso('una asistencia ya guardada se abre con lo suyo marcado',
  cambio.marcadosAlAbrir.join(' · ') === 'foto_sinc · banda · otro',
  cambio.marcadosAlAbrir.join(' · '));
paso('su resumen lo dice sin abrir el desplegable',
  /3 elementos/.test(cambio.resumen), cambio.resumen);
paso('y la casilla de «otro» viene abierta, porque hay texto que leer',
  cambio.otroAbierto === true);
paso('al pasar a sustitución de motor la lista desaparece', cambio.ocultaAhora === true);
/* Un resbalón con el dedo no puede borrar lo que ya estaba marcado */
paso('lo marcado no se borra por cambiar de subtipo', cambio.siguenMarcadas === 3,
  cambio.siguenMarcadas);
paso('y volviendo atrás sigue estando', cambio.vuelve.length === 3, cambio.vuelve.join(' · '));
paso('guardada como sustitución de motor, los periféricos no se quedan pegados',
  cambio.guardados === null, JSON.stringify(cambio.guardados));
paso('ni el texto de «otro»', cambio.txt === null, cambio.txt);
paso('el subtipo guardado es el nuevo', cambio.sub === 'sust_motor', cambio.sub);
paso('y ya no hay detalle que leer', cambio.det === '', cambio.det);

/* ================================================================
   5. «Otros trabajos»: lo escribe la oficina
   ================================================================ */
bloque('5. Otros trabajos');

const otros = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null);
  await new Promise(r => setTimeout(r, 900));
  document.getElementById('a-tipo').value = 'averia';
  document.getElementById('a-tipo').dispatchEvent(new Event('change', { bubbles:true }));
  document.getElementById('a-sub').value = 'otros';
  document.getElementById('a-sub').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 300));
  const visible = !document.getElementById('a-caja-sd').hidden;
  const listaOculta = document.getElementById('a-caja-pf').hidden;
  document.getElementById('a-cliente').value = g.S.clientes[0].id;
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 700));
  const err = (document.querySelector('#dlg-form .err') || {}).textContent || '';
  document.getElementById('a-subdet').value = 'Reponer la señalización de la nave 3';
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 1800));
  const nuevo = g.S.avisos.filter(a => a.subtipo === 'otros' && a.id !== 'pf-otros')
    .sort((a,b) => String(b.creado||'').localeCompare(String(a.creado||'')))[0];
  return { visible, listaOculta, err,
           sd: nuevo ? nuevo.subtipo_detalle : null,
           ks: nuevo ? nuevo.perifericos : 'sin aviso',
           det: nuevo ? g.detalleSubtipo(nuevo) : '' };
});
paso('en «otros trabajos» aparece el hueco para que escriba la oficina',
  otros.visible === true);
paso('y la lista de periféricos no, que es de otro subtipo', otros.listaOculta === true);
paso('sin explicar qué trabajo es, no se guarda',
  /explica qué trabajo|otros/i.test(otros.err), otros.err);
paso('con la explicación puesta, se guarda', /se.alizaci.n de la nave 3/i.test(otros.sd||''),
  otros.sd);
paso('y no se cuelan periféricos de un subtipo que no los pide',
  otros.ks === null, JSON.stringify(otros.ks));
paso('el detalle que se lee es el que escribió la oficina',
  /se.alizaci.n de la nave 3/i.test(otros.det), otros.det);

/* ================================================================
   6. Se lee antes de salir y en el papel que firma el cliente
   ================================================================ */
bloque('6. Donde hace falta leerlo');

const tarjeta = await T(() => {
  const g = window.__T;
  const a = g.S.avisos.find(x => x.id === 'pf-otros');
  const pf = { id:'x', tipo:'instalacion', subtipo:'perifericos',
    perifericos:['foto_sinc','banda'], perifericos_otro:'', cliente_id:a.cliente_id,
    puerta_id:a.puerta_id, estado:'asignado', creado:new Date().toISOString() };
  return { conPf: g.tarjetaTrabajo(pf), conOtros: g.tarjetaTrabajo(a),
           motor: g.tarjetaTrabajo(Object.assign({}, pf, { subtipo:'sust_motor', perifericos:null })) };
});
/* Lo que hay que llevar en la furgoneta se lee en la tarjeta, antes de salir de
   casa: volver por la pieza que falta son dos viajes cobrados como uno. */
paso('la tarjeta del técnico dice qué se monta',
  /Se monta/.test(tarjeta.conPf) && /sincronizada/i.test(tarjeta.conPf));
paso('y en «otros trabajos» dice el trabajo que pidió la oficina',
  /Trabajo/.test(tarjeta.conOtros) && /nave 3/.test(tarjeta.conOtros));
paso('en una sustitución de motor no sobra ninguna línea vacía',
  !/Se monta/.test(tarjeta.motor) && !/Trabajo:/.test(tarjeta.motor));

const papel = await T(async () => {
  const g = window.__T;
  /* El parte se imprime de una visita cerrada, así que se cierra primero */
  await g.sb.from('avisos').update({ cerrado:new Date().toISOString(), trabajo:'Hecho',
    diagnostico:'-', estado:'cerrado', estado_final:'operativa' }).eq('id', 'pf-otros');
  await g.cargar();
  let html = '';
  const abrir = window.open;
  window.open = () => ({ document: { write: t => { html += t; }, close(){}, title:'' },
                         focus(){}, print(){}, close(){} });
  await g.hojaParte('pf-otros');
  await new Promise(r => setTimeout(r, 900));
  const otrosHtml = html;
  /* Y la misma visita contada como periféricos: el papel tiene que decir qué se
     dejó puesto, que es justo lo que se discute meses después. */
  html = '';
  await g.sb.from('avisos').update({ subtipo:'perifericos', subtipo_detalle:null,
    perifericos:['foto_sinc','banda'] }).eq('id', 'pf-otros');
  await g.cargar();
  await g.hojaParte('pf-otros');
  await new Promise(r => setTimeout(r, 900));
  window.open = abrir;
  const limpiar = s => s.replace(/<[^>]*>/g, ' ');
  return { otros: limpiar(otrosHtml), pf: limpiar(html) };
});
paso('el parte que firma el cliente lleva el trabajo que se pidió',
  /Trabajo pedido/.test(papel.otros) && /nave 3/.test(papel.otros));
paso('y en una visita de periféricos, qué se montó',
  /Qu[ée] se monta/.test(papel.pf) && /sincronizada/i.test(papel.pf) && /banda/i.test(papel.pf));
/* Las dos líneas no pueden salir a la vez: son de subtipos distintos, y un parte
   con dos explicaciones de lo mismo es un parte que nadie se cree. */
paso('las dos líneas no salen juntas',
  !/Trabajo pedido/.test(papel.pf) && !/Qu[ée] se monta/.test(papel.otros));

/* ================================================================
   7. Crear un cliente a media asistencia
   ================================================================ */
bloque('7. El borrador, con los periféricos dentro');

const borrador = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null);
  await new Promise(r => setTimeout(r, 900));
  document.getElementById('a-tipo').value = 'instalacion';
  document.getElementById('a-tipo').dispatchEvent(new Event('change', { bubbles:true }));
  document.getElementById('a-sub').value = 'perifericos';
  document.getElementById('a-sub').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 300));
  ['radar','limitador'].forEach(k => {
    const c = document.querySelector('#a-pf .a-pf-c[value="'+k+'"]');
    c.checked = true; c.dispatchEvent(new Event('change', { bubbles:true }));
  });
  document.getElementById('a-desc').value = 'Lo que se había escrito';
  const b = g.leerFormAviso();
  /* Se cierra y se vuelve a abrir, como cuando se va a crear el cliente */
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 400));
  g.dlgAviso(null);
  await new Promise(r => setTimeout(r, 900));
  g.aplicarFormAviso(b);
  await new Promise(r => setTimeout(r, 300));
  const r = { pf: b.pf, vuelven: g.perifMarcados(),
              desc: document.getElementById('a-desc').value,
              resumen: (document.getElementById('a-pf-cuenta') || {}).textContent || '' };
  g.cerrarDlg();
  return r;
});
paso('el borrador se lleva los periféricos marcados',
  borrador.pf.join(' · ') === 'radar · limitador', borrador.pf.join(' · '));
paso('y al volver siguen marcados',
  borrador.vuelven.join(' · ') === 'radar · limitador', borrador.vuelven.join(' · '));
paso('con lo demás escrito en su sitio', borrador.desc === 'Lo que se había escrito');
/* Si el resumen no se repintara, el título diría «sin marcar» con dos cosas
   marcadas justo debajo, y nadie se creería lo que pone la aplicación. */
paso('y el resumen del desplegable se vuelve a pintar',
  /2 elementos/.test(borrador.resumen), borrador.resumen);

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
