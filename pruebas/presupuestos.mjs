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
  g.S.presu.condiciones = 'Se excluye la obra civil y la toma de corriente.';
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
    subtitulo: !!document.getElementById('pz-subtitulo'),
    adjuntos: /Documentos adjuntos/.test(document.getElementById('dlg-form').innerText),
    guardar: !!document.querySelector('[data-act="pz-guardar"]'),
    enviar: (document.querySelector('[data-act="pz-enviar-ya"]')||{}).textContent };
  g.cerrarDlg();
  return { id, verTxt, enVista, enEditor, condGuardadas: g.presuDe(id).condiciones };
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
/* Cambiado a propósito el 25-10-2026: el pie del editor pasa a ser Ver, Crear,
   Enviar y Duplicar. «Emitir» sin mandar sigue existiendo, pero en la ficha,
   que es donde se va cuando se quiere cerrar la oferta y repasarla antes. */
paso('y el botón de mandar se llama «Enviar», que es lo que hace',
  nuevoBorrador.enEditor.enviar === 'Enviar', nuevoBorrador.enEditor.enviar);
/* Cambiado a propósito el 25-10-2026: el campo de texto «anexos» desaparece.
   Un anexo es un papel que se adjunta, no un párrafo, así que ahora el editor
   enseña los documentos adjuntos y lo que era texto vive en las condiciones. */
paso('ya no hay campo de subtítulo: el título es uno solo',
  nuevoBorrador.enEditor.subtitulo === false);
paso('y en su lugar el editor enseña los documentos adjuntos',
  nuevoBorrador.enEditor.adjuntos === true);
paso('las condiciones se guardan', /obra civil/.test(nuevoBorrador.condGuardadas || ''),
  nuevoBorrador.condGuardadas);

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
               condiciones:/obra civil/.test(valorado) },
    sinVal:{ precio:/40,00/.test(sinVal), total:/TOTAL/.test(sinVal),
             concepto:/Fotocélula/.test(sinVal) },
    resumen:{ concepto:/Fotocélula/.test(resumen), total:/TOTAL/.test(resumen) },
    pelado:{ condiciones:/obra civil/.test(pelado) },
  };
}, nuevoBorrador.id);
paso('el documento de un borrador sale marcado como BORRADOR',
  formatos.valorado.agua === true);
paso('el valorado lleva precios y condiciones',
  formatos.valorado.precio === true && formatos.valorado.condiciones === true);
paso('el formato sin valorar dice qué se hace, pero ni un precio',
  formatos.sinVal.concepto === true && formatos.sinVal.precio === false &&
  formatos.sinVal.total === false, JSON.stringify(formatos.sinVal));
paso('el resumen deja fuera el detalle y conserva el total',
  formatos.resumen.concepto === false && formatos.resumen.total === true,
  JSON.stringify(formatos.resumen));
paso('y si se quitan las condiciones, no salen', formatos.pelado.condiciones === false);

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
  g.S.presu.titulo = 'Instalación de cierre enrollable de aluminio en verde';
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
    tituloEnPapel: /cierre enrollable de aluminio en verde/.test(html),
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
/* Cambiado a propósito el 25-10-2026: título y subtítulo eran dos campos que
   acababan diciendo lo mismo. Queda uno, y es el que sale en el papel. */
paso('y el título, que es el que dice de qué va la oferta', comercial.tituloEnPapel === true);
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
   13. Mover, duplicar y no perder el sitio
   ================================================================
   Tres cosas que no se ven en una captura pero que deciden si la
   aplicación se usa o se abandona: que el orden del papel se pueda
   cambiar sin rehacer la línea, que una línea parecida se copie, y
   que al repintar no salte todo arriba. */
bloque('13. Orden de las líneas y el sitio');

