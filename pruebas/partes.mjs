/* ================================================================
   partes.mjs — qué apartados le tocan a cada parte. 06-11-2026

   POR QUÉ EXISTE
   David revisó en campo el parte de cada tipo de visita, uno por uno,
   y dictó qué sobra en cada uno:

     · PREVENTIVA: «El "qué has encontrado y qué has hecho" aquí no
       entra, es innecesario y crea confusión al técnico.»
     · COMERCIAL: «No debería aparecer: dar de alta, qué has
       encontrado y qué has hecho, materiales, cómo queda.»
     · PUESTA EN SERVICIO: «No debe aparecer qué has encontrado y qué
       has hecho. Este viaje se cobra debe poder, desde oficina,
       dejarlo marcado o no. "Esta visita no se cobra" es redundante.
       Cobro en obra debería salir cuando se marque si se cobra.»
     · URGENCIA: «No debería aparecer "en esta visita no he trabajado
       en ninguna puerta", ya que solo tocamos puertas.»

   LO QUE SE VIGILA AQUÍ
   Que cada parte lleve lo que le toca y nada más. Y, lo que importa
   igual: que al quitar un apartado no se pierda lo que de ahí salía.
   El trabajo de una preventiva y de una comercial se rellena solo, y
   si eso dejara de funcionar, el parte se quedaría sin decir qué se
   hizo y nadie lo notaría hasta leer uno.
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
const ctx = await nav.newContext({ viewport:{width:1320,height:2400},
  locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    const cli = db.puertas[0].cliente_id;
    const pta = db.puertas[0].id;
    const base = { estado:'asignado', prioridad:'normal', tecnico_id:'usuario-admin',
                   cliente_id:cli, ruta:'ruta2', creado:new Date().toISOString() };
    db.fotos.push({ puerta_id:pta, ruta:'p/1.jpg', creado:new Date().toISOString() });
    db.avisos.push(Object.assign({}, base, { id:'pt-av', tipo:'averia', subtipo:'averia',
      puerta_id:pta, descripcion:'No cierra' }));
    db.avisos.push(Object.assign({}, base, { id:'pt-prev', tipo:'mantenimiento',
      puerta_id:pta, descripcion:'Revisión anual' }));
    db.avisos.push(Object.assign({}, base, { id:'pt-com', tipo:'comercial',
      tipos_puerta:['Seccional'], descripcion:'Quieren precio' }));
    db.avisos.push(Object.assign({}, base, { id:'pt-urg', tipo:'urgencia',
      puerta_id:pta, descripcion:'Comercio sin poder cerrar' }));
    db.avisos.push(Object.assign({}, base, { id:'pt-falso', tipo:'falso',
      descripcion:'No había nadie' }));
    /* Una obra cerrada y dos remates: uno normal y otro repercutible */
    db.avisos.push(Object.assign({}, base, { id:'pt-obra', tipo:'instalacion',
      subtipo:'puerta_automatica', estado:'cerrado', puerta_id:pta, horas:8,
      cerrado:new Date().toISOString(), pendiente:true, pendiente_texto:'Falta el cuadro' }));
    db.avisos.push(Object.assign({}, base, { id:'pt-ps', tipo:'puesta_servicio',
      puerta_id:pta, instalacion_id:'pt-obra', ps_causa:'sin_corriente',
      ps_causa_detalle:'No había corriente', repercutible:false }));
    db.avisos.push(Object.assign({}, base, { id:'pt-ps2', tipo:'puesta_servicio',
      puerta_id:pta, instalacion_id:'pt-obra', ps_causa:'remates',
      ps_causa_detalle:'Esperando el solado', repercutible:true }));
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

const montado = await T(() => ({ lista: Array.isArray(window.__T_FALTAN),
  faltan: Array.isArray(window.__T_FALTAN) ? window.__T_FALTAN : ['(no existe)'],
  cuantas: window.__T ? Object.keys(window.__T).length : 0 }));
paso('el banco está montado', montado.lista === true && montado.cuantas > 200, montado.cuantas);
paso('y ve todas las funciones nuevas', montado.faltan.length === 0, montado.faltan.join(' · '));

/* Abre el parte de una visita y dice qué apartados tiene, mirando los títulos
   de los grupos: es lo que el técnico ve, no lo que el código cree pintar. */
