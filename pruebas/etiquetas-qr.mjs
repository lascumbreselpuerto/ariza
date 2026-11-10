/* ================================================================
   etiquetas-qr.mjs — la etiqueta QR de principio a fin
                                                     09-11-2026

   DE DÓNDE SALE
   David, el 09-11-2026:

     «Cuando desde oficina se crea una nueva asistencia y desde esta
      se crea la puerta con datos básicos, veo que falta el añadir o
      asignar QR a esa puerta. Además desde los cuadros de
      asistencias asignadas en Mi trabajo se debe de poder imprimir
      el QR, para que el técnico pueda imprimir la pegatina desde la
      furgoneta con la impresora portátil.»

   Y al acotar el escaneo:

     «La puerta debe de estar ya dada de alta desde la empresa, ya
      que para que una asistencia se cree necesita tener asignada
      una puerta aunque esta puerta no esté completa su info.»

   LO QUE VIGILA ESTA SUITE
     1. Que el alta rápida NO deje crear una puerta sin etiqueta, y
        que cuando no quedan libres dé la salida en vez de dejar a
        la oficina atascada con un cliente al teléfono.
     2. Que la pegatina se pueda imprimir desde la tarjeta de Mi
        trabajo, y SOLO cuando el QR lleva a algún sitio: una puerta
        con código escrito pero sin fila de etiqueta no tiene código
        de seguridad, y esa pegatina no sirve.
     3. Que al escanear mande a un sitio distinto según quién sea:
        el cliente a su ficha pública, el equipo a la de dentro.
     4. Que asignar una etiqueta pegada NO cree puertas, que es la
        línea que marcó David.
     5. Que la cuenta de etiquetas libres sea la misma en todas las
        pantallas, ahora que hay una sola función.
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
    /* Tres etiquetas libres y una puerta sin etiqueta: el caso de David, la
       puerta creada desde la oficina a la que hay que ponerle el QR. */
    db.etiquetas = (db.etiquetas || []).concat([
      { codigo:'AR-9001', token:'K3MP' },
      { codigo:'AR-9002', token:'L7QR' },
      { codigo:'AR-9003', token:'M2TV' },
    ]);
    const pu = db.puertas[0];
    db.puertas.push({ id:'pu-sin-et', cliente_id: pu.cliente_id, cliente: pu.cliente,
      tipo:'Seccional', ubicacion:'Muelle 3', direccion: pu.direccion,
      estado:'operativa', seguridad:[], creado:new Date().toISOString() });
    db.avisos.push({ id:'av-qr', tipo:'averia', estado:'asignado', prioridad:'normal',
      tecnico_id:'usuario-admin', puerta_id: pu.id, cliente_id: pu.cliente_id,
      descripcion:'No cierra del todo', creado:new Date().toISOString(),
      fecha_prevista:new Date().toISOString().slice(0,10) });
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

/* ================================================================
   1. Una sola cuenta de etiquetas libres
   ================================================================ */
bloque('1. Las etiquetas libres se cuentan igual en todas partes');

const cuenta = await T(() => {
  const g = window.__T;
  const libres = g.etiquetasLibres();
  const puesta = (g.S.puertas.find(p => p.codigo) || {}).codigo;
  return {
    n: libres.length,
    incluyeLaPuesta: puesta ? libres.some(e => e.codigo === puesta) : null,
    /* Con la excepción: editando la puerta que la lleva, la suya sigue saliendo
       o se le borraría el código al reabrir su ficha */
    conExcepcion: puesta
      ? g.etiquetasLibres((g.S.puertas.find(p => p.codigo === puesta) || {}).id)
          .some(e => e.codigo === puesta)
      : null,
    deUnaPuerta: !!g.etiquetaDe(g.S.puertas.find(p => p.codigo)),
    deUnaSinCodigo: !!g.etiquetaDe({ codigo: '' }),
    deUnCodigoInventado: !!g.etiquetaDe({ codigo: 'AR-0000' }),
  };
});
paso('hay etiquetas libres para la prueba', cuenta.n >= 3, cuenta.n);
paso('una etiqueta ya pegada NO cuenta como libre', cuenta.incluyeLaPuesta === false);
paso('pero sí al editar la ficha de la puerta que la lleva', cuenta.conExcepcion === true);
paso('la etiqueta de una puerta se encuentra por su fila', cuenta.deUnaPuerta === true);
paso('una puerta sin código no tiene etiqueta', cuenta.deUnaSinCodigo === false);
paso('y un código sin fila tampoco: sin fila no hay QR válido',
  cuenta.deUnCodigoInventado === false);

