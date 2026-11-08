/* ================================================================
   fotos.mjs — las fotos de la visita.                 07-11-2026

   POR QUÉ EXISTE
   David, probando las asistencias en campo:

     «En cualquier asistencia, el técnico debe poder, desde la
      aplicación, hacer fotos de la puerta, de lo encontrado, de lo
      reparado, de lo sustituido, etc. Es importante como evidencia y
      referencia pasada para poder enviar al cliente si lo solicita.
      Deben ser un mínimo de una foto obligatoria y un máximo de 10.»

   LO QUE ESTABA MAL
   Las fotos existían, pero colgaban solo de la PUERTA: servían para
   la ficha (el conjunto, la placa) y no para contar lo que pasó en
   una visita. Una avería en la que se cambió un cuadro quemado no
   dejaba ninguna imagen de cómo estaba antes, que es justo la que
   hace falta cuando el cliente discute tres meses después.

   LO QUE SE VIGILA AQUÍ
     · que una foto hecha en el parte cuelgue de la visita Y de la
       puerta: una exigencia, no dos (decisión de David);
     · que no se cierre sin al menos una, y que el viaje en balde
       quede fuera, porque allí no se ha podido ver nada;
     · que no quepan más de diez;
     · que el apartado salga en cualquier tipo de visita.
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
    const base = { estado:'asignado', prioridad:'normal', tecnico_id:'usuario-admin',
      cliente_id:cli, puerta_id:db.puertas[0].id, creado:new Date().toISOString() };
    db.avisos.push(Object.assign({}, base, { id:'fo-av', tipo:'averia', subtipo:'averia',
      descripcion:'No cierra del todo' }));
    db.avisos.push(Object.assign({}, base, { id:'fo-tope', tipo:'averia', subtipo:'averia',
      descripcion:'Para probar el tope de diez' }));
    db.avisos.push(Object.assign({}, base, { id:'fo-com', tipo:'comercial',
      puerta_id:null, descripcion:'Ofertar una puerta nueva' }));
    /* Nueve fotos ya hechas en la visita del tope, para que quepa solo una más */
    for (let i = 1; i <= 9; i++)
      db.fotos.push({ id:'ft-'+i, aviso_id:'fo-tope', puerta_id:db.puertas[0].id,
        ruta:'fo-tope/'+i+'.jpg', autor:'prueba', etapa:'otra',
        creado:new Date(Date.now() - (10 - i) * 1000).toISOString() });
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
   1. Las reglas
   ================================================================ */
bloque('1. Qué se pide y a quién');

const reglas = await T(() => {
  const g = window.__T;
  return {
    etapas: g.ETAPAS_FOTO.map(x => x[0]),
    nombres: g.ETAPAS_FOTO.map(x => x[1]),
    tope: g.MAX_FOTOS_AVISO,
    averia: g.pideFotoVisita({ tipo:'averia' }),
    comercial: g.pideFotoVisita({ tipo:'comercial' }),
    instalacion: g.pideFotoVisita({ tipo:'instalacion' }),
    balde: g.pideFotoVisita({ tipo:'averia', falso:true }),
    baldeViejo: g.pideFotoVisita({ tipo:'falso' }),
    nulo: g.pideFotoVisita(null),
    nombre: g.nombreEtapa('encontrado'),
    nombreMalo: g.nombreEtapa('lo_que_sea'),
  };
});
paso('hay cuatro etapas: lo encontrado, cómo queda, lo sustituido y otra',
  reglas.etapas.join(',') === 'encontrado,hecho,sustituido,otra', reglas.etapas.join(' · '));
paso('con nombres de persona', /me encontré/i.test(reglas.nombres[0]), reglas.nombres.join(' | '));
paso('el tope es diez, como pidió David', reglas.tope === 10, reglas.tope);
paso('se pide foto en avería, comercial e instalación',
  reglas.averia === true && reglas.comercial === true && reglas.instalacion === true);
