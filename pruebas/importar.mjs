/* ================================================================
   importar.mjs — cargar clientes y puertas desde un Excel.

   Por qué existe: una empresa de veinticinco años no empieza de
   cero. Los clientes y las puertas están en hojas de cálculo, y
   teclearlos a mano es trabajo de semanas que no se hace nunca.

   Lo que fija esta suite:
     1. El .xlsx se lee aquí dentro, sin librerías de internet: se
        genera la plantilla, se vuelve a leer y tiene que salir lo
        mismo que entró.
     2. El CSV también, con punto y coma o con coma, y con el
        separador metido dentro de unas comillas.
     3. Los títulos de columna se reconocen aunque estén escritos de
        otra forma, y lo que falta se dice antes de tocar nada.
     4. Números y fechas: coma decimal, puntos de millar, dd/mm/aaaa
        y el número de serie que usa Excel para las fechas.
     5. Analizar NO guarda nada. Es la regla de la casa aquí: primero
        se enseña qué va a pasar, y solo después se escribe.
     6. Duplicados: por NIF y por nombre en clientes, por etiqueta en
        puertas, y los repetidos dentro del propio fichero.
     7. Una puerta no se queda suelta: o su cliente existe, o se crea
        a propósito, o la fila no entra.
     8. La etiqueta que no está en la serie se da de alta con su
        código de seguridad, para que el QR lleve a alguna parte.
     9. La carga es de oficina: el técnico no ve el botón.
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
const ctx = await nav.newContext({ viewport:{width:1320,height:1800}, locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
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

/* ================================================================
   1. Leer un Excel de verdad
   ================================================================ */
bloque('1. El .xlsx se lee sin traer nada de internet');

const vuelta = await T(async () => {
  const g = window.__T;
  const blob = g.plantillaXlsx('clientes');
  const buf = await blob.arrayBuffer();
  return { partes: Object.keys(await g.abrirZip(buf)),
           filas: await g.leerXlsx(buf),
           tipo: blob.type, bytes: blob.size,
           campos: g.IMPORTA.clientes.campos.map(c => c[1]) };
});
paso('la plantilla sale con las partes que exige un .xlsx',
  ['[Content_Types].xml','_rels/.rels','xl/workbook.xml','xl/worksheets/sheet1.xml']
    .every(x => vuelta.partes.includes(x)), vuelta.partes.join(' · '));
paso('y al volver a leerla salen dos filas: títulos y ejemplo',
  vuelta.filas.length === 2, vuelta.filas.length);
paso('los títulos son exactamente los campos que la aplicación admite',
  JSON.stringify(vuelta.filas[0]) === JSON.stringify(vuelta.campos),
  vuelta.filas[0].join(' | '));
paso('las tildes y las eñes sobreviven al viaje',
  vuelta.filas[0].includes('Población') && /María/.test(vuelta.filas[1].join(' ')),
  vuelta.filas[1][6]);
paso('la fila de ejemplo trae datos en todas sus columnas',
  vuelta.filas[1].filter(x => x).length >= 7, vuelta.filas[1].length);

const puertasPlant = await T(async () => {
  const g = window.__T;
  const filas = await g.leerXlsx(await g.plantillaXlsx('puertas').arrayBuffer());
  return { cab: filas[0], ej: filas[1] };
});
paso('la plantilla de puertas pide el cliente lo primero',
  /Cliente/.test(puertasPlant.cab[0]), puertasPlant.cab[0]);
paso('y trae la etiqueta, las medidas y la matrícula',
  ['Etiqueta','Ancho (mm)','Alto (mm)','Matrícula o placa'].every(x => puertasPlant.cab.includes(x)),
  puertasPlant.cab.join(' | '));

const roto = await T(async () => {
  const g = window.__T;
  try { await g.leerXlsx(new TextEncoder().encode('esto no es un excel').buffer); return 'no falló'; }
  catch(e){ return e.message; }
});
paso('un fichero que no es un Excel se rechaza diciendo por qué',
  /no parece un Excel/.test(roto), roto);

