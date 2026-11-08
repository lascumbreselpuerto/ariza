/* ================================================================
   alta.mjs — el alta de puerta en todas las visitas. 05-11-2026

   POR QUÉ EXISTE
   David, 05-11-2026: el alta de puerta es una de las cosas comunes
   a todas las asistencias, no solo a las obras.

   LO QUE ESTABA MAL
   Documentar la puerta era obligatorio en cuatro tipos y
   voluntario en los demás. Pero la mayoría de las visitas son
   averías, y es ahí donde se entra por primera vez en casa de un
   cliente nuevo. Una puerta que no se da de alta en una avería no
   existe para la empresa: no tiene QR, no entra en ningún contrato
   de mantenimiento, no se le puede ofrecer una revisión, y la
   siguiente avería empieza otra vez de cero.

   DECISIONES DE DAVID, 05-11-2026
     · en avería, urgencia y garantía se BLOQUEA el cierre igual que
       en una obra: ficha y al menos una foto;
     · la ficha a medias se avisa en el PARTE, no en la tarjeta: con
       la puerta delante y sin frenar la reparación;
     · comercial y desplazamiento en falso quedan fuera.

   LO QUE SE VIGILA AQUÍ
     · la caja del mínimo sale en una avería, y NO en una comercial
       ni en un desplazamiento en falso;
     · una avería no se cierra sin ficha de puerta;
     · la válvula («no he trabajado sobre ninguna puerta») deja
       cerrar, pero NO sin motivo;
     · la válvula no existe en una obra: una instalación sin puerta
       no es una instalación;
     · marcar la válvula teniendo puerta se corrige solo;
     · la ficha a medias se dice en el parte y no detiene el cierre;
     · la tarjeta avisa de la puerta sin ficha en una avería, pero
       no de la ficha a medias;
     · y la oficina ve quién usa la válvula.
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
    const base = { estado:'asignado', prioridad:'normal', tecnico_id:'usuario-admin',
                   cliente_id:cli, creado:new Date().toISOString() };
    /* Una avería SIN puerta: el caso nuevo */
    db.avisos.push(Object.assign({}, base, { id:'al-av', tipo:'averia', subtipo:'averia',
      descripcion:'La puerta de la nave no cierra' }));
    /* Una avería sobre una puerta que ya tiene ficha, pero a medias */
    db.puertas.push({ id:'al-pta', codigo:'AR-8001', cliente_id:cli, cliente:db.puertas[0].cliente,
      tipo:'', ancho_mm:null, alto_mm:null, estado:'operativa' });
    db.avisos.push(Object.assign({}, base, { id:'al-media', tipo:'averia', subtipo:'averia',
      puerta_id:'al-pta', descripcion:'Hace ruido' }));
    /* Una urgencia sin puerta, para ver que también aprieta */
    db.avisos.push(Object.assign({}, base, { id:'al-urg', tipo:'urgencia',
      descripcion:'Comercio que no puede cerrar' }));
    /* Una comercial y un desplazamiento en falso: a estos no se les pide */
    db.avisos.push(Object.assign({}, base, { id:'al-com', tipo:'comercial',
      descripcion:'Quieren precio' }));
    db.avisos.push(Object.assign({}, base, { id:'al-falso', tipo:'falso',
      descripcion:'No había nadie' }));
    /* Una instalación sin puerta: aquí NO puede haber válvula */
    db.avisos.push(Object.assign({}, base, { id:'al-inst', tipo:'instalacion',
      subtipo:'puerta_automatica', descripcion:'Montar puerta nueva' }));
      /* ---- Una foto por visita (07-11-2026) ----
       Desde hoy no se cierra un parte sin al menos una foto DE LA VISITA, así
       que el recorrido de prueba hace lo que haría el técnico: dejarla hecha.
       Sin esto, todas las comprobaciones de este fichero se quedaban en el
       aviso de la foto y no probaban lo suyo. */
    db.avisos.forEach(a => db.fotos.push({ id:'foto-'+a.id, aviso_id:a.id,
      puerta_id:a.puerta_id || null, ruta:'prueba/'+a.id+'.jpg', autor:'prueba',
      etapa:'hecho', creado:new Date().toISOString() }));
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

/* ---- Que el banco esté montado de verdad (05-11-2026) ----
   «window.__T_FALTAN || []» salía en verde cuando el bloque que lo construye no
   se había ejecutado, porque undefined || [] es una lista vacía. Así que primero
   se comprueba que la lista EXISTE y que __T tiene funciones dentro: si no, lo
   que viene detrás no prueba nada. */
