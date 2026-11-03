/* ================================================================
   campo.mjs — menos pasos para el técnico en obra.    03-11-2026

   POR QUÉ EXISTE
   «Algún consejo más para reducir los pasos de los técnicos en el
   cierre del parte, el dado de alta de las puertas y cualquier
   función que tenga que hacer?» David. Y después: «Los 5 puntos que
   me aconsejas me parecen muy buena idea para reducir los tiempos
   administrativos en la obra. Comienza a prepararlos.»

   Los cinco, y lo que esta suite fija de cada uno:

     1. Frases hechas en diagnóstico y trabajo realizado. Un toque
        las añade, no se repiten, y la lista la manda la oficina.
     2. Lo que llevas en la furgoneta, primero en el desplegable de
        material, y aparte del resto del almacén.
     3. La etiqueta del material se lee DESDE el parte, sin salir de
        él: ni con la cámara ni escribiendo el código se pierde lo
        que había a medio rellenar.
     4. «He llegado» sella la hora de entrada al llegar, no de
        memoria ocho horas después.
     5. «Otra puerta igual» copia la ficha de la puerta anterior de
        la obra, y NO copia lo que identifica a cada puerta.

   La línea roja de las cinco: ahorrar pasos no es dar por hecho lo
   que nadie ha mirado. Por eso lo copiado se enseña, y lo que es de
   una puerta y solo de una no se copia nunca.
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
const ctx = await nav.newContext({ viewport:{width:1320,height:2000},
  locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    /* Dos materiales con etiqueta y uno sin ella, que es lo que hay de verdad
       en el catálogo viejo. */
    db.articulos.push(
      { id:'art-banda', descripcion:'Banda de seguridad resistiva 2 m', unidad:'ud',
        familia:'Seguridad', marca:'ASO', minimo:2, codigo:'MAT-0001', token:'A3K9', activo:true },
      { id:'art-foto', descripcion:'Fotocélula de espejo', unidad:'ud', familia:'Seguridad',
        marca:'Erreka', codigo:'MAT-0002', token:'B4L0', activo:true },
      { id:'art-viejo', descripcion:'Tornillería variada', unidad:'kg', activo:true });
    db.catalogo = db.articulos;
    /* Una obra con una puerta ya dada de alta, para poder copiarla */
    db.avisos.push({ id:'av-campo', tipo:'instalacion', estado:'asignado', prioridad:'normal',
      tecnico_id:'usuario-admin', cliente_id: db.puertas[0].cliente_id,
      puerta_id: db.puertas[0].id, descripcion:'Cuatro seccionales iguales',
      creado:new Date().toISOString(), fecha_prevista:new Date().toISOString().slice(0,10) });
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
   1. Frases hechas
   ================================================================ */
bloque('1. Frases hechas en el diagnóstico y en el trabajo');

const fr = await T(() => {
  const g = window.__T;
  return { diag: g.FRASES_DIAG, trab: g.FRASES_TRAB,
           listaDiag: g.lista('frases_diag', g.FRASES_DIAG),
           listaTrab: g.lista('frases_trab', g.FRASES_TRAB),
           html: g.frasesDe('frases_diag', g.FRASES_DIAG, 'z-diag') };
});
paso('hay frases de fábrica para el diagnóstico', fr.diag.length >= 8, fr.diag.length);
paso('y para el trabajo realizado', fr.trab.length >= 8, fr.trab.length);
paso('las de diagnóstico son síntomas, no trabajos',
  fr.diag.some(x => /fotoc/i.test(x)) && !fr.diag.some(x => /^Alineada/.test(x)),
  fr.diag[0]);
paso('las de trabajo están en pasado: es lo que se ha hecho',
  fr.trab.filter(x => /ad[oa]s?\b|id[oa]s?\b/i.test(x)).length >= 6, fr.trab[0]);
paso('cada frase es un botón que dice a qué campo va',
  /data-act="frase"/.test(fr.html) && /data-campo="z-diag"/.test(fr.html));

