/* ================================================================
   comercial.mjs — la toma de medidas de la visita comercial.
                                                       05-11-2026

   POR QUÉ EXISTE
   La comercial es la visita de ir a ofertar, y lo que se trae de
   ella son las medidas del hueco y los auxiliares que hacen falta.
   Hasta hoy eso se escribía todo seguido en «Qué has hecho»: en la
   oficina había que leer un párrafo y adivinar cuál era el ancho, y
   si faltaba un dato había que volver a llamar al técnico.

   DECISIONES DE DAVID, 05-11-2026
     · las medidas se guardan en el AVISO, no dando de alta la
       puerta: una oferta no vendida no es una puerta;
     · una visita puede llevar VARIOS huecos medidos;
     · los auxiliares van en texto libre.

   LO QUE SE VIGILA AQUÍ
     · el bloque de medidas sale SOLO en la comercial;
     · si la oficina marcó los tipos de puerta, sale un bloque por
       tipo y ya viene elegido;
     · se pueden añadir y quitar huecos, y los títulos se renumeran;
     · lo que se escribe en un hueco no se mete en otro (el fallo
       clásico al pasar de un identificador único a varios iguales);
     · no se cierra sin ancho y alto, y el aviso DICE qué hueco es;
     · 400 en vez de 4000 no pasa;
     · el hueco que no se pudo medir se puede cerrar, pero con motivo;
     · lo guardado se vuelve a leer al reabrir el parte, y un hueco
       quitado desaparece de verdad;
     · del parte sale un presupuesto con un capítulo por hueco;
     · la hoja que firma el cliente lleva las medidas;
     · y la de siempre: la comercial no se cobra.
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
    /* Una comercial con dos tipos de puerta marcados por la oficina: es lo que
       se sabe antes de ir, y de ahí salen los dos bloques de medidas. */
    db.avisos.push({ id:'co-1', tipo:'comercial', estado:'asignado', prioridad:'normal',
      tecnico_id:'usuario-admin', cliente_id:cli,
      tipos_puerta:['Seccional','Peatonal automática corredera'],
      descripcion:'Quieren presupuesto de los dos portones y la entrada de oficinas',
      creado:new Date().toISOString(),
      fecha_prevista:new Date().toISOString().slice(0,10) });
    /* Y una comercial sin tipos marcados: un bloque en blanco */
    db.avisos.push({ id:'co-2', tipo:'comercial', estado:'asignado', prioridad:'normal',
      tecnico_id:'usuario-admin', cliente_id:cli,
      descripcion:'Llamaron pidiendo precio', creado:new Date().toISOString() });
    /* Una avería, para comprobar que a ella no le sale el bloque */
    db.avisos.push({ id:'co-av', tipo:'averia', subtipo:'averia', estado:'asignado',
      prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:cli,
      puerta_id:db.puertas[0].id, descripcion:'No cierra',
      creado:new Date().toISOString() });
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
   1. El bloque sale solo donde tiene que salir
   ================================================================ */
bloque('1. Dónde sale y dónde no');

const donde = await T(async () => {
  const g = window.__T;
  g.dlgCierre('co-av');
  await new Promise(r => setTimeout(r, 1200));
  const enAveria = document.querySelectorAll('#dlg-form .medida').length;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  g.dlgCierre('co-2');
  await new Promise(r => setTimeout(r, 1200));
  const sinTipos = document.querySelectorAll('#dlg-form .medida').length;
  const titulo = (document.querySelector('#med-zona .grupo h3') || {}).textContent || '';
  const texto = document.getElementById('dlg-form').innerText;
  g.cerrarDlg();
  return { enAveria, sinTipos, titulo, texto };
});
paso('en una avería no se pide ninguna medida', donde.enAveria === 0, donde.enAveria);
paso('en una comercial sin tipos marcados sale un bloque en blanco',
  donde.sinTipos === 1, donde.sinTipos);
