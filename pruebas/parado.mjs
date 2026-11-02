/* ================================================================
   parado.mjs — lo que se ha quedado parado.             02-11-2026

   POR QUÉ EXISTE ESTA SUITE
   La aplicación siempre ha sabido lo que está abierto. Lo que no decía
   es desde cuándo, y una lista de cosas abiertas sin fecha no se puede
   priorizar: el aviso de anteayer y el de hace siete semanas salen
   iguales. Lo que no envejece en pantalla no se echa de menos.

   Este panel cuenta días, y contar días es peligroso de dos maneras:
     · por exceso, si cuenta desde una fecha que no significa nada (el
       alta, cuando ya se ha tocado el aviso diez veces);
     · por defecto, si cualquier roce rejuvenece la fecha y entonces
       nada llega nunca al umbral.

   Lo que esta suite fija:
     1. Los umbrales que eligió David: 3 días sin asignar, 10 esperando
        repuesto, 10 sin movimiento, 15 un presupuesto sin respuesta.
     2. Que un urgente sin asignar sale desde el primer día.
     3. Que el rojo es el doble, no un adorno.
     4. Que un parte de obra de ayer saca la obra de la lista: eso es
        movimiento, aunque la obra lleve dos meses abierta.
     5. Que lo cerrado y lo anulado no están.
     6. Que el orden es por antigüedad, y los urgentes delante.
     7. Que si falta el SQL, lo dice en vez de dar los días por buenos.
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
const errores = []; let ok = 0, mal = 0;
const paso = (t, bien, extra='') => { bien ? ok++ : mal++;
  console.log((bien?'  OK  ':' FALLA ')+t+(extra!==''&&extra!==undefined?' → '+String(extra):'')); };
const bloque = t => console.log('\n· '+t);

const ctx = await nav.newContext({ viewport:{width:1320,height:2000},
  locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    db.tarifas = [{ id:1, precio_hora:45, coste_hora:22, minimo_horas:1,
                    desplazamiento_fijo:30, precio_km:0.45, coste_km:0.2,
                    recargo_material:40, iva:21 }];
  };
});
const pag = await ctx.newPage();
pag.on('pageerror', e => errores.push('JS: '+e.message));
pag.on('console', m => { if (m.type() === 'error') errores.push('consola: '+m.text()); });
await pag.goto(URL_APP);
await pag.waitForTimeout(1700);
const T = (f, arg) => arg === undefined ? pag.evaluate(f) : pag.evaluate(f, arg);

/* ================================================================
   1. Los umbrales, y que son los que se acordaron
   ================================================================ */
bloque('1. Los umbrales');

const umbrales = await T(() => window.__T.PARADO);
paso('un aviso sin asignar entra a los 3 días', umbrales.sinAsignar === 3, umbrales.sinAsignar);
paso('esperando repuesto, a los 10', umbrales.repuesto === 10, umbrales.repuesto);
paso('un trabajo sin movimiento, a los 10', umbrales.obra === 10, umbrales.obra);
paso('un presupuesto enviado sin respuesta, a los 15',
  umbrales.presuEnviado === 15, umbrales.presuEnviado);
paso('uno emitido que no sale de la oficina, a los 3',
  umbrales.presuSinMandar === 3, umbrales.presuSinMandar);
paso('y uno aceptado sin abrir el trabajo, a los 7',
  umbrales.presuAceptado === 7, umbrales.presuAceptado);

const rojos = await T(() => {
  const g = window.__T;
  return [g.esRojo(5, 3), g.esRojo(6, 3), g.esRojo(19, 10), g.esRojo(20, 10)];
});
paso('el rojo empieza al doble del umbral, no antes',
  rojos[0] === false && rojos[1] === true && rojos[2] === false && rojos[3] === true,
  rojos.join(','));

/* ================================================================
   2. Desde cuándo está quieto
   ================================================================ */
bloque('2. Desde cuándo está quieto');

