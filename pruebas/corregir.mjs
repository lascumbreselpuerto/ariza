/* ================================================================
   corregir.mjs — corregir un parte ya cerrado, con rastro.
                                                      27-11-2026

   DE DÓNDE SALE
   David, 25-11-2026: «Poder editar una asistencia realizada… aun
   estando firmadas. Siempre bajo la responsabilidad de la oficina y
   solo desde oficina o administración.»

   Y el 27-11-2026, eligiendo cómo: editar en el sitio, sin versiones,
   con una nota de quién lo tocó y cuándo.

   POR QUÉ ES DELICADO
   Un parte cerrado no es un borrador. Puede estar firmado por el
   cliente, puede tener su copia en el correo, puede estar facturado y
   ha descontado material del almacén. Tocarlo mal no se nota el mismo
   día: se nota cuando el cliente discute una factura, o cuando el
   almacén no cuadra y nadie sabe por qué.

   LO QUE SE VIGILA AQUÍ, Y POR QUÉ CADA COSA
     · Que solo lo vea la oficina y la administración. Un técnico no
       puede corregir lo que ya firmó un cliente.
     · Que la FECHA DE CIERRE no cambie. Si cambiara, un parte
       corregido hoy parecería una visita de hoy, y eso descoloca el
       mes facturado, la revisión de la puerta y el histórico.
     · Que la firma del cliente no se toque ni se vuelva a pedir.
     · Que no se pueda corregir sin decir por qué. Un parte firmado
       que cambia sin motivo es lo que no se puede defender.
     · Que quede quién, cuándo, por qué y CUÁNTAS veces.
     · Que el importe se recalcule: si se corrigen las horas y el
       importe se queda como estaba, se factura lo que no es.
     · Y que el material NO se descuente dos veces. Esta es la que
       podría costar dinero de verdad sin que nadie lo viera.
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
    const p = db.puertas[0];
    const base = { prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:p.cliente_id,
      puerta_id:p.id, ruta:'ruta1', creado:'2026-11-10T08:00:00.000Z' };
    /* Un parte cerrado Y FIRMADO hace diecisiete días, con dos horas, su
       material y su foto: lo normal cuando hay que corregir algo. */
    db.avisos.push(Object.assign({}, base, { id:'co-cerrado', tipo:'averia', subtipo:'averia',
      estado:'cerrado', descripcion:'No cerraba del todo',
      diagnostico:'Banda de seguridad cortada', trabajo:'Sustituida la banda',
      horas:2, estado_final:'Operativa',
      firma_nombre:'Antonio Pérez', firma_ruta:'co-cerrado/firma.png',
      cerrado:'2026-11-10T13:30:00.000Z', cerrado_por:'Juan el técnico' }));
    /* Un artículo del almacén y el material que se puso en esa visita. El
       catálogo del simulador nace vacío, así que se siembra aquí. */
    db.articulos.push({ id:'art-banda', descripcion:'Banda de seguridad resistiva 2 m',
      unidad:'ud', familia:'Seguridad', marca:'ASO', referencia:'Sentir 45.25',
      coste:48, minimo:1, codigo:'MAT-0001', token:'A3K9', activo:true });
    db.catalogo = db.articulos;
    db.materiales.push({ id:'co-mat-1', aviso_id:'co-cerrado', articulo_id:'art-banda',
      descripcion:'Banda de seguridad resistiva 2 m', cantidad:1, coste:48, precio:67.2 });
    /* Y el movimiento de almacén que hizo el cierre de aquel día: sin esto, el
       recuento de «no se descuenta dos veces» compararía cero contra uno y
       daría por bueno justo lo que viene a vigilar. */
    db.movimientos_material.push({ id:'co-mov-1', articulo_id:'art-banda', cantidad:1,
      desde:null, hasta:null, motivo:'averia', aviso_id:'co-cerrado', puerta_id:p.id,
      creado:'2026-11-10T13:30:00.000Z', creado_por:'Juan el técnico' });
    db.fotos.push({ id:'co-foto', aviso_id:'co-cerrado', puerta_id:p.id,
      ruta:'co-cerrado/1.jpg', autor:'prueba', etapa:'hecho', creado:'2026-11-10T13:00:00.000Z' });
    /* Y una anulada: esa no se corrige, se vuelve a abrir */
    db.avisos.push(Object.assign({}, base, { id:'co-anulada', tipo:'averia', subtipo:'averia',
      estado:'cerrado', anulada:true, descripcion:'Se anuló sin parte',
      cerrado:'2026-11-11T10:00:00.000Z', cerrado_por:'Oficina' }));
  };
});
const pag = await ctx.newPage();
pag.on('pageerror', e => errores.push('JS: '+e.message));
pag.on('console', m => { if (m.type() === 'error') errores.push('consola: '+m.text()); });
await pag.goto(URL_APP);
await pag.waitForFunction(() => window.__T && window.__T.S && window.__T.S.perfil, null, { timeout: 30000 });
await pag.waitForTimeout(1500);

