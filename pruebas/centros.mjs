/* ================================================================
   centros.mjs — el sitio donde están las puertas.

   Por qué existe: la cadena era cliente → puerta, con la dirección
   escrita en cada puerta. Con una comunidad de tres portales o un
   cliente con cuatro naves, la misma dirección se teclea en cada
   puerta, cada vez un poco distinta, y lo que el técnico necesita
   saber antes de salir (cómo se entra, a qué horas, con quién hablar
   allí y qué riesgos tiene el sitio) no estaba en ninguna parte.

   Lo que fija esta suite:
     1. El centro es OPCIONAL: una puerta sin centro funciona igual.
     2. Un centro es de un cliente, y una puerta no puede acabar en el
        sitio de otro cliente.
     3. La puerta hereda la dirección del centro, sin pisar lo escrito
        a mano.
     4. Los cuatro datos del sitio llegan a donde el técnico los lee
        ANTES de ir: su tarjeta de trabajo, la ficha y la hoja de campo.
     5. Un centro sin datos de acceso no pinta recuadros vacíos.
     6. Agrupar las puertas que ya comparten dirección.
     7. Borrar un centro no se lleva las puertas por delante.
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
    db.ajustes.push({ clave:'empresa', valor:{
      razon_social:'Ariza Puertas y Automatismos S.L.U.', nif:'B72004849',
      domicilio:'Calle Orilla 19', cp:'11500', poblacion:'El Puerto de Santa María',
      provincia:'Cádiz', telefono:'661 352 795', email:'arizapuertasautomaticas@gmail.com',
      representante:'David Ariza Arana', cargo_firmante:'Administrador único',
      responsable_tecnico:'David Ariza Arana' } });
    /* Una comunidad con tres portales, que es el caso que los centros vienen a
       arreglar: hoy serían tres puertas con la misma dirección escrita tres
       veces y nada que diga en qué portal está cada una. */
    const cli = db.clientes[0];
    ['AR-0101','AR-0102','AR-0103'].forEach((cod, i) => {
      db.etiquetas.push({ codigo:cod, token:'tok-'+cod, creado:new Date().toISOString() });
      db.puertas.push({ id:'pt-portal-'+i, codigo:cod, cliente_id:cli.id, cliente:cli.nombre,
        direccion:'Avenida de la Bajamar 14', ubicacion:'Portal '+(i+1),
        tipo:'Corredera', marca:'Erreka', modelo:'Rino 4', estado:'operativa',
        token:'tok-'+cod, creado:new Date().toISOString() });
    });
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
const esperar = (ms=350) => pag.waitForTimeout(ms);

/* ================================================================
   1. El centro es opcional
   ================================================================ */
bloque('1. El centro es opcional: sin él, todo sigue igual');

const sinCentro = await T(() => {
  const g = window.__T;
  const p = g.S.puertas.find(x => x.codigo === 'AR-0001');
  return { centro: g.centroDePuerta(p), sitio: g.sitioPuerta(p),
           bloque: g.bloqueSitio(p), datos: g.datosCentro(null).length,
           centrosDelCliente: g.centrosDe(p.cliente_id).length };
});
paso('una puerta sin centro no tiene centro, y no se inventa ninguno',
  sinCentro.centro === null || sinCentro.centro === undefined, JSON.stringify(sinCentro.centro));
paso('su sitio sigue siendo la dirección escrita en la puerta',
  /Bajamar/.test(sinCentro.sitio) && /Rampa/.test(sinCentro.sitio), sinCentro.sitio);
paso('y NO se pinta ningún recuadro del sitio',
  sinCentro.bloque === '', JSON.stringify(sinCentro.bloque));
paso('datosCentro de nada devuelve nada, sin romperse',
  sinCentro.datos === 0, sinCentro.datos);
paso('un cliente sin centros tiene cero centros',
  sinCentro.centrosDelCliente === 0, sinCentro.centrosDelCliente);

/* ================================================================
   2. Un centro es de un cliente
   ================================================================ */
