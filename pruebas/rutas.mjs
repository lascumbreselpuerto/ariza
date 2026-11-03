/* ================================================================
   rutas.mjs — el desplazamiento se cobra por ruta.    02-11-2026

   POR QUÉ EXISTE
   «En las asistencias, donde pone km lo tenemos que cambiar por la
   elección de una lista tipo Ruta 1..5, que serán valoradas por
   administración. El técnico podrá elegirla siempre que desde la
   oficina no se haya puesto al crear la asistencia.» David.

   El fondo del asunto: los kilómetros los escribía el técnico, y el
   técnico no los sabe. Los estima, y distinto cada día y cada uno. De
   esa estimación salía el importe del desplazamiento de la factura.

   Lo que fija esta suite:
     1. Cinco rutas, y solo se ofrecen las que tienen importe puesto.
     2. El técnico elige, salvo que la oficina ya la haya puesto.
     3. Los kilómetros solo aparecen fuera de ruta.
     4. Elegir ruta borra los kilómetros sueltos, y viceversa.
     5. El parte impreso dice la ruta, no un número inventado.
     6. Una ruta sin valorar se lista en Gestión, como el material
        sin precio: entra a cero y nadie lo ve.
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
    /* Tres rutas valoradas y dos sin valorar: el caso de verdad el día que se
       estrena esto, con la 4 y la 5 recién creadas y todavía sin precio. */
    db.tarifas = [{ id:1, precio_hora:45, coste_hora:22, minimo_horas:1,
                    desplazamiento_fijo:30, precio_km:0.45, coste_km:0.2,
                    recargo_material:40, iva:21,
                    ruta1_nombre:'El Puerto', ruta1_importe:30, ruta1_coste:10,
                    ruta2_nombre:'Jerez',     ruta2_importe:45, ruta2_coste:15,
                    ruta3_nombre:'Cádiz',     ruta3_importe:60, ruta3_coste:20,
                    ruta4_nombre:'Huelva',    ruta4_importe:null, ruta4_coste:null,
                    ruta5_nombre:'Sevilla',   ruta5_importe:null, ruta5_coste:null }];
  };
});
const pag = await ctx.newPage();
pag.on('pageerror', e => errores.push('JS: '+e.message));
pag.on('console', m => { if (m.type() === 'error') errores.push('consola: '+m.text()); });
await pag.goto(URL_APP);
await pag.waitForTimeout(1700);
const T = (f, arg) => arg === undefined ? pag.evaluate(f) : pag.evaluate(f, arg);

/* ================================================================
   1. Cinco rutas, y solo se ofrecen las valoradas
   ================================================================ */
bloque('1. Cinco rutas, y solo las valoradas');

const cuantas = await T(() => {
  const g = window.__T;
  return { todas: g.RUTAS, ofrecidas: g.rutasValoradas(),
           nombre2: g.nombreRuta('ruta2'), nombre4: g.nombreRuta('ruta4'),
           nombreKm: g.nombreRuta('km'),
           vale2: g.rutaValorada('ruta2'), vale4: g.rutaValorada('ruta4'),
           valeKm: g.rutaValorada('km') };
});
paso('hay cinco rutas, no tres', cuantas.todas.length === 5, cuantas.todas.join(' · '));
paso('solo se ofrecen las que tienen importe puesto',
  cuantas.ofrecidas.join(',') === 'ruta1,ruta2,ruta3', cuantas.ofrecidas.join(' · '));
paso('cada una se llama como la llama la oficina, no «Ruta 2»',
  cuantas.nombre2 === 'Jerez', cuantas.nombre2);
paso('una ruta sin importe no vale para cobrar',
  cuantas.vale2 === true && cuantas.vale4 === false);
paso('y fuera de ruta siempre vale', cuantas.valeKm === true && /kil/i.test(cuantas.nombreKm),
  cuantas.nombreKm);

/* ================================================================
   2. En el parte: se elige ruta, no se escriben kilómetros
   ================================================================ */
bloque('2. En el parte se elige ruta');

