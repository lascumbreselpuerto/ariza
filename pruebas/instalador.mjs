/* ================================================================
   instalador.mjs — Que el instalador monte TODO lo que la
                    aplicación necesita
                                                     17-11-2026

   DE DÓNDE SALE
   El instalador del 14-11-2026 estaba incompleto y nadie se enteró.
   Juntaba los 41 ficheros de servidor/, que son los que el proyecto
   guarda desde que guarda sus SQL, y daba por hecho el esquema
   original, que se creó antes y no estaba en ningún fichero.
   Faltaban 18 tablas y 15 funciones. Reventaba en la línea 172.

   Y lo peor no fue el fallo: fue que lo di por probado. Lo había
   ejecutado contra el andamio del banco, que crea a mano esas
   tablas que faltaban. Así que pasaba, y no demostraba nada.

   QUÉ VIGILA ESTA SUITE
   Una sola cosa, que es la que falló: que no haya NINGUNA tabla,
   vista, función o almacén de ficheros que la aplicación use y que
   el instalador no cree.

   No mira si el SQL es bonito. Mira si falta algo. El banco de SQL
   (sql.sh) es el que lo ejecuta contra un Postgres de verdad; esto
   es el inventario, y es instantáneo.
   ================================================================ */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

let ok = 0, mal = 0;
const paso = (t, bien, detalle) => {
  if (bien){ ok++; console.log('  OK  '+t+(detalle!==undefined?' → '+detalle:'')); }
  else { mal++; console.log(' FALLA '+t+(detalle!==undefined?' → '+detalle:'')); }
};
const bloque = t => console.log('\n· '+t);

/* ---- Lo que hay que leer ---- */
const RUTA_APP  = join(RAIZ, 'index.html');
const RUTA_INST = join(RAIZ, 'servidor', 'instalar-ariza-sat.sql');

bloque('0. Los dos ficheros están donde tienen que estar');
paso('la aplicación', existsSync(RUTA_APP), RUTA_APP);
paso('el instalador', existsSync(RUTA_INST), RUTA_INST);
if (!existsSync(RUTA_APP) || !existsSync(RUTA_INST)){
  console.log('\n'+ok+' bien, '+(mal+1)+' mal.');
  console.log('Sin los dos ficheros no se puede comprobar nada.');
  process.exit(1);
}

const APP  = readFileSync(RUTA_APP, 'utf8');
const INST = readFileSync(RUTA_INST, 'utf8');

/* ---- Lo que la aplicación le pide a la base ----
   Se saca del código, no de una lista escrita a mano: una lista a mano se
   queda vieja el día que alguien añade una tabla y no se acuerda. */
/* Ojo con las banderas: la primera versión de esto reconstruía la expresión
   con 'g' a secas y se dejaba la 'm' por el camino, así que los patrones
   anclados con ^ no encontraban nada y la suite daba por ausente TODO lo que
   el instalador crea. Un vigilante que no ve nada dice que falta todo, que es
   la otra manera de no servir. (17-11-2026) */