bloque('2. Un centro es de un cliente');

const creado = await T(async () => {
  const g = window.__T, S = g.S;
  const cli = S.clientes.find(c => /Flores/.test(c.nombre));
  const otro = S.clientes.find(c => /Guadalete/.test(c.nombre));
  const { data } = await g.sb.from('centros').insert({
    cliente_id: cli.id, nombre:'Portal 3', direccion:'Avenida de la Bajamar 14',
    poblacion:'El Puerto de Santa María',
    acceso:'Llave del portal en el llavero AR-12. El cuadro está en el cuarto de contadores.',
    horario:'De 9:00 a 14:00, de lunes a viernes',
    contacto_nombre:'Manuel, conserje', contacto_telefono:'600 111 222',
    avisos_seguridad:'Rampa con paso continuo de coches: hay que cortar el paso para trabajar.'
  }).select().maybeSingle();
  const { data: d2 } = await g.sb.from('centros').insert({
    cliente_id: otro.id, nombre:'Nave 7', direccion:'Polígono El Palmar, nave 7'
  }).select().maybeSingle();
  await g.cargar();
  return { id: data.id, otroId: d2.id, cli: cli.id, otro: otro.id,
           deLasFlores: g.centrosDe(cli.id).map(x => x.nombre),
           delOtro: g.centrosDe(otro.id).map(x => x.nombre) };
});
paso('el centro sale en los centros de SU cliente',
  creado.deLasFlores.includes('Portal 3'), creado.deLasFlores.join(','));
paso('y no en los de otro',
  !creado.delOtro.includes('Portal 3'), creado.delOtro.join(','));

const cruzado = await T(async d => {
  const g = window.__T;
  /* Se fuerza a mano la situación imposible: una puerta de un cliente apuntando
     al centro de otro. La pantalla no lo permite, pero el dato podría llegar así
     de una importación o de un cliente cambiado después. */
  await g.sb.from('puertas').update({ centro_id: d.otroId }).eq('id', 'pt-portal-0');
  await g.cargar();
  const p = g.puertaDe('pt-portal-0');
  const ce = g.centroDePuerta(p);
  return { nombre: ce ? ce.nombre : null, mismoCliente: ce ? ce.cliente_id === p.cliente_id : null };
}, creado);
paso('si el dato llega cruzado, se ve que el centro no es de su cliente',
  cruzado.mismoCliente === false, JSON.stringify(cruzado));

const limpio = await T(async d => {
  const g = window.__T;
  await g.sb.from('puertas').update({ centro_id: d.id }).eq('id', 'pt-portal-0');
  await g.sb.from('puertas').update({ centro_id: d.id }).eq('id', 'pt-portal-1');
  await g.cargar();
  return g.puertasDeCentro(d.id).map(p => p.codigo);
}, creado);
paso('las puertas de un centro se cuentan por el centro, no por la dirección',
  limpio.length === 2 && limpio.includes('AR-0101') && limpio.includes('AR-0102'),
  limpio.join(','));

/* ================================================================
   3. El formulario de la puerta: herencia de la dirección
   ================================================================ */
bloque('3. El formulario de la puerta');

await T(() => { window.__T.S.ficha = null; window.__T.S.fichaCliente = null; window.__T.pintar(); });
await esperar(400);
await T(() => window.__T.dlgPuerta(null));
await esperar(500);

const vacio = await T(() => {
  const caja = document.getElementById('f-centro');
  const pista = document.getElementById('f-ceestado');
  return { hay: !!caja, desactivado: caja ? caja.disabled : null,
           pista: pista ? pista.textContent : '' };
});
paso('el alta de puerta tiene desplegable de centro',
  vacio.hay);
paso('y sin cliente elegido está desactivado: el centro es del cliente',
  vacio.desactivado === true, vacio.desactivado);
paso('diciéndolo en vez de quedarse mudo',
  /cliente/i.test(vacio.pista), vacio.pista);

