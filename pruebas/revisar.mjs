/* ================================================================
   revisar.mjs — revisar un parte, decidir si se factura, y cobrar.
                                                      27-11-2026

   DE DÓNDE SALE
   David, 27-11-2026:

     «Oficina debe de poder marcar los revisado (facturados etc) y
      pasarlos a otra sección dentro de realizados que diga cerrados.
      Y estos cerrados deben de poderse marcar como cobrados completo,
      cobrado parcial y o no cobrado por oficina.»

     «Yo incluiría en los partes realizados la decisión de mandar a
      facturar o no. Lo no facturado calculará sus márgenes igualmente
      con costes de personal y el material enviado a material roto
      dando de baja en almacén y calculando su coste, pero en apartado
      diferente.»

   Y eligió dos pasos (revisado y luego facturado) y el cobro parcial
   con importe.

   LO QUE SE VIGILA AQUÍ, Y POR QUÉ CADA COSA

     · Que Realizados se parta en las tres secciones y que cada parte
       esté en la suya. Es la pantalla que la oficina abre cada día.
     · Que el técnico NO vea nada de esto: ni secciones, ni botones de
       revisar o facturar. Él no revisa lo que ha hecho.
     · Que no se pueda decidir «no facturar» sin decir por qué: ese
       motivo es lo que explica el coste perdido del mes.
     · Que un parte no facturado SIGA contando su coste. Es lo que
       pidió David y es lo que hace que la decisión tenga consecuencia
       visible.
     · Y el cobro, que es donde es fácil equivocarse: lo cobrado lleva
       IVA y el importe de la visita es sin IVA. Si se comparan a pelo,
       una factura pagada entera sale «cobrada de más» y una pagada sin
       IVA sale «completa». Aquí se comprueba con números.
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
const ctx = await nav.newContext({ viewport:{width:1320,height:2600},
  locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    db.tarifas = [{ id:1, precio_hora:45, coste_hora:25, minimo_horas:1,
                    desplazamiento_fijo:30, precio_km:0.45, coste_km:0.2,
                    recargo_material:40, iva:21 }];
    const p = db.puertas[0];
    const base = { prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:p.cliente_id,
      puerta_id:p.id, ruta:'ruta1', estado:'cerrado' };
    const cuando = d => { const x = new Date(); x.setHours(12,0,0,0);
                          x.setDate(x.getDate() - d); return x.toISOString(); };
    /* Tres visitas cerradas, una para cada sección, y los importes sembrados a
       mano: la cuenta la hace el servidor y se prueba en SQL. Aquí se prueba la
       pantalla. 200 sin IVA son 242 con el 21 %. */
    [['rv-nueva', 2], ['rv-revisada', 5], ['rv-nofact', 8]].forEach(([id, d]) => {
      db.avisos.push(Object.assign({}, base, { id, tipo:'averia', subtipo:'averia',
        horas:2, descripcion:'No cerraba', trabajo:'Arreglado',
        cerrado:cuando(d), creado:cuando(d + 1), cerrado_por:'Juan el técnico' }));
      db.valoraciones.push({ aviso_id:id, imp_mano_obra:90, imp_desplazamiento:30,
        imp_materiales:80, imp_total:200, coste_total:125, margen:75, facturado:false,
        no_facturar:false });
    });
    /* La del medio ya está revisada, y la tercera ya está marcada como que no
       se factura: así las tres secciones nacen con una cada una. */
    db.valoraciones.find(v => v.aviso_id === 'rv-revisada').revisado_en = cuando(4);
    db.valoraciones.find(v => v.aviso_id === 'rv-revisada').revisado_por = 'Oficina';
    const nf = db.valoraciones.find(v => v.aviso_id === 'rv-nofact');
    nf.revisado_en = cuando(7); nf.revisado_por = 'Oficina';
    nf.no_facturar = true; nf.no_facturar_motivo = 'Cortesía por la avería repetida';
    nf.no_facturar_por = 'Oficina'; nf.no_facturar_en = cuando(7);
    /* Material en la que no se factura, para la cuenta del coste perdido */
    db.articulos.push({ id:'art-b', descripcion:'Banda de seguridad', unidad:'ud',
      coste:48, activo:true });
    db.catalogo = db.articulos;
    db.materiales.push({ id:'rv-mat', aviso_id:'rv-nofact', articulo_id:'art-b',
      descripcion:'Banda de seguridad', cantidad:1, coste:48, precio:67.2 });
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
   1. Las tres secciones de Realizados
   ================================================================ */