const orden = await T(async () => {
  const g = window.__T;
  g.dlgPresupuesto(null, { cliente_id: g.S.clientes[0].id, titulo:'Orden de líneas' });
  await new Promise(r => setTimeout(r, 200));
  ['Uno','Dos','Tres'].forEach((n, i) => g.S.presu.lineas.push(
    { tipo:'material', descripcion:n, nombre:n, cantidad:1, unidad:'ud',
      precio:(i+1)*10, importe:(i+1)*10, coste:0 }));
  g.pintarPresupuesto();
  await new Promise(r => setTimeout(r, 200));
  const nombres = () => g.S.presu.lineas.map(l => l.nombre || l.descripcion);
  const inicial = nombres();
  /* La primera no se puede subir y la última no se puede bajar */
  const arribaTope = document.querySelector('[data-act="pz-subir"][data-i="0"]').disabled;
  const abajoTope = document.querySelector('[data-act="pz-bajar"][data-i="2"]').disabled;
  /* Se baja la primera */
  document.querySelector('[data-act="pz-bajar"][data-i="0"]').click();
  await new Promise(r => setTimeout(r, 200));
  const trasBajar = nombres();
  /* Se sube la última */
  document.querySelector('[data-act="pz-subir"][data-i="2"]').click();
  await new Promise(r => setTimeout(r, 200));
  const trasSubir = nombres();
  /* Y se duplica la primera */
  document.querySelector('[data-act="pz-duplicar-linea"][data-i="0"]').click();
  await new Promise(r => setTimeout(r, 200));
  const trasDuplicar = nombres();
  const copiaSinId = g.S.presu.lineas[1].id === undefined;
  g.cerrarDlg();
  return { inicial, arribaTope, abajoTope, trasBajar, trasSubir, trasDuplicar, copiaSinId };
});
paso('las flechas de los extremos están apagadas',
  orden.arribaTope === true && orden.abajoTope === true);
paso('bajar una línea la intercambia con la de debajo',
  orden.trasBajar.join(',') === 'Dos,Uno,Tres', orden.trasBajar.join(','));
paso('subir una línea la intercambia con la de encima',
  orden.trasSubir.join(',') === 'Dos,Tres,Uno', orden.trasSubir.join(','));
paso('duplicar deja la copia justo debajo',
  orden.trasDuplicar.join(',') === 'Dos,Dos,Tres,Uno', orden.trasDuplicar.join(','));
paso('y la copia es nueva, no la misma fila guardada otra vez',
  orden.copiaSinId === true);

const sitio = await T(async () => {
  const g = window.__T;
  /* Un presupuesto largo, para que el diálogo tenga que desplazarse */
  g.dlgPresupuesto(null, { cliente_id: g.S.clientes[0].id, titulo:'Presupuesto largo' });
  await new Promise(r => setTimeout(r, 200));
  for (let i = 0; i < 18; i++)
    g.S.presu.lineas.push({ tipo:'material', descripcion:'Línea '+i, nombre:'Línea '+i,
      cantidad:1, unidad:'ud', precio:10, importe:10, coste:0 });
  g.pintarPresupuesto();
  await new Promise(r => setTimeout(r, 250));
  const caja = document.getElementById('dlg');
  caja.scrollTop = 300;
  const antes = caja.scrollTop;
  /* Se pone el foco en un campo de abajo, como quien está escribiendo */
  const campo = document.querySelectorAll('.pz-l-cant')[12];
  campo.focus();
  const idFoco = campo.id || 'sin-id';
  /* Y se repinta, que es lo que pasaba al tocar cualquier cosa */
  g.pintarPresupuesto();
  await new Promise(r => setTimeout(r, 250));
  const despues = caja.scrollTop;
  const sigueAbierto = caja.open;
  /* Abrir OTRO diálogo distinto sí tiene que empezar por arriba */
  g.dlgDetalleLinea(0);
  await new Promise(r => setTimeout(r, 250));
  const enOtro = caja.scrollTop;
  g.cerrarDlg();
  return { antes, despues, sigueAbierto, enOtro, idFoco };
});
paso('el diálogo largo se puede desplazar', sitio.antes === 300, sitio.antes);
paso('y al repintarlo se queda donde estaba, no salta arriba',
  sitio.despues === sitio.antes, 'antes '+sitio.antes+', después '+sitio.despues);