const enParte = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  await g.sb.from('avisos').insert({ id:'rt-libre', tipo:'averia', estado:'asignado',
    prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:cli.id,
    puerta_id:g.S.puertas[0].id, creado:new Date().toISOString() });
  await g.cargar();
  g.dlgCierre('rt-libre');
  await new Promise(r => setTimeout(r, 800));
  const sel = document.getElementById('z-ruta');
  const caja = document.getElementById('z-caja-km');
  const opciones = sel ? [...sel.options].map(o => o.value) : [];
  /* Al elegir fuera de ruta aparecen los kilómetros */
  sel.value = 'km';
  sel.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 250));
  const conKm = !caja.hidden;
  sel.value = 'ruta2';
  sel.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 250));
  const sinKm = caja.hidden;
  const texto = document.getElementById('dlg-form').innerText;
  return { hay: !!sel, opciones, cajaOculta0: true, conKm, sinKm, texto };
});
paso('el parte ofrece elegir la ruta', enParte.hay === true);
paso('con las tres valoradas y la opción de fuera de ruta',
  enParte.opciones.join(',') === ',ruta1,ruta2,ruta3,km', enParte.opciones.join(' · '));
paso('las dos sin valorar no se ofrecen: elegirlas sería cobrar cero',
  !enParte.opciones.includes('ruta4') && !enParte.opciones.includes('ruta5'));
paso('al marcar fuera de ruta aparecen los kilómetros', enParte.conKm === true);
paso('y al elegir una ruta, desaparecen', enParte.sinKm === true);
paso('el parte dice qué pasa si no se elige nada',
  /se cobra El Puerto/.test(enParte.texto),
  (enParte.texto.match(/.{0,30}se cobra El Puerto/)||[''])[0]);

/* ================================================================
   3. Lo que se guarda
   ================================================================ */
bloque('3. Lo que se guarda');

const guardado = await T(async () => {
  const g = window.__T;
  /* Se escribe un kilometraje y luego se elige ruta: los kilómetros no pueden
     quedarse ahí, porque el importe sale de la ruta y ese número confundiría. */
  document.getElementById('z-ruta').value = 'km';
  document.getElementById('z-ruta').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 200));
  document.getElementById('z-km').value = '42';
  document.querySelector('#dlg-form [data-act="guardar-avance"]').click();
  await new Promise(r => setTimeout(r, 1500));
  const conKm = g.S.avisos.find(x => x.id === 'rt-libre');
  const km1 = { ruta: conKm.ruta, km: conKm.desplazamiento };

  g.dlgCierre('rt-libre');
  await new Promise(r => setTimeout(r, 800));
  document.getElementById('z-ruta').value = 'ruta3';
  document.getElementById('z-ruta').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 200));
  document.querySelector('#dlg-form [data-act="guardar-avance"]').click();
  await new Promise(r => setTimeout(r, 1500));
  const conRuta = g.S.avisos.find(x => x.id === 'rt-libre');
  g.cerrarDlg();
  return { km1, ruta: conRuta.ruta, km2: conRuta.desplazamiento };
});
paso('fuera de ruta se guardan la marca y los kilómetros',
  guardado.km1.ruta === 'km' && guardado.km1.km === 42,
  guardado.km1.ruta+' · '+guardado.km1.km);
paso('al elegir una ruta se guarda la ruta', guardado.ruta === 'ruta3', guardado.ruta);
paso('y los kilómetros sueltos se borran: el importe sale de la ruta',
  guardado.km2 == null, String(guardado.km2));

/* ================================================================
   4. La ruta que pone la oficina manda
   ================================================================ */
bloque('4. La que pone la oficina manda');

const deOficina = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  await g.sb.from('avisos').insert({ id:'rt-fijada', tipo:'averia', estado:'asignado',
    prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:cli.id,
    puerta_id:g.S.puertas[0].id, ruta:'ruta2', creado:new Date().toISOString() });
  await g.cargar();
  /* Como administrador (que es gestión) se puede cambiar */
  g.dlgCierre('rt-fijada');
  await new Promise(r => setTimeout(r, 700));
  const comoAdmin = !!document.getElementById('z-ruta') &&
    document.getElementById('z-ruta').tagName === 'SELECT';
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 200));
  /* Como técnico, no: la eligió quien sabe lo que se le cobra a ese cliente */
  const rolAntes = g.S.perfil.rol;
  g.S.perfil.rol = 'tecnico';
  g.dlgCierre('rt-fijada');
  await new Promise(r => setTimeout(r, 700));
  const sel = document.getElementById('z-ruta');
  const texto = document.getElementById('dlg-form').innerText;
  const comoTecnico = sel ? sel.tagName : 'no hay';
  const valor = sel ? sel.value : '';
  g.cerrarDlg();
  g.S.perfil.rol = rolAntes;
  return { comoAdmin, comoTecnico, valor, texto };
});
paso('la oficina sí puede cambiar la ruta que puso', deOficina.comoAdmin === true);
paso('el técnico la ve pero no la cambia',
  deOficina.comoTecnico === 'INPUT' && deOficina.valor === 'ruta2',
  deOficina.comoTecnico+' · '+deOficina.valor);
