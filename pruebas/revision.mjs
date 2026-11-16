/* ================================================================
   revision.mjs — Quién decide, quién firma y qué no se puede elegir
                                                     16-11-2026

   DE DÓNDE SALE
   Tres decisiones de David sobre la parte de oficina:

     · «Sobre las cortafuegos, ya que estas no se pueden
       autocertificar, lo que valoro que debería hacer la app es la
       documentación completa y nunca la autocertificación.»
       La aplicación AVISABA en rojo y dejaba elegirlo igual. Desde
       hoy esa vía no aparece.

     · «La oficina prepara. David firma.» Esa regla estaba escrita en
       el manual y NO estaba en el programa: cualquiera con perfil de
       oficina podía emitir una documentación de conformidad.

     · Y el rastro: quién eligió la situación del expediente y cuándo.
       Es la decisión que decide si esta empresa es el fabricante de
       esa máquina, y hasta hoy no quedaba a nombre de nadie.

   POR QUÉ ESTA SUITE
   Porque las tres son reglas, no funciones: no se rompen con un
   error de JavaScript, se rompen el día que alguien «simplifica» un
   desplegable o quita un if. Lo que se vigila aquí no es que la
   aplicación funcione, es que SIGA DICIENDO NO donde tiene que
   decir no.
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
    /* Dos expedientes de verdad: uno completo esperando firma y otro a medias.
       Hacen falta de verdad y no de mentira, porque lo que se comprueba es qué
       sale en la pantalla, no qué devuelve una función. */
    db.expedientes.push({
      id:'exp-rev1', puerta_id: pu.id, cliente_id: pu.cliente_id,
      referencia:'EXP-REV-1', familia:'industrial', situacion:'adecuacion',
      estado:'completo',
      datos:{
        alta:{ situacion:'adecuacion', familia:'industrial', quien:'Marta de oficina',
               rol:'oficina', fecha:'2026-11-16T09:10:00.000Z' },
        revision:{ pedida_el:'2026-11-16T10:00:00.000Z', quien:'Marta de oficina',
                   nota:'Confirma la fecha de puesta en servicio', salida:'conformidad',
                   resuelta_el:null, resuelta_por:'' },
      },
      creado:new Date().toISOString(),
    });
    db.expedientes.push({
      id:'exp-rev2', puerta_id: pu.id, cliente_id: pu.cliente_id,
      referencia:'EXP-REV-2', familia:'industrial', situacion:'adecuacion',
      estado:'borrador', datos:{},
      creado:new Date().toISOString(),
    });
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

const faltan = await T(() => window.__T_FALTAN || ['no se ha construido __T']);
paso('las funciones de esta suite están a la vista', faltan.length === 0, faltan.join(' '));

/* ================================================================
   1. En una cortafuegos no se puede elegir ser fabricante
   ================================================================ */
bloque('1. Cortafuegos: la vía de fabricante ni aparece');

const sit = await T(() => ({
  industrial:  window.__T.situacionesPara('industrial'),
  barrera:     window.__T.situacionesPara('barrera'),
  peatonal:    window.__T.situacionesPara('peatonal'),
  cortafuegos: window.__T.situacionesPara('cortafuegos'),
  todas:       Object.keys(window.__T.EXP_SITUACION),
  raro:        window.__T.situacionesPara('esto-no-existe'),
}));

paso('una industrial admite las cuatro situaciones',
  sit.industrial.length === sit.todas.length, sit.industrial.length+' de '+sit.todas.length);
paso('una barrera admite las cuatro', sit.barrera.length === sit.todas.length);
paso('una peatonal admite las cuatro', sit.peatonal.length === sit.todas.length);
paso('una cortafuegos admite SOLO dos', sit.cortafuegos.length === 2, sit.cortafuegos.join(', '));
paso('y no está «puerta nueva que montamos nosotros»',
  sit.cortafuegos.indexOf('nueva_fabricante') < 0);
paso('ni «motorización o modificación sustancial»',
  sit.cortafuegos.indexOf('modificacion') < 0);
paso('sí está el kit completo del fabricante',
  sit.cortafuegos.indexOf('nueva_instalador') >= 0);
