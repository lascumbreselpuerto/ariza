/* ================================================================
   plegado.mjs — el guion del parte, plegado por bloques.
                                                      07-11-2026

   POR QUÉ EXISTE
   David, revisando la aplicación en campo: «Esto lo haría tipo
   desplegable para que no nos haga muy intensa la vista general del
   parte. Esto de hacer desplegable lo utilizaría en todas las partes
   de la app donde hubiera que elegir entre puntos.» Y eligió empezar
   por el guion de revisión, que es la lista más larga que hay.

   LAS DOS DECISIONES QUE SE VIGILAN AQUÍ
     1. Al abrir el parte se abre EL PRIMER bloque que tenga algo sin
        marcar, y los que están completos salen plegados. Al volver a
        un parte a medias, el técnico cae donde lo dejó.
     2. El bloque crítico de seguridad NO SE PLIEGA NUNCA. Son los
        puntos por los que responde la empresa si pasa algo, y un
        bloque plegado es un bloque que se puede dejar sin abrir y
        firmar el parte igual.

   Y una tercera que no es una decisión, sino un fallo que había que
   evitar: la colocación se hace UNA vez al abrir. Si se repitiera en
   cada marca, el bloque se cerraría solo justo cuando el técnico
   marca el último punto, con él dentro.
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
const ctx = await nav.newContext({ viewport:{width:1320,height:2200},
  locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    const cli = db.puertas[0].cliente_id;
    db.puertas[0].tipo = 'Corredera autoportante';
    /* Una preventiva nueva, sin nada marcado */
    db.avisos.push({ id:'pl-1', tipo:'mantenimiento', estado:'asignado', prioridad:'programada',
      tecnico_id:'usuario-admin', cliente_id:cli, puerta_id:db.puertas[0].id,
      descripcion:'Revisión anual', creado:new Date().toISOString() });
    /* Y otra igual, para dejarla a medias y volver a entrar */
    db.avisos.push({ id:'pl-2', tipo:'mantenimiento', estado:'asignado', prioridad:'programada',
      tecnico_id:'usuario-admin', cliente_id:cli, puerta_id:db.puertas[0].id,
      descripcion:'Revisión anual de la nave 2', creado:new Date().toISOString() });
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

const faltan = await T(() => window.__T_FALTAN || []);
paso('el banco ve todas las funciones nuevas', faltan.length === 0, faltan.join(' · '));

/* ================================================================
   1. Qué bloque no se pliega
   ================================================================ */
bloque('1. El bloque crítico');

const regla = await T(() => {
  const g = window.__T;
  return {
    critico: g.bloqueCritico('Seguridad (bloque crítico)'),
    mayus: g.bloqueCritico('SEGURIDAD'),
    sinTilde: g.bloqueCritico('Bloque critico'),
    doc: g.bloqueCritico('Documentación e identificación'),
    mec: g.bloqueCritico('Estructura y mecánica'),
    elec: g.bloqueCritico('Instalación eléctrica'),
    propio: g.bloqueCritico('Propio de corredera'),
    vacio: g.bloqueCritico(''),
    nulo: g.bloqueCritico(null),
  };
});
paso('el bloque de seguridad se reconoce', regla.critico === true);
paso('aunque esté escrito en mayúsculas o sin tilde',
  regla.mayus === true && regla.sinTilde === true);
paso('y los demás bloques no son críticos',
  [regla.doc, regla.mec, regla.elec, regla.propio].every(x => x === false));
paso('un título vacío no revienta', regla.vacio === false && regla.nulo === false);

/* ================================================================
   2. Un parte nuevo: se abre por el primero
   ================================================================ */
bloque('2. Al abrir un parte nuevo');