paso('sin cerrarse ni parpadear', sitio.sigueAbierto === true);
paso('pero abrir otro diálogo distinto sí empieza por el principio',
  sitio.enOtro === 0, sitio.enOtro);

/* El caso que de verdad molesta: añadir material. Son TRES diálogos seguidos,
   el editor, el de elegir el material y el editor otra vez. Si el de vuelta
   empieza arriba, hay que buscar con el dedo la línea que se estaba
   rellenando, y eso en una oferta de veinte líneas es un suplicio. */
const ida = await T(async () => {
  const g = window.__T;
  g.dlgPresupuesto(null, { cliente_id: g.S.clientes[0].id, titulo:'Añadir material sin perder el sitio' });
  await new Promise(r => setTimeout(r, 200));
  for (let i = 0; i < 20; i++)
    g.S.presu.lineas.push({ tipo:'material', descripcion:'Pieza '+i, nombre:'Pieza '+i,
      cantidad:1, unidad:'ud', precio:10, importe:10, coste:0 });
  g.pintarPresupuesto();
  await new Promise(r => setTimeout(r, 250));
  const caja = document.getElementById('dlg');
  caja.scrollTop = 420;
  const antes = caja.scrollTop;

  /* Se pulsa «Añadir material» */
  document.querySelector('[data-act="pz-add"][data-tipo="material"]').click();
  await new Promise(r => setTimeout(r, 300));
  const enElegir = caja.scrollTop;
  const hayLista = !!document.getElementById('pl-art');

  /* Se elige uno y se acepta */
  document.getElementById('pl-art').value = 'art-foto';
  document.getElementById('pl-art').dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 150));
  document.getElementById('pl-desc').value = 'Fotocélula de espejo';
  document.getElementById('pl-cant').value = '2';
  document.getElementById('pl-prec').value = '40';
  document.querySelector('#dlg-form [type="submit"]').click();
  await new Promise(r => setTimeout(r, 400));

  const vuelta = caja.scrollTop;
  const lineas = g.S.presu.lineas.length;
  /* Y otra vez, con una línea de texto, que se añade sin diálogo de por medio */
  document.querySelector('[data-act="pz-add"][data-tipo="texto"]').click();
  await new Promise(r => setTimeout(r, 300));
  const trasManoObra = caja.scrollTop;
  g.cerrarDlg();
  /* Al cerrar del todo y volver a abrir, se empieza por el principio */
  g.dlgPresupuesto(null, { cliente_id: g.S.clientes[0].id, titulo:'Otra cualquiera' });
  await new Promise(r => setTimeout(r, 250));
  const alVolverAAbrir = caja.scrollTop;
  g.cerrarDlg();
  return { antes, enElegir, hayLista, vuelta, lineas, trasManoObra, alVolverAAbrir };
});
paso('el diálogo de elegir material se abre por el principio',
  ida.hayLista === true && ida.enElegir === 0, ida.enElegir);
paso('y al volver, el editor sigue donde estaba',
  ida.vuelta === ida.antes, 'antes '+ida.antes+', al volver '+ida.vuelta);
paso('con el material añadido', ida.lineas === 21, ida.lineas);
/* Cambiado a propósito el 25-10-2026: mano de obra ya no se añade de golpe,
   pregunta la tarifa, así que aquí sirve la línea de texto, que sí es directa. */
paso('y añadir una línea de texto tampoco mueve la pantalla',
  ida.trasManoObra === ida.antes, ida.trasManoObra);
paso('pero abrir otro presupuesto después sí empieza por el principio',
  ida.alVolverAAbrir === 0, ida.alVolverAAbrir);