bloque('1. Por revisar, Cerrados y Partes eliminados');

const secciones = await T(async () => {
  const g = window.__T;
  g.S.tab = 'realizadas';
  g.pintar();
  await new Promise(r => setTimeout(r, 1200));
  const paneles = [...document.querySelectorAll('#vista .panel')]
    .filter(p => !p.classList.contains('eq-indice'));
  const titulos = paneles.map(p => {
    const t = p.querySelector('.panel-h h2, .panel-h h3');
    return t ? t.textContent.trim() : '';
  }).filter(Boolean);
  const dondeEsta = id => {
    const p = paneles.find(x => x.querySelector('[data-id="'+id+'"]'));
    if (!p) return '(en ninguna)';
    const t = p.querySelector('.panel-h h2, .panel-h h3');
    return t ? t.textContent.trim() : '(sin título)';
  };
  return { titulos,
    nueva: dondeEsta('rv-nueva'), revisada: dondeEsta('rv-revisada'),
    nofact: dondeEsta('rv-nofact'),
    texto: (document.getElementById('vista') || document.body).innerText };
});
paso('Realizados se parte en las tres secciones',
  secciones.titulos.indexOf('Por revisar') >= 0 &&
  secciones.titulos.indexOf('Cerrados') >= 0 &&
  secciones.titulos.indexOf('Partes eliminados') >= 0,
  secciones.titulos.join(' | '));
/* El orden importa: es el del trabajo, lo que acaba de llegar primero */
paso('y en ese orden, que es el del trabajo',
  secciones.titulos.indexOf('Por revisar') < secciones.titulos.indexOf('Cerrados') &&
  secciones.titulos.indexOf('Cerrados') < secciones.titulos.indexOf('Partes eliminados'));
paso('un parte recién cerrado está en «Por revisar»',
  secciones.nueva === 'Por revisar', secciones.nueva);
paso('uno revisado está en «Cerrados»', secciones.revisada === 'Cerrados', secciones.revisada);
paso('y uno que no se factura, en «Partes eliminados»',
  secciones.nofact === 'Partes eliminados', secciones.nofact);
/* El coste perdido, que es el número que importa de esa sección */
paso('la sección de eliminados dice el coste perdido, no el importe',
  /coste perdido/i.test(secciones.texto), (secciones.texto.match(/coste perdido[^\n]*/i)||[''])[0]);

/* ================================================================
   2. El técnico no revisa ni factura
   ================================================================ */
bloque('2. Lo que ve un técnico');

