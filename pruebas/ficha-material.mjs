/* ================================================================
   ficha-material.mjs — la ficha del material                08-11-2026

   DE DÓNDE SALE
   David, el 08-11-2026, después de usarla de verdad:

     «Al editar el material meto código de barras y foto y al guardar
      vuelvo a abrir almacén y el producto no queda guardado con los
      cambios. Al cargar un material y elegir proveedor, si no está
      dado de alta el proveedor, no puedo dar de alta a un proveedor
      nuevo. En vez de preguntar dónde está en la nave debería de
      preguntar en qué almacén está, y luego en qué parte de este
      almacén está guardado. En dar de alta un nuevo producto hago
      una foto y no se refleja en la ficha.»

   LAS CAUSAS, QUE ERAN CUATRO Y DISTINTAS
     1. Al subir la foto se volvía a dibujar la ficha ENTERA con lo
        guardado, y eso borraba lo que hubiera escrito sin guardar.
     2. En un material que todavía no existe no hay id al que colgar
        la foto: se salía en silencio y la foto no iba a ningún lado.
        Peor aún viniendo de una petición de un técnico, donde el
        botón SÍ salía.
     3. No había manera de crear un proveedor sin salirse.
     4. «Dónde está en la nave» era un texto libre, y desde que hay
        nave, furgonetas y los sitios que crea la oficina, «balda 3»
        sin decir de dónde no sirve para buscar nada.
   ================================================================ */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const AQUI = dirname(fileURLToPath(import.meta.url));
const URL_APP = process.env.ARIZA_URL || 'http://127.0.0.1:8899/index.html';
let ajustes = {};
try { ajustes = JSON.parse(readFileSync(join(AQUI, 'ajustes.json'), 'utf8')); } catch(_){}