/* ================================================================
   2. El alta rápida, con etiqueta obligatoria
   ================================================================ */
bloque('2. Desde la asistencia, la puerta nace con su QR');

const alta = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  g.dlgPuertaRapida(cli.id, 'Calle de la prueba 1', null);
  await new Promise(r => setTimeout(r, 400));
  const sel = document.getElementById('pr-cod');
  const r = {
    hay: !!sel,
    opciones: sel ? [...sel.options].map(o => o.value) : [],
    elegidaSola: sel ? sel.value : '',
    diceDondeImprimir: /Mi trabajo/.test(document.getElementById('dlg-form').innerText),
    textoCabecera: (document.querySelector('#dlg-form p.mini') || {}).textContent || '',
  };
  /* Se intenta crear sin tipo: tiene que quejarse */
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r2 => setTimeout(r2, 250));
  r.sinTipo = (document.querySelector('#dlg-form .err') || {}).textContent || '';
  /* Ahora con tipo y sin etiqueta: se vacía el selector a la fuerza */
  document.getElementById('pr-tipo').value = 'Seccional';
  sel.value = '';
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r2 => setTimeout(r2, 250));
  r.sinEtiqueta = (document.querySelector('#dlg-form .err') || {}).textContent || '';
  return r;
});
paso('el alta rápida ofrece la etiqueta', alta.hay === true);
paso('con una ya elegida, para no tener que pensar', !!alta.elegidaSola, alta.elegidaSola);
paso('y dice dónde se imprime la pegatina', alta.diceDondeImprimir === true);
/* El texto de arriba decía «con el tipo basta para crearla», y dejó de ser
   verdad el día que la etiqueta se hizo obligatoria. No lo cazó ninguna
   prueba: lo vi mirando la captura. Esto lo vigila. (09-11-2026) */
paso('y el texto de arriba NO dice que con el tipo baste',
  !/basta para crearla/.test(alta.textoCabecera) && /etiqueta QR/i.test(alta.textoCabecera),
  (alta.textoCabecera || '').slice(0, 70));
paso('sin tipo no deja crear', /Elige el tipo/.test(alta.sinTipo), alta.sinTipo.slice(0, 48));
paso('SIN ETIQUETA TAMPOCO: es obligatoria',
  /necesita su etiqueta QR/.test(alta.sinEtiqueta), alta.sinEtiqueta.slice(0, 56));

const creada = await T(async () => {
  const g = window.__T;
  document.getElementById('pr-tipo').value = 'Seccional';
  document.getElementById('pr-cod').value = 'AR-9002';
  document.getElementById('pr-ubi').value = 'Rampa del garaje';
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 700));
  const p = (window.__DB.puertas || []).find(x => x.ubicacion === 'Rampa del garaje');
  return { creada: !!p, codigo: p && p.codigo, tipo: p && p.tipo,
           yaNoEstaLibre: g.etiquetasLibres().every(e => e.codigo !== 'AR-9002') };
});
paso('la puerta se crea', creada.creada === true);
paso('y nace con su etiqueta puesta', creada.codigo === 'AR-9002', creada.codigo);
paso('que deja de estar libre en el mismo momento', creada.yaNoEstaLibre === true);

const sinLibres = await T(async () => {
  const g = window.__T;
  const guardadas = g.S.etiquetas;
  g.S.etiquetas = [];                       // se simula que no queda ninguna
  const cli = g.S.clientes[0];
  g.dlgPuertaRapida(cli.id, 'Calle de la prueba 1', null);
  await new Promise(r => setTimeout(r, 400));
  const txt = document.getElementById('dlg-form').innerText;
  const r = { aviso: /No quedan etiquetas libres/.test(txt),
              botonGenerar: !!document.querySelector('[data-act="pr-generar"]'),
              siguePidiendola: !document.getElementById('pr-cod') };
  g.cerrarDlg();
  g.S.etiquetas = guardadas;
  return r;
});
paso('sin etiquetas libres lo dice claro', sinLibres.aviso === true);
paso('y da la salida: generar una serie sin salir de aquí', sinLibres.botonGenerar === true);
paso('no hay selector que elegir, así que no se puede crear a medias',
  sinLibres.siguePidiendola === true);

