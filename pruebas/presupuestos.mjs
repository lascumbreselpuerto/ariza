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
/* Cambiado a propósito el 23-10-2026: antes, emitir dejaba el presupuesto en
   'enviado' y lo mandaba de golpe, así que no había manera de ver el documento
   antes de que saliera. Ahora emitir lo cierra y le pone referencia, pero NO lo
   manda: eso es otro botón, con la vista previa delante. Por eso aquí se espera
   'emitido' y enviado_el vacío. */
paso('queda emitido, con su fecha y su validez, pero sin mandar',
  emitir.p.estado === 'emitido' && !!emitir.p.fecha && !!emitir.p.valido && !emitir.p.enviado,
  JSON.stringify({ e:emitir.p.estado, f:emitir.p.fecha, v:emitir.p.valido, env:emitir.p.enviado }));
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
  /* Ya no hay campos: un presupuesto emitido se abre para verlo, no en un
     formulario con todo en gris */
  const campos = document.querySelectorAll('#dlg-form input,#dlg-form select,#dlg-form textarea').length;
  const guardar = !!document.querySelector('[data-act="pz-guardar"]');
  const editar = !!document.querySelector('[data-act="pz-editar"]');
  const documento = !!document.querySelector('[data-act="pz-documento"]');
  const enviar = !!document.querySelector('[data-act="pz-enviar"]');
  g.cerrarDlg();
  return { txt, campos, guardar, editar, documento, enviar };
});
/* Cambiado a propósito el 23-10-2026: antes se abría el editor con todos los
   campos deshabilitados y un aviso de «ya salió de la casa». Ahora se abre la
   ficha de lectura, que es como se abre cualquier presupuesto que ya existe. */
paso('un presupuesto emitido ya no se edita',
  yaNoSeToca.campos === 0 && yaNoSeToca.guardar === false && yaNoSeToca.editar === false,
  JSON.stringify({ campos:yaNoSeToca.campos, guardar:yaNoSeToca.guardar, editar:yaNoSeToca.editar }));
paso('y se abre con el documento y el envío a mano, que es a lo que se viene',
  yaNoSeToca.documento === true && yaNoSeToca.enviar === true);
paso('la ficha dice que está emitido y todavía no ha salido',
  /todavía no ha salido/.test(yaNoSeToca.txt));

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
   8. Ver, editar, imprimir y mandar: cuatro cosas distintas
   ================================================================
   La primera versión las juntaba todas en «Emitir y mandar», y por eso
   el presupuesto salía sin que nadie hubiera visto el papel. Esto
   vigila que sigan separadas. */
bloque('8. Ver, editar, imprimir y mandar');

const nuevoBorrador = await T(async () => {
  const g = window.__T;
  g.dlgPresupuesto(null, { cliente_id: g.S.clientes[0].id, titulo:'Puerta del almacén' });
  await new Promise(r => setTimeout(r, 200));
  g.S.presu.lineas.push({ tipo:'material', articulo_id:'art-foto', descripcion:'Fotocélula de espejo',
    cantidad:2, unidad:'ud', precio:40, importe:80, coste:25 });
  g.S.presu.anexos = 'Se excluye la obra civil y la toma de corriente.';
  g.pintarPresupuesto();
  await new Promise(r => setTimeout(r, 150));
  await g.guardarPresupuesto(false);
  await new Promise(r => setTimeout(r, 600));
  const id = g.S.presu.id;
  /* Se cierra y se vuelve a abrir, que es lo que hace cualquiera */
  g.cerrarDlg();
  g.dlgPresupuesto(id);
  await new Promise(r => setTimeout(r, 250));
  const verTxt = document.getElementById('dlg-form').innerText;
  const enVista = { campos: document.querySelectorAll('#dlg-form input,#dlg-form textarea').length,
    editar: !!document.querySelector('[data-act="pz-editar"]'),
    documento: !!document.querySelector('[data-act="pz-documento"]'),
    enviar: !!document.querySelector('[data-act="pz-enviar"]') };
  /* Y ahora al editor */
  document.querySelector('[data-act="pz-editar"]').click();
  await new Promise(r => setTimeout(r, 250));
  const enEditor = { campos: document.querySelectorAll('#dlg-form input,#dlg-form textarea').length,
    anexos: !!document.getElementById('pz-anexos'),
    guardar: !!document.querySelector('[data-act="pz-guardar"]'),
    emitir: (document.querySelector('[data-act="pz-emitir"]')||{}).textContent };
  g.cerrarDlg();
  return { id, verTxt, enVista, enEditor, anexosGuardados: g.presuDe(id).anexos };
});
paso('un borrador se abre para verlo, no en un formulario',
  nuevoBorrador.enVista.campos === 0 && nuevoBorrador.enVista.editar === true,
  JSON.stringify(nuevoBorrador.enVista));