paso('y se le dice por qué', /La puso la oficina/.test(deOficina.texto));

/* ================================================================
   5. El parte impreso y la valoración
   ================================================================ */
bloque('5. El parte impreso y la valoración');

const papeles = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  const ayer = new Date(Date.now() - 86400000).toISOString();
  await g.sb.from('avisos').insert({ id:'rt-cerrada', tipo:'averia', estado:'cerrado',
    prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:cli.id,
    puerta_id:g.S.puertas[0].id, horas:2, ruta:'ruta2', cerrado:ayer, creado:ayer });
  await g.sb.from('valoraciones').insert({ aviso_id:'rt-cerrada', imp_mano_obra:90,
    imp_desplazamiento:45, imp_materiales:0, imp_total:135, coste_total:59, margen:76,
    facturado:false });
  /* Y una con una ruta sin valorar: desplazamiento a cero */
  await g.sb.from('avisos').insert({ id:'rt-sinvalor', tipo:'averia', estado:'cerrado',
    prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:cli.id,
    puerta_id:g.S.puertas[0].id, horas:2, ruta:'ruta4', cerrado:ayer, creado:ayer });
  await g.sb.from('valoraciones').insert({ aviso_id:'rt-sinvalor', imp_mano_obra:90,
    imp_desplazamiento:0, imp_materiales:0, imp_total:90, coste_total:44, margen:46,
    facturado:false });
  await g.cargar();

  g.dlgValoracion('rt-cerrada');
  await new Promise(r => setTimeout(r, 500));
  const val = document.getElementById('dlg-form').innerText;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 200));
  g.dlgValoracion('rt-sinvalor');
  await new Promise(r => setTimeout(r, 500));
  const valSin = document.getElementById('dlg-form').innerText;
  g.cerrarDlg();
  return { val, valSin, sinValorar: g.visitasRutaSinValorar().map(x => x.a.id) };
});
paso('la valoración dice de qué ruta sale el desplazamiento',
  /Jerez/.test(papeles.val), (papeles.val.match(/Desplazamiento.{0,30}/)||[''])[0]);
paso('y cuando la ruta no tiene importe, lo dice ahí mismo',
  /sin importe puesto/.test(papeles.valSin));
paso('esas visitas se listan aparte, como el material sin precio',
  papeles.sinValorar.includes('rt-sinvalor') && !papeles.sinValorar.includes('rt-cerrada'),
  papeles.sinValorar.join(' · '));

const panel = await T(async () => {
  const g = window.__T;
  g.S.tab = 'gestion'; g.pintar();
  await new Promise(r => setTimeout(r, 900));
  const v = document.getElementById('vista');
  return { texto: v.innerText, boton: !!v.querySelector('[data-act="tarifas"]') };
});
paso('Gestión las saca con su propio recuadro',
  /ruta sin valorar/i.test(panel.texto), (panel.texto.match(/.{0,30}ruta sin valorar/i)||[''])[0]);
paso('diciendo lo que de verdad pasa: que entra a cero y el margen engaña',
  /cero euros/.test(panel.texto) && /más alto que el real/.test(panel.texto));
paso('y con el nombre de la ruta que hay que valorar', /Huelva/.test(panel.texto));
paso('con el botón de ir a ponerle el importe', panel.boton === true);

/* El parte impreso se abre en una ventana aparte. Para poder leerlo se le
   cambia a la página su «abrir ventana» por uno que se queda con el HTML: así
   se comprueba el papel que firma el cliente, que es el que importa. */