/* ================================================================
   3. La pegatina, desde la furgoneta
   ================================================================ */
bloque('3. Imprimir la pegatina desde Mi trabajo');

const tarjeta = await T(() => {
  const g = window.__T;
  const a = g.S.avisos.find(x => x.id === 'av-qr');
  const caja = document.createElement('div');
  caja.innerHTML = g.tarjetaTrabajo(a);
  const bot = caja.querySelector('[data-act="etiqueta-imprimir"]');
  /* Y la misma tarjeta con una puerta cuyo código no existe en la tabla */
  const p = g.puertaDe(a.puerta_id);
  const codigoBueno = p.codigo;
  p.codigo = 'AR-INVENTADO';
  const caja2 = document.createElement('div');
  caja2.innerHTML = g.tarjetaTrabajo(a);
  const bot2 = caja2.querySelector('[data-act="etiqueta-imprimir"]');
  p.codigo = codigoBueno;
  return { hay: !!bot, texto: bot && bot.textContent,
           cod: bot && bot.dataset.cod,
           conCodigoFalso: !!bot2,
           sigueLaFicha: !!caja.querySelector('[data-act="abrir"]') };
});
paso('la tarjeta de la visita trae el botón de imprimir', tarjeta.hay === true, tarjeta.texto);
paso('con el código de SU puerta', !!tarjeta.cod, tarjeta.cod);
paso('si el código no tiene fila de etiqueta, no sale el botón',
  tarjeta.conCodigoFalso === false);
paso('y el botón de la ficha de la puerta sigue donde estaba',
  tarjeta.sigueLaFicha === true);

/* ================================================================
   4. Escanear: depende de quién
   ================================================================ */
bloque('4. La misma etiqueta, dos destinos');

const escaneo = await T(async () => {
  const g = window.__T;
  const p = g.S.puertas.find(x => x.codigo);
  const et = g.S.etiquetas.find(e => e.codigo === p.codigo);
  /* Lo que haría la aplicación al escanear con sesión abierta */
  g.S.ficha = null;
  g.abrirPuertaEscaneada({ codigo: et.codigo, token: et.token });
  await new Promise(r => setTimeout(r, 300));
  const r = { fueALaFicha: g.S.ficha === p.id, pestana: g.S.tab };
  /* Una etiqueta con el código bueno y el token cambiado no vale */
  g.S.ficha = null;
  g.abrirPuertaEscaneada({ codigo: et.codigo, token: 'XXXX' });
  await new Promise(r2 => setTimeout(r2, 250));
  r.conTokenMalo = g.S.ficha;
  return r;
});
paso('quien tiene sesión va a la ficha de dentro, no a la del cliente',
  escaneo.fueALaFicha === true);
paso('y a la pestaña de puertas', escaneo.pestana === 'puertas', escaneo.pestana);
paso('un código de seguridad que no cuadra no abre nada',
  escaneo.conTokenMalo === null);

const url = await T(() => {
  const g = window.__T;
  const p = g.S.puertas.find(x => x.codigo);
  const u = g.enlaceQR(p.codigo);
  const ref = g.codigoDeURL ? null : null;
  return { url: u, llevaCodigo: u.indexOf(p.codigo.replace('-','')) > 0,
           llevaToken: u.length > ('https://arizapa.es/#'+p.codigo.replace('-','')).length };
});
paso('el QR lleva el código y el código de seguridad pegado',
  url.llevaCodigo && url.llevaToken, url.url);

/* ================================================================
   5. La etiqueta pegada que no es de nadie
   ================================================================ */
bloque('5. Asignar una etiqueta ya pegada');

