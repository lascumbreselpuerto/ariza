/* ================================================================
   fotos-elementos.mjs — La foto de cada elemento, el nº de serie
                         en la ficha, y Componentes en solo lectura
                                                     25-11-2026

   DE DÓNDE SALE

   David, los dos puntos que quedaban de su mensaje del 25-11-2026:

   «En la ficha de dicha puerta aparece componentes y valoro no
   necesario, a no ser que esté la puerta creada la documentación
   completa. Lo que sí es necesario cuando damos de alta la puerta
   (en bloque) es fotos de todo lo seleccionado y anotado.»

   «Los componentes se deben de solicitar con datos como marca,
   referencia etc en el momento de crear la documentación. Que no es
   lo mismo que la ficha de la puerta.»

   Y dos decisiones que tomó al plantearle las consecuencias:

     · el nº de serie del motor y del cuadro SE QUEDAN en la ficha,
       porque es el dato que hace falta para pedir un repuesto y una
       puerta sin documentar se quedaba sin sitio donde guardarlo;
     · las fotos de los elementos SE RECLAMAN pero NO frenan el
       cierre de la visita.

   QUÉ SE VIGILA AQUÍ, Y POR QUÉ CADA COSA

   1. Que el nº de serie se escriba en la ficha y acabe en el MISMO
      componente de siempre, no en un sitio nuevo. Dos sitios para
      el mismo dato son dos verdades distintas en seis meses.

   2. Que vaciar el campo en la ficha NO borre un número de serie
      que ya estuviera puesto. Lo que no se escribe, no se toca.

   3. Que el panel de componentes NO salga en una puerta sin
      expediente, y que lo que diga en su lugar mande a documentar.

   4. Que con expediente salga de SOLO LECTURA: sin botón de alta y
      sin «añadir los que faltan», que es lo que reclamaba
      diecisiete componentes de una puerta que nadie iba a
      documentar.

   5. Que el botón de corregir sea solo de oficina y administrador,
      y que el manejador lo compruebe también: un botón que no se
      dibuja no es una puerta cerrada.

   6. Que cada elemento marcado lleve su cámara al lado, y que la
      foto elegida antes de guardar una puerta nueva se quede
      esperando en vez de perderse.

   7. Y que el reclamo de las fotos NO frene: el punto va sin
      «basico», y cuando todavía no se ha mirado qué fotos hay dice
      que no se ha mirado, en vez de decir que faltan todas. No es
      lo mismo «no hay fotos» que «no lo he comprobado».

   Uso:  ./preparar.sh  y luego  node fotos-elementos.mjs
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
   1. El número de serie, en la ficha
   ================================================================ */
bloque('1. El nº de serie del motor se escribe en la ficha');

const serie = await T(async () => {
  const g = window.__T, S = g.S;
  const p = (S.puertas || [])[0];
  if (!p) return { sinDatos: true };
  g.cerrarDlg();
  g.dlgPuerta(p.id);
  await new Promise(r => setTimeout(r, 600));
  const out = {
    sinDatos: false,
    hayMotor: !!document.getElementById('f-motor-serie'),
    /* Y que esté DENTRO del bloque del cuadro y el motor, no en un panel suelto */
    enSuBloque: !!(document.getElementById('f-motor-serie') &&
      document.getElementById('f-motor-serie').closest('.grupo') &&
      /Cuadro y motor/.test(document.getElementById('f-motor-serie')
        .closest('.grupo').querySelector('h3').textContent)),
    /* Y que esté en la lista del borrador: si no, el técnico que sale a crear un
       cliente a mitad del alta vuelve y se lo encuentra en blanco */
    enBorrador: (g.CAMPOS_PUERTA || []).indexOf('f-motor-serie') >= 0 &&
                (g.CAMPOS_PUERTA || []).indexOf('f-cuadro-serie') >= 0,
  };
  g.cerrarDlg();
  return out;
});
paso('el campo está en la ficha', serie.sinDatos || serie.hayMotor === true);
paso('y dentro del bloque «Cuadro y motor», no en un panel aparte',
     serie.sinDatos || serie.enSuBloque === true);