const nav = await chromium.launch({ args: ['--lang=es-ES'] });
const ctx = await nav.newContext({ viewport:{width:1320,height:2200}, locale:'es-ES',
  timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
await ctx.addInitScript(() => {
  /* Una imagen de verdad, pintada con canvas. Con seis bytes inventados el
     reductor de imágenes de la aplicación dice «Imagen no válida», y entonces
     la prueba falla por el fichero, no por el programa. (08-11-2026) */
  window.__imagenDePrueba = async nombre => {
    const c = document.createElement('canvas');
    c.width = 40; c.height = 40;
    const x = c.getContext('2d');
    x.fillStyle = '#c33'; x.fillRect(0, 0, 40, 40);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    return new File([blob], nombre, { type: 'image/jpeg' });
  };
  window.__PARCHE = db => {
    /* Lleva «detalle» y «foto_ruta» a propósito: la aplicación mira si el
       catálogo tiene esas columnas para saber si enseña el apartado «Cómo se
       vende», que es donde vive la foto. Sin ellas, ese apartado no se pinta y
       la prueba de la foto no probaría nada. */
    db.articulos.push({ id:'art-foto', descripcion:'Fotocelula de espejo', unidad:'ud',
      familia:'Seguridad', codigo:'MAT-0007', token:'B4L0', activo:true, minimo:10,
      detalle:null, foto_ruta:null });
    db.catalogo = db.articulos;
    db.proveedores = db.proveedores || [];
    db.proveedores.push({ id:'prov-1', nombre:'Erreka', activo:true });
  };
});
const errores = [];
const esLaLetraDeGoogle = t => /fonts\.(googleapis|gstatic)\.com/.test(t) ||
  /Failed to load resource/.test(t);
const pag = await ctx.newPage();
pag.on('console', m => { if (m.type()==='error' && !esLaLetraDeGoogle(m.text())) errores.push(m.text()); });
pag.on('pageerror', e => errores.push(String(e)));
await pag.goto(URL_APP);
await pag.waitForFunction(() => window.__T && window.__T.S && window.__T.S.perfil, null, {timeout:30000});
const T = (f, arg) => arg === undefined ? pag.evaluate(f) : pag.evaluate(f, arg);

let ok = 0, mal = 0;
const paso = (t, bien, d) => { if (bien){ ok++; console.log('  OK  '+t+(d!==undefined?' → '+d:'')); }
  else { mal++; console.log(' FALLA '+t+(d!==undefined?' → '+d:'')); } };
const bloque = t => console.log('\n· '+t);

bloque('1. Subir la foto ya no borra lo que estabas escribiendo');
/* El fallo que contó David: metía código de barras Y foto, y al guardar no
   quedaba el código. Porque al subir la foto se repintaba la ficha entera. */
const noPierde = await T(async () => {
  const g = window.__T;
  g.dlgArticulo('art-foto');
  await new Promise(r => setTimeout(r, 500));
  /* el usuario escribe, SIN guardar todavía */
  document.getElementById('x-ean').value = '8412345678905';
  document.getElementById('x-sitio').value = 'estanteria B, balda 3';
  const antesMin = document.getElementById('x-min').value;
  /* y ahora sube una foto */
  const f = await window.__imagenDePrueba('caja.jpg');
  await g.subirFotoArticulo('art-foto', f);
  await new Promise(r => setTimeout(r, 900));
  return { ean: (document.getElementById('x-ean')||{}).value,
           sitio: (document.getElementById('x-sitio')||{}).value,
           min: (document.getElementById('x-min')||{}).value, antesMin,
           sigueAbierto: document.getElementById('dlg').open };
});
paso('el código de barras escrito SIGUE AHÍ después de subir la foto',
     noPierde.ean === '8412345678905', noPierde.ean || '(se ha borrado)');
paso('y lo demás que estaba escrito también',
     noPierde.sitio === 'estanteria B, balda 3', noPierde.sitio || '(se ha borrado)');
paso('sin perder los campos que ya venían', noPierde.min === noPierde.antesMin, noPierde.min);
paso('y la ficha sigue abierta', noPierde.sigueAbierto === true);

bloque('2. La foto de un material que todavía no existe');
const fotoNueva = await T(async () => {
  const g = window.__T;
  g.cerrarDlg(); await new Promise(r => setTimeout(r, 300));
  g.dlgArticulo(null);
  await new Promise(r => setTimeout(r, 500));
  const hayBoton = !!document.querySelector('#dlg-form [data-act="foto-art-espera"]');
  const f = await window.__imagenDePrueba('nueva.jpg');
  g.fotoEnEspera(f);
  await new Promise(r => setTimeout(r, 300));
  const hayPrevia = !!document.querySelector('#x-foto img');
  /* y ahora se da de alta el material */
  document.getElementById('x-desc').value = 'Muelle de torsion 60 mm';
  document.querySelector('#dlg-form [type=submit]').click();
  await new Promise(r => setTimeout(r, 2000));
  const art = (g.S.catalogo||[]).find(x => x.descripcion === 'Muelle de torsion 60 mm');
  return { hayBoton, hayPrevia, foto: art ? (art.foto_ruta||null) : 'NO SE CREÓ' };
});
paso('en un material nuevo YA se puede poner la foto', fotoNueva.hayBoton === true);
paso('y se ve antes de guardar', fotoNueva.hayPrevia === true);
paso('AL GUARDAR, LA FOTO QUEDA EN LA FICHA, que es lo que fallaba',
     !!fotoNueva.foto && /^catalogo\//.test(fotoNueva.foto), fotoNueva.foto);

bloque('3. Crear un proveedor sin perder el material a medias');
const prov = await T(async () => {
  const g = window.__T;
  g.cerrarDlg(); await new Promise(r => setTimeout(r, 300));
  g.dlgArticulo(null);
  await new Promise(r => setTimeout(r, 500));
  const hayBoton = !!document.querySelector('#dlg-form [data-act="x-prov-nuevo"]');
  document.getElementById('x-desc').value = 'Cadena de 1/2 pulgada';
  document.getElementById('x-ean').value = '8499911122233';
  document.getElementById('x-marca').value = 'Iggesund';
  g.irAProveedorNuevo();
  await new Promise(r => setTimeout(r, 500));
  const enProveedor = !!document.getElementById('pv-nom');
  const hayTelefono = !!document.getElementById('pv-tel');   /* la ficha ENTERA */
  document.getElementById('pv-nom').value = 'Suministros Bahía';
  document.getElementById('pv-tel').value = '600 11 22 33';
  document.querySelector('#dlg-form [type=submit]').click();
  await new Promise(r => setTimeout(r, 2000));
  const nuevo = (g.S.proveedores||[]).find(x => x.nombre === 'Suministros Bahía');
  return { hayBoton, enProveedor, hayTelefono,
    creado: !!nuevo, telefono: nuevo ? nuevo.telefono : null,
    volvi: !!document.getElementById('x-desc'),
    desc: (document.getElementById('x-desc')||{}).value,
    ean: (document.getElementById('x-ean')||{}).value,
    marca: (document.getElementById('x-marca')||{}).value,
    elegido: nuevo && (document.getElementById('x-prov')||{}).value === nuevo.id };
});
paso('hay botón de proveedor nuevo en la ficha del material', prov.hayBoton === true);
paso('se abre la ficha ENTERA del proveedor, no solo el nombre',
     prov.enProveedor && prov.hayTelefono);
paso('el proveedor se crea con sus datos', prov.creado && prov.telefono === '600 11 22 33',
     prov.telefono);
paso('SE VUELVE AL MATERIAL y lo escrito sigue ahí', prov.volvi && prov.desc === 'Cadena de 1/2 pulgada',
     prov.desc || '(perdido)');
paso('con el código de barras y la marca intactos',
     prov.ean === '8499911122233' && prov.marca === 'Iggesund', prov.ean+' / '+prov.marca);
paso('y el proveedor nuevo YA ELEGIDO', prov.elegido === true);

bloque('4. En qué almacén se guarda, y en qué parte');
const sitio = await T(async () => {
  const g = window.__T;
  g.cerrarDlg(); await new Promise(r => setTimeout(r, 300));
  g.dlgArticulo('art-foto');
  await new Promise(r => setTimeout(r, 500));
  const sel = document.getElementById('x-alm');
  const etiqueta = [...document.querySelectorAll('#dlg-form label')]
    .map(l => l.textContent.trim());
  const almacenes = sel ? [...sel.options].map(o => o.textContent) : [];
  if (sel && sel.options.length > 1) sel.value = sel.options[1].value;
  document.getElementById('x-sitio').value = 'estanteria B, balda 3';
  document.querySelector('#dlg-form [type=submit]').click();
  await new Promise(r => setTimeout(r, 2000));
  const a = (g.S.catalogo||[]).find(x => x.id === 'art-foto');
  return { hay: !!sel, almacenes,
    preguntaAlmacen: etiqueta.some(t => /En qué almacén se guarda/i.test(t)),
    preguntaParte: etiqueta.some(t => /En qué parte de ese almacén/i.test(t)),
    yaNoDiceNave: !etiqueta.some(t => /Dónde está en la nave/i.test(t)),
    guardado: a ? a.ubicacion_id : null, parte: a ? a.ubicacion : null };
});
paso('la ficha pregunta en qué ALMACÉN se guarda', sitio.preguntaAlmacen === true);
paso('y en qué parte de ese almacén', sitio.preguntaParte === true);
paso('ya no pregunta «dónde está en la nave»', sitio.yaNoDiceNave === true);
paso('se eligen los almacenes que hay', sitio.almacenes.length > 1, sitio.almacenes.join(' · '));
paso('EL ALMACÉN SE GUARDA', !!sitio.guardado, sitio.guardado);
paso('y la parte, por separado', sitio.parte === 'estanteria B, balda 3', sitio.parte);

bloque('5. Sin el SQL nuevo, la ficha sigue funcionando como antes');
const sinSql = await T(async () => {
  const g = window.__T;
  g.cerrarDlg(); await new Promise(r => setTimeout(r, 300));
  const antes = g.S.sinSitioMaterial;
  g.S.sinSitioMaterial = true;
  g.dlgArticulo('art-foto');
  await new Promise(r => setTimeout(r, 500));
  const sel = !!document.getElementById('x-alm');
  const etiqueta = [...document.querySelectorAll('#dlg-form label')].map(l => l.textContent.trim());
  const sitio = !!document.getElementById('x-sitio');
  g.S.sinSitioMaterial = antes;
  return { sel, sitio, dicelaNave: etiqueta.some(t => /Dónde está en la nave/i.test(t)) };
});
paso('sin el SQL no sale el selector de almacén', sinSql.sel === false);
paso('pero el campo de siempre sigue ahí', sinSql.sitio === true);
paso('y vuelve a llamarse como antes', sinSql.dicelaNave === true);

console.log('\n'+ok+' bien, '+mal+' mal.');
if (errores.length){ console.log('Errores de JavaScript:'); errores.forEach(e => console.log('   '+e)); }
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || errores.length ? 1 : 0);