const comoTecnico = await T(async () => {
  const g = window.__T;
  const rolAntes = g.S.perfil.rol;
  g.S.perfil.rol = 'tecnico';
  const html = g.vistaRealizadas();
  g.S.perfil.rol = rolAntes;
  return { html, texto: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') };
});
paso('para el técnico no hay secciones: es una sola lista',
  !/Por revisar/.test(comoTecnico.texto) && !/Partes eliminados/.test(comoTecnico.texto));
paso('ni botón de revisar', !/data-act="revisar-parte"/.test(comoTecnico.html));
paso('ni de no facturar', !/data-act="no-facturar"/.test(comoTecnico.html));
paso('ni de apuntar la factura', !/data-act="marcar-facturado"/.test(comoTecnico.html));

/* ================================================================
   3. Revisar es un paso, y se ve
   ================================================================ */
bloque('3. Marcar revisado');

const revisa = await T(async () => {
  const g = window.__T;
  const antes = g.valoracionDe('rv-nueva') || {};
  const htmlAntes = g.tarjetaAviso(g.S.avisos.find(x => x.id === 'rv-nueva'));
  const b = document.querySelector('[data-act="revisar-parte"][data-id="rv-nueva"]');
  if (!b) return { sinBoton:true };
  b.click();
  await new Promise(r => setTimeout(r, 2000));
  const v = g.valoracionDe('rv-nueva') || {};
  const html = g.tarjetaAviso(g.S.avisos.find(x => x.id === 'rv-nueva'));
  return { antesRevisado: antes.revisado_en || null, chipAntes: /Por revisar/.test(htmlAntes),
    en: v.revisado_en || null, por: v.revisado_por || null,
    chip: /Revisado/.test(html), facturado: !!v.facturado };
});
paso('antes de revisar, la tarjeta lo dice: «Por revisar»',
  revisa.antesRevisado === null && revisa.chipAntes === true);
paso('un toque y queda revisado, con quién y cuándo',
  !!revisa.en && !!revisa.por, revisa.por+' · '+revisa.en);
paso('la tarjeta pasa a decir «Revisado»', revisa.chip === true);
/* Dos pasos, no uno: revisar no es facturar */
paso('y revisar NO la marca como facturada: son dos pasos',
  revisa.facturado === false);

/* ================================================================
   4. No facturar: con motivo, y el coste se queda
   ================================================================ */
bloque('4. La decisión de no facturar');

const noFact = await T(async () => {
  const g = window.__T;
  g.dlgNoFacturar('rv-nueva');
  await new Promise(r => setTimeout(r, 900));
  const txt = document.getElementById('dlg-form').innerText;
  /* Se intenta sin motivo */
  document.getElementById('nf-motivo').value = '';
  document.getElementById('dlg-form').dispatchEvent(
    new Event('submit', { bubbles:true, cancelable:true }));
  await new Promise(r => setTimeout(r, 800));
  const err = (document.querySelector('#dlg-form .err') || {}).textContent || '';
  const v1 = g.valoracionDe('rv-nueva') || {};
  /* Y ahora con motivo */
  document.getElementById('nf-motivo').value = 'Error nuestro: volvimos dos veces';
  document.getElementById('dlg-form').dispatchEvent(
    new Event('submit', { bubbles:true, cancelable:true }));
  await new Promise(r => setTimeout(r, 2200));
  const v = g.valoracionDe('rv-nueva') || {};
  return { txt, err, sinPonerse: v1.no_facturar !== true,
    no_facturar: v.no_facturar, motivo: v.no_facturar_motivo, por: v.no_facturar_por,
    coste: v.coste_total, total: v.imp_total };
});
paso('el diálogo dice lo que se deja de facturar y el coste que se queda la empresa',
  /Se deja de facturar/i.test(noFact.txt) && /Coste que se queda la empresa/i.test(noFact.txt));
paso('y avisa de que la visita no desaparece',
  /no desaparece/i.test(noFact.txt) && /Partes eliminados/.test(noFact.txt));
paso('sin motivo no se guarda', /Escribe por qué no se factura/.test(noFact.err),
  noFact.err.slice(0, 60));
paso('y no se ha marcado nada', noFact.sinPonerse === true);
paso('con motivo, queda marcada como que no se factura', noFact.no_facturar === true);
paso('con su motivo y quién lo decidió',
  /Error nuestro/.test(noFact.motivo || '') && !!noFact.por, noFact.por+' · '+noFact.motivo);
/* La que pidió David: el coste se sigue contando */
paso('y el COSTE se sigue contando: es dinero puesto que no se cobra',
  Number(noFact.coste) === 125, noFact.coste);

const vuelve = await T(async () => {
  const g = window.__T;
  g.S.tab = 'realizadas'; g.pintar();
  await new Promise(r => setTimeout(r, 1200));
  const b = document.querySelector('[data-act="si-facturar"][data-id="rv-nueva"]');
  if (!b) return { sinBoton:true };
  b.click(); await new Promise(r => setTimeout(r, 300));
  const pide = /Confirmar/i.test(b.textContent || '');
  b.click(); await new Promise(r => setTimeout(r, 2000));
  const v = g.valoracionDe('rv-nueva') || {};
  return { pide, no_facturar: v.no_facturar, motivo: v.no_facturar_motivo,
    sigueRevisada: !!v.revisado_en };
});
paso('se puede deshacer, y pide confirmación', vuelve.pide === true);
paso('al deshacerlo vuelve a estar para facturar', vuelve.no_facturar === false);
paso('sin dejar el motivo de antes colgado', vuelve.motivo == null, String(vuelve.motivo));
paso('y sigue revisada: deshacer el no facturar no desrevisa el parte',
  vuelve.sigueRevisada === true);

/* ================================================================
   5. El cobro: entero, a medias o nada
   ================================================================
   Aquí está la trampa de todo este cambio: lo que se le cobra al cliente lleva
   IVA, y el importe de la visita se guarda SIN IVA. Si se comparan a pelo, una
   factura pagada entera sale «cobrada de más» y una pagada sin IVA sale
   «completa». 200 sin IVA son 242 con el 21 %.
   ================================================================ */
bloque('5. Cobrada, a medias o sin cobrar');

const cobros = await T(async () => {
  const g = window.__T;
  const v = g.valoracionDe('rv-revisada');
  const prueba = (facturado, cobrado) => {
    v.facturado = facturado; v.cobrado_importe = cobrado; v.cobrado_el = cobrado != null ? '2026-11-20' : null;
    return { estado: g.estadoCobro(v), chip: g.chipCobro(v).replace(/<[^>]+>/g, '') };
  };
  const sinFacturar = prueba(false, null);
  const nada   = prueba(true, 0);
  const medias = prueba(true, 100);
  const entero = prueba(true, 242);
  const sinIva = prueba(true, 200);
  /* Y una factura de antes: cobrada marcada, sin importe */
  v.facturado = true; v.cobrado_importe = null; v.cobrado_el = '2026-10-01';
  const vieja = { estado: g.estadoCobro(v), chip: g.chipCobro(v).replace(/<[^>]+>/g, '') };
  const total = g.totalACobrar(v);
  return { sinFacturar, nada, medias, entero, sinIva, vieja, total };
});
paso('el total a cobrar es CON IVA: 200 sin IVA son 242',
  Number(cobros.total) === 242, cobros.total);
paso('una visita sin facturar no dice nada del cobro',
  cobros.sinFacturar.estado === 'sin' && cobros.sinFacturar.chip === '');
paso('facturada y sin cobrar nada: «Sin cobrar»',
  cobros.nada.estado === 'nada' && /Sin cobrar/.test(cobros.nada.chip), cobros.nada.chip);
paso('cobrados 100 de 242: cobrada a medias, y dice lo que falta',
  cobros.medias.estado === 'parcial' && /142,00/.test(cobros.medias.chip), cobros.medias.chip);
paso('cobrados los 242: cobrada', cobros.entero.estado === 'todo', cobros.entero.chip);
/* La que caza el error de comparar con y sin IVA */
paso('cobrados 200 (el importe SIN IVA) NO es cobrada del todo: faltan 42',
  cobros.sinIva.estado === 'parcial' && /42,00/.test(cobros.sinIva.chip), cobros.sinIva.chip);
paso('y una factura de antes, marcada cobrada y sin importe, cuenta como cobrada entera',
  cobros.vieja.estado === 'todo', cobros.vieja.chip);

/* Y que el cobro parcial se pueda guardar desde el diálogo de la factura */
const guardaParcial = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 250));
  const v = g.valoracionDe('rv-revisada');
  v.facturado = false; v.cobrado_importe = null; v.cobrado_el = null;
  g.dlgFacturar('rv-revisada');
  await new Promise(r => setTimeout(r, 900));
  const hay = !!document.getElementById('fa-cob-imp');
  document.getElementById('fa-ref').value = 'F-2026-200';
  const c = document.getElementById('fa-cob');
  c.checked = true; c.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 200));
  const imp = document.getElementById('fa-cob-imp');
  imp.value = '100';
  imp.dispatchEvent(new Event('input', { bubbles:true }));
  await new Promise(r => setTimeout(r, 200));
  const pista = (document.getElementById('fa-cob-falta') || {}).textContent || '';
  document.getElementById('dlg-form').dispatchEvent(
    new Event('submit', { bubbles:true, cancelable:true }));
  await new Promise(r => setTimeout(r, 2200));
  const vv = g.valoracionDe('rv-revisada') || {};
  g.cerrarDlg();
  return { hay, pista, cobrado: vv.cobrado_importe, facturado: vv.facturado,
    estado: g.estadoCobro(vv) };
});
paso('el diálogo de la factura pide cuánto se ha cobrado', guardaParcial.hay === true);
paso('y dice lo que falta mientras lo escribes',
  /faltan/i.test(guardaParcial.pista), guardaParcial.pista.slice(0, 60));
