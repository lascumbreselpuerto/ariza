/* ================================================================
   normas.mjs — Lo que la aplicación afirma sobre las normas
                                                     13-11-2026

   DE DÓNDE SALE
   David compró el extracto oficial de la UNE-EN 12453:2018+A1 y me
   lo pasó. Al contrastarlo apareció esto: el libro de mantenimiento
   que recibe el cliente afirmaba que la 12453 «recoge lo que antes
   estaba en la UNE-EN 12635, hoy anulada». El extracto oficial dice
   solo que «anula y sustituye a la Norma UNE-EN 12453:2018». De la
   12635 no dice nada. Venía de una ficha de catálogo, no de la norma.

   POR QUÉ ESTA SUITE EXISTE
   Porque ese fallo no lo caza ningún banco de pruebas que mire si la
   aplicación funciona: funcionaba perfectamente, imprimiendo una
   afirmación que nadie había verificado. Y va en un papel que se
   queda el cliente.

   Así que aquí se vigila otra cosa: QUÉ AFIRMA LA APLICACIÓN SOBRE
   LAS NORMAS, y si cada afirmación tiene detrás algo comprobado.

   LA REGLA DE FONDO
   De una norma que no se tiene se puede decir su título, su fecha y
   su estado, porque eso está en el catálogo público. Lo que NO se
   puede es afirmar su CONTENIDO. Y lo que se interpreta se dice que
   se interpreta.
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
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    /* Un expediente, para poder mirar el libro de mantenimiento DE VERDAD y no
       solo el código que lo escribe. Es la diferencia entre comprobar lo que
       se imprime y comprobar lo que uno cree que se imprime. */
    const pu = db.puertas[0];
    db.expedientes.push({
      id:'exp-n1', puerta_id: pu.id, cliente_id: pu.cliente_id,
      familia:'industrial', situacion:'adecuacion', estado:'situacion',
      datos:{ puerta:{ tipo:'Corredera autoportante' } },
      creado:new Date().toISOString(),
    });
  };
});
const errores = [];
const esLaLetraDeGoogle = t => /fonts\.(googleapis|gstatic)\.com/.test(t) ||
  /Failed to load resource/.test(t);
const pag = await ctx.newPage();
pag.on('console', m => { if (m.type() === 'error' && !esLaLetraDeGoogle(m.text())) errores.push(m.text()); });
pag.on('pageerror', e => errores.push(String(e)));
await pag.goto(URL_APP);
await pag.waitForFunction(() => window.__T && window.__T.S && window.__T.S.perfil, null, { timeout: 30000 });
const T = (f, arg) => arg === undefined ? pag.evaluate(f) : pag.evaluate(f, arg);

let ok = 0, mal = 0;
const paso = (t, bien, detalle) => {
  if (bien){ ok++; console.log('  OK  '+t+(detalle!==undefined?' → '+detalle:'')); }
  else { mal++; console.log(' FALLA '+t+(detalle!==undefined?' → '+detalle:'')); }
};
const bloque = t => console.log('\n· '+t);

/* El texto del programa SIN los comentarios. Hace falta quitarlos: esta misma
   entrega dejó escrito en un comentario POR QUÉ se retiró la frase de la 12635,
   y ese comentario hacía saltar la prueba. Un comentario que explica un error
   corregido no es el error. (13-11-2026) */
const FUENTE = (await T(() => document.documentElement.outerHTML))
  .replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ================================================================
   1. Lo de la 12635, que es de donde salió todo
   ================================================================ */
bloque('1. No se afirma lo que la norma no dice');

paso('no se afirma que la 12453 recogiera lo de la UNE-EN 12635',
  !/12453[^<]{0,160}12635|12635[^<]{0,80}anulada/i.test(FUENTE));

/* Y el libro de mantenimiento sigue diciendo con qué norma se hizo */
const libro = await T(async () => {
  const g = window.__T;
  const e = (g.S.expedientes || [])[0];
  if (!e) return { sinExpediente:true };
  let h = '';
  const abrir = window.open;
  window.open = () => ({ document:{ write: t => { h += t; }, close(){} } });
  try { g.libroMantenimiento(e.id, true); } catch(err){ h += ' ERROR:'+err.message; }
  window.open = abrir;
  return { h, cita: /UNE-EN 12453:2018\+A1:2022/.test(h), de12635: /12635/.test(h) };
});
if (libro.sinExpediente) paso('el simulador no trae expediente: no se mira el libro', true, 'saltado');
else {
  paso('el libro de mantenimiento sigue citando la norma que aplica', libro.cita === true);
  paso('y ya no nombra la 12635',                                    libro.de12635 === false);
}

/* ================================================================
   2. La matriz sigue diciendo lo que es
   ================================================================ */
bloque('2. La matriz no se vende como norma');