const conCliente = await T(d => {
  const g = window.__T;
  g.elegirCliente(d.cli);
  const caja = document.getElementById('f-centro');
  return { desactivado: caja.disabled,
           opciones: Array.from(caja.options).map(o => o.textContent),
           pista: (document.getElementById('f-ceestado')||{}).textContent || '' };
}, creado);
paso('al elegir cliente, se ofrecen SUS centros',
  conCliente.opciones.some(t => /Portal 3/.test(t)), conCliente.opciones.join(' | '));
paso('y no los de otro cliente',
  !conCliente.opciones.some(t => /Nave 7/.test(t)), conCliente.opciones.join(' | '));
paso('el desplegable se activa',
  conCliente.desactivado === false);
paso('y la primera opción es seguir sin centro: no se obliga a ninguno',
  /Sin centro/.test(conCliente.opciones[0]), conCliente.opciones[0]);

const hereda = await T(d => {
  const g = window.__T;
  const dir = document.getElementById('f-dir');
  dir.value = ''; dir.dataset.auto = '0';
  document.getElementById('f-centro').value = d.id;
  g.centroElegido();
  return { dir: dir.value, auto: dir.dataset.auto,
           pista: (document.getElementById('f-ceestado')||{}).textContent || '' };
}, creado);
paso('al elegir centro, la puerta hereda su dirección',
  /Bajamar 14/.test(hereda.dir), hereda.dir);
paso('con la población, para que «Cómo llegar» funcione',
  /El Puerto/.test(hereda.dir), hereda.dir);
paso('y queda marcada como puesta por la aplicación, no a mano',
  hereda.auto === '1', hereda.auto);
paso('la pista dice que el técnico verá los datos de acceso',
  /acceso/i.test(hereda.pista), hereda.pista);

const aMano = await T(d => {
  const g = window.__T;
  const dir = document.getElementById('f-dir');
  dir.value = 'Entrada por la calle de atrás, número 7';
  dir.dataset.auto = '0';                     // como si lo hubiera escrito el técnico
  document.getElementById('f-centro').value = '';
  g.centroElegido();
  document.getElementById('f-centro').value = d.id;
  g.centroElegido();
  return dir.value;
}, creado);
paso('LO ESCRITO A MANO NO SE PISA al elegir centro',
  /calle de atrás/.test(aMano), aMano);

const cambioCliente = await T(d => {
  const g = window.__T;
  document.getElementById('f-centro').value = d.id;
  g.elegirCliente(d.otro);                    // se cambia a otro cliente
  const caja = document.getElementById('f-centro');
  return { valor: caja.value, opciones: Array.from(caja.options).map(o => o.textContent) };
}, creado);
paso('al cambiar de cliente, el centro del anterior se suelta',
  cambioCliente.valor === '', cambioCliente.valor);
paso('y se ofrecen los del cliente nuevo',
  cambioCliente.opciones.some(t => /Nave 7/.test(t)), cambioCliente.opciones.join(' | '));

/* Guardar la puerta con centro y comprobar que no se guarda cruzado */
const guardada = await T(async d => {
  const g = window.__T;
  // se limpia la dirección escrita a mano de la comprobación anterior
  const dir = document.getElementById('f-dir');
  dir.value = ''; dir.dataset.auto = '1';
  g.elegirCliente(d.cli);
  document.getElementById('f-cod').value = 'AR-0003';
  document.getElementById('f-centro').value = d.id;
  g.centroElegido();
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 900));
  const p = g.S.puertas.find(x => x.codigo === 'AR-0003');
  return p ? { centro: p.centro_id, cli: p.cliente_id, dir: p.direccion } : null;
}, creado);
paso('la puerta se guarda con su centro',
  guardada && guardada.centro === creado.id, JSON.stringify(guardada));
paso('con el cliente del centro',
  guardada && guardada.cli === creado.cli);
paso('y con la dirección heredada escrita en la puerta, que es lo que se imprime',
  guardada && /Bajamar 14/.test(guardada.dir||''), guardada && guardada.dir);

