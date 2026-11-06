/* ================================================================
   reloj.mjs — la hora real del cierre y el cliente primero.
                                                       06-11-2026

   POR QUÉ EXISTE
   David, 06-11-2026, dos cosas de la revisión en campo:

   1) «La hora que se marque en el cierre de cualquier parte debe ser
      la del cierre real, ya que en los cierres se tarda un tiempo,
      algunos más que otros, que es tiempo que el técnico invierte en
      ello. Por ejemplo el preventivo: parte de la realización del
      trabajo se debe hacer con la asistencia abierta, y si la hora es
      la de darle al botón para comenzar a rellenar, ahí tenemos una
      pérdida de tiempo no valorada en la factura.»

   2) «El crear cliente desde cualquier aviso te lleva al apartado de
      crear cliente, pero cuando se crea te saca de la asistencia que
      estabas creando borrando todos los datos que se han escrito.»
      Y de ahí: el cliente tiene que ser uno de los primeros datos,
      porque condiciona los siguientes.

   LO QUE SE VIGILA AQUÍ
     · la hora de salida nace en la de ahora y se guarda la del cierre;
     · si el técnico escribe una hora, manda la suya;
     · las horas a facturar se recalculan con la hora nueva, salvo que
       las haya puesto a mano;
     · una visita YA CERRADA no se mueve: manda la hora guardada;
     · el cliente es el primer campo del formulario;
     · las puertas que se ofrecen son las de ese cliente, arriba;
     · y crear un cliente a mitad de la asistencia no borra nada.
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
    /* Una avería abierta, con su puerta y una foto, para poder cerrarla */
    db.avisos.push({ id:'rj-1', tipo:'averia', subtipo:'averia', estado:'asignado',
      prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:cli,
      puerta_id:db.puertas[0].id, ruta:'ruta2',
      hora_inicio:(() => { const x = new Date(); x.setHours(9,0,0,0); return x.toISOString(); })(),
      descripcion:'No cierra', creado:new Date().toISOString() });
    db.fotos.push({ puerta_id:db.puertas[0].id, ruta:'p/1.jpg', creado:hace(1) });
    /* Y una ya cerrada, con su hora de salida guardada: esa no se toca */
    db.avisos.push({ id:'rj-cerrada', tipo:'averia', subtipo:'averia', estado:'cerrado',
      prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:cli,
      puerta_id:db.puertas[0].id, ruta:'ruta2', horas:2,
      hora_inicio:'2026-11-02T09:00:00+01:00', hora_fin:'2026-11-02T11:30:00+01:00',
      trabajo:'Cambiada la banda', cerrado:'2026-11-02T11:30:00+01:00', creado:hace(4) });
    /* Un segundo cliente, para la lista de puertas por cliente */
    db.clientes.push({ id:'rj-cli2', nombre:'Cliente segundo', creado:hace(50) });
    db.puertas.push({ id:'rj-pta2', codigo:'AR-6001', cliente_id:'rj-cli2',
      cliente:'Cliente segundo', tipo:'Seccional', estado:'operativa' });
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

/* ================================================================
   1. El cliente, el primer campo
   ================================================================ */
bloque('1. El cliente va primero');

const orden = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null, null, null);
  await new Promise(r => setTimeout(r, 1100));
  /* El orden en que el técnico se los encuentra: los campos tal y como están
     puestos en la pantalla, de arriba abajo. */
  const ids = [...document.querySelectorAll('#dlg-form [id^="a-"]')]
    .filter(e => 'value' in e && e.id).map(e => e.id);
  const titulos = [...document.querySelectorAll('#dlg-form .grupo > h3')].map(x => x.textContent.trim());
  return { ids, titulos,
    posCliente: ids.indexOf('a-cliente'), posPuerta: ids.indexOf('a-puerta'),
    posTipo: ids.indexOf('a-tipo'), posDesc: ids.indexOf('a-desc') };
});
paso('el cliente es el PRIMER campo del formulario', orden.posCliente === 0,
  orden.ids.slice(0, 5).join(' · '));
paso('la puerta va justo detrás del cliente', orden.posPuerta === 1, orden.posPuerta);
paso('y el tipo de asistencia, después de los dos',
  orden.posTipo > orden.posPuerta, 'tipo en la '+orden.posTipo);
paso('el primer grupo se llama «Para quién y dónde»',
  orden.titulos[0] === 'Para quién y dónde', orden.titulos.slice(0,3).join(' | '));

/* ================================================================
   2. Las puertas que se ofrecen son las del cliente
   ================================================================ */
bloque('2. Las puertas, ordenadas por el cliente');

