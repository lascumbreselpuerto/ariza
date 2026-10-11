// ================================================================
// Generador de muestras en PDF de TODOS los documentos de ARIZA SAT.
//
// Para qué: para poder revisarlos con calma, enseñárselos a un
// técnico de confianza, a una asociación del sector o a la
// Administración, sin tener que ir sacando documentos a mano desde
// la aplicación.
//
// Los datos son inventados. Cada documento lleva un aviso en la
// portada diciéndolo, para que nadie los confunda con la
// documentación real de una puerta.
//
//   Uso:  ./preparar.sh && node muestras.mjs [carpeta-de-salida]
// ================================================================
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SALIDA = process.argv[2] || join(AQUI, 'muestras');
const URL_APP = process.env.ARIZA_URL || 'http://127.0.0.1:8899/index.html';
const ajustes = JSON.parse(readFileSync(join(AQUI, 'ajustes.json'), 'utf8'));
const ENV = { ...process.env, LANG:'es_ES.UTF-8', LANGUAGE:'es_ES:es', LC_ALL:'es_ES.UTF-8' };
mkdirSync(SALIDA, { recursive: true });

const EMPRESA = {
  razon_social:'Ariza Puertas y Automatismos S.L.U.', nif:'B72004849',
  domicilio:'Calle Orilla 19', cp:'11500', poblacion:'El Puerto de Santa María',
  provincia:'Cádiz', telefono:'661 352 795',
  email:'arizapuertasautomaticas@gmail.com', web:'arizapa.es',
  representante:'David Ariza Arana', cargo_firmante:'Administrador único',
  responsable_tecnico:'David Ariza Arana',
};
const AVISO = 'MUESTRA · Documento generado con datos de ejemplo para revisión. '+
  'No corresponde a ninguna puerta real ni acredita nada sobre instalación alguna.';