const cruceGuardado = await T(async d => {
  const g = window.__T;
  const p = g.S.puertas.find(x => x.codigo === 'AR-0003');
  g.dlgPuerta(p.id);
  await new Promise(r => setTimeout(r, 500));
  /* Se fuerza la combinación imposible: cliente de uno, centro del otro. */
  document.getElementById('f-clid').value = d.otro;
  document.getElementById('f-cbusca').value = (g.S.clientes.find(c => c.id === d.otro)||{}).nombre || '';
  const caja = document.getElementById('f-centro');
  caja.innerHTML = '<option value="'+d.id+'" selected></option>';
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 900));
  const p2 = g.S.puertas.find(x => x.codigo === 'AR-0003');
  return { centro: p2.centro_id, cli: p2.cliente_id };
}, creado);
paso('AL GUARDAR, un centro que no es del cliente se suelta en vez de guardarse',
  cruceGuardado.centro === null, JSON.stringify(cruceGuardado));
paso('y la puerta se queda con el cliente elegido',
  cruceGuardado.cli === creado.otro);

/* se devuelve la puerta de prueba a su sitio */
await T(async d => {
  const g = window.__T;
  const p = g.S.puertas.find(x => x.codigo === 'AR-0003');
  await g.sb.from('puertas').update({ cliente_id: d.cli, centro_id: d.id }).eq('id', p.id);
  await g.cargar();
}, creado);

/* ================================================================
   4. Los cuatro datos, donde el técnico los lee antes de ir
   ================================================================ */
bloque('4. Los cuatro datos del sitio');

const cuatro = await T(d => {
  const g = window.__T;
  return g.datosCentro(g.centroDe(d.id)).map(x => x[0]);
}, creado);
paso('son exactamente los cuatro que pidió David',
  cuatro.length === 4, cuatro.join(' | '));
paso('cómo se entra', cuatro.includes('Cómo se entra'));
paso('horario de acceso', cuatro.includes('Horario de acceso'));
paso('persona de contacto en el sitio', cuatro.includes('Persona de contacto en el sitio'));
paso('avisos de seguridad del sitio', cuatro.includes('Avisos de seguridad del sitio'));

const bloqueT = await T(d => {
  const g = window.__T;
  return g.bloqueSitio(g.puertaDe('pt-portal-0'));
}, creado);
paso('el bloque del sitio lleva el nombre del centro',
  /Portal 3/.test(bloqueT), bloqueT.slice(0, 60));
paso('y los cuatro datos',
  /llavero AR-12/.test(bloqueT) && /9:00 a 14:00/.test(bloqueT) &&
  /Manuel/.test(bloqueT) && /paso continuo de coches/.test(bloqueT));
paso('LOS AVISOS DE SEGURIDAD VAN SEPARADOS: no son un dato más de la lista',
  /class="seg"/.test(bloqueT), (bloqueT.match(/class="seg"/g)||[]).length);
paso('y el aviso de seguridad es el que va separado, no otro',
  /class="seg"[^>]*>\s*<i>Avisos de seguridad/.test(bloqueT));

/* La tarjeta de trabajo del técnico */
const enTarjeta = await T(async d => {
  const g = window.__T, S = g.S;
  const yoId = S.perfil.id;
  await g.sb.from('avisos').insert({ id:'av-centro', tipo:'averia', estado:'asignado',
    prioridad:'normal', puerta_id:'pt-portal-0', cliente_id: d.cli,
    tecnico_id: yoId, tecnico: g.nombreTec(yoId), fecha_prevista: g.hoy(),
    descripcion:'No cierra del todo', creado: new Date().toISOString() });
  await g.cargar();
  S.tab = 'trabajo'; S.ficha = null; S.fichaCliente = null; g.pintar();
  await new Promise(r => setTimeout(r, 500));
  const t = document.body.innerText;
  return { texto: t, botones: Array.from(document.querySelectorAll('.trab-btns a,.trab-btns button'))
    .map(b => b.textContent.trim()) };
}, creado);
paso('en la tarjeta de trabajo el técnico ve cómo se entra ANTES de ir',
  /llavero AR-12/.test(enTarjeta.texto));
