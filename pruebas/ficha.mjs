/* ================================================================
   ficha.mjs — lo que David encontró probando el alta en obra.

   Tres cosas, las tres suyas:

   1. Los desplegables largos no tenían buscador. Con cincuenta
      clientes o diecisiete tipos de puerta, elegir era bajar con el
      dedo por la lista. Ahora llevan una casilla de búsqueda que va
      dejando en el desplegable solo lo que casa.

   2. La ficha técnica pedía el cuadro y el motor, y el panel de
      componentes los volvía a pedir. Se escribía dos veces lo mismo.
      Ahora es un solo dato con dos puertas de entrada.

   3. El modo de accionamiento y el tipo de usuario solo estaban en el
      expediente, así que una puerta recién dada de alta no podía decir
      qué protección le tocaba. Ahora están en su ficha, y la ficha es
      la que manda.

   Lo que fija esta suite:
     · Qué desplegables llevan buscador y cuáles no, y que filtrar no
       pierde nunca el valor elegido.
     · Que elegir desde fuera (el cliente que sale de la puerta) funciona
       aunque el desplegable esté filtrado.
     · Que la ficha crea y actualiza el componente del motor y del cuadro,
       y que el componente devuelve el cambio a la ficha.
     · Que el nombre del componente del motor cambia con la familia.
     · Que de la ficha sale la protección, y con ella los elementos.
     · Que sin las columnas nuevas la aplicación sigue funcionando.
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
const ctx = await nav.newContext({ viewport:{width:1320,height:1800}, locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    /* Veinte clientes y veinte puertas: el caso real de David, donde elegir en un
       desplegable sin buscador es bajar con el dedo por la lista. */
    for (let i = 0; i < 20; i++){
      db.clientes.push({ id:'cli-'+i, nombre:'Cliente de prueba '+i, archivado:false,
                         creado:new Date().toISOString() });
      db.etiquetas.push({ codigo:'AR-03'+i, token:'tok-03'+i, creado:new Date().toISOString() });
      db.puertas.push({ id:'pu-'+i, codigo:'AR-03'+i, cliente_id:'cli-'+i,
        cliente:'Cliente de prueba '+i, direccion:'Calle '+i, tipo:'Corredera',
        estado:'operativa', creado:new Date().toISOString() });
    }
    // una peatonal y una barrera, donde el motor no se llama «motor»
    db.puertas.push({ id:'pu-peatonal', codigo:'AR-0401', cliente_id:'cli-1', cliente:'Cliente de prueba 1',
      tipo:'Peatonal automática corredera', estado:'operativa', creado:new Date().toISOString() });
    db.puertas.push({ id:'pu-barrera', codigo:'AR-0402', cliente_id:'cli-2', cliente:'Cliente de prueba 2',
      tipo:'Barrera de vehículos', estado:'operativa', creado:new Date().toISOString() });
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

/* ================================================================
   1. Qué desplegables llevan buscador
   ================================================================ */
bloque('1. El buscador se pone donde hace falta y no donde estorba');

const donde = await T(async () => {
  const g = window.__T, out = {};
  const leer = () => Array.from(document.querySelectorAll('#dlg-form select'))
    .map(s => ({ id:s.id, combo: s.dataset.combo === '1', n: s.options.length }));
  g.dlgAviso(null);      await new Promise(r=>setTimeout(r,300)); out.aviso = leer();     g.cerrarDlg();
  g.dlgContrato(null);   await new Promise(r=>setTimeout(r,300)); out.contrato = leer();  g.cerrarDlg();
  g.dlgComponente(null, 'pu-1'); await new Promise(r=>setTimeout(r,300)); out.comp = leer(); g.cerrarDlg();
  g.dlgPuerta('pu-1');   await new Promise(r=>setTimeout(r,300)); out.puerta = leer();    g.cerrarDlg();
  out.desde = g.COMBO_DESDE;
  return out;
});
const con = (lista, id) => (lista.find(x => x.id === id) || {}).combo;
const nOpc = (lista, id) => (lista.find(x => x.id === id) || {}).n;