paso('y se recupera si el técnico sale a crear un cliente a mitad del alta',
     serie.sinDatos || serie.enBorrador === true);

bloque('2. Va al mismo componente de siempre, y no se borra solo');
const alComponente = await T(() => {
  const g = window.__T;
  /* marcaModeloFicha es la que lee el componente para pintar la ficha. Si no
     devuelve el nº de serie, el campo saldría siempre vacío aunque esté
     guardado, y el técnico lo volvería a teclear en cada visita. */
  const p = { id:'pu-x', tipo:'Seccional' };
  const antes = g.S.componentes;
  g.S.componentes = [{ id:'c-1', puerta_id:'pu-x', clave:'motor', activo:true,
                       marca:'Hörmann', modelo:'SupraMatic', num_serie:'4471-2019' }];
  const m = g.marcaModeloFicha(p, 'motor');
  /* Y si la marca viene del texto viejo de la ficha, el nº de serie sale igual
     del componente: son dos datos y cada uno está donde está. */
  g.S.componentes = [{ id:'c-2', puerta_id:'pu-y', clave:'motor', activo:true,
                       num_serie:'99-A' }];
  const m2 = g.marcaModeloFicha({ id:'pu-y', tipo:'Seccional', motor:'Came escrito a mano' }, 'motor');
  g.S.componentes = antes;
  return { serie: m.serie, de: m.de, serie2: m2.serie, de2: m2.de };
});
paso('la ficha lee el nº de serie del componente', alComponente.serie === '4471-2019',
     alComponente.serie);
paso('y lo lee también cuando la marca viene del texto viejo de la ficha',
     alComponente.serie2 === '99-A' && alComponente.de2 === 'ficha',
     alComponente.serie2+' / '+alComponente.de2);

/* ================================================================
   3. El panel de componentes
   ================================================================ */
bloque('3. Componentes: sin expediente no sale');

const panel = await T(async () => {
  const g = window.__T, S = g.S;
  const p = (S.puertas || [])[0];
  if (!p) return { sinDatos: true };
  const expAntes = S.expedientes, compAntes = S.componentes;
  const ver = async () => {
    S.ficha = p.id; S.tab = 'puertas'; S.tabElegida = true;
    g.pintar();
    await new Promise(r => setTimeout(r, 400));
    const v = document.getElementById('vista');
    const t = v ? v.textContent : '';
    return {
      texto: t,
      noEstaDocumentada: /Esta puerta no está documentada/.test(t),
      mandaADocumentar: /al crear la documentación/.test(t),
      diceDondeEstaLaSerie: /Cuadro y motor/.test(t),
      hayAlta: !!v && !!v.querySelector('[data-act="comp-nuevo"]'),
      hayMinimos: !!v && !!v.querySelector('[data-act="comp-minimos"]'),
      hayCorregir: !!v && !!v.querySelector('[data-act="comp-editar"]'),
      diceSoloLectura: /Se rellena en el expediente, no aquí/.test(t),
    };
  };
  /* Sin expediente y sin componentes */
  S.expedientes = []; S.componentes = [];
  const sinNada = await ver();
  /* Con expediente y con un componente registrado */
  S.expedientes = [{ id:'e-1', puerta_id:p.id, familia:'industrial', catalogo:'familia47' }];
  S.componentes = [{ id:'c-9', puerta_id:p.id, clave:'fotocelulas', activo:true,
                     nombre:'Fotocélulas', marca:'Came', num_serie:'A-1',
                     actualizado_por:'Oficina', actualizado:new Date().toISOString() }];
  const conExp = await ver();
  S.expedientes = expAntes; S.componentes = compAntes;
  S.ficha = null; g.pintar();
  return { sinDatos:false, sinNada, conExp };
});
paso('sin expediente, el panel no enseña componentes y lo dice',
     panel.sinDatos || panel.sinNada.noEstaDocumentada === true);
paso('y manda a crear la documentación, que es donde se piden',
     panel.sinDatos || panel.sinNada.mandaADocumentar === true);