/* ================================================================
   14. Los anexos son papeles
   ================================================================ */
bloque('14. Documentos adjuntos');

const adjuntos = await T(async () => {
  const g = window.__T;
  g.dlgPresupuesto(null, { cliente_id: g.S.clientes[0].id, titulo:'Oferta con ficha técnica' });
  await new Promise(r => setTimeout(r, 200));
  const sinGuardar = document.getElementById('dlg-form').innerText;
  g.S.presu.lineas.push({ tipo:'material', descripcion:'Puerta', nombre:'Puerta',
    cantidad:1, unidad:'ud', precio:1000, importe:1000, coste:600 });
  g.pintarPresupuesto();
  await new Promise(r => setTimeout(r, 150));
  await g.guardarPresupuesto(false);
  await new Promise(r => setTimeout(r, 700));
  const id = g.S.presu.id;

  const ficha = new File([new Uint8Array(2048)], 'ficha-tecnica.pdf', { type:'application/pdf' });
  const plano = new File([new Uint8Array(1024)], 'plano-obra.pdf', { type:'application/pdf' });
  await g.subirAdjuntos(id, [ficha, plano]);
  await new Promise(r => setTimeout(r, 500));
  const lista = g.adjuntosDe(id);
  /* El plano se marca como solo oficina */
  await g.sb.from('presupuesto_adjuntos').update({ publico:false })
    .eq('id', lista.find(x => x.nombre === 'plano-obra.pdf').id);
  await g.cargar();

  /* Se emite y se mira qué ve el cliente */
  g.dlgPresupuesto(id, null, true);
  await new Promise(r => setTimeout(r, 200));
  await g.guardarPresupuesto(true);
  await new Promise(r => setTimeout(r, 700));
  const p = g.presuDe(id);
  const { data: publico } = await g.sb.rpc('presupuesto_publico', { p_token: p.token });

  const abierto = [];
  const open0 = window.open;
  window.open = () => ({ document:{ write: t => abierto.push(t), close(){} } });
  g.documentoPresupuesto(id, { formato:'valorado', condiciones:true, anexos:true, qr:true });
  window.open = open0;
  const papel = abierto.join('');
  g.cerrarDlg();
  return { sinGuardar,
    nombres: lista.map(x => x.nombre).sort(),
    rutas: lista.map(x => x.ruta),
    bytes: (lista.find(x => x.nombre === 'ficha-tecnica.pdf')||{}).bytes,
    enPublico: (publico.adjuntos || []).map(x => x.nombre),
    enPapel: /Documentación adjunta/.test(papel) && /ficha-tecnica\.pdf/.test(papel),
    planoEnPapel: /plano-obra\.pdf/.test(papel),
    peso: g.pesoCorto(2048) };
});
paso('sin guardar el borrador todavía no se puede adjuntar, y lo dice',
  /Guarda el borrador/.test(adjuntos.sinGuardar));
paso('se pueden subir varios documentos de una vez',
  adjuntos.nombres.join(',') === 'ficha-tecnica.pdf,plano-obra.pdf', adjuntos.nombres.join(','));
paso('cada uno va a una ruta que no se puede adivinar',
  adjuntos.rutas.every(r => /\/[A-Z0-9]{12}\.pdf$/i.test(r)), adjuntos.rutas[0]);
paso('se guarda el tamaño, para avisar de un fichero enorme',
  adjuntos.bytes === 2048, adjuntos.bytes);
paso('el peso se enseña en claro', adjuntos.peso === '2 KB', adjuntos.peso);
paso('el cliente ve los documentos marcados como suyos',
  adjuntos.enPublico.join(',') === 'ficha-tecnica.pdf', adjuntos.enPublico.join(','));
paso('y NO ve el que se dejó para la oficina',
  !adjuntos.enPublico.includes('plano-obra.pdf'));