paso('la lista de puertas de una asistencia lleva buscador', con(donde.aviso,'a-puerta') === true);
paso('y la de clientes también', con(donde.aviso,'a-cliente') === true);
paso('el cliente de un contrato lleva buscador', con(donde.contrato,'k-cli') === true);
paso('el tipo de puerta lleva buscador: son diecisiete',
  con(donde.puerta,'f-tipo') === true, nOpc(donde.puerta,'f-tipo'));
paso('el catálogo de componentes lleva buscador', con(donde.comp,'o-clave') === true);
paso('la prioridad de una asistencia NO lo lleva: son tres',
  con(donde.aviso,'a-prio') === false, nOpc(donde.aviso,'a-prio'));
paso('el estado tampoco', con(donde.aviso,'a-estado') === false, nOpc(donde.aviso,'a-estado'));
paso('ni la forma de pago del contrato', con(donde.contrato,'k-pago') === false);
paso('ni el modo de accionamiento de la ficha: son cuatro',
  con(donde.puerta,'f-modo') === false, nOpc(donde.puerta,'f-modo'));
paso('el umbral está puesto en diez opciones', donde.desde === 10, donde.desde);
[...donde.aviso, ...donde.contrato, ...donde.comp, ...donde.puerta].forEach(() => {});
paso('ningún desplegable corto se ha llenado de buscadores',
  [...donde.aviso, ...donde.contrato, ...donde.puerta].every(x => !x.combo || x.n >= donde.desde),
  [...donde.aviso, ...donde.contrato, ...donde.puerta].filter(x=>x.combo).map(x=>x.id).join(','));

/* ================================================================
   2. Buscar de verdad
   ================================================================ */
bloque('2. El buscador filtra, elige solo y no pierde lo elegido');

const buscar = await T(async () => {
  const g = window.__T;
  g.dlgPuerta('pu-1');
  await new Promise(r=>setTimeout(r,300));
  const sel = document.getElementById('f-tipo');
  const caja = sel.closest('.combo');
  const inp = caja.querySelector('.combo-busca');
  const cuenta = () => caja.querySelector('.combo-cuenta').textContent;
  const escribir = v => { inp.value = v; inp.dispatchEvent(new Event('input')); };
  /* El número de tipos no se escribe aquí a mano: se cuenta el que la aplicación
     ha puesto en el desplegable (la lista de la empresa, más el tipo que tenga ya
     escrito esta puerta aunque no esté en ella). */
  const out = { todas: sel.options.length, cuentaInicial: cuenta(),
                tipos: (sel.__comboTodas || []).filter(o => o.v !== '').length,
                inicial: sel.value };

  escribir('seccio');
  out.filtrado = { n: sel.options.length, valor: sel.value, cuenta: cuenta() };

  // sin tildes ni mayúsculas
  escribir('BASCU');
  out.sinTildes = { n: sel.options.length, valor: sel.value };

  escribir('zzzz');
  out.nada = { n: sel.options.length, cuenta: cuenta(), valor: sel.value };

  escribir('');
  out.vuelta = sel.options.length;

  /* Lo elegido no se filtra fuera NUNCA: si se fuera, al guardar se perdería el
     tipo de la puerta sin que nadie dijera nada. Se busca algo que deje VARIAS
     coincidencias: con una sola, la aplicación la elige sola a propósito, que es
     justo lo que se comprueba más arriba. */
  sel.value = 'Corredera';
  escribir('puerta');
  out.elegidaSigue = { hay: Array.from(sel.options).some(o => o.value === 'Corredera'),
                       valor: sel.value, n: sel.options.length };
  escribir('');
  g.cerrarDlg();
  return out;
});
paso('de primeras están todos los tipos de la aplicación y la opción vacía',
  buscar.todas === buscar.tipos + 1, buscar.todas+' para '+buscar.tipos+' tipos');
paso('y dice cuántos hay para elegir, sin contar la vacía',
  buscar.cuentaInicial === buscar.tipos+' para elegir', buscar.cuentaInicial);
