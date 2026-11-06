/* ================================================================
   preventiva.mjs — un guion por puerta.               04-11-2026

   POR QUÉ EXISTE
   David, 04-11-2026: «Preventiva va relacionado al mantenimiento,
   debería contener checklist en función del tipo de puerta, por lo
   tanto un listado de los diferentes tipos de puerta a seleccionar
   por oficina y que esto lo lleve al chequeo previsto para ellas.»

   LO QUE ESTABA MAL
   Había UN guion por visita: el de la puerta principal. Una
   preventiva de un contrato con una corredera, una seccional y una
   peatonal se revisaba entera con el guion de la corredera. Las
   otras dos quedaban revisadas con la lista equivocada y firmadas
   igual, que es peor que no revisarlas: consta que se revisaron.

   LO QUE SE VIGILA AQUÍ
     · un guion por puerta, cada uno con el de SU tipo;
     · cada uno deja su propia revisión, con su puerta apuntada;
     · lo que se marca en una puerta no se mete en otra (el fallo
       clásico al pasar de un identificador único a varios iguales);
     · si falta un punto, se dice EN QUÉ PUERTA;
     · el parte que firma el cliente lleva las tres revisiones;
     · una revisión antigua, sin puerta apuntada, se sigue leyendo.
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
    /* Tres puertas del mismo cliente y de tres tipos distintos: el caso que
       hasta hoy se revisaba entero con el guion de la primera. */
    db.puertas[0].tipo = 'Corredera autoportante';
    db.puertas.push(
      { id:'pv-seccional', codigo:'AR-9001', cliente_id:cli, cliente:db.puertas[0].cliente,
        tipo:'Seccional', uso:'Industrial', direccion:'Nave 7', estado:'operativa' },
      { id:'pv-peatonal', codigo:'AR-9002', cliente_id:cli, cliente:db.puertas[0].cliente,
        tipo:'Peatonal automática corredera', uso:'Retail', direccion:'Entrada', estado:'operativa' },
      /* Y una de otro cliente, que NO tiene que salir en la lista */
      { id:'pv-ajena', codigo:'AR-9003', cliente_id:'otro-cliente', cliente:'Otro',
        tipo:'Batiente', estado:'operativa' });
    db.avisos.push({ id:'pv-1', tipo:'mantenimiento', estado:'asignado', prioridad:'programada',
      tecnico_id:'usuario-admin', cliente_id:cli, puerta_id:db.puertas[0].id,
      descripcion:'Revisión anual del contrato', creado:new Date().toISOString(),
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

const faltan = await T(() => window.__T_FALTAN || []);
paso('el banco ve todas las funciones nuevas', faltan.length === 0, faltan.join(' · '));

/* ================================================================
   1. Elegir las puertas al crear la preventiva
   ================================================================ */
bloque('1. La oficina elige las puertas');

const alta = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null, 'pv-1');
  await new Promise(r => setTimeout(r, 1000));
  const caja = document.getElementById('a-caja-pts');
  const cajas = [...document.querySelectorAll('#a-pts .a-pt')].map(x => x.value);
  const marcadas = [...document.querySelectorAll('#a-pts .a-pt:checked')].map(x => x.value);
  const texto = document.getElementById('dlg-form').innerText;
  /* Se marcan las otras dos y se guarda */
  document.querySelector('#a-pts .a-pt[value="pv-seccional"]').checked = true;
  document.querySelector('#a-pts .a-pt[value="pv-peatonal"]').checked = true;
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 2000));
  return { visible: caja && !caja.hidden, cajas, marcadas, texto,
           /* Desde el 06-11-2026 esa lista va dentro de un desplegable plegado, y
              innerText no devuelve el texto de lo que no se ve. El texto sigue
              estando, así que se lee con textContent: lo que se comprueba es que
              la explicación esté escrita, no que esté desplegada. */
           textoTodo: document.getElementById('dlg-form').textContent || '',
           resumen: (document.getElementById('a-pts-cuenta') || {}).textContent || '',
           puertas: g.puertasDeAviso('pv-1').map(p => p.codigo) };
});
paso('en una preventiva la oficina elige qué puertas se revisan', alta.visible === true);
paso('solo salen las del cliente, no las de otro',
  alta.cajas.length === 3 && !alta.cajas.includes('pv-ajena'), alta.cajas.join(' · '));