const nav = await chromium.launch({ env: ENV, args:['--lang=es-ES'] });
const ctx = await nav.newContext({ viewport:{width:1320,height:1600},
  locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
await ctx.addInitScript(e => {
  window.__PARCHE = db => { db.ajustes.push({ clave:'empresa', valor:e }); };
}, EMPRESA);
const pag = await ctx.newPage();
const fallos = [];
pag.on('pageerror', x => fallos.push('JS: '+x.message));
await pag.goto(URL_APP);
await pag.waitForTimeout(1500);

/* Abre un documento llamando a su función, le mete el aviso de muestra en la
   portada y lo guarda en PDF. El botón se inyecta para que la ventana la abra
   un clic de verdad y el navegador no la bloquee. */
let n = 0;
async function pdf(nombre, fn, ...args){
  n++;
  const fichero = String(n).padStart(2,'0')+'-'+nombre+'.pdf';
  try {
    const [doc] = await Promise.all([
      pag.waitForEvent('popup', { timeout: 60000 }),
      pag.evaluate(({ fn, args }) => {
        try { return window.__T[fn].apply(null, args); }
        catch(e){ window.__MUESTRA_ERR = fn+': '+e.message; }
      }, { fn, args }),
    ]);
    await doc.waitForTimeout(2200);
    const err = await pag.evaluate(() => { const e = window.__MUESTRA_ERR;
      window.__MUESTRA_ERR = null; return e; });
    if (err) throw new Error(err);
    /* El aviso, arriba del todo del documento */
    await doc.evaluate(t => {
      const p = document.createElement('p');
      p.textContent = t;
      p.style.cssText = 'border:2px solid #B3271E;color:#B3271E;background:#F8E1DF;'+
        'padding:6px 10px;margin:0 0 8mm;font-weight:700;font-size:11px;'+
        'text-align:center;border-radius:4px';
      const primera = document.querySelector('section');
      if (primera) primera.insertBefore(p, primera.firstChild);
      else document.body.insertBefore(p, document.body.firstChild);
    }, AVISO);
    await doc.waitForTimeout(400);
    await doc.pdf({ path: join(SALIDA, fichero), format:'A4', printBackground:true,
                    margin:{ top:'12mm', bottom:'12mm', left:'10mm', right:'10mm' } });
    const t = await doc.textContent('body');
    await doc.close();
    console.log('  OK  '+fichero+'  ('+Math.round(t.length/100)/10+' k caracteres)');
    return true;
  } catch(err){
    console.log(' FALLA '+fichero+' → '+err.message);
    fallos.push(fichero+': '+err.message);
    return false;
  }
}


/* Fotos de muestra. Son imágenes dibujadas al vuelo con el nombre de lo que
   representarían: sirven para que el documento enseñe cómo quedan la portada,
   las referencias F-01, F-02 y los pies de foto, sin usar fotos reales de
   ninguna instalación. */
async function ponerFotos(pag, expId, lista){
  return await pag.evaluate(async ({ expId, lista }) => {
    const T = window.__T;
    let n = 0;
    for (const [apartado, titulo, pie] of lista){
      const c = document.createElement('canvas');
      c.width = 1200; c.height = 900;
      const x = c.getContext('2d');
      x.fillStyle = '#E8E4DF'; x.fillRect(0,0,1200,900);
      x.fillStyle = '#C9C2BA';
      for (let i = 0; i < 1200; i += 60) x.fillRect(i, 0, 2, 900);
      for (let j = 0; j < 900; j += 60) x.fillRect(0, j, 1200, 2);
      x.fillStyle = '#1C1817';
      x.font = 'bold 44px -apple-system, Segoe UI, Roboto, sans-serif';
      x.textAlign = 'center';
      x.fillText('IMAGEN DE MUESTRA', 600, 390);
      x.font = '34px -apple-system, Segoe UI, Roboto, sans-serif';
      x.fillStyle = '#6B6560';
      const palabras = titulo.split(' ');
      let linea = '', y = 470;
      palabras.forEach(w => {
        if ((linea + ' ' + w).length > 34){ x.fillText(linea, 600, y); y += 44; linea = w; }
        else linea = linea ? linea + ' ' + w : w;
      });
      if (linea) x.fillText(linea, 600, y);
      x.fillStyle = '#FCBA1D'; x.fillRect(0, 860, 1200, 40);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
      const ruta = expId + '/' + apartado.replace(/[^a-z0-9]/gi,'_') + '-' + (++n) + '.jpg';
      await T.sb.storage.from('expedientes')
        .upload(ruta, blob, { contentType:'image/jpeg', upsert:true });
      await T.sb.from('expediente_fotos').insert({
        expediente_id: expId, apartado, ruta, pie, orden: n, autor:'David Ariza Arana' });
    }
    await T.cargar(); T.pintar();
    return n;
  }, { expId, lista });
}

/* Emite el expediente, para que el documento no salga en borrador: así se ve
   cómo queda una declaración firmada y no una copia de trabajo. */
async function emitir(pag, expId, motivo){
  return await pag.evaluate(async ({ expId, motivo }) => {
    const T = window.__T;
    const e = T.expDe(expId);
    const sd = T.salidaDocumental(e);
    e.datos = e.datos || {};
    e.datos.versiones = [{ n:1, fecha:new Date().toISOString(), motivo:motivo||'Primera emisión',
      tecnico:'David Ariza Arana', estado_anterior:'borrador',
      estado_nuevo: sd.salida.estado, salida: sd.salida.nombre }];
    e.datos.estado_doc = sd.salida.estado;
    e.datos.salida_doc = sd.clave;
    await T.sb.from('expedientes').update({ datos:e.datos, estado:'emitido',
      emitido_el:new Date().toISOString(), firmante:'David Ariza Arana',
      firmante_cargo:'Administrador único' }).eq('id', expId);
    await T.cargar(); T.pintar();
    return { clave: sd.clave, acredita: sd.acredita, nombre: sd.salida.nombre,
             criticos: sd.criticos.map(x => x.area+': '+x.texto) };
  }, { expId, motivo });
}

/* ---- Datos de ejemplo de cada expediente ---- */
const DATOS = {
  async industrial(pag, id){
    return await pag.evaluate(async ({ id }) => {
      const T = window.__T;
      const e = T.expDe(id);
      const d = e.datos = e.datos || {};
      d.obra = { emplazamiento:'Avenida de la Bajamar 14, 11500 El Puerto de Santa María',
        ubicacion:'Rampa de acceso al garaje comunitario', uso_edificio:'Comunidad de propietarios',
        centro_trabajo:'no', titular:'Comunidad de Propietarios Las Flores',
        nif_titular:'H11223344', contacto:'Manuel Pérez Ruiz, presidente',
        referencia_obra:'PR-2026-184' };
      d.puerta = { tipo:'Seccional', denominacion:'Puerta seccional de garaje',
        marca:'Ariza', modelo:'AR-SEC 3500', serie:'AR-2026-0184',
        ancho:3500, alto:2400, peso:185, hojas:1, motorizada:'si',
        modo:'automatico', usuarios:'informados', fecha_fabricacion:'2026-09-02' };
      /* Elementos de la instalación */
      d.comp = {};
      (T.EXP_COMPONENTES.industrial||[]).forEach(([k]) => {
        d.comp[k] = { estado:'si', marca:'', modelo:'', nota:'' };
      });
      Object.assign(d.comp.motor || {}, { marca:'Erreka', modelo:'Rino 4', serie:'RN-884512' });
      if (d.comp.cuadro) Object.assign(d.comp.cuadro, { marca:'Erreka', modelo:'Vivo-C' });
      if (d.comp.fotocelulas) Object.assign(d.comp.fotocelulas, { marca:'Erreka', modelo:'FT-20' });
      if (d.comp.banda) Object.assign(d.comp.banda, { marca:'ASO', modelo:'Sentir 45.25' });
      /* Comprobaciones: todas conformes */
      d.cumple = {};
      (T.EXP_COMPROBACIONES.industrial||[]).forEach(([k]) => { d.cumple[k] = { v:'si' }; });
      /* Peligros propios del tipo */
      const pel = T.peligrosDe(e);
      d.peligro = {};
      if (pel) pel.lista.forEach(([pk]) => {
        d.peligro[pk] = { v:'si', zona:'Canto de cierre, todo el ancho del hueco',
          medida:'Banda de seguridad con autocontrol en el canto inferior',
          componente:'Banda resistiva 8K2', marca:'ASO', modelo:'Sentir 45.25',
          ident:'Lote 2026-0418', comprobacion:'Obstáculo rígido de 50 mm en tres puntos del recorrido',
          resultado:'si', obs:'Invierte la marcha en menos de medio segundo' };
      });
      /* Ensayo de fuerzas */
      d.fuerzas = { incluir:'si', fecha:'2026-09-15', hueco:'aplastamiento',
        instrumento:'Dinamómetro de ensayo Sensor FM-200', calibracion:'CAL-2026-0345, 12-03-2026',
        m0:{ fd:320, fs:110, fe:18, td:0.55 }, m1:{ fd:280, fs:95, fe:15, td:0.48 },
        m2:{ fd:245, fs:88, fe:14, td:0.44 },
        observaciones:'Medición con la puerta a temperatura ambiente y sin viento.' };
      /* Intervención: puerta nueva, no procede el cuestionario */
      d.interv = { tipo:'nueva_propia' };
      /* Prestaciones declaradas */
      d.prest = { via:'micro', dte_codigo:'EXP-2026-0001-DTE', dte_ok:'si',
        dte_responsable:'David Ariza Arana', dte_fecha:'2026-09-10',
        dte_ubicacion:'Archivo técnico de la empresa, carpeta 2026', micro_comprobada:'si',
        v:{} };
      (T.EXP_PRESTACIONES.industrial||[]).forEach(([k]) => { d.prest.v[k] = 'NPD'; });
      if (d.prest.v.resist_mec !== undefined) d.prest.v.resist_mec = 'Cumple';
      if (d.prest.v.fuerzas !== undefined) d.prest.v.fuerzas = 'Cumple';
      if (d.prest.v.agua !== undefined) d.prest.v.agua = 'Clase 2';
      /* Mantenimiento */
      d.mant = { fab_consta:'si', fab_meses:'6', fab_donde:'Manual del operador, apartado 7, página 18',
        acordada_meses:'6', contrato:'si',
        observaciones:'Se entrega libro de mantenimiento con la puerta.' };
      /* Entrega y firma */
      d.entrega = { tecnico:'David Ariza Arana', firmante:'David Ariza Arana',
        cargo:'Administrador único', firmante_ok:'si',
        docs:{ ddp:'si', dc:'si', marcado:'si', manual:'si', libro:'si', expediente:'si' },
        observaciones:'Se explica al presidente el funcionamiento del desbloqueo manual.' };
      d.entregas = [{ n:1, fecha:'2026-09-16', docs:['ddp','dc','manual','libro'],
        receptor:'Manuel Pérez Ruiz', dni:'31234567L', relacion:'presidente', medio:'mano',
        entregado_por:'David Ariza Arana', firmado:'si', pendientes:[],
        observaciones:'Se entrega en mano en la propia instalación.',
        registrado:new Date().toISOString() }];
      d.riesgos = { limitaciones:'' };
      e.fecha_puesta_servicio = '2026-09-16';
      await T.sb.from('expedientes').update({ datos:d,
        fecha_puesta_servicio:'2026-09-16' }).eq('id', id);
      await T.cargar(); T.pintar();
      return true;
    }, { id });
  },

  async adecuacion(pag, id){
    return await pag.evaluate(async ({ id }) => {
      const T = window.__T;
      const e = T.expDe(id);
      const d = e.datos = e.datos || {};
      d.obra = { emplazamiento:'Polígono El Palmar, nave 7, 11500 El Puerto de Santa María',
        ubicacion:'Muelle de carga número 2', uso_edificio:'Industria',
        centro_trabajo:'si', titular:'Talleres Guadalete S.L.', nif_titular:'B11556677',
        contacto:'Encargado de mantenimiento', referencia_obra:'ADE-2026-071' };
      d.puerta = { tipo:'Corredera', denominacion:'Puerta corredera industrial',
        marca:'Sin identificar', modelo:'Sin identificar', serie:'',
        ancho:4200, alto:3800, hojas:1, motorizada:'si',
        modo:'automatico', usuarios:'informados' };
      d.orig = { fabricante:'', modelo:'', serie:'', marcado:'ausente',
        ddp:'desconocido', declaracion:'desconocido' };
      d.comp = {};
      (T.EXP_COMPONENTES.industrial||[]).forEach(([k], i) => {
        d.comp[k] = { estado: i === 3 ? 'no' : 'si', marca:'', modelo:'' };
      });
      /* Comprobaciones: unas conformes, otras no, otras sin comprobar */
      d.cumple = {};
      (T.EXP_COMPROBACIONES.industrial||[]).forEach(([k, texto], i) => {
        if (i % 7 === 3) d.cumple[k] = { v:'deficiencia',
          def:'No cumple lo comprobado en la visita: '+texto.toLowerCase(),
          sol:'Sustituir el elemento y volver a comprobar', grav:'alta' };
        else if (i % 11 === 5) d.cumple[k] = { v:'nc',
          motivo:'No ha sido posible comprobarlo sin desmontar elementos de la instalación' };
        else d.cumple[k] = { v:'si' };
      });
      const pel = T.peligrosDe(e);
      d.peligro = {};
      if (pel) pel.lista.forEach(([pk, nombre], i) => {
        d.peligro[pk] = i === 0
          ? { v:'no', zona:'Canto de cierre, de 0 a 2,5 m de altura',
              motivo:'No hay banda de seguridad ni dispositivo equivalente', grav:'critica' }
          : { v:'si', zona:'Lateral de arrastre', medida:'Fotocélula de barrido a 300 mm',
              componente:'Fotocélula', marca:'Erreka', modelo:'FT-20',
              ident:'', comprobacion:'Corte del haz con pértiga en todo el recorrido',
              resultado:'si', obs:'' };
      });
      d.fuerzas = { incluir:'si', fecha:'2026-10-02', hueco:'aplastamiento',
        instrumento:'Dinamómetro de ensayo Sensor FM-200', calibracion:'CAL-2026-0345, 12-03-2026',
        m0:{ fd:640, fs:210, fe:42, td:1.4 }, m1:{ fd:580, fs:190, fe:38, td:1.2 },
        m2:{ fd:510, fs:170, fe:30, td:0.9 },
        observaciones:'Valores por encima de los de referencia en los tres puntos.' };
      d.interv = { tipo:'adecuacion' };
      for (let i = 1; i <= 12; i++) d.interv['q'+i] = { v:'no' };
      d.interv.q7 = { v:'no' };
      d.mant = { fab_consta:'no', ciclos_dia:45, ciclos_origen:'contador',
        contador:'184.320 maniobras el 02-10-2026', rapida:'no',
        ent:{ polvo:'si', trafico:'si' }, acordada_meses:'12', contrato:'ofrecido',
        observaciones:'El titular estudia el contrato de mantenimiento.' };
      d.entrega = { tecnico:'David Ariza Arana', firmante:'David Ariza Arana',
        cargo:'Administrador único',
        docs:{ informe:'si', propuesta:'si' },
        observaciones:'Se explican al encargado las deficiencias encontradas.' };
      d.riesgos = { limitaciones:'No se ha desmontado el tambor ni el eje de la puerta.' };
      e.fecha_puesta_servicio = '2016-05-20';
      await T.sb.from('expedientes').update({ datos:d,
        fecha_puesta_servicio:'2016-05-20' }).eq('id', id);
      await T.cargar(); T.pintar();
      return true;
    }, { id });
  },

  async peatonal(pag, id){
    return await pag.evaluate(async ({ id }) => {
      const T = window.__T;
      const e = T.expDe(id);
      const d = e.datos = e.datos || {};
      d.obra = { emplazamiento:'Calle Larga 32, 11500 El Puerto de Santa María',
        ubicacion:'Acceso principal desde la calle', uso_edificio:'Pública concurrencia',
        centro_trabajo:'si', titular:'Centro de Salud La Ribera', nif_titular:'Q1100123F',
        contacto:'Dirección del centro', referencia_obra:'PEA-2026-012' };
      d.puerta = { tipo:'Peatonal automática', denominacion:'Puerta corredera automática de dos hojas',
        marca:'Erreka', modelo:'Vento', serie:'VN-2026-1187',
        ancho:1800, alto:2200, hojas:2, motorizada:'si',
        modo:'automatico', usuarios:'publico' };
      d.comp = {};
      (T.EXP_COMPONENTES.peatonal||[]).forEach(([k]) => { d.comp[k] = { estado:'si' }; });
      d.cumple = {};
      (T.EXP_COMPROBACIONES.peatonal||[]).forEach(([k], i) => {
        d.cumple[k] = i % 9 === 4
          ? { v:'nc', motivo:'Pendiente de comprobar con el centro en horario de cierre' }
          : { v:'si' };
      });
      /* Las doce preguntas propias de la peatonal */
      d.pea = {
        p1:{ v:'si' }, p2:{ v:'si' },
        p3:{ v:'si' }, p4:{ v:'si' }, p5:{ v:'si' },
        p6:{ v:'si' }, p7:{ v:'si' }, p8:{ v:'si' },
        p9:{ v:'si' }, p10:{ v:'si' }, p11:{ v:'si' },
        p12:{ v:'no', motivo:'Funciona en modo normal, no en baja energía' },
      };
      d.fuerzas = { incluir:'si', fecha:'2026-10-05',
        instrumento:'Dinamómetro de ensayo Sensor FM-200', calibracion:'CAL-2026-0345, 12-03-2026',
        m0:{ fd:120, fs:60, fe:12, td:0.3 }, m1:{ fd:98, fs:52, fe:10, td:0.28 },
        m2:{ fd:85, fs:45, fe:9, td:0.25 }, observaciones:'' };
      d.interv = { tipo:'mantenimiento' };
      for (let i = 1; i <= 12; i++) d.interv['q'+i] = { v:'no' };
      d.mant = { fab_consta:'si', fab_meses:'6',
        fab_donde:'Manual del operador Erreka Vento, apartado 9',
        acordada_meses:'6', contrato:'si' };
      d.entrega = { tecnico:'David Ariza Arana', firmante:'David Ariza Arana',
        cargo:'Administrador único', docs:{ libro:'si', manual:'si', informe:'si' } };
      e.fecha_puesta_servicio = '2021-03-11';
      await T.sb.from('expedientes').update({ datos:d,
        fecha_puesta_servicio:'2021-03-11' }).eq('id', id);
      await T.cargar(); T.pintar();
      return true;
    }, { id });
  },

  async cortafuegos(pag, id){
    return await pag.evaluate(async ({ id }) => {
      const T = window.__T;
      const e = T.expDe(id);
      const d = e.datos = e.datos || {};
      d.obra = { emplazamiento:'Polígono El Palmar, nave 7, 11500 El Puerto de Santa María',
        ubicacion:'Separación entre almacén y zona de producción', uso_edificio:'Industria',
        centro_trabajo:'si', titular:'Talleres Guadalete S.L.', nif_titular:'B11556677',
        contacto:'Encargado de mantenimiento', referencia_obra:'CF-2026-004' };
      d.puerta = { tipo:'Corredera', denominacion:'Puerta corredera resistente al fuego',
        marca:'Andreu', modelo:'CF-60 Metálica', serie:'AND-2019-55120',
        ancho:3000, alto:3000, hojas:1, motorizada:'si',
        modo:'automatico', usuarios:'informados' };
      d.cf = { fabricante:'Andreu Barberá S.L.', modelo:'CF-60 Metálica corredera',
        clasificacion:'EI2 60-C5', dop:'DoP 2019/CF60/014',
        certificado:'0370-CPR-2211', organismo:'AFITI-LICOF, organismo notificado 0370',
        comp_sust:'si', comp_lista:'Cierrapuertas sustituido por uno de otra marca durante una '+
          'reparación anterior a nuestra intervención',
        comp_orig:'no',
        comp_base:'El cierrapuertas instalado no figura en la documentación del fabricante '+
          'de la puerta ni en su certificado' };
      d.comp = {};
      (T.EXP_COMPONENTES.cortafuegos||[]).forEach(([k]) => { d.comp[k] = { estado:'si' }; });
      d.cumple = {};
      (T.EXP_COMPROBACIONES.cortafuegos||[]).forEach(([k], i) => {
        d.cumple[k] = i % 6 === 2
          ? { v:'nc', motivo:'No puede comprobarse sin la documentación del fabricante' }
          : { v:'si' };
      });
      d.interv = { tipo:'reparacion' };
      for (let i = 1; i <= 12; i++) d.interv['q'+i] = { v:'no' };
      d.mant = { fab_consta:'si', fab_meses:'6', fab_donde:'Manual Andreu, apartado 5',
        acordada_meses:'6', contrato:'no' };
      d.entrega = { tecnico:'David Ariza Arana', firmante:'David Ariza Arana',
        cargo:'Administrador único', docs:{ informe:'si' } };
      e.fecha_puesta_servicio = '2019-11-08';
      await T.sb.from('expedientes').update({ datos:d,
        fecha_puesta_servicio:'2019-11-08' }).eq('id', id);
      await T.cargar(); T.pintar();
      return true;
    }, { id });
  },

  async motorizacion(pag, id){
    return await pag.evaluate(async ({ id }) => {
      const T = window.__T;
      const e = T.expDe(id);
      const d = e.datos = e.datos || {};
      d.obra = { emplazamiento:'Calle Valdés 8, 11500 El Puerto de Santa María',
        ubicacion:'Portón de acceso a patio', uso_edificio:'Vivienda',
        centro_trabajo:'no', titular:'Particular', nif_titular:'',
        contacto:'', referencia_obra:'MOT-2026-023' };
      d.puerta = { tipo:'Batiente', denominacion:'Portón batiente de dos hojas motorizado',
        marca:'Ariza', modelo:'Motorización sobre hoja existente', serie:'AR-2026-0211',
        ancho:3200, alto:2000, hojas:2, motorizada:'si',
        modo:'automatico', usuarios:'informados', fecha_fabricacion:'2026-10-01' };
      d.orig = { fabricante:'Cerrajería local, sin identificar', modelo:'', serie:'',
        marcado:'ausente', ddp:'no', declaracion:'no' };
      d.comp = {};
      (T.EXP_COMPONENTES.industrial||[]).forEach(([k]) => { d.comp[k] = { estado:'si' }; });
      d.cumple = {};
      (T.EXP_COMPROBACIONES.industrial||[]).forEach(([k]) => { d.cumple[k] = { v:'si' }; });
      const pel = T.peligrosDe(e);
      d.peligro = {};
      if (pel) pel.lista.forEach(([pk]) => {
        d.peligro[pk] = { v:'si', zona:'Zona de bisagra y canto de cierre',
          medida:'Banda de seguridad y fotocélulas enfrentadas',
          componente:'Banda resistiva 8K2', marca:'ASO', modelo:'Sentir 45.25',
          ident:'', comprobacion:'Obstáculo rígido en apertura y en cierre',
          resultado:'si', obs:'' };
      });
      d.fuerzas = { incluir:'si', fecha:'2026-10-03', hueco:'aplastamiento',
        instrumento:'Dinamómetro de ensayo Sensor FM-200', calibracion:'CAL-2026-0345, 12-03-2026',
        m0:{ fd:310, fs:105, fe:16, td:0.5 }, m1:{ fd:290, fs:98, fe:14, td:0.46 },
        m2:{ fd:270, fs:90, fe:13, td:0.42 }, observaciones:'' };
      d.interv = { tipo:'motorizacion' };
      d.prest = { emitir_ddp:'no' };
      d.mant = { fab_consta:'si', fab_meses:'12', fab_donde:'Manual del operador, apartado 6',
        acordada_meses:'12', contrato:'ofrecido' };
      d.entrega = { tecnico:'David Ariza Arana', firmante:'David Ariza Arana',
        cargo:'Administrador único', firmante_ok:'si',
        docs:{ dc:'si', marcado:'si', manual:'si', libro:'si', expediente:'si' } };
      e.fecha_puesta_servicio = '2026-10-04';
      await T.sb.from('expedientes').update({ datos:d,
        fecha_puesta_servicio:'2026-10-04' }).eq('id', id);
      await T.cargar(); T.pintar();
      return true;
    }, { id });
  },
};

/* Crea un expediente por la vía normal de la aplicación y devuelve su id */
async function nuevoExpediente(situacion, familia, puertaIdx){
  return await pag.evaluate(async ({ situacion, familia, puertaIdx }) => {
    const T = window.__T;
    const p = T.S.puertas[puertaIdx || 0];
    const { data } = await T.sb.rpc('crear_expediente',
      { p_puerta:p.id, p_situacion:situacion, p_familia:familia, p_aviso:null });
    await T.cargar(); T.pintar();
    return (data && (data.id || data.expediente)) ||
           (T.S.expedientes[T.S.expedientes.length-1]||{}).id;
  }, { situacion, familia, puertaIdx });
}

console.log('Generando las muestras en '+SALIDA+'\n');

/* ══════ 1. Puerta nueva de fabricación propia ══════ */
const A = await nuevoExpediente('nueva_fabricante', 'industrial', 0);
await DATOS.industrial(pag, A);
await ponerFotos(pag, A, [
  ['puerta:general', 'Vista general de la puerta desde el exterior',
   'Puerta seccional. Rampa de acceso al garaje. Vista general.'],
  ['puerta:cerrada', 'La puerta cerrada',
   'Puerta seccional. Rampa de acceso al garaje. Puerta cerrada.'],
  ['comp:placa', 'Placa de características y marcado CE',
   'Placa de características. Montante derecho del hueco. Detalle.'],
  ['comp:motor', 'Automatismo o motorreductor',
   'Motorreductor Erreka Rino 4. Parte alta del hueco. Vista frontal.'],
  ['comp:fotocelulas', 'Fotocélulas y su altura respecto al suelo',
   'Fotocélula exterior. Lado derecho del hueco, a 300 mm del suelo. Vista frontal.'],
  ['comp:banda', 'Banda de seguridad del canto inferior',
   'Banda de seguridad ASO Sentir 45.25. Canto inferior de la hoja. Detalle.'],
  ['fuerzas:medida', 'Pantalla del instrumento durante el ensayo',
   'Dinamómetro durante la medición. Canto de cierre a 50 mm del suelo. Detalle.'],
]);
{
  const r = await emitir(pag, A, 'Primera emisión tras la puesta en servicio');
  console.log('  ··  expediente de puerta nueva emitido como: '+r.nombre+
    (r.criticos.length ? ' · con '+r.criticos.length+' aviso(s) crítico(s): '+
      r.criticos.join(' | ') : ''));
}
await pdf('libro-puerta-nueva-fabricacion-propia',
  'libroExpediente', A);
await pdf('etiqueta-marcado-CE', 'etiquetaCE', A);
await pdf('documentacion-tecnica-especifica', 'documentoDTE', A);
await pdf('hoja-de-campo', 'hojaDeCampo', A);
await pdf('libro-de-mantenimiento', 'libroMantenimiento', A, true);
await pdf('acta-de-entrega-y-recepcion', 'actaEntrega', A, 1);

/* ══════ 2. Adecuación de puerta existente con deficiencias ══════ */
const B = await nuevoExpediente('adecuacion', 'industrial', 1);
await DATOS.adecuacion(pag, B);
await ponerFotos(pag, B, [
  ['puerta:general', 'Vista general de la puerta corredera industrial',
   'Puerta corredera. Muelle de carga número 2. Vista general.'],
  ['comp:placa', 'Lugar donde debería estar la placa de características',
   'Montante del hueco, sin placa de características. Detalle.'],
  ['comp:banda', 'Canto de cierre sin banda de seguridad',
   'Canto de cierre de la hoja, sin dispositivo de protección. Detalle.'],
  ['fuerzas:medida', 'Medición de la fuerza en el canto de cierre',
   'Dinamómetro durante la medición. Canto de cierre a 50 mm del suelo. Detalle.'],
]);
await pdf('informe-de-situacion-y-deficiencias', 'informeSituacion', B);
await pdf('propuesta-de-actuaciones', 'propuestaActuaciones', B);
await pdf('libro-adecuacion-con-deficiencias', 'libroExpediente', B);

/* ══════ 3. Peatonal automática en recorrido de evacuación ══════ */
const C = await nuevoExpediente('adecuacion', 'peatonal', 0);
await DATOS.peatonal(pag, C);
await pdf('informe-peatonal-automatica', 'informeSituacion', C);
await pdf('libro-peatonal-automatica', 'libroExpediente', C);

/* ══════ 4. Resistente al fuego con componente sustituido ══════ */
const D = await nuevoExpediente('adecuacion', 'cortafuegos', 1);
await DATOS.cortafuegos(pag, D);
await pdf('informe-puerta-resistente-al-fuego', 'informeSituacion', D);
await pdf('libro-puerta-resistente-al-fuego', 'libroExpediente', D);

/* ══════ 5. Motorización de puerta manual ══════ */
const E = await nuevoExpediente('modificacion', 'industrial', 0);
await DATOS.motorizacion(pag, E);
await pdf('libro-motorizacion-modificacion-sustancial', 'libroExpediente', E);

/* ══════ 6. Vida de la puerta ══════ */
const puerta0 = await pag.evaluate(() => window.__T.S.puertas[0].id);
await pdf('vida-de-la-puerta-para-el-titular',
  'vidaPuerta', puerta0, "cliente");
await pdf('vida-de-la-puerta-interna',
  'vidaPuerta', puerta0, "interno");

/* ══════ 7. Documentos que no son de expediente ══════ */
await pdf('hoja-de-etiquetas-QR', 'hojaImprimible');
await pdf('control-de-produccion-en-fabrica', 'documentoCPF');

/* Un parte de trabajo necesita una asistencia cerrada */
const aviso = await pag.evaluate(async () => {
  const T = window.__T;
  const p = T.S.puertas[0];
  const fila = {
    id:'aviso-muestra', puerta_id:p.id, cliente_id:p.cliente_id,
    tipo:'averia', estado:'cerrado', prioridad:'normal',
    descripcion:'La puerta no cierra del todo y golpea al llegar al suelo.',
    diagnostico:'Final de carrera de cierre desajustado y rodamiento superior agarrotado.',
    trabajo:'Ajuste del final de carrera, sustitución del rodamiento y engrase de guías. '+
      'Comprobación de inversión por obstáculo en tres puntos.',
    estado_final:'Operativa', pendiente:false,
    hora_inicio:'09:30', hora_fin:'11:10', horas:2, num_tecnicos:1, desplazamiento:14,
    tecnico:'David Ariza Arana', tecnico_id:'usuario-admin',
    firma_nombre:'Manuel Pérez Ruiz',
    creado:'2026-10-06T08:40:00.000Z', cerrado:'2026-10-06T11:10:00.000Z',
  };
  T.S.avisos.push(fila);
  await T.sb.from('avisos').insert(fila);
  await T.sb.from('materiales').insert([
    { aviso_id:fila.id, descripcion:'Rodamiento guía superior', cantidad:1, unidad:'ud' },
    { aviso_id:fila.id, descripcion:'Grasa de litio', cantidad:1, unidad:'bote' }]);
  await T.cargar(); T.pintar();
  return fila.id;
});
await pdf('parte-de-trabajo', 'hojaParte', aviso);

/* Un contrato de mantenimiento */
const contrato = await pag.evaluate(async () => {
  const T = window.__T;
  const c = T.S.clientes[0];
  const fila = { id:'contrato-muestra', cliente_id:c.id, referencia:'CM-2026-018',
    periodicidad_meses:6, cuota:180, forma_pago:'Domiciliación', estado:'vigente',
    inicio:'2026-01-01', fin:'2026-12-31', creado:new Date().toISOString() };
  T.S.contratos.push(fila);
  await T.sb.from('contratos').insert(fila);
  await T.cargar(); T.pintar();
  return fila.id;
});
await pdf('contrato-de-mantenimiento', 'hojaContrato', contrato);


/* ══════ Índice, para quien reciba estos documentos ══════ */
const QUE_ES = {
  'libro-puerta-nueva-fabricacion-propia':
    ['Libro de documentación técnica de una puerta nueva fabricada por la empresa.',
     'Es el documento completo: identificación, elementos, comprobaciones, ensayo de '+
     'fuerzas, prestaciones declaradas, declaración CE de conformidad, riesgos residuales, '+
     'instrucciones de uso y libro de mantenimiento. Directiva 2006/42/CE (anexo II) y '+
     'Reglamento (UE) 305/2011.'],
  'etiqueta-marcado-CE':
    ['Etiqueta de marcado CE para colocar en la puerta.',
     'Contenido del marcado del anexo III de la Directiva 2006/42/CE.'],
  'documentacion-tecnica-especifica':
    ['Documentación Técnica Específica.',
     'La que permite a una microempresa sustituir los ensayos iniciales de tipo, por el '+
     'artículo 37 del Reglamento (UE) 305/2011. Dice con qué método se ha demostrado cada '+
     'prestación y dónde está archivado.'],
  'hoja-de-campo':
    ['Hoja que el técnico se lleva impresa a la obra.',
     'No es documento de entrega: es el guion de lo que hay que mirar en esa puerta, con '+
     'casillas para anotar a mano.'],
  'libro-de-mantenimiento':
    ['Libro de mantenimiento que se queda en la instalación.',
     'Con el registro de revisiones y la periodicidad que corresponde.'],
  'acta-de-entrega-y-recepcion':
    ['Acta de entrega y recepción de documentación.',
     'Acredita qué se entregó, a quién, cuándo y con qué DNI, y relaciona lo que quedaba '+
     'pendiente ese día. La firma acredita la recepción, no la conformidad.'],
  'informe-de-situacion-y-deficiencias':
    ['Informe técnico del estado de una puerta existente.',
     'El documento que sale cuando NO puede acreditarse conformidad: recoge lo comprobado, '+
     'lo que no se pudo comprobar, las deficiencias y los riesgos, sin presentarlo como '+
     'declaración de conformidad.'],
  'propuesta-de-actuaciones':
    ['Propuesta de trabajos de adecuación.',
     'Sale del informe anterior y se emite aparte, para que cambiar el presupuesto no '+
     'obligue a tocar el diagnóstico técnico.'],
  'libro-adecuacion-con-deficiencias':
    ['Libro de una adecuación con deficiencias detectadas.',
     'Enseña cómo queda el documento cuando la puerta NO cumple: las deficiencias salen '+
     'con su prioridad y el documento no se titula como conforme.'],
  'informe-peatonal-automatica':
    ['Informe de una puerta peatonal automática en recorrido de evacuación.',
     'Con las doce preguntas propias de esta familia. UNE-EN 16005+A1:2024 y UNE 85121:2018. '+
     'La matriz de protección de la UNE-EN 12453 no se aplica aquí.'],
  'libro-peatonal-automatica':
    ['Libro de documentación de la misma puerta peatonal.', ''],
  'informe-puerta-resistente-al-fuego':
    ['Informe de una puerta resistente al fuego con un componente sustituido.',
     'Enseña el caso en que la configuración queda fuera de lo certificado por el '+
     'fabricante: el documento lo dice y el expediente va a revisión técnica obligatoria.'],
  'libro-puerta-resistente-al-fuego':
    ['Libro de documentación de la misma puerta cortafuegos.', ''],
  'libro-motorizacion-modificacion-sustancial':
    ['Libro de una motorización de puerta manual.',
     'Motorizar una puerta manual es poner en servicio una máquina nueva. El documento '+
     'recoge la clasificación como modificación sustancial y sus consecuencias.'],
  'vida-de-la-puerta-para-el-titular':
    ['Expediente de vida de la puerta, versión para el titular.',
     'Todo lo que le ha pasado a una puerta desde que existe, por orden de fecha: '+
     'intervenciones, revisiones, piezas sustituidas, expedientes y entregas. Sin precios.'],
  'vida-de-la-puerta-interna':
    ['El mismo documento, versión interna.',
     'Lleva además horas, desplazamientos e importes. No se entrega al cliente.'],
  'hoja-de-etiquetas-QR':
    ['Hoja de etiquetas con QR para pegar en las puertas.',
     'Cada puerta lleva su código y un QR que lleva a su ficha.'],
  'control-de-produccion-en-fabrica':
    ['Control de producción en fábrica.',
     'Documento del sistema de evaluación de la conformidad del producto de construcción.'],
  'parte-de-trabajo':
    ['Parte de una asistencia cerrada.',
     'Lo que firma el cliente al terminar una visita: diagnóstico, trabajo, materiales, '+
     'tiempo y estado en que queda la puerta.'],
  'contrato-de-mantenimiento':
    ['Contrato de mantenimiento.', ''],
};

{
  const ficheros = (await import('fs')).readdirSync(SALIDA)
    .filter(f => /^\d\d-.*\.pdf$/.test(f)).sort();
  const filas = ficheros.map(f => {
    const clave = f.replace(/^\d\d-/, '').replace(/\.pdf$/, '');
    const q = QUE_ES[clave] || ['', ''];
    return '<tr><td class="n">'+f.slice(0,2)+'</td><td><b>'+q[0]+'</b>'+
      (q[1] ? '<br><span class="g">'+q[1]+'</span>' : '')+
      '<br><span class="f">'+f+'</span></td></tr>';
  }).join('');
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><style>'+
    '@page{size:A4;margin:16mm 14mm}'+
    'body{font:11px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1C1817;margin:0}'+
    'h1{font-size:21px;margin:0 0 2px}h2{font-size:13px;margin:16px 0 6px;'+
      'border-bottom:2px solid #FCBA1D;padding-bottom:3px}'+
    '.marca{font-weight:800;font-size:14px;margin-bottom:10px}.marca span{color:#C98F08}'+
    '.av{border:2px solid #B3271E;color:#B3271E;background:#F8E1DF;padding:7px 10px;'+
      'margin:10px 0 14px;font-weight:700;border-radius:4px}'+
    'table{width:100%;border-collapse:collapse;margin:0 0 10px}'+
    'td{border-bottom:1px solid #E5E1DC;padding:6px 6px;vertical-align:top}'+
    '.n{width:26px;color:#6B6560;font-weight:700}'+
    '.g{color:#4A4541}.f{color:#9A948E;font-size:9.5px}'+
    'ul{margin:4px 0 0;padding-left:18px}li{margin-bottom:3px}'+
    '</style></head><body>'+
    '<div class="marca">ARIZA <span>puertas automáticas</span></div>'+
    '<h1>Documentos que genera ARIZA SAT</h1>'+
    '<p>Muestras de todos los documentos que la aplicación produce, para revisión '+
    'técnica. Generadas el '+new Date().toLocaleDateString('es-ES',
      { day:'numeric', month:'long', year:'numeric' })+'.</p>'+
    '<div class="av">'+AVISO+'</div>'+
    '<h2>Los documentos</h2><table>'+filas+'</table>'+
    '<h2>Qué conviene saber al revisarlos</h2>'+
    '<ul>'+
    '<li><b>La aplicación nunca convierte una falta de dato en una conformidad.</b> Lo que '+
    'no se ha comprobado sale como NO VERIFICADO, lo que no se ha aportado como NO '+
    'APORTADO y lo que falta como PENDIENTE. Nunca en blanco y nunca supuesto.</li>'+
    '<li><b>El ensayo de fuerzas registra las medidas pero no dictamina.</b> Los límites '+
    'que la aplicación trae de fábrica proceden de reproducciones sectoriales de la '+
    'UNE-EN 12453, no del texto de la norma, que es de pago. Mientras la empresa no los '+
    'contraste con su ejemplar y los marque como validados, el resultado sale como '+
    '«Pendiente de evaluación» en lugar de «Pasa». Es deliberado: sin fuente verificada '+
    'no hay dictamen.</li>'+
    '<li><b>La matriz de protección de la UNE-EN 12453 nace vacía</b> por la misma razón. '+
    'La rellena la empresa con su ejemplar de la norma.</li>'+
    '<li><b>Las periodicidades de mantenimiento</b> salen primero del manual del fabricante '+
    '(Real Decreto 1215/1997, artículo 3.5). Solo en su defecto se recurre a la '+
    'recomendación de la UNE 85635:2012, que la aplicación presenta citando de dónde ha '+
    'tomado el dato y advirtiendo de que no es un plazo legal.</li>'+
    '<li><b>El marco legal lo decide la fecha de puesta en servicio.</b> Hasta el 19 de '+
    'enero de 2027, Directiva 2006/42/CE y «Declaración CE de conformidad». Desde el 20 de '+
    'enero de 2027, Reglamento (UE) 2023/1230 y «Declaración UE de conformidad». Esa fecha '+
    'es un dato editable en la aplicación, no está escrita en el programa.</li>'+
    '<li><b>El expediente técnico no se entrega.</b> Queda a disposición de las autoridades '+
    'diez años (anexo VII parte A de la Directiva; artículo 10.3 del Reglamento). Lo que '+
    'acompaña a la máquina son las instrucciones y la declaración.</li>'+
    '<li><b>Generado no es entregado, y firmar no es conformar.</b> Un documento consta '+
    'GENERADO hasta que se registra su entrega con receptor, nombre legible y DNI. Y el '+
    'acta de entrega relaciona lo que quedaba pendiente el día de la firma.</li>'+
    '</ul>'+
    '<h2>Quién los hace</h2>'+
    '<p>'+EMPRESA.razon_social+' · NIF '+EMPRESA.nif+'<br>'+
    EMPRESA.domicilio+', '+EMPRESA.cp+' '+EMPRESA.poblacion+', '+EMPRESA.provincia+'<br>'+
    EMPRESA.telefono+' · '+EMPRESA.email+' · '+EMPRESA.web+'</p>'+
    '</body></html>';
  const pIndice = await ctx.newPage();
  await pIndice.setContent(html, { waitUntil:'load' });
  await pIndice.pdf({ path: join(SALIDA, '00-LEEME-que-es-cada-documento.pdf'),
    format:'A4', printBackground:true,
    margin:{ top:'12mm', bottom:'12mm', left:'10mm', right:'10mm' } });
  await pIndice.close();
  console.log('  OK  00-LEEME-que-es-cada-documento.pdf');
}

console.log('\n'+n+' documentos generados en '+SALIDA);
if (fallos.length) console.log('Con '+fallos.length+' incidencia(s):\n'+fallos.join('\n'));
else console.log('Sin incidencias.');
await nav.close();
process.exit(fallos.length ? 1 : 0);