/* ================================================================
   2. CSV
   ================================================================ */
bloque('2. El CSV, con punto y coma o con coma');

const csv = await T(() => {
  const g = window.__T;
  return {
    pyc: g.leerCsv('Nombre;NIF\nPepe S.L.;B1\n'),
    coma: g.leerCsv('Nombre,NIF\nPepe S.L.,B1\n'),
    comillas: g.leerCsv('Nombre;NIF\n"Hermanos Ruiz; S.L.";B2\n'),
    dobles: g.leerCsv('Nombre;Notas\nX;"dijo ""vale"" ayer"\n'),
    bom: g.leerCsv('﻿Nombre;NIF\nY;B3\n'),
    vacias: g.leerCsv('Nombre;NIF\n\n;\nZ;B4\n').length,
  };
});
paso('separador punto y coma', csv.pyc[1][0] === 'Pepe S.L.' && csv.pyc[1][1] === 'B1');
paso('separador coma', csv.coma[1][0] === 'Pepe S.L.');
paso('un punto y coma dentro de comillas NO parte la columna',
  csv.comillas[1][0] === 'Hermanos Ruiz; S.L.', csv.comillas[1][0]);
paso('las comillas dobles escapadas se entienden',
  csv.dobles[1][1] === 'dijo "vale" ayer', csv.dobles[1][1]);
paso('la marca de orden de bytes de Excel no se cuela en el primer título',
  csv.bom[0][0] === 'Nombre', JSON.stringify(csv.bom[0][0]));
paso('las filas vacías se tiran', csv.vacias === 2, csv.vacias);

/* ================================================================
   3. Los títulos de columna
   ================================================================ */
bloque('3. Los títulos se reconocen aunque estén escritos de otra forma');

const cab = await T(() => {
  const g = window.__T;
  return {
    exacto: g.mapearCabeceras('clientes', ['Nombre o razón social','NIF o CIF']),
    alias:  g.mapearCabeceras('clientes', ['CLIENTE','cif','Móvil','correo electronico']),
    sobran: g.mapearCabeceras('clientes', ['Nombre','Color del coche']),
    falta:  g.mapearCabeceras('clientes', ['NIF','Teléfono']),
    puerta: g.mapearCabeceras('puertas', ['titular','etiqueta','AÑO','ancho','fecha ultima revision']),
  };
});
paso('los títulos de la plantilla, claro',
  cab.exacto.usadas.nombre === 0 && cab.exacto.usadas.nif === 1);
paso('y en mayúsculas, sin tildes y con otros nombres',
  cab.alias.usadas.nombre === 0 && cab.alias.usadas.nif === 1 &&
  cab.alias.usadas.telefono === 2 && cab.alias.usadas.email === 3,
  JSON.stringify(cab.alias.usadas));
paso('una columna que no es de nadie se señala y se deja fuera',
  cab.sobran.sobran.length === 1 && cab.sobran.sobran[0] === 'Color del coche');
paso('si falta la obligatoria, se dice cuál',
  cab.falta.faltan.length === 1 && /Nombre/.test(cab.falta.faltan[0]), cab.falta.faltan.join(','));
paso('en puertas también: titular, año y fechas',
  cab.puerta.usadas.cliente === 0 && cab.puerta.usadas.anio === 2 &&
  cab.puerta.usadas.ancho_mm === 3 && cab.puerta.usadas.ultima_revision === 4,
  JSON.stringify(cab.puerta.usadas));

/* ================================================================
   4. Números y fechas
   ================================================================ */
bloque('4. Números y fechas como los escribe la gente');