paso('desde la ficha se puede ver el documento sin mandar nada',
  nuevoBorrador.enVista.documento === true);
paso('un borrador todavía no se puede mandar: primero se emite',
  nuevoBorrador.enVista.enviar === false);
paso('la ficha avisa de que es un borrador', /borrador/i.test(nuevoBorrador.verTxt));
paso('el botón Editar lleva al formulario, con sus campos',
  nuevoBorrador.enEditor.campos > 0 && nuevoBorrador.enEditor.guardar === true);
paso('y el botón ya no dice «Emitir y mandar», porque emitir no manda',
  nuevoBorrador.enEditor.emitir === 'Emitir', nuevoBorrador.enEditor.emitir);
paso('el editor tiene el campo de anexos, y se guardan',
  nuevoBorrador.enEditor.anexos === true &&
  /obra civil/.test(nuevoBorrador.anexosGuardados || ''), nuevoBorrador.anexosGuardados);

const formatos = await T(async (id) => {
  const g = window.__T;
  const abierto = [];
  const open0 = window.open;
  window.open = () => ({ document:{ write: t => abierto.push(t), close(){} } });
  const saca = op => { abierto.length = 0; g.documentoPresupuesto(id, op); return abierto.join(''); };
  const valorado = saca({ formato:'valorado', condiciones:true, anexos:true, qr:true });
  const sinVal   = saca({ formato:'sin_valorar', condiciones:true, anexos:true, qr:true });
  const resumen  = saca({ formato:'resumen', condiciones:true, anexos:true, qr:true });
  const pelado   = saca({ formato:'valorado', condiciones:false, anexos:false, qr:false });
  window.open = open0;
  return {
    valorado:{ precio:/40,00/.test(valorado), agua:/BORRADOR/.test(valorado),
               anexos:/obra civil/.test(valorado) },
    sinVal:{ precio:/40,00/.test(sinVal), total:/TOTAL/.test(sinVal),
             concepto:/Fotocélula/.test(sinVal) },
    resumen:{ concepto:/Fotocélula/.test(resumen), total:/TOTAL/.test(resumen) },
    pelado:{ anexos:/obra civil/.test(pelado) },
  };
}, nuevoBorrador.id);
paso('el documento de un borrador sale marcado como BORRADOR',
  formatos.valorado.agua === true);
paso('el valorado lleva precios y anexos',
  formatos.valorado.precio === true && formatos.valorado.anexos === true);
paso('el formato sin valorar dice qué se hace, pero ni un precio',
  formatos.sinVal.concepto === true && formatos.sinVal.precio === false &&
  formatos.sinVal.total === false, JSON.stringify(formatos.sinVal));
paso('el resumen deja fuera el detalle y conserva el total',
  formatos.resumen.concepto === false && formatos.resumen.total === true,
  JSON.stringify(formatos.resumen));
paso('y si se quitan los anexos, no salen', formatos.pelado.anexos === false);

