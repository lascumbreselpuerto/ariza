/* ================================================================
   almacenes.mjs — los almacenes que gobierna la oficina y el rastro
   de la baja de material.                            08-11-2026

   POR QUÉ EXISTE
   David, 08-11-2026: «YA tenemos el como dar de alta al material,
   pero como lo damos de baja. Lo debe de poder dar tanto ofi como
   los tecnicos. Siempre debe de quedar marcado quien da de baja el
   material y de que almacen. General, furgo 1 y furgo 2. Aunque se
   debe de crear almacen desde la ofi.»

   Y al elegir que el técnico pueda sacar de cualquier almacén:
   «pero que siempre se sepa quien dio de baja un material, de que
   almacen la dio de baja, si se a perdido, roto o de que asistencia
   biene de baja».

   LO QUE SE VIGILA AQUÍ
     · que los almacenes los cree la OFICINA, con el nombre que
       quiera, y que el técnico no pueda;
     · que se puedan crear almacenes que no son de nadie;
     · que no quepan dos almacenes activos con el mismo nombre;
     · que retirar un almacén con material dentro AVISE antes;
     · que la furgoneta ya NO nazca sola, y que el material del parte
       de un técnico sin furgoneta salga del general dejándolo
       escrito, en vez de no descontarse;
     · que una baja exija motivo escrito, y que roto y perdido sean
       cosas distintas;
     · que quede quién, de qué almacén y de qué asistencia;
     · y que el coste de lo roto y lo perdido salga en euros, pero
       solo para la oficina.
   ================================================================ */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const AQUI = dirname(fileURLToPath(import.meta.url));
const URL_APP = process.env.ARIZA_URL || 'http://127.0.0.1:8899/index.html';
const ajustes = JSON.parse(readFileSync(join(AQUI, 'ajustes.json'), 'utf8'));

const ENV = { ...process.env, LANG:'es_ES.UTF-8', LANGUAGE:'es_ES:es', LC_ALL:'es_ES.UTF-8' };
const nav = await chromium.launch({ env: ENV, args: ['--lang=es-ES'] });
const ctx = await nav.newContext({ viewport:{width:1320,height:2400},
  locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    db.articulos.push(
      { id:'art-banda', descripcion:'Banda de seguridad resistiva 2 m', unidad:'ud',
        familia:'Seguridad', codigo:'MAT-0012', token:'A3K9', coste:38.50, activo:true },
      { id:'art-foto', descripcion:'Fotocélula de espejo', unidad:'ud',
        familia:'Seguridad', codigo:'MAT-0007', token:'B4L0', coste:21.00, activo:true });
    db.catalogo = db.articulos;
    /* Material en la nave, para poder darlo de baja */
    db.movimientos_material.push(
      { id:'mv-ent1', articulo_id:'art-banda', cantidad:10, hasta:'ubi-nave',
        motivo:'compra', nota:'albarán de prueba', creado:new Date().toISOString(),
        creado_por:'Oficina' },
      { id:'mv-ent2', articulo_id:'art-foto', cantidad:5, hasta:'ubi-nave',
        motivo:'compra', creado:new Date().toISOString(), creado_por:'Oficina' });
    db.avisos.push({ id:'al-1', tipo:'averia', subtipo:'averia', estado:'asignado',
      prioridad:'normal', tecnico_id:'usuario-admin',
      cliente_id: db.puertas[0].cliente_id, puerta_id: db.puertas[0].id,
      descripcion:'No cierra del todo', creado:new Date().toISOString(),
      fecha_prevista:new Date().toISOString().slice(0,10) });
  };
});
const errores = [];
const esLaLetraDeGoogle = t => /fonts\.(googleapis|gstatic)\.com/.test(t) ||
  /Failed to load resource/.test(t);
const pag = await ctx.newPage();
pag.on('pageerror', e => errores.push('JS: '+e.message));
pag.on('console', m => { if (m.type() === 'error' && !esLaLetraDeGoogle(m.text()))
  errores.push('consola: '+m.text()); });
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
   1. Los almacenes los crea la oficina
   ================================================================ */
bloque('1. Los almacenes los crea la oficina');

const panel = await T(async () => {
  const g = window.__T;
  g.S.tab = 'almacen'; g.pintar();
  await new Promise(r => setTimeout(r, 500));
  const t = document.body.textContent;
  return { pinta: /Los almacenes/.test(t),
           hayBoton: !!document.querySelector('[data-act="alm-nuevo"]'),
           verNave: /Nave/.test(t) };
});
paso('el almacén enseña los almacenes que hay', panel.pinta === true);
paso('con un botón para crear otro', panel.hayBoton === true);
paso('y la nave ya está', panel.verNave === true);