const impreso = await T(async () => {
  const g = window.__T;
  /* Una visita fuera de ruta, con sus kilómetros: la de arriba acabó con ruta
     elegida, así que no sirve para esto. */
  const ayer = new Date(Date.now() - 86400000).toISOString();
  await g.sb.from('avisos').insert({ id:'rt-km', tipo:'averia', estado:'cerrado',
    prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:g.S.clientes[0].id,
    puerta_id:g.S.puertas[0].id, horas:2, ruta:'km', desplazamiento:42,
    cerrado:ayer, creado:ayer });
  await g.cargar();
  const hojas = [];
  const orig = window.open;
  window.open = () => ({
    document: { write: h => hojas.push(h), close(){} },
    print(){}, focus(){}, close(){} });
  try {
    await g.hojaParte('rt-cerrada');
    await new Promise(r => setTimeout(r, 400));
    await g.hojaParte('rt-km');
    await new Promise(r => setTimeout(r, 400));
  } finally { window.open = orig; }
  return { n: hojas.length, conRuta: hojas[0] || '', fueraDeRuta: hojas[1] || '' };
});
paso('el parte impreso se genera', impreso.n === 2, impreso.n+' hojas');
paso('y dice la RUTA donde antes ponía kilómetros',
  /Jerez/.test(impreso.conRuta) && !/km/.test(
    (impreso.conRuta.match(/Desplazamiento<\/th><td>[^<]*/)||[''])[0]),
  (impreso.conRuta.match(/Desplazamiento<\/th><td>[^<]*/)||[''])[0]);
/* La de fuera de ruta sí lleva kilómetros: ahí el número significa algo,
   porque es el viaje que no entra en ninguna zona. */
paso('fuera de ruta, el parte sí dice los kilómetros',
  /42 km/.test(impreso.fueraDeRuta),
  (impreso.fueraDeRuta.match(/Desplazamiento<\/th><td>[^<]*/)||[''])[0]);

/* ================================================================
   6. Tarifas: las cinco, con su nombre y su importe
   ================================================================ */
bloque('6. Tarifas');

const tarifas = await T(async () => {
  const g = window.__T;
  g.dlgTarifas();
  await new Promise(r => setTimeout(r, 600));
  const campos = g.RUTAS.map(k => ({
    k, nombre: !!document.getElementById('t-'+k+'-n'),
    importe: !!document.getElementById('t-'+k+'-i'),
    coste: !!document.getElementById('t-'+k+'-c'),
    valor: (document.getElementById('t-'+k+'-n') || {}).value }));
  const texto = document.getElementById('dlg-form').innerText;
  g.cerrarDlg();
  return { campos, texto };
});
paso('Tarifas tiene las cinco rutas, con nombre, importe y coste',
  tarifas.campos.length === 5 && tarifas.campos.every(c => c.nombre && c.importe && c.coste),
  tarifas.campos.map(c => c.valor).join(' · '));
paso('y explica que el nombre lo ponen ellos', /nombre que uséis vosotros/.test(tarifas.texto));

/* ================================================================
   7. La ruta habitual del cliente y del centro       03-11-2026
   ================================================================
   «Desde oficina se puede dejar ya marcada la ruta. En la oficina
   saben de primera mano dónde es la instalación. De esta manera el
   técnico no tiene que marcarlo, ya que por experiencia, todo lo
   que se le deje hecho al técnico mejor para él por ahorro de
   tiempo y disminución de errores.» David.

   La línea roja: lo que se cobra sale de la ruta guardada EN LA
   VISITA, igual que antes. La del cliente es una propuesta de
   pantalla, y si no se toca nada tiene que quedar guardada en la
   visita como cualquier otra ruta elegida a mano.
   ================================================================ */
bloque('7. La ruta habitual del cliente y del centro');