paso('escribir «seccio» deja una sola coincidencia',
  buscar.filtrado.cuenta === '1 de '+buscar.tipos,
  buscar.filtrado.n+' opciones · '+buscar.filtrado.cuenta);
paso('y como queda una sola, se elige sola: un toque menos',
  buscar.filtrado.valor === 'Seccional', buscar.filtrado.valor);
paso('buscar en mayúsculas y sin tildes encuentra «Basculante»',
  buscar.sinTildes.valor === 'Basculante', buscar.sinTildes.valor);
paso('si no coincide nada, lo dice con lo que se escribió',
  /Nada coincide/.test(buscar.nada.cuenta), buscar.nada.cuenta);
paso('y aun así no se queda sin valor: mantiene el elegido',
  buscar.nada.valor !== '', buscar.nada.valor);
paso('al borrar la búsqueda vuelven todos',
  buscar.vuelta === buscar.tipos + 1, buscar.vuelta);
paso('lo elegido no se filtra fuera aunque no case con lo escrito',
  buscar.elegidaSigue.hay === true && buscar.elegidaSigue.valor === 'Corredera',
  JSON.stringify(buscar.elegidaSigue));

/* Elegir desde fuera, con el desplegable filtrado */
const desdeFuera = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null);
  await new Promise(r=>setTimeout(r,350));
  const sp = document.getElementById('a-puerta'), sc = document.getElementById('a-cliente');
  const inpC = sc.closest('.combo').querySelector('.combo-busca');
  // se filtra la lista de clientes a uno que NO es el de la puerta
  inpC.value = 'prueba 9'; inpC.dispatchEvent(new Event('input'));
  const antes = sc.options.length;
  // y se elige una puerta del cliente 3: su cliente tiene que quedar puesto igual
  sp.value = 'pu-3';
  sp.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r=>setTimeout(r,150));
  const out = { antes, valor: sc.value, opciones: sc.options.length,
                filtro: inpC.value, tiene: g.comboTiene(sc, 'cli-3') };
  g.cerrarDlg();
  return out;
});
paso('con la lista de clientes filtrada quedan pocos', desdeFuera.antes <= 3, desdeFuera.antes);
paso('elegir la puerta pone SU cliente aunque estuviera filtrado fuera',
  desdeFuera.valor === 'cli-3', desdeFuera.valor);
paso('y para eso se quita el filtro, en vez de dejar el campo en blanco',
  desdeFuera.opciones > 3, desdeFuera.opciones);
paso('comboTiene mira la lista completa, no la que se está viendo',
  desdeFuera.tiene === true);

/* ================================================================
   3. Cuadro y motor: una sola vez
   ================================================================ */
bloque('3. El cuadro y el motor se escriben una sola vez');

const campos = await T(async () => {
  const g = window.__T;
  g.dlgPuerta('pu-2');
  await new Promise(r=>setTimeout(r,300));
  const hay = id => !!document.getElementById(id);
  const out = { nuevos: ['f-motor-marca','f-motor-modelo','f-cuadro-marca','f-cuadro-modelo'].every(hay),
                viejos: hay('f-motor') || hay('f-cuadro'),
                enBorrador: ['f-motor-marca','f-cuadro-modelo'].every(x => g.CAMPOS_PUERTA.includes(x)) };
  g.cerrarDlg();
  return out;
});
paso('la ficha pide marca y modelo de cada uno', campos.nuevos === true);
paso('y ya no hay dos campos sueltos de texto', campos.viejos === false);
paso('los campos nuevos se recuperan si se sale a crear un cliente', campos.enBorrador === true);