const envio = await T(async (id) => {
  const g = window.__T;
  g.dlgPresupuesto(id, null, true);
  await new Promise(r => setTimeout(r, 200));
  await g.guardarPresupuesto(true);
  await new Promise(r => setTimeout(r, 600));
  const trasEmitir = { estado: g.presuDe(id).estado, enviado: !!g.presuDe(id).enviado_el,
    ref: !!g.presuDe(id).referencia };
  /* Mandarlo: primero las opciones, luego el enlace */
  g.cerrarDlg();
  g.dlgPresupuesto(id);
  await new Promise(r => setTimeout(r, 250));
  document.querySelector('[data-act="pz-enviar"]').click();
  await new Promise(r => setTimeout(r, 200));
  const pasoUno = { formato: !!document.getElementById('pd-formato'),
    siguiente: !!document.querySelector('[data-act="pd-siguiente"]'),
    ver: !!document.querySelector('[data-act="pd-ver"]') };
  document.querySelector('[data-act="pd-siguiente"]').click();
  await new Promise(r => setTimeout(r, 250));
  const pasoDos = { qr: !!document.getElementById('pe-url'),
    aDonde: !!document.getElementById('pe-a'),
    marcar: !!document.querySelector('[data-act="pz-marcar-enviado"]') };
  document.getElementById('pe-a').value = 'cliente@ejemplo.es';
  document.querySelector('[data-act="pz-marcar-enviado"]').click();
  await new Promise(r => setTimeout(r, 700));
  const p = g.presuDe(id);
  return { trasEmitir, pasoUno, pasoDos,
    final: { estado:p.estado, a:p.enviado_a, cuando: !!p.enviado_el } };
}, nuevoBorrador.id);
paso('emitir pone referencia y cierra el presupuesto, pero no lo manda',
  envio.trasEmitir.estado === 'emitido' && envio.trasEmitir.ref === true &&
  envio.trasEmitir.enviado === false, JSON.stringify(envio.trasEmitir));
paso('mandar empieza por las opciones del documento, con botón de verlo',
  envio.pasoUno.formato === true && envio.pasoUno.ver === true &&
  envio.pasoUno.siguiente === true);
paso('el segundo paso trae el enlace, el QR y a dónde se manda',
  envio.pasoDos.qr === true && envio.pasoDos.aDonde === true && envio.pasoDos.marcar === true);
paso('al darlo por mandado queda enviado, con destino y hora',
  envio.final.estado === 'enviado' && envio.final.a === 'cliente@ejemplo.es' &&
  envio.final.cuando === true, JSON.stringify(envio.final));

/* ================================================================
   9. La firma del cliente en el sitio
   ================================================================ */
bloque('9. La firma del cliente');

const firma = await T(async (id) => {
  const g = window.__T;
  g.dlgFirmarPresu(id);
  await new Promise(r => setTimeout(r, 250));
  const hayLienzo = !!document.getElementById('pf-firma');
  /* Sin trazo no se guarda: una firma en blanco no es una firma */
  document.querySelector('#dlg-form [type="submit"]').click();
  await new Promise(r => setTimeout(r, 250));
  const sinTrazo = document.querySelector('#dlg-form .err').textContent;
  /* Se pinta a mano sobre el lienzo */
  g.FIRMA.ctx.beginPath(); g.FIRMA.ctx.moveTo(10,10);
  g.FIRMA.ctx.lineTo(120,60); g.FIRMA.ctx.stroke(); g.FIRMA.pintado = true;
  document.getElementById('pf-nom').value = 'Juan Pérez Gómez';
  document.getElementById('pf-nif').value = '31000000X';
  document.getElementById('pf-info').value = 'en la nave, delante del encargado';
  document.querySelector('#dlg-form [type="submit"]').click();
  await new Promise(r => setTimeout(r, 900));
  const p = g.presuDe(id);
  const abierto = [];
  const open0 = window.open;
  window.open = () => ({ document:{ write: t => abierto.push(t), close(){} } });
  g.documentoPresupuesto(id, { formato:'valorado', condiciones:true, anexos:true, qr:true });
  window.open = open0;
  return { hayLienzo, sinTrazo, estado:p.estado, nombre:p.firma_nombre, nif:p.firma_nif,
    ruta:p.firma_ruta, cuando: !!p.firma_el, aceptadoPor:p.aceptado_por,
    papel: abierto.join('') };
}, nuevoBorrador.id);
paso('para firmar hay un lienzo, como en el parte', firma.hayLienzo === true);
paso('una firma en blanco no vale', /Falta la firma/.test(firma.sinTrazo), firma.sinTrazo);
paso('firmado queda aceptado, con nombre y NIF',
  firma.estado === 'aceptado' && firma.nombre === 'Juan Pérez Gómez' &&
  firma.nif === '31000000X' && firma.cuando === true,
  JSON.stringify({ e:firma.estado, n:firma.nombre }));