paso('la puerta de la asistencia sale ya marcada',
  alta.marcadas.length === 1, alta.marcadas.join(' · '));
paso('y se explica que cada una lleva su guión',
  /cada una lleva el guión de su tipo/i.test(alta.textoTodo));
/* Y plegado tiene que decir lo esencial sin abrirlo, que es para lo que se
   pliega: si el resumen no dijera nada, la oficina no sabría si eligió puertas. */
paso('el desplegable, plegado, dice qué puertas se van a revisar',
  /puerta/i.test(alta.resumen), alta.resumen);
paso('al guardar quedan enganchadas las tres',
  alta.puertas.length === 3, alta.puertas.join(' · '));

const otroTipo = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null, 'pv-1');
  await new Promise(r => setTimeout(r, 900));
  document.getElementById('a-tipo').value = 'averia';
  document.getElementById('a-tipo').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 300));
  const oculto = document.getElementById('a-caja-pts').hidden;
  g.cerrarDlg();
  return { oculto };
});
paso('en una avería no se pregunta por las puertas de la revisión', otroTipo.oculto === true);

/* ================================================================
   2. Un guion por puerta, cada uno con el suyo
   ================================================================ */
bloque('2. Tres puertas, tres guiones');

const guiones = await T(async () => {
  const g = window.__T;
  g.dlgCierre('pv-1');
  await new Promise(r => setTimeout(r, 1400));
  const cs = [...document.querySelectorAll('#dlg-form .guion')];
  return {
    cuantos: cs.length,
    tipos: cs.map(x => x.dataset.tipo),
    puertas: cs.map(x => x.dataset.puerta),
    puntos: cs.map(x => x.querySelectorAll('.g-punto').length),
    titulos: [...document.querySelectorAll('#dlg-form .grupo > h3')]
      .map(x => x.textContent).filter(t => /Guión de revisión/.test(t)),
    /* cada uno con su pie propio, no uno compartido */
    pies: cs.map(x => ({ apta: !!x.querySelector('.g-apta'), riesgo: !!x.querySelector('.g-riesgo'),
                         defic: !!x.querySelector('.g-defic'), reco: !!x.querySelector('.g-reco') })),
  };
});
paso('salen tres guiones, uno por puerta', guiones.cuantos === 3, guiones.cuantos);
paso('cada uno es el de SU tipo de puerta',
  guiones.tipos.join(' | ') === 'Corredera autoportante | Seccional | Peatonal automática corredera',
  guiones.tipos.join(' | '));
paso('y cada uno sabe de qué puerta es',
  guiones.puertas.every(Boolean) && new Set(guiones.puertas).size === 3,
  guiones.puertas.join(' · '));
paso('los tres tienen puntos, y no el mismo número',
  guiones.puntos.every(n => n > 10) && new Set(guiones.puntos).size > 1,
  guiones.puntos.join(' · '));
paso('el título de cada uno dice de qué puerta es',
  guiones.titulos.length === 3 && guiones.titulos.every(t => /AR-/.test(t)),
  guiones.titulos.join(' | '));
paso('cada guión lleva su propio resultado, riesgo, deficiencias y recomendaciones',
  guiones.pies.every(p => p.apta && p.riesgo && p.defic && p.reco));

/* ================================================================
   3. LO QUE NO PUEDE PASAR: que se mezclen
   ================================================================ */
bloque('3. Lo de una puerta no se mete en otra');

