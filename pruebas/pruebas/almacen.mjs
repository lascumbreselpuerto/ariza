/* ================================================================
   almacen.mjs — el almacén de materiales.

   Tres ideas que esta suite vigila, porque si se rompe una el
   almacén empieza a mentir y ya no se vuelve a fiar nadie:

     1. Una existencia es una cantidad EN un sitio. La nave y la
        furgoneta de cada técnico son sitios distintos.
     2. Las existencias no se guardan: se suman de los movimientos.
        Lo que hay y por qué hay eso no se pueden separar.
     3. El QR es de un producto, no de una unidad: se escanea, se
        dice si entra o sale, y cuánto.

   Y lo que más importa del enganche con el parte: lo gastado se
   descuenta AL CERRAR la visita, una sola vez, aunque se guarde el
   avance diez veces o se reabra y se vuelva a cerrar.
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
    /* Un almacén pequeño pero con los casos que importan: uno con mínimo y
       referencia, otro sin existencias, y uno de antes del almacén, sin
       código ni QR, que es lo que habrá de verdad en el catálogo viejo. */
    const arts = [
      { id:'art-banda', descripcion:'Banda de seguridad resistiva 2 m', unidad:'ud',
        familia:'Seguridad', marca:'ASO', referencia:'Sentir 45.25', proveedor:'Suministros Gaditanos',
        minimo:2, codigo:'MAT-0001', token:'A3K9', activo:true },
      { id:'art-foto', descripcion:'Fotocélula de espejo', unidad:'ud', familia:'Seguridad',
        marca:'Erreka', referencia:'FT-20', proveedor:'Erreka', minimo:1,
        codigo:'MAT-0002', token:'B4L0', activo:true },
      { id:'art-viejo', descripcion:'Tornillería variada', unidad:'kg', activo:true },
    ];
    db.articulos.push(...arts);
    db.catalogo = db.articulos;
    db.avisos.push({ id:'av-alm', tipo:'averia', estado:'asignado', prioridad:'normal',
      tecnico_id:'usuario-admin', puerta_id: db.puertas[0].id, cliente_id: db.puertas[0].cliente_id,
      descripcion:'No cierra del todo', creado:new Date().toISOString(),
      fecha_prevista:new Date().toISOString().slice(0,10) });
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
   1. Entradas, salidas y traspasos
   ================================================================ */
bloque('1. Lo que hay es la suma de lo que ha pasado');

const base = await T(async () => {
  const g = window.__T;
  const nave = g.laNave();
  await g.moverMaterial({ articulo_id:'art-banda', cantidad:10, hasta:nave.id, motivo:'compra' });
  await g.cargar();
  const tras10 = g.existenciasDe('art-banda');
  const fur = await g.asegurarFurgoneta(g.S.perfil.id);
  await g.moverMaterial({ articulo_id:'art-banda', cantidad:3, desde:nave.id, hasta:fur.id, motivo:'traspaso' });
  await g.cargar();
  const trasTraspaso = g.existenciasDe('art-banda');
  await g.moverMaterial({ articulo_id:'art-banda', cantidad:1, desde:fur.id, motivo:'obra' });
  await g.cargar();
  return { nave:nave.nombre, fur:fur.nombre, tras10, trasTraspaso,
           trasGasto: g.existenciasDe('art-banda'),
           enNave: g.hayEn('art-banda', nave.id), enFur: g.hayEn('art-banda', fur.id),
           nMov: g.S.movimientos.filter(m => m.articulo_id === 'art-banda').length };
});
paso('una entrada deja el material en la nave',
  base.tras10.total === 10 && base.tras10.enNave === 10, JSON.stringify(base.tras10.porSitio));
paso('la furgoneta del técnico se crea sola la primera vez',
  /Furgoneta/.test(base.fur), base.fur);
paso('un traspaso no cambia el total, solo el sitio',
  base.trasTraspaso.total === 10 && base.trasTraspaso.enNave === 7 && base.trasTraspaso.enMiFurgoneta === 3,
  JSON.stringify(base.trasTraspaso.porSitio));
paso('gastar en obra sí baja el total',
  base.trasGasto.total === 9 && base.trasGasto.enMiFurgoneta === 2, base.trasGasto.total);
paso('y queda el rastro de los tres movimientos', base.nMov === 3, base.nMov);