let ok = 0, mal = 0;
const paso = (t, bien, extra='') => { bien ? ok++ : mal++;
  console.log((bien?'  OK  ':' FALLA ')+t+(extra!==''&&extra!==undefined?' → '+String(extra):'')); };
const bloque = t => console.log('\n· '+t);
const T = (f, arg) => arg === undefined ? pag.evaluate(f) : pag.evaluate(f, arg);

/* ================================================================
   1. Quién puede corregir
   ================================================================ */
bloque('1. Solo la oficina y la administración');

const quien = await T(async () => {
  const g = window.__T;
  /* La función se llama accionesAsis, y lleva un segundo parámetro: si la
     visita está firmada. Se le pasa, porque de él depende alguna acción. */
  const botones = a => g.accionesAsis(a, !!a.firma_ruta);
  const cerrado = g.S.avisos.find(x => x.id === 'co-cerrado');
  const anulada = g.S.avisos.find(x => x.id === 'co-anulada');
  const rolAntes = g.S.perfil.rol;
  const comoOficina = botones(cerrado);
  const enAnulada = botones(anulada);
  g.S.perfil.rol = 'tecnico';
  const comoTecnico = botones(cerrado);
  g.S.perfil.rol = rolAntes;
  return {
    oficina: /parte-corregir/.test(comoOficina),
    tecnico: /parte-corregir/.test(comoTecnico),
    anulada: /parte-corregir/.test(enAnulada),
  };
});
paso('la oficina ve el botón de corregir en un parte cerrado', quien.oficina === true);
paso('un técnico NO lo ve: no corrige lo que ya firmó un cliente', quien.tecnico === false);
paso('y en una anulada no sale: esa se vuelve a abrir, no se corrige',
  quien.anulada === false);

/* ================================================================
   2. El parte se abre en modo corrección y lo dice
   ================================================================ */
bloque('2. Lo que ve la oficina al abrirlo');

const abre = await T(async () => {
  const g = window.__T;
  g.dlgCierre('co-cerrado', true);
  await new Promise(r => setTimeout(r, 1800));
  const txt = document.getElementById('dlg-form').innerText;
  const submit = document.querySelector('#dlg-form button[type="submit"]');
  return { txt,
    titulo: (document.querySelector('#dlg-form h3') || {}).textContent || '',
    hayNota: !!document.getElementById('z-cornota'),
    boton: submit ? submit.textContent : '',
    haySinCerrar: !!document.querySelector('#dlg-form [data-act="guardar-avance"]'),
    /* Las horas que tenía, para cambiarlas después */
    horas: (document.getElementById('z-horas') || {}).value };
});
paso('el título dice que se está corrigiendo', /Corregir el parte/.test(abre.titulo), abre.titulo);
paso('y se avisa de que el parte está cerrado y firmado',
  /ya cerrado y firmado/i.test(abre.txt), abre.txt.slice(0, 70).replace(/\n/g, ' '));
paso('se dice cuándo se cerró y quién lo cerró',
  /10/.test(abre.txt) && /Juan el técnico/.test(abre.txt),
  (abre.txt.match(/Se cerró el [^,]+/) || [''])[0]);
paso('se avisa de que esa fecha NO cambia', /esa fecha no cambia/i.test(abre.txt));
paso('y de que la firma se queda como está', /firma del cliente se queda/i.test(abre.txt));
paso('hay un campo para decir por qué se corrige', abre.hayNota === true);
paso('el botón dice «Guardar la corrección», no «Cerrar visita»',
  /Guardar la corrección/.test(abre.boton), abre.boton);
/* «Guardar sin cerrar» en algo que ya está cerrado solo serviría para dejarlo a
   medias sin rastro, así que no se ofrece. */
paso('y no se ofrece «Guardar sin cerrar»: ya está cerrada', abre.haySinCerrar === false);
paso('el parte viene con lo que tenía: dos horas', String(abre.horas) === '2', abre.horas);

/* ================================================================
   3. Sin motivo no se corrige
   ================================================================ */
bloque('3. Sin decir por qué, no');