paso('y el bloque va numerado desde el primero', /hueco 1/.test(donde.titulo), donde.titulo);
paso('se avisa de que las medidas son del hueco y en milímetros',
  /del <?b?>?hueco/i.test(donde.texto) && /milímetros/i.test(donde.texto));

/* ================================================================
   2. Un bloque por tipo de puerta marcado por la oficina
   ================================================================ */
bloque('2. Los tipos que marcó la oficina');

const tipos = await T(async () => {
  const g = window.__T;
  g.dlgCierre('co-1');
  await new Promise(r => setTimeout(r, 1400));
  const cs = [...document.querySelectorAll('#dlg-form .medida')];
  return {
    cuantos: cs.length,
    elegidos: cs.map(x => x.querySelector('.m-tipo').value),
    titulos: [...document.querySelectorAll('#med-zona .grupo h3')].map(x => x.textContent),
    campos: cs.map(x => ['.m-ubi','.m-ancho','.m-alto','.m-dintel','.m-lateral','.m-sit',
      '.m-elec','.m-aux','.m-notas','.m-sinmed','.m-sinmedm'].filter(s => !x.querySelector(s))),
  };
});
paso('salen dos bloques, uno por tipo marcado', tipos.cuantos === 2, tipos.cuantos);
paso('y cada uno viene con su tipo ya elegido',
  tipos.elegidos.join(' | ') === 'Seccional | Peatonal automática corredera',
  tipos.elegidos.join(' | '));
paso('los títulos van numerados', tipos.titulos.join(' | ') === 'Toma de medidas · hueco 1 | Toma de medidas · hueco 2',
  tipos.titulos.join(' | '));
paso('a ningún bloque le falta un campo',
  tipos.campos.every(f => f.length === 0), JSON.stringify(tipos.campos));

/* ================================================================
   3. Añadir y quitar huecos
   ================================================================ */
bloque('3. Añadir y quitar');

const anadir = await T(async () => {
  const g = window.__T;
  document.querySelector('[data-act="med-add"]').click();
  await new Promise(r => setTimeout(r, 300));
  const tras = document.querySelectorAll('#dlg-form .medida').length;
  const titulos = [...document.querySelectorAll('#med-zona .grupo h3')].map(x => x.textContent);
  /* Se quita el PRIMERO, que es donde se ve si los títulos se renumeran */
  document.querySelectorAll('[data-act="med-quitar"]')[0].click();
  await new Promise(r => setTimeout(r, 300));
  const tras2 = document.querySelectorAll('#dlg-form .medida').length;
  const titulos2 = [...document.querySelectorAll('#med-zona .grupo h3')].map(x => x.textContent);
  const tiposAhora = [...document.querySelectorAll('#dlg-form .medida')].map(x => x.querySelector('.m-tipo').value);
  return { tras, titulos, tras2, titulos2, tiposAhora };
});
paso('el botón añade un hueco más', anadir.tras === 3, anadir.tras);
paso('y lo numera como hueco 3', /hueco 3/.test(anadir.titulos[2] || ''), anadir.titulos.join(' | '));
paso('quitar un hueco lo quita de verdad', anadir.tras2 === 2, anadir.tras2);
paso('y los títulos se renumeran: no quedan «hueco 2» y «hueco 3»',
  anadir.titulos2.join(' | ') === 'Toma de medidas · hueco 1 | Toma de medidas · hueco 2',
  anadir.titulos2.join(' | '));
paso('el que se quitó es el que se dijo: queda la peatonal, no la seccional',
  anadir.tiposAhora[0] === 'Peatonal automática corredera', anadir.tiposAhora.join(' · '));

const ultimo = await T(async () => {
  const g = window.__T;
  g.dlgCierre('co-2');
  await new Promise(r => setTimeout(r, 1200));
  document.querySelector('[data-act="med-quitar"]').click();
  await new Promise(r => setTimeout(r, 300));
  const quedan = document.querySelectorAll('#dlg-form .medida').length;
  g.cerrarDlg();
  return { quedan };
});
paso('el único hueco no se puede quitar: dejaría la pantalla sin dónde apuntar',
  ultimo.quedan === 1, ultimo.quedan);