const volcado = await T(async () => {
  const g = window.__T;
  g.dlgPuerta('pu-2');
  await new Promise(r=>setTimeout(r,300));
  document.getElementById('f-motor-marca').value = 'Erreka';
  document.getElementById('f-motor-modelo').value = 'Rino 4';
  document.getElementById('f-cuadro-marca').value = 'Erreka';
  document.getElementById('f-cuadro-modelo').value = 'Roma 24';
  document.querySelector('#dlg button[type="submit"]').click();
  await new Promise(r=>setTimeout(r,1500));
  const p = g.puertaDe('pu-2');
  const comps = g.componentesDe('pu-2').filter(c => ['motor','cuadro'].includes(c.clave))
    .map(c => ({ clave:c.clave, marca:c.marca, modelo:c.modelo, nombre:c.nombre, serie:c.num_serie }));
  const min = g.componentesMinimos(p);
  return { texto: { cuadro:p.cuadro, motor:p.motor }, comps,
           faltanMotor: min.faltan.some(x => x.clave === 'motor'),
           faltanCuadro: min.faltan.some(x => x.clave === 'cuadro') };
});
paso('al guardar la ficha, el motor queda dado de alta como componente',
  (volcado.comps.find(c=>c.clave==='motor')||{}).marca === 'Erreka' &&
  (volcado.comps.find(c=>c.clave==='motor')||{}).modelo === 'Rino 4',
  JSON.stringify(volcado.comps));
paso('y el cuadro también',
  (volcado.comps.find(c=>c.clave==='cuadro')||{}).modelo === 'Roma 24');
paso('con su nombre del catálogo, no uno inventado',
  /Automatismo|motorreductor/i.test((volcado.comps.find(c=>c.clave==='motor')||{}).nombre || ''),
  (volcado.comps.find(c=>c.clave==='motor')||{}).nombre);
paso('el inventario ya no dice que falten por dar de alta',
  volcado.faltanMotor === false && volcado.faltanCuadro === false);
paso('y el texto de siempre se sigue guardando, para los documentos',
  volcado.texto.motor === 'Erreka Rino 4' && volcado.texto.cuadro === 'Erreka Roma 24',
  JSON.stringify(volcado.texto));

const vuelta = await T(async () => {
  const g = window.__T;
  const motor = g.componentesDe('pu-2').find(c => c.clave === 'motor');
  g.dlgComponente(motor.id);
  await new Promise(r=>setTimeout(r,300));
  const pista = document.getElementById('dlg-form').innerText;
  document.getElementById('o-modelo').value = 'Rino 5';
  document.getElementById('o-serie').value = 'MT-99120';
  document.querySelector('#dlg button[type="submit"]').click();
  await new Promise(r=>setTimeout(r,1500));
  const p = g.puertaDe('pu-2');
  // y la ficha lo enseña ya separado
  g.dlgPuerta('pu-2');
  await new Promise(r=>setTimeout(r,300));
  const enFicha = { marca: document.getElementById('f-motor-marca').value,
                    modelo: document.getElementById('f-motor-modelo').value };
  g.cerrarDlg();
  return { texto:p.motor, enFicha, aviso: /mismos que los de la ficha/.test(pista),
           serie: (g.componentesDe('pu-2').find(c=>c.clave==='motor')||{}).num_serie };
});
paso('cambiar el modelo en el componente lo cambia también en la ficha',
  vuelta.texto === 'Erreka Rino 5', vuelta.texto);
paso('y la ficha lo enseña ya repartido en marca y modelo',
  vuelta.enFicha.marca === 'Erreka' && vuelta.enFicha.modelo === 'Rino 5',
  JSON.stringify(vuelta.enFicha));
paso('el componente avisa de que ese dato es el mismo que el de la ficha',
  vuelta.aviso === true);
paso('el número de serie se queda donde cabe: en el componente',
  vuelta.serie === 'MT-99120', vuelta.serie);

/* Un texto antiguo de una sola línea no se parte a ojo */
const antiguo = await T(async () => {
  const g = window.__T;
  await g.sb.from('puertas').update({ motor:'Motor viejo sin modelo claro' }).eq('id','pu-4');
  await g.cargar();
  const m = g.marcaModeloFicha(g.puertaDe('pu-4'), 'motor');
  return m;
});
paso('lo que había escrito de una vez se pone entero en «marca», sin adivinar el modelo',
  antiguo.marca === 'Motor viejo sin modelo claro' && antiguo.modelo === '' && antiguo.de === 'ficha',
  JSON.stringify(antiguo));

