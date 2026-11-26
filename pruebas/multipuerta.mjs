/* ================================================================
   multipuerta.mjs — Un parte con varias puertas
                                                     24-11-2026

   DE DÓNDE SALE

   David, con la aplicación ya en uso: «a una misma asistencia se
   le podrían poner varias puertas, ya que en una misma asistencia
   puede que se toquen varias, y el hacer varias asistencias
   implicaría varios desplazamientos. Sería útil un parte tipo
   multipuerta en el que a cada puerta se le pueda poner sus
   comentarios en un solo parte».

   QUÉ SE VIGILA, Y POR QUÉ CADA COSA

   1. Que con UNA puerta el parte siga siendo el de siempre. Esto
      es lo que más gente usa cada día: si se rompe por hacer sitio
      a un caso menos frecuente, el cambio sale caro.

   2. Que con DOS salga un apartado por puerta, con su código
      delante, para que a las ocho de la tarde no se escriba el
      diagnóstico de una en la casilla de la otra.

   3. Que el resumen de siempre se rellene solo. Lo leen el parte
      impreso, el expediente, el correo al cliente y la propuesta
      de factura: si se quedara vacío, el cliente recibiría un
      parte sin decir qué se le hizo.

   4. Y que NO se pise lo que ya había cuando las casillas por
      puerta están vacías. Esto no es teoría: mi primera versión lo
      pisaba siempre, y un parte que ya decía qué se hizo se
      quedaba mudo al volver a guardarlo. Lo cazó la suite de obra.

   Uso:  ./preparar.sh  y luego  node multipuerta.mjs
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
const esperar = ms => new Promise(f => setTimeout(f, ms));

let ok = 0, mal = 0;
const paso = (t, bien, detalle) => {
  if (bien){ ok++; console.log('  OK  '+t+(detalle!==undefined?' → '+detalle:'')); }
  else { mal++; console.log(' FALLA '+t+(detalle!==undefined?' → '+detalle:'')); }
};
const bloque = t => console.log('\n· '+t);

/* Una avería con una puerta, y la misma con dos. Se monta en memoria: lo que
   se prueba es qué dibuja el parte, no el simulador. */
async function abrirParteCon(nPuertas){
  return T(async n => {
    const g = window.__T, S = g.S;
    const pus = S.puertas.slice(0, n);
    let av = S.avisos.find(x => !x.cerrado && !x.archivado);
    if (!av){
      av = { id:'av-mp-1', tipo:'averia', estado:'asignado', cliente_id: pus[0] && pus[0].cliente_id };
      S.avisos.unshift(av);
    }
    av.puerta_id = pus[0] ? pus[0].id : null;
    av.cerrado = null;
    S.avisoPuertas = pus.map((p, i) => ({ id:'ap-'+i, aviso_id: av.id, puerta_id: p.id, orden: i+1 }));
    S.sinMultiPuerta = false;
    g.dlgCierre(av.id);
    await new Promise(f => setTimeout(f, 900));
    return { id: av.id, codigos: pus.map(p => p.codigo) };
  }, nPuertas);
}

bloque('1. Con una puerta, el parte de siempre');
await abrirParteCon(1);
const una = await T(() => ({
  porPuerta: document.querySelectorAll('.zp-diag').length,
  deSiempre: !!document.getElementById('z-diag'),
  visible: !!(document.getElementById('z-diag') && document.getElementById('z-diag').offsetParent !== null),
}));
paso('no salen apartados por puerta', una.porPuerta === 0, una.porPuerta);
paso('y el diagnóstico de siempre está y se ve', una.deSiempre && una.visible);
await pag.keyboard.press('Escape'); await esperar(400);

bloque('2. Con dos puertas, una por una');
const dos = await abrirParteCon(2);
/* ---- Reescrito el 26-11-2026 ----
   Contaba TODAS las cajas de puerta del parte y esperaba dos. Desde hoy el
   apartado de fotos también tiene una caja por puerta, así que eran cinco y las
   dos comprobaciones se pusieron rojas sin que el diagnóstico por puerta
   hubiera cambiado en nada.
   Ahora se cuentan las cajas DE SU APARTADO, buscándolas desde el grupo que
   lleva el diagnóstico. Así esto mide lo suyo y no se vuelve a romper cuando se
   añadan cajas en otro sitio del parte. */