const soloOfi = await T(() => {
  const g = window.__T;
  const antes = g.S.perfil ? g.S.perfil.rol : null;
  if (g.S.perfil) g.S.perfil.rol = 'tecnico';
  const h = g.panelAlmacenes();
  if (g.S.perfil) g.S.perfil.rol = antes;
  return h === '';
});
paso('el técnico NO ve la pantalla de almacenes: los gobierna la oficina', soloOfi === true);

const crear = await T(async () => {
  const g = window.__T;
  document.querySelector('[data-act="alm-nuevo"]').click();
  await new Promise(r => setTimeout(r, 400));
  const hay = !!document.getElementById('al-nombre');
  /* un nombre de una letra no entra */
  document.getElementById('al-nombre').value = 'a';
  document.querySelector('#dlg-form [type=submit]').click();
  await new Promise(r => setTimeout(r, 300));
  const err1 = (document.querySelector('#dlg-form .err') || {}).textContent || '';
  /* el nombre de la nave, repetido, tampoco */
  document.getElementById('al-nombre').value = 'Nave';
  document.querySelector('#dlg-form [type=submit]').click();
  await new Promise(r => setTimeout(r, 300));
  const err2 = (document.querySelector('#dlg-form .err') || {}).textContent || '';
  /* una furgoneta sin decir de quién: avisa, pero deja insistir */
  document.getElementById('al-nombre').value = 'Furgo 1';
  document.getElementById('al-tipo').value = 'furgoneta';
  document.getElementById('al-tec').value = '';
  document.querySelector('#dlg-form [type=submit]').click();
  await new Promise(r => setTimeout(r, 300));
  const err3 = (document.querySelector('#dlg-form .err') || {}).textContent || '';
  const antes = (g.S.ubicaciones || []).length;
  /* ahora con técnico, como se hace de verdad */
  const tec = (g.S.equipo || [])[0];
  if (tec) document.getElementById('al-tec').value = tec.id;
  document.querySelector('#dlg-form [type=submit]').click();
  await new Promise(r => setTimeout(r, 1300));
  const f1 = (g.S.ubicaciones || []).find(u => u.nombre === 'Furgo 1');
  return { hay, err1, err2, err3, antes, ahora: (g.S.ubicaciones || []).length,
           tipo: f1 ? f1.tipo : null, dueno: f1 ? !!f1.perfil_id : false,
           cerrado: !document.getElementById('dlg').open };
});
paso('se abre el alta de almacén', crear.hay === true);
paso('un nombre de una letra no vale', /nombre al almac/i.test(crear.err1), crear.err1);
paso('y un nombre que ya existe tampoco', /ya hay un almac/i.test(crear.err2), crear.err2);
paso('una furgoneta sin decir de quién es, avisa', /de quién es/i.test(crear.err3), crear.err3);
paso('«Furgo 1» se crea con el nombre que le pone la oficina',
  crear.ahora === crear.antes + 1 && crear.tipo === 'furgoneta', crear.tipo);
paso('y con su técnico asignado', crear.dueno === true);

const otro = await T(async () => {
  const g = window.__T;
  g.dlgAlmacen(null);
  await new Promise(r => setTimeout(r, 400));
  document.getElementById('al-nombre').value = 'Contenedor obra Jerez';
  document.getElementById('al-tipo').value = 'otro';
  document.getElementById('al-nota').value = 'Hasta marzo';
  document.querySelector('#dlg-form [type=submit]').click();
  await new Promise(r => setTimeout(r, 1300));
  const u = (g.S.ubicaciones || []).find(x => x.nombre === 'Contenedor obra Jerez');
  return { hay: !!u, tipo: u ? u.tipo : null, nota: u ? u.nota : null,
           sinDueno: u ? !u.perfil_id : false };
});
paso('un almacén que no es de nadie se puede crear: taller, trastero, contenedor',
  otro.hay === true && otro.tipo === 'otro', otro.tipo);
paso('con su nota de para qué es', otro.nota === 'Hasta marzo', otro.nota);
paso('y sin dueño', otro.sinDueno === true);

/* ================================================================
   2. La furgoneta ya no nace sola
   ================================================================ */
bloque('2. La furgoneta ya no nace sola');