const habitual = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  const pu = g.S.puertas[0];
  /* El cliente va a Jerez (ruta2) */
  await g.sb.from('clientes').update({ ruta:'ruta2' }).eq('id', cli.id);
  await g.cargar();
  const soloCliente = g.rutaHabitual(cli.id, pu.id);
  const deDondeCli = g.deDondeLaRuta(cli.id, pu.id);
  /* Y la puerta está en un centro que va a Cádiz (ruta3): manda el centro */
  const { data: ce } = await g.sb.from('centros').insert({
    id:'ce-ruta', cliente_id:cli.id, nombre:'Nave del polígono',
    direccion:'Camino de la Nave 4', ruta:'ruta3' }).select().maybeSingle();
  await g.sb.from('puertas').update({ centro_id:'ce-ruta' }).eq('id', pu.id);
  await g.cargar();
  const conCentro = g.rutaHabitual(cli.id, pu.id);
  const deDondeCen = g.deDondeLaRuta(cli.id, pu.id);
  /* Una ruta sin valorar en la ficha no se propone: se cobraría a cero */
  await g.sb.from('centros').update({ ruta:'ruta4' }).eq('id', 'ce-ruta');
  await g.cargar();
  const sinValorar = g.rutaHabitual(cli.id, pu.id);
  await g.sb.from('centros').update({ ruta:'ruta3' }).eq('id', 'ce-ruta');
  await g.cargar();
  /* Un cliente sin ruta y sin centro con ruta: no se propone nada */
  const otro = g.S.clientes[1];
  const nada = otro ? g.rutaHabitual(otro.id, null) : 'no hay otro cliente';
  return { soloCliente, deDondeCli, conCentro, deDondeCen, sinValorar, nada,
           centro: !!ce };
});
paso('la ruta de la ficha del cliente se propone', habitual.soloCliente === 'ruta2',
  habitual.soloCliente);
paso('y se dice de dónde sale', /habitual de /.test(habitual.deDondeCli), habitual.deDondeCli);
paso('la del centro manda sobre la del cliente: se conduce a una dirección',
  habitual.conCentro === 'ruta3', habitual.conCentro);
paso('y se nombra el centro, no el cliente',
  /Nave del polígono/.test(habitual.deDondeCen), habitual.deDondeCen);
paso('una ruta sin importe puesto NO se propone: se cobraría a cero',
  habitual.sinValorar === 'ruta2', habitual.sinValorar);
paso('sin ruta en ninguna parte no se propone nada', habitual.nada === '', habitual.nada);

const enAlta = await T(async () => {
  const g = window.__T;
  const pu = g.S.puertas[0];
  /* dlgAviso(puertaId, avisoId, clienteId, fecha): el primero es la puerta */
  g.dlgAviso(pu.id);
  await new Promise(r => setTimeout(r, 900));
  const sel = document.getElementById('a-ruta');
  const puesta = sel ? sel.value : null;
  const pista = (document.getElementById('a-rpista') || {}).textContent || '';
  /* Si la oficina la cambia a mano, deja de proponerse */
  sel.value = 'ruta1';
  sel.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 200));
  const puerta = document.getElementById('a-puerta');
  puerta.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 300));
  const trasTocar = sel.value;
  g.cerrarDlg();
  return { puesta, pista, trasTocar };
});
paso('al crear la asistencia la ruta sale ya puesta', enAlta.puesta === 'ruta3', enAlta.puesta);
paso('y la pantalla dice que la ha puesto ella y de dónde',
  /Puesta sola/.test(enAlta.pista) && /Nave del polígono/.test(enAlta.pista), enAlta.pista);
paso('si la oficina la cambia a mano, no se la vuelve a pisar',
  enAlta.trasTocar === 'ruta1', enAlta.trasTocar);

const enElParte = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  /* Una visita SIN ruta, de las que ya existían antes de todo esto */
  await g.sb.from('avisos').insert({ id:'rt-habitual', tipo:'averia', estado:'asignado',
    prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:cli.id,
    puerta_id:g.S.puertas[0].id, horas:2, creado:new Date().toISOString() });
  await g.cargar();
  g.dlgCierre('rt-habitual');
  await new Promise(r => setTimeout(r, 900));
  const sel = document.getElementById('z-ruta');
  const propuesta = sel ? sel.value : null;
  const esSelect = sel ? sel.tagName : '';
  const texto = document.getElementById('dlg-form').innerText;
  /* Y lo que se guarda si el técnico no toca nada tiene que ser esa ruta */
  document.querySelector('#dlg-form [data-act="guardar-avance"]').click();
  await new Promise(r => setTimeout(r, 1500));
  const av = g.S.avisos.find(x => x.id === 'rt-habitual');
  g.cerrarDlg();
  return { propuesta, esSelect, guardada: av.ruta,
           dice: /Puesta sola/.test(texto),
           deDonde: (texto.match(/Puesta sola:[^.]*/) || [''])[0] };
});
paso('en el parte la ruta sale propuesta, no vacía', enElParte.propuesta === 'ruta3',
  enElParte.propuesta);