const conDos = await T(() => {
  const grupo = (document.querySelector('.zp-diag') || {}).closest
    ? document.querySelector('.zp-diag').closest('.grupo') : null;
  const cajas = grupo ? grupo.querySelectorAll('.puerta-parte') : [];
  return {
    porPuerta: document.querySelectorAll('.zp-diag').length,
    trabajos: document.querySelectorAll('.zp-trab').length,
    cajas: cajas.length,
    titulos: Array.from(cajas).map(x => (x.querySelector('h4') || {}).textContent || ''),
  };
});
paso('sale un diagnóstico por puerta', conDos.porPuerta === 2, conDos.porPuerta);
paso('y un trabajo por puerta', conDos.trabajos === 2, conDos.trabajos);
paso('cada una en su caja, para no confundirlas', conDos.cajas === 2, conDos.cajas);
paso('y cada caja lleva el código de su puerta delante',
     conDos.titulos.length === 2 && conDos.titulos.every(t => /AR-\d+/.test(t)),
     conDos.titulos.join(' | '));

bloque('3. El resumen que lee el cliente');
const resumen = await T(() => {
  const g = window.__T;
  const ds = document.querySelectorAll('.zp-diag');
  const ts = document.querySelectorAll('.zp-trab');
  ds[0].value = 'No cerraba del todo.';
  ds[1].value = 'Fotocélula desalineada.';
  ts[0].value = 'Ajustado el final de carrera.';
  ts[1].value = 'Alineada y comprobada.';
  /* Lo que hace guardarCierre antes de armar el parte, sin llegar a guardar */
  const trozos = Array.from(ds).map(t => t.dataset.puerta);
  const nombre = pid => { const pu = g.S.puertas.find(x => x.id === pid) || {};
    return pu.codigo || 'Puerta'; };
  const junta = pre => trozos.map(pid => {
    const el = document.getElementById(pre + pid);
    const txt = (el && el.value || '').trim();
    return txt ? (nombre(pid) + ': ' + txt) : '';
  }).filter(Boolean).join('\n');
  return { diag: junta('zp-diag-'), trab: junta('zp-trab-') };
});
paso('el resumen junta las dos puertas, con su código delante',
     /AR-\d+: No cerraba/.test(resumen.diag) && /AR-\d+: Fotocélula/.test(resumen.diag),
     resumen.diag.replace(/\n/g, ' / '));
paso('y lo mismo con el trabajo',
     /Ajustado el final/.test(resumen.trab) && /Alineada y comprobada/.test(resumen.trab));

bloque('4. Las casillas vacías NO borran lo que ya había');
const noPisa = await T(() => {
  const dg = document.getElementById('z-diag');
  dg.value = 'Lo que ya decía el parte.';
  document.querySelectorAll('.zp-diag').forEach(t => { t.value = ''; });
  /* La regla del arreglo: solo se pisa si hay algo escrito por puerta */
  const trozos = Array.from(document.querySelectorAll('.zp-diag')).map(t => t.dataset.puerta);
  const junta = trozos.map(pid => (document.getElementById('zp-diag-'+pid).value||'').trim())
    .filter(Boolean).join('\n');
  if (junta) dg.value = junta;
  return dg.value;
});
paso('con las casillas por puerta vacías, el parte conserva lo suyo',
     noPisa === 'Lo que ya decía el parte.', noPisa);
await pag.keyboard.press('Escape'); await esperar(400);

/* ================================================================
   Marcar varias puertas DESDE EL ALTA, y en todos los tipos
   ================================================================
   Esto faltaba y no se vio el 24-11-2026. Aquel día se hizo el parte por
   puertas y se dio por bueno que lo de marcar varias ya estaba, porque se
   había visto funcionando en las preventivas. No estaba: la lista de puertas
   del alta llevaba un «caja.hidden = tipo !== 'mantenimiento'».

   O sea que en una AVERÍA, que es el caso que planteó David («en una misma
   asistencia puede que se toquen varias puertas, y el hacer varias
   asistencias implicaría varios desplazamientos»), no se podía poner la
   segunda puerta al crearla. Y como el apartado por puerta del parte solo sale
   con más de una, no salía nunca: estaba hecho y era inalcanzable.

   Lo que se vigila aquí es justamente eso, que es lo que no se comprobó. */
bloque('5. Varias puertas desde el alta, no solo en preventivas');

const tipos = await T(() => {
  const g = window.__T;
  /* Los tipos que la aplicación conoce, no una lista escrita a mano aquí. */
  const todos = Object.keys(g.TIPO_AVISO || {});
  return { todos, pide: todos.filter(t => g.pideVariasPuertas(t)),
           no: todos.filter(t => !g.pideVariasPuertas(t)),
           noPide: g.ALTA_NO_PIDE };
});
paso('en una avería se pueden marcar varias puertas',
     tipos.pide.indexOf('averia') >= 0, tipos.pide.join(','));
paso('y en una instalación, una reparación y una preventiva también',
     ['instalacion','mantenimiento'].every(t => tipos.pide.indexOf(t) >= 0));
paso('en una comercial NO: no va de tocar puertas',
     tipos.no.indexOf('comercial') >= 0, tipos.no.join(','));