const sinMotivo = await T(async () => {
  const g = window.__T;
  document.getElementById('z-horas').value = '3';
  /* El motivo se deja en blanco a propósito */
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'co-cerrado'), true, true);
  await new Promise(r => setTimeout(r, 1500));
  const a = g.S.avisos.find(x => x.id === 'co-cerrado');
  return { err: (document.querySelector('#dlg-form .err') || {}).textContent || '',
    horas: a.horas, corregido: a.corregido_en || null };
});
paso('sin motivo no se guarda y se dice por qué hace falta',
  /por qué corriges/i.test(sinMotivo.err), sinMotivo.err.slice(0, 80));
paso('y no se ha tocado nada del parte',
  Number(sinMotivo.horas) === 2 && !sinMotivo.corregido, sinMotivo.horas);

/* ================================================================
   4. La corrección, con todo lo que tiene que pasar y lo que no
   ================================================================ */
bloque('4. Corregido: qué cambia y qué no');

const corrige = await T(async () => {
  const g = window.__T;
  const antes = g.S.avisos.find(x => x.id === 'co-cerrado');
  const cerradoAntes = antes.cerrado, porAntes = antes.cerrado_por;
  const firmaAntes = antes.firma_ruta;
  /* Cuántos movimientos de almacén tiene ya este parte: tienen que seguir
     siendo los mismos después, no el doble. */
  const movAntes = ((await g.sb.from('movimientos_material').select('id')
    .eq('aviso_id', 'co-cerrado')).data || []).length;
  const valoradasAntes = (window.__DB.__valorados || []).filter(x => x === 'co-cerrado').length;
  document.getElementById('z-horas').value = '3';
  document.getElementById('z-cornota').value = 'Apuntó 2 horas y fueron 3, lo confirmó por teléfono';
  await g.guardarCierre(antes, true, true);
  await new Promise(r => setTimeout(r, 2200));
  const a = g.S.avisos.find(x => x.id === 'co-cerrado') || {};
  const movDespues = ((await g.sb.from('movimientos_material').select('id')
    .eq('aviso_id', 'co-cerrado')).data || []).length;
  const valoradasDespues = (window.__DB.__valorados || []).filter(x => x === 'co-cerrado').length;
  return { cerradoAntes, porAntes, firmaAntes, movAntes, movDespues,
    valoradasAntes, valoradasDespues,
    horas: a.horas, cerrado: a.cerrado, cerradoPor: a.cerrado_por, firma: a.firma_ruta,
    estado: a.estado, nota: a.corregido_nota, por: a.corregido_por,
    en: a.corregido_en, veces: a.correcciones,
    err: (document.querySelector('#dlg-form .err') || {}).textContent || '' };
});
paso('el cambio se guarda: las horas pasan a tres',
  Number(corrige.horas) === 3, corrige.horas);
/* La que más importa: la visita se hizo el 10 de noviembre y sigue siendo del
   10 de noviembre. */
paso('la FECHA DE CIERRE no cambia: la visita se hizo el día que se hizo',
  corrige.cerrado === corrige.cerradoAntes, corrige.cerrado);
paso('y quién la cerró sigue siendo el técnico, no quien corrige',
  corrige.cerradoPor === corrige.porAntes, corrige.cerradoPor);
paso('sigue cerrada', corrige.estado === 'cerrado', corrige.estado);
paso('la firma del cliente no se toca', corrige.firma === corrige.firmaAntes, corrige.firma);
paso('queda apuntado por qué', /fueron 3/.test(corrige.nota || ''), corrige.nota);
paso('y quién la corrigió', !!corrige.por, corrige.por);
paso('y cuándo', !!corrige.en, corrige.en);
paso('y que va una corrección', Number(corrige.veces) === 1, corrige.veces);
/* Si se corrigen las horas y el importe no se recalcula, se factura lo que no
   es. La valoración la hace el servidor, así que se comprueba que se le pide. */
paso('el importe se vuelve a calcular, que para eso se cambian las horas',
  corrige.valoradasDespues > corrige.valoradasAntes,
  corrige.valoradasAntes+' → '+corrige.valoradasDespues);
/* Y la del almacén: el material de este parte se rehace, no se suma otra vez.
   Si se duplicara, la furgoneta del técnico quedaría a cero de algo que sí
   tiene, y eso no lo nota nadie hasta que falta una pieza en una obra. */
paso('el material NO se descuenta dos veces',
  corrige.movDespues === corrige.movAntes,
  corrige.movAntes+' → '+corrige.movDespues);

/* ================================================================
   5. La segunda corrección, y lo que se ve sin abrir el parte
   ================================================================ */
bloque('5. La segunda vez, y lo que se ve desde fuera');