/* En un viaje en balde no hay nada que fotografiar: un bloqueo imposible de
   cumplir se acaba sorteando, y eso es peor que no pedirlo. */
paso('y NO se pide en un viaje en balde, ni nuevo ni del tipo viejo',
  reglas.balde === false && reglas.baldeViejo === false);
paso('sin visita no se pide nada', reglas.nulo === false);
paso('cada etapa tiene su nombre', reglas.nombre === 'Lo que me encontré', reglas.nombre);
paso('y una que no existe no se inventa nombre', reglas.nombreMalo === '', reglas.nombreMalo);

/* ================================================================
   2. El apartado, en el parte
   ================================================================ */
bloque('2. En el parte');

const parte = await T(async () => {
  const g = window.__T;
  g.dlgCierre('fo-av');
  await new Promise(r => setTimeout(r, 1600));
  const zona = document.getElementById('z-fotos');
  const botones = [...document.querySelectorAll('[data-act="foto-aviso"]')]
    .map(x => x.dataset.etapa);
  const texto = document.getElementById('dlg-form').textContent || '';
  const vacio = zona ? zona.textContent : '';
  return { hay: !!zona, botones, vacio,
           diceTope: /hasta 10/.test(texto), diceObliga: /al menos una para cerrar/i.test(texto) };
});
paso('el parte de una avería trae el apartado de fotos', parte.hay === true);
paso('con un botón por cada etapa', parte.botones.join(',') === 'encontrado,hecho,sustituido,otra',
  parte.botones.join(' · '));
paso('dice que hace falta al menos una', parte.diceObliga === true);
paso('y que caben hasta diez', parte.diceTope === true);
paso('sin fotos, lo dice en vez de dejar el hueco vacío',
  /ninguna foto/i.test(parte.vacio), parte.vacio);

/* ================================================================
   3. Sin foto no se cierra
   ================================================================ */
bloque('3. La foto obligatoria');

const sinFoto = await T(async () => {
  const g = window.__T;
  const f = document.getElementById('dlg-form');
  document.getElementById('z-trab').value = 'Ajustada la fotocélula';
  document.getElementById('z-diag').value = 'Fotocélula desalineada';
  document.getElementById('z-horas').value = '1';
  document.getElementById('z-sin').value = 'No había nadie';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'fo-av'), true);
  await new Promise(r => setTimeout(r, 900));
  const err = (f.querySelector('.err') || {}).textContent || '';
  const cerrado = !!(g.S.avisos.find(x => x.id === 'fo-av') || {}).cerrado;
  return { err, cerrado };
});
paso('sin ninguna foto, la visita no se cierra', sinFoto.cerrado === false);
paso('y el aviso dice por qué hace falta',
  /al menos una foto/i.test(sinFoto.err) && /tres meses/i.test(sinFoto.err),
  sinFoto.err.slice(0, 100));
paso('y dónde están los botones', /Fotos de esta visita/i.test(sinFoto.err));

const conFoto = await T(async () => {
  const g = window.__T;
  /* La foto, como la haría el técnico desde el parte: cuelga de la visita Y de
     la puerta, que es lo que decidió David. */
  const av = g.S.avisos.find(x => x.id === 'fo-av');
  await g.sb.from('fotos').insert({ aviso_id:'fo-av', puerta_id: av.puerta_id,
    ruta:'fo-av/1.jpg', autor:'prueba', etapa:'encontrado' });
  await g.cargarFotosAviso('fo-av');
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'fo-av'), true);
  await new Promise(r => setTimeout(r, 1800));
  const a = g.S.avisos.find(x => x.id === 'fo-av') || {};
  const { data } = await g.sb.from('fotos').select('*').eq('aviso_id','fo-av');
  if (document.getElementById('dlg').open) g.cerrarDlg();
  return { cerrado: !!a.cerrado, cuantas: (data || []).length,
           enPuerta: (data || []).filter(f => f.puerta_id).length };
});
paso('con una foto, la visita se cierra', conFoto.cerrado === true);
/* Una foto, dos sitios: si no colgara también de la puerta, el técnico tendría
   que hacer la misma foto dos veces para cerrar el mismo parte. */