const partede = async id => T(async (x) => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 250));
  g.dlgCierre(x);
  await new Promise(r => setTimeout(r, 1500));
  const titulos = [...document.querySelectorAll('#dlg-form .grupo > h3')].map(t => t.textContent.trim());
  const visible = sel => { const e = document.querySelector(sel);
    return !!(e && e.offsetParent !== null); };
  return { titulos,
    diag: visible('#z-diag'), trab: visible('#z-trab'),
    mats: visible('#mats'), estado: visible('#z-estado'),
    sincargo: visible('#z-sincargo'), cobro: visible('#z-cobrado'),
    valvula: visible('#z-sinpta'), medidas: document.querySelectorAll('#dlg-form .medida').length,
    alta: !!document.getElementById('obra-bloque'),
    /* existan o no a la vista, los campos tienen que ESTAR: el resto del parte
       los lee, y si desaparecen del todo se guarda vacío sin avisar */
    hayDiag: !!document.getElementById('z-diag'), hayTrab: !!document.getElementById('z-trab'),
    hayEstado: !!document.getElementById('z-estado'),
  };
}, id);

/* ================================================================
   1. La avería: el parte completo
   ================================================================ */
bloque('1. La avería lleva todo');

const av = await partede('pt-av');
paso('la avería pregunta qué has encontrado y qué has hecho', av.diag && av.trab);
paso('con materiales', av.mats === true);
paso('con cómo queda la puerta', av.estado === true);
paso('con la casilla de que no se cobra', av.sincargo === true);
paso('con cobro en obra', av.cobro === true);
/* La salida solo se ofrece cuando NO hay puerta dada de alta: con una puerta
   enganchada no tiene sentido decir que no se trabajó sobre ninguna, y de hecho
   la aplicación la retira. Así que se comprueba con una avería sin puerta, que
   es el caso para el que se hizo. */
paso('con la puerta ya dada de alta, la salida no se ofrece', av.valvula === false);

const avSinPuerta = await T(async () => {
  const g = window.__T;
  await g.sb.from('avisos').insert({ id:'pt-av2', tipo:'averia', subtipo:'averia',
    estado:'asignado', prioridad:'normal', tecnico_id:'usuario-admin',
    cliente_id:g.S.clientes[0].id, descripcion:'Puerta sin ficha',
    creado:new Date().toISOString() });
  await g.cargar();
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 250));
  g.dlgCierre('pt-av2');
  await new Promise(r => setTimeout(r, 1400));
  const r = { valvula: !!document.getElementById('z-sinpta'),
              motivo: !!document.getElementById('z-sinptam') };
  g.cerrarDlg();
  return r;
});
paso('y en una avería sin puerta sí está, con su motivo',
  avSinPuerta.valvula === true && avSinPuerta.motivo === true);

/* ================================================================
   2. La preventiva: sin diagnóstico
   ================================================================ */
bloque('2. La preventiva no pregunta dos veces lo mismo');

const prev = await partede('pt-prev');
paso('la preventiva NO pregunta qué has encontrado y qué has hecho',
  prev.diag === false && prev.trab === false);
paso('tampoco sale el apartado en los títulos',
  !prev.titulos.some(t => /Qué has encontrado/.test(t)), prev.titulos.join(' | '));
/* Lo que importa al quitarlo: los campos siguen existiendo, porque el guion
   escribe en ellos y el parte impreso los lee. */
paso('pero los campos siguen estando, que es de donde escribe el guión',
  prev.hayDiag === true && prev.hayTrab === true);
paso('sigue llevando materiales, que una revisión gasta', prev.mats === true);
paso('y cómo queda la puerta, que es lo que decide la revisión', prev.estado === true);

const prevRellena = await T(async () => {
  const g = window.__T;
  /* Se marca todo el guion y se cierra: el trabajo tiene que rellenarse solo */
  document.querySelectorAll('#dlg-form .g-punto').forEach(d => {
    const b = d.querySelector('.g-resp button[data-r="ok"]');
    if (b) b.setAttribute('aria-pressed','true');
  });
  document.getElementById('z-horas').value = '2';
  document.getElementById('z-sin').value = 'Prueba automática';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'pt-prev'), true);
  await new Promise(r => setTimeout(r, 1700));
  const a = g.S.avisos.find(x => x.id === 'pt-prev');
  return { cerrado: !!a.cerrado, trabajo: a.trabajo || '',
           err: (document.querySelector('#dlg-form .err') || {}).textContent || '' };
});
paso('la preventiva se cierra sin ese apartado', prevRellena.cerrado === true, prevRellena.err);
/* LA QUE IMPORTA: al quitar el apartado, el parte no se queda sin decir qué se
   hizo. Lo escribe el guion. */