const puertas = await T(async () => {
  const sel = document.getElementById('a-puerta');
  const cli = document.getElementById('a-cliente');
  const sinCliente = [...sel.querySelectorAll('optgroup')].length;
  /* Se elige el segundo cliente, que tiene una sola puerta */
  cli.value = 'rj-cli2';
  cli.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 400));
  const grupos = [...sel.querySelectorAll('optgroup')].map(o => o.label);
  const primeras = [...sel.querySelectorAll('optgroup')][0];
  return { sinCliente, grupos,
    arriba: primeras ? [...primeras.querySelectorAll('option')].map(o => o.value) : [],
    pista: (document.getElementById('a-ptapista') || {}).textContent || '',
    total: sel.querySelectorAll('option').length };
});
paso('sin cliente elegido, las puertas salen sin agrupar', puertas.sinCliente === 0);
paso('al elegir cliente, sus puertas salen arriba y aparte',
  puertas.grupos[0] === 'Puertas de este cliente', puertas.grupos.join(' | '));
paso('y la de ese cliente es la que está arriba',
  puertas.arriba.join(',') === 'rj-pta2', puertas.arriba.join(' · '));
paso('las demás siguen estando: hay puertas sin ficha de cliente',
  puertas.grupos.length === 2 && puertas.total > 2, puertas.total+' opciones');
paso('y la pista dice cuántas tiene ese cliente',
  /1 puerta de ese cliente/.test(puertas.pista), puertas.pista);

/* ================================================================
   3. LO QUE IMPORTA: crear un cliente no borra la asistencia
   ================================================================ */
bloque('3. Crear un cliente a mitad de la asistencia');

const noBorra = await T(async () => {
  const g = window.__T;
  /* Se rellena media asistencia: tipo, descripción, notas y contacto */
  document.getElementById('a-tipo').value = 'mantenimiento';
  document.getElementById('a-tipo').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 300));
  document.getElementById('a-desc').value = 'Revisión anual de las cuatro puertas';
  document.getElementById('a-notas').value = 'Preguntar por Manuel en portería';
  document.getElementById('a-cnom').value = 'Manuel';
  document.getElementById('a-ctel').value = '600111222';
  document.getElementById('a-fecha').value = g.hoy();
  /* Y se le da a «Crear cliente nuevo», que antes se lo llevaba todo por delante */
  document.querySelector('[data-act="cliente-rapido"]').click();
  await new Promise(r => setTimeout(r, 800));
  const enAlta = !!document.getElementById('c-nombre');
  document.getElementById('c-nombre').value = 'Comunidad del Pilar';
  document.getElementById('c-pob').value = 'El Puerto';
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 2200));
  const v = id => (document.getElementById(id) || {}).value || '';
  const cli = document.getElementById('a-cliente');
  const nombre = cli && cli.selectedIndex >= 0 ? cli.options[cli.selectedIndex].textContent : '';
  return { enAlta, volvio: !!document.getElementById('a-tipo'),
    tipo: v('a-tipo'), desc: v('a-desc'), notas: v('a-notas'),
    cnom: v('a-cnom'), ctel: v('a-ctel'), fecha: v('a-fecha'),
    cliente: cli ? cli.value : '', nombre };
});
paso('el botón lleva al alta de cliente', noBorra.enAlta === true);
paso('al guardarlo, se vuelve a la asistencia', noBorra.volvio === true);
paso('con el tipo que habías puesto', noBorra.tipo === 'mantenimiento', noBorra.tipo);
paso('con lo que había escrito el cliente', /cuatro puertas/.test(noBorra.desc), noBorra.desc);
paso('con las notas para el técnico', /portería/.test(noBorra.notas), noBorra.notas);
paso('con el contacto y su teléfono',
  noBorra.cnom === 'Manuel' && noBorra.ctel === '600111222', noBorra.cnom+' · '+noBorra.ctel);
paso('con la fecha prevista', !!noBorra.fecha, noBorra.fecha);
/* La que cierra el círculo: el cliente nuevo queda puesto, sin tener que
   buscarlo otra vez en una lista de cientos. */
paso('y el cliente nuevo ya elegido',
  !!noBorra.cliente && /Pilar/.test(noBorra.nombre), noBorra.nombre);

/* ================================================================
   4. La hora de salida es la del cierre real
   ================================================================ */
bloque('4. La hora de salida');

const nace = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  g.dlgCierre('rj-1');
  await new Promise(r => setTimeout(r, 1400));
  const f = document.getElementById('z-fin');
  const ahora = g.hhmm(new Date());
  return { valor: f.value, ini: f.dataset.ini, ahora,
    texto: document.getElementById('dlg-form').innerText,
    horas: (document.getElementById('z-horas') || {}).value,
    auto: (document.getElementById('z-horas') || {}).dataset.auto };
});
paso('la hora de salida nace en la de ahora', nace.valor === nace.ahora, nace.valor+' / '+nace.ahora);
paso('y se guarda con qué valor nació, para saber si la tocan', nace.ini === nace.valor, nace.ini);
paso('se explica que se pondrá la hora de cerrar, porque rellenar también es trabajo',
  /tiempo de trabajo/i.test(nace.texto));
paso('las horas salen calculadas desde la entrada', !!nace.horas && nace.auto === '1', nace.horas);

