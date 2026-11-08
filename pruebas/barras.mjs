/* ================================================================
   barras.mjs — el código de barras del fabricante y las peticiones
   de material a la oficina.                          08-11-2026

   POR QUÉ EXISTE
   David, al revisar el lector de códigos: «Hemos contemplado la
   creación de nuevo producto de almacén (desde oficina o calle) a
   través de la lectura del código del fabricante?». No se había
   contemplado. El técnico que se encontraba una caja desconocida
   escribía el material a mano y nadie en la oficina se enteraba.

   DECISIONES DE DAVID, 08-11-2026
     · el catálogo lo gobierna la OFICINA: el técnico no crea
       artículos, avisa;
     · lo que manda el técnico lleva tres cosas obligatorias:
       descripción, unidad y FOTO DE LA CAJA;
     · el mismo camino sirve leyendo el código o escribiendo a mano.

   LO QUE SE VIGILA AQUÍ
     · que el lector lea de verdad EAN-13, EAN-8, UPC-A y Code 128
       desde un fotograma, con códigos dibujados fuera de la
       aplicación y con el aval de OpenCV donde lo hay;
     · que doce cifras y trece sean el MISMO código, que es lo que
       evita que una caja dé de alta dos artículos;
     · que una caja conocida meta el material en el parte sola;
     · que una caja desconocida lleve a pedir el alta, con el código
       ya puesto, y NO cree ningún artículo;
     · que la petición no salga sin foto ni sin descripción;
     · que al mandarla se apunte igual la línea en el parte: lo
       gastado se apunta hoy, no cuando la oficina conteste;
     · que la oficina pueda resolverla de las dos maneras, creando o
       diciendo que ya existía, y que las dos queden escritas;
     · y que el técnico NO vea el panel de la oficina.
   ================================================================ */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const AQUI = dirname(fileURLToPath(import.meta.url));
const URL_APP = process.env.ARIZA_URL || 'http://127.0.0.1:8899/index.html';
const CASOS = JSON.parse(readFileSync(join(AQUI, 'casos-barras.json'), 'utf8'));
const ajustes = JSON.parse(readFileSync(join(AQUI, 'ajustes.json'), 'utf8'));

const ENV = { ...process.env, LANG:'es_ES.UTF-8', LANGUAGE:'es_ES:es', LC_ALL:'es_ES.UTF-8' };
const nav = await chromium.launch({ env: ENV, args: ['--lang=es-ES'] });
const ctx = await nav.newContext({ viewport:{width:1320,height:2200},
  locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    /* Un catálogo con lo que importa: uno con el código de barras de la caja,
       uno con el mismo código escrito de otra forma para ver que no se
       duplica, y uno sin código, que es como está la mayoría del catálogo. */
    db.articulos.push(
      { id:'art-banda', descripcion:'Banda de seguridad resistiva 2 m', unidad:'ud',
        familia:'Seguridad', marca:'ASO', codigo:'MAT-0012', token:'A3K9',
        ean:'8412345678905', activo:true },
      { id:'art-foto', descripcion:'Fotocélula de espejo', unidad:'ud',
        familia:'Seguridad', marca:'Erreka', codigo:'MAT-0007', token:'B4L0', activo:true },
      { id:'art-upc', descripcion:'Grasa de guías', unidad:'ud',
        codigo:'MAT-0030', token:'C5M1', ean:'0036000291452', activo:true });
    db.catalogo = db.articulos;
    db.avisos.push({ id:'ba-1', tipo:'averia', subtipo:'averia', estado:'asignado',
      prioridad:'normal', tecnico_id:'usuario-admin',
      cliente_id: db.puertas[0].cliente_id, puerta_id: db.puertas[0].id,
      descripcion:'No cierra del todo', creado:new Date().toISOString(),
      fecha_prevista:new Date().toISOString().slice(0,10) });
  };
});
const errores = [];
/* La letra de Google no se puede descargar desde donde corren las pruebas, y
   eso no es un fallo de la aplicación: tiene letras de respaldo. */
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
   1. El lector lee los códigos de las cajas
   ================================================================ */
bloque('1. Lee el código de barras de la caja');