const enParte = await T(async () => {
  const g = window.__T;
  g.dlgCierre('av-campo');
  await new Promise(r => setTimeout(r, 1000));
  const diag = document.getElementById('z-diag');
  const botones = [...document.querySelectorAll('#dlg-form [data-act="frase"][data-campo="z-diag"]')];
  botones[0].click();
  await new Promise(r => setTimeout(r, 120));
  const uno = diag.value;
  botones[1].click();
  await new Promise(r => setTimeout(r, 120));
  const dos = diag.value;
  botones[1].click();   // dos veces el mismo, sin querer
  await new Promise(r => setTimeout(r, 120));
  return { uno, dos, repetido: diag.value,
           aviso: (document.getElementById('toast') || {}).textContent || '',
           nBotones: botones.length };
});
paso('un toque escribe la frase en el diagnóstico', enParte.uno.length > 5, enParte.uno);
paso('la segunda se añade detrás, separada por un punto',
  enParte.dos.indexOf(enParte.uno) === 0 && /\. /.test(enParte.dos), enParte.dos);
paso('dar dos veces al mismo botón no la repite',
  enParte.repetido === enParte.dos && /ya está puesto/i.test(enParte.aviso), enParte.aviso);
paso('se puede seguir escribiendo a mano: es un campo normal', enParte.nBotones >= 8);

/* ================================================================
   2. Lo de la furgoneta, primero
   ================================================================ */
bloque('2. Lo que llevas encima sale primero');

const furgo = await T(async () => {
  const g = window.__T;
  const nave = g.laNave();
  const fur = await g.asegurarFurgoneta(g.S.perfil.id);
  await g.moverMaterial({ articulo_id:'art-banda', cantidad:10, hasta:nave.id, motivo:'compra' });
  await g.moverMaterial({ articulo_id:'art-foto', cantidad:4, hasta:nave.id, motivo:'compra' });
  await g.moverMaterial({ articulo_id:'art-banda', cantidad:2, desde:nave.id, hasta:fur.id, motivo:'traspaso' });
  await g.cargar();
  const html = g.filaMaterial();
  const caja = document.createElement('div'); caja.innerHTML = html;
  const grupos = [...caja.querySelectorAll('optgroup')].map(x => x.label);
  const enFurgo = [...caja.querySelectorAll('optgroup')][0];
  return { grupos, enFurgo: enFurgo ? [...enFurgo.querySelectorAll('option')].map(o => o.textContent) : [],
           llevo: g.existenciasDe('art-banda').enMiFurgoneta,
           noLlevo: g.existenciasDe('art-foto').enMiFurgoneta };
});
paso('el desplegable parte en dos: lo tuyo y el resto',
  furgo.grupos.length === 2 && /furgoneta/i.test(furgo.grupos[0]) && /almac/i.test(furgo.grupos[1]),
  furgo.grupos.join(' · '));
paso('arriba está lo que llevas en la furgoneta',
  furgo.enFurgo.length === 1 && /Banda/.test(furgo.enFurgo[0]), furgo.enFurgo.join(' · '));
paso('y lo que no llevas no se cuela arriba', furgo.llevo === 2 && furgo.noLlevo === 0,
  'banda '+furgo.llevo+' · fotocélula '+furgo.noLlevo);

/* ================================================================
   3. Leer la etiqueta desde el parte
   ================================================================ */
bloque('3. La etiqueta del material, desde el parte');

const lee = await T(() => {
  const g = window.__T;
  return {
    qr: g.articuloDeEtiqueta('https://arizapa.es/#M-MAT0001-A3K9'),
    soloCod: g.articuloDeEtiqueta('M-MAT0002-B4L0'),
    aMano: g.articuloDeEtiqueta('MAT-0001'),
    sinGuion: g.articuloDeEtiqueta('mat0002'),
    soloNumero: g.articuloDeEtiqueta('1'),
    tokenMalo: g.articuloDeEtiqueta('M-MAT0001-ZZZZ'),
    noExiste: g.articuloDeEtiqueta('MAT-9999'),
    basura: g.articuloDeEtiqueta('hola'),
    vacio: g.articuloDeEtiqueta('  ')
  };
});
paso('el QR entero lleva al material', (lee.qr.art || {}).id === 'art-banda');
paso('el código del QR a secas también', (lee.soloCod.art || {}).id === 'art-foto');
paso('y escrito a mano, como está impreso', (lee.aMano.art || {}).id === 'art-banda');
paso('sin el guion también vale: se teclea deprisa', (lee.sinGuion.art || {}).id === 'art-foto');
paso('solo el número vale: MAT-0001 es el 1', (lee.soloNumero.art || {}).id === 'art-banda');
paso('un código de seguridad que no cuadra NO abre el material',
  lee.tokenMalo.art === null && lee.tokenMalo.motivo === 'token');