/* El caso de David: se abre el parte y se tarda en rellenarlo. Lo que se guarda
   tiene que ser la hora de cerrar, no la de abrir. Se simula moviendo a mano el
   valor con el que nació el campo, que es como si hubieran pasado 40 minutos. */
const alCerrar = await T(async () => {
  const g = window.__T;
  const f = document.getElementById('z-fin');
  const hs = document.getElementById('z-horas');
  const mins = d => { const [h,m] = String(d).split(':').map(Number); return h*60 + m; };
  /* Se monta el caso de David con números que cruzan el umbral de facturación.
     Las horas facturables suben a la siguiente cuando pasan de la media hora, así
     que hay que elegir con cuidado: entrada hace 95 minutos y parte abierto hace
     45. Hasta la hora de abrir el parte son 50 minutos, que es 1 hora facturable;
     hasta el cierre son 95, que son 2. Esa hora de diferencia es exactamente el
     dinero del que hablaba David. */
  const hace = n => { const d = new Date(); d.setMinutes(d.getMinutes() - n, 0, 0); return g.hhmm(d); };
  const entrada = hace(95), abierto = hace(45);
  document.getElementById('z-ini').value = entrada;
  document.getElementById('z-ini').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 250));
  f.value = abierto; f.dataset.ini = abierto;
  hs.value = ''; hs.dataset.auto = '1';
  document.getElementById('z-ini').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 250));
  const horasAntes = hs.value;
  document.getElementById('z-trab').value = 'Sustituida la banda de seguridad';
  document.getElementById('z-sin').value = 'Prueba automática';
  /* El momento del cierre se mide aquí, en el mismo instante en que se cierra:
     medirlo después de las esperas caía en el minuto siguiente y la prueba se
     ponía roja ella sola. */
  const alDarle = mins(g.hhmm(new Date()));
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'rj-1'), true);
  await new Promise(r => setTimeout(r, 1600));
  const av = g.S.avisos.find(x => x.id === 'rj-1');
  return { horasAntes, entrada, abierto, guardada: g.hhmm(av.hora_fin),
    desfase: Math.abs(mins(g.hhmm(av.hora_fin)) - alDarle),
    horas: av.horas, cerrado: !!av.cerrado,
    err: (document.querySelector('#dlg-form .err') || {}).textContent || '' };
});
paso('la visita se cierra', alCerrar.cerrado === true, alCerrar.err);
/* LA QUE IMPORTA: lo que se guarda es la hora de cerrar, no la de abrir */
paso('y la hora de salida guardada es la del cierre real, no la de abrir el parte',
  alCerrar.desfase <= 1 && alCerrar.guardada !== alCerrar.abierto,
  'abierto '+alCerrar.abierto+' · guardado '+alCerrar.guardada);
paso('las horas a facturar se recalculan, y pasan de 1 a 2',
  Number(alCerrar.horas) > Number(alCerrar.horasAntes),
  alCerrar.horasAntes+' → '+alCerrar.horas);

/* Y la otra cara: si el técnico escribe una hora, manda la suya */
const aMano = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  await g.sb.from('avisos').update({ cerrado:null, estado:'asignado', hora_fin:null, horas:null })
    .eq('id','rj-1');
  await g.cargar();
  g.dlgCierre('rj-1');
  await new Promise(r => setTimeout(r, 1300));
  const f = document.getElementById('z-fin');
  f.value = '18:45';                              // la escribe él: no toca data-ini
  const hs = document.getElementById('z-horas');
  hs.value = '3'; hs.dataset.auto = '0';          // y pone las horas a mano
  document.getElementById('z-trab').value = 'Lo mismo';
  document.getElementById('z-sin').value = 'Prueba automática';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'rj-1'), true);
  await new Promise(r => setTimeout(r, 1600));
  const av = g.S.avisos.find(x => x.id === 'rj-1');
  return { guardada: g.hhmm(av.hora_fin), horas: av.horas };
});
paso('si el técnico escribe la hora de salida, se guarda la suya',
  aMano.guardada === '18:45', aMano.guardada);
paso('y las horas que puso a mano no se le pisan', Number(aMano.horas) === 3, aMano.horas);

/* Lo ya cerrado no se mueve: al reabrir un parte cerrado manda la hora guardada */
const cerrada = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  g.dlgCierre('rj-cerrada');
  await new Promise(r => setTimeout(r, 1300));
  const f = document.getElementById('z-fin');
  const r = { valor: f.value, ini: f.dataset.ini,
              texto: (f.parentElement || {}).innerText || '' };
  g.cerrarDlg();
  return r;
});
paso('en un parte ya cerrado sale la hora que se guardó', cerrada.valor === '11:30', cerrada.valor);
paso('y no se mueve: el reloj no la toca', cerrada.ini === undefined, String(cerrada.ini));
paso('se dice que es la que quedó al cerrar', /quedó guardada al cerrar/i.test(cerrada.texto),
  cerrada.texto.replace(/\s+/g,' ').slice(0, 70));

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
