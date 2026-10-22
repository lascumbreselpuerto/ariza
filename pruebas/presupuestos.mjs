/* ================================================================
   presupuestos.mjs — ofertas a clientes.

   Un presupuesto es una promesa con fecha. De ahí las tres cosas
   que esta suite vigila por encima de todo:

     1. Los importes se congelan al emitir. Cada línea guarda SU
        precio. Si mañana sube el coste del material, la oferta
        mandada ayer sigue diciendo lo mismo.
     2. El coste no sale nunca en lo que ve el cliente, ni en el
        documento ni en la pantalla pública. Está para ver el margen
        antes de mandarlo.
     3. La aceptación deja rastro: quién y cuándo. Y no se puede
        aceptar dos veces, ni caducado, ni sin nombre.
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
    /* Las tarifas con los nombres que usa de verdad la aplicación */
    db.tarifas = [{ id:1, precio_hora:45, coste_hora:22, minimo_horas:1,
                    desplazamiento_fijo:30, precio_km:0.45, coste_km:0.2,
                    recargo_material:40, iva:21 }];
    db.articulos.push(
      { id:'art-banda', descripcion:'Banda de seguridad resistiva 2 m', unidad:'ud',
        coste:38.5, codigo:'MAT-0001', token:'A3K9', activo:true },
      { id:'art-foto', descripcion:'Fotocélula de espejo', unidad:'ud',
        coste:25, recargo:60, codigo:'MAT-0002', token:'B4L0', activo:true },
      { id:'art-sin', descripcion:'Material sin coste cargado', unidad:'ud',
        codigo:'MAT-0003', token:'C5M1', activo:true });
    db.catalogo = db.articulos;
    db.avisos.push({ id:'av-presu', tipo:'mantenimiento', estado:'asignado', prioridad:'normal',
      tecnico_id:'usuario-admin', puerta_id:db.puertas[0].id, cliente_id:db.puertas[0].cliente_id,
      diagnostico:'Sin banda en el canto', creado:new Date().toISOString() });
    db.revisiones.push({ id:'rev-presu', aviso_id:'av-presu', puerta_id:db.puertas[0].id,
      tipo_puerta:'Corredera', fecha:new Date().toISOString().slice(0,10), resultado:'no_apta',
      deficiencias:'· Sin banda de seguridad en el canto de cierre',
      recomendaciones:'Montar banda de seguridad con autocontrol y dos fotocélulas' });
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
   1. Precios y totales
   ================================================================ */
bloque('1. Lo que suma y lo que cuesta');

const precios = await T(() => {
  const g = window.__T;
  return { general: g.precioVentaMaterial('art-banda'),
           propio: g.precioVentaMaterial('art-foto'),
           sinCoste: g.precioVentaMaterial('art-sin'),
           noExiste: g.precioVentaMaterial('nada') };
});
paso('el recargo general sube el coste: 38,50 con 40% son 53,90',
  precios.general === 53.9, precios.general);
paso('el recargo propio del artículo manda sobre el general: 25 con 60% son 40',
  precios.propio === 40, precios.propio);
paso('un material sin coste cargado no inventa un precio',
  precios.sinCoste === null, precios.sinCoste);
paso('y uno que no existe tampoco', precios.noExiste === null);

const tot = await T(() => {
  const g = window.__T;
  const lineas = [
    { tipo:'material', cantidad:2, precio:53.9, importe:107.8, coste:38.5 },
    { tipo:'mano_obra', cantidad:3, precio:45, importe:135, coste:22 },
    { tipo:'desplazamiento', cantidad:1, precio:30, importe:30, coste:0 },
    { tipo:'texto', cantidad:0, precio:0, importe:0, coste:0 },
  ];
  return { normal: g.totalesPresu(lineas, 0, 21),
           conDescuento: g.totalesPresu(lineas, 22.8, 21),
           descuentoExagerado: g.totalesPresu(lineas, 9999, 21),
           vacio: g.totalesPresu([], 0, 21) };
});
paso('suma cada bloque por separado',
  tot.normal.materiales === 107.8 && tot.normal.mano_obra === 135 && tot.normal.desplazamiento === 30,
  JSON.stringify(tot.normal));