const nuevo = await T(async () => {
  const g = window.__T;
  g.dlgCierre('pl-1');
  await new Promise(r => setTimeout(r, 1600));
  const bloques = [...document.querySelectorAll('#dlg-form .g-bloque')];
  const plegables = [...document.querySelectorAll('#dlg-form details.g-bloque')];
  const fijos = [...document.querySelectorAll('#dlg-form section.g-bloque.g-fijo')];
  return {
    cuantos: bloques.length,
    plegables: plegables.length,
    fijos: fijos.length,
    tituloFijo: fijos.length ? fijos[0].querySelector('.g-cab').textContent : '',
    abiertos: plegables.filter(d => d.open).length,
    cualAbierto: (plegables.find(d => d.open) || {}) === plegables[0],
    /* el fijo tiene sus puntos a la vista sin tocar nada */
    puntosFijo: fijos.length ? fijos[0].querySelectorAll('.g-punto').length : 0,
    /* y lleva los puntos de verdad, no una cabecera suelta */
    tieneFuerza: fijos.length ? /fuerza/i.test(fijos[0].textContent) : false,
    tieneFoto: fijos.length ? /fotoc[ée]lula/i.test(fijos[0].textContent) : false,
    cuentas: [...document.querySelectorAll('#dlg-form .g-cuenta')].map(s => s.textContent),
  };
});
paso('el guion sale partido en bloques', nuevo.cuantos >= 6, nuevo.cuantos);
paso('uno de ellos es el crítico y no es plegable', nuevo.fijos === 1, nuevo.fijos);
paso('y se dice en su cabecera que está siempre a la vista',
  /siempre a la vista/.test(nuevo.tituloFijo), nuevo.tituloFijo);
paso('el crítico enseña sus puntos sin tocar nada', nuevo.puntosFijo > 5, nuevo.puntosFijo);
paso('y son los de verdad: fuerzas y fotocélulas',
  nuevo.tieneFuerza === true && nuevo.tieneFoto === true);
paso('de los plegables se abre solo uno', nuevo.abiertos === 1, nuevo.abiertos);
paso('y es el primero, que es por donde se empieza', nuevo.cualAbierto === true);
/* La cuenta de cada bloque es lo que permite saber lo que falta sin abrirlo: si
   no estuviera, plegar sería esconder. */
paso('cada bloque dice cuántos puntos lleva hechos',
  nuevo.cuentas.length === nuevo.cuantos && nuevo.cuentas.every(t => /^\d+\/\d+$/.test(t)),
  nuevo.cuentas.join(' · '));

/* ================================================================
   3. Marcar no cierra el bloque donde estás
   ================================================================ */
bloque('3. Marcando puntos');

const marcando = await T(async () => {
  const g = window.__T;
  const det = document.querySelector('#dlg-form details.g-bloque');
  /* «Todo bien» en el primer bloque: lo deja completo */
  det.querySelector('[data-act="g-todo"]').click();
  await new Promise(r => setTimeout(r, 400));
  const cuenta = det.querySelector('.g-cuenta');
  return { sigueAbierto: det.open, texto: cuenta.textContent,
           verde: (cuenta.style.color || '').length > 0,
           /* y el de al lado sigue plegado: no se abre solo al terminar el otro */
           siguientePlegado: !document.querySelectorAll('#dlg-form details.g-bloque')[1].open };
});
/* Esto es el fallo que había que evitar: cerrar el bloque con el técnico dentro */
paso('al completar un bloque NO se cierra solo', marcando.sigueAbierto === true);
paso('su cuenta queda completa', /^(\d+)\/\1$/.test(marcando.texto), marcando.texto);
paso('y se pone en verde, que se ve de un vistazo', marcando.verde === true);
paso('el bloque siguiente no se abre solo', marcando.siguientePlegado === true);

/* ================================================================
   4. Volver a un parte a medias
   ================================================================ */
bloque('4. Volver a lo que estaba a medias');