const montado = await T(() => ({
  lista: Array.isArray(window.__T_FALTAN),
  faltan: Array.isArray(window.__T_FALTAN) ? window.__T_FALTAN : ['(no existe la lista)'],
  cuantas: window.__T ? Object.keys(window.__T).length : 0,
}));
paso('el banco está montado: la lista de lo que falta existe', montado.lista === true);
paso('y hay funciones expuestas', montado.cuantas > 200, montado.cuantas);
paso('el banco ve todas las funciones nuevas', montado.faltan.length === 0,
  montado.faltan.join(' · '));

/* ================================================================
   1. A quién se le pide, y a quién no
   ================================================================ */
bloque('1. A quién se le pide la ficha');

const quien = await T(() => {
  const g = window.__T;
  const de = id => g.S.avisos.find(x => x.id === id);
  return {
    averia: g.obligaAltaObra(de('al-av')),
    urgencia: g.obligaAltaObra(de('al-urg')),
    instalacion: g.obligaAltaObra(de('al-inst')),
    comercial: g.obligaAltaObra(de('al-com')),
    falso: g.obligaAltaObra(de('al-falso')),
    /* y la diferencia entre obra y no obra, que es la que decide si se avisa
       antes de salir o en el parte */
    esObraAveria: g.altaEsObra(de('al-av')),
    esObraInst: g.altaEsObra(de('al-inst')),
    valvulaAveria: g.admiteSinPuerta(de('al-av')),
    valvulaInst: g.admiteSinPuerta(de('al-inst')),
  };
});
paso('a una avería se le pide la ficha de la puerta', quien.averia === true);
paso('a una urgencia también', quien.urgencia === true);
paso('a una instalación, como siempre', quien.instalacion === true);
paso('a una comercial NO: ahí la puerta todavía no existe', quien.comercial === false);
paso('a un desplazamiento en falso tampoco: no se ha trabajado', quien.falso === false);
paso('una avería no es una obra, y una instalación sí',
  quien.esObraAveria === false && quien.esObraInst === true);
paso('la válvula existe en una avería y NO en una instalación',
  quien.valvulaAveria === true && quien.valvulaInst === false);

/* ================================================================
   2. La caja del mínimo, en el parte de una avería
   ================================================================ */
bloque('2. La caja en el parte de una avería');

const caja = await T(async () => {
  const g = window.__T;
  g.dlgCierre('al-av');
  await new Promise(r => setTimeout(r, 1400));
  const t = document.getElementById('dlg-form').innerText;
  return { hay: !!document.getElementById('obra-bloque'),
    titulos: [...document.querySelectorAll('#dlg-form .grupo > h3')].map(x => x.textContent.trim()),
    texto: t,
    boton: !!document.querySelector('[data-act="alta-puerta-asis"]'),
    valvula: !!document.getElementById('z-sinpta'),
    motivo: !!document.getElementById('z-sinptam'),
    /* el bloque «Puertas de esta obra» NO tiene que salir en una avería */
    puertasObra: !!document.getElementById('puertas-obra') };
});
paso('en el parte de una avería sale la caja de documentar la puerta', caja.hay === true);
paso('y no se titula «en obra», porque esto no es una obra',
  caja.titulos.some(x => /^Documentar la puerta$/.test(x)), caja.titulos.join(' | '));
paso('se explica por qué importa: sin ficha, la puerta no existe para la empresa',
  /no existe para la empresa/i.test(caja.texto));
paso('y que sin ella no hay QR, ni contrato, ni revisión que ofrecer',
  /contrato de mantenimiento/i.test(caja.texto));
paso('con el botón de darla de alta', caja.boton === true);
paso('no sale el bloque «Puertas de esta obra»: en una avería eso no es lo que hay delante',
  caja.puertasObra === false);
paso('y está la válvula, con su motivo', caja.valvula === true && caja.motivo === true);

const comercial = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  g.dlgCierre('al-com');
  await new Promise(r => setTimeout(r, 1300));
  const r = { caja: !!document.getElementById('obra-bloque'),
              medidas: document.querySelectorAll('#dlg-form .medida').length };
  g.cerrarDlg();
  await new Promise(r2 => setTimeout(r2, 300));
  g.dlgCierre('al-falso');
  await new Promise(r2 => setTimeout(r2, 1300));
  r.falso = !!document.getElementById('obra-bloque');
  g.cerrarDlg();
  return r;
});
paso('en una comercial no sale la caja: lo que sale es la toma de medidas',
  comercial.caja === false && comercial.medidas >= 1, comercial.medidas+' huecos');
paso('en un desplazamiento en falso tampoco sale', comercial.falso === false);

/* ================================================================
   3. LO QUE IMPORTA: una avería no se cierra sin ficha
   ================================================================ */
bloque('3. Sin ficha no se cierra');

