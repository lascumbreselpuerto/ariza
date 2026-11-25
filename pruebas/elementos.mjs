/* ================================================================
   elementos.mjs — Una sola lista de elementos, y la norma aparte
                                                     25-11-2026

   DE DÓNDE SALE

   David, al ver la pantalla en uso: «los componentes no coinciden
   con los seleccionados en función de la familia de puerta que
   seleccionamos en el excel».

   Y, sobre la documentación: «siempre el técnico tiene la última
   palabra a la hora de decidir qué elementos de seguridad debe
   contener una puerta, pero siempre una vez cumplidos los mínimos
   exigidos por la normativa vigente. Además, en función del uso,
   usuario, sitio de instalación etc las seguridades obligatorias
   son diferentes».

   QUÉ SE VIGILA AQUÍ, Y POR QUÉ CADA COSA

   1. Que haya UNA tabla de 47 elementos y que la ficha siga
      preguntando solo los 23 suyos. Si los 24 de estructura y
      mecánica se colaran en el alta, se desharía lo del 24-11-2026:
      el alta volvería a ser larga, que es de lo que se quejó.

   2. Que el expediente pida lo de la familia de LA PUERTA, no lo de
      una de las cuatro familias viejas. Es la queja literal.

   3. Que un expediente de antes NO cambie de catálogo. Sus
      respuestas están guardadas con claves viejas, y a uno emitido
      cambiarle el catálogo es cambiar lo que dice un documento
      firmado.

   4. LAS VÍAS DE LA NORMA, que es lo más delicado de todo. La
      matriz no pide «limitador y fotocélula y banda»: para un nivel
      «C+D o E» pide limitación de fuerza MÁS detección, o un
      sistema de nivel E. Con una basta.

      El código de antes hacía niveles.includes('C') y daba por
      pedidos los tres a la vez. Como solo se enseñaba de
      recordatorio, pasaba. En una pantalla que dice «esto exige la
      norma» sería mentira: exigiría material que la norma no
      exige, o daría por incumplida una puerta que cumple por la
      otra vía.

   5. Que el puente con el inventario de la puerta traduzca las
      claves viejas. Sin eso, «traer del inventario» se trae la
      mitad y no dice por qué.

   6. Y que cuando NO se puede saber qué exige la norma (falta el
      modo o el usuario en la ficha), la aplicación lo DIGA en vez
      de callarse o de inventarse un mínimo.

   Uso:  ./preparar.sh  y luego  node elementos.mjs
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

/* ================================================================
   1. Una sola tabla
   ================================================================ */
bloque('1. Los 47, en una sola tabla');

const tabla = await T(() => {
  const g = window.__T;
  const E = g.ELEMENTOS_PUERTA;
  const claves = E.map(x => x.c);
  const medidas = g.MEDIDAS_PUERTA.map(m => m.c);
  const choques = claves.filter(c => medidas.indexOf(c) >= 0);
  const repes = claves.filter((c,i) => claves.indexOf(c) !== i);
  /* Toda clave de la tabla por familia tiene que existir en una de las dos
     listas. Una clave inventada no da error: ese campo no sale NUNCA. */
  const todas = claves.concat(medidas);
  const inventados = [];
  Object.keys(g.CAMPOS_FAMILIA).forEach(f => {
    const c = g.CAMPOS_FAMILIA[f];
    c.si.concat(c.op).forEach(k => { if (todas.indexOf(k) < 0) inventados.push(f+'.'+k); });
  });
  const bloques = {};
  E.forEach(x => { bloques[x.bloque] = (bloques[x.bloque] || 0) + 1; });
  return { n: E.length, ficha: E.filter(x => g.esDeFicha(x)).length,
           exp: E.filter(x => !g.esDeFicha(x)).length,
           choques, repes, inventados, bloques,
           sinAyuda: E.filter(x => !x.a).map(x => x.c) };
});
paso('son 47 elementos', tabla.n === 47, tabla.n);
paso('23 se preguntan en la ficha y 24 solo al documentar',
     tabla.ficha === 23 && tabla.exp === 24, tabla.ficha+' y '+tabla.exp);