paso('y el trabajo se rellena solo con la revisión del guión',
  /Revisión periódica/i.test(prevRellena.trabajo), prevRellena.trabajo);

/* ================================================================
   3. La comercial: solo medidas
   ================================================================ */
bloque('3. La comercial, a lo suyo');

const com = await partede('pt-com');
paso('la comercial NO pregunta qué has encontrado y qué has hecho',
  com.diag === false && com.trab === false);
paso('no lleva materiales: de ofertar no se gasta material', com.mats === false);
paso('no pregunta cómo queda la puerta', com.estado === false);
paso('ni ofrece dar de alta la puerta', com.alta === false);
paso('tampoco la casilla de que no se cobra: una comercial ya no se cobra',
  com.sincargo === false);
paso('lo que lleva es la toma de medidas', com.medidas >= 1, com.medidas+' huecos');
paso('y los campos del parte siguen existiendo por detrás',
  com.hayDiag === true && com.hayEstado === true);
paso('en los títulos solo queda lo suyo',
  !com.titulos.some(t => /Materiales|Cómo queda|Qué has encontrado/.test(t)),
  com.titulos.join(' | '));

/* ================================================================
   4. La puesta en servicio
   ================================================================ */
bloque('4. El remate: quién paga y dónde se dice');

const ps = await partede('pt-ps');
paso('el remate NO pregunta qué has encontrado y qué has hecho',
  ps.diag === false && ps.trab === false);
paso('no ofrece la casilla de «esta visita no se cobra»: es redundante',
  ps.sincargo === false);
/* Y la que pidió David: cobro en obra solo cuando hay algo que cobrar */
paso('y NO sale cobro en obra, porque este remate no se factura', ps.cobro === false);
paso('lo que sí sale es el apartado del remate',
  ps.titulos.some(t => /Remate de la obra/.test(t)), ps.titulos.join(' | '));

/* Al quitarle el apartado, el remate se quedaba sin poder cerrarse: el cierre
   exige saber qué se hizo y ya no había dónde escribirlo. Ahora lo rellena la
   propia visita con su obra y lo que quedó pendiente de ella (06-11-2026). */
const psCierra = await T(async () => {
  const g = window.__T;
  document.getElementById('z-horas').value = '2';
  document.getElementById('z-sin').value = 'Prueba automática';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'pt-ps'), true);
  await new Promise(r => setTimeout(r, 1700));
  const a = g.S.avisos.find(x => x.id === 'pt-ps');
  return { cerrado: !!a.cerrado, trabajo: a.trabajo || '',
           err: (document.querySelector('#dlg-form .err') || {}).textContent || '' };
});
paso('el remate se cierra sin ese apartado', psCierra.cerrado === true, psCierra.err);
paso('y el trabajo lo escribe la propia visita, con su obra y lo que quedó pendiente',
  /Remate de la instalación/i.test(psCierra.trabajo) && /cuadro/i.test(psCierra.trabajo),
  psCierra.trabajo);

const ps2 = await partede('pt-ps2');
paso('en un remate marcado como repercutible SÍ sale cobro en obra', ps2.cobro === true);
paso('y sigue sin preguntar qué has encontrado', ps2.diag === false);

const enCreacion = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 250));
  g.dlgAviso(null, 'pt-ps');
  await new Promise(r => setTimeout(r, 1200));
  const caja = document.getElementById('a-caja-psr');
  const c = document.getElementById('a-reperc');
  const visible = !!(caja && !caja.hidden);
  /* Se marca desde la oficina al crear, que es lo que pidió David */
  if (c) c.checked = true;
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 1800));
  const { data } = await g.sb.from('avisos').select('repercutible').eq('id','pt-ps');
  return { visible, hay: !!c, guardado: data && data[0] ? data[0].repercutible : null,
           texto: (caja || {}).innerText || '' };
});
paso('al crear o editar un remate, la oficina ve la casilla del cobro',
  enCreacion.hay === true && enCreacion.visible === true);