paso('la base es la suma menos el descuento', tot.normal.base === 272.8, tot.normal.base);
paso('el IVA se calcula sobre la base', tot.normal.iva === 57.29, tot.normal.iva);
paso('y el total es base más IVA', tot.normal.total === 330.09, tot.normal.total);
paso('el descuento baja la base y con ella el IVA',
  tot.conDescuento.base === 250 && tot.conDescuento.total === 302.5,
  tot.conDescuento.base+' / '+tot.conDescuento.total);
paso('un descuento mayor que el importe no deja la base en negativo',
  tot.descuentoExagerado.base === 0, tot.descuentoExagerado.base);
paso('el coste suma lo que cuesta cada línea, no lo que se cobra',
  tot.normal.coste === 143, tot.normal.coste);
paso('y el margen es base menos coste', tot.normal.margen === 129.8, tot.normal.margen);
paso('un presupuesto vacío no rompe las cuentas',
  tot.vacio.total === 0 && tot.vacio.margen === 0);

/* ================================================================
   2. Emitir
   ================================================================ */
bloque('2. Emitir congela la oferta');

const emitir = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  g.dlgPresupuesto(null, { cliente_id: cli.id, titulo:'Adecuación de la corredera',
    descripcion:'Montar banda y fotocélulas', lineas:[] });
  await new Promise(r => setTimeout(r, 300));
  const sinLineas = await (async () => {
    await g.guardarPresupuesto(true);
    return (document.querySelector('#dlg-form .err')||{}).textContent || '';
  })();
  g.S.presu.lineas.push({ tipo:'material', articulo_id:'art-banda',
    descripcion:'Banda de seguridad resistiva 2 m', cantidad:2, unidad:'ud',
    precio:53.9, importe:107.8, coste:38.5 });
  g.S.presu.lineas.push({ tipo:'mano_obra', descripcion:'Mano de obra', cantidad:3,
    unidad:'h', precio:45, importe:135, coste:22 });
  g.pintarEditorPresu();
  await new Promise(r => setTimeout(r, 200));
  await g.guardarPresupuesto(true);
  await new Promise(r => setTimeout(r, 700));
  const p = g.S.presupuestos[0];
  return { sinLineas, p: p && { ref:p.referencia, estado:p.estado, total:p.total,
           base:p.base, coste:p.coste, tok:(p.token||'').length, fecha:p.fecha,
           valido:p.valido_hasta, enviado: !!p.enviado_el },
           lineas: g.lineasDe(p.id).map(l => ({ t:l.tipo, imp:l.importe, coste:l.coste })),
           siguiente: g.siguienteReferenciaPresu() };
});
paso('no deja mandar un presupuesto sin líneas',
  /sin ninguna línea/.test(emitir.sinLineas), emitir.sinLineas);
paso('al emitir, la referencia es correlativa del año',
  /^PR-\d{4}-0001$/.test(emitir.p.ref), emitir.p.ref);
paso('y la siguiente ya no repite ese número',
  /0002$/.test(emitir.siguiente), emitir.siguiente);
paso('el token del enlace del cliente es largo: aquí hay dinero detrás',
  emitir.p.tok === 12, emitir.p.tok);
paso('queda enviado, con su fecha y su validez',
  emitir.p.estado === 'enviado' && !!emitir.p.fecha && !!emitir.p.valido && emitir.p.enviado,
  JSON.stringify({ e:emitir.p.estado, f:emitir.p.fecha, v:emitir.p.valido }));
paso('los importes quedan guardados, no se recalculan después',
  emitir.p.base === 242.8 && emitir.p.total === 293.79, emitir.p.base+' / '+emitir.p.total);
paso('el coste también se guarda, para saber el margen de lo ofertado',
  emitir.p.coste === 143, emitir.p.coste);