const leerCaso = png => T(async b64 => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej;
    img.src = 'data:image/png;base64,' + b64; });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, c.width, c.height).data;
  const lum = new Uint8Array(c.width * c.height);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4)
    lum[i] = (d[j]*77 + d[j+1]*151 + d[j+2]*28) >> 8;
  const t0 = performance.now();
  const r = window.ARIZA_BARRAS.leer(lum, c.width, c.height);
  return { texto: r ? r.texto : null, tipo: r ? r.tipo : null,
           ms: Math.round(performance.now() - t0) };
}, png);

const tiempos = [];
for (const c of CASOS) {
  const r = await leerCaso(c.png);
  tiempos.push(r.ms);
  paso(c.nota + (c.opencv ? '' : ' (sin aval de OpenCV)'),
    r.texto === c.texto && r.tipo === c.tipo,
    (r.texto === null ? '(no ha leído)' : r.texto + ' · ' + r.tipo));
}
paso('y lo hace lo bastante rápido para leer en vivo',
  Math.max(...tiempos) < 400, 'el más lento '+Math.max(...tiempos)+' ms');

bloque('2. Doce cifras y trece son el mismo código');
const mismo = await T(() => {
  const g = window.__T;
  return {
    doceTrece: g.codigoBarrasIgual('036000291452', '0036000291452'),
    conAdornos: g.codigoBarrasIgual(' 8412-345678905 ', '8412345678905'),
    distintos: g.codigoBarrasIgual('8412345678905', '4006381333931'),
    vacio: g.codigoBarrasIgual('', '8412345678905'),
    limpia: g.soloCodigo(' 841-2345 678905 '),
  };
});
paso('un UPC-A de doce cifras es el mismo código que el EAN-13 que empieza por cero',
  mismo.doceTrece === true);
paso('y da igual que venga con espacios o guiones', mismo.conAdornos === true);
paso('dos códigos distintos no se confunden', mismo.distintos === false);
paso('y un código vacío no es igual a nada', mismo.vacio === false);
paso('el código se limpia de adornos', mismo.limpia === '8412345678905', mismo.limpia);

/* ================================================================
   3. Una caja que está en el catálogo entra sola
   ================================================================ */
bloque('3. La caja conocida se reconoce');

const conocida = await T(async () => {
  const g = window.__T;
  g.S.tab = 'campo'; g.pintar();
  await new Promise(r => setTimeout(r, 300));
  g.dlgCierre('ba-1');
  await new Promise(r => setTimeout(r, 1500));
  const antes = document.querySelectorAll('#mats .mat-fila').length;
  const metido = g.usarCodigoBarras('8412345678905', 'EAN-13');
  await new Promise(r => setTimeout(r, 300));
  const filas = [...document.querySelectorAll('#mats .mat-fila')];
  const fila = filas.find(f => { const s = f.querySelector('.mat-art'); return s && s.value === 'art-banda'; });
  /* la misma caja otra vez: suma, no repite línea */
  g.usarCodigoBarras('8412345678905', 'EAN-13');
  await new Promise(r => setTimeout(r, 300));
  const fila2 = [...document.querySelectorAll('#mats .mat-fila')]
    .find(f => { const s = f.querySelector('.mat-art'); return s && s.value === 'art-banda'; });
  /* y el UPC-A leído con DOCE cifras tiene que encontrar el que está guardado
     con trece: es el caso que duplicaría el catálogo si no se normalizara */
  const upc = g.usarCodigoBarras('036000291452', 'UPC-A');
  await new Promise(r => setTimeout(r, 300));
  const filaUpc = [...document.querySelectorAll('#mats .mat-fila')]
    .find(f => { const s = f.querySelector('.mat-art'); return s && s.value === 'art-upc'; });
  return { metido, antes, desc: fila ? fila.querySelector('.mat-desc').value : null,
           cant: fila2 ? fila2.querySelector('.mat-cant').value : null,
           upc, upcDesc: filaUpc ? filaUpc.querySelector('.mat-desc').value : null,
           peticiones: (g.S.peticiones || []).length };
});
paso('leer una caja del catálogo mete el material en el parte', conocida.metido === true);
paso('con la descripción del catálogo', conocida.desc === 'Banda de seguridad resistiva 2 m', conocida.desc);
paso('y leerla dos veces suma unidades, no repite línea', String(conocida.cant) === '2', conocida.cant);
paso('un UPC-A leído con doce cifras encuentra el material guardado con trece',
  conocida.upc === true && conocida.upcDesc === 'Grasa de guías', conocida.upcDesc);
paso('y nada de esto ha creado ninguna petición', conocida.peticiones === 0, conocida.peticiones);