const val = await T(() => {
  const g = window.__T;
  const num = ['ancho_mm','Ancho',[],'numero'];
  const fec = ['ultima_revision','Última',[],'fecha'];
  const txt = ['nombre','Nombre',[],'texto'];
  return {
    entero: g.valorImporta(num, '3500'),
    coma: g.valorImporta(num, '3,5'),
    miles: g.valorImporta(num, '3.500'),
    noNum: g.valorImporta(num, 'ancho'),
    iso: g.valorImporta(fec, '2026-03-14'),
    es: g.valorImporta(fec, '14/03/2026'),
    corta: g.valorImporta(fec, '14/3/26'),
    serie: g.valorImporta(fec, '46000'),
    basura: g.valorImporta(fec, 'el mes que viene'),
    espacios: g.valorImporta(txt, '  Pepe  '),
    vacio: g.valorImporta(txt, '   '),
  };
});
paso('un entero es un entero', val.entero === 3500, val.entero);
paso('la coma decimal se entiende', val.coma === 3.5, val.coma);
paso('y el punto de los miles no se confunde con un decimal', val.miles === 3500, val.miles);
paso('lo que no es un número se queda vacío, no en cero', val.noNum === null, val.noNum);
paso('fecha en ISO', val.iso === '2026-03-14', val.iso);
paso('fecha en 14/03/2026', val.es === '2026-03-14', val.es);
paso('fecha en 14/3/26', val.corta === '2026-03-14', val.corta);
paso('y el número con el que Excel guarda las fechas',
  val.serie === '2025-12-09', val.serie);
paso('una fecha que no se entiende se deja vacía, sin inventar',
  val.basura === null, val.basura);
paso('a los textos se les quitan los espacios de los lados', val.espacios === 'Pepe');
paso('y una celda de solo espacios es una celda vacía', val.vacio === null);

/* ================================================================
   5. Analizar no guarda nada
   ================================================================ */
bloque('5. Analizar no toca la base de datos');

const sinTocar = await T(() => {
  const g = window.__T;
  const antes = { cli: g.S.clientes.length, pu: g.S.puertas.length };
  g.analizarImportacion('clientes', [['Nombre'],['Uno'],['Dos'],['Tres']], {});
  g.analizarImportacion('puertas', [['Cliente','Etiqueta'],['Comunidad Las Flores','AR-9001']], {});
  return { antes, despues: { cli: g.S.clientes.length, pu: g.S.puertas.length } };
});
paso('después de analizar hay los mismos clientes que antes',
  sinTocar.antes.cli === sinTocar.despues.cli, sinTocar.antes.cli+' → '+sinTocar.despues.cli);
paso('y las mismas puertas',
  sinTocar.antes.pu === sinTocar.despues.pu, sinTocar.antes.pu+' → '+sinTocar.despues.pu);

/* ================================================================
   6. Clientes: qué es nuevo, qué cambia y qué está repetido
   ================================================================ */
bloque('6. Clientes');

const cl = await T(() => {
  const g = window.__T;
  const a = g.analizarImportacion('clientes', [
    ['Nombre','NIF','Telefono'],
    ['Comunidad Las Flores','H11223344','699 111 222'],   // existe, por NIF, y cambia el teléfono
    ['Talleres Guadalete','','600 000 002'],              // existe por nombre y está igual
    ['Cristalerías del Sur','B9988','956 000 111'],       // nueva
    ['CRISTALERÍAS DEL SUR','B9988','otro'],              // repetida dentro del fichero
    ['','X',''],                                          // sin nombre
  ], {});
  return { resumen: a.resumen,
           filas: a.filas.map(f => ({ n:f.n, e:f.estado, m:f.motivo,
             cam:f.cambios.map(c => c[0]+':'+c[1]+'>'+c[2]) })) };
});
paso('cuenta bien lo que hay',
  cl.resumen.nueva === 1 && cl.resumen.actualiza === 1 &&
  cl.resumen.igual === 1 && cl.resumen.error === 2, JSON.stringify(cl.resumen));
paso('el que existe por NIF sale como que cambia, y dice qué cambia',
  cl.filas[0].e === 'actualiza' && cl.filas[0].cam.some(x => /telefono/.test(x)),
  cl.filas[0].cam.join(' · '));