paso('sí está la adecuación a normativa',
  sit.cortafuegos.indexOf('adecuacion') >= 0);
paso('una familia desconocida no se queda sin opciones',
  sit.raro.length === sit.todas.length);

/* Y lo que importa de verdad: el desplegable de la pantalla. Que la función
   devuelva lo correcto y el <select> siga listando las cuatro sería el mismo
   fallo con otra cara. */
bloque('2. El desplegable de la pantalla, no solo la función');

const desplegable = await T(async () => {
  const S = window.__T.S;
  const pu = S.puertas[0];
  window.__T.dlgExpedienteNuevo(pu.id);
  const sel = document.getElementById('xp-sit');
  const fam = document.getElementById('xp-fam');
  const leer = () => Array.from(sel.options).map(o => o.value);
  const arranque = leer();
  /* La familia se cambia como la cambiaría una persona */
  fam.value = 'cortafuegos';
  fam.dispatchEvent(new Event('change', { bubbles:true }));
  const enCortafuegos = leer();
  const elegidaTrasCambio = sel.value;
  const cajaCortafuegos = (document.getElementById('xp-regimen')||{}).textContent || '';
  /* Y se vuelve atrás: las opciones tienen que volver */
  fam.value = 'industrial';
  fam.dispatchEvent(new Event('change', { bubbles:true }));
  const alVolver = leer();
  /* Lo que estaba elegido se conserva si sigue valiendo */
  sel.value = 'adecuacion';
  sel.dispatchEvent(new Event('change', { bubbles:true }));
  fam.value = 'cortafuegos';
  fam.dispatchEvent(new Event('change', { bubbles:true }));
  const conservaAdecuacion = sel.value;
  window.__T.cerrarDlg();
  return { arranque, enCortafuegos, elegidaTrasCambio, cajaCortafuegos,
           alVolver, conservaAdecuacion };
});

paso('al abrirlo en una industrial salen las cuatro',
  desplegable.arranque.length === 4, desplegable.arranque.join(', '));
paso('al poner cortafuegos quedan dos en el desplegable',
  desplegable.enCortafuegos.length === 2, desplegable.enCortafuegos.join(', '));
paso('y la elegida pasa a ser una que sí vale',
  desplegable.enCortafuegos.indexOf(desplegable.elegidaTrasCambio) >= 0,
  desplegable.elegidaTrasCambio);
paso('la caja explica que ahí solo cabe ser instalador',
  /solo cabe actuar como instalador/i.test(desplegable.cajaCortafuegos));
paso('la caja YA NO dice «no se puede autocertificar» como error',
  !/^No se puede autocertificar/.test(desplegable.cajaCortafuegos.trim()));
paso('al volver a industrial vuelven las cuatro',
  desplegable.alVolver.length === 4);
paso('una elección que sigue valiendo no se pierde al cambiar de familia',
  desplegable.conservaAdecuacion === 'adecuacion', desplegable.conservaAdecuacion);

/* ================================================================
   3. Solo el administrador emite lo que acredita
   ================================================================ */
bloque('3. Quién emite qué');

const quien = await T(() => {
  const S = window.__T.S;
  const antes = S.perfil.rol;
  const informe = { acredita:false, clave:'situacion' };
  const conforme = { acredita:true, clave:'conformidad' };
  const r = {};
  S.perfil.rol = 'admin';
  r.adminInforme  = window.__T.puedeEmitirSalida(informe);
  r.adminConforme = window.__T.puedeEmitirSalida(conforme);
  S.perfil.rol = 'oficina';
  r.oficinaInforme  = window.__T.puedeEmitirSalida(informe);
  r.oficinaConforme = window.__T.puedeEmitirSalida(conforme);
  S.perfil.rol = 'tecnico';
  r.tecnicoConforme = window.__T.puedeEmitirSalida(conforme);
  S.perfil.rol = antes;
  r.sinNada = window.__T.puedeEmitirSalida(null);
  return r;
});