paso('un código que no existe se dice, con el código', lee.noExiste.art === null &&
  lee.noExiste.motivo === 'sin-material' && lee.noExiste.codigo === 'MAT-9999');
paso('cualquier otra cosa no se adivina', lee.basura.art === null && lee.basura.motivo === 'no-es-codigo');
paso('y el campo vacío no da error, pide el código', lee.vacio.motivo === 'vacio');

const lector = await T(async () => {
  const g = window.__T;
  /* El parte sigue abierto del bloque 1: eso es justo lo que hay que proteger */
  const diagAntes = document.getElementById('z-diag').value;
  const btn = document.querySelector('#dlg-form [data-act="mat-leer"]');
  btn.click();
  await new Promise(r => setTimeout(r, 400));
  const caja = document.getElementById('mat-lector');
  const campo = document.getElementById('mat-cod');
  const aviso = document.getElementById('mat-lector-aviso');
  const abierto = caja && !caja.hidden;
  /* Se escribe el código y se da a Buscar */
  campo.value = 'MAT-0001';
  document.querySelector('#dlg-form [data-act="mat-cod-buscar"]').click();
  await new Promise(r => setTimeout(r, 300));
  const filas1 = [...document.querySelectorAll('#mats .mat-fila')];
  const linea1 = filas1.map(f => ({ art:(f.querySelector('.mat-art')||{}).value,
    desc:(f.querySelector('.mat-desc')||{}).value, cant:(f.querySelector('.mat-cant')||{}).value }));
  /* La misma caja otra vez: suma, no repite línea */
  btn.click();
  await new Promise(r => setTimeout(r, 300));
  document.getElementById('mat-cod').value = 'MAT-0001';
  document.querySelector('#dlg-form [data-act="mat-cod-buscar"]').click();
  await new Promise(r => setTimeout(r, 300));
  const filas2 = [...document.querySelectorAll('#mats .mat-fila')];
  return { abierto, puedeCamara: g.puedeLeerCamara(),
           aviso: aviso ? aviso.textContent : '',
           linea1, n1: filas1.length, n2: filas2.length,
           cant2: (filas2.find(f => (f.querySelector('.mat-art')||{}).value === 'art-banda')
                   .querySelector('.mat-cant')).value,
           diagIgual: document.getElementById('z-diag').value === diagAntes,
           sigueAbierto: document.getElementById('dlg').open };
});
paso('el lector se abre dentro del parte', lector.abierto === true);
paso('el parte NO se ha cerrado al abrirlo: nada de otro diálogo',
  lector.sigueAbierto === true && lector.diagIgual === true);
paso('si el teléfono no sabe leer códigos, lo dice y pide el código escrito',
  lector.puedeCamara ? /Acerca el QR/.test(lector.aviso) : /Escribe el código/.test(lector.aviso),
  lector.aviso);
paso('el código escrito añade el material como línea del parte',
  lector.linea1.some(l => l.art === 'art-banda' && /Banda/.test(l.desc) && l.cant === '1'),
  JSON.stringify(lector.linea1));
paso('la segunda caja igual suma una unidad, no añade otra línea',
  lector.n2 === lector.n1 && lector.cant2 === '2', 'líneas '+lector.n1+'→'+lector.n2+', cantidad '+lector.cant2);

const intro = await T(async () => {
  const campo = document.getElementById('mat-cod');
  const abierto = !!campo;
  if (!abierto) return { abierto };
  campo.value = 'MAT-0002';
  campo.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true }));
  await new Promise(r => setTimeout(r, 300));
  const filas = [...document.querySelectorAll('#mats .mat-fila')];
  return { abierto, sigueAbierto: document.getElementById('dlg').open,
           puesto: filas.some(f => (f.querySelector('.mat-art')||{}).value === 'art-foto'),
           limpio: document.getElementById('mat-cod') ? document.getElementById('mat-cod').value : null };
});
paso('Intro en el código busca el material', intro.puesto === true);
paso('Intro NO cierra la visita, que es lo que hace un Intro en un formulario',
  intro.sigueAbierto === true);
paso('y el campo se vacía para la caja siguiente', intro.limpio === '', JSON.stringify(intro.limpio));