const aMedias = await T(async () => {
  const g = window.__T;
  /* Se guarda una revisión con el PRIMER bloque entero hecho y el resto no.
     Es lo que deja un técnico que se queda sin batería a mitad. */
  const cont = document.querySelector('#dlg-form .guion');
  const rev = g.leerGuion(cont);
  const hechos = (rev.puntos || []).filter(p => p.r).length;
  await g.sb.from('revisiones').insert({ aviso_id:'pl-2', puerta_id: cont.dataset.puerta,
    tipo_puerta: cont.dataset.tipo, fecha: g.hoy(), resultado:'apta',
    puntos: rev.puntos });
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 500));
  await g.cargar();
  g.dlgCierre('pl-2');
  await new Promise(r => setTimeout(r, 1800));
  const plegables = [...document.querySelectorAll('#dlg-form details.g-bloque')];
  const cuentas = plegables.map(d => d.querySelector('.g-cuenta').textContent);
  const abierto = plegables.findIndex(d => d.open);
  const completo = c => { const m = /^(\d+)\/(\d+)$/.exec(c); return m && m[1] === m[2]; };
  const r = { hechos, cuentas, abierto,
    primeroCompleto: completo(cuentas[0]),
    primeroPlegado: !plegables[0].open,
    abiertos: plegables.filter(d => d.open).length,
    /* el abierto tiene que ser el primero que NO esté completo */
    abiertoIncompleto: abierto >= 0 ? !completo(cuentas[abierto]) : false,
    anterioresCompletos: abierto >= 0
      ? cuentas.slice(0, abierto).every(completo) : false };
  g.cerrarDlg();
  return r;
});
paso('la revisión a medias traía puntos marcados', aMedias.hechos > 0, aMedias.hechos);
paso('al volver, lo marcado sigue ahí', aMedias.primeroCompleto === true,
  aMedias.cuentas.join(' · '));
/* Lo que está hecho se quita de en medio: eso es lo que pidió David */
paso('el bloque que estaba completo sale plegado', aMedias.primeroPlegado === true);
paso('se abre uno solo', aMedias.abiertos === 1, aMedias.abiertos);
paso('y es el primero que tiene algo sin marcar', aMedias.abiertoIncompleto === true,
  'abierto el bloque '+aMedias.abierto);
paso('los de antes estaban todos completos', aMedias.anterioresCompletos === true);

/* ================================================================
   5. Lo que ya funcionaba sigue funcionando
   ================================================================ */
bloque('5. Lo de antes');

const antes = await T(async () => {
  const g = window.__T;
  g.dlgCierre('pl-1');
  await new Promise(r => setTimeout(r, 1600));
  const fijo = document.querySelector('#dlg-form section.g-bloque.g-fijo');
  /* «Todo bien» dentro del bloque crítico tiene que seguir marcando SUS puntos
     y no los de otro bloque: el botón busca su bloque con closest(). */
  fijo.querySelector('[data-act="g-todo"]').click();
  await new Promise(r => setTimeout(r, 400));
  const sinMarcar = [...fijo.querySelectorAll('.g-punto')]
    .filter(d => !d.querySelector('.g-resp button[aria-pressed="true"]')).length;
  const cuentaFijo = fijo.querySelector('.g-cuenta').textContent;
  /* Y marcar en el crítico no ha tocado el primer bloque plegable */
  const otro = document.querySelector('#dlg-form details.g-bloque');
  const marcadosOtro = otro.querySelectorAll('.g-resp button[aria-pressed="true"]').length;
  /* La guía de «cómo se comprueba» sigue dentro de los puntos */
  const ayudas = document.querySelectorAll('#dlg-form .g-ayuda').length;
  const r = { sinMarcar, cuentaFijo, marcadosOtro, ayudas };
  g.cerrarDlg();
  return r;
});
paso('«Todo bien» marca los puntos del bloque crítico', antes.sinMarcar === 0, antes.sinMarcar);
paso('y su cuenta lo refleja', /^(\d+)\/\1$/.test(antes.cuentaFijo), antes.cuentaFijo);
/* El fallo clásico al cambiar la forma de los bloques: que el botón de uno
   marque los puntos de otro. */
paso('sin tocar los puntos de los demás bloques', antes.marcadosOtro === 0, antes.marcadosOtro);
paso('la guía de «cómo se comprueba» sigue en su sitio', antes.ayudas > 0, antes.ayudas);

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