paso('la firma se guarda como fichero, no como una casilla marcada',
  /^presupuestos\//.test(firma.ruta || ''), firma.ruta);
paso('y queda dicho que se firmó en el sitio',
  /firmado en el sitio/.test(firma.aceptadoPor || ''), firma.aceptadoPor);
paso('el papel enseña la firma recogida y ya no pide una nueva',
  /Aceptado y firmado/.test(firma.papel) && !/Conforme, el cliente/.test(firma.papel));

/* ================================================================
   10. Los textos que se repiten
   ================================================================ */
bloque('10. Textos guardados');

const textos = await T(async () => {
  const g = window.__T;
  g.dlgPresupuesto(null, { cliente_id: g.S.clientes[0].id, titulo:'Otra oferta' });
  await new Promise(r => setTimeout(r, 200));
  document.getElementById('pz-cond').value = 'Ingreso del 50% al aceptar y 50% al terminar.';
  /* Guardar el texto para otras veces */
  document.querySelector('[data-act="pz-texto-guardar"][data-destino="condiciones"]').click();
  await new Promise(r => setTimeout(r, 200));
  document.getElementById('pt-tit').value = 'Pago 50/50';
  document.querySelector('#dlg-form [type="submit"]').click();
  await new Promise(r => setTimeout(r, 800));
  const guardado = (g.S.textosPresu || []).length;
  /* En un presupuesto nuevo, pegarlo */
  g.dlgPresupuesto(null, { cliente_id: g.S.clientes[0].id, titulo:'Tercera oferta' });
  await new Promise(r => setTimeout(r, 250));
  const hayBoton = !!document.querySelector('[data-act="pz-texto-pegar"][data-destino="condiciones"]');
  document.querySelector('[data-act="pz-texto-pegar"][data-destino="condiciones"]').click();
  await new Promise(r => setTimeout(r, 200));
  const enLista = document.getElementById('dlg-form').innerText;
  document.querySelector('[data-act="pz-texto-usar"]').click();
  await new Promise(r => setTimeout(r, 250));
  const pegado = (document.getElementById('pz-cond') || {}).value;
  g.cerrarDlg();
  return { guardado, hayBoton, enLista, pegado };
});
paso('un texto escrito una vez se guarda con su nombre', textos.guardado === 1, textos.guardado);
paso('y aparece para usarlo en el siguiente presupuesto', textos.hayBoton === true);
paso('la lista enseña el nombre y un trozo del texto',
  /Pago 50\/50/.test(textos.enLista) && /50% al aceptar/.test(textos.enLista));
paso('al elegirlo se pega en el campo',
  /50% al aceptar/.test(textos.pegado || ''), textos.pegado);

/* ================================================================
   11. El documento como oferta comercial
   ================================================================
   Un presupuesto no solo tiene que ser correcto: tiene que convencer.
   De ahí el logo, los sellos, el subtítulo, los capítulos con su
   subtotal y la explicación larga debajo de cada concepto. */
bloque('11. El documento como oferta');

const comercial = await T(async () => {
  const g = window.__T;
  /* Un logo y un sello de pega, hechos aquí mismo */
  const lienzo = document.createElement('canvas');
  lienzo.width = 120; lienzo.height = 40;
  const cx = lienzo.getContext('2d');
  cx.fillStyle = '#FCBA1D'; cx.fillRect(0, 0, 120, 40);
  const png = lienzo.toDataURL('image/png');
  await g.guardarMarca({ logo: png, sellos: [png, png] });
  const m = g.marcaEmpresa();

  /* Un presupuesto con capítulo, referencia, detalle largo y descuento */
  g.dlgPresupuesto(null, { cliente_id: g.S.clientes[0].id, titulo:'Cierre enrollable' });
  await new Promise(r => setTimeout(r, 200));
  g.S.presu.subtitulo = 'Instalación de cierre enrollable de aluminio en verde';
  g.S.presu.lineas.push(
    { tipo:'capitulo', descripcion:'Suministro', nombre:'Suministro',
      detalle:'Material puesto en obra.', cantidad:0, unidad:'', precio:0, importe:0, coste:0 },
    { tipo:'material', articulo_id:'art-foto', descripcion:'Cierre enrollable Innova',
      nombre:'Cierre enrollable Innova', referencia:'INNOVA',
      detalle:'Aluminio extrusionado de alta resistencia, lama de 100x2 mm.\nConforme a UNE-EN 13241.',
      cantidad:1, unidad:'ud', precio:1000, dto:10, importe:900, coste:500 },
    { tipo:'capitulo', descripcion:'Instalación', nombre:'Instalación',
      cantidad:0, unidad:'', precio:0, importe:0, coste:0 },
    { tipo:'mano_obra', descripcion:'Colocación', nombre:'Colocación', cantidad:4, unidad:'h',
      precio:45, dto:0, importe:180, coste:88 });
  g.pintarPresupuesto();
  await new Promise(r => setTimeout(r, 150));
  await g.guardarPresupuesto(false);
  await new Promise(r => setTimeout(r, 700));
  const id = g.S.presu.id;

  const abierto = [];
  const open0 = window.open;
  window.open = () => ({ document:{ write: t => abierto.push(t), close(){} } });
  g.documentoPresupuesto(id, { formato:'valorado', condiciones:true, anexos:true, qr:true });
  window.open = open0;
  const html = abierto.join('');
  g.cerrarDlg();
  return { logo: !!m.logo, sellos: (m.sellos||[]).length,
    conLogo: html.includes(png.slice(0, 60)),
    sellosEnPapel: (html.match(new RegExp(png.slice(0,40).replace(/[+/]/g,'.'),'g'))||[]).length,
    numero: /Número:<\/span> <b>PR-/.test(html) || /Número/.test(html),
    subtitulo: /cierre enrollable de aluminio en verde/.test(html),
    capitulos: (html.match(/class="cap"/g)||[]).length,
    subtotales: (html.match(/Subtotal /g)||[]).length,
    referencia: /INNOVA/.test(html),
    detalle: /UNE-EN 13241/.test(html),
    dto: /10 %/.test(html),
    importe: g.lineasDe(id).find(l => l.referencia === 'INNOVA').importe,
    cabFija: /class="cabfija"/.test(html) && /position:fixed;top:-28mm/.test(html) };
});
paso('el logo y los sellos se guardan en los ajustes',
  comercial.logo === true && comercial.sellos === 2);
paso('y salen en el papel', comercial.conLogo === true);
paso('la cabecera va fija, para repetirse en todas las páginas',
  comercial.cabFija === true);
paso('el documento lleva el número del presupuesto', comercial.numero === true);
paso('y el subtítulo que dice de qué va la oferta', comercial.subtitulo === true);
paso('los capítulos agrupan y cada uno lleva su subtotal',
  comercial.capitulos === 2 && comercial.subtotales === 2,
  'capítulos '+comercial.capitulos+', subtotales '+comercial.subtotales);
paso('cada línea sale con su referencia', comercial.referencia === true);
paso('y con la explicación larga debajo, que es lo que convence',
  comercial.detalle === true);
paso('el descuento por línea se imprime', comercial.dto === true);
paso('y el importe de la línea ya lleva ese descuento aplicado',
  comercial.importe === 900, comercial.importe);

const calculo = await T(() => {
  const g = window.__T;
  return { normal: g.importeLinea({ tipo:'material', cantidad:2, precio:50, dto:0 }),
    conDto: g.importeLinea({ tipo:'material', cantidad:2, precio:50, dto:25 }),
    pasado: g.importeLinea({ tipo:'material', cantidad:2, precio:50, dto:140 }),
    capitulo: g.importeLinea({ tipo:'capitulo', cantidad:9, precio:9 }),
    texto: g.importeLinea({ tipo:'texto', cantidad:9, precio:9 }) };
});
paso('sin descuento, cantidad por precio', calculo.normal === 100, calculo.normal);
paso('con descuento, se aplica', calculo.conDto === 75, calculo.conDto);
paso('un descuento imposible se queda en el 100%', calculo.pasado === 0, calculo.pasado);
paso('un capítulo y una línea de texto no suman: son rótulos',
  calculo.capitulo === 0 && calculo.texto === 0);

/* ================================================================
   12. A quién va y si lo han abierto
   ================================================================ */
bloque('12. Contactos y seguimiento');

const seguimiento = await T(async () => {
  const g = window.__T;
  const cid = g.S.clientes[0].id;
  await g.sb.from('contactos').insert([
    { cliente_id:cid, nombre:'Eduardo Ruiz', cargo:'Jefe de obra',
      email:'jefeobra@ejemplo.es', principal:true, activo:true },
    { cliente_id:cid, nombre:'Marta Gil', cargo:'Administración',
      email:'admin@ejemplo.es', principal:false, activo:true }]);
  await g.cargar();
  const lista = g.contactosDe(cid).map(c => c.nombre);
  const pri = (g.contactoPrincipal(cid) || {}).nombre;

  /* Un presupuesto emitido, listo para mandar */
  g.dlgPresupuesto(null, { cliente_id: cid, titulo:'Oferta con contactos' });
  await new Promise(r => setTimeout(r, 200));
  g.S.presu.lineas.push({ tipo:'material', descripcion:'Fotocélula', nombre:'Fotocélula',
    cantidad:1, unidad:'ud', precio:60, importe:60, coste:25 });
  g.pintarPresupuesto();
  await new Promise(r => setTimeout(r, 150));
  await g.guardarPresupuesto(true);
  await new Promise(r => setTimeout(r, 700));
  const id = g.S.presu.id;

  g.cerrarDlg();
  g.dlgEnlacePresu(id);
  await new Promise(r => setTimeout(r, 250));
  const sel = document.getElementById('pe-cont');
  const propuesto = (document.getElementById('pe-a') || {}).value;
  const opciones = sel ? [...sel.options].map(o => o.text) : [];
  /* Se cambia a la otra persona: su correo tiene que bajar solo */
  const otra = [...sel.options].find(o => /Marta/.test(o.text));
  sel.value = otra.value;
  sel.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 120));
  const traskCambio = document.getElementById('pe-a').value;
  document.querySelector('[data-act="pz-marcar-enviado"]').click();
  await new Promise(r => setTimeout(r, 800));
  const envios = g.enviosDe(id);
  const p = g.presuDe(id);

  /* Y ahora el cliente lo abre dos veces */
  await g.sb.rpc('presupuesto_publico', { p_token: p.token });
  await g.sb.rpc('presupuesto_publico', { p_token: p.token });
  await g.cargar();
  const visitas = g.visitasDe(id).length;
  g.dlgPresupuesto(id);
  await new Promise(r => setTimeout(r, 250));
  const txt = document.getElementById('dlg-form').innerText;
  g.cerrarDlg();
  return { lista, pri, opciones, propuesto, traskCambio,
    envios: envios.map(e => ({ a:e.destino, n:e.nombre })),
    estado: p.estado, visitas, txt };
});
paso('el contacto principal sale el primero de la lista',
  seguimiento.lista[0] === 'Eduardo Ruiz' && seguimiento.pri === 'Eduardo Ruiz',
  JSON.stringify(seguimiento.lista));