const unicos = (txt, re, i) => {
  const s = new Set(); let m;
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  while ((m = r.exec(txt))) s.add(m[i]);
  return [...s].sort();
};
const tablasApp  = unicos(APP, /sb\.from\('([a-z_]+)'\)/, 1);
const rpcApp     = unicos(APP, /\.rpc\('([a-z_]+)'/, 1);
const almacenApp = unicos(APP, /storage\.from\('([a-z_]+)'\)/, 1);

/* ---- Lo que el instalador crea ---- */
const tablasInst  = unicos(INST, /^create table if not exists public\.([a-z_]+)/m, 1);
const vistasInst  = unicos(INST, /^create or replace view public\.([a-z_]+)/m, 1);
const funcInst    = unicos(INST, /^CREATE OR REPLACE FUNCTION public\.([a-z_]+)/m, 1);
const almacenInst = unicos(INST, /^\s*\('([a-z_]+)',\s*'[a-z_]+',\s*(?:true|false)\)/m, 1);
const deLaBase    = new Set([...tablasInst, ...vistasInst]);

/* ================================================================
   1. Ni una tabla ni una vista de menos
   ================================================================ */
bloque('1. Las tablas y vistas que la aplicación lee o escribe');
paso('la aplicación usa unas cuantas', tablasApp.length > 30, tablasApp.length+' en total');
paso('el instalador crea tablas', tablasInst.length > 30, tablasInst.length+' tablas');
paso('y vistas', vistasInst.length > 10, vistasInst.length+' vistas');

const faltanTablas = tablasApp.filter(t => !deLaBase.has(t));
paso('NO falta ninguna', faltanTablas.length === 0,
  faltanTablas.length ? faltanTablas.join(', ') : 'las '+tablasApp.length+' están');

/* Y al revés, que es otra clase de aviso: algo que se monta y nadie usa.
   No es un fallo, pero conviene saberlo, así que se cuenta sin suspender. */
const sinUsar = [...deLaBase].filter(t => !tablasApp.includes(t));
console.log('  ·   el instalador monta '+sinUsar.length+' tablas o vistas que la aplicación '+
  'no nombra. Normal: las lee otra vista, o son de un SQL y no de la pantalla.');

/* ================================================================
   2. Ni una función de menos
   ================================================================
   Esta es la mitad del fallo que no vi: conté las tablas que faltaban y de
   las funciones no dije nada. Eran quince.
   ================================================================ */
bloque('2. Las funciones que la aplicación llama por su nombre');
paso('la aplicación llama a varias', rpcApp.length > 10, rpcApp.length+' en total');
paso('el instalador crea funciones', funcInst.length > 30, funcInst.length+' funciones');

const faltanRpc = rpcApp.filter(f => !funcInst.includes(f));
paso('NO falta ninguna', faltanRpc.length === 0,
  faltanRpc.length ? faltanRpc.join(', ') : 'las '+rpcApp.length+' están');

/* Las que deciden quién ve los precios. Si estas faltan, la base funciona y
   enseña los márgenes a todo el mundo, que es peor que no funcionar. */
['es_equipo', 'es_gestion', 'es_admin'].forEach(f =>
  paso('está '+f+'(), que decide quién ve qué', funcInst.includes(f)));

/* ================================================================
   3. Los almacenes de ficheros
   ================================================================
   El otro agujero que apareció: la aplicación usa siete y el SQL creaba uno.
   No falla al instalar; falla semanas después, al subir la primera foto.
   ================================================================ */
bloque('3. Los almacenes de ficheros');
paso('el instalador crea siete', almacenInst.length === 7, almacenInst.join(', '));

const faltanAlmacenes = almacenApp.filter(b => !almacenInst.includes(b));
paso('y no falta ninguno de los que usa la aplicación', faltanAlmacenes.length === 0,
  faltanAlmacenes.length ? faltanAlmacenes.join(', ') : 'los '+almacenApp.length+' están');

/* Público es el que se abre con un enlace sin entrar en la aplicación. Solo
   deben serlo los dos que tiene que abrir el CLIENTE. Si un día alguien pone
   en público el de las firmas de los partes, esto salta. */
const publicos = (INST.match(/\('([a-z_]+)',\s*'[a-z_]+',\s*true\)/g) || [])
  .map(s => s.match(/\('([a-z_]+)'/)[1]).sort();
paso('solo son públicos «publicos» y «ofertas»',
  publicos.join(',') === 'ofertas,publicos', publicos.join(', ') || 'ninguno');
['fotos','documentos','expedientes','firmas','equipo'].forEach(b =>
  paso('«'+b+'» es privado', !publicos.includes(b)));

/* ================================================================
   4. Lo que el instalador NO debe llevar
   ================================================================ */
bloque('4. Lo que no debe llevar');

/* Datos. La base de pruebas se quiere vacía, y además el fichero se manda por
   ahí: no puede llevar clientes dentro. */
const inserts = (INST.match(/^insert into [a-z_.]+/gm) || []);
paso('solo tres órdenes de meter filas, y son las que son',
  inserts.length === 3, inserts.join(' · '));
paso('ninguna mete clientes, puertas ni avisos',
  !/^insert into public\.(clientes|puertas|avisos|presupuestos|contratos|expedientes)\b/m.test(INST));

/* Los avisos. En pruebas se quiere silencio: sin avisos_url ni avisos_secreto
   no sale ni un mensaje de Telegram ni un correo. */
paso('config_interna queda vacía, así que en pruebas no suena nada',
  /create table if not exists public\.config_interna/.test(INST) &&
  !/insert into public\.config_interna/.test(INST));

/* Las extensiones van como comentario. Un proyecto nuevo de Supabase ya trae
   las suyas y recrearlas desde aquí es buscarse líos. */
paso('no crea extensiones, solo las lista',
  !/^create extension/m.test(INST) && /-- extensión instalada:/.test(INST));

/* ================================================================
   5. La red de seguridad y la semilla
   ================================================================ */
bloque('5. La red de seguridad y la semilla');
paso('se para si la base ya tiene clientes',
  /raise exception[\s\S]{0,200}ya tiene/.test(INST));
paso('y dice cómo saltársela si hace falta de verdad',
  /comenta el bloque RED DE SEGURIDAD/.test(INST));
paso('siembra la fila de tarifas, sin la cual Gestión no pasa de la primera pantalla',
  /insert into public\.tarifas \(id\) values \(1\)/.test(INST));
paso('y la nave del almacén',
  /insert into public\.ubicaciones[\s\S]{0,120}'nave'/.test(INST));
paso('las dos se pueden ejecutar dos veces sin duplicar',
  /on conflict \(id\) do nothing/.test(INST) && /where not exists/.test(INST));

/* ================================================================
   6. Que se pueda lanzar dos veces
   ================================================================
   Un instalador que no se puede relanzar es un instalador que, cuando falla a
   mitad, deja la base en un sitio del que no se sale.
   ================================================================ */
bloque('6. Se puede lanzar dos veces');
paso('las tablas van con «if not exists»',
  !/^create table (?!if not exists)/m.test(INST));
paso('los índices también',
  !/^create (unique )?index (?!if not exists)/m.test(INST));
paso('las funciones van con «or replace»',
  !/^CREATE FUNCTION /m.test(INST));
paso('las vistas también',
  !/^create view /m.test(INST));
paso('las restricciones van con guardia, porque Postgres no tiene «if not exists»',
  (INST.match(/if not exists \(select 1 from pg_constraint/g) || []).length > 100);
paso('las políticas se tiran antes de crearlas',
  (INST.match(/^drop policy if exists/gm) || []).length >= 79);
paso('y los disparadores igual',
  (INST.match(/^drop trigger if exists/gm) || []).length >= 13);

/* ================================================================
   7. La aplicación de ensayo
   ================================================================
   La otra mitad del entorno de pruebas: la copia de la aplicación que vive en
   ensayo/ y que apunta a la base de pruebas.

   Lo que se vigila aquí es UNA cosa y es la única grave: que esa copia no
   apunte nunca a la base de producción. Dos aplicaciones iguales, una de ellas
   enseñando datos de clientes de verdad mientras tú crees que estás
   trasteando, es el peor fallo que puede tener este montaje.

   Que la copia esté en una versión anterior NO es un fallo: es normal, se
   regenera cuando hace falta. Se dice, pero no pone el banco en rojo.
   ================================================================ */
bloque('7. La aplicación de ensayo');

const RUTA_ENS = join(RAIZ, 'ensayo', 'index.html');
if (!existsSync(RUTA_ENS)){
  console.log('  ·   todavía no hay ensayo/index.html. Se monta con '+
    'python3 pruebas/montar-ensayo.py');
} else {
  const ENS = readFileSync(RUTA_ENS, 'utf8');
  const ref = t => (t.match(/https:\/\/([a-z]+)\.supabase\.co/) || [])[1] || '';
  const refApp = ref(APP), refEns = ref(ENS);

  paso('la aplicación buena apunta a una base', refApp.length > 10, refApp);
  paso('la de ensayo apunta a OTRA base', refEns.length > 10 && refEns !== refApp,
    refEns);
  paso('y en ningún sitio de la copia asoma la base de producción',
    refApp ? !ENS.includes(refApp) : false);
  paso('tampoco la clave de la base buena',
    !ENS.includes((APP.match(/const SUPA_KEY = '([^']+)'/) || [,''])[1]));
  paso('no lleva clave secreta dentro', !/sb_secret_|service_role_key/.test(ENS));

  /* Que se vea. Si alguien quita el aviso, esto salta. */
  paso('avisa por escrito de que es la de pruebas',
    ENS.includes('APLICACIÓN DE PRUEBAS'));
  paso('y lo lleva en la cabecera, que se ve siempre',
    ENS.includes('ens-eti') && ENS.includes('>PRUEBAS<'));

  /* Sin service worker: en ensayo interesa que cargue siempre lo último. */
  paso('no registra el service worker',
    !/serviceWorker\.register/.test(ENS));
  paso('y da de baja el que hubiera quedado',
    /getRegistrations\(\)[\s\S]{0,120}unregister/.test(ENS));
  paso('no se ofrece a instalarse como aplicación',
    !/rel="manifest"/.test(ENS));

  /* Vive un nivel más abajo, así que los manuales suben uno. */
  paso('los manuales apuntan un nivel arriba',
    ENS.includes("'../manuales/oficina.md'") && !ENS.includes("'./manuales/oficina.md'"));

  /* Y lo que no es un fallo, pero conviene saber */
  const ver = t => (t.match(/const ARIZA_VERSION = '([^']+)'/) || [,''])[1];
  const vApp = ver(APP), vEns = ver(ENS);
  if (vApp && vEns && vApp === vEns)
    paso('va por la misma versión que la aplicación buena', true, vEns);
  else
    console.log('  ·   la copia de ensayo va por la '+vEns+' y la buena por la '+vApp+
      '. No es un fallo: se regenera con python3 pruebas/montar-ensayo.py cuando '+
      'quieras probar la última.');
}

/* ================================================================
   Final
   ================================================================ */
console.log('\n'+ok+' bien, '+mal+' mal.');
if (mal) console.log('El instalador no monta todo lo que la aplicación necesita.');
process.exit(mal ? 1 : 0);