paso('el papel los lista, para que sepa qué se le ha mandado',
  adjuntos.enPapel === true);
paso('y el de oficina tampoco sale en el papel', adjuntos.planoEnPapel === false);

/* ================================================================
   15. Cuatro botones con nombre
   ================================================================
   Ver, Crear, Enviar y Duplicar. Cada uno hace una cosa y se llama
   igual en el editor y en la ficha, para no tener que aprender dos
   vocabularios según por dónde se entre. */
bloque('15. Ver, Crear, Enviar, Duplicar');

const botones = await T(async () => {
  const g = window.__T;
  g.dlgPresupuesto(null, { cliente_id: g.S.clientes[0].id, titulo:'Oferta de botones' });
  await new Promise(r => setTimeout(r, 250));
  const txtAct = act => { const e = document.querySelector('[data-act="'+act+'"]'); return e ? e.textContent.trim() : null; };
  const nuevo = { ver: txtAct('pz-ver-doc'), crear: txtAct('pz-guardar'),
    enviar: txtAct('pz-enviar-ya'), duplicar: txtAct('pz-duplicar-editor') };

  g.S.presu.lineas.push({ tipo:'material', descripcion:'Motor', nombre:'Motor',
    cantidad:1, unidad:'ud', precio:500, importe:500, coste:300 });
  g.pintarPresupuesto();
  await new Promise(r => setTimeout(r, 150));
  /* Crear: se guarda y sigue siendo borrador, sin mandarse */
  document.querySelector('[data-act="pz-guardar"]').click();
  await new Promise(r => setTimeout(r, 800));
  const id = g.S.presu.id;
  const trasCrear = { estado: g.presuDe(id).estado, enviado: !!g.presuDe(id).enviado_el };
  const guardado = { guardar: txtAct('pz-guardar'), duplicar: txtAct('pz-duplicar-editor') };

  /* Duplicar: sale una copia nueva, con las líneas y sin número */
  document.querySelector('[data-act="pz-duplicar-editor"]').click();
  await new Promise(r => setTimeout(r, 500));
  const copia = { id: g.S.presu.id, titulo: g.S.presu.titulo,
    lineas: g.S.presu.lineas.length, cliente: g.S.presu.cliente_id === g.S.clientes[0].id };

  /* Enviar: desde el editor cierra el presupuesto y pasa al envío */
  g.dlgPresupuesto(id, null, true);
  await new Promise(r => setTimeout(r, 250));
  const bot = document.querySelector('[data-act="pz-enviar-ya"]');
  bot.click();                                    // primero arma
  await new Promise(r => setTimeout(r, 150));
  const armado = bot.textContent.trim();
  bot.click();                                    // y confirma
  await new Promise(r => setTimeout(r, 900));
  const trasEnviar = { estado: g.presuDe(id).estado,
    ref: !!g.presuDe(id).referencia,
    enDialogo: !!document.getElementById('pd-formato') };
  g.cerrarDlg();
  return { nuevo, trasCrear, guardado, copia, armado, trasEnviar, id };
});
paso('en un presupuesto nuevo el botón dice «Crear»',
  botones.nuevo.crear === 'Crear', botones.nuevo.crear);
paso('y están Ver y Enviar',
  botones.nuevo.ver === 'Ver' && botones.nuevo.enviar === 'Enviar',
  JSON.stringify(botones.nuevo));
paso('todavía sin Duplicar, porque no hay nada que duplicar',
  botones.nuevo.duplicar === null);
paso('Crear lo deja guardado como borrador, sin mandar nada',
  botones.trasCrear.estado === 'borrador' && botones.trasCrear.enviado === false,
  JSON.stringify(botones.trasCrear));
paso('una vez guardado, el botón pasa a decir «Guardar» y aparece Duplicar',
  botones.guardado.guardar === 'Guardar' && botones.guardado.duplicar === 'Duplicar',
  JSON.stringify(botones.guardado));