paso('al mandar, se propone el correo del principal',
  seguimiento.propuesto === 'jefeobra@ejemplo.es', seguimiento.propuesto);
paso('se puede elegir a otra persona del cliente',
  seguimiento.opciones.some(o => /Marta Gil/.test(o)) &&
  seguimiento.opciones.some(o => /Jefe de obra/.test(o)));
paso('y escribir una dirección a mano si no es ninguna de ellas',
  seguimiento.opciones.some(o => /a mano/i.test(o)));
paso('al cambiar de persona, su correo baja solo al campo',
  seguimiento.traskCambio === 'admin@ejemplo.es', seguimiento.traskCambio);
paso('cada envío queda apuntado, con nombre y destino',
  seguimiento.envios.length === 1 && seguimiento.envios[0].n === 'Marta Gil' &&
  seguimiento.envios[0].a === 'admin@ejemplo.es', JSON.stringify(seguimiento.envios));
paso('y el presupuesto pasa a enviado', seguimiento.estado === 'enviado');
paso('cada vez que el cliente abre el enlace, queda la hora',
  seguimiento.visitas === 2, seguimiento.visitas);
paso('la ficha lo dice, para saber cuándo toca llamar',
  /abierto 2 veces/.test(seguimiento.txt), (seguimiento.txt.match(/abierto[^.]*/)||[''])[0]);
paso('y deja claro que eso cuenta aperturas de la página, no del correo',
  /no el correo/.test(seguimiento.txt));

/* ================================================================
   Final
   ================================================================ */
console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