const quieto = await T(async () => {
  const g = window.__T;
  const hace = d => new Date(Date.now() - d*86400000).toISOString();
  const cli = g.S.clientes[0];
  const base = { tipo:'averia', estado:'asignado', prioridad:'normal',
                 tecnico_id:'usuario-admin', cliente_id:cli.id };
  /* Creado hace 30 días, pero tocado ayer: lleva un día quieto, no treinta */
  await g.sb.from('avisos').insert(Object.assign({}, base, { id:'q-tocado',
    creado: hace(30), movido_el: hace(1), estado_el: hace(30) }));
  /* Creado hace 30 y sin tocar desde entonces */
  await g.sb.from('avisos').insert(Object.assign({}, base, { id:'q-viejo',
    creado: hace(30), movido_el: hace(30), estado_el: hace(30) }));
  /* Una obra de hace 60 días con un parte de ayer: está en marcha */
  await g.sb.from('avisos').insert(Object.assign({}, base, { id:'q-obra',
    tipo:'instalacion', obra_larga:true, creado: hace(60),
    movido_el: hace(60), estado_el: hace(60) }));
  await g.sb.from('jornadas').insert({ aviso_id:'q-obra',
    fecha: new Date(Date.now() - 86400000).toISOString().slice(0,10),
    horas:6, trabajo:'Montado el marco', creado: hace(1) });
  /* Y uno sin ninguna de las dos fechas del SQL: solo tiene el alta */
  await g.sb.from('avisos').insert(Object.assign({}, base, { id:'q-sinsql',
    creado: hace(12) }));
  await g.cargar();
  const de = id => g.S.avisos.find(x => x.id === id);
  return { tocado: g.diasQuieto(de('q-tocado')), viejo: g.diasQuieto(de('q-viejo')),
           obra: g.diasQuieto(de('q-obra')), sinsql: g.diasQuieto(de('q-sinsql')) };
});
paso('un aviso tocado ayer lleva un día quieto, aunque se abriera hace un mes',
  quieto.tocado === 1, quieto.tocado+' días');
paso('uno que nadie ha tocado lleva los días que lleva', quieto.viejo === 30, quieto.viejo);
paso('un parte de obra de ayer cuenta como movimiento: la obra no está parada',
  quieto.obra === 1, quieto.obra+' días');
paso('y sin las fechas del SQL se cuenta desde el alta, que es lo único que hay',
  quieto.sinsql === 12, quieto.sinsql);

/* ================================================================
   3. Los cuatro grupos
   ================================================================ */
bloque('3. Los cuatro grupos');