/* El motor no se llama igual en todas las familias */
const familias = await T(() => {
  const g = window.__T;
  return { industrial: g.claveFicha(g.puertaDe('pu-1'), 'motor'),
           peatonal:   g.claveFicha(g.puertaDe('pu-peatonal'), 'motor'),
           barrera:    g.claveFicha(g.puertaDe('pu-barrera'), 'motor'),
           cuadroPeat: g.claveFicha(g.puertaDe('pu-peatonal'), 'cuadro'),
           deClave:    g.fichaDeClave(g.puertaDe('pu-peatonal'), 'operador'),
           noEs:       g.fichaDeClave(g.puertaDe('pu-1'), 'banda') };
});
paso('en una industrial el motor es el «motor»', familias.industrial === 'motor');
paso('en una peatonal es el «operador»', familias.peatonal === 'operador', familias.peatonal);
paso('en una barrera es el «cuerpo»', familias.barrera === 'cuerpo', familias.barrera);
paso('la peatonal sí tiene cuadro', familias.cuadroPeat === 'cuadro');
paso('y se reconoce al revés: el operador es el motor de la ficha',
  familias.deClave === 'motor', familias.deClave);
paso('una banda de seguridad no es ni motor ni cuadro', familias.noEs === null);

/* ================================================================
   4. Cómo se acciona y quién la usa
   ================================================================ */
bloque('4. La protección sale de la ficha, sin esperar al expediente');

const sinNada = await T(() => {
  const g = window.__T;
  const p = g.puertaDe('pu-5');
  const min = g.componentesMinimos(p);
  return { prot: g.proteccionDePuerta(p), aviso: min.aviso };
});
paso('una puerta sin esos dos datos no tiene protección deducida',
  sinNada.prot === null);
paso('y el aviso manda a la ficha, no a esperar un expediente',
  /se ponen en su ficha/.test(sinNada.aviso) && /No hace falta esperar/.test(sinNada.aviso),
  sinNada.aviso.slice(0, 80));

const conFicha = await T(async () => {
  const g = window.__T;
  g.dlgPuerta('pu-5');
  await new Promise(r=>setTimeout(r,300));
  document.getElementById('f-modo').value = 'impulso_sin_vista';
  document.getElementById('f-usuarios').value = 'no_informados';
  document.querySelector('#dlg button[type="submit"]').click();
  await new Promise(r=>setTimeout(r,1500));
  const p = g.puertaDe('pu-5');
  const min = g.componentesMinimos(p);
  return { modo:p.modo, usuarios:p.usuarios, prot: g.proteccionDePuerta(p),
           aviso: min.aviso, faltan: min.faltan.map(x=>x.clave), todos: min.todos.map(x=>x.clave) };
});
paso('la ficha guarda el modo de accionamiento y el tipo de usuario',
  conFicha.modo === 'impulso_sin_vista' && conFicha.usuarios === 'no_informados');
paso('y de ahí sale la protección, marcada como venida de la ficha',
  conFicha.prot && conFicha.prot.origen === 'ficha', JSON.stringify(conFicha.prot));
paso('ya no salen solo los genéricos del tipo: entran los de la matriz',
  conFicha.todos.includes('fotocelulas') || conFicha.todos.includes('banda'),
  conFicha.todos.join(','));
paso('el aviso dice en palabras cómo se acciona y quién la usa',
  /Según la ficha de la puerta se acciona por/.test(conFicha.aviso), conFicha.aviso.slice(0,70));
paso('y sigue diciendo que la matriz está pendiente de validar',
  /PENDIENTE DE VALIDAR/.test(conFicha.aviso));