paso('ninguna clave choca con una medida', tabla.choques.length === 0, tabla.choques.join(' '));
paso('ninguna clave está repetida', tabla.repes.length === 0, tabla.repes.join(' '));
paso('ninguna clave de la tabla por familia está inventada',
     tabla.inventados.length === 0, tabla.inventados.join(' '));
paso('todos tienen su explicación para el técnico',
     tabla.sinAyuda.length === 0, tabla.sinAyuda.join(' '));
paso('los cinco bloques están', Object.keys(tabla.bloques).length === 5,
     JSON.stringify(tabla.bloques));

bloque('2. La ficha no ha crecido');
/* Lo que se arregló el 24-11-2026 fue que el alta era «lento y tedioso». Si los
   24 elementos de documentar se colaran en el alta, se desharía. */
const alta = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  g.dlgPuerta(null);
  await new Promise(r => setTimeout(r, 600));
  const sel = document.getElementById('f-tipo');
  const pon = async t => {
    if (!Array.from(sel.options).some(o => o.value === t)){
      const o = document.createElement('option'); o.value = t; o.textContent = t;
      sel.appendChild(o);
    }
    sel.value = t; sel.dispatchEvent(new Event('change', { bubbles:true }));
    await new Promise(r => setTimeout(r, 120));
    return document.querySelectorAll('#vista, #dlg-form').length
      ? Array.from(document.querySelectorAll('#dlg-form [id^="f-caja-"]'))
          .filter(x => !x.hidden).length
      : -1;
  };
  const corredera = await pon('Corredera autoportante');
  const barrera   = await pon('Barrera');
  /* Y que NINGUNA caja de los de documentar esté dibujada.

     ---- Ojo con cómo se mide esto (25-11-2026) ----
     La primera versión sacaba la lista con !esDeFicha(x), que es LA MISMA
     función que se está probando. Al romper esDeFicha a propósito, la lista
     salía vacía y la prueba pasaba sin comprobar nada. Ahora se lee el dato
     crudo, x.donde, que es lo que la tabla dice, no lo que la función opina. */
  const deDoc = g.ELEMENTOS_PUERTA.filter(x => x.donde === 'exp').map(x => x.c);
  const colados = deDoc.filter(c => !!document.getElementById('f-caja-'+c));
  g.cerrarDlg();
  return { corredera, barrera, colados };
});
paso('en una corredera el alta no pasa de 40 campos a la vista',
     alta.corredera > 0 && alta.corredera <= 40, alta.corredera);
paso('y una barrera pide menos que una corredera',
     alta.barrera < alta.corredera, alta.barrera+' contra '+alta.corredera);
paso('ninguno de los 24 de documentar se ha colado en el alta',
     alta.colados.length === 0, alta.colados.join(' '));

/* ================================================================
   3. El expediente pide lo de SU puerta
   ================================================================ */
bloque('3. El expediente pide lo de la familia de la puerta');

const cat = await T(() => {
  const g = window.__T, S = g.S;
  const p = (S.puertas || [])[0];
  if (!p) return { sinDatos: true };
  const antes = p.tipo;
  const mide = (tipo, catalogo, familia) => {
    p.tipo = tipo;
    const e = { id:'e-prueba', puerta_id:p.id, familia, catalogo, datos:{} };
    const c = g.componentesDeExpediente(e);
    return { n: c.length, claves: c.map(x => x[0]) };
  };
  const barrera   = mide('Barrera', 'familia47', 'barrera');
  const seccional = mide('Seccional', 'familia47', 'industrial');
  const viejo     = mide('Barrera', null, 'barrera');
  const raro      = mide('Portón de los años ochenta', 'familia47', 'industrial');
  p.tipo = antes;
  return { sinDatos:false, barrera, seccional, viejo, raro };
});
paso('una barrera no pide lo de una seccional',
     cat.sinDatos || cat.barrera.n !== cat.seccional.n,
     cat.sinDatos ? '' : cat.barrera.n+' contra '+cat.seccional.n);