const cerrado = await T(async () => {
  const g = window.__T;
  document.querySelector('#dlg-form [data-act="mat-leer-cerrar"]').click();
  await new Promise(r => setTimeout(r, 200));
  const caja = document.getElementById('mat-lector');
  const tras = { oculto: caja.hidden, sinCamara: g.LECTOR.stream === null && g.LECTOR.timer === null };
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 200));
  return Object.assign(tras, { trasCerrar: g.LECTOR.stream === null && g.LECTOR.timer === null });
});
paso('al cerrar el lector se guarda y la cámara se apaga',
  cerrado.oculto === true && cerrado.sinCamara === true);
paso('y al cerrar el parte tampoco se queda la cámara encendida', cerrado.trasCerrar === true);

/* ================================================================
   4. «He llegado»
   ================================================================ */
bloque('4. La hora de entrada se sella al llegar');

const llegada = await T(async () => {
  const g = window.__T;
  const av = g.S.avisos.find(x => x.id === 'av-campo');
  const antes = av.hora_inicio || null;
  const html = g.tarjetaTrabajo(av);
  const hayBoton = /data-act="he-llegado"/.test(html);
  /* Se pulsa desde la vista, como lo haría el técnico */
  g.S.tab = 'trabajo'; g.pintar();
  await new Promise(r => setTimeout(r, 600));
  const b = document.querySelector('[data-act="he-llegado"][data-id="av-campo"]');
  if (b) b.click();
  await new Promise(r => setTimeout(r, 1200));
  const des = g.S.avisos.find(x => x.id === 'av-campo');
  const html2 = g.tarjetaTrabajo(des);
  return { antes, hayBoton, hora: des.hora_inicio, estado: des.estado,
           sigueElBoton: /data-act="he-llegado"/.test(html2),
           diceLaHora: /Llegada \d\d:\d\d/.test(html2),
           hhmm: g.hhmm(des.hora_inicio) };
});
paso('mientras no hay hora, la tarjeta ofrece «He llegado»',
  llegada.antes === null && llegada.hayBoton === true);
paso('un toque sella la hora de entrada', !!llegada.hora, llegada.hhmm);
paso('y la visita pasa a en curso: está empezada de verdad',
  llegada.estado === 'en_curso', llegada.estado);
paso('después el botón desaparece: ya no hay nada que sellar',
  llegada.sigueElBoton === false);
paso('en su sitio queda la hora, por si hay que corregirla', llegada.diceLaHora === true);

const enCierre = await T(async () => {
  const g = window.__T;
  g.dlgCierre('av-campo');
  await new Promise(r => setTimeout(r, 900));
  const ini = document.getElementById('z-ini');
  const texto = document.getElementById('dlg-form').innerText;
  const v = ini ? ini.value : '';
  g.cerrarDlg();
  return { v, lo: /La selló el botón/.test(texto) };
});
paso('al cerrar el parte la hora de entrada ya viene puesta',
  /^\d\d:\d\d$/.test(enCierre.v), enCierre.v);
paso('y el parte dice de dónde sale, para poder cambiarla', enCierre.lo === true);

/* ================================================================
   5. «Otra puerta igual»
   ================================================================ */
bloque('5. Otra puerta igual que la anterior de la obra');

const molde = await T(async () => {
  const g = window.__T;
  const pu = g.S.puertas[0];
  /* Se le pone de todo, lo del modelo y lo que es suyo y de nadie más */
  await g.sb.from('puertas').update({
    tipo:'Seccional', uso:'Industrial', marca:'Hörmann', modelo:'SPU F42', anio:2019,
    instalador:'ARIZA', ancho_mm:4000, alto_mm:4500, dintel_mm:600, arrastre_kg:1200,
    matricula:'Hörmann SPU F42, nº 4471-2019', sin_matricula:null,
    ubicacion:'muelle 2', notas:'La del fondo, la que da al patio',
    peso_kg:320, vueltas_muelle:7.5, modo:'pulsador', usuarios:'formados',
    seguridad:['Fotocélulas','Banda de seguridad'],
    ultima_revision:'2026-03-01', proxima_revision:'2027-03-01'
  }).eq('id', pu.id);
  await g.cargar();
  const o = g.S.puertas.find(x => x.id === pu.id);
  const m = g.moldeDePuerta(o);
  return { codigoOrigen: o.codigo, m, copiado: m.__copiado.map(x => x[0]),
           noSeCopia: g.NO_SE_COPIA };
});
paso('lo del modelo se copia',
  molde.m.tipo === 'Seccional' && molde.m.marca === 'Hörmann' && molde.m.modelo === 'SPU F42' &&
  molde.m.ancho_mm === 4000 && molde.m.alto_mm === 4500 && molde.m.arrastre_kg === 1200);