paso('el horario de acceso',
  /9:00 a 14:00/.test(enTarjeta.texto));
paso('la persona de contacto del sitio',
  /Manuel/.test(enTarjeta.texto));
paso('y los avisos de seguridad del sitio',
  /paso continuo de coches/.test(enTarjeta.texto));
paso('con un botón para llamar al sitio, que no es quien avisa',
  enTarjeta.botones.some(x => /Llamar al sitio/.test(x)), enTarjeta.botones.join(' | '));

/* La ficha de la puerta */
const enFicha = await T(() => {
  const g = window.__T;
  g.S.tab = 'puertas'; g.S.ficha = 'pt-portal-0'; g.pintar();
  return new Promise(r => setTimeout(() => r(document.body.innerText), 400));
});
paso('la ficha de la puerta tiene el apartado del sitio',
  /El sitio/.test(enFicha));
paso('con el centro y los cuatro datos',
  /Portal 3/.test(enFicha) && /llavero AR-12/.test(enFicha) &&
  /Manuel/.test(enFicha) && /paso continuo/.test(enFicha));
paso('y dice cuántas puertas más hay en el mismo sitio',
  /mismo sitio/.test(enFicha) || /Única puerta/.test(enFicha));

/* ================================================================
   5. Un centro sin datos de acceso
   ================================================================ */
bloque('5. Un centro al que todavía no se le han puesto los datos');

const pelado = await T(async d => {
  const g = window.__T;
  const { data } = await g.sb.from('centros').insert({
    cliente_id: d.cli, nombre:'Portal 1', direccion:'Avenida de la Bajamar 14'
  }).select().maybeSingle();
  await g.sb.from('puertas').update({ centro_id: data.id }).eq('id', 'pt-portal-2');
  await g.cargar();
  const p = g.puertaDe('pt-portal-2');
  g.S.tab = 'puertas'; g.S.ficha = p.id; g.pintar();
  await new Promise(r => setTimeout(r, 400));
  return { datos: g.datosCentro(g.centroDe(data.id)).length,
           bloque: g.bloqueSitio(p), texto: document.body.innerText, id: data.id };
}, creado);
paso('un centro sin datos de acceso no tiene datos que enseñar',
  pelado.datos === 0, pelado.datos);
paso('Y NO SE PINTA UN RECUADRO VACÍO',
  pelado.bloque === '', JSON.stringify(pelado.bloque));
paso('la ficha lo dice y explica para qué sirven esos datos',
  /todavía no se le han puesto los datos de acceso/.test(pelado.texto));
paso('sin tratarlo como un fallo: la puerta funciona igual',
  !/deficiencia|incumpl|FALTA/i.test(
    (pelado.texto.match(/El sitio[\s\S]{0,400}/)||[''])[0]),
  (pelado.texto.match(/El sitio[\s\S]{0,120}/)||[''])[0].replace(/\n/g,' ').slice(0,100));

/* ================================================================
   6. Agrupar las puertas que ya comparten dirección
   ================================================================ */
bloque('6. Agrupar las puertas que ya comparten dirección');

const antes = await T(async d => {
  const g = window.__T;
  /* Tres puertas más del mismo cliente con la misma dirección escrita y sin
     centro: el caso de la comunidad de tres portales, tal como está hoy. */
  for (const i of [0,1,2]){
    await g.sb.from('puertas').insert({ id:'pt-rep-'+i, codigo:'AR-020'+i,
      cliente_id: d.cli, cliente:'Comunidad Las Flores',
      direccion:'Calle Larga 4', ubicacion:'Portal '+(i+1), tipo:'Corredera',
      estado:'operativa', creado:new Date().toISOString() });
  }
  await g.cargar();
  g.S.tab = 'clientes'; g.S.ficha = null; g.S.fichaCliente = d.cli; g.pintar();
  await new Promise(r => setTimeout(r, 500));
  const btn = Array.from(document.querySelectorAll('[data-act="centro-agrupar"]'))
    .find(b => b.dataset.dir === 'Calle Larga 4');
  return { texto: document.body.innerText, hayBoton: !!btn };
}, creado);
paso('la ficha del cliente avisa de que la misma dirección está en varias puertas',
  /misma dirección está escrita en varias puertas/.test(antes.texto));