const asignar = await T(async () => {
  const g = window.__T;
  g.dlgEtiquetaSinPuerta('AR-9003');
  await new Promise(r => setTimeout(r, 400));
  const sel = document.getElementById('es-puerta');
  const txt = document.getElementById('dlg-form').innerText;
  const r = {
    hay: !!sel,
    /* La línea que marcó David: esto NO crea puertas */
    noCreaPuertas: !/crear.*puerta nueva|dar de alta la puerta/i.test(txt),
    soloSinEtiqueta: sel
      ? [...sel.options].slice(1).every(o => {
          const p = g.puertaDe(o.value);
          return p && !String(p.codigo || '').trim();
        })
      : false,
    estaLaNuestra: sel ? [...sel.options].some(o => o.value === 'pu-sin-et') : false,
  };
  if (sel){
    sel.value = 'pu-sin-et';
    document.querySelector('#dlg-form button[type="submit"]').click();
    await new Promise(r2 => setTimeout(r2, 700));
  }
  const p = (window.__DB.puertas || []).find(x => x.id === 'pu-sin-et');
  r.asignada = p && p.codigo;
  r.abreLaFicha = g.S.ficha === 'pu-sin-et';
  return r;
});
paso('se puede elegir en qué puerta se ha pegado', asignar.hay === true);
paso('solo salen las puertas que no tienen etiqueta', asignar.soloSinEtiqueta === true);
paso('incluida la que creó la oficina sin ponerle QR', asignar.estaLaNuestra === true);
paso('NO ofrece crear puertas: eso se hace desde la asistencia',
  asignar.noCreaPuertas === true);
paso('al elegirla, la etiqueta queda asignada', asignar.asignada === 'AR-9003', asignar.asignada);
paso('y se abre su ficha para rematarla', asignar.abreLaFicha === true);

const todasPuestas = await T(async () => {
  const g = window.__T;
  const guardadas = g.S.puertas;
  g.S.puertas = guardadas.filter(p => String(p.codigo || '').trim());  // ninguna sin etiqueta
  g.dlgEtiquetaSinPuerta('AR-9001');
  await new Promise(r => setTimeout(r, 350));
  const txt = document.getElementById('dlg-form').innerText;
  g.cerrarDlg();
  g.S.puertas = guardadas;
  return { diceQueSeCreaEnLaAsistencia: /desde su asistencia/.test(txt),
           sinSelector: !document.getElementById('es-puerta') };
});
paso('si todas tienen etiqueta, manda a crear la puerta desde la asistencia',
  todasPuestas.diceQueSeCreaEnLaAsistencia === true);
paso('y no ofrece ningún selector vacío', todasPuestas.sinSelector === true);

/* ================================================================
   6. Lo que dice la pegatina
   --------------------------------------------------------------
   David, el 10-11-2026: «en la pegatina pone "Avisos y Urgencias" y
   debería poner "Aviso e información sobre la puerta", de esta
   manera avisamos al cliente que desde ese escaneo se podrá tanto
   revisar la info de la puerta como dar un nuevo aviso».
   Eligió la variante C: el texto encima del QR, que es lo que
   describe, y el teléfono abajo como alternativa.
   ================================================================ */
bloque('6. El texto de la pegatina');

const pegatina = await T(() => {
  const g = window.__T;
  /* Se captura lo que la aplicación escribiría en la ventana de impresión, sin
     abrirla: en el banco no hay ventanas nuevas y tampoco hacen falta. */
  const abrirDeVerdad = window.open;
  /* Con teléfono puesto: es como está la casa de verdad, y es lo que decide si
     el pie de la pegatina se pinta o no. */
  const telAntes = g.S.ajustes.telefono_avisos;
  g.S.ajustes.telefono_avisos = '661 352 795';
  let html = '';
  window.open = () => ({ document: { write: t => { html += t; }, close(){} } });
  g.etiquetaTermica(g.S.etiquetas[0].codigo);
  /* Y sin teléfono, que también pasa si nadie lo ha configurado todavía */
  g.S.ajustes.telefono_avisos = '';
  let sinTel = '';
  window.open = () => ({ document: { write: t => { sinTel += t; }, close(){} } });
  g.etiquetaTermica(g.S.etiquetas[0].codigo);
  g.S.ajustes.telefono_avisos = telAntes;
  let hoja = '';
  window.open = () => ({ document: { write: t => { hoja += t; }, close(){} } });
  g.hojaImprimible();
  window.open = abrirDeVerdad;
  return { html, hoja, sinTel, lema: g.LEMA_QR };
});
paso('la pegatina dice para qué es el QR',
  /Aviso e información sobre la puerta/.test(pegatina.html));