paso('el que existe por nombre y viene igual no se toca',
  cl.filas[1].e === 'igual', cl.filas[1].e);
paso('el que no existe se da de alta', cl.filas[2].e === 'nueva');
paso('el repetido dentro del propio fichero no entra dos veces',
  cl.filas[3].e === 'error' && /Repetida/.test(cl.filas[3].m), cl.filas[3].m);
paso('y sin nombre no hay cliente',
  cl.filas[4].e === 'error' && /Sin nombre/.test(cl.filas[4].m), cl.filas[4].m);

/* ================================================================
   7. Puertas: ninguna se queda suelta
   ================================================================ */
bloque('7. Puertas');

const pu = await T(() => {
  const g = window.__T;
  const sin = g.analizarImportacion('puertas', [
    ['Cliente','Etiqueta','Tipo'],
    ['Comunidad Las Flores','AR-0001','Corredera'],       // existe: cambia el tipo si procede
    ['Talleres Guadalete','AR-8001','Seccional'],         // nueva, etiqueta fuera de serie
    ['Nadie Conocido S.L.','AR-8002','Corredera'],        // cliente que no existe
    ['Comunidad Las Flores','AR-8001','Batiente'],        // etiqueta repetida en el fichero
    ['','AR-8003','Corredera'],                           // sin cliente
    ['Comunidad Las Flores','','Corredera'],              // sin etiqueta
  ], {});
  const con = g.analizarImportacion('puertas', [
    ['Cliente','Etiqueta'],
    ['Nadie Conocido S.L.','AR-8002'],
  ], { crearClientes:true });
  return {
    sin: sin.filas.map(f => ({ n:f.n, e:f.estado, m:f.motivo, av:f.aviso })),
    con: con.filas.map(f => ({ e:f.estado, av:f.aviso })),
  };
});
paso('la puerta que ya existe sale como que cambia o igual, no como nueva',
  ['actualiza','igual'].includes(pu.sin[0].e), pu.sin[0].e);
paso('una etiqueta que no está en la serie avisa de que se dará de alta',
  pu.sin[1].e === 'nueva' && /no está en la serie/.test(pu.sin[1].av), pu.sin[1].av);
paso('un cliente que no existe es un error, y dice cómo resolverlo',
  pu.sin[2].e === 'error' && /no existe todavía/.test(pu.sin[2].m), pu.sin[2].m);
paso('la etiqueta repetida dentro del fichero no entra dos veces',
  pu.sin[3].e === 'error' && /repetida/i.test(pu.sin[3].m), pu.sin[3].m);
paso('sin cliente, la puerta quedaría suelta: no entra',
  pu.sin[4].e === 'error' && /suelta/.test(pu.sin[4].m), pu.sin[4].m);
paso('sin etiqueta sí entra, pero avisa de que hay que pegarle una',
  pu.sin[5].e === 'nueva' && /pegarle una/.test(pu.sin[5].av), pu.sin[5].av);
paso('marcando crear los clientes que faltan, deja de ser un error',
  pu.con[0].e === 'nueva' && /Se creará el cliente/.test(pu.con[0].av), pu.con[0].av);

/* ================================================================
   8. Guardar de verdad
   ================================================================ */
bloque('8. La carga, ya con la base de datos de por medio');