paso('y ofrece juntarlas en un centro de un clic',
  antes.hayBoton);

const agrupado = await T(async () => {
  const btn = Array.from(document.querySelectorAll('[data-act="centro-agrupar"]'))
    .find(b => b.dataset.dir === 'Calle Larga 4');
  btn.click();                                  // primer clic: arma el botón
  await new Promise(r => setTimeout(r, 200));
  const armado = btn.textContent;
  btn.click();                                  // segundo clic: lo hace
  await new Promise(r => setTimeout(r, 1200));
  const g = window.__T;
  const ps = ['pt-rep-0','pt-rep-1','pt-rep-2'].map(id => g.puertaDe(id));
  const ce = g.centroDePuerta(ps[0]);
  return { armado, mismoCentro: ps.every(p => p.centro_id && p.centro_id === ps[0].centro_id),
           nombre: ce ? ce.nombre : null, dir: ce ? ce.direccion : null,
           dirsPuertas: ps.map(p => p.direccion), ubis: ps.map(p => p.ubicacion) };
});
paso('el botón pide confirmación antes de tocar nada, diciendo cuántas',
  /Agrupar las 3/.test(agrupado.armado), agrupado.armado);
paso('las tres puertas quedan en el mismo centro',
  agrupado.mismoCentro, JSON.stringify(agrupado));
paso('el centro nace con esa dirección',
  agrupado.dir === 'Calle Larga 4', agrupado.dir);
paso('la dirección que ya tenían las puertas NO se les toca',
  agrupado.dirsPuertas.every(x => x === 'Calle Larga 4'), agrupado.dirsPuertas.join(' | '));
paso('ni su ubicación, que es lo que distingue una de otra',
  agrupado.ubis.join(',') === 'Portal 1,Portal 2,Portal 3', agrupado.ubis.join(','));

const agrupadoDos = await T(() => {
  const btn = Array.from(document.querySelectorAll('[data-act="centro-agrupar"]'))
    .find(b => b.dataset.dir === 'Calle Larga 4');
  return !btn;
});
paso('y la oferta de agrupar desaparece: ya no hay nada repetido',
  agrupadoDos);

const agrupadas = await T(d => {
  const g = window.__T;
  g.S.fichaCliente = d.cli; g.S.ficha = null; g.pintar();
  return new Promise(r => setTimeout(() => r(document.body.innerText), 400));
}, creado);
paso('las puertas del cliente se enseñan agrupadas por sitio',
  /Sin centro/.test(agrupadas) && /Portal 3/.test(agrupadas), '');
paso('y el apartado de centros dice cuántas puertas tiene cada uno',
  /puertas?$/m.test(agrupadas) || /\d puerta/.test(agrupadas));

/* ================================================================
   7. Borrar un centro no se lleva las puertas
   ================================================================ */
bloque('7. Borrar un centro');

const conPuertas = await T(async d => {
  const g = window.__T;
  g.dlgCentro(d.id);
  await new Promise(r => setTimeout(r, 400));
  const hay = !!document.querySelector('[data-act="centro-borrar"]');
  const texto = document.getElementById('dlg-form').innerText;
  g.cerrarDlg();
  return { hay, texto };
}, creado);
paso('un centro con puertas NO ofrece borrarse',
  conPuertas.hay === false);
paso('y dice por qué, y qué hacer antes',
  /no se borra/.test(conPuertas.texto), (conPuertas.texto.match(/Tiene \d+[^\n]*/)||[''])[0]);