/* ================================================================
   4. LO QUE NO PUEDE PASAR: que se mezclen los huecos
   ================================================================ */
bloque('4. Lo de un hueco no se mete en otro');

const mezcla = await T(async () => {
  const g = window.__T;
  g.dlgCierre('co-1');
  await new Promise(r => setTimeout(r, 1400));
  const cs = [...document.querySelectorAll('#dlg-form .medida')];
  cs[0].querySelector('.m-ubi').value = 'Nave trasera, portón izquierdo';
  cs[0].querySelector('.m-ancho').value = '4000';
  cs[0].querySelector('.m-alto').value = '4200';
  cs[0].querySelector('.m-dintel').value = '600';
  cs[0].querySelector('.m-sit').value = 'hueco';
  cs[0].querySelector('.m-elec').value = 'existe';
  cs[0].querySelector('.m-aux').value = 'Dos mandos y fotocélulas exteriores';
  cs[1].querySelector('.m-ubi').value = 'Entrada de oficinas';
  cs[1].querySelector('.m-ancho').value = '1600';
  cs[1].querySelector('.m-alto').value = '2200';
  cs[1].querySelector('.m-elec').value = 'llevar';
  cs[1].querySelector('.m-notas').value = 'Hay que pasar tubo por el falso techo';
  const leidas = g.medidasDelForm();
  return { n: leidas.length, leidas };
});
paso('se leen los dos huecos', mezcla.n === 2, mezcla.n);
paso('cada uno con sus medidas, sin mezclarse',
  mezcla.leidas[0].ancho_mm === 4000 && mezcla.leidas[1].ancho_mm === 1600,
  mezcla.leidas.map(m => m.ancho_mm+'x'+m.alto_mm).join(' · '));
paso('los auxiliares escritos en el primero se quedan en el primero',
  /fotocélulas/.test(mezcla.leidas[0].auxiliares || '') && !mezcla.leidas[1].auxiliares,
  JSON.stringify([mezcla.leidas[0].auxiliares, mezcla.leidas[1].auxiliares]));
paso('y las notas del segundo se quedan en el segundo',
  !mezcla.leidas[0].notas && /falso techo/.test(mezcla.leidas[1].notas || ''));
paso('la acometida se lee por hueco: en uno existe y en otro hay que llevarla',
  mezcla.leidas[0].electricidad === 'existe' && mezcla.leidas[1].electricidad === 'llevar',
  mezcla.leidas.map(m => m.electricidad).join(' · '));

/* ================================================================
   5. Lo que no deja cerrar, y dónde está el problema
   ================================================================ */
bloque('5. Lo que no deja cerrar');

const sinAlto = await T(async () => {
  const g = window.__T;
  const cs = [...document.querySelectorAll('#dlg-form .medida')];
  cs[1].querySelector('.m-alto').value = '';
  document.getElementById('z-trab').value = 'Tomadas las medidas';
  /* La firma no se dibuja en una prueba: se pone el motivo, que es lo que hace
     el técnico cuando no hay nadie que firme. */
  document.getElementById('z-sin').value = 'Prueba automática: no hay quien firme';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'co-1'), true);
  await new Promise(r => setTimeout(r, 700));
  return { err: (document.querySelector('#dlg-form .err') || {}).textContent || '' };
});
paso('no deja cerrar sin el alto', /ancho o el alto/.test(sinAlto.err), sinAlto.err);
paso('y DICE de qué hueco se trata', /hueco 2/.test(sinAlto.err) && /Entrada de oficinas/.test(sinAlto.err),
  sinAlto.err);