paso('y recuerda que el nº de serie está en «Cuadro y motor»',
     panel.sinDatos || panel.sinNada.diceDondeEstaLaSerie === true);
paso('sin expediente NO hay botón de añadir componente',
     panel.sinDatos || panel.sinNada.hayAlta === false);

bloque('4. Con expediente: espejo de solo lectura');
paso('ya no hay botón de añadir componente',
     panel.sinDatos || panel.conExp.hayAlta === false);
paso('ni el de «añadir los que faltan», que reclamaba diecisiete',
     panel.sinDatos || panel.conExp.hayMinimos === false);
paso('dice que se rellena en el expediente, no ahí',
     panel.sinDatos || panel.conExp.diceSoloLectura === true);
paso('y queda escrito quién corrigió el componente',
     panel.sinDatos || /Corregido por/.test(panel.conExp.texto));

bloque('5. Corregir es de oficina, y se comprueba también al pulsar');
const permiso = await T(async () => {
  const g = window.__T, S = g.S;
  const antes = S.perfil;
  /* Como técnico: el botón no se dibuja */
  S.perfil = { id:'u-t', nombre:'Técnico', rol:'tecnico' };
  const comoTecnico = g.esGestion();
  S.perfil = { id:'u-o', nombre:'Oficina', rol:'oficina' };
  const comoOficina = g.esGestion();
  S.perfil = antes;
  return { comoTecnico, comoOficina };
});
paso('un técnico no es gestión, así que no le sale el botón', permiso.comoTecnico === false);
paso('la oficina sí', permiso.comoOficina === true);

/* ================================================================
   6. La cámara de cada elemento
   ================================================================ */
bloque('6. Cada elemento con su cámara al lado');

const camaras = await T(async () => {
  const g = window.__T, S = g.S;
  g.cerrarDlg();
  g.dlgPuerta(null);
  await new Promise(r => setTimeout(r, 600));
  const sel = document.getElementById('f-tipo');
  if (!Array.from(sel.options).some(o => o.value === 'Seccional')){
    const o = document.createElement('option'); o.value = 'Seccional'; o.textContent = o.value;
    sel.appendChild(o);
  }
  sel.value = 'Seccional'; sel.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 150));
  const pastillas = Array.from(document.querySelectorAll('#dlg-form .checks .ele'))
    .filter(x => !x.hidden);
  const conCam = pastillas.filter(x => x.querySelector('.cam')).length;
  /* La casilla sigue siendo una casilla: lo que lee el guardado no ha cambiado */
  const segs = document.querySelectorAll('#f-segs .f-seg').length;
  const eles = document.querySelectorAll('#dlg-form .f-ele').length;
  /* Y los números (nº de motores, nº de mandos) NO llevan cámara: no son cosas
     que se fotografíen */
  const numCam = !!(document.getElementById('f-caja-motores') &&
                    document.getElementById('f-caja-motores').querySelector('.cam'));
  /* La foto elegida sin haber guardado la puerta se queda esperando */
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([1,2,3])], 'fotocelulas.jpg', { type:'image/jpeg' }));
  const ent = document.querySelector('#f-caja-fotocelulas input[data-act="ele-foto"]');
  let espera = null, etiqueta = '';
  if (ent){
    ent.files = dt.files;
    ent.dispatchEvent(new Event('change', { bubbles:true }));
    await new Promise(r => setTimeout(r, 120));
    espera = S.fotosEspera && S.fotosEspera.fotocelulas
      ? S.fotosEspera.fotocelulas.name : null;
    const cam = document.querySelector('#f-caja-fotocelulas .cam');
    etiqueta = cam ? cam.textContent.trim() : '';
  }
  /* Y la cámara de un alta NO lleva puerta: es justo el motivo de que espere */
  const sinPuerta = ent ? !ent.dataset.puerta : null;
  g.cerrarDlg(); S.fotosEspera = null;
  return { pastillas: pastillas.length, conCam, segs, eles, numCam,
           espera, etiqueta, sinPuerta, hayEntrada: !!ent };
});
paso('hay pastillas de elemento a la vista', camaras.pastillas > 0, camaras.pastillas);
paso('todas llevan su cámara', camaras.conCam === camaras.pastillas,
     camaras.conCam+' de '+camaras.pastillas);