paso('el cliente, el centro y la dirección también: es la misma obra',
  molde.m.cliente_id !== undefined && molde.m.direccion !== undefined);
paso('el modo, los usuarios y la seguridad instalada se copian',
  molde.m.modo === 'pulsador' && molde.m.usuarios === 'formados' &&
  (molde.m.seguridad || []).length === 2);
paso('la etiqueta NO se copia: dos puertas con el mismo código es peor que nada',
  molde.m.codigo === undefined && molde.m.token === undefined && molde.m.id === undefined);
paso('la matrícula NO se copia: es la placa de ESA puerta',
  molde.m.matricula === undefined && molde.m.sin_matricula === undefined);
paso('la ubicación NO se copia: dos puertas no están en el mismo sitio',
  molde.m.ubicacion === undefined);
paso('las observaciones NO se copian: hablan de otra puerta',
  molde.m.notas === undefined);
paso('las fechas de revisión NO se copian: la nueva no se ha revisado',
  molde.m.ultima_revision === undefined && molde.m.proxima_revision === undefined);
paso('el peso y las vueltas de muelle NO se copian: nadie los ha medido aquí',
  molde.m.peso_kg === undefined && molde.m.vueltas_muelle === undefined,
  'peso '+molde.m.peso_kg+' · muelle '+molde.m.vueltas_muelle);
paso('la puerta nueva nace operativa, no con el estado de la otra',
  molde.m.estado === 'operativa');
paso('el molde sabe de qué puerta viene, para poder decirlo',
  molde.m.__copiadaDe === molde.codigoOrigen, molde.m.__copiadaDe);
paso('y trae la lista de lo copiado, con nombres de persona',
  molde.copiado.includes('Tipo') && molde.copiado.includes('Ancho') &&
  molde.copiado.includes('Seguridad instalada'), molde.copiado.join(' · '));

const alta = await T(async () => {
  const g = window.__T;
  const pu = g.S.puertas[0];
  const m = g.moldeDePuerta(pu);
  g.dlgPuerta(null, 'av-campo', m);
  await new Promise(r => setTimeout(r, 900));
  const v = id => { const e = document.getElementById(id); return e ? e.value : null; };
  const texto = document.getElementById('dlg-form').innerText;
  const r = { tipo: v('f-tipo'), marca: v('f-marca'), modelo: v('f-modelo'),
    ancho: v('f-ancho'), alto: v('f-alto'), arrastre: v('f-arrastre'),
    cod: v('f-cod'), matricula: v('f-matricula'), sinmat: v('f-sinmat'),
    ubi: v('f-ubi'), notas: v('f-notas'), ult: v('f-ult'), prox: v('f-prox'),
    muelle: v('f-muelle'), cli: v('f-cbusca'),
    segs: [...document.querySelectorAll('#f-segs .f-seg:checked')].map(x => x.value),
    dice: /Copiado de la puerta/.test(texto),
    diceQueNo: /No se ha copiado/.test(texto),
    diceRepasa: /Repásalo mirando la puerta/.test(texto),
    titulo: (document.querySelector('#dlg-form h3') || {}).textContent };
  g.cerrarDlg();
  return r;
});
paso('el formulario sale relleno con lo del modelo',
  alta.tipo === 'Seccional' && alta.marca === 'Hörmann' && alta.ancho === '4000' &&
  alta.arrastre === '1200', JSON.stringify([alta.tipo, alta.marca, alta.ancho, alta.arrastre]));
paso('con el cliente de la obra ya puesto', !!alta.cli, alta.cli);
paso('y con la seguridad instalada marcada', alta.segs.length === 2, alta.segs.join(' · '));
paso('la etiqueta sale sin elegir: la pega el técnico y la elige él',
  !alta.cod || alta.cod === '', JSON.stringify(alta.cod));
paso('la matrícula sale en blanco', alta.matricula === '' && alta.sinmat === '');
paso('la ubicación, las observaciones y las revisiones, en blanco',
  alta.ubi === '' && alta.notas === '' && alta.ult === '' && alta.prox === '');
paso('las vueltas de muelle, en blanco: se cuentan en esta puerta',
  alta.muelle === '' || alta.muelle === null, JSON.stringify(alta.muelle));