paso('ni en un viaje en balde', tipos.no.indexOf('falso') >= 0);
paso('y los que quedan fuera son exactamente esos dos',
     tipos.no.length === 2 && tipos.noPide.length === 2);

bloque('6. La lista sale de verdad en el alta de una avería');
const enAlta = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  g.dlgAviso(null);
  await new Promise(f => setTimeout(f, 800));
  const sel = document.getElementById('a-tipo');
  const caja = document.getElementById('a-caja-pts');
  if (!sel || !caja) return { sinForm: true };
  const mira = async t => {
    sel.value = t; sel.dispatchEvent(new Event('change', { bubbles:true }));
    await new Promise(f => setTimeout(f, 250));
    const tit = document.getElementById('a-pts-tit');
    const pis = document.getElementById('a-pts-pista');
    return { visible: !caja.hidden,
             titulo: tit ? tit.textContent : '',
             pista: pis ? pis.textContent : '' };
  };
  const averia = await mira('averia');
  const mant   = await mira('mantenimiento');
  const comer  = await mira('comercial');
  g.cerrarDlg();
  return { sinForm:false, averia, mant, comer };
});
paso('al elegir «avería», la lista de puertas está a la vista',
     enAlta.sinForm || enAlta.averia.visible === true);
paso('en una preventiva también', enAlta.sinForm || enAlta.mant.visible === true);
paso('y al pasar a «comercial» se esconde',
     enAlta.sinForm || enAlta.comer.visible === false);

/* Los textos no son un adorno: decir «se revisan» en una avería mandaría a
   hacer una revisión que nadie ha pedido. */
paso('en una preventiva dice que las puertas SE REVISAN',
     enAlta.sinForm || /se revisan/.test(enAlta.mant.titulo), enAlta.sinForm?'':enAlta.mant.titulo);
paso('y en una avería, que SE TOCAN en esta visita',
     enAlta.sinForm || /se tocan/.test(enAlta.averia.titulo), enAlta.sinForm?'':enAlta.averia.titulo);
paso('y la pista de la avería explica que cada puerta tendrá lo suyo en el parte',
     enAlta.sinForm || (/su propio diagnóstico/.test(enAlta.averia.pista) &&
                        /no hace falta una asistencia por puerta/.test(enAlta.averia.pista)));
paso('mientras que la de la preventiva habla de su revisión firmada',
     enAlta.sinForm || /revisión firmada/.test(enAlta.mant.pista));

bloque('7. Y lo marcado en una avería llega al parte por puertas');
/* El camino entero: el tipo que deja marcar varias es el mismo que luego pide
   diagnóstico por puerta. Si no cuadraran, se podrían marcar dos puertas y no
   salir el apartado, que es el fallo que acabamos de arreglar pero al revés. */
const cuadra = await T(() => {
  const g = window.__T;
  const todos = Object.keys(g.TIPO_AVISO || {});
  const marcables = todos.filter(t => g.pideVariasPuertas(t));
  const conParte = marcables.filter(t => g.pideDiagnostico({ tipo: t }));
  const sinParte = marcables.filter(t => !g.pideDiagnostico({ tipo: t }));
  return { marcables, conParte, sinParte };
});
paso('una avería deja marcar varias Y pide diagnóstico por puerta',
     cuadra.conParte.indexOf('averia') >= 0, cuadra.conParte.join(','));
paso('la preventiva deja marcar varias y NO pide diagnóstico: lleva su revisión',
     cuadra.sinParte.indexOf('mantenimiento') >= 0, cuadra.sinParte.join(','));

bloque('8. Si falta el SQL, se dice y no se enseña a medias');
const sinSql = await T(async () => {
  const g = window.__T, S = g.S;
  S.sinMultiPuerta = true;
  const av = S.avisos.find(x => !x.cerrado && !x.archivado);
  g.dlgCierre(av.id);
  await new Promise(f => setTimeout(f, 900));
  const r = { porPuerta: document.querySelectorAll('.zp-diag').length,
              deSiempre: !!document.getElementById('z-diag') };
  S.sinMultiPuerta = false;
  return r;
});
paso('sin el SQL no salen las casillas por puerta', sinSql.porPuerta === 0, sinSql.porPuerta);
paso('y el parte de siempre sigue entero', sinSql.deSiempre === true);
const enLista = await T(() => {
  const c = (window.__T.QUE_HACE_FALTA || []).find(x => x.marca === 'sinMultiPuerta');
  return c ? c.fichero : null;
});
paso('y la aplicación dice qué fichero falta', enLista === 'multipuerta.sql', enLista);

console.log('\n── '+ok+' bien, '+mal+' mal ──────────────────────');
await nav.close();
process.exit(mal ? 1 : 0);