const ajuste = await T(async () => {
  const g = window.__T;
  const nave = g.laNave();
  await g.moverMaterial({ articulo_id:'art-banda', cantidad:2, desde:nave.id, motivo:'ajuste',
    nota:'Recuento: faltaban dos' });
  await g.cargar();
  return g.existenciasDe('art-banda');
});
paso('un ajuste de inventario a la baja descuenta', ajuste.enNave === 5, ajuste.enNave);

const malos = await T(async () => {
  const g = window.__T;
  const out = {};
  const prueba = async (o, clave) => { try { await g.moverMaterial(o); out[clave] = 'pasó'; }
                                       catch(e){ out[clave] = e.message; } };
  await prueba({ articulo_id:'art-banda', cantidad:0, hasta:g.laNave().id }, 'cero');
  await prueba({ articulo_id:'art-banda', cantidad:5 }, 'sinSitio');
  await prueba({ cantidad:5, hasta:g.laNave().id }, 'sinMaterial');
  return out;
});
paso('no se puede mover cantidad cero', /mayor que cero/.test(malos.cero), malos.cero);
paso('ni mover algo que no viene ni va a ningún sitio',
  /algún sitio/.test(malos.sinSitio), malos.sinSitio);
paso('ni mover un material que no es ninguno',
  /Falta el material/.test(malos.sinMaterial), malos.sinMaterial);

/* ================================================================
   2. Lo que falta
   ================================================================ */
bloque('2. Lo que hay que comprar');

const minimos = await T(() => {
  const g = window.__T;
  return { banda: g.bajoMinimo(g.articuloDe('art-banda')),
           foto:  g.bajoMinimo(g.articuloDe('art-foto')),
           viejo: g.bajoMinimo(g.articuloDe('art-viejo')),
           texto: (() => { g.S.tab='almacen'; return g.vistaAlmacen(); })() };
});
paso('con existencias por encima del mínimo, no falta', minimos.banda === false);
paso('a cero y con mínimo puesto, falta', minimos.foto === true);
paso('sin mínimo puesto no se inventa ninguno', minimos.viejo === false);
paso('la pantalla lo dice arriba, sin tener que buscarlo',
  /por debajo del mínimo/.test(minimos.texto));

/* ================================================================
   3. El QR
   ================================================================ */
bloque('3. La etiqueta QR del material');

const qr = await T(() => {
  const g = window.__T;
  const a = g.articuloDe('art-banda');
  return { enlace: g.enlaceMaterial(a),
           viejo: g.enlaceMaterial(g.articuloDe('art-viejo')),
           hoja: typeof g.hojaEtiquetasMaterial === 'function' };
});
paso('el enlace lleva el código y el código de seguridad',
  qr.enlace === 'https://arizapa.es/#M-MAT0001-A3K9', qr.enlace);