/* ================================================================
   4. Una caja desconocida lleva a pedir el alta
   ================================================================ */
bloque('4. La caja desconocida se le pide a la oficina');

const desconocida = await T(async () => {
  const g = window.__T;
  const artsAntes = (g.S.catalogo || []).length;
  g.usarCodigoBarras('4006381333931', 'EAN-13');
  await new Promise(r => setTimeout(r, 500));
  const abierto = !!document.getElementById('pm-desc');
  const texto = (document.getElementById('dlg-form') || {}).textContent || '';
  return { abierto, texto,
           tieneCodigo: /4006381333931/.test(texto),
           pideFoto: !!document.getElementById('pm-foto'),
           artsAntes, artsAhora: (g.S.catalogo || []).length };
});
paso('leer una caja que no está en el catálogo abre la petición a la oficina',
  desconocida.abierto === true);
paso('con el código de barras ya puesto, para no teclearlo',
  desconocida.tieneCodigo === true);
paso('y pidiendo la foto de la caja', desconocida.pideFoto === true);
paso('el técnico NO ha creado ningún artículo del catálogo',
  desconocida.artsAhora === desconocida.artsAntes,
  desconocida.artsAntes + ' → ' + desconocida.artsAhora);

const sinFoto = await T(async () => {
  const g = window.__T;
  const d = document.getElementById('pm-desc');
  if (d) d.value = 'Banda de otro proveedor, 2,5 m';
  await g.mandarPeticionMaterial();
  await new Promise(r => setTimeout(r, 400));
  return { err: (document.getElementById('pm-err') || {}).textContent || '',
           sigueAbierto: !!document.getElementById('pm-desc'),
           peticiones: (g.S.peticiones || []).length };
});
paso('sin la foto de la caja no se manda', /foto de la caja/i.test(sinFoto.err), sinFoto.err);
paso('y la petición no se ha creado', sinFoto.peticiones === 0, sinFoto.peticiones);

const sinDesc = await T(async () => {
  const g = window.__T;
  const d = document.getElementById('pm-desc');
  if (d) d.value = 'ab';
  await g.mandarPeticionMaterial();
  await new Promise(r => setTimeout(r, 400));
  return (document.getElementById('pm-err') || {}).textContent || '';
});
paso('y sin decir qué es, tampoco', /Escribe qué es/i.test(sinDesc), sinDesc);