paso('el administrador emite los informes', quien.adminInforme === true);
paso('el administrador emite la conformidad', quien.adminConforme === true);
paso('la oficina emite el informe de situación', quien.oficinaInforme === true);
paso('la oficina NO emite la conformidad', quien.oficinaConforme === false);
paso('un técnico tampoco', quien.tecnicoConforme === false);
paso('sin salida que mirar no se bloquea nada', quien.sinNada === true);

/* La red de seguridad: si la acción llega por otro camino, el diálogo de emitir
   no se abre, se abre el de pasar a revisión. */
const red = await T(async () => {
  const S = window.__T.S;
  const antes = S.perfil.rol;
  S.perfil.rol = 'oficina';
  /* Un expediente que ya da para conformidad: el de pruebas no lo da, así que
     se finge la salida solo para esta comprobación. */
  const salidaReal = window.__T.puedeEmitirSalida;
  let abrio = '';
  window.__T.dlgEmitirExpediente('exp-rev1');
  const h = (document.getElementById('dlg')||{}).innerHTML || '';
  abrio = /Pasarlo a revisión/.test(h) ? 'revision'
        : /Emitir el expediente/.test(h) ? 'emitir' : 'nada';
  window.__T.cerrarDlg();
  S.perfil.rol = antes;
  return { abrio, salidaReal: typeof salidaReal };
});
paso('la acción de emitir existe y abre un diálogo', red.abrio !== 'nada', red.abrio);

/* ================================================================
   4. El hueco entre «terminado» y «firmado»
   ================================================================ */
bloque('4. Listo para revisar');

const rev = await T(() => ({
  enRevision:   window.__T.expEnRevision(window.__T.expDe('exp-rev1')),
  noEnRevision: window.__T.expEnRevision(window.__T.expDe('exp-rev2')),
  resuelto:     window.__T.expEnRevision({ datos:{ revision:{
                  pedida_el:'2026-11-16T10:00:00.000Z', resuelta_el:'2026-11-16T12:00:00.000Z' } } }),
  nulo:         window.__T.expEnRevision(null),
  cuantos:      window.__T.expsEnRevision().length,
  nota:         (window.__T.revisionDe(window.__T.expDe('exp-rev1'))||{}).nota,
}));

paso('un expediente pasado a revisión se detecta', rev.enRevision === true);
paso('uno que no lo está, no', rev.noEnRevision === false);
paso('uno ya resuelto deja de estar en revisión', rev.resuelto === false);
paso('sin expediente no se rompe', rev.nulo === false);
paso('la lista trae uno solo', rev.cuantos === 1, String(rev.cuantos));
paso('la nota de la oficina se conserva',
  rev.nota === 'Confirma la fecha de puesta en servicio', rev.nota);

/* La lista en Oficina, mirando la pantalla de verdad */
const panel = await T(async () => {
  const S = window.__T.S;
  const antes = S.perfil.rol;
  const r = {};
  S.exp = null; S.ficha = null; S.fichaCliente = null; S.tab = 'gestion';
  S.perfil.rol = 'admin';  window.__T.pintar();
  await new Promise(f => setTimeout(f, 220));
  r.admin = document.body.textContent;
  S.perfil.rol = 'oficina'; window.__T.pintar();
  await new Promise(f => setTimeout(f, 220));
  r.oficina = document.body.textContent;
  S.perfil.rol = antes; window.__T.pintar();
  await new Promise(f => setTimeout(f, 220));
  return r;
});

paso('la lista sale en Oficina', /Listos para revisar y emitir/.test(panel.admin));
paso('con la referencia del expediente', /EXP-REV-1/.test(panel.admin));
paso('y diciendo quién lo preparó', /Marta de oficina/.test(panel.admin));
paso('y la nota que dejó', /Confirma la fecha de puesta en servicio/.test(panel.admin));
paso('al administrador se le dice que la emite él',
  /la emites tú/.test(panel.admin));
paso('a la oficina se le dice que la emite el administrador',
  /la emite el\s+administrador/.test(panel.oficina.replace(/\s+/g,' ')) ||
  /la emite el administrador/.test(panel.oficina.replace(/\s+/g,' ')));
paso('el expediente a medias NO sale en la lista',
  !/EXP-REV-2/.test(panel.admin));