paso('a la barrera le pide el mástil y a la seccional no',
     cat.sinDatos || (cat.barrera.claves.indexOf('mastilel') >= 0 &&
                      cat.seccional.claves.indexOf('mastilel') < 0));
paso('a la seccional le pide el equilibrado y a la barrera no',
     cat.sinDatos || (cat.seccional.claves.indexOf('equilibrado') >= 0 &&
                      cat.barrera.claves.indexOf('equilibrado') < 0));
paso('a la barrera NO le pide juntas intumescentes',
     cat.sinDatos || cat.barrera.claves.indexOf('juntas') < 0);
paso('un expediente de antes sigue con el catálogo de antes',
     cat.sinDatos || cat.viejo.claves.indexOf('mastil') >= 0, cat.sinDatos?'':cat.viejo.n);
paso('y una puerta cuyo tipo no se reconoce usa el de antes, no los 47',
     cat.sinDatos || cat.raro.n < 47, cat.sinDatos?'':cat.raro.n);

/* ================================================================
   4. Las vías de la norma
   ================================================================ */
bloque('4. La norma pide VÍAS, no una lista');

const vias = await T(() => {
  const g = window.__T;
  const con = (modo, usuarios, comp) => {
    const e = { id:'e-v', puerta_id:null, familia:'industrial',
                datos:{ puerta:{ modo, usuarios }, comp: comp || {} } };
    return { vias: g.viasDeProteccion(e).map(v => ({ n:v.niveles, c:v.claves })),
             norma: g.clavesDeNorma(e),
             cumple: g.viaCumplida(e) };
  };
  return {
    // «C+D o E»: dos vías. Una es limitador+fotocélulas, la otra la banda
    mixto: con('automatico', 'no_informados'),
    // «A»: la norma no pide elementos, solo un pulsador mantenido
    hombre: con('hombre_presente', 'informados_privado'),
    // y si falta el modo o el usuario, no hay vías
    sinDatos: con('', ''),
    // cumplida por la vía corta: solo la banda
    porBanda: con('automatico', 'no_informados', { banda:{ estado:'si' } }),
    // cumplida por la vía larga: limitador + fotocélulas
    porLarga: con('automatico', 'no_informados',
                  { limitador:{ estado:'si' }, fotocelulas:{ estado:'si' } }),
    // a medias: solo el limitador, sin fotocélulas → NO cumple
    aMedias: con('automatico', 'no_informados', { limitador:{ estado:'si' } }),
  };
});
paso('un nivel «C+D o E» da DOS vías, no una lista de tres',
     vias.mixto.vias.length === 2, JSON.stringify(vias.mixto.vias));
paso('la vía larga es limitador más fotocélulas',
     vias.mixto.vias[0] && vias.mixto.vias[0].c.length === 2 &&
     vias.mixto.vias[0].c.indexOf('limitador') >= 0 &&
     vias.mixto.vias[0].c.indexOf('fotocelulas') >= 0,
     JSON.stringify(vias.mixto.vias[0]));
paso('y la corta es la banda sola',
     vias.mixto.vias[1] && vias.mixto.vias[1].c.length === 1 &&
     vias.mixto.vias[1].c[0] === 'banda', JSON.stringify(vias.mixto.vias[1]));
paso('con la banda sola, el mínimo queda cumplido',
     !!vias.porBanda.cumple && vias.porBanda.cumple.claves[0] === 'banda');
paso('con limitador y fotocélulas, también',
     !!vias.porLarga.cumple && vias.porLarga.cumple.claves.length === 2);
paso('con el limitador SOLO, NO queda cumplido: media vía no es una vía',
     vias.aMedias.cumple === null);
paso('a hombre presente la norma no le pide elementos de estos',
     vias.hombre.vias.length === 0, JSON.stringify(vias.hombre.vias));
paso('sin modo ni usuario no hay vías, y no se inventa un mínimo',
     vias.sinDatos.vias.length === 0 && vias.sinDatos.norma.length === 0);