const vacioBorrado = await T(async d => {
  const g = window.__T;
  const { data } = await g.sb.from('centros').insert({
    cliente_id: d.cli, nombre:'Centro de prueba sin puertas'
  }).select().maybeSingle();
  await g.cargar();
  g.dlgCentro(data.id);
  await new Promise(r => setTimeout(r, 400));
  const btn = document.querySelector('[data-act="centro-borrar"]');
  return { hay: !!btn, id: data.id };
}, creado);
paso('un centro sin puertas sí ofrece borrarse',
  vacioBorrado.hay);
await T(() => window.__T.cerrarDlg());

const sacada = await T(async () => {
  const g = window.__T;
  const p = g.puertaDe('pt-portal-2');
  const centroId = p.centro_id;
  await g.sb.from('puertas').update({ centro_id: null }).eq('id', p.id);
  await g.cargar();
  const p2 = g.puertaDe('pt-portal-2');
  return { sigue: !!p2, centro: p2.centro_id, dir: p2.direccion,
           centroSigue: !!g.centroDe(centroId) };
});
paso('sacar una puerta de su centro no borra la puerta',
  sacada.sigue && sacada.centro === null, JSON.stringify(sacada));
paso('y le deja la dirección que tenía escrita',
  /Bajamar 14/.test(sacada.dir||''), sacada.dir);
paso('el centro sigue existiendo: sacar una puerta no es borrar el sitio',
  sacada.centroSigue);

/* ================================================================
   8. La hoja de campo se lleva el sitio impreso
   ================================================================ */
bloque('8. La hoja de campo');

const hoja = await T(async d => {
  const g = window.__T, S = g.S;
  const p = g.puertaDe('pt-portal-0');
  const exp = { id:'xp-centro', puerta_id:p.id, familia:'industrial', estado:'borrador',
    referencia:'EXP-CENTRO', creado:new Date().toISOString(),
    datos:{ puerta:{ denominacion:'Corredera del portal 3', tipo:'Corredera',
                     modo:'impulso_sin_vista', usuarios:'no_informados' },
            obra:{ emplazamiento:'Avenida de la Bajamar 14' } } };
  S.expedientes.unshift(exp);
  let html = '';
  const abrir = window.open;
  window.open = () => ({ document: { write: t => { html += t; }, close(){} } });
  try { g.hojaDeCampo(exp.id); } finally { window.open = abrir; }
  S.expedientes.shift();
  return html;
}, creado);
paso('la hoja de campo impresa lleva el centro',
  /Portal 3/.test(hoja), (hoja.match(/Centro[\s\S]{0,80}/)||[''])[0].slice(0,80));
paso('y los cuatro datos del sitio, porque en una nave puede no haber cobertura',
  /llavero AR-12/.test(hoja) && /9:00 a 14:00/.test(hoja) &&
  /Manuel/.test(hoja) && /paso continuo de coches/.test(hoja));

/* ================================================================
   9. Dónde hay que ir
   ================================================================ */
bloque('9. Dónde hay que ir');

const donde = await T(async d => {
  const g = window.__T;
  /* Una puerta sin dirección escrita pero con centro: antes la asistencia se
     quedaba sin sitio al que ir. */
  await g.sb.from('puertas').update({ direccion: null, ubicacion: null }).eq('id', 'pt-portal-1');
  await g.cargar();
  const a = { puerta_id:'pt-portal-1', cliente_id: null };
  return { conCentro: g.dondeAsistencia(a) };
}, creado);
paso('una puerta sin dirección escrita toma la del centro: hay a dónde ir',
  /Bajamar 14/.test(donde.conCentro), donde.conCentro);

const buscado = await T(() => {
  const g = window.__T;
  g.S.tab = 'puertas'; g.S.ficha = null; g.S.fichaCliente = null; g.S.busca = 'portal 3';
  g.pintar();
  return new Promise(r => setTimeout(() => {
    const n = document.querySelectorAll('.lista .item').length;
    g.S.busca = ''; g.pintar();
    r(n);
  }, 400));
});
paso('buscar por el nombre del centro encuentra sus puertas',
  buscado >= 1, buscado);

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