const matriz = await T(() => {
  const g = window.__T;
  return {
    /* El origen tiene que seguir constando. Si alguien lo quita, esto salta. */
    diceQueEsInterpretacion: /interpretación/i.test(document.documentElement.outerHTML),
    validada: !!(g.FUERZA_12453 && g.FUERZA_12453.validado),
    fuenteFuerzas: g.FUERZA_12453 ? g.FUERZA_12453.fuente : '',
    apartados: g.FUERZA_12453 ? g.FUERZA_12453.apartados : '',
    noAplicaA: (g.MATRIZ_NO_APLICA_A || []).slice(),
  };
});
paso('la matriz sigue diciendo que es una interpretación', matriz.diceQueEsInterpretacion === true);
paso('las fuerzas, en cambio, constan como validadas', matriz.validada === true);
paso('y con el apartado del que salen', /anexo A\.2/.test(matriz.apartados), matriz.apartados.slice(0,46)+'…');
paso('y con quién las leyó', /ejemplar de la norma/.test(matriz.fuenteFuerzas));
paso('las peatonales siguen fuera de esta matriz',
  matriz.noAplicaA.indexOf('peatonal') >= 0);

/* ================================================================
   3. El campo de aplicación, en palabras de la norma
   ================================================================ */
bloque('3. El campo de aplicación está escrito como lo escribe la norma');

const ambito = await T(() => {
  const a = window.__T.AMBITO_12453 || {};
  return {
    hay: !!a.cubre,
    peatonales: (a.excluye||[]).some(x => /peatones/i.test(x)),
    barrerasVias: (a.excluye||[]).some(x => /vías de automoción/i.test(x)),
    zonasAccesibles: /zonas accesibles para las personas/i.test(a.cubre || ''),
    anteriores: /no es aplicable a la maquinaria fabricada antes/i.test(a.anteriores || ''),
    fuente: a.fuente || '',
  };
});
paso('está recogido el campo de aplicación',            ambito.hay === true);
paso('con la exclusión de las peatonales',              ambito.peatonales === true);
paso('y la de las barreras de vías de automoción',      ambito.barrerasVias === true);
paso('y lo de las zonas accesibles a personas',         ambito.zonasAccesibles === true);
paso('y la maquinaria anterior a la publicación',       ambito.anteriores === true);
paso('diciendo de dónde sale',                          /extracto oficial/i.test(ambito.fuente));

/* Y donde más falta hace: al adecuar una puerta vieja */
const adec = await T(() => window.__T.EXP_SIT_AYUDA.adecuacion || '');
paso('el aviso de la maquinaria anterior sale en la adecuación',
  /fabricada antes de su fecha de publicación/i.test(adec));

/* ================================================================
   4. Las citas, con su apartado
   ================================================================ */
bloque('4. Se cita el apartado, no la norma a secas');

const citas = await T(() => {
  const g = window.__T;
  const r = {};
  ['industrial','barrera','cortafuegos'].forEach(f => {
    const fila = (g.EXP_NORMAS[f]||[]).find(x => /12453/.test(x[0]));
    r[f] = fila ? /5\.1\.3/.test(fila[1]) : null;
  });
  /* La 12978: hay que avisar de que la 12453 remite a otra edición */
  const n78 = (g.EXP_NORMAS.industrial||[]).find(x => /12978/.test(x[0]));
  r.avisa12978 = n78 ? /edición citada/i.test(n78[1]) : false;
  /* Y las peatonales NO deben citar la 12453: están fuera de su ámbito */
  r.peatonalSin12453 = !(g.EXP_NORMAS.peatonal||[]).some(x => /12453/.test(x[0]));
  return r;
});
paso('en industrial se cita el apartado 5.1.3',   citas.industrial === true);
paso('en barrera también',                        citas.barrera === true);
paso('en cortafuegos también',                    citas.cortafuegos === true);
paso('se avisa de la edición que exige la 12978', citas.avisa12978 === true);
paso('LAS PEATONALES NO CITAN LA 12453, que las excluye', citas.peatonalSin12453 === true);

/* ================================================================
   5. Lo que NO se ha verificado no se afirma
   ================================================================
   Dos datos venían de una síntesis de terceros y se quedaron fuera a
   propósito: el nivel de prestaciones del sistema de mando (PL c y
   categoría 2) y los 2,5 m de altura de los puntos peligrosos. Si
   algún día alguien los mete sin tener la norma delante, esto salta.
   ================================================================ */
bloque('5. Lo no verificado sigue fuera');

paso('no se afirma un nivel PL concreto',
  !/\bPL ?c\b|nivel de prestaciones [a-e]\b/i.test(FUENTE));
paso('no se afirma la altura de 2,5 m como criterio de la 12453',
  !/2,5 ?m[^<]{0,80}(12453|puntos peligrosos)/i.test(FUENTE));

/* ================================================================
   Final
   ================================================================ */
console.log('\n'+ok+' bien, '+mal+' mal.');
if (errores.length) console.log('Errores de JavaScript:\n'+errores.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || errores.length ? 1 : 0);