paso('y cada línea guarda su precio y su coste',
  emitir.lineas.length === 2 && emitir.lineas[0].imp === 107.8 && emitir.lineas[0].coste === 38.5,
  JSON.stringify(emitir.lineas));

const yaNoSeToca = await T(async () => {
  const g = window.__T;
  const p = g.S.presupuestos[0];
  g.dlgPresupuesto(p.id);
  await new Promise(r => setTimeout(r, 300));
  const txt = document.getElementById('dlg-form').innerText;
  const deshabilitados = Array.from(document.querySelectorAll('#dlg-form input,#dlg-form select,#dlg-form textarea'))
    .filter(e => e.id && e.id.startsWith('pz-')).every(e => e.disabled);
  const guardar = !!document.querySelector('[data-act="pz-guardar"]');
  g.cerrarDlg();
  return { txt, deshabilitados, guardar };
});
paso('un presupuesto emitido ya no se edita',
  yaNoSeToca.deshabilitados === true && yaNoSeToca.guardar === false);
paso('y la aplicación explica por qué, en vez de solo impedirlo',
  /ya salió de la casa/.test(yaNoSeToca.txt));

/* ================================================================
   3. Lo que ve el cliente
   ================================================================ */
bloque('3. El cliente y su enlace');

const publico = await T(async () => {
  const g = window.__T;
  const p = g.S.presupuestos[0];
  const { data } = await g.sb.rpc('presupuesto_publico', { p_token: p.token });
  const crudo = JSON.stringify(data);
  return { data, tieneCoste: /"coste"/.test(crudo), tieneNotas: /notas_internas/.test(crudo),
           enlace: g.enlacePresu(p), leeUrl: (() => {
             const antes = location.hash;
             location.hash = '#P-'+p.token;
             const r = g.presupuestoDeURL();
             location.hash = antes;
             return r; })() };
});
paso('el cliente ve el presupuesto entero', publico.data.ok === true && publico.data.lineas.length === 2);
paso('con su total', publico.data.total === 293.79, publico.data.total);
paso('y NO ve los costes', publico.tieneCoste === false);
paso('ni las notas internas', publico.tieneNotas === false);
paso('el enlace lleva su token', /#P-/.test(publico.enlace), publico.enlace);
paso('y la aplicación lo reconoce al abrirlo', publico.leeUrl === publico.enlace.split('#P-')[1]);

const aceptar = await T(async () => {
  const g = window.__T;
  const p = g.S.presupuestos[0];
  const sinNombre = (await g.sb.rpc('responder_presupuesto',
    { p_token:p.token, p_acepta:true, p_nombre:'  ' })).data;
  const bien = (await g.sb.rpc('responder_presupuesto',
    { p_token:p.token, p_acepta:true, p_nombre:'Manuel Pérez, presidente' })).data;
  const otraVez = (await g.sb.rpc('responder_presupuesto',
    { p_token:p.token, p_acepta:false, p_nombre:'Otro' })).data;
  const inventado = (await g.sb.rpc('presupuesto_publico', { p_token:'NOEXISTE1234' })).data;
  await g.cargar();
  const p2 = g.presuDe(p.id);
  return { sinNombre, bien, otraVez, inventado,
           estado: p2.estado, por: p2.aceptado_por, cuando: !!p2.aceptado_el };
});
paso('sin nombre no se acepta', aceptar.sinNombre.ok === false && aceptar.sinNombre.motivo === 'sin_nombre');
paso('con nombre sí', aceptar.bien.ok === true && aceptar.estado === 'aceptado');
paso('y queda escrito quién y cuándo',
  aceptar.por === 'Manuel Pérez, presidente' && aceptar.cuando, aceptar.por);
paso('no se puede responder dos veces',
  aceptar.otraVez.ok === false && aceptar.otraVez.motivo === 'ya_aceptado', aceptar.otraVez.motivo);
paso('un token inventado no abre nada',
  aceptar.inventado.ok === false, aceptar.inventado.motivo);

const borrador = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  const { data } = await g.sb.from('presupuestos').insert({ cliente_id:cli.id, titulo:'Borrador',
    estado:'borrador', token:'BORRADOR1234', total:100 }).select().maybeSingle();
  await g.cargar();
  const pub = (await g.sb.rpc('presupuesto_publico', { p_token:'BORRADOR1234' })).data;
  const resp = (await g.sb.rpc('responder_presupuesto',
    { p_token:'BORRADOR1234', p_acepta:true, p_nombre:'Alguien' })).data;
  await g.sb.from('presupuestos').delete().eq('id', data.id);
  await g.cargar();
  return { pub, resp };
});
paso('un borrador no se puede ver aunque se adivine el enlace',
  borrador.pub.ok === false && borrador.pub.motivo === 'no_enviado');