paso('se explica que un remate no se factura porque la obra ya se facturó',
  /la obra ya se facturó/i.test(enCreacion.texto), enCreacion.texto.replace(/\s+/g,' ').slice(0,80));
paso('y lo que marca ahí queda guardado', enCreacion.guardado === true, String(enCreacion.guardado));

const enOtroTipo = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null, 'pt-av');
  await new Promise(r => setTimeout(r, 1100));
  const caja = document.getElementById('a-caja-psr');
  const r = { oculta: !!(caja && caja.hidden) };
  g.cerrarDlg();
  return r;
});
paso('en una avería esa casilla está escondida', enOtroTipo.oculta === true);

/* ================================================================
   5. La urgencia
   ================================================================ */
bloque('5. La urgencia es siempre de una puerta');

const urg = await partede('pt-urg');
paso('en una urgencia NO sale «no he trabajado sobre ninguna puerta»',
  urg.valvula === false);
paso('pero sí pregunta qué has encontrado y qué has hecho', urg.diag === true);
paso('y lleva materiales y cómo queda', urg.mats === true && urg.estado === true);

const urgSinFicha = await T(async () => {
  const g = window.__T;
  /* Una urgencia sin puerta: no hay salida, o se da de alta o no se cierra */
  await g.sb.from('avisos').update({ puerta_id:null }).eq('id','pt-urg');
  await g.cargar();
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 250));
  g.dlgCierre('pt-urg');
  await new Promise(r => setTimeout(r, 1400));
  const valvula = !!document.getElementById('z-sinpta');
  document.getElementById('z-trab').value = 'Abierta la puerta';
  document.getElementById('z-horas').value = '1';
  document.getElementById('z-sin').value = 'Prueba automática';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'pt-urg'), true);
  await new Promise(r => setTimeout(r, 900));
  return { valvula, err: (document.querySelector('#dlg-form .err') || {}).textContent || '',
           cerrado: !!(g.S.avisos.find(x => x.id === 'pt-urg') || {}).cerrado };
});
paso('una urgencia sin puerta tampoco tiene la casilla', urgSinFicha.valvula === false);
paso('y no se cierra: hay que dar de alta la puerta',
  urgSinFicha.cerrado === false && /puerta dada de alta/i.test(urgSinFicha.err), urgSinFicha.err);
/* Y el aviso NO le ofrece una salida que en su tipo no existe */
paso('sin ofrecerle una salida que en una urgencia no hay',
  !/no era de ninguna puerta/i.test(urgSinFicha.err));

/* ================================================================
   6. El desplazamiento en falso, explicado
   ================================================================ */
bloque('6. El desplazamiento en falso dice para qué sirve');

/* ---- Reescrito el 07-11-2026 ----
   Esta prueba elegía el tipo «desplazamiento en falso» en el alta y leía su
   explicación. Desde hoy ese tipo YA NO SE OFRECE: lo marca el técnico al
   cerrar, en la visita que sea, porque nadie sabe que un viaje va a ser en balde
   hasta que llega. El cambio es deliberado, así que lo que se comprueba ahora es
   lo nuevo: que no se pueda crear y que la explicación siga diciendo para qué
   sirve apuntarlo. La suite falso.mjs lo mira entero. */
const falso = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 250));
  g.dlgAviso(null, null, g.S.clientes[0].id);
  await new Promise(r => setTimeout(r, 1100));
  const ops = [...document.querySelectorAll('#a-tipo option')].map(o => o.value);
  g.cerrarDlg();
  return { ops, ayuda: g.AYUDA_TIPO.falso || '' };
});
paso('el desplazamiento en falso ya no se crea desde la oficina',
  !falso.ops.includes('falso'), falso.ops.join(' · '));
paso('y por qué hay que apuntarlo: si no, ese viaje no existe para nadie',
  /no existe para nadie/i.test(falso.ayuda));
/* Y el texto ya no miente: antes decía «no se factura», y se facturaba entero */
paso('la explicación dice lo que se cobra de verdad: el desplazamiento',
  /desplazamiento y nada más/i.test(falso.ayuda), falso.ayuda.slice(0, 120));

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