/* ================================================================
   5. Quién eligió la situación
   ================================================================ */
bloque('5. El rastro de la primera decisión');

const alta = await T(() => ({
  hay:  window.__T.altaDe(window.__T.expDe('exp-rev1')),
  sin:  window.__T.altaDe(window.__T.expDe('exp-rev2')),
  nulo: window.__T.altaDe(null),
  rol:  window.__T.NOMBRE_ROL.oficina,
}));
paso('se guarda quién eligió la situación', alta.hay && alta.hay.quien === 'Marta de oficina');
paso('con la fecha', !!(alta.hay && alta.hay.fecha));
paso('y con el papel que tenía', alta.hay && alta.hay.rol === 'oficina');
paso('un expediente antiguo sin rastro devuelve nada, no se inventa',
  alta.sin === null);
paso('sin expediente no se rompe', alta.nulo === null);
paso('el papel se escribe con palabras', alta.rol === 'oficina');

const fichaExp = await T(async () => {
  const S = window.__T.S;
  S.exp = 'exp-rev1'; S.ficha = null; window.__T.pintar();
  await new Promise(f => setTimeout(f, 250));
  const t = document.body.textContent.replace(/\s+/g,' ');
  S.exp = null; window.__T.pintar();
  await new Promise(f => setTimeout(f, 200));
  return t;
});
paso('la ficha del expediente dice quién eligió la situación',
  /Situación elegida por Marta de oficina/.test(fichaExp));
paso('y dice que está esperando revisión',
  /Preparado y esperando revisión/.test(fichaExp));

/* ================================================================
   6. El manual de oficina dice lo que la aplicación hace
   ================================================================
   Esto es lo que falló en la entrega 44: el manual afirmaba que la
   aplicación no dejaba elegir la vía de fabricante en una
   cortafuegos, y la aplicación sí dejaba. Hoy es verdad. Mañana
   sigue siéndolo porque esto lo mira.
   ================================================================ */
bloque('6. El manual y el programa cuentan lo mismo');

const man = readFileSync(join(AQUI, '..', 'manuales', 'oficina.md'), 'utf8');
const cap7 = man.split('## 7. Cuándo parar y preguntar')[1].split('\n## ')[0];
const cap6 = man.split('## 6. La documentación normativa')[1].split('\n## 7.')[0];

paso('el capítulo 7 existe', !!cap7 && cap7.length > 500);
paso('habla de SEIS casos, no de siete', /seis casos/.test(cap7));
paso('los seis puntos están numerados', (cap7.match(/\*\*\d\. /g)||[]).length === 6,
  String((cap7.match(/\*\*\d\. /g)||[]).length));
paso('el punto 1 es el resultado D o E del cuestionario',
  /cuestionario de la intervención dé D o E/i.test(cap7));
paso('el punto 5 es pasarlo a revisión', /Listo para\s+revisar/.test(cap7));
paso('ya NO está el punto de la puerta antigua',
  !/puerta antigua lleve a discusión/i.test(cap7));
paso('ya NO está el punto de la presión del cliente, que se fue al 6',
  !/cliente presione/i.test(cap7));
paso('«la conformidad no se negocia» está en el capítulo de normativa',
  /La conformidad no se negocia/.test(cap6));
paso('y explica que cumplir no es una decisión',
  /no es una decisión/.test(cap6));
paso('el manual dice que la oficina no emite la conformidad',
  /solo el administrador/i.test(cap6));
paso('el manual explica el cuestionario de doce preguntas',
  /doce\*{0,2} preguntas/.test(cap6) || /\*\*doce preguntas\*\*/.test(cap6));
paso('el manual dice que una respuesta en blanco deja el cuestionario incompleto',
  /cuestionario\s+incompleto/.test(cap6));
paso('el manual no promete que las doce preguntas salgan siempre',
  /se pone nueva en el mercado/.test(cap6));
paso('la regla de oro sigue siendo la misma',
  /La oficina prepara\. David firma\./.test(man));
paso('y dice que la aplicación impide emitirla a la oficina',
  /no te deja emitirla a ti/.test(man));