const grupos = await T(async () => {
  const g = window.__T;
  const hace = d => new Date(Date.now() - d*86400000).toISOString();
  const cli = g.S.clientes[0];
  const pon = async o => { await g.sb.from('avisos').insert(o); };
  /* --- sin asignar --- */
  await pon({ id:'p-nuevo', tipo:'averia', estado:'recibido', prioridad:'normal',
    cliente_id:cli.id, creado:hace(1), movido_el:hace(1), estado_el:hace(1) });      // 1 día: NO
  await pon({ id:'p-sin4', tipo:'averia', estado:'recibido', prioridad:'normal',
    cliente_id:cli.id, creado:hace(4), movido_el:hace(4), estado_el:hace(4) });      // 4 días: sí
  await pon({ id:'p-sin9', tipo:'averia', estado:'recibido', prioridad:'normal',
    cliente_id:cli.id, creado:hace(9), movido_el:hace(9), estado_el:hace(9) });      // 9: rojo
  await pon({ id:'p-urge', tipo:'averia', estado:'recibido', prioridad:'urgente',
    cliente_id:cli.id, creado:hace(1), movido_el:hace(1), estado_el:hace(1) });      // urgente: sí
  /* --- esperando repuesto --- */
  await pon({ id:'p-rep5', tipo:'averia', estado:'repuesto', prioridad:'normal',
    tecnico_id:'usuario-admin', cliente_id:cli.id,
    creado:hace(40), movido_el:hace(5), estado_el:hace(5) });                        // 5 días: NO
  await pon({ id:'p-rep30', tipo:'averia', estado:'repuesto', prioridad:'normal',
    tecnico_id:'usuario-admin', cliente_id:cli.id,
    creado:hace(60), movido_el:hace(30), estado_el:hace(30) });                      // 30: rojo
  /* --- sin movimiento --- */
  await pon({ id:'p-quieta', tipo:'instalacion', estado:'en_curso', prioridad:'normal',
    tecnico_id:'usuario-admin', cliente_id:cli.id, obra_larga:true,
    creado:hace(25), movido_el:hace(14), estado_el:hace(14) });                      // 14: sí
  /* --- y lo que NO tiene que salir --- */
  await pon({ id:'p-cerrada', tipo:'averia', estado:'cerrado', prioridad:'normal',
    tecnico_id:'usuario-admin', cliente_id:cli.id, horas:1,
    creado:hace(50), cerrado:hace(45), movido_el:hace(45), estado_el:hace(45) });
  await pon({ id:'p-anulada', tipo:'averia', estado:'recibido', prioridad:'normal',
    cliente_id:cli.id, anulada:true,
    creado:hace(50), movido_el:hace(50), estado_el:hace(50) });
  await g.cargar();

  const gs = g.loQueSeQuedoParado();
  const porClave = {};
  gs.forEach(x => { porClave[x.clave] = x.filas.map(f => ({
    id: f.a ? f.a.id : f.p.id, dias: f.dias, rojo: f.rojo, urgente: !!f.urgente })); });
  return { claves: gs.map(x => x.clave), porClave,
           titulos: gs.map(x => x.titulo),
           porques: gs.map(x => x.porque) };
});
const ids = k => (grupos.porClave[k] || []).map(x => x.id);
paso('los avisos sin asignar salen a partir de los 3 días',
  ids('sin-asignar').includes('p-sin4') && !ids('sin-asignar').includes('p-nuevo'),
  ids('sin-asignar').join(' · '));
paso('un urgente sin asignar sale desde el primer día',
  ids('sin-asignar').includes('p-urge'));
paso('y sale por delante de los demás, aunque lleve menos tiempo',
  ids('sin-asignar')[0] === 'p-urge', ids('sin-asignar').join(' · '));
paso('el de nueve días va en rojo; el de cuatro, no',
  (grupos.porClave['sin-asignar'].find(x => x.id === 'p-sin9') || {}).rojo === true &&
  (grupos.porClave['sin-asignar'].find(x => x.id === 'p-sin4') || {}).rojo === false);
paso('esperando repuesto sale a los 10 días, no a los 5',
  ids('repuesto').includes('p-rep30') && !ids('repuesto').includes('p-rep5'),
  ids('repuesto').join(' · '));
paso('y el que lleva treinta días esperando va en rojo',
  (grupos.porClave['repuesto'].find(x => x.id === 'p-rep30') || {}).rojo === true);
paso('una obra sin parte nuevo desde hace catorce días sale como quieta',
  ids('obra').includes('p-quieta'), ids('obra').join(' · '));
paso('la obra con el parte de ayer NO sale: eso es movimiento',
  !ids('obra').includes('q-obra'));
paso('lo cerrado no está parado: está hecho',
  !ids('obra').includes('p-cerrada') && !ids('sin-asignar').includes('p-cerrada'));
paso('y lo anulado tampoco, que no se hizo',
  !ids('sin-asignar').includes('p-anulada'));
paso('cada grupo explica por qué existe, con palabras, no con un número',
  grupos.porques.every(x => x && x.length > 60), grupos.porques.length+' grupos');

/* ================================================================
   4. Los presupuestos, que son tres situaciones distintas
   ================================================================ */
bloque('4. Los presupuestos');