paso('pero se PROPONE, no se fija: el técnico la puede cambiar',
  enElParte.esSelect === 'SELECT', enElParte.esSelect);
paso('y se le dice de dónde viene, con el nombre del sitio',
  enElParte.dice === true && /Nave del polígono/.test(enElParte.deDonde), enElParte.deDonde);
paso('si no la toca, queda guardada en la visita como cualquier otra',
  enElParte.guardada === 'ruta3', enElParte.guardada);

const fichas = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  g.dlgCliente(cli.id);
  await new Promise(r => setTimeout(r, 700));
  const selC = document.getElementById('c-ruta');
  const ops = selC ? [...selC.options].map(o => o.value) : [];
  const textoC = document.getElementById('dlg-form').innerText;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 200));
  g.dlgCentro('ce-ruta', cli.id);
  await new Promise(r => setTimeout(r, 700));
  const selCe = document.getElementById('ce-ruta');
  const valCe = selCe ? selCe.value : null;
  const textoCe = document.getElementById('dlg-form').innerText;
  g.cerrarDlg();
  return { ops, valC: selC ? selC.value : null, textoC, valCe, textoCe };
});
paso('la ficha del cliente tiene su ruta habitual, con la que ya tiene elegida',
  fichas.valC === 'ruta2', fichas.valC);
paso('solo se ofrecen las rutas valoradas, más fuera de ruta y «sin ruta fija»',
  fichas.ops.join(',') === ',ruta1,ruta2,ruta3,km', fichas.ops.join(' · '));
paso('y avisa de que los centros con ruta propia mandan sobre esta',
  /esa manda/.test(fichas.textoC) && /Nave del polígono/.test(fichas.textoC));
paso('el centro tiene la suya', fichas.valCe === 'ruta3', fichas.valCe);
paso('y dice que manda sobre la del cliente', /Manda sobre la del cliente/.test(fichas.textoCe));

const quienFalta = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  const lista1 = g.clientesSinRuta().map(x => x.cliente.id);
  /* Se le quita la ruta al cliente: sigue teniéndola el centro, así que no
     cuenta como cliente sin ruta */
  await g.sb.from('clientes').update({ ruta:null }).eq('id', cli.id);
  await g.cargar();
  const conCentro = g.clientesSinRuta().map(x => x.cliente.id);
  /* Y sin ruta en ninguna parte, sí */
  await g.sb.from('centros').update({ ruta:null }).eq('id','ce-ruta');
  await g.cargar();
  const sinNada = g.clientesSinRuta();
  g.S.tab = 'gestion'; g.pintar();
  await new Promise(r => setTimeout(r, 900));
  const texto = document.getElementById('vista').innerText;
  return { lista1, conCentro, sinNada: sinNada.map(x => x.cliente.id),
           visitas: (sinNada[0] || {}).visitas, texto,
           mio: cli.id };
});
paso('un cliente con ruta en su ficha no sale en la lista de los que faltan',
  !quienFalta.lista1.includes(quienFalta.mio), quienFalta.lista1.join(' · '));
paso('tampoco si la tiene en un centro suyo',
  !quienFalta.conCentro.includes(quienFalta.mio), quienFalta.conCentro.join(' · '));
paso('sin ruta en ninguna parte, sale, y con sus visitas contadas',
  quienFalta.sinNada.includes(quienFalta.mio) && quienFalta.visitas > 0,
  quienFalta.sinNada.length+' clientes · '+quienFalta.visitas+' visitas');
paso('y Gestión lo saca en su recuadro, diciendo para qué sirve ponerla',
  /Clientes sin ruta habitual/.test(quienFalta.texto) &&
  /no se vuelve a preguntar/.test(quienFalta.texto),
  (quienFalta.texto.match(/Clientes sin ruta habitual/) || ['no sale'])[0]);

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