const dedo = await T(async () => {
  const g = window.__T;
  const cs = [...document.querySelectorAll('#dlg-form .medida')];
  cs[1].querySelector('.m-alto').value = '2200';
  cs[1].querySelector('.m-ancho').value = '160';          // 160 en vez de 1600
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'co-1'), true);
  await new Promise(r => setTimeout(r, 700));
  return { err: (document.querySelector('#dlg-form .err') || {}).textContent || '' };
});
paso('un ancho de 160 mm no pasa: es el error de dedo de siempre',
  /milímetros/.test(dedo.err) && /4000, no 400/.test(dedo.err), dedo.err);
paso('y se dice por qué: no existe una puerta de 40 cm',
  /no existe una puerta/i.test(dedo.err), dedo.err);

const sinSitio = await T(async () => {
  const g = window.__T;
  const cs = [...document.querySelectorAll('#dlg-form .medida')];
  cs[1].querySelector('.m-ancho').value = '1600';
  cs[1].querySelector('.m-ubi').value = '';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'co-1'), true);
  await new Promise(r => setTimeout(r, 700));
  const err = (document.querySelector('#dlg-form .err') || {}).textContent || '';
  cs[1].querySelector('.m-ubi').value = 'Entrada de oficinas';
  return { err };
});
paso('con varios huecos hay que decir dónde está cada uno',
  /Pon dónde está/.test(sinSitio.err) && /hueco 2/.test(sinSitio.err), sinSitio.err);

const guardarAvance = await T(async () => {
  const g = window.__T;
  /* Guardar el avance NO comprueba nada: el técnico está midiendo */
  const cs = [...document.querySelectorAll('#dlg-form .medida')];
  const copia = cs[1].querySelector('.m-alto').value;
  cs[1].querySelector('.m-alto').value = '';
  /* Se borra el aviso que dejó la comprobación anterior: lo que se mira aquí es
     que guardar el avance NO saca uno nuevo. */
  const e = document.querySelector('#dlg-form .err'); if (e) e.textContent = '';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'co-1'), false);
  await new Promise(r => setTimeout(r, 900));
  const err = (document.querySelector('#dlg-form .err') || {}).textContent || '';
  const { data } = await g.sb.from('medidas').select('*').eq('aviso_id', 'co-1');
  cs[1].querySelector('.m-alto').value = copia;
  return { err, n: (data || []).length };
});
paso('guardar el avance a medias no da error: se está midiendo',
  guardarAvance.err === '', guardarAvance.err);
paso('y lo medido hasta entonces queda guardado', guardarAvance.n === 2, guardarAvance.n);

/* ================================================================
   6. El hueco que no se pudo medir
   ================================================================ */
bloque('6. El hueco al que no se pudo llegar');

const sinMedir = await T(async () => {
  const g = window.__T;
  document.querySelector('[data-act="med-add"]').click();
  await new Promise(r => setTimeout(r, 300));
  const cs = [...document.querySelectorAll('#dlg-form .medida')];
  const t = cs[2];
  t.querySelector('.m-ubi').value = 'Puerta del almacén alto';
  t.querySelector('.m-sinmed').checked = true;
  /* Vacío a propósito: así se ve que lo rellena la aplicación contando los
     huecos medidos, que es lo que ahorra teclear al técnico. */
  document.getElementById('z-trab').value = '';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'co-1'), true);
  await new Promise(r => setTimeout(r, 700));
  const err1 = (document.querySelector('#dlg-form .err') || {}).textContent || '';
  t.querySelector('.m-sinmedm').value = 'Había mercancía delante y no se podía acceder';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'co-1'), true);
  await new Promise(r => setTimeout(r, 1500));
  const av = g.S.avisos.find(x => x.id === 'co-1');
  const { data } = await g.sb.from('medidas').select('*').eq('aviso_id', 'co-1');
  return { err1, cerrado: !!av.cerrado, trabajo: av.trabajo,
           n: (data || []).length,
           orden: (data || []).map(m => m.orden),
           sinMed: (data || []).filter(m => m.sin_medir).map(m => m.sin_medir_motivo) };
});
paso('marcar «no se ha podido medir» sin motivo no deja cerrar',
  /escribe por qué/.test(sinMedir.err1) && /hueco 3/.test(sinMedir.err1), sinMedir.err1);