const carga = await T(async () => {
  const g = window.__T;
  const a = g.analizarImportacion('clientes', [
    ['Nombre','NIF','Telefono','Poblacion'],
    ['Comunidad Las Flores','H11223344','699 111 222','El Puerto'],
    ['Cristalerías del Sur','B9988','956 000 111','Jerez'],
  ], {});
  const r1 = await g.ejecutarImportacion('clientes', a, { actualizar:true });
  await g.cargar();
  const nueva = g.S.clientes.find(c => /Cristaler/.test(c.nombre));
  const vieja = g.S.clientes.find(c => /Flores/.test(c.nombre));

  /* Y ahora el mismo fichero otra vez, sin autorizar la actualización: no debe
     tocar nada de lo que ya está. */
  const a2 = g.analizarImportacion('clientes', [
    ['Nombre','NIF','Telefono'],
    ['Comunidad Las Flores','H11223344','000 000 000'],
  ], {});
  const r2 = await g.ejecutarImportacion('clientes', a2, { actualizar:false });
  await g.cargar();
  const trasSaltar = g.S.clientes.find(c => /Flores/.test(c.nombre)).telefono;

  const p = g.analizarImportacion('puertas', [
    ['Cliente','Etiqueta','Tipo','Ancho','Alto'],
    ['Cristalerías del Sur','AR-7777','Seccional','4200','3100'],
  ], { crearClientes:true });
  const r3 = await g.ejecutarImportacion('puertas', p, { actualizar:true, crearClientes:true });
  await g.cargar();
  const puerta = g.S.puertas.find(x => x.codigo === 'AR-7777');
  const etiqueta = g.S.etiquetas.find(x => x.codigo === 'AR-7777');
  return { r1, nueva: nueva && { n:nueva.nombre, t:nueva.telefono, p:nueva.poblacion },
           vieja: vieja && vieja.telefono, r2, trasSaltar, r3,
           puerta: puerta && { cli:puerta.cliente, enlazada:!!puerta.cliente_id,
                               ancho:puerta.ancho_mm, alto:puerta.alto_mm, tipo:puerta.tipo },
           etiqueta: etiqueta && { cod:etiqueta.codigo, token:(etiqueta.token||'').length } };
});
paso('da de alta el que no estaba', carga.r1.creados === 1, JSON.stringify(carga.r1));
paso('con todos sus datos',
  carga.nueva.t === '956 000 111' && carga.nueva.p === 'Jerez', JSON.stringify(carga.nueva));
paso('y actualiza el que ya estaba', carga.r1.actualizados === 1 && carga.vieja === '699 111 222',
  carga.vieja);
paso('sin autorizar la actualización, no pisa nada',
  carga.r2.actualizados === 0 && carga.r2.saltados === 1 && carga.trasSaltar === '699 111 222',
  carga.trasSaltar);
paso('la puerta se da de alta enganchada a su cliente',
  carga.r3.creados === 1 && carga.puerta.enlazada === true, JSON.stringify(carga.puerta));
paso('con sus medidas y su tipo',
  carga.puerta.ancho === 4200 && carga.puerta.alto === 3100 && carga.puerta.tipo === 'Seccional');
paso('y la etiqueta nueva nace con su código de seguridad de cuatro caracteres',
  carga.etiqueta && carga.etiqueta.token === 4, JSON.stringify(carga.etiqueta));

/* ================================================================
   9. La pantalla
   ================================================================ */
bloque('9. La pantalla de la carga');

const pantalla = await T(async () => {
  const g = window.__T;
  g.dlgImportar('clientes');
  await new Promise(r => setTimeout(r, 300));
  const txt = document.getElementById('dlg-form').innerText;
  const boton = document.querySelector('[data-act="imp-cargar"]');
  const inicial = { texto: txt, desactivado: boton.disabled,
                    plantilla: !!document.querySelector('[data-act="imp-plantilla"]'),
                    fichero: !!document.querySelector('[data-act="imp-fichero"]') };

  // Se simula el fichero ya leído y se pinta la vista previa
  g.IMPORTE.tipo = 'clientes';
  g.IMPORTE.nombre = 'clientes-de-prueba.xlsx';
  g.IMPORTE.actualizar = true;
  g.IMPORTE.crearClientes = false;
  g.IMPORTE.filas = [['Nombre','NIF'],['Uno Nuevo SL','B1'],['',''],['Comunidad Las Flores','H11223344']];
  g.IMPORTE.analisis = g.analizarImportacion('clientes', g.IMPORTE.filas, {});
  g.pintarPreviaImporta();
  await new Promise(r => setTimeout(r, 150));
  const previa = { texto: document.getElementById('dlg-form').innerText,
                   desactivado: document.querySelector('[data-act="imp-cargar"]').disabled,
                   filas: document.querySelectorAll('#imp-previa tbody tr').length };

  // Y un fichero al que le falta la columna obligatoria
  g.IMPORTE.filas = [['NIF','Teléfono'],['B1','600']];
  g.IMPORTE.analisis = g.analizarImportacion('clientes', g.IMPORTE.filas, {});
  g.pintarPreviaImporta();
  await new Promise(r => setTimeout(r, 150));
  const falta = { texto: document.getElementById('dlg-form').innerText,
                  desactivado: document.querySelector('[data-act="imp-cargar"]').disabled };
  g.cerrarDlg();
  return { inicial, previa, falta };
});
paso('al abrirla no se puede cargar todavía: no hay fichero',
  pantalla.inicial.desactivado === true);