const bloqueo = await T(async () => {
  const g = window.__T;
  g.dlgCierre('al-av');
  await new Promise(r => setTimeout(r, 1400));
  document.getElementById('z-diag').value = 'Banda cortada';
  document.getElementById('z-trab').value = 'Sustituida la banda';
  document.getElementById('z-horas').value = '2';
  document.getElementById('z-sin').value = 'Prueba automática';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'al-av'), true);
  await new Promise(r => setTimeout(r, 900));
  const err = (document.querySelector('#dlg-form .err') || {}).textContent || '';
  const av = g.S.avisos.find(x => x.id === 'al-av');
  return { err, cerrado: !!av.cerrado };
});
paso('una avería no se cierra sin ninguna puerta dada de alta',
  /no hay ninguna puerta dada de alta/i.test(bloqueo.err), bloqueo.err);
paso('y se dice que hay una casilla si la visita no era de ninguna puerta',
  /no era de ninguna puerta/i.test(bloqueo.err));
paso('la visita sigue abierta', bloqueo.cerrado === false);

const guardarAvance = await T(async () => {
  const g = window.__T;
  const e = document.querySelector('#dlg-form .err'); if (e) e.textContent = '';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'al-av'), false);
  await new Promise(r => setTimeout(r, 900));
  return { err: (document.querySelector('#dlg-form .err') || {}).textContent || '' };
});
paso('pero guardar el avance sin ficha sí se puede: todavía está trabajando',
  guardarAvance.err === '', guardarAvance.err);

/* ================================================================
   4. La válvula: con motivo sí, sin motivo no
   ================================================================ */
bloque('4. La única salida, y su precio');

const sinMotivo = await T(async () => {
  const g = window.__T;
  document.getElementById('z-sinpta').checked = true;
  document.getElementById('z-sinptam').value = '';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'al-av'), true);
  await new Promise(r => setTimeout(r, 900));
  return { err: (document.querySelector('#dlg-form .err') || {}).textContent || '' };
});
paso('marcar la casilla sin motivo no deja cerrar', /escribe por qué/i.test(sinMotivo.err), sinMotivo.err);
paso('y se dice por qué hace falta el motivo',
  /saltarse el alta/i.test(sinMotivo.err));

const conMotivo = await T(async () => {
  const g = window.__T;
  document.getElementById('z-sinptam').value = 'Era el cuadro general del edificio, no una puerta';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'al-av'), true);
  await new Promise(r => setTimeout(r, 1600));
  const av = g.S.avisos.find(x => x.id === 'al-av');
  const { data } = await g.sb.from('avisos').select('sin_puerta, sin_puerta_motivo').eq('id','al-av');
  return { cerrado: !!av.cerrado, marca: data && data[0] ? data[0].sin_puerta : null,
           motivo: data && data[0] ? data[0].sin_puerta_motivo : null };
});
paso('con el motivo puesto, la avería se cierra', conMotivo.cerrado === true);
paso('y queda guardado que no había puerta, con el motivo',
  conMotivo.marca === true && /cuadro general/.test(conMotivo.motivo || ''), conMotivo.motivo);

/* La contradicción: marcar «sin puerta» en una visita que SÍ tiene ficha. Se
   corrige sola, porque una visita que dice las dos cosas no dice ninguna. */
const contradice = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  g.dlgCierre('al-media');
  await new Promise(r => setTimeout(r, 1400));
  const hayValvula = !!document.getElementById('z-sinpta');
  /* esta visita tiene puerta, así que la válvula no se pinta; se mete a mano
     para comprobar que la aplicación no se la cree */
  if (!hayValvula){
    const f = document.getElementById('dlg-form');
    f.insertAdjacentHTML('afterbegin',
      '<input type="checkbox" id="z-sinpta" checked><input id="z-sinptam" value="pues porque no">');
  }
  document.getElementById('z-trab').value = 'Engrasado';
  document.getElementById('z-horas').value = '1';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'al-media'), false);
  await new Promise(r => setTimeout(r, 1300));
  const { data } = await g.sb.from('avisos').select('sin_puerta').eq('id','al-media');
  return { hayValvula, marca: data && data[0] ? data[0].sin_puerta : null };
});
paso('en una visita que ya tiene puerta, la válvula no se ofrece', contradice.hayValvula === false);
paso('y si se marca de todas formas, se quita sola: no puede decir las dos cosas',
  contradice.marca === false, String(contradice.marca));

/* ================================================================
   5. La ficha a medias: se dice, no se bloquea
   ================================================================ */
bloque('5. La ficha a medias avisa, pero no frena');