const mezcla = await T(async () => {
  const cs = [...document.querySelectorAll('#dlg-form .guion')];
  /* Se marca «Mal» el primer punto SOLO del segundo guion */
  const p2 = cs[1].querySelector('.g-punto .g-resp button[data-r="mal"]');
  p2.click();
  await new Promise(r => setTimeout(r, 250));
  /* Y se escribe una recomendación solo en el tercero */
  cs[2].querySelector('.g-reco').value = 'Cambiar los sensores de la peatonal';
  const marcados = cs.map(c => c.querySelectorAll('.g-resp button[aria-pressed="true"]').length);
  const avisos = cs.map(c => { const a = c.querySelector('.g-mal'); return a ? !a.hidden : false; });
  const g = window.__T;
  const leidos = g.guionesDelForm();
  return { marcados, avisos,
           recos: leidos.map(x => x.reco),
           puertas: leidos.map(x => x.puerta_id) };
});
paso('marcar un punto en el segundo guión no marca nada en los otros',
  mezcla.marcados.join(',') === '0,1,0', mezcla.marcados.join(' · '));
paso('y el aviso de «puntos marcados Mal» sale solo en el suyo',
  mezcla.avisos.join(',') === 'false,true,false', mezcla.avisos.join(' · '));
paso('la recomendación escrita en el tercero se queda en el tercero',
  mezcla.recos[0] === '' && mezcla.recos[1] === '' && /sensores/.test(mezcla.recos[2]),
  JSON.stringify(mezcla.recos));
paso('y cada guión se lee con su puerta', new Set(mezcla.puertas).size === 3);

/* ================================================================
   4. Si falta un punto, se dice en qué puerta
   ================================================================ */
bloque('4. Lo que falta, y dónde falta');

const falta = await T(async () => {
  const g = window.__T;
  /* Se marca todo el primero y el segundo, y se deja el tercero a medias */
  const cs = [...document.querySelectorAll('#dlg-form .guion')];
  [cs[0], cs[1]].forEach(c => c.querySelectorAll('.g-punto').forEach(d => {
    const b = d.querySelector('.g-resp button[data-r="ok"]');
    if (b && !d.querySelector('.g-resp button[aria-pressed="true"]')) b.setAttribute('aria-pressed','true');
  }));
  const ps = cs[2].querySelectorAll('.g-punto');
  ps.forEach((d, i) => { if (i === 0) return;
    const b = d.querySelector('.g-resp button[data-r="ok"]');
    if (b) b.setAttribute('aria-pressed','true'); });
  document.getElementById('z-trab').value = 'Revisadas las tres';
  document.getElementById('z-horas').value = '3';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'pv-1'), true);
  await new Promise(r => setTimeout(r, 800));
  const err = (document.querySelector('#dlg-form .err') || {}).textContent || '';
  return { err };
});
paso('no deja cerrar con un punto sin marcar', /sin marcar/.test(falta.err), falta.err);
paso('y DICE en qué puerta falta', /AR-9002/.test(falta.err), falta.err);

/* ================================================================
   5. Una revisión por puerta, guardada
   ================================================================ */
bloque('5. Tres revisiones guardadas');

const guardado = await T(async () => {
  const g = window.__T;
  /* Se remata el punto que faltaba */
  const cs = [...document.querySelectorAll('#dlg-form .guion')];
  const d = cs[2].querySelector('.g-punto');
  d.querySelector('.g-resp button[data-r="ok"]').setAttribute('aria-pressed','true');
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'pv-1'), false);
  await new Promise(r => setTimeout(r, 1500));
  const { data } = await g.sb.from('revisiones').select('*').eq('aviso_id', 'pv-1');
  const av = g.S.avisos.find(x => x.id === 'pv-1');
  return {
    n: (data || []).length,
    puertas: (data || []).map(r => r.puerta_id).sort(),
    tipos: (data || []).map(r => r.tipo_puerta).sort(),
    recos: (data || []).map(r => r.recomendaciones).filter(Boolean),
    defic: (data || []).filter(r => r.deficiencias).length,
    trabajo: av.trabajo, diagnostico: av.diagnostico,
  };
});
paso('se guardan TRES revisiones, una por puerta', guardado.n === 3, guardado.n);
paso('cada una con su puerta apuntada',
  guardado.puertas.join(',') === ['pv-peatonal','pv-seccional', (guardado.puertas[0]||'')].sort().join(','),
  guardado.puertas.join(' · '));