paso('ni aceptar', borrador.resp.ok === false && borrador.resp.motivo === 'no_enviado');

const caducado = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  const ayer = g.iso(g.sumaDias(new Date(), -3));
  const { data } = await g.sb.from('presupuestos').insert({ cliente_id:cli.id, titulo:'Viejo',
    estado:'enviado', token:'CADUCADO1234', total:100, valido_hasta: ayer, fecha: ayer }).select().maybeSingle();
  await g.cargar();
  const p = g.presuDe(data.id);
  const pub = (await g.sb.rpc('presupuesto_publico', { p_token:'CADUCADO1234' })).data;
  const resp = (await g.sb.rpc('responder_presupuesto',
    { p_token:'CADUCADO1234', p_acepta:true, p_nombre:'Alguien' })).data;
  return { marcado: g.presuCaducado(p), estado: g.estadoPresu(p),
           guardado: p.estado, pub: pub.caducado, resp };
});
paso('caducado se calcula por la fecha, no se guarda',
  caducado.marcado === true && caducado.estado === 'caducado' && caducado.guardado === 'enviado',
  caducado.guardado+' → '+caducado.estado);
paso('el cliente lo ve caducado', caducado.pub === true);
paso('y ya no lo puede aceptar',
  caducado.resp.ok === false && caducado.resp.motivo === 'caducado', caducado.resp.motivo);

/* ================================================================
   4. De aceptado a trabajo
   ================================================================ */
bloque('4. El presupuesto aceptado se convierte en trabajo');

const convertir = await T(async () => {
  const g = window.__T;
  const p = g.S.presupuestos.find(x => x.estado === 'aceptado');
  const avisosAntes = g.S.avisos.length;
  await g.convertirPresupuesto(p.id);
  await g.cargar();
  const p2 = g.presuDe(p.id);
  const av = g.S.avisos.find(x => x.id === p2.convertido_aviso);
  return { estado: p2.estado, creado: g.S.avisos.length - avisosAntes,
           aviso: av && { tipo:av.tipo, cliente: av.cliente_id === p2.cliente_id,
                          desc: av.descripcion },
           previstos: g.previstosDe(p2.convertido_aviso).map(x => x.descripcion+' x'+x.cantidad),
           movimientos: (g.S.movimientos||[]).length };
});
paso('se abre una asistencia nueva', convertir.creado === 1, convertir.creado);
paso('para el mismo cliente y diciendo de qué presupuesto sale',
  convertir.aviso.cliente === true && /Presupuesto aceptado PR-/.test(convertir.aviso.desc),
  convertir.aviso.desc);
paso('el material ofertado queda apuntado como lo que hay que llevar',
  convertir.previstos.length === 1 && /Banda/.test(convertir.previstos[0]), convertir.previstos.join(' · '));
paso('pero NO se mueve el almacén: reservar no es gastar',
  convertir.movimientos === 0, convertir.movimientos);
paso('y el presupuesto queda como en marcha', convertir.estado === 'convertido');

/* ================================================================
   5. Desde una visita
   ================================================================ */
bloque('5. De lo que vio el técnico a una oferta');