const segunda = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  g.dlgCierre('co-cerrado', true);
  await new Promise(r => setTimeout(r, 1800));
  const txtAntes = document.getElementById('dlg-form').innerText;
  document.getElementById('z-cornota').value = 'Faltaba el material que puso de su furgoneta';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'co-cerrado'), true, true);
  await new Promise(r => setTimeout(r, 2000));
  const a = g.S.avisos.find(x => x.id === 'co-cerrado') || {};
  const ficha = g.accionesAsis(a, !!a.firma_ruta);
  g.cerrarDlg();
  return { txtAntes, veces: a.correcciones, nota: a.corregido_nota,
    ficha: ficha.replace(/<[^>]+>/g, ' ') };
});
paso('al volver a abrirlo se dice que ya se corrigió, y cuándo',
  /Ya se corrigió/i.test(segunda.txtAntes) && /fueron 3/.test(segunda.txtAntes),
  segunda.txtAntes.slice(0, 60).replace(/\n/g, ' '));
paso('la segunda corrección cuenta dos', Number(segunda.veces) === 2, segunda.veces);
paso('y la nota es la última, que es la que explica lo último que cambió',
  /del material/i.test(segunda.nota || '') || /furgoneta/i.test(segunda.nota || ''),
  segunda.nota);
/* Lo que pidió David: que se vea que se tocó, sin tener que abrir nada */
paso('en la ficha de la asistencia se ve que está corregida, cuántas veces y quién',
  /Corregido 2 veces/.test(segunda.ficha) && /la última por/.test(segunda.ficha),
  segunda.ficha.replace(/\s+/g, ' ').slice(0, 120));

/* ================================================================
   6. Una visita ya facturada avisa
   ================================================================ */
bloque('6. Si ya está facturada, se avisa');

const facturada = await T(async () => {
  const g = window.__T;
  await g.sb.from('valoraciones').insert({ aviso_id:'co-cerrado', imp_mano_obra:135,
    imp_desplazamiento:30, imp_materiales:20, imp_total:185, coste_total:90, margen:95,
    facturado:true, factura_ref:'F-2026-120' });
  await g.cargar();
  g.dlgCierre('co-cerrado', true);
  await new Promise(r => setTimeout(r, 1800));
  const txt = document.getElementById('dlg-form').innerText;
  g.cerrarDlg();
  return { txt };
});
paso('se avisa de que la visita ya está facturada',
  /ya está facturada/i.test(facturada.txt), facturada.txt.slice(0, 60).replace(/\n/g, ' '));
paso('y de que hay que rectificar la factura, que no se arregla solo',
  /rectificar la factura/i.test(facturada.txt));

/* ================================================================
   7. Y el modo corrección no se queda pegado
   ================================================================ */
bloque('7. El modo no se queda encendido');

/* Si el modo corrección se quedara encendido, el siguiente parte que se abriera
   para cerrarlo de verdad se guardaría como una corrección y se quedaría sin
   cerrar. Se comprueba con una visita abierta de verdad. */
const noSePega = await T(async () => {
  const g = window.__T;
  const av = { id:'co-abierta', tipo:'averia', subtipo:'averia', estado:'asignado',
    prioridad:'normal', tecnico_id: g.S.perfil.id, cliente_id: g.S.puertas[0].cliente_id,
    puerta_id: g.S.puertas[0].id, ruta:'ruta1', descripcion:'Otra avería',
    creado:new Date().toISOString() };
  await g.sb.from('avisos').insert(av);
  await g.sb.from('fotos').insert({ aviso_id:'co-abierta', puerta_id: g.S.puertas[0].id,
    ruta:'co-abierta/1.jpg', autor:'prueba', etapa:'hecho', creado:new Date().toISOString() });
  await g.cargar();
  g.dlgCierre('co-abierta');
  await new Promise(r => setTimeout(r, 1700));
  const hayNota = !!document.getElementById('z-cornota');
  document.getElementById('z-diag').value = 'Fotocélula sucia';
  document.getElementById('z-trab').value = 'Limpiada y alineada';
  document.getElementById('z-horas').value = '1';
  document.getElementById('z-sin').value = 'No había nadie al terminar';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'co-abierta'), true);
  await new Promise(r => setTimeout(r, 2200));
  const a = g.S.avisos.find(x => x.id === 'co-abierta') || {};
  g.cerrarDlg();
  return { hayNota, cerrado: !!a.cerrado, corregido: a.corregido_en || null,
    err: (document.querySelector('#dlg-form .err') || {}).textContent || '' };
});
paso('una visita abierta no pide el motivo de corrección', noSePega.hayNota === false);
paso('y se cierra como siempre', noSePega.cerrado === true, noSePega.err);
paso('sin quedar marcada como corregida', noSePega.corregido === null);

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