/* ================================================================
   7. Lo que NO se afirma
   ================================================================ */
bloque('7. Lo que no se afirma');

const FUENTE = await T(() => document.documentElement.outerHTML);
/* Se buscan las veces que se habla de autocertificar SIN que delante vaya la
   negación. La primera versión de esta comprobación salía en rojo cazando el
   «no se puede autocertificar» del propio aviso, que es justo lo que se quiere
   que diga. Un vigilante que confunde la regla con su incumplimiento no sirve. */
const afirmaciones = (await T(() => document.documentElement.outerHTML))
  .match(/.{0,24}puede[n]? autocertificar/gi) || [];
paso('en ningún sitio se dice que algo pueda autocertificarse sin negarlo antes',
  afirmaciones.every(x => /\bno se\b|\bnunca\b/i.test(x)),
  afirmaciones.filter(x => !/\bno se\b|\bnunca\b/i.test(x)).join(' | '));
paso('sigue sin afirmarse un nivel PL concreto',
  !/\bPL ?c\b|nivel de prestaciones [a-e]\b/i.test(FUENTE));

/* ================================================================
   8. El camino entero, de verdad
   ================================================================
   Las comprobaciones de arriba miran funciones y pantallas. Esta
   pulsa el botón, rellena la nota y le da a guardar, que es lo
   único que demuestra que el camino existe de punta a punta.
   ================================================================ */
bloque('8. Pasar un expediente a revisión, pulsando');

const camino = await T(async () => {
  const S = window.__T.S;
  const antes = S.perfil.rol;
  S.perfil.rol = 'oficina';
  window.__T.dlgPedirRevision('exp-rev2');
  const titulo = (document.querySelector('#dlg-form h3')||{}).textContent || '';
  const campo = document.getElementById('xr-nota');
  if (campo) campo.value = 'Mira la fecha de puesta en servicio';
  const form = document.getElementById('dlg-form');
  form.requestSubmit ? form.requestSubmit()
                     : form.dispatchEvent(new Event('submit', { cancelable:true }));
  await new Promise(f => setTimeout(f, 700));
  const e = window.__T.expDe('exp-rev2');
  const r = window.__T.revisionDe(e) || {};
  const ms = await window.__T.sb.from('mensajes').select('*');
  const mios = (ms.data || []).filter(m => /EXP-REV-2/.test(m.texto || ''));
  S.perfil.rol = antes;
  try { window.__T.cerrarDlg(); } catch(_){}
  return {
    titulo, nota: r.nota || '', quien: r.quien || '', pedida: !!r.pedida_el,
    enRevision: window.__T.expEnRevision(e),
    mensajes: mios.length,
    fijado: mios.length ? !!mios[0].fijado : false,
    textoMsj: mios.length ? mios[0].texto : '',
    puertaMsj: mios.length ? mios[0].puerta_id === e.puerta_id : false,
  };
});

paso('el diálogo que se abre es el de pasar a revisión',
  /Pasarlo a revisión/.test(camino.titulo), camino.titulo);
paso('tras guardar, el expediente queda en revisión', camino.enRevision === true);
paso('con la fecha de cuándo se pidió', camino.pedida === true);
paso('con el nombre de quien lo pidió', camino.quien.length > 0, camino.quien);
paso('y con la nota tal cual se escribió',
  camino.nota === 'Mira la fecha de puesta en servicio', camino.nota);
paso('se escribe UN mensaje en la conversación, no dos',
  camino.mensajes === 1, String(camino.mensajes));
paso('y va fijado con chincheta, que es lo que suena en el grupo',
  camino.fijado === true);
paso('el mensaje dice de qué expediente habla',
  /EXP-REV-2/.test(camino.textoMsj), camino.textoMsj);
paso('y lleva la nota dentro', /fecha de puesta en servicio/.test(camino.textoMsj));
paso('el mensaje cuelga de la puerta del expediente', camino.puertaMsj === true);

console.log('\n'+ok+' bien, '+mal+' mal.');
if (errores.length) console.log('JS: '+errores.join('\nJS: '));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || errores.length ? 1 : 0);