bloque('5. Y la pantalla lo dice en vez de callarse');
const dice = await T(() => {
  const g = window.__T, S = g.S;
  /* Con una puerta DE VERDAD y con tipo. La primera versión de esta prueba la
     hice con puerta_id en nulo, y sin puerta no hay familia: «lo propio de esta
     puerta» salía vacío con razón y la prueba lo cantaba como fallo del código.
     Era fallo de la prueba. (25-11-2026) */
  const p = (S.puertas || [])[0];
  if (!p) return { sinDatos: true };
  const antes = p.tipo;
  p.tipo = 'Seccional';
  const e = { id:'e-d', puerta_id:p.id, familia:'industrial', catalogo:'familia47',
              datos:{ puerta:{}, comp:{} } };
  const h = g.expSecComponentes ? g.expSecComponentes(e) : '';
  const con = { id:'e-d2', puerta_id:p.id, familia:'industrial', catalogo:'familia47',
                datos:{ puerta:{ modo:'automatico', usuarios:'no_informados' }, comp:{} } };
  const h2 = g.expSecComponentes ? g.expSecComponentes(con) : '';
  p.tipo = antes;
  return {
    sinDatos: false,
    sinModo: /No se puede decir qué exige la norma/.test(h) &&
             /cómo se acciona/.test(h) && /quién la/.test(h),
    conModo: /Lo que exige la norma para esta puerta/.test(h2),
    vias:    /Con cumplir UNA de estas vías basta/.test(h2),
    criterio:/Lo que puede llevar, y lo decides tú/.test(h2),
    propio:  /Lo propio de esta puerta/.test(h2),
    caveat:  /pendiente de validar/i.test(h2) && /no acredita/.test(h2),
  };
});
paso('sin modo ni usuario, dice que no se puede saber y qué falta',
     dice.sinDatos || dice.sinModo === true);
paso('con ellos, enseña el grupo de la norma primero', dice.sinDatos || dice.conModo === true);
paso('y avisa de que con una vía basta', dice.sinDatos || dice.vias === true);
paso('el grupo de lo propio del producto está', dice.sinDatos || dice.propio === true);
paso('el grupo de lo que decide el instalador está', dice.sinDatos || dice.criterio === true);
paso('y sigue diciendo que la matriz está pendiente de validar',
     dice.sinDatos || dice.caveat === true);

/* ================================================================
   6. El puente con el inventario de la puerta
   ================================================================ */
bloque('6. Las claves de antes se traducen');
const puente = await T(() => {
  const g = window.__T;
  const casos = [
    ['destellante','industrial','luz'], ['paro','industrial','seta'],
    ['presencia','peatonal','radar'],   ['laterales','peatonal','dedos'],
    ['operador','peatonal','motor'],    ['radar_ext','peatonal','sensorap'],
    ['radar_int','peatonal','sensorap'],['mandos','industrial','receptor'],
    ['deteccion','cortafuegos','incendios'], ['etiqueta','cortafuegos','etiquetaei'],
    ['mastil','barrera','mastilel'],
    // el caso raro: el mismo nombre para dos cosas distintas
    ['selector','peatonal','selectorprog'],
    ['selector','cortafuegos','selectorcierre'],
    // y lo que se llama igual no se toca
    ['fotocelulas','industrial','fotocelulas'], ['banda','barrera','banda'],
  ];
  return casos.map(([v, f, esperado]) => [v, f, esperado, g.claveNueva(v, f)]);
});
puente.forEach(([v, f, esp, got]) => {
  paso('«'+v+'» en '+f+' → '+esp, got === esp, got);
});

bloque('7. El aviso de que falta el SQL');
const marca = await T(() => {
  const g = window.__T;
  const c = (g.QUE_HACE_FALTA || []).find(x => x.marca === 'sinCatalogo');
  return c ? { fichero: c.fichero, dice: !!c.pierdes } : null;
});
paso('dice qué fichero es y qué se pierde sin él',
     !!marca && marca.fichero === 'elementos-unificados.sql' && marca.dice,
     marca && marca.fichero);

console.log('\n── '+ok+' bien, '+mal+' mal ──────────────────────');
await nav.close();
process.exit(mal ? 1 : 0);