paso('y esa foto cuenta también para la ficha de la puerta',
  conFoto.enPuerta === 1, conFoto.enPuerta+' de '+conFoto.cuantas);

/* ================================================================
   4. El tope de diez
   ================================================================ */
bloque('4. El tope');

const tope = await T(async () => {
  const g = window.__T;
  g.dlgCierre('fo-tope');
  await new Promise(r => setTimeout(r, 1600));
  const cuenta = (document.getElementById('z-fotos-cuenta') || {}).textContent || '';
  const pintadas = document.querySelectorAll('#z-fotos .foto').length;
  return { cuenta, pintadas, enMemoria: g.fotosDeAviso('fo-tope').length };
});
paso('las fotos que ya tiene la visita se ven en el parte', tope.pintadas === 9, tope.pintadas);
/* El resumen dice cuántas lleva y cuántas caben: sin eso, el técnico no sabe
   que está a punto de quedarse sin sitio. */
paso('y el resumen dice cuántas lleva de cuántas', /9 de 10/.test(tope.cuenta), tope.cuenta);

const pasado = await T(async () => {
  const g = window.__T;
  /* Se intenta subir tres cuando solo cabe una */
  const antes = g.fotosDeAviso('fo-tope').length;
  const entrada = document.querySelector('[data-act="foto-aviso"]');
  const fichero = n => new File([new Uint8Array([1,2,3])], 'f'+n+'.jpg', { type:'image/jpeg' });
  const dt = new DataTransfer();
  [1,2,3].forEach(n => dt.items.add(fichero(n)));
  entrada.files = dt.files;
  entrada.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 2500));
  const despues = g.fotosDeAviso('fo-tope').length;
  g.cerrarDlg();
  return { antes, despues };
});
paso('con nueve hechas, solo entra una más', pasado.antes === 9 && pasado.despues === 10,
  pasado.antes+' → '+pasado.despues);

const lleno = await T(async () => {
  const g = window.__T;
  g.dlgCierre('fo-tope');
  await new Promise(r => setTimeout(r, 1600));
  const entrada = document.querySelector('[data-act="foto-aviso"]');
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([1])], 'otra.jpg', { type:'image/jpeg' }));
  entrada.files = dt.files;
  entrada.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 1500));
  const n = g.fotosDeAviso('fo-tope').length;
  g.cerrarDlg();
  return { n };
});
paso('y con diez ya no entra ninguna más', lleno.n === 10, lleno.n);

/* ================================================================
   5. El viaje en balde no necesita foto
   ================================================================ */
bloque('5. El viaje en balde');

const balde = await T(async () => {
  const g = window.__T;
  g.dlgCierre('fo-com');
  await new Promise(r => setTimeout(r, 1600));
  const hayApartado = !!document.getElementById('z-fotos');
  /* Se marca el viaje en balde: entonces no se le pide foto */
  const c = document.getElementById('z-falso');
  c.checked = true; c.dispatchEvent(new Event('change', { bubbles:true }));
  document.getElementById('z-falsomot').value = 'El local estaba cerrado y nadie contestaba';
  await new Promise(r => setTimeout(r, 300));
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'fo-com'), true);
  await new Promise(r => setTimeout(r, 2000));
  const a = g.S.avisos.find(x => x.id === 'fo-com') || {};
  const err = document.getElementById('dlg-form')
    ? ((document.querySelector('#dlg-form .err') || {}).textContent || '') : '';
  if (document.getElementById('dlg').open) g.cerrarDlg();
  return { hayApartado, cerrado: !!a.cerrado, err,
           fotos: g.fotosDeAviso('fo-com').length };
});
paso('una comercial también trae el apartado de fotos', balde.hayApartado === true);
/* Si el técnico no ha podido entrar, no hay nada que fotografiar */
paso('un viaje en balde se cierra sin ninguna foto',
  balde.cerrado === true && balde.fotos === 0, balde.err);

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