paso('Duplicar abre una oferta nueva, sin número todavía',
  botones.copia.id === null, botones.copia.id);
paso('con el mismo cliente, las mismas líneas y el título marcado como copia',
  botones.copia.cliente === true && botones.copia.lineas === 1 &&
  /\(copia\)$/.test(botones.copia.titulo), botones.copia.titulo);
paso('Enviar avisa de que el presupuesto se cierra, y pide confirmación',
  /Confirmar/.test(botones.armado), botones.armado);
paso('al confirmar queda emitido, con su número',
  botones.trasEnviar.estado === 'emitido' && botones.trasEnviar.ref === true,
  JSON.stringify(botones.trasEnviar));
paso('y encadena con las opciones del documento antes de mandarlo',
  botones.trasEnviar.enDialogo === true);

const enFicha = await T(async (id) => {
  const g = window.__T;
  g.dlgPresupuesto(id);
  await new Promise(r => setTimeout(r, 250));
  const t = act => { const e = document.querySelector('[data-act="'+act+'"]'); return e ? e.textContent.trim() : null; };
  const r = { ver: t('pz-documento'), enviar: t('pz-enviar'), duplicar: t('pz-duplicar') };
  g.cerrarDlg();
  return r;
}, botones.id);
paso('la ficha usa las mismas palabras que el editor',
  enFicha.ver === 'Ver' && enFicha.enviar === 'Enviar' && enFicha.duplicar === 'Duplicar',
  JSON.stringify(enFicha));

/* ================================================================
   16. Tres manos de obra y tres rutas
   ================================================================
   Una hora en un chalet no se cobra como una hora en una nave, y
   salir al polígono de al lado no es salir a Jerez. */
bloque('16. Tarifas de mano de obra y rutas');

const tarifas = await T(async () => {
  const g = window.__T;
  /* Precios de las tres tarifas y de las tres rutas */
  Object.assign(g.S.tarifas, {
    precio_hora: 45, coste_hora: 22, minimo_horas: 1,
    precio_hora_particular: 48, precio_hora_retail: 55, precio_hora_industria: 62,
    ruta1_nombre:'El Puerto', ruta1_importe: 30, ruta1_coste: 9,
    ruta2_nombre:'Bahía',     ruta2_importe: 55, ruta2_coste: 20,
    ruta3_nombre:'Provincia', ruta3_importe: 90, ruta3_coste: 38,
    precio_km: 0.45, coste_km: 0.2 });
  const precios = g.TARIFAS_MO.map(x => [x[0], g.precioHoraDe(x[0])]);
  /* Una tarifa sin rellenar cae a la de referencia */
  const guardado = g.S.tarifas.precio_hora_retail;
  g.S.tarifas.precio_hora_retail = null;
  const caida = g.precioHoraDe('retail');
  g.S.tarifas.precio_hora_retail = guardado;
  /* El reparto por tipo de cliente */
  const cli = g.S.clientes[0];
  const antes = cli.tipo;
  const porTipo = {};
  ['Particular', 'Empresa de servicios', 'Industria', 'Administración'].forEach(t => {
    cli.tipo = t; porTipo[t] = g.tarifaMODe(cli.id);
  });
  cli.tipo = antes;
  return { precios, caida, porTipo,
    nombres: g.RUTAS.map(k => g.nombreRuta(k)),
    importes: g.RUTAS.map(k => g.importeRuta(k)),
    costes: g.RUTAS.map(k => g.costeRuta(k)),
    km20: g.importePorKm(20), km20coste: g.costePorKm(20), km0: g.importePorKm(0) };
});
paso('cada tarifa tiene su precio por hora',
  JSON.stringify(tarifas.precios) === JSON.stringify([['particular',48],['retail',55],['industria',62]]),
  JSON.stringify(tarifas.precios));