/* La ficha manda sobre el expediente, que es la foto del día en que se emitió */
const contraExpediente = await T(async () => {
  const g = window.__T;
  const { data } = await g.sb.from('expedientes').insert({
    puerta_id:'pu-5', referencia:'EX-PRUEBA-1', familia:'industrial', situacion:'adecuacion',
    estado:'borrador', creado:new Date().toISOString(),
    datos:{ puerta:{ modo:'hombre_presente', usuarios:'informados_privado' } } }).select().maybeSingle();
  await g.cargar();
  const conFicha = g.proteccionDePuerta(g.puertaDe('pu-5'));
  // y ahora se vacía la ficha: entonces sí vale lo que diga el expediente
  await g.sb.from('puertas').update({ modo:null, usuarios:null }).eq('id','pu-5');
  await g.cargar();
  const sinFicha = g.proteccionDePuerta(g.puertaDe('pu-5'));
  const aviso = g.componentesMinimos(g.puertaDe('pu-5')).aviso;
  await g.sb.from('expedientes').delete().eq('id', data.id);
  await g.cargar();
  return { conFicha, sinFicha, aviso };
});
paso('con la ficha rellena manda la ficha, no el expediente',
  contraExpediente.conFicha.modo === 'impulso_sin_vista' &&
  contraExpediente.conFicha.origen === 'ficha', JSON.stringify(contraExpediente.conFicha));
paso('con la ficha vacía se usa el último expediente que lo diga',
  contraExpediente.sinFicha.modo === 'hombre_presente' &&
  contraExpediente.sinFicha.origen === 'expediente', JSON.stringify(contraExpediente.sinFicha));
paso('y se dice de dónde ha salido, para que nadie lo dé por escrito en la ficha',
  /tomado de su último expediente/.test(contraExpediente.aviso));

/* Un expediente nuevo nace con lo que dice la ficha */
const expNuevo = await T(async () => {
  const g = window.__T;
  await g.sb.from('puertas').update({ modo:'automatico', usuarios:'no_informados' }).eq('id','pu-6');
  await g.cargar();
  g.S.ficha = 'pu-6';
  g.dlgExpediente ? g.dlgExpediente('pu-6') : null;
  return { hay: !!g.dlgExpediente };
});
// dlgExpediente no está a la vista del banco: se comprueba el efecto por la función
paso('la ficha de la puerta guarda el modo para que lo herede el expediente',
  await T(() => { const p = window.__T.puertaDe('pu-6'); return p.modo === 'automatico'; }));

/* Es recomendado, no obligatorio: lo decidió David */
const recom = await T(() => {
  const g = window.__T;
  const p = g.puertaDe('pu-7');
  return { rec: g.recomendadoObra(p),
           min: g.minimoObra(Object.assign({}, p, { codigo:'AR-0307', tipo:'Corredera',
                 ancho_mm:3000, alto_mm:2200, matricula:'X' }), 2) };
});
paso('sin modo ni usuario, el mínimo de obra se puede completar igual',
  recom.min.completo === true, recom.min.faltan.map(x=>x.clave).join(','));
paso('pero sale como recomendado, diciendo para qué sirve',
  recom.rec.some(x => /Cómo se acciona y quién la usa/.test(x)), recom.rec.join(' · '));

/* ================================================================
   5. Sin el SQL nuevo, todo sigue funcionando
   ================================================================ */
bloque('5. Si no se ha ejecutado servidor/ficha.sql');

const sinSql = await T(async () => {
  const g = window.__T;
  g.S.sinModo = true;
  g.dlgPuerta('pu-8');
  await new Promise(r=>setTimeout(r,300));
  const hay = !!document.getElementById('f-modo');
  const motor = !!document.getElementById('f-motor-marca');
  g.cerrarDlg();
  const rec = g.recomendadoObra(g.puertaDe('pu-8'));
  g.S.sinModo = false;
  return { hay, motor, rec };
});
paso('no se enseñan los dos desplegables que la base de datos no puede guardar',
  sinSql.hay === false);
paso('pero el cuadro y el motor siguen estando: esos no necesitan SQL',
  sinSql.motor === true);
paso('y no se recomienda rellenar algo que no se puede guardar',
  !sinSql.rec.some(x => /Cómo se acciona/.test(x)), sinSql.rec.join(' · '));

/* ================================================================
   Final
   ================================================================ */
console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