paso('las casillas de seguridad siguen dentro de «f-segs»', camaras.segs > 0, camaras.segs);
paso('y las de los demás elementos siguen con su clase', camaras.eles > 0, camaras.eles);
paso('un número como «nº de motores» NO lleva cámara', camaras.numCam === false);
paso('en un alta la cámara no lleva puerta todavía',
     !camaras.hayEntrada || camaras.sinPuerta === true);
paso('y la foto elegida se queda esperando, no se tira',
     !camaras.hayEntrada || camaras.espera === 'fotocelulas.jpg', camaras.espera);
paso('y la pastilla lo dice', !camaras.hayEntrada || /Foto lista/.test(camaras.etiqueta),
     camaras.etiqueta);

bloque('7. Abrir otra puerta no arrastra la foto de la anterior');
const limpio = await T(async () => {
  const g = window.__T, S = g.S;
  S.fotosEspera = { fotocelulas: { name:'de-otra-puerta.jpg' } };
  g.cerrarDlg();
  g.dlgPuerta(null);
  await new Promise(r => setTimeout(r, 400));
  const out = { espera: S.fotosEspera, fichas: (S.fotosFicha || []).length };
  g.cerrarDlg();
  return out;
});
paso('al abrir la ficha, lo que esperaba de otra puerta se tira',
     limpio.espera === null, String(limpio.espera));
paso('y la lista de fotos por elemento arranca vacía', limpio.fichas === 0);

/* ================================================================
   8. Se reclama, pero no frena
   ================================================================ */
bloque('8. Las fotos se reclaman y NO frenan el cierre');

const reclamo = await T(() => {
  const g = window.__T;
  const p = { id:'pu-r', codigo:'AR-1', tipo:'Seccional', uso:'industrial',
              cliente_id:'c-1', ancho_mm:3000, alto_mm:3000, matricula:'X',
              elementos:['Fotocélulas','Banda de seguridad'], seguridad:['Fotocélulas'] };
  /* Sin decir qué fotos hay: el punto NO puede dar por buenas ni por malas */
  const sinSaber = g.minimoObra(p, 99, null);
  /* Con las dos hechas */
  const todas = g.minimoObra(p, 99, ['fotocelulas','banda']);
  /* Con una sola */
  const aMedias = g.minimoObra(p, 99, ['fotocelulas']);
  const busca = m => (m.puntos || []).find(x => x.clave === 'fotos-elementos') || null;
  const enFaltan = m => (m.faltan || []).some(x => x.clave === 'fotos-elementos');
  const enBasico = m => (m.basico || m.bloquean || []).some
    ? (m.basico || m.bloquean || []).some(x => x.clave === 'fotos-elementos')
    : false;
  return {
    hayPunto: !!busca(sinSaber),
    sinSaberEnFaltan: enFaltan(sinSaber),
    /* Y con nada marcado tampoco se pone: no se reclama la foto de lo que la
       puerta no lleva. */
    sinMarcarHayPunto: !!busca(g.minimoObra(
      Object.assign({}, p, { elementos: [], seguridad: [] }), 99, ['fotocelulas'])),
    todasOk: busca(todas) ? busca(todas).ok : null,
    aMediasOk: busca(aMedias) ? busca(aMedias).ok : null,
    aMediasDice: busca(aMedias) ? busca(aMedias).que : '',
    reclamadoAMedias: enFaltan(aMedias),
    frena: enBasico(aMedias),
    /* Y lo que de verdad decide si se puede cerrar: que NO esté entre los
       puntos marcados como básicos */
    esBasico: busca(aMedias) ? !!busca(aMedias).basico : null,
  };
});
/* ---- Por qué el punto NO se pone cuando no se sabe (25-11-2026) ----
   La primera versión lo dejaba «en duda», y la suite de obra lo cazó: un punto
   en duda cuenta como pendiente, así que TODA puerta salía con la ficha
   incompleta por unas fotos que nadie había mirado. Quince pruebas de obra en
   rojo, y con razón. Decir «no lo sé» está bien; apuntarlo como falta, no. */
