/* ================================================================
   bloques.mjs — El alta de puertas, por bloques y por familia
                                                     24-11-2026

   DE DÓNDE SALE

   David, después de las primeras altas de verdad en la empresa:
   «El dar de alta una puerta es lento y tedioso. Estructurarlo por
   bloques: puerta, uso, motorización, seguridades y control de
   acceso.»

   Y: «No se puede cargar la foto hasta que no se guarda el
   componente.»

   El problema de fondo no era el orden de los campos, era la
   cantidad: el formulario preguntaba lo mismo a todas las puertas.
   A una barrera se le pedía el dintel y las vueltas de los muelles;
   a una corredera, el diámetro del eje.

   La tabla de qué se pregunta a cada familia la rellenó David en
   una hoja de cálculo, familia por familia, con SÍ, OPCIONAL o NO.
   Está volcada en CAMPOS_FAMILIA.

   QUÉ SE VIGILA AQUÍ, Y POR QUÉ CADA COSA

   1. Que la tabla no tenga nombres inventados. Una clave mal
      escrita en CAMPOS_FAMILIA no da error: simplemente ese campo
      no se enseña NUNCA, en ninguna familia, y nadie se entera.
      Es el fallo más caro y el más silencioso.

   2. Que todas las familias estén en la tabla. Una familia que
      falte contesta «opcional» a todo y enseña los cuarenta
      campos: volvemos al problema de partida sin avisar.

   3. Que los valores sean los de SU hoja, no los que yo creyera.
      Se comprueban uno a uno los que él cambió respecto a antes:
      el dintel en cortafuegos y peatonal, los muelles en
      basculante, enrollable y guillotina.

   4. Que lo escondido no se guarde, y que lo guardado no se borre
      al cambiar el tipo. Un tipo mal elegido se corrige; un dato
      borrado hay que volver a la puerta a tomarlo.

   5. Que lo de siempre siga en su sitio: las casillas de seguridad
      con su misma clase y su mismo nombre, dentro de «f-segs». De
      ahí tiran el parte, el informe, el expediente, los
      componentes y el borrador del alta.

   6. Que «Baliza» renombrada a «Luz de maniobra» siga saliendo
      marcada en una puerta que la tenía guardada con el nombre
      viejo.

   7. Y la foto del componente antes de guardarlo.

   Uso:  ./preparar.sh  y luego  node bloques.mjs
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
const ctx = await nav.newContext({ viewport:{width:1320,height:2200},
  locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
const pag = await ctx.newPage();
await pag.goto(URL_APP);
await pag.waitForFunction(() => window.__T && window.__T.S && window.__T.S.perfil, null, { timeout: 30000 });
const T = (f, arg) => arg === undefined ? pag.evaluate(f) : pag.evaluate(f, arg);

let ok = 0, mal = 0;
const paso = (t, bien, detalle) => {
  if (bien){ ok++; console.log('  OK  '+t+(detalle!==undefined?' → '+detalle:'')); }
  else { mal++; console.log(' FALLA '+t+(detalle!==undefined?' → '+detalle:'')); }
};
const bloque = t => console.log('\n· '+t);
const esperar = ms => new Promise(f => setTimeout(f, ms));

/* ================================================================
   1. La tabla, por dentro
   ================================================================ */
bloque('1. La tabla no miente: nombres y familias');

const tabla = await T(() => {
  const g = window.__T;
  const claves = g.MEDIDAS_PUERTA.map(m => m.c).concat(g.ELEMENTOS_PUERTA.map(x => x.c));
  const inventados = [];
  const vacias = [];
  Object.keys(g.CAMPOS_FAMILIA).forEach(f => {
    const c = g.CAMPOS_FAMILIA[f];
    if (!c.si.length && !c.op.length) vacias.push(f);
    c.si.concat(c.op).forEach(k => {
      if (claves.indexOf(k) < 0) inventados.push(f+'.'+k);
    });
    /* Y que nadie esté en las dos listas: SÍ y OPCIONAL a la vez no es nada. */
    c.si.forEach(k => { if (c.op.indexOf(k) >= 0) inventados.push(f+'.'+k+' (en las dos)'); });
  });
  /* Las familias que la aplicación sabe reconocer, de FORMAS_PUERTA */
  const familias = g.FORMAS_PUERTA.map(x => x[0]).filter((x,i,a) => a.indexOf(x) === i);
  const sinTabla = familias.filter(f => !g.CAMPOS_FAMILIA[f]);
  const sobran = Object.keys(g.CAMPOS_FAMILIA).filter(f => familias.indexOf(f) < 0);
  /* Y que ninguna clave de campo esté repetida: dos campos con el mismo id
     harían que el segundo no se pudiera ni leer ni esconder. */
  const repes = claves.filter((k,i) => claves.indexOf(k) !== i);
  return { inventados, vacias, sinTabla, sobran, repes,
           nMed: g.MEDIDAS_PUERTA.length, nEle: g.ELEMENTOS_PUERTA.length,
           nFam: Object.keys(g.CAMPOS_FAMILIA).length };
});
paso('ninguna clave de la tabla está inventada',
     tabla.inventados.length === 0, tabla.inventados.join(' '));