paso('y lo que se encuentra el cliente al escanear',
  /Desbloqueo, estado y avisos/.test(pegatina.html));
paso('el texto va ENCIMA del QR, que es lo que describe',
  pegatina.html.indexOf('Aviso e información') < pegatina.html.indexOf('</svg>'),
  'lema en ' + pegatina.html.indexOf('Aviso e información') + ', QR en ' + pegatina.html.indexOf('</svg>'));
paso('y ya no dice «avisos y urgencias» encima del teléfono',
  !/Avisos y urgencias/i.test(pegatina.html));
paso('el teléfono sigue, como alternativa a escanear',
  /O llámanos/.test(pegatina.html) && /661|\d{3}\s?\d{3}\s?\d{3}/.test(pegatina.html));
/* Las dos pegatinas que acaban en puertas de clientes tienen que decir lo
   mismo: la térmica de una en una y la plancha de la imprenta. */
paso('y si no hay teléfono configurado, el texto del QR sale igual',
  /Aviso e información sobre la puerta/.test(pegatina.sinTel) &&
  !/O llámanos/.test(pegatina.sinTel));
paso('la hoja de la imprenta dice lo mismo que la térmica',
  /Aviso e información sobre la puerta/.test(pegatina.hoja));
paso('y el texto está escrito en un solo sitio del programa',
  Array.isArray(pegatina.lema) && pegatina.lema[0] === 'Aviso e información sobre la puerta',
  (pegatina.lema || []).join(' · '));

/* ================================================================
   7. Que la pegatina quepa en el rollo
   --------------------------------------------------------------
   David, el 10-11-2026: «hay que recortar un poco la pegatina de
   alto. El teléfono de abajo sale la mitad en otra pegatina».
   Y tenía razón: al añadir el texto del QR el día antes, el
   contenido pasó a medir 102,5 mm en un rollo de 100. El pie se
   partía en dos etiquetas.

   Esto no se puede comprobar leyendo el HTML: hay que MEDIRLO. Se
   pinta la etiqueta en un marco aparte y se mide en milímetros.
   ================================================================ */
bloque('7. La pegatina cabe en el rollo');

const medida = await T(async () => {
  const g = window.__T;
  g.S.ajustes.telefono_avisos = '661 352 795';
  const abrir = window.open; let h = '';
  window.open = () => ({ document: { write: t => { h += t; }, close(){} } });
  g.etiquetaTermica(g.S.etiquetas[0].codigo);
  window.open = abrir;
  /* En un marco aparte, para que los estilos de la etiqueta (html, body, @page)
     no se mezclen con los de la aplicación. */
  const marco = document.createElement('iframe');
  marco.style.cssText = 'position:fixed;left:-9999px;width:400px;height:900px;border:0';
  marco.srcdoc = h.replace(/<div class="barra">[\s\S]*?<\/div>\s*(?=<div class="eti">)/, '')
                  .replace('body{padding-top:52px}', 'body{padding-top:0}');
  document.body.appendChild(marco);
  await new Promise(r => { marco.onload = r; setTimeout(r, 1500); });
  const d = marco.contentDocument;
  const mm = px => +(px / (96 / 25.4)).toFixed(2);
  const eti = d.querySelector('.eti');
  const cs = d.defaultView.getComputedStyle(eti);
  const piezas = {};
  for (const sel of ['.cab', '.lema', '.qr', '.cod', '.pie'])
    piezas[sel] = mm((d.querySelector(sel) || {}).offsetHeight || 0);
  const r = {
    piezas,
    contenido: +(Object.values(piezas).reduce((a, b) => a + b, 0) +
      mm(parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom))).toFixed(2),
    caja: mm(eti.clientHeight),
    desborda: eti.scrollHeight > eti.clientHeight + 2,
    recorta: cs.overflow === 'hidden',
    qr: piezas['.qr'],
  };
  marco.remove();
  return r;
});
/* 97 mm es el alto útil de una DK-11202: el rollo mide 100 y la impresora no
   llega a los bordes. Si se apura a 100, lo de abajo salta a la siguiente. */