paso('un material viejo sin etiqueta no finge tenerla',
  /#M--$/.test(qr.viejo) || !/A3K9/.test(qr.viejo), qr.viejo);

const leerQr = await T(url => {
  const g = window.__T;
  const antes = location.hash;
  location.hash = url.replace('https://arizapa.es/','');
  const r = g.materialDeURL();
  const falso1 = (() => { location.hash = '#M-MAT0001'; return g.materialDeURL(); })();
  const falso2 = (() => { location.hash = '#AR0001ABCD'; return g.materialDeURL(); })();
  location.hash = antes;
  return { r, falso1, falso2 };
}, qr.enlace);
paso('al escanear, la aplicación saca el código y el token',
  leerQr.r && leerQr.r.codigo === 'MAT-0001' && leerQr.r.token === 'A3K9', JSON.stringify(leerQr.r));
paso('una etiqueta a medias no vale', leerQr.falso1 === null);
paso('y la etiqueta de una PUERTA no se confunde con la de un material',
  leerQr.falso2 === null);

const escaneo = await T(async () => {
  const g = window.__T;
  g.dlgEscaneado('art-banda');
  await new Promise(r => setTimeout(r, 200));
  const txt = document.getElementById('dlg-form').innerText;
  const botones = Array.from(document.querySelectorAll('#dlg-form [data-act="mat-mover"]'))
    .map(b => b.dataset.modo);
  g.cerrarDlg();
  return { txt, botones };
});
/* innerText respeta el text-transform del CSS, y los títulos de las existencias
   se pintan en mayúsculas: por eso la comparación va sin distinguirlas. */
paso('al escanear sale qué hay y dónde',
  /nave/i.test(escaneo.txt) && /furgoneta/i.test(escaneo.txt),
  escaneo.txt.split('\n').filter(Boolean).slice(0,6).join(' / '));
paso('y tres botones grandes: llega, se gasta, me lo llevo',
  escaneo.botones.join(',') === 'entrada,salida,traspaso', escaneo.botones.join(','));

/* ================================================================
   4. Alta de material
   ================================================================ */
bloque('4. Dar de alta un material');

const alta = await T(async () => {
  const g = window.__T;
  const siguiente = g.siguienteCodigoMaterial();
  g.dlgArticulo(null);
  await new Promise(r => setTimeout(r, 250));
  document.getElementById('x-desc').value = 'Muelle de torsión 2,5 m';
  document.getElementById('x-fam').value = 'Muelles y cables';
  document.getElementById('x-min').value = '4';
  document.querySelector('#dlg button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 1200));
  const nuevo = g.S.catalogo.find(x => /Muelle de torsión/.test(x.descripcion));
  return { siguiente, nuevo: nuevo && { cod:nuevo.codigo, tok:(nuevo.token||'').length,
           fam:nuevo.familia, min:nuevo.minimo },
           otro: g.siguienteCodigoMaterial() };
});
paso('el código se asigna solo y correlativo',
  alta.nuevo.cod === alta.siguiente && alta.nuevo.cod === 'MAT-0003',
  alta.nuevo.cod+' (esperado '+alta.siguiente+')');
paso('con su código de seguridad de cuatro caracteres', alta.nuevo.tok === 4);
paso('y el siguiente ya no repite ese número', alta.otro === 'MAT-0004', alta.otro);
paso('guarda familia y mínimo', alta.nuevo.fam === 'Muelles y cables' && alta.nuevo.min === 4,
  JSON.stringify(alta.nuevo));

/* ================================================================
   5. Cargar el almacén desde un Excel
   ================================================================ */
bloque('5. El almacén entero desde un Excel');

const plantilla = await T(async () => {
  const g = window.__T;
  const filas = await g.leerXlsx(await g.plantillaXlsx('materiales').arrayBuffer());
  return { cab: filas[0], ej: filas[1] };
});
paso('la plantilla de materiales pide lo que hace falta',
  ['Descripción','Familia','Proveedor','Existencias de partida'].every(x => plantilla.cab.includes(x)),
  plantilla.cab.join(' | '));

const impo = await T(() => {
  const g = window.__T;
  const a = g.analizarImportacion('materiales', [
    ['Material','Familia','Marca','Ref','Proveedor','Stock','Minimo'],
    ['Banda de seguridad resistiva 2 m','Seguridad','ASO','Sentir 45.25','Otro proveedor','4','2'],
    ['Cable de acero 4 mm','Muelles y cables','Generico','CA-4','Gaditanos','50','10'],
    ['Cable de acero 4 mm','Muelles y cables','Generico','CA-4','Gaditanos','50','10'],
    ['','','','','','',''],
  ], {});
  return { resumen: a.resumen,
           filas: a.filas.map(f => ({ n:f.n, e:f.estado, m:f.motivo, av:f.aviso,
                                      cam:f.cambios.map(c => c[0]) })) };
});
paso('reconoce por referencia y marca el que ya existe',
  impo.filas[0].e === 'actualiza' && impo.filas[0].cam.includes('proveedor'),
  impo.filas[0].cam.join(','));
paso('y no le toca las existencias: para eso está el ajuste de inventario',
  /no se tocan/.test(impo.filas[0].av || ''), impo.filas[0].av);
paso('el que no existe entra con sus existencias de partida',
  impo.filas[1].e === 'nueva' && /Entrarán 50/.test(impo.filas[1].av), impo.filas[1].av);
paso('el repetido dentro del fichero no entra dos veces',
  impo.filas[2].e === 'error', impo.filas[2].m);
paso('y una fila sin descripción no es un material',
  impo.filas[3].e === 'error' && /Sin descripción/.test(impo.filas[3].m), impo.filas[3].m);

const cargaMat = await T(async () => {
  const g = window.__T;
  const a = g.analizarImportacion('materiales', [
    ['Material','Familia','Ref','Marca','Stock','Unidad'],
    ['Cable de acero 4 mm','Muelles y cables','CA-4','Generico','50','m'],
  ], {});
  g.IMPORTE.nombre = 'almacen.xlsx';
  const r = await g.ejecutarImportacion('materiales', a, { actualizar:true });
  await g.cargar();
  const nuevo = g.S.catalogo.find(x => /Cable de acero/.test(x.descripcion));
  return { r, nuevo: nuevo && { cod:nuevo.codigo, tok:(nuevo.token||'').length, uni:nuevo.unidad },
           ex: nuevo ? g.existenciasDe(nuevo.id) : null,
           mov: nuevo ? g.S.movimientos.filter(m => m.articulo_id === nuevo.id) : [] };
});
paso('al cargar, el material nace con su código y su QR',
  cargaMat.nuevo.cod === 'MAT-0004' && cargaMat.nuevo.tok === 4, JSON.stringify(cargaMat.nuevo));
paso('las existencias de partida quedan en la nave',
  cargaMat.ex.total === 50 && cargaMat.ex.enNave === 50, JSON.stringify(cargaMat.ex.porSitio));
paso('y NO aparecen de la nada: entran como un movimiento con su explicación',
  cargaMat.mov.length === 1 && /partida/.test(cargaMat.mov[0].nota || ''),
  (cargaMat.mov[0]||{}).nota);
paso('el resumen cuenta esa entrada', cargaMat.r.movimientos === 1, JSON.stringify(cargaMat.r));

/* ================================================================
   6. El parte descuenta del almacén
   ================================================================ */
bloque('6. Lo gastado en la visita sale del almacén');

const parte = await T(async () => {
  const g = window.__T;
  const av = g.S.avisos.find(x => x.id === 'av-alm');
  const fur = g.miFurgoneta();
  const antes = g.hayEn('art-banda', fur.id);
  const mats = [{ descripcion:'Banda de seguridad resistiva 2 m', cantidad:1, unidad:'ud', articulo_id:'art-banda' },
                { descripcion:'Brida de nailon', cantidad:4, unidad:'ud', articulo_id:null }];
  const r1 = await g.descontarMaterialDelParte(av, mats);
  await g.cargar();
  const despues = g.hayEn('art-banda', fur.id);
  /* Y otra vez, como si se reabriera y se volviera a cerrar: no puede descontar
     dos veces lo mismo. */
  const r2 = await g.descontarMaterialDelParte(av, mats);
  await g.cargar();
  return { antes, despues, r1, r2, trasSegundoCierre: g.hayEn('art-banda', fur.id),
           movs: g.S.movimientos.filter(m => m.aviso_id === 'av-alm').length };
});
paso('lo que lleva el técnico baja en su furgoneta',
  parte.despues === parte.antes - 1, parte.antes+' → '+parte.despues);
paso('lo escrito a mano no descuenta nada: no está en el almacén',
  parte.r1.bajas === 1, JSON.stringify(parte.r1));
paso('cerrar dos veces NO descuenta dos veces',
  parte.trasSegundoCierre === parte.despues, parte.despues+' → '+parte.trasSegundoCierre);
paso('y queda un solo movimiento para esa visita', parte.movs === 1, parte.movs);

const avisoNegativo = await T(async () => {
  const g = window.__T;
  const av = g.S.avisos.find(x => x.id === 'av-alm');
  const r = await g.descontarMaterialDelParte(av,
    [{ descripcion:'Fotocélula de espejo', cantidad:3, unidad:'ud', articulo_id:'art-foto' }]);
  await g.cargar();
  return { r, queda: g.hayEn('art-foto', g.miFurgoneta().id) };
});
paso('gastar más de lo que constaba se anota igual: manda la furgoneta de verdad',
  avisoNegativo.queda === -3, avisoNegativo.queda);
paso('pero se avisa para que se revise el inventario',
  /Revisa el inventario/.test(avisoNegativo.r.aviso), avisoNegativo.r.aviso);

/* ================================================================
   7. Lo que la oficina manda llevar
   ================================================================ */
bloque('7. Material previsto por la oficina');

const prev = await T(async () => {
  const g = window.__T;
  await g.sb.from('materiales_previstos').insert({ aviso_id:'av-alm', articulo_id:'art-banda',
    descripcion:'Banda de seguridad resistiva 2 m', cantidad:2, nota:'La de 2 m, no la de 1,5' });
  await g.cargar();
  const lista = g.previstosDe('av-alm');
  g.dlgCierre('av-alm');
  await new Promise(r => setTimeout(r, 900));
  const txt = document.getElementById('dlg-form').innerText;
  const boton = !!document.querySelector('[data-act="prev-usar"]');
  // pasarlo a material usado
  document.querySelector('[data-act="prev-usar"]').click();
  await new Promise(r => setTimeout(r, 300));
  const filas1 = document.querySelectorAll('#mats .mat-fila').length;
  /* El parte nace con una línea vacía, así que la que se acaba de añadir es la
     última, no la primera. */
  const arts = Array.from(document.querySelectorAll('#mats .mat-fila .mat-art'));
  const elegido = (arts[arts.length-1]||{}).value;
  // y otra vez: no debe duplicar
  document.querySelector('[data-act="prev-usar"]').click();
  await new Promise(r => setTimeout(r, 300));
  const filas2 = document.querySelectorAll('#mats .mat-fila').length;
  const leidas = g.materialesDelForm();
  g.cerrarDlg();
  return { n: lista.length, txt, boton, filas1, filas2, elegido, leidas };
});
paso('el parte enseña lo que la oficina manda llevar',
  /manda llevar/.test(prev.txt) && /no la de 1,5/.test(prev.txt));
paso('y deja pasarlo a material usado de un toque', prev.boton === true);
paso('al pasarlo, la línea queda enlazada con el material del almacén',
  prev.elegido === 'art-banda', prev.elegido);
paso('darle dos veces no duplica la línea',
  prev.filas2 === prev.filas1, prev.filas1+' → '+prev.filas2);
paso('y la línea se lee con su artículo y su cantidad',
  prev.leidas.some(m => m.articulo_id === 'art-banda' && m.cantidad === 2),
  JSON.stringify(prev.leidas));
/* Apuntar material previsto no mueve nada: los movimientos de esta visita
   siguen siendo los que dejó el último cierre, ni uno más. */
const movsTrasPrever = await T(() =>
  window.__T.S.movimientos.filter(m => m.aviso_id === 'av-alm').length);
paso('previsto NO es gastado: por sí solo no mueve el almacén',
  movsTrasPrever === 1, movsTrasPrever);

/* ================================================================
   8. Quién puede qué
   ================================================================ */
bloque('8. El técnico mueve, la oficina da de alta');

const permisos = await T(async () => {
  const g = window.__T;
  const rol = g.S.perfil.rol;
  const mira = () => new Promise(r => {
    g.S.tab = 'almacen'; g.pintar();
    setTimeout(() => r({
      alta: !!document.querySelector('#vista [data-act="mat-nuevo"]'),
      excel: !!document.querySelector('#vista [data-act="importar"][data-tipo="materiales"]'),
      etiquetas: !!document.querySelector('#vista [data-act="mat-etiquetas"]'),
      mover: !!document.querySelector('#vista [data-act="mat-mover"]'),
      ficha: !!document.querySelector('#vista [data-act="mat-ficha"]'),
    }), 250);
  });
  const admin = await mira();
  g.S.perfil.rol = 'tecnico';
  const tecnico = await mira();
  g.S.perfil.rol = rol; g.pintar();
  return { admin, tecnico };
});
paso('el administrador da de alta, carga Excel e imprime etiquetas',
  permisos.admin.alta && permisos.admin.excel && permisos.admin.etiquetas);
paso('el técnico NO da de alta materiales ni carga ficheros',
  !permisos.tecnico.alta && !permisos.tecnico.excel && !permisos.tecnico.etiquetas,
  JSON.stringify(permisos.tecnico));
paso('pero sí mueve material y abre la ficha: es lo suyo',
  permisos.tecnico.mover && permisos.tecnico.ficha);

/* ================================================================
   9. Sin el SQL del almacén
   ================================================================ */
bloque('9. Si no se ha ejecutado servidor/almacen.sql');

const sinSql = await T(async () => {
  const g = window.__T;
  g.S.sinAlmacen = true;
  g.S.tab = 'almacen'; g.pintar();
  await new Promise(r => setTimeout(r, 250));
  const texto = document.getElementById('vista').innerText;
  const fila = g.filaMaterial({ descripcion:'x', cantidad:1, unidad:'ud' });
  const desc = await g.descontarMaterialDelParte({ id:'av-alm', tipo:'averia' },
    [{ articulo_id:'art-banda', cantidad:1 }]);
  g.S.sinAlmacen = false; g.pintar();
  return { texto, fila, desc };
});
paso('la pestaña lo dice y manda ejecutar el SQL',
  /almacen\.sql/.test(sinSql.texto), sinSql.texto.split('\n').slice(0,3).join(' / '));
paso('el parte sigue admitiendo material escrito a mano',
  !/mat-art/.test(sinSql.fila) && /mat-desc/.test(sinSql.fila));
paso('y no intenta descontar de un almacén que no existe',
  sinSql.desc.bajas === 0, JSON.stringify(sinSql.desc));

/* ================================================================
   Final
   ================================================================ */
console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