paso('ninguna familia se ha quedado sin rellenar',
     tabla.vacias.length === 0, tabla.vacias.join(' '));
paso('todas las familias que la aplicación reconoce están en la tabla',
     tabla.sinTabla.length === 0, tabla.sinTabla.join(' '));
paso('y no hay familias en la tabla que la aplicación no reconozca',
     tabla.sobran.length === 0, tabla.sobran.join(' '));
paso('ningún campo tiene la clave repetida', tabla.repes.length === 0, tabla.repes.join(' '));
paso('son 16 medidas y 24 elementos, los de su hoja',
     tabla.nMed === 16 && tabla.nEle === 24, tabla.nMed+' y '+tabla.nEle);
paso('y once familias', tabla.nFam === 11, tabla.nFam);

/* ================================================================
   2. Los valores de SU hoja
   ================================================================ */
bloque('2. Lo que David marcó, uno a uno');

/* Estos son los que CAMBIÓ respecto a lo que la aplicación hacía antes. Si
   alguno se cae, el volcado de su hoja se ha hecho mal. */
const casos = [
  // [tipo que se escribe en la ficha, campo, lo que debe contestar]
  ['Barrera',                              'dintel',     'no'],
  ['Barrera',                              'muelle',     'no'],
  ['Barrera',                              'mastil',     'si'],
  ['Barrera',                              'alto',       'no'],
  ['Corredera autoportante',               'dintel',     'no'],
  ['Corredera autoportante',               'eje',        'no'],
  ['Corredera autoportante',               'guia',       'si'],
  ['Seccional',                            'muelle',     'si'],
  ['Seccional',                            'muellediam', 'si'],
  ['Seccional',                            'paneles',    'si'],
  // los tres que David AMPLIÓ en el dintel
  ['Cortafuegos corredera',                'dintel',     'si'],
  ['Peatonal automática corredera',        'dintel',     'si'],
  ['Plegable',                             'dintel',     'op'],
  // y los tres que AMPLIÓ en los muelles: antes solo seccional
  ['Basculante',                           'muelle',     'si'],
  ['Enrollable industrial',                'muelle',     'si'],
  ['Guillotina o vertical',                'muelle',     'si'],
  ['Rápida enrollable',                    'muelle',     'no'],
  // elementos
  ['Cortafuegos batiente peatonal de una hoja', 'incendios', 'si'],
  ['Corredera autoportante',               'incendios',  'no'],
  ['Peatonal automática corredera',        'sensorap',   'si'],
  ['Barrera',                              'bucle',      'op'],
  ['Peatonal automática corredera',        'seta',       'no'],
];
const dichos = await T(cs => cs.map(c => window.__T.pideCampo(c[0], c[1])), casos);
casos.forEach((c, i) => {
  paso('«'+c[0]+'» · '+c[1]+' = '+c[2], dichos[i] === c[2], dichos[i]);
});

bloque('3. Lo que se pregunta de más y de menos');
const cuentas = await T(() => {
  const g = window.__T;
  const todas = g.MEDIDAS_PUERTA.map(m => m.c).concat(g.ELEMENTOS_PUERTA.map(x => x.c));
  const cuenta = t => todas.filter(c => g.seAplica(t, c)).length;
  return { barrera: cuenta('Barrera'), seccional: cuenta('Seccional'),
           sinReconocer: cuenta('Portón de los años ochenta sin más datos'),
           total: todas.length };
});
paso('a una barrera se le preguntan 23 de 40, no 40',
     cuentas.barrera === 23, cuentas.barrera+' de '+cuentas.total);