paso('y si una se queda sin rellenar, cobra el precio de referencia',
  tarifas.caida === 45, tarifas.caida);
paso('un particular va a la tarifa de particulares',
  tarifas.porTipo['Particular'] === 'particular');
paso('una empresa de servicios, a retail',
  tarifas.porTipo['Empresa de servicios'] === 'retail');
paso('industria y administración, a industria',
  tarifas.porTipo['Industria'] === 'industria' &&
  tarifas.porTipo['Administración'] === 'industria');
paso('las rutas llevan el nombre que se les ponga',
  tarifas.nombres.join(',') === 'El Puerto,Bahía,Provincia', tarifas.nombres.join(','));
paso('con su importe y su coste',
  tarifas.importes.join(',') === '30,55,90' && tarifas.costes.join(',') === '9,20,38');
paso('por kilómetros se cobra la ida y la vuelta',
  tarifas.km20 === 18, '20 km de ida → '+tarifas.km20+' € (20 × 2 × 0,45)');
paso('y cuesta también la ida y la vuelta',
  tarifas.km20coste === 8, tarifas.km20coste);
paso('sin kilómetros no hay importe', tarifas.km0 === 0);

const lineasTarifa = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  cli.tipo = 'Industria';
  g.dlgPresupuesto(null, { cliente_id: cli.id, titulo:'Nave con tres tarifas' });
  await new Promise(r => setTimeout(r, 250));

  /* Mano de obra: tiene que venir propuesta la de industria */
  document.querySelector('[data-act="pz-add"][data-tipo="mano_obra"]').click();
  await new Promise(r => setTimeout(r, 300));
  const propuesta = document.getElementById('mo-tarifa').value;
  const precioPuesto = document.getElementById('mo-precio').value;
  /* Se cambia a particulares: el precio tiene que bajar solo */
  const sel = document.getElementById('mo-tarifa');
  sel.value = 'particular'; sel.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 150));
  const trasCambiar = document.getElementById('mo-precio').value;
  /* Se vuelve a industria, 4 horas con un 10% de descuento */
  sel.value = 'industria'; sel.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 120));
  document.getElementById('mo-horas').value = '4';
  document.getElementById('mo-dto').value = '10';
  document.getElementById('mo-dto').dispatchEvent(new Event('input'));
  await new Promise(r => setTimeout(r, 120));
  const resumen = document.getElementById('mo-resumen').textContent;
  document.querySelector('#dlg-form [type="submit"]').click();
  await new Promise(r => setTimeout(r, 350));
  const mo = g.S.presu.lineas[g.S.presu.lineas.length - 1];

  /* Desplazamiento por kilómetros */
  document.querySelector('[data-act="pz-add"][data-tipo="desplazamiento"]').click();
  await new Promise(r => setTimeout(r, 300));
  const kmOculto = document.getElementById('de-caja-km').hidden;
  const selR = document.getElementById('de-ruta');
  const opciones = [...selR.options].map(o => o.text);
  selR.value = 'km'; selR.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 150));
  const kmVisible = !document.getElementById('de-caja-km').hidden;
  const sinKm = document.getElementById('de-resumen').textContent;
  document.getElementById('de-km').value = '35';
  document.getElementById('de-km').dispatchEvent(new Event('input'));
  await new Promise(r => setTimeout(r, 150));
  const conKm = document.getElementById('de-resumen').textContent;
  const descAuto = document.getElementById('de-desc').value;
  document.querySelector('#dlg-form [type="submit"]').click();
  await new Promise(r => setTimeout(r, 350));
  const de = g.S.presu.lineas[g.S.presu.lineas.length - 1];

  /* Y una ruta normal */
  document.querySelector('[data-act="pz-add"][data-tipo="desplazamiento"]').click();
  await new Promise(r => setTimeout(r, 300));
  const selR2 = document.getElementById('de-ruta');
  selR2.value = 'ruta2'; selR2.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 150));
  const descRuta = document.getElementById('de-desc').value;
  document.querySelector('#dlg-form [type="submit"]').click();
  await new Promise(r => setTimeout(r, 350));
  const r2 = g.S.presu.lineas[g.S.presu.lineas.length - 1];
  const tot = g.totalesPresu(g.S.presu.lineas, 0, 21);
  g.cerrarDlg();
  return { propuesta, precioPuesto, trasCambiar, resumen,
    mo: { v:mo.variante, c:mo.cantidad, p:mo.precio, d:mo.dto, i:mo.importe, co:mo.coste, det:mo.detalle },
    kmOculto, opciones, kmVisible, sinKm, conKm, descAuto,
    de: { v:de.variante, km:de.km, p:de.precio, i:de.importe, co:de.coste },
    r2: { v:r2.variante, p:r2.precio, co:r2.coste }, descRuta,
    mano_obra: tot.mano_obra, desplazamiento: tot.desplazamiento };
});
paso('a un cliente de industria se le propone la tarifa de industria',
  lineasTarifa.propuesta === 'industria' && lineasTarifa.precioPuesto === '62',
  lineasTarifa.propuesta+' a '+lineasTarifa.precioPuesto+' €');