paso('la pantalla dice de qué puerta se ha copiado', alta.dice === true);
paso('dice qué NO se ha copiado, para que no se dé por hecho', alta.diceQueNo === true);
paso('y manda repasarlo mirando la puerta de delante', alta.diceRepasa === true);
paso('sigue siendo un alta de puerta nueva', /Nueva puerta/.test(alta.titulo||''), alta.titulo);

const botonMolde = await T(async () => {
  const g = window.__T;
  const av = g.S.avisos.find(x => x.id === 'av-campo');
  const html = g.bloquePuertasObra(av, g.puertasDeAviso('av-campo'));
  return { hay: /data-act="otra-igual"/.test(html),
           dice: (html.match(/Otra igual que [^<]*/) || [''])[0] };
});
paso('la obra ofrece el botón «Otra igual que…» con el código de la anterior',
  botonMolde.hay === true && /Otra igual que .+/.test(botonMolde.dice), botonMolde.dice);

const sinPuertas = await T(() => {
  const g = window.__T;
  const av = { id:'x', tipo:'instalacion', estado:'asignado' };
  let html = '';
  try { html = g.bloquePuertasObra(av, []); } catch(e){ html = 'ERROR '+e.message; }
  return { html: /data-act="otra-igual"/.test(html), err: /^ERROR/.test(html) };
});
paso('sin ninguna puerta todavía no se ofrece copiar nada',
  sinPuertas.html === false && sinPuertas.err === false);

const borrador = await T(async () => {
  const g = window.__T;
  /* Un borrador abandonado de otra alta no puede machacar lo copiado */
  g.S.borradorPuerta = { 'f-marca':'Erreka', 'f-tipo':'Corredera' };
  const m = g.moldeDePuerta(g.S.puertas[0]);
  g.dlgPuerta(null, 'av-campo', m);
  await new Promise(r => setTimeout(r, 900));
  const r = { marca: (document.getElementById('f-marca')||{}).value,
              tipo: (document.getElementById('f-tipo')||{}).value,
              borrador: g.S.borradorPuerta };
  g.cerrarDlg();
  return r;
});
paso('un borrador suelto de otra alta no pisa lo copiado',
  borrador.marca === 'Hörmann' && borrador.tipo === 'Seccional' && borrador.borrador === null,
  borrador.marca+' · '+borrador.tipo);

/* ================================================================
   6. El camino de verdad: desde el parte abierto
   ================================================================
   Esto es lo que se rompió cinco veces seguidas en otros botones que
   salen del parte: salir sin guardar. El parte lleva el diagnóstico,
   el trabajo, los materiales, las horas y el guión; si al irse a dar
   de alta la puerta no se guarda, se pierde todo eso. */
bloque('6. Salir del parte a dar de alta la puerta, guardando');

const camino = await T(async () => {
  const g = window.__T;
  g.dlgCierre('av-campo');
  await new Promise(r => setTimeout(r, 1000));
  const diag = document.getElementById('z-diag');
  diag.value = 'Lo escrito antes de irse a dar de alta la segunda puerta';
  diag.dispatchEvent(new Event('input', { bubbles:true }));
  const b = document.querySelector('#dlg-form [data-act="otra-igual"]');
  const hay = !!b;
  if (b) b.click();
  await new Promise(r => setTimeout(r, 2000));
  const texto = document.getElementById('dlg-form').innerText;
  const av = g.S.avisos.find(x => x.id === 'av-campo');
  const r = { hay, guardado: av.diagnostico || '',
    enAlta: /Nueva puerta/.test(texto), copiado: /Copiado de la puerta/.test(texto),
    tipo: (document.getElementById('f-tipo')||{}).value,
    cod: (document.getElementById('f-cod')||{}).value };
  g.cerrarDlg();
  return r;
});
paso('el botón está dentro del parte', camino.hay === true);
paso('al salir a dar de alta la puerta, el parte se guarda primero',
  /antes de irse a dar de alta/.test(camino.guardado), camino.guardado);
paso('y se llega al alta de puerta, no se queda el parte cerrado y en blanco',
  camino.enAlta === true);
paso('el alta llega con el molde puesto y lo dice',
  camino.copiado === true && camino.tipo === 'Seccional', camino.tipo);
paso('y sin etiqueta elegida', camino.cod === '', JSON.stringify(camino.cod));

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