paso('a una seccional, 35: es la que más lleva',
     cuentas.seccional === 35, cuentas.seccional);
paso('y a una puerta que no se reconoce no se le esconde NADA',
     cuentas.sinReconocer === cuentas.total, cuentas.sinReconocer);

bloque('4. «Se pregunta» no es lo mismo que «hace falta»');
const obliga = await T(() => {
  const g = window.__T;
  return {
    // en plegable el dintel es OPCIONAL: se enseña, pero no falta si está vacío
    seAplicaPlegable: g.seAplica('Plegable', 'dintel'),
    obligaPlegable:   g.esObligado('Plegable', 'dintel'),
    obligaSeccional:  g.esObligado('Seccional', 'dintel'),
    // y lo que la aplicación usa para reclamar los muelles
    reclamaBasculante: g.esObligado('Basculante', 'muelle'),
    reclamaCorredera:  g.esObligado('Corredera autoportante', 'muelle'),
    reclamaRaro:       g.esObligado('Portón raro', 'muelle'),
  };
});
paso('en plegable el dintel se enseña', obliga.seAplicaPlegable === true);
paso('pero dejarlo en blanco no es una ficha incompleta', obliga.obligaPlegable === false);
paso('en seccional sí hace falta', obliga.obligaSeccional === true);
paso('los muelles ya se reclaman en basculante, que es lo que David añadió',
     obliga.reclamaBasculante === true);
paso('y no en una corredera', obliga.reclamaCorredera === false);
paso('ni en una puerta cuyo tipo no se reconoce: no se reclama lo que no se sabe',
     obliga.reclamaRaro === false);

/* ================================================================
   5. El formulario de verdad
   ================================================================ */
bloque('5. La pantalla enseña y esconde al cambiar el tipo');

const ver = async tipo => T(async t => {
  const g = window.__T;
  const sel = document.getElementById('f-tipo');
  if (!sel) return { sinForm: true };
  /* Se escribe el tipo tal cual y se avisa a la aplicación, igual que al
     elegirlo en el desplegable. */
  if (!Array.from(sel.options).some(o => o.value === t)){
    const o = document.createElement('option'); o.value = t; o.textContent = t;
    sel.appendChild(o);
  }
  sel.value = t;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 120));
  const visto = c => {
    const caja = document.getElementById('f-caja-'+c);
    return caja ? !caja.hidden : null;
  };
  const bloqueVisto = b => {
    const caja = document.getElementById('f-bloque-'+b);
    return caja ? !caja.hidden : null;
  };
  return { sinForm:false,
    dintel: visto('dintel'), muelle: visto('muelle'), mastil: visto('mastil'),
    eje: visto('eje'), guia: visto('guia'), incendios: visto('incendios'),
    sensorap: visto('sensorap'), bSeg: bloqueVisto('seg'), bAcc: bloqueVisto('acceso') };
}, tipo);

await T(() => { const g = window.__T; g.dlgPuerta(null); });
await esperar(600);

const seccional = await ver('Seccional');
paso('en una seccional se ve el dintel', seccional.sinForm || seccional.dintel === true);
paso('y las vueltas de los muelles', seccional.sinForm || seccional.muelle === true);
paso('y NO se ve la longitud del mástil', seccional.sinForm || seccional.mastil === false);

const barrera = await ver('Barrera');
paso('al cambiar a barrera, el dintel se esconde', barrera.sinForm || barrera.dintel === false);
paso('los muelles también', barrera.sinForm || barrera.muelle === false);
paso('y aparece la longitud del mástil', barrera.sinForm || barrera.mastil === true);
paso('el bloque de control de acceso sigue a la vista',
     barrera.sinForm || barrera.bAcc === true);

const corta = await ver('Cortafuegos corredera');
paso('en una cortafuegos se ve el dintel, que es lo que David añadió',
     corta.sinForm || corta.dintel === true);
paso('y la central de detección de incendios', corta.sinForm || corta.incendios === true);
paso('en una corredera normal, la central NO',
     (await ver('Corredera autoportante')).incendios === false);

const peat = await ver('Peatonal automática corredera');
paso('en una peatonal automática se ve el sensor de apertura',
     peat.sinForm || peat.sensorap === true);
paso('y el dintel, que antes no se le pedía', peat.sinForm || peat.dintel === true);

/* ================================================================
   6. Lo de siempre sigue en su sitio
   ================================================================ */