const presus = await T(async () => {
  const g = window.__T;
  const hace = d => new Date(Date.now() - d*86400000).toISOString();
  const cli = g.S.clientes[0];
  await g.sb.from('presupuestos').insert({ id:'pz-emi', referencia:'P-900',
    cliente_id:cli.id, estado:'emitido', total:1000, base:826.45, creado:hace(6) });
  await g.sb.from('presupuestos').insert({ id:'pz-env', referencia:'P-901',
    cliente_id:cli.id, estado:'enviado', total:2000, base:1652.89,
    creado:hace(40), enviado_el:hace(20) });
  await g.sb.from('presupuestos').insert({ id:'pz-env-nuevo', referencia:'P-902',
    cliente_id:cli.id, estado:'enviado', total:3000, base:2479.34,
    creado:hace(10), enviado_el:hace(5) });
  await g.sb.from('presupuestos').insert({ id:'pz-acep', referencia:'P-903',
    cliente_id:cli.id, estado:'aceptado', total:4000, base:3305.79,
    creado:hace(30), enviado_el:hace(25), aceptado_el:hace(12),
    aceptado_por:'El administrador' });
  /* Uno aceptado Y con el trabajo abierto: ese no está parado */
  await g.sb.from('presupuestos').insert({ id:'pz-hecho', referencia:'P-904',
    cliente_id:cli.id, estado:'aceptado', total:5000, base:4132.23,
    creado:hace(30), aceptado_el:hace(20) });
  await g.sb.from('avisos').insert({ id:'av-pz-hecho', tipo:'instalacion',
    estado:'asignado', prioridad:'normal', tecnico_id:'usuario-admin',
    cliente_id:cli.id, presupuesto_id:'pz-hecho',
    creado:hace(2), movido_el:hace(2), estado_el:hace(2) });
  await g.cargar();
  const gs = g.loQueSeQuedoParado();
  const pz = gs.find(x => x.clave === 'presupuestos');
  return { filas: (pz ? pz.filas : []).map(f => ({ id:f.p.id, dias:f.dias, que:f.que, rojo:f.rojo })),
           tieneAviso: !!g.avisoDelPresu(g.S.presupuestos.find(p => p.id === 'pz-hecho')) };
});
const pid = x => presus.filas.map(f => f.id).includes(x);
const fila = x => presus.filas.find(f => f.id === x) || {};
paso('un presupuesto emitido que no sale de la oficina a los 6 días sale aquí',
  pid('pz-emi') && fila('pz-emi').que === 'emitido y sin mandar',
  fila('pz-emi').dias+' días · '+fila('pz-emi').que);
paso('y en rojo, porque seis días es el doble de tres',
  fila('pz-emi').rojo === true);
paso('uno enviado hace veinte días sin respuesta también',
  pid('pz-env') && fila('pz-env').que === 'enviado, sin respuesta',
  fila('pz-env').dias+' días');
paso('pero uno enviado hace cinco días no: todavía es pronto para llamar',
  !pid('pz-env-nuevo'));
paso('un aceptado sin trabajo abierto es dinero firmado que no se está haciendo',
  pid('pz-acep') && fila('pz-acep').que === 'aceptado, sin abrir el trabajo',
  fila('pz-acep').dias+' días');
paso('y el aceptado que YA tiene su trabajo abierto no sale',
  !pid('pz-hecho') && presus.tieneAviso === true);
paso('los presupuestos salen ordenados por antigüedad, el más viejo primero',
  presus.filas.length > 1 && presus.filas[0].dias >= presus.filas[1].dias,
  presus.filas.map(f => f.dias).join(' · '));

/* ================================================================
   5. El panel, tal y como se ve
   ================================================================ */
bloque('5. El panel en Gestión');

const panel = await T(async () => {
  const g = window.__T;
  g.S.tab = 'gestion'; g.pintar();
  await new Promise(r => setTimeout(r, 900));
  const v = document.getElementById('vista');
  const texto = v.innerText;
  return { texto,
    botonAsignar: !!v.querySelector('[data-act="asignar"][data-id="p-sin4"]'),
    botonAbrir:   !!v.querySelector('[data-act="aviso-editar"][data-id="p-rep30"]'),
    botonPresu:   !!v.querySelector('[data-act="presu-abrir"][data-id="pz-env"]'),
    avisoSinSql: /falta ejecutar/i.test(texto) };
});
paso('el panel está en Gestión y se llama lo que es',
  /Lo que se ha quedado parado/.test(panel.texto));