paso('al cambiar de tarifa, el precio baja solo',
  lineasTarifa.trasCambiar === '48', lineasTarifa.trasCambiar);
paso('el resumen dice lo que deja antes de añadirla',
  /deja/.test(lineasTarifa.resumen), lineasTarifa.resumen);
paso('la línea guarda qué tarifa se usó, no solo el importe',
  lineasTarifa.mo.v === 'industria' && /Industria/.test(lineasTarifa.mo.det || ''),
  lineasTarifa.mo.v);
paso('4 horas a 62 con el 10% de descuento son 223,20',
  lineasTarifa.mo.i === 223.2, lineasTarifa.mo.i);
paso('y el coste de la hora es el mismo para las tres tarifas',
  lineasTarifa.mo.co === 22, lineasTarifa.mo.co);
paso('el desplazamiento ofrece las tres rutas por su nombre y el cobro por km',
  lineasTarifa.opciones.some(o => /El Puerto/.test(o)) &&
  lineasTarifa.opciones.some(o => /Bahía/.test(o)) &&
  lineasTarifa.opciones.some(o => /Provincia/.test(o)) &&
  lineasTarifa.opciones.some(o => /Por kilómetros/.test(o)),
  lineasTarifa.opciones.join(' | '));
paso('el campo de kilómetros solo aparece al elegir «Por kilómetros»',
  lineasTarifa.kmOculto === true && lineasTarifa.kmVisible === true);
paso('y hasta que no hay kilómetros, no hay importe',
  /Pon los kilómetros/.test(lineasTarifa.sinKm), lineasTarifa.sinKm);
paso('35 km de ida son 70 de ida y vuelta, a 0,45: 31,50 €',
  lineasTarifa.de.i === 31.5 && lineasTarifa.de.km === 35, lineasTarifa.conKm);
paso('con su coste real, no cero',
  lineasTarifa.de.co === 14, lineasTarifa.de.co);
paso('el concepto se rellena solo con el nombre de la zona',
  /Por kilómetros/.test(lineasTarifa.descAuto) && /Bahía/.test(lineasTarifa.descRuta),
  lineasTarifa.descRuta);
paso('una ruta normal trae su importe y su coste',
  lineasTarifa.r2.v === 'ruta2' && lineasTarifa.r2.p === 55 && lineasTarifa.r2.co === 20);
paso('y todo suma en el sitio que le toca',
  lineasTarifa.mano_obra === 223.2 && lineasTarifa.desplazamiento === 86.5,
  'mano de obra '+lineasTarifa.mano_obra+', desplazamiento '+lineasTarifa.desplazamiento);

/* ================================================================
   Final
   ================================================================ */
console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