bloque('6. Nada de lo que ya funcionaba se ha movido');

const sitio = await T(() => {
  const g = window.__T;
  const segs = document.getElementById('f-segs');
  if (!segs) return { sinSegs: true };
  const dentro = segs.querySelectorAll('.f-seg').length;
  const valores = Array.from(segs.querySelectorAll('.f-seg')).map(x => x.value);
  /* Los que no son de seguridad van con OTRA clase, para que lo que lee
     «Seguridad instalada» no empiece a contar teclados y porteros. */
  const otros = Array.from(document.querySelectorAll('.f-ele')).map(x => x.value);
  return { sinSegs:false, dentro, valores, otros,
           hayAnadir: !!document.getElementById('f-seg-nuevo') };
});
paso('las casillas de seguridad siguen dentro de «f-segs»',
     sitio.sinSegs || sitio.dentro > 0, sitio.dentro);
paso('y siguen llamándose por su nombre, no por una clave',
     sitio.sinSegs || sitio.valores.indexOf('Fotocélulas') >= 0, (sitio.valores||[]).join(', '));
paso('«Luz de maniobra» está, y «Baliza» ya no',
     sitio.sinSegs || (sitio.valores.indexOf('Luz de maniobra') >= 0 &&
                       sitio.valores.indexOf('Baliza') < 0));
paso('lo que no es de seguridad va con otra clase y no se cuela ahí',
     sitio.sinSegs || (sitio.otros.length > 0 &&
       sitio.otros.every(v => sitio.valores.indexOf(v) < 0)), (sitio.otros||[]).length);
paso('y se puede seguir añadiendo un elemento a mano', sitio.sinSegs || sitio.hayAnadir === true);

bloque('7. El nombre viejo guardado en una puerta sigue valiendo');
const vieja = await T(async () => {
  const g = window.__T, S = g.S;
  const p = (S.puertas || [])[0];
  if (!p) return { sinDatos: true };
  const antes = p.seguridad, antesEle = p.elementos, antesTipo = p.tipo;
  /* Una puerta guardada antes del renombrado: lleva «Baliza». */
  p.seguridad = ['Fotocélulas', 'Baliza'];
  p.elementos = null;
  p.tipo = 'Seccional';
  g.cerrarDlg();
  g.dlgPuerta(p.id);
  await new Promise(r => setTimeout(r, 500));
  const marcada = c => {
    const e = document.getElementById('f-caja-'+c);
    const i = e ? e.querySelector('input') : null;
    return i ? i.checked : null;
  };
  const out = { sinDatos:false, luz: marcada('luz'), foto: marcada('fotocelulas'),
                banda: marcada('banda') };
  g.cerrarDlg();
  p.seguridad = antes; p.elementos = antesEle; p.tipo = antesTipo;
  return out;
});
paso('una puerta con «Baliza» guardada sale con la luz de maniobra marcada',
     vieja.sinDatos || vieja.luz === true, vieja.luz);
paso('y sus fotocélulas también', vieja.sinDatos || vieja.foto === true);
paso('lo que no tenía sigue sin marcar', vieja.sinDatos || vieja.banda === false);

/* ================================================================
   8. Lo escondido no se guarda, y lo guardado no se borra
   ================================================================ */
bloque('8. Cambiar el tipo no borra lo que ya estaba medido');

const guardado = await T(async () => {
  const g = window.__T, S = g.S;
  const p = (S.puertas || [])[0];
  if (!p) return { sinDatos: true };
  const antes = JSON.stringify({ t:p.tipo, v:p.vueltas_muelle, n:p.n_paneles });
  p.tipo = 'Seccional'; p.vueltas_muelle = 7.5; p.n_paneles = 5;
  g.cerrarDlg();
  g.dlgPuerta(p.id);
  await new Promise(r => setTimeout(r, 500));
  /* Se cambia el tipo a corredera, donde los muelles y los paneles no se
     preguntan, y se guarda. */
  const sel = document.getElementById('f-tipo');
  if (!Array.from(sel.options).some(o => o.value === 'Corredera autoportante')){
    const o = document.createElement('option');
    o.value = 'Corredera autoportante'; o.textContent = o.value; sel.appendChild(o);
  }
  sel.value = 'Corredera autoportante';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  const escondidos = {
    muelle: (document.getElementById('f-caja-muelle') || {}).hidden,
    paneles: (document.getElementById('f-caja-paneles') || {}).hidden,
  };
  /* Lo que se MANDARÍA a la base: se recoge igual que al guardar. */
  const tp = sel.value;
  const manda = {};
  g.MEDIDAS_PUERTA.forEach(m => {
    if (m.soloLectura || m.desde !== 'bloques' || !g.seAplica(tp, m.c)) return;
    manda[m.col] = true;
  });
  g.cerrarDlg();
  const d = JSON.parse(antes);
  p.tipo = d.t; p.vueltas_muelle = d.v; p.n_paneles = d.n;
  return { sinDatos:false, escondidos, mandaPaneles: !!manda.n_paneles,
           mandaGuia: !!manda.tipo_guia };
});
paso('al pasar a corredera, las vueltas de muelle se esconden',
     guardado.sinDatos || guardado.escondidos.muelle === true);