const noNace = await T(async () => {
  const g = window.__T;
  /* un técnico sin furgoneta: con rol de técnico, no se le crea */
  const antes = (g.S.ubicaciones || []).length;
  const rol = g.S.perfil ? g.S.perfil.rol : null;
  if (g.S.perfil) g.S.perfil.rol = 'tecnico';
  let creada = null;
  try { creada = await g.asegurarFurgoneta('perfil-que-no-tiene-furgoneta'); } catch(_){}
  if (g.S.perfil) g.S.perfil.rol = rol;
  return { creada: !!creada, antes, ahora: (g.S.ubicaciones || []).length };
});
paso('a un técnico ya no se le crea la furgoneta sola', noNace.creada === false);
paso('y no aparece ningún almacén nuevo', noNace.ahora === noNace.antes,
  noNace.antes + ' → ' + noNace.ahora);

/* ================================================================
   3. La baja de material: lo que pidió David
   ================================================================ */
bloque('3. La baja deja rastro completo');

const motivos = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  g.dlgMover('art-banda', 'salida', null);
  await new Promise(r => setTimeout(r, 500));
  const sel = document.getElementById('mv-motivo');
  const ops = sel ? [...sel.options].map(o => o.value) : [];
  const cajaAntes = document.getElementById('mv-baja');
  const ocultaAlPrincipio = cajaAntes ? cajaAntes.hidden : null;
  /* al elegir una baja, sale el bloque de «qué ha pasado» */
  sel.value = 'baja_roto';
  sel.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 200));
  const caja = document.getElementById('mv-baja');
  return { ops, ocultaAlPrincipio, saleAlElegir: caja ? !caja.hidden : false,
           pideMotivo: !!document.getElementById('mv-baja-motivo'),
           pideFoto: !!document.getElementById('mv-baja-foto'),
           hayDesde: !!document.getElementById('mv-desde') };
});
paso('roto y perdido son motivos distintos',
  motivos.ops.includes('baja_roto') && motivos.ops.includes('baja_perdido'),
  motivos.ops.join(' · '));
paso('y hay un tercero para lo que no es ninguno de los dos',
  motivos.ops.includes('baja_otro'));
paso('el bloque de «qué ha pasado» no estorba cuando no es una baja',
  motivos.ocultaAlPrincipio === true);
paso('y sale al elegir una baja', motivos.saleAlElegir === true);
paso('pidiendo el motivo escrito', motivos.pideMotivo === true);
paso('y ofreciendo una foto, que es opcional', motivos.pideFoto === true);
paso('siempre se dice de qué almacén sale', motivos.hayDesde === true);

const sinMotivo = await T(async () => {
  document.getElementById('mv-cant').value = '2';
  document.querySelector('#dlg-form [type=submit]').click();
  await new Promise(r => setTimeout(r, 400));
  return (document.querySelector('#dlg-form .err') || {}).textContent || '';
});
paso('una baja SIN MOTIVO ESCRITO no se guarda', /qué ha pasado/i.test(sinMotivo), sinMotivo);

const conMotivo = await T(async () => {
  const g = window.__T;
  const nave = g.laNave();
  document.getElementById('mv-desde').value = nave.id;
  document.getElementById('mv-baja-motivo').value = 'Se partió el perfil al montarla';
  document.getElementById('mv-aviso').value = 'al-1';
  document.querySelector('#dlg-form [type=submit]').click();
  await new Promise(r => setTimeout(r, 1600));
  const m = (g.S.movimientos || []).find(x => x.motivo === 'baja_roto');
  return { hay: !!m, motivo: m ? m.motivo : null, nota: m ? m.nota : null,
           desde: m ? m.desde : null, naveId: nave.id,
           quien: m ? m.creado_por : null, quienId: m ? m.creado_por_id : null,
           aviso: m ? m.aviso_id : null, cantidad: m ? m.cantidad : null };
});
paso('con el motivo puesto, la baja se guarda', conMotivo.hay === true);
paso('y queda QUIÉN la dio de baja, por su nombre', !!conMotivo.quien, conMotivo.quien);
paso('y también quién es de verdad, no solo cómo se llama', !!conMotivo.quienId, conMotivo.quienId);
paso('DE QUÉ ALMACÉN salió', conMotivo.desde === conMotivo.naveId);
paso('que fue ROTO y no perdido', conMotivo.motivo === 'baja_roto', conMotivo.motivo);
paso('con el motivo escrito dentro', /se partió el perfil/i.test(conMotivo.nota || ''), conMotivo.nota);
paso('y DE QUÉ ASISTENCIA viene', conMotivo.aviso === 'al-1', conMotivo.aviso);