paso('con el motivo puesto, la visita se cierra', sinMedir.cerrado === true);
paso('se guardan los tres huecos, en su orden', sinMedir.n === 3 &&
  sinMedir.orden.join(',') === '0,1,2', sinMedir.orden.join(' · '));
paso('y el hueco sin medir guarda su motivo, sin inventar medidas',
  sinMedir.sinMed.length === 1 && /mercancía/.test(sinMedir.sinMed[0]), sinMedir.sinMed.join(' · '));
paso('el «qué has hecho» se rellena solo contando los huecos medidos',
  /2 huecos/.test(sinMedir.trabajo || ''), sinMedir.trabajo);

/* ================================================================
   7. Al reabrir el parte, lo medido está donde se dejó
   ================================================================ */
bloque('7. Se vuelve a leer lo guardado');

const reabrir = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  g.dlgCierre('co-1');
  await new Promise(r => setTimeout(r, 1600));
  const cs = [...document.querySelectorAll('#dlg-form .medida')];
  return {
    cuantos: cs.length,
    ubis: cs.map(x => x.querySelector('.m-ubi').value),
    anchos: cs.map(x => x.querySelector('.m-ancho').value),
    aux: cs.map(x => x.querySelector('.m-aux').value),
    sinmed: cs.map(x => x.querySelector('.m-sinmed').checked),
    motivo: cs[2] ? cs[2].querySelector('.m-sinmedm').value : '',
  };
});
paso('al reabrir salen los TRES huecos, no los dos del principio',
  reabrir.cuantos === 3, reabrir.cuantos);
paso('cada uno con su sitio',
  /portón izquierdo/.test(reabrir.ubis[0] || '') &&
  /Entrada de oficinas/.test(reabrir.ubis[1] || '') &&
  /almacén alto/.test(reabrir.ubis[2] || ''),
  reabrir.ubis.join(' | '));
paso('y con sus medidas donde estaban',
  reabrir.anchos.join(',') === '4000,1600,', reabrir.anchos.join(' · '));
paso('los auxiliares del primero siguen en el primero',
  /fotocélulas/.test(reabrir.aux[0]) && !reabrir.aux[1], reabrir.aux.join(' | '));
paso('el hueco sin medir sigue marcado, y con su motivo',
  reabrir.sinmed.join(',') === 'false,false,true' && /mercancía/.test(reabrir.motivo),
  reabrir.sinmed.join(' · '));

const quitado = await T(async () => {
  const g = window.__T;
  /* Se quita el tercero y se guarda: tiene que desaparecer de la base */
  document.querySelectorAll('[data-act="med-quitar"]')[2].click();
  await new Promise(r => setTimeout(r, 300));
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'co-1'), false);
  await new Promise(r => setTimeout(r, 1300));
  const { data } = await g.sb.from('medidas').select('*').eq('aviso_id', 'co-1');
  return { n: (data || []).length, ubis: (data || []).map(m => m.ubicacion) };
});
paso('un hueco quitado desaparece de verdad al guardar', quitado.n === 2, quitado.n);
paso('y el que desaparece es el que se quitó',
  !quitado.ubis.some(u => /almacén alto/.test(u || '')), quitado.ubis.join(' · '));

/* ================================================================
   8. Del parte sale el presupuesto
   ================================================================ */
bloque('8. Un capítulo por hueco en el presupuesto');