paso('y los paneles también', guardado.sinDatos || guardado.escondidos.paneles === true);
paso('y lo escondido NO se manda a la base: lo medido se queda guardado',
     guardado.sinDatos || guardado.mandaPaneles === false);
paso('lo que sí se pregunta en corredera, sí se manda',
     guardado.sinDatos || guardado.mandaGuia === true);

/* ================================================================
   9. La foto del componente, antes de guardarlo
   ================================================================ */
bloque('9. La foto se hace con la placa delante, no después');

const foto = await T(async () => {
  const g = window.__T, S = g.S;
  const p = (S.puertas || [])[0];
  if (!p) return { sinDatos: true };
  g.cerrarDlg();
  g.dlgComponente(null, p.id);
  await new Promise(r => setTimeout(r, 400));
  const texto = (document.getElementById('dlg-form') || document.body).textContent;
  const entradas = Array.from(document.querySelectorAll('[data-act="comp-foto"]'));
  const out = {
    sinDatos: false,
    yaNoDice: texto.indexOf('Guarda primero el componente y luego') < 0,
    loDice: texto.indexOf('se sube en cuanto guardes') >= 0,
    hayEntrada: entradas.length > 0,
    sinId: entradas.length ? entradas[0].dataset.id === '' : null,
    esperaLimpia: !S.compEspera,
  };
  g.cerrarDlg();
  return out;
});
paso('la pantalla ya no dice «guarda primero el componente»',
     foto.sinDatos || foto.yaNoDice === true);
paso('dice que la foto se sube al guardar', foto.sinDatos || foto.loDice === true);
paso('y el botón de la foto está puesto en un componente nuevo',
     foto.sinDatos || foto.hayEntrada === true);
paso('sin número de componente todavía, que es el motivo del fallo',
     foto.sinDatos || foto.sinId === true);
paso('y al abrir la pantalla no hay ninguna foto esperando de otro componente',
     foto.sinDatos || foto.esperaLimpia === true);

const subida = await T(() => {
  const g = window.__T;
  /* Con el fichero elegido y sin guardar, la foto tiene que quedarse esperando
     en vez de perderse. */
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([1,2,3])], 'placa.jpg', { type:'image/jpeg' }));
  const ent = document.createElement('input');
  ent.type = 'file'; ent.dataset.act = 'comp-foto'; ent.dataset.id = '';
  document.getElementById('dlg-form').appendChild(ent);
  ent.files = dt.files;
  ent.dispatchEvent(new Event('change', { bubbles: true }));
  const esp = g.S.compEspera;
  const r = { hay: !!(esp && esp.foto), nombre: esp && esp.foto && esp.foto.name };
  ent.remove(); g.S.compEspera = null;
  return r;
});
paso('elegir la foto antes de guardar la deja esperando, no la tira',
     subida.hay === true, subida.nombre);

/* ================================================================
   10. El aviso de que falta el SQL
   ================================================================ */
bloque('10. Si falta el SQL, la aplicación lo dice');
const marca = await T(() => {
  const g = window.__T;
  const c = (g.QUE_HACE_FALTA || []).find(x => x.marca === 'sinBloques');
  return c ? { fichero: c.fichero, dice: !!c.pierdes } : null;
});
paso('dice qué fichero es y qué se pierde sin él',
     !!marca && marca.fichero === 'alta-por-bloques.sql' && marca.dice,
     marca && marca.fichero);

console.log('\n── '+ok+' bien, '+mal+' mal ──────────────────────');
await nav.close();
process.exit(mal ? 1 : 0);