paso('y cada una con su tipo de puerta',
  new Set(guardado.tipos).size === 3, guardado.tipos.join(' · '));
paso('la recomendación va en la revisión de su puerta',
  guardado.recos.length === 1 && /sensores/.test(guardado.recos[0]), guardado.recos.join(' · '));
paso('las deficiencias se rellenan solas donde hubo un punto Mal',
  guardado.defic === 1, guardado.defic);
/* El diagnóstico se rellena solo cuando hay puntos no conformes, y con varias
   puertas tiene que decir en cuántas: «1 punto no conforme en 3 puertas» es
   otra cosa que «1 punto no conforme». */
paso('el diagnóstico se rellena solo y cuenta las puertas',
  /no conforme/.test(guardado.diagnostico || '') && /3 puertas/.test(guardado.diagnostico || ''),
  guardado.diagnostico);

/* ================================================================
   6. El parte que firma el cliente
   ================================================================ */
bloque('6. El parte impreso lleva las tres');

const impreso = await T(async () => {
  const g = window.__T;
  let html = '';
  const abrir = window.open;
  window.open = () => ({ document: { write: t => { html += t; }, close(){}, title:'' },
                         focus(){}, print(){}, close(){} });
  await g.hojaParte('pv-1');
  await new Promise(r => setTimeout(r, 900));
  window.open = abrir;
  return { n: (html.match(/Revisión periódica/g) || []).length,
           codigos: ['AR-9001','AR-9002'].filter(c => html.includes(c)),
           tipos: ['Seccional','Peatonal automática corredera'].filter(t => html.includes(t)) };
});
paso('el parte lleva un bloque de revisión por puerta', impreso.n === 3, impreso.n);
paso('con el código de cada puerta', impreso.codigos.length === 2, impreso.codigos.join(' · '));
paso('y el tipo de cada una', impreso.tipos.length === 2, impreso.tipos.join(' · '));

/* ================================================================
   7. Lo de antes se sigue leyendo
   ================================================================ */
bloque('7. Una revisión antigua, sin puerta apuntada');

const antigua = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  await g.sb.from('avisos').insert({ id:'pv-vieja', tipo:'mantenimiento', estado:'asignado',
    prioridad:'programada', tecnico_id:'usuario-admin', cliente_id:cli.id,
    puerta_id:g.S.puertas[0].id, creado:new Date().toISOString() });
  /* Como las de antes del 04-11-2026: sin puerta_id */
  await g.sb.from('revisiones').insert({ aviso_id:'pv-vieja', puerta_id:null,
    tipo_puerta:'Corredera autoportante', fecha:g.hoy(), resultado:'reservas',
    recomendaciones:'Lo de la revisión antigua', puntos:[] });
  await g.cargar();
  g.dlgCierre('pv-vieja');
  await new Promise(r => setTimeout(r, 1200));
  const cs = [...document.querySelectorAll('#dlg-form .guion')];
  const reco = cs.length ? cs[0].querySelector('.g-reco').value : '';
  const apta = cs.length ? cs[0].querySelector('.g-apta').value : '';
  g.cerrarDlg();
  return { cuantos: cs.length, reco, apta };
});
paso('una visita de una sola puerta sigue teniendo un guión', antigua.cuantos === 1);
paso('y la revisión antigua, sin puerta apuntada, se vuelca en él',
  /revisión antigua/.test(antigua.reco), antigua.reco);
paso('con su resultado', antigua.apta === 'reservas', antigua.apta);

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