const media = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  g.dlgCierre('al-media');
  await new Promise(r => setTimeout(r, 1500));
  const t = document.getElementById('dlg-form').innerText;
  const faltan = g.minimoObra(g.puertaDe('al-pta'), 99).faltan.map(x => x.clave);
  return { caja: !!document.getElementById('obra-bloque'), texto: t, faltan };
});
paso('con la puerta delante, el parte dice lo que le falta a su ficha', media.caja === true);
paso('y lo que falta es el tipo y las medidas, que es lo que no se puso',
  media.faltan.includes('tipo') && media.faltan.includes('medidas'), media.faltan.join(' · '));
paso('se nombran en pantalla', /Tipo de puerta/.test(media.texto) && /Ancho y alto/.test(media.texto));

const cierraIgual = await T(async () => {
  const g = window.__T;
  /* La puerta tiene ficha pero ni una foto. Para cerrar hace falta una foto,
     así que se le mete una: lo que se prueba aquí es que el TIPO y las MEDIDAS
     a medias no frenan el cierre. */
  await g.sb.from('fotos').insert({ puerta_id:'al-pta', ruta:'al-pta/1.jpg', creado:new Date().toISOString() });
  document.getElementById('z-trab').value = 'Engrasado y ajustado';
  document.getElementById('z-horas').value = '1';
  document.getElementById('z-sin').value = 'Prueba automática';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'al-media'), true);
  await new Promise(r => setTimeout(r, 1700));
  const av = g.S.avisos.find(x => x.id === 'al-media');
  return { cerrado: !!av.cerrado, pend: av.pendiente, texto: av.pendiente_texto || '',
           err: (document.querySelector('#dlg-form .err') || {}).textContent || '' };
});
paso('la avería se cierra aunque la ficha esté a medias',
  cierraIgual.cerrado === true, cierraIgual.err);
paso('pero se cierra SEÑALADA como pendiente', cierraIgual.pend === true);
paso('y lo pendiente dice qué falta de la ficha',
  /ficha incompleta/i.test(cierraIgual.texto), cierraIgual.texto);

const enLaLista = await T(() => {
  const g = window.__T;
  return { ids: g.fichasIncompletas().map(x => x.p.id) };
});
paso('y esa puerta sale en la lista de fichas incompletas de la oficina',
  enLaLista.ids.includes('al-pta'), enLaLista.ids.join(' · '));

/* ================================================================
   6. La tarjeta, antes de salir
   ================================================================ */
bloque('6. Qué se avisa antes de salir');

const tarjeta = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  /* Una avería nueva sin puerta y otra con la ficha a medias */
  await g.sb.from('avisos').insert({ id:'al-t1', tipo:'averia', subtipo:'averia', estado:'asignado',
    prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:g.S.clientes[0].id,
    descripcion:'Sin puerta', creado:new Date().toISOString() });
  await g.sb.from('avisos').insert({ id:'al-t2', tipo:'averia', subtipo:'averia', estado:'asignado',
    prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:g.S.clientes[0].id,
    puerta_id:'al-pta', descripcion:'Ficha a medias', creado:new Date().toISOString() });
  await g.cargar();
  g.S.tab = 'trabajo'; g.pintar();
  await new Promise(r => setTimeout(r, 1200));
  const v = document.getElementById('vista').innerText;
  return { sinFicha: /Puerta sin documentar/.test(v),
           avisoValvula: /no es de ninguna puerta/i.test(v),
           aMedias: /Falta documentar la puerta/.test(v) };
});
paso('la tarjeta avisa de que la puerta no tiene ficha, también en una avería',
  tarjeta.sinFicha === true);
paso('y le dice que hay una casilla si la visita no es de ninguna puerta',
  tarjeta.avisoValvula === true);
/* Decisión de David: la ficha a medias se dice en el parte, no en la tarjeta.
   Si esto se pusiera en rojo, es que alguien ha vuelto a llenar la tarjeta de
   avisos que el técnico no puede resolver desde la furgoneta. */
paso('pero NO llena la tarjeta con la ficha a medias de una avería',
  tarjeta.aMedias === false);

/* ================================================================
   7. La oficina ve quién usa la válvula
   ================================================================ */
bloque('7. La válvula se mira');

const panel = await T(async () => {
  const g = window.__T;
  g.S.tab = 'gestion'; g.pintar();
  await new Promise(r => setTimeout(r, 1200));
  const v = document.getElementById('vista').innerText;
  return { titulo: /Visitas cerradas sin ninguna puerta/.test(v),
           motivo: /cuadro general/i.test(v),
           porque: /lo que falta es el alta de la puerta/i.test(v) };
});
paso('en Gestión hay una lista de las visitas cerradas sin ninguna puerta', panel.titulo === true);
paso('con el motivo que escribió el técnico', panel.motivo === true);
paso('y se explica para qué se mira', panel.porque === true);

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