const desdeVisita = await T(async () => {
  const g = window.__T;
  const av = g.S.avisos.find(x => x.id === 'av-presu');
  await g.presupuestoDesdeAsistencia(av);
  await new Promise(r => setTimeout(r, 400));
  const d = g.S.presu;
  const txt = document.getElementById('dlg-form').innerText;
  g.cerrarDlg();
  return { cliente: d.cliente_id === av.cliente_id, puerta: d.puerta_id === av.puerta_id,
           aviso: d.aviso_id === 'av-presu', desc: d.descripcion, titulo: d.titulo, txt };
});
paso('trae el cliente y la puerta de la visita, sin teclearlos',
  desdeVisita.cliente && desdeVisita.puerta, JSON.stringify({c:desdeVisita.cliente,p:desdeVisita.puerta}));
paso('y se queda enganchado a la asistencia que lo originó', desdeVisita.aviso === true);
paso('el título nombra la puerta', /AR-0001/.test(desdeVisita.titulo), desdeVisita.titulo);
paso('y trae lo que el técnico recomendó en su revisión',
  /banda de seguridad con autocontrol/.test(desdeVisita.desc), (desdeVisita.desc||'').slice(0,70));
paso('y también las deficiencias que anotó',
  /Deficiencias encontradas/.test(desdeVisita.desc));

/* ================================================================
   6. Quién lo ve
   ================================================================ */
bloque('6. Los presupuestos son de oficina');

const permisos = await T(async () => {
  const g = window.__T;
  const rol = g.S.perfil.rol;
  const hay = () => !document.querySelector('#tabs button[data-tab="presupuestos"]').hidden;
  const comoAdmin = hay();
  /* Lo que de verdad protege no es la pestaña, es la base de datos: al técnico
     le vienen vacíos. Aquí se comprueba que la aplicación no se rompe con eso. */
  g.S.perfil.rol = 'tecnico';
  g.S.sinPresupuestos = true; g.S.presupuestos = []; g.S.presuLineas = [];
  g.S.tab = 'presupuestos'; g.pintar();
  await new Promise(r => setTimeout(r, 250));
  const pintaAlgo = document.getElementById('vista').innerText.length > 0;
  const seVa = !/presupuesto/i.test(document.getElementById('vista').innerText);
  g.S.perfil.rol = rol; g.S.sinPresupuestos = false;
  g.S.tab = 'puertas'; await g.cargar(); g.pintar();
  return { comoAdmin, pintaAlgo, seVa };
});
paso('el administrador y la oficina ven la pestaña', permisos.comoAdmin === true);
paso('al técnico, si llegara por su cuenta, no se le enseñan presupuestos',
  permisos.seVa === true && permisos.pintaAlgo === true);

/* ================================================================
   7. El documento
   ================================================================ */
bloque('7. El documento que se le manda');

const doc = await T(async () => {
  const g = window.__T;
  const p = g.S.presupuestos.find(x => x.estado === 'convertido' || x.estado === 'aceptado')
          || g.S.presupuestos[0];
  /* Se abre en otra ventana, así que aquí se comprueba lo que genera, que es lo
     que importa: que no se escape un coste al papel del cliente. */
  const abierto = [];
  const open0 = window.open;
  window.open = () => {
    const doc2 = { write: t => abierto.push(t), close: () => {} };
    return { document: doc2 };
  };
  g.documentoPresupuesto(p.id);
  window.open = open0;
  return { html: abierto.join(''), coste: p.coste, notas: p.notas_internas };
});
paso('el documento sale con la referencia y el total',
  /Presupuesto PR-/.test(doc.html) && /TOTAL/.test(doc.html));
paso('lleva las condiciones y las dos firmas',
  /Conforme, el cliente/.test(doc.html));
paso('y NO lleva el coste por ninguna parte',
  !doc.html.includes('143') && !/[Cc]oste/.test(doc.html.replace(/coste[^<]*recargo/g,'')),
  'coste del presupuesto: '+doc.coste);
paso('el presupuesto ya aceptado lo dice en el papel',
  /Aceptado/.test(doc.html));

/* ================================================================
   Final
   ================================================================ */
console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