const presu = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  await g.presupuestoDesdeAsistencia(g.S.avisos.find(x => x.id === 'co-1'));
  await new Promise(r => setTimeout(r, 1200));
  const d = g.S.presu || {};
  return {
    titulo: d.titulo || '',
    descripcion: d.descripcion || '',
    aviso: d.aviso_id,
    cliente: !!d.cliente_id,
    tipos: (d.lineas || []).map(l => l.tipo),
    rotulos: (d.lineas || []).filter(l => l.tipo === 'capitulo').map(l => l.descripcion),
    textos: (d.lineas || []).filter(l => l.tipo === 'texto').map(l => l.descripcion),
    total: g.totalesPresu ? g.totalesPresu(d.lineas || [], 0, 21).total : null,
  };
});
paso('el presupuesto nace con dos capítulos, uno por hueco',
  presu.tipos.filter(t => t === 'capitulo').length === 2, presu.tipos.join(' · '));
paso('cada capítulo lleva el sitio, el tipo y la medida',
  /Nave trasera/.test(presu.rotulos[0]) && /Seccional/.test(presu.rotulos[0]) &&
  /4000 x 4200 mm/.test(presu.rotulos[0]), presu.rotulos.join(' | '));
paso('y debajo el detalle, con los auxiliares tal y como los escribió el técnico',
  /Dintel libre: 600 mm/.test(presu.textos[0]) && /fotocélulas/i.test(presu.textos[0]),
  (presu.textos[0] || '').slice(0, 90));
paso('la acometida que hay que llevar sale escrita, que es lo que se olvida ofertar',
  /hay que llevarla/i.test(presu.textos[1] || ''), (presu.textos[1] || '').slice(0, 90));
paso('el presupuesto queda atado a la visita y al cliente',
  presu.aviso === 'co-1' && presu.cliente === true);
paso('el título dice de qué es', /Oferta de 2 puertas/.test(presu.titulo), presu.titulo);
paso('la descripción dice que las medidas son del hueco',
  /medidas son del hueco/i.test(presu.descripcion), presu.descripcion.slice(0, 80));
/* Los capítulos y los textos no suman: si sumaran, el presupuesto nacería con
   un importe que nadie ha puesto y se podría mandar así. */
paso('ni los capítulos ni los textos suman un céntimo', presu.total === 0, presu.total);

/* ================================================================
   9. La hoja que firma el cliente
   ================================================================ */
bloque('9. Las medidas en el parte impreso');

const impreso = await T(async () => {
  const g = window.__T;
  let html = '';
  const abrir = window.open;
  window.open = () => ({ document: { write: t => { html += t; }, close(){}, title:'' },
                         focus(){}, print(){}, close(){} });
  await g.hojaParte('co-1');
  await new Promise(r => setTimeout(r, 900));
  window.open = abrir;
  const limpio = html.replace(/<[^>]*>/g, ' ');
  return { tiene: /Toma de medidas/.test(html),
           huecos: (html.match(/Hueco 1|Hueco 2/g) || []).length,
           medidas: /4000 mm/.test(limpio) && /4200 mm/.test(limpio),
           aux: /fotocélulas/i.test(limpio),
           aviso: /medidas definitivas de fabricación/i.test(limpio) };
});
paso('el parte impreso lleva la toma de medidas', impreso.tiene === true);
paso('con un bloque por hueco', impreso.huecos === 2, impreso.huecos);
paso('las medidas salen en milímetros', impreso.medidas === true);
paso('y los auxiliares también', impreso.aux === true);
/* Esto es lo que evita una discusión: el parte no es una medida de fabricación */
paso('se dice que las medidas de fabricación se comprueban antes de pedir',
  impreso.aviso === true);

/* ================================================================
   10. Y la de siempre: la comercial no se cobra
   ================================================================ */
bloque('10. Medir no es facturar');

const cobro = await T(async () => {
  const g = window.__T;
  const av = g.S.avisos.find(x => x.id === 'co-1');
  return { sinValor: g.seValoraEnCero(av), sinCobro: g.SIN_COBRO.includes('comercial') };
});
paso('una comercial con medidas se sigue valorando en cero', cobro.sinValor === true);
paso('y no se pide cobro en obra en una comercial', cobro.sinCobro === true);

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