/* La foto se pone como la pondría el técnico: eligiendo un fichero */
const conFoto = await T(async () => {
  const g = window.__T;
  const d = document.getElementById('pm-desc');
  if (d) d.value = 'Banda de otro proveedor, 2,5 m';
  /* un PNG mínimo de verdad, como el que saldría de la cámara */
  const lienzo = document.createElement('canvas');
  lienzo.width = 40; lienzo.height = 30;
  const cx = lienzo.getContext('2d');
  cx.fillStyle = '#ccc'; cx.fillRect(0, 0, 40, 30);
  const blob = await new Promise(r => lienzo.toBlob(r, 'image/png'));
  const f = new File([blob], 'caja.png', { type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(f);
  document.getElementById('pm-foto').files = dt.files;
  await g.mandarPeticionMaterial();
  await new Promise(r => setTimeout(r, 1500));
  const p = (g.S.peticiones || [])[0] || null;
  const filas = [...document.querySelectorAll('#mats .mat-fila')];
  const aMano = filas.find(f2 => {
    const s = f2.querySelector('.mat-art'), de = f2.querySelector('.mat-desc');
    return (!s || !s.value) && de && /otro proveedor/.test(de.value);
  });
  return { n: (g.S.peticiones || []).length,
           desc: p ? p.descripcion : null, ean: p ? p.ean : null,
           foto: p ? p.foto_ruta : null, aviso: p ? p.aviso_id : null,
           estado: p ? p.estado : null,
           parteSigueAbierto: !!document.getElementById('mats'),
           enElParte: !!aMano };
});
paso('con la foto puesta, la petición se manda', conFoto.n === 1, conFoto.n);
paso('y lleva lo que escribió el técnico', conFoto.desc === 'Banda de otro proveedor, 2,5 m', conFoto.desc);
paso('el código de barras que leyó', conFoto.ean === '4006381333931', conFoto.ean);
paso('la foto de la caja, guardada en su carpeta', /^peticiones\//.test(conFoto.foto || ''), conFoto.foto);
paso('y de qué visita venía', conFoto.aviso === 'ba-1', conFoto.aviso);
paso('nace pendiente, que la resuelve la oficina', conFoto.estado === 'pendiente', conFoto.estado);
paso('LO GASTADO SE APUNTA HOY: la línea queda en el parte, escrita a mano',
  conFoto.enElParte === true);
paso('y EL PARTE NO SE HA CERRADO: pedir material no se lleva lo que llevabas escrito',
  conFoto.parteSigueAbierto === true);

/* ================================================================
   5. El aviso de que eso ya existe con otro nombre
   ================================================================ */
bloque('5. Antes de pedir, se avisa si ya existe');

const parecido = await T(async () => {
  const g = window.__T;
  g.dlgPeticionMaterial({ avisoId: 'ba-1' });
  await new Promise(r => setTimeout(r, 400));
  document.getElementById('pm-desc').value = 'Fotocélula de espejo';
  const lienzo = document.createElement('canvas');
  lienzo.width = 20; lienzo.height = 20;
  const blob = await new Promise(r => lienzo.toBlob(r, 'image/png'));
  const dt = new DataTransfer();
  dt.items.add(new File([blob], 'c.png', { type: 'image/png' }));
  document.getElementById('pm-foto').files = dt.files;
  await g.mandarPeticionMaterial();
  await new Promise(r => setTimeout(r, 600));
  const err = (document.getElementById('pm-err') || {}).textContent || '';
  const n1 = (g.S.peticiones || []).length;
  /* y si de verdad es otra cosa, insistiendo sí entra */
  await g.mandarPeticionMaterial();
  await new Promise(r => setTimeout(r, 1500));
  return { err, n1, n2: (g.S.peticiones || []).length };
});
paso('si ya hay algo que se llama igual, se avisa antes de mandarlo',
  /ya hay/i.test(parecido.err) && /Fotocélula de espejo/.test(parecido.err), parecido.err);
paso('y no se manda a la primera', parecido.n1 === 1, parecido.n1);
paso('pero insistiendo sí, porque puede ser otra cosa de verdad', parecido.n2 === 2, parecido.n2);

/* ================================================================
   6. La oficina las resuelve
   ================================================================ */
bloque('6. La oficina resuelve las peticiones');

const panel = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  g.S.tab = 'almacen'; g.pintar();
  await new Promise(r => setTimeout(r, 600));
  const h = document.querySelector('.stack') ? document.querySelector('.stack').textContent : '';
  return { pinta: /Material que piden los t/i.test(h),
           cuenta: /2 sin resolver/.test(h),
           verCaja: !!document.querySelector('[data-act="pet-foto"]'),
           crear: !!document.querySelector('[data-act="pet-crear"]'),
           atar: !!document.querySelector('[data-act="pet-atar"]'),
           pendientes: g.peticionesPendientes().length };
});
paso('el almacén enseña el material que piden los técnicos', panel.pinta === true);
paso('y cuántas hay sin resolver', panel.cuenta === true);
paso('con la foto de la caja a un clic', panel.verCaja === true);
paso('y las dos salidas: darlo de alta o decir que ya lo tenemos',
  panel.crear === true && panel.atar === true);
paso('la cuenta de pendientes cuadra', panel.pendientes === 2, panel.pendientes);

const atar = await T(async () => {
  const g = window.__T;
  /* se resuelve la de la fotocélula diciendo que ya existe */
  const p = g.peticionesPendientes().find(x => /Fotocélula/.test(x.descripcion));
  document.querySelector('[data-act="pet-atar"][data-id="'+p.id+'"]').click();
  await new Promise(r => setTimeout(r, 500));
  const sel = document.getElementById('pa-art');
  const hay = !!sel;
  if (hay) sel.value = 'art-foto';
  document.querySelector('#dlg-form [type=submit]').click();
  await new Promise(r => setTimeout(r, 1500));
  const ya = (g.S.peticiones || []).find(x => x.id === p.id);
  const art = (g.S.catalogo || []).find(x => x.id === 'art-foto');
  return { hay, estado: ya ? ya.estado : null, atado: ya ? ya.articulo_id : null,
           nota: ya ? ya.nota : null, eanPuesto: art ? art.ean : null,
           pendientes: g.peticionesPendientes().length };
});
paso('«ya lo tenemos» deja elegir el material del catálogo', atar.hay === true);
paso('la petición queda resuelta y atada a ese material',
  atar.estado === 'resuelta' && atar.atado === 'art-foto', atar.estado+' · '+atar.atado);
paso('con la razón escrita', /ya estaba/i.test(atar.nota || ''), atar.nota);
paso('y queda una pendiente', atar.pendientes === 1, atar.pendientes);

const crear = await T(async () => {
  const g = window.__T;
  const p = g.peticionesPendientes()[0];
  document.querySelector('[data-act="pet-crear"][data-id="'+p.id+'"]').click();
  await new Promise(r => setTimeout(r, 600));
  const desc = (document.getElementById('x-desc') || {}).value;
  const ean = (document.getElementById('x-ean') || {}).value;
  const uni = (document.getElementById('x-uni') || {}).value;
  document.querySelector('#dlg-form [type=submit]').click();
  await new Promise(r => setTimeout(r, 1800));
  const ya = (g.S.peticiones || []).find(x => x.id === p.id);
  const nuevo = (g.S.catalogo || []).find(x => x.descripcion === p.descripcion);
  return { desc, ean, uni, estado: ya ? ya.estado : null,
           atado: ya && nuevo ? ya.articulo_id === nuevo.id : false,
           eanDelNuevo: nuevo ? nuevo.ean : null,
           pendientes: g.peticionesPendientes().length };
});
paso('«darlo de alta» abre el alta con lo que escribió el técnico', crear.desc === 'Banda de otro proveedor, 2,5 m', crear.desc);
paso('y con el código de barras que leyó, sin teclearlo', crear.ean === '4006381333931', crear.ean);
paso('y su unidad', crear.uni === 'ud', crear.uni);
paso('al guardarlo, la petición queda resuelta', crear.estado === 'resuelta', crear.estado);
paso('y atada al artículo nuevo', crear.atado === true);
paso('el artículo nuevo nace con el código de barras puesto: la próxima caja se reconoce sola',
  crear.eanDelNuevo === '4006381333931', crear.eanDelNuevo);
paso('y no queda ninguna pendiente', crear.pendientes === 0, crear.pendientes);

bloque('7. Descartar, con su motivo');
const descartar = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  const { data } = await g.sb.from('peticiones_material').insert({
    aviso_id:'ba-1', descripcion:'Material que resultó de otra obra', unidad:'ud',
    foto_ruta:'peticiones/x.png', estado:'pendiente' }).select('id').single();
  await g.cargar(); g.pintar();
  await new Promise(r => setTimeout(r, 500));
  const id = data ? data.id : g.peticionesPendientes()[0].id;
  document.querySelector('[data-act="pet-descartar"][data-id="'+id+'"]').click();
  await new Promise(r => setTimeout(r, 500));
  document.querySelector('#dlg-form [type=submit]').click();
  await new Promise(r => setTimeout(r, 400));
  const err = (document.querySelector('#dlg-form .err') || {}).textContent || '';
  document.getElementById('pd-nota').value = 'No era material nuestro';
  document.querySelector('#dlg-form [type=submit]').click();
  await new Promise(r => setTimeout(r, 1500));
  const ya = (g.S.peticiones || []).find(x => x.id === id);
  return { err, estado: ya ? ya.estado : null, nota: ya ? ya.nota : null,
           atado: ya ? ya.articulo_id : 'x' };
});
paso('descartar sin motivo no se puede', /por qué/i.test(descartar.err), descartar.err);
paso('con el motivo puesto, se descarta', descartar.estado === 'descartada', descartar.estado);
paso('y el motivo queda escrito', /No era material nuestro/.test(descartar.nota || ''), descartar.nota);
paso('una descartada no se ata a ningún material', !descartar.atado, descartar.atado);

bloque('8. El técnico no gobierna el catálogo');
const tecnico = await T(async () => {
  const g = window.__T;
  const antes = g.S.perfil ? g.S.perfil.rol : null;
  if (g.S.perfil) g.S.perfil.rol = 'tecnico';
  const h = g.panelPeticiones();
  if (g.S.perfil) g.S.perfil.rol = antes;
  return { vacio: h === '', antes };
});
paso('el panel de peticiones es solo de la oficina', tecnico.vacio === true);

console.log('\n'+ok+' bien, '+mal+' mal.');
if (errores.length){ console.log('Errores de JavaScript:'); errores.forEach(e => console.log('   '+e)); }
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || errores.length ? 1 : 0);