paso('si todavía no se sabe qué fotos hay, el punto NO se pone',
     reclamo.hayPunto === false);
paso('y la ficha no se queda incompleta por algo que nadie ha mirado',
     reclamo.sinSaberEnFaltan === false);
paso('con las dos fotos hechas, el punto está', reclamo.todasOk === true);
paso('con una sola, no', reclamo.aMediasOk === false);
paso('y nombra la que falta', /Banda de seguridad/.test(reclamo.aMediasDice),
     reclamo.aMediasDice.slice(-80));
paso('se reclama: sale en lo que le falta a la ficha', reclamo.reclamadoAMedias === true);
paso('pero NO frena el cierre: no es un punto básico', reclamo.esBasico === false);
paso('y lo dice en su propio texto', /no impide cerrar/i.test(reclamo.aMediasDice));
paso('y si la puerta no lleva nada marcado, tampoco se reclama ninguna foto',
     reclamo.sinMarcarHayPunto === false);

bloque('9. Donde sí se reclama: al contar las fotos de la puerta');
/* Dónde sale el reclamo: en el parte, en la tarjeta de una obra, al escanear el
   QR y en la lista de fichas incompletas de Gestión. En el panel de la ficha NO,
   y nunca ha salido: ahí no se pintan los pendientes.

   Todos esos sitios cuentan antes las fotos de la puerta, así que es contarFotos
   quien aprende de qué elementos hay foto, con el mismo viaje. Esto comprueba
   justamente eso: que después de contar, el reclamo ya sabe lo que tiene que
   saber. Antes de este arreglo contarFotos pedía solo el número (head:true) y el
   punto no se ponía nunca fuera de la ficha. */
const primera = await T(async () => {
  const g = window.__T, S = g.S;
  const p = (S.puertas || [])[0];
  if (!p) return { sinDatos: true };
  const antes = JSON.stringify({ e:p.elementos, s:p.seguridad });
  p.elementos = ['Fotocélulas','Banda de seguridad'];
  p.seguridad = ['Fotocélulas'];
  /* Se sube una foto de un elemento y se entra en la ficha por primera vez */
  await g.sb.from('fotos').insert({ puerta_id:p.id, ruta:'prueba/elem.jpg',
    autor:'Prueba', elemento:'fotocelulas' });
  await g.cargar();
  /* Antes de contar, no se sabe nada y el punto no se pone */
  const n = await g.contarFotos(p.id);
  const m = g.minimoObra(p, n);
  const punto = (m.puntos || []).find(x => x.clave === 'fotos-elementos') || null;
  const d = JSON.parse(antes);
  p.elementos = d.e; p.seguridad = d.s;
  return { sinDatos:false, cuenta:n, hayPunto: !!punto,
           ok: punto ? punto.ok : null, que: punto ? punto.que : '' };
});
paso('contar las fotos de la puerta enseña de qué elementos hay',
     primera.sinDatos || primera.hayPunto === true, 'fotos contadas: '+primera.cuenta);
paso('y el reclamo nombra el elemento que se ha quedado sin foto',
     primera.sinDatos || /Banda de seguridad/.test(primera.que),
     (primera.que || '').slice(-70));
paso('con la de las fotocélulas hecha, esa no se reclama',
     primera.sinDatos || !/Faltan:.*Fotocélulas/.test(primera.que));

bloque('10. El aviso de que falta el SQL');
const marca = await T(() => {
  const g = window.__T;
  const c = (g.QUE_HACE_FALTA || []).find(x => x.marca === 'sinFotoElemento');
  return c ? { fichero: c.fichero, dice: !!c.pierdes } : null;
});
paso('dice qué fichero es y qué se pierde sin él',
     !!marca && marca.fichero === 'fotos-elemento.sql' && marca.dice,
     marca && marca.fichero);

console.log('\n── '+ok+' bien, '+mal+' mal ──────────────────────');
await nav.close();
process.exit(mal ? 1 : 0);