paso('con los cuatro grupos dentro',
  /Avisos sin asignar/.test(panel.texto) && /Esperando repuesto/.test(panel.texto) &&
  /Trabajos sin movimiento/.test(panel.texto) && /Presupuestos sin cerrar/.test(panel.texto));
paso('dice los días que lleva cada cosa quieta',
  /\d+ días/.test(panel.texto) && /quieto/.test(panel.texto));
paso('explica que no hay nada que apagar: se quita solo al moverse',
  /desaparece de aquí/.test(panel.texto));
paso('desde la propia lista se asigna el aviso sin técnico', panel.botonAsignar === true);
paso('se abre el que espera repuesto', panel.botonAbrir === true);
paso('y se abre el presupuesto sin respuesta', panel.botonPresu === true);
/* En la misma pantalla hay importes sin IVA (lo facturable, el margen) y el
   total del presupuesto, que lo lleva. Sin apellido, uno de los dos engaña. */
paso('el importe del presupuesto dice que lleva IVA',
  /con IVA/.test(panel.texto), (panel.texto.match(/.{0,24}con IVA/)||[''])[0]);
/* Lo que NO puede hacer es dar los días por buenos cuando no tiene de dónde
   sacarlos: aquí los avisos de prueba llevan movido_el, así que el aviso de
   que falta el SQL NO debe salir. */
paso('con las fechas del servidor puestas, no avisa de que falte el SQL',
  panel.avisoSinSql === false);

const sinSql = await T(async () => {
  const g = window.__T;
  /* Se le quitan a mano las dos fechas a todos, como una base sin parado.sql */
  g.S.avisos.forEach(a => { delete a.movido_el; delete a.estado_el; });
  g.pintar();
  await new Promise(r => setTimeout(r, 700));
  const texto = document.getElementById('vista').innerText;
  return { texto, falta: g.sinFechasDeMovimiento() };
});
paso('y si esas fechas no están, lo dice en vez de callarse',
  sinSql.falta === true && /parado\.sql/.test(sinSql.texto),
  (sinSql.texto.match(/.{0,40}parado\.sql.{0,30}/)||[''])[0]);
paso('avisando de lo que eso significa: que los días se cuentan desde el alta',
  /desde la fecha de alta|desde el alta/.test(sinSql.texto));

/* ---- El caso en que más engañaba (02-11-2026) ----
   Con la lista VACÍA el aviso no salía, porque estaba dentro de la rama que
   solo se pinta cuando hay algo. Y justo ahí es donde más importa: «nada
   quieto» dicho por una pantalla que no sabe contar los días no es una buena
   noticia, es una pantalla que no sabe lo que dice. Lo vio David en su propia
   aplicación el mismo día que se entregó. */
const vacia = await T(async () => {
  const g = window.__T;
  const copia = g.S.avisos.slice();
  /* Solo lo cerrado, y sin las fechas del SQL: no hay nada que pueda estar
     parado, y tampoco hay con qué contar los días. */
  g.S.avisos = copia.filter(a => a.cerrado).map(a => {
    const x = Object.assign({}, a); delete x.movido_el; delete x.estado_el; return x; });
  g.S.presupuestos = [];
  g.pintar();
  await new Promise(r => setTimeout(r, 700));
  const texto = document.getElementById('vista').innerText;
  const nGrupos = g.loQueSeQuedoParado().length;
  g.S.avisos = copia;
  return { texto, nGrupos };
});
paso('la lista sale vacía, que es el caso que se comprueba',
  vacia.nGrupos === 0 && /Nada quieto más de la cuenta/.test(vacia.texto), vacia.nGrupos+' grupos');
paso('y aun así avisa de que faltan las fechas, que es lo que no hacía',
  /parado\.sql/.test(vacia.texto));
paso('diciendo justo lo que hay que saber: que no es de fiar ni vacía',
  /ni cuando sale vac/.test(vacia.texto),
  (vacia.texto.match(/.{0,40}ni cuando sale vac.{0,10}/)||[''])[0]);

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