paso('el contenido cabe en el alto útil del rollo',
  medida.contenido <= 97, medida.contenido + ' mm de 97');
paso('y sobra margen, no va justo',
  medida.contenido <= 94, 'sobran ' + (97 - medida.contenido).toFixed(1) + ' mm');
paso('la caja no se declara al borde del rollo',
  medida.caja <= 97.5, medida.caja + ' mm');
paso('nada se sale de la caja',
  medida.desborda === false);
paso('y si algún día alguien alarga un texto, se recorta en vez de empujar',
  medida.recorta === true);
paso('el QR sigue siendo grande de verdad',
  medida.qr >= 36, medida.qr + ' mm');
paso('y el pie con el teléfono entra entero',
  medida.piezas['.pie'] > 10, medida.piezas['.pie'] + ' mm');

/* ================================================================
   8. El QR, que es lo único que no puede faltar
   --------------------------------------------------------------
   David, el 10-11-2026: «en la etiqueta que me mandas no aparece el
   QR». Era una muestra sacada del banco, donde el generador es un
   sustituto que dibuja un cuadrado blanco a propósito. Pero al
   mirarlo salió algo de verdad: si el generador no cargaba, la
   etiqueta se imprimía IGUAL, con un párrafo donde iba el QR. Esa
   pegatina se pega en una puerta y nadie lo nota hasta que un
   cliente la escanea.
   ================================================================ */
bloque('8. Sin QR no se imprime');

const conQR = await T(() => {
  const g = window.__T;
  const abrir = window.open; let h = '';
  window.open = () => ({ document: { write: t => { h += t; }, close(){} } });
  g.etiquetaTermica(g.S.etiquetas[0].codigo);
  window.open = abrir;
  const pu = g.S.puertas.find(p => p.codigo) || {};
  return {
    pideElQR: /<svg/.test(h),
    alTamano: /style="width:40mm;height:40mm"/.test(h),
    conLaDireccion: h.indexOf('arizapa.es/#') > 0 || /qr/i.test(h),
    noDiceQueFalla: !/No se pudo cargar el generador/.test(h),
  };
});
paso('la etiqueta lleva su QR', conQR.pideElQR === true);
paso('y se le pide al tamaño nuevo, 40 mm', conQR.alTamano === true);
paso('sin el aviso de que el generador ha fallado', conQR.noDiceQueFalla === true);

const sinQR = await T(() => {
  const g = window.__T;
  /* Se quita el generador, que es lo que pasa sin internet la primera vez */
  const guardado = window.qrcode;
  delete window.qrcode;
  let abrio = false, hojaAbrio = false;
  const abrir = window.open;
  window.open = () => { abrio = true; return { document:{ write(){}, close(){} } }; };
  g.etiquetaTermica(g.S.etiquetas[0].codigo);
  window.open = () => { hojaAbrio = true; return { document:{ write(){}, close(){} } }; };
  g.hojaImprimible();
  window.open = abrir;
  window.qrcode = guardado;
  const aviso = (document.querySelector('.toast, #toast') || {}).textContent || '';
  return { abrio, hojaAbrio, aviso };
});
paso('SIN GENERADOR, LA ETIQUETA NO SE IMPRIME', sinQR.abrio === false);
paso('y la plancha de la imprenta tampoco', sinQR.hojaAbrio === false);
paso('se avisa de por qué y de qué hacer',
  /generador de códigos QR/.test(sinQR.aviso) && /internet/.test(sinQR.aviso),
  sinQR.aviso.slice(0, 60));

/* ================================================================
   Final
   ================================================================ */
console.log('\n'+ok+' bien, '+mal+' mal.');
if (errores.length) console.log('Errores de JavaScript:\n'+errores.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || errores.length ? 1 : 0);