const perdido = await T(async () => {
  const g = window.__T;
  g.dlgMover('art-foto', 'salida', null);
  await new Promise(r => setTimeout(r, 500));
  const sel = document.getElementById('mv-motivo');
  sel.value = 'baja_perdido';
  sel.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 200));
  document.getElementById('mv-cant').value = '1';
  document.getElementById('mv-desde').value = g.laNave().id;
  document.getElementById('mv-baja-motivo').value = 'No aparece desde la obra de Rota';
  document.querySelector('#dlg-form [type=submit]').click();
  await new Promise(r => setTimeout(r, 1600));
  const m = (g.S.movimientos || []).find(x => x.motivo === 'baja_perdido');
  return { hay: !!m, nota: m ? m.nota : null };
});
paso('una baja por PERDIDO va aparte, que es otro problema', perdido.hay === true);
paso('con su propia explicación', /no aparece/i.test(perdido.nota || ''), perdido.nota);

/* ================================================================
   4. El dinero de lo que se rompe
   ================================================================ */
bloque('4. El coste de lo roto y lo perdido, en euros');

const dinero = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  await g.cargar();
  g.S.tab = 'almacen'; g.pintar();
  await new Promise(r => setTimeout(r, 600));
  const t = document.body.textContent;
  const total = (g.S.resumenBajas || []).reduce((a, r) => a + Number(r.coste_total || 0), 0);
  return { pinta: /Lo que se rompe y se pierde/.test(t),
           bajas: (g.S.bajas || []).length,
           total: Math.round(total * 100) / 100,
           diceQueNoSeFactura: /no se le factura a nadie/i.test(t),
           verMotivo: /Roto/.test(t) && /Perdido/.test(t) };
});
/* 2 bandas a 38,50 = 77,00 y 1 fotocélula a 21,00 = 98,00 */
paso('el almacén enseña lo que se rompe y se pierde', dinero.pinta === true);
paso('con las dos bajas', dinero.bajas === 2, dinero.bajas);
paso('y el coste bien sumado: 2 bandas a 38,50 y una fotocélula a 21,00',
  dinero.total === 98, dinero.total);
paso('diciendo en claro que ese dinero no se le factura a nadie',
  dinero.diceQueNoSeFactura === true);
paso('y separando lo roto de lo perdido', dinero.verMotivo === true);

const soloGestion = await T(() => {
  const g = window.__T;
  const rol = g.S.perfil ? g.S.perfil.rol : null;
  if (g.S.perfil) g.S.perfil.rol = 'tecnico';
  const h = g.panelBajas();
  if (g.S.perfil) g.S.perfil.rol = rol;
  return h === '';
});
paso('el técnico no ve ese panel: lleva precios', soloGestion === true);

/* ================================================================
   5. Retirar un almacén
   ================================================================ */
bloque('5. Retirar un almacén avisa de lo que hay dentro');

const retirar = await T(async () => {
  const g = window.__T;
  const nave = g.laNave();
  const dentro = (g.S.existencias || []).filter(x => x.ubicacion_id === nave.id &&
                                                     Number(x.cantidad || 0) > 0);
  document.querySelector('[data-act="alm-retirar"][data-id="'+nave.id+'"]').click();
  await new Promise(r => setTimeout(r, 500));
  const txt = (document.getElementById('dlg-form') || {}).textContent || '';
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  /* y uno vacío se retira sin más */
  const vacio = (g.S.ubicaciones || []).find(u => u.nombre === 'Contenedor obra Jerez');
  document.querySelector('[data-act="alm-retirar"][data-id="'+vacio.id+'"]').click();
  await new Promise(r => setTimeout(r, 500));
  const txt2 = (document.getElementById('dlg-form') || {}).textContent || '';
  document.querySelector('#dlg-form [type=submit]').click();
  await new Promise(r => setTimeout(r, 1400));
  const ya = (g.S.ubicaciones || []).find(u => u.id === vacio.id);
  return { conMaterial: /ahí dentro consta material/i.test(txt),
           listaMaterial: /Banda de seguridad/.test(txt),
           dentro: dentro.length,
           vacioDice: /no consta material dentro/i.test(txt2),
           retirado: ya ? ya.activo === false : false,
           sigueExistiendo: !!ya };
});
paso('retirar un almacén CON material dentro avisa antes', retirar.conMaterial === true);
paso('y enseña qué material es', retirar.listaMaterial === true);
paso('uno vacío dice que se puede retirar sin más', retirar.vacioDice === true);
paso('al retirarlo queda retirado', retirar.retirado === true);
paso('pero no se borra: su histórico se queda', retirar.sigueExistiendo === true);

console.log('\n'+ok+' bien, '+mal+' mal.');
if (errores.length){ console.log('Errores de JavaScript:'); errores.forEach(e => console.log('   '+e)); }
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || errores.length ? 1 : 0);