paso('ofrece bajar la plantilla y elegir el fichero',
  pantalla.inicial.plantilla && pantalla.inicial.fichero);
paso('dice que acepta Excel y CSV',
  /\.xlsx/.test(pantalla.inicial.texto) && /CSV/.test(pantalla.inicial.texto));
paso('y avisa de que no se guarda nada hasta ver la vista previa',
  /no se guarda nada/i.test(pantalla.inicial.texto));
paso('con el fichero leído, la vista previa cuenta altas, cambios y errores',
  /se dan de alta/.test(pantalla.previa.texto) && /no se pueden cargar/.test(pantalla.previa.texto),
  pantalla.previa.texto.split('\n').find(x => /se dan de alta/.test(x)) || '');
paso('enseña el nombre del fichero que se está cargando',
  /clientes-de-prueba\.xlsx/.test(pantalla.previa.texto));
paso('y una fila por cada línea del fichero',
  pantalla.previa.filas === 3, pantalla.previa.filas);
paso('ya se puede cargar', pantalla.previa.desactivado === false);
paso('si falta la columna obligatoria, lo dice y NO deja cargar',
  pantalla.falta.desactivado === true && /Falta la columna/.test(pantalla.falta.texto),
  pantalla.falta.texto.split('\n').find(x => /Falta/.test(x)) || '');

/* ================================================================
   10. Es cosa de oficina
   ================================================================ */
bloque('10. El técnico no carga ficheros desde la furgoneta');

const permisos = await T(async () => {
  const g = window.__T;
  const rol = g.S.perfil.rol;
  const mira = () => {
    g.S.tab = 'clientes'; g.S.ficha = null; g.S.fichaCliente = null; g.pintar();
    return new Promise(r => setTimeout(() => {
      const cli = !!document.querySelector('#vista [data-act="importar"][data-tipo="clientes"]');
      g.S.tab = 'puertas'; g.pintar();
      setTimeout(() => {
        r({ cli, pu: !!document.querySelector('#vista [data-act="importar"][data-tipo="puertas"]') });
      }, 200);
    }, 200));
  };
  const comoAdmin = await mira();
  g.S.perfil.rol = 'tecnico';
  const comoTecnico = await mira();
  g.S.perfil.rol = 'oficina';
  const comoOficina = await mira();
  g.S.perfil.rol = rol; g.pintar();
  return { comoAdmin, comoTecnico, comoOficina };
});
paso('el administrador ve el botón en clientes y en puertas',
  permisos.comoAdmin.cli && permisos.comoAdmin.pu, JSON.stringify(permisos.comoAdmin));
paso('la oficina también',
  permisos.comoOficina.cli && permisos.comoOficina.pu, JSON.stringify(permisos.comoOficina));
paso('el técnico no lo ve en ninguna de las dos',
  !permisos.comoTecnico.cli && !permisos.comoTecnico.pu, JSON.stringify(permisos.comoTecnico));

/* ================================================================
   Final
   ================================================================ */
console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