paso('se guarda lo cobrado', Number(guardaParcial.cobrado) === 100, guardaParcial.cobrado);
paso('y la factura queda como cobrada a medias',
  guardaParcial.estado === 'parcial', guardaParcial.estado);

/* ================================================================
   6. Los dos informes mensuales (27-11-2026)

   David: «se enviará mensualmente por correo al administrador [...]
   Pero en documentos diferentes y correos diferentes.»

   El correo lo arma y lo manda el servidor. Lo que se prueba aquí es
   la pantalla: que los dos botones estén, que solo los vea la
   administración, que pidan confirmación (es un correo, no se manda
   por tocar sin querer) y que cada uno pida SU informe con el mes que
   está elegido arriba.
   ================================================================ */
bloque('6. Los dos informes al administrador');

const informes = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 250));
  const rolAntes = g.S.perfil.rol;
  g.S.tab = 'gestion';
  g.S.mesGestion = '2026-11';
  g.pintar();
  await new Promise(r => setTimeout(r, 1200));
  const hayMargen = !!document.querySelector('[data-act="informe-margen"]');
  const hayElim = !!document.querySelector('[data-act="informe-eliminados"]');
  /* Un técnico no los ve */
  g.S.perfil.rol = 'tecnico';
  g.pintar();
  await new Promise(r => setTimeout(r, 900));
  const comoTecnico = !!document.querySelector('[data-act="informe-margen"]');
  /* Y la oficina tampoco: esto es de administración */
  g.S.perfil.rol = 'oficina';
  g.pintar();
  await new Promise(r => setTimeout(r, 900));
  const comoOficina = !!document.querySelector('[data-act="informe-margen"]');
  g.S.perfil.rol = rolAntes;
  g.pintar();
  await new Promise(r => setTimeout(r, 1000));
  /* Se pide el del margen: un toque pide confirmación, el segundo lo manda */
  const b1 = document.querySelector('[data-act="informe-margen"]');
  b1.click();
  await new Promise(r => setTimeout(r, 300));
  const pide = /Confirmar/i.test(b1.textContent || '');
  const aMedias = (window.__DB.__informes || []).length;
  b1.click();
  await new Promise(r => setTimeout(r, 1500));
  const b2 = document.querySelector('[data-act="informe-eliminados"]');
  b2.click(); await new Promise(r => setTimeout(r, 300));
  b2.click(); await new Promise(r => setTimeout(r, 1500));
  return { hayMargen, hayElim, comoTecnico, comoOficina, pide, aMedias,
    pedidos: window.__DB.__informes || [] };
});
paso('en Gestión están los dos botones', informes.hayMargen && informes.hayElim);
paso('un técnico no los ve', informes.comoTecnico === false);
paso('y la oficina tampoco: los números del año son de administración',
  informes.comoOficina === false);
paso('un toque no manda nada: pide confirmación',
  informes.pide === true && informes.aMedias === 0, informes.aMedias);
paso('con el segundo toque se piden los dos informes',
  informes.pedidos.length === 2, informes.pedidos.length);
paso('cada uno pide el suyo, y con el mes elegido arriba',
  informes.pedidos[0] && informes.pedidos[0].tipo === 'margen' &&
  informes.pedidos[0].mes === '2026-11' &&
  informes.pedidos[1] && informes.pedidos[1].tipo === 'eliminados' &&
  informes.pedidos[1].mes === '2026-11',
  JSON.stringify(informes.pedidos));

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
