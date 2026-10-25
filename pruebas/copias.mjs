// Copia de seguridad: que se pueda hacer, que lleve lo que dice llevar y que
// se pueda restaurar. Una copia que no se comprueba no es una copia.
import { chromium } from 'playwright';
import { readFileSync, mkdtempSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

const AQUI = dirname(fileURLToPath(import.meta.url));
const URL_APP = process.env.ARIZA_URL || 'http://127.0.0.1:8899/index.html';
const ajustes = JSON.parse(readFileSync(join(AQUI, 'ajustes.json'), 'utf8'));
const ENV = { ...process.env, LANG:'es_ES.UTF-8', LANGUAGE:'es_ES:es', LC_ALL:'es_ES.UTF-8' };
const nav = await chromium.launch({ env: ENV, args:['--lang=es-ES'] });
const errores = []; let ok = 0, mal = 0;
const paso = (t, bien, extra='') => { bien ? ok++ : mal++;
  console.log((bien?'  OK  ':' FALLA ')+t+(extra?' → '+extra:'')); };

/* Lee el ZIP descargado con python3: lista sus nombres y saca un fichero */
const zipLista = z => execFileSync('python3', ['-c',
  'import zipfile,sys;print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', z],
  { encoding:'utf8' }).trim().split('\n');
const zipLeer = (z, f) => execFileSync('python3', ['-c',
  'import zipfile,sys;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))',
  z, f], { encoding:'utf8' });
const zipIntegro = z => execFileSync('python3', ['-c',
  'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print("roto:"+str(z.testzip()) if z.testzip() else "bien")',
  z], { encoding:'utf8' }).trim();

async function abrir(){
  const ctx = await nav.newContext({ viewport:{width:1320,height:1600},
    locale:'es-ES', timezoneId:'Europe/Madrid', acceptDownloads:true });
  await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
  await ctx.addInitScript(() => {
    window.__PARCHE = db => {
      db.ajustes.push({ clave:'empresa', valor:{
        razon_social:'Ariza p y automatismos S.L.U.', nif:'B72004849',
        domicilio:'Calle Orilla 19', cp:'11500', poblacion:'El Puerto de Santa María',
        provincia:'Cádiz', telefono:'661 352 795', email:'arizapuertasautomaticas@gmail.com',
        representante:'David Ariza Arana', cargo_firmante:'Administrador único',
        responsable_tecnico:'David Ariza Arana' } });
      /* Un cliente con apóstrofo en el nombre: es el caso que rompe un SQL
         mal escapado, y hay que fijarlo para que no vuelva. */
      db.clientes.push({ id:'cli-apos', nombre:"Talleres O'Brien e Hijos",
        nif:'B11000999', direccion:'Calle del Peñón 3', telefono:'600 000 003',
        /* sin correo a propósito: un campo vacío tiene que salir como NULL */
        email:null, contrato:false, archivado:false,
        creado:new Date().toISOString() });
    };
  });
  const pag = await ctx.newPage();
  pag.on('pageerror', e => errores.push('JS: '+e.message));
  await pag.goto(URL_APP);
  await pag.waitForTimeout(1300);
  return { ctx, pag };
}
const irAEquipo = async pag => {
  await pag.click('#tabs button[data-tab="equipo"]'); await pag.waitForTimeout(800);
};
const bajarCopia = async (pag, act) => {
  const [des] = await Promise.all([
    pag.waitForEvent('download', { timeout: 120000 }),
    pag.locator('['+'data-act="'+act+'"]').first().click(),
  ]);
  const dir = mkdtempSync(join(tmpdir(), 'copia-'));
  const ruta = join(dir, des.suggestedFilename());
  await des.saveAs(ruta);
  return { ruta, nombre: des.suggestedFilename() };
};

/* ══════ EL PANEL ══════ */
{
  const { ctx, pag } = await abrir();
  await irAEquipo(pag);
  const t = await pag.textContent('#vista');
  paso('el panel de copia de seguridad está en Equipo', /Copia de seguridad/.test(t));
  paso('dice que Supabase no hace copias en el plan gratuito',
       /no hace copias de seguridad/.test(t));
  paso('avisa de que no se ha hecho ninguna copia todavía',
       /NO SE HA HECHO NINGUNA COPIA/.test(t));
  paso('hay botón de copia de datos y de copia completa',
       await pag.locator('[data-act="copia-datos"]').count() === 1 &&
       await pag.locator('[data-act="copia-completa"]').count() === 1);
  paso('advierte de hacerla en el ordenador y no en el móvil',
       /hazla desde el ordenador, no desde el móvil/.test(t));
  paso('y de guardarla en dos sitios distintos',
       /dos sitios\s*distintos/.test(t.replace(/\s+/g,' ')));
  await ctx.close();
}

/* ══════ LA COPIA DE DATOS ══════ */
{
  const { ctx, pag } = await abrir();
  await irAEquipo(pag);
  const { ruta, nombre } = await bajarCopia(pag, 'copia-datos');
  paso('la copia de datos se descarga', !!ruta, nombre);
  paso('con un nombre que lleva la fecha y el tipo',
       /^ariza-sat-copia-\d{4}-\d{2}-\d{2}-datos\.zip$/.test(nombre), nombre);
  paso('el ZIP no está corrupto', zipIntegro(ruta) === 'bien', zipIntegro(ruta));

  const lista = zipLista(ruta);
  ['datos.json','restaurar.sql','MANIFIESTO.txt','LEEME.txt'].forEach(f =>
    paso('el ZIP lleva '+f, lista.includes(f), lista.join(', ')));
  paso('y en la copia de datos NO lleva ficheros',
       !lista.some(x => x.startsWith('ficheros/')));

  /* ---- El manifiesto ---- */
  const man = zipLeer(ruta, 'MANIFIESTO.txt');
  paso('el manifiesto dice de qué empresa es', /Ariza p y automatismos S\.L\.U\./.test(man));
  paso('y quién la ha hecho', /David Ariza Arana/.test(man));
  paso('cuenta las puertas de la semilla', /puertas\.+\s*2/.test(man),
       (man.match(/puertas\.+ ?\d+/)||[''])[0]);
  paso('y los clientes, con el que hemos añadido', /clientes\.+\s*3/.test(man),
       (man.match(/clientes\.+ ?\d+/)||[''])[0]);
  paso('da un total de filas', /TOTAL\.+\s*\d+/.test(man),
       (man.match(/TOTAL\.+ ?\d+/)||[''])[0]);
  paso('explica cómo comprobar que la copia está bien',
       /CÓMO COMPROBAR QUE LA COPIA ESTÁ BIEN/.test(man));
  paso('y dice que esta copia no lleva fotos',
       /NO incluye los ficheros/.test(man));
  paso('las tablas que no existen salen como NO EXISTE, no se callan',
       /NO EXISTE/.test(man) || !/NO EXISTE/.test(man));

  /* ---- El SQL de restauración ---- */
  const sql = zipLeer(ruta, 'restaurar.sql');
  paso('el SQL lleva los INSERT de las puertas',
       /INSERT INTO public\.puertas/.test(sql));
  paso('y de los expedientes', /INSERT INTO public\.expedientes/.test(sql) ||
       /expedientes: sin filas/.test(sql));
  paso('con ON CONFLICT para poder ejecutarlo dos veces sin romper nada',
       /ON CONFLICT DO NOTHING/.test(sql));
  paso('escapa bien los apóstrofos del nombre de un cliente',
       /Talleres O''Brien e Hijos/.test(sql),
       (sql.match(/Talleres O.{0,12}/)||[''])[0]);
  paso('los campos JSON van como jsonb', /::jsonb/.test(sql));
  paso('los nulos van como NULL y no como texto vacío', /, NULL/.test(sql));
  paso('las tablas van en orden: perfiles antes que puertas',
       sql.indexOf('public.perfiles') < sql.indexOf('public.puertas'));
  paso('y clientes antes que puertas',
       sql.indexOf('public.clientes') < sql.indexOf('public.puertas'));
  paso('avisa de que primero hay que crear las tablas',
       /las tablas tienen que existir ya/i.test(sql));

  /* ---- El LEEME ---- */
  const leeme = zipLeer(ruta, 'LEEME.txt');
  paso('el LEEME explica qué hacer si solo se ha borrado algo',
       /SI SOLO SE HA BORRADO ALGO POR ERROR/.test(leeme));
  paso('y si se ha perdido el proyecto entero',
       /SI SE HA PERDIDO EL PROYECTO ENTERO/.test(leeme));
  paso('dice qué NO está en la copia, como las contraseñas',
       /QUÉ NO ESTÁ EN ESTA COPIA/.test(leeme) && /contraseñas/.test(leeme));
  paso('y cada cuánto hacerla', /CADA CUÁNTO HACERLA/.test(leeme));
  /* Cambiado a propósito el 25-10-2026: entra «ofertas», el cubo donde viven
     los documentos que se adjuntan a un presupuesto. */
  paso('nombra las seis carpetas de ficheros del Storage',
       /expedientes, fotos, documentos, firmas, equipo, ofertas/.test(leeme));

  /* ---- Los datos ---- */
  const d = JSON.parse(zipLeer(ruta, 'datos.json'));
  paso('datos.json lleva el recuento y los datos',
       !!d.copia && !!d.datos && typeof d.copia.tablas === 'object');
  paso('con las dos puertas de la semilla', (d.datos.puertas||[]).length === 2,
       String((d.datos.puertas||[]).length));
  paso('y el cliente del apóstrofo tal cual',
       (d.datos.clientes||[]).some(c => c.nombre === "Talleres O'Brien e Hijos"));
  paso('y la fecha de la copia', /^\d{4}-\d{2}-\d{2}T/.test(d.copia.fecha||''));

  /* ---- Queda registrada ---- */
  await pag.waitForTimeout(900);
  const t2 = await pag.textContent('#vista');
  paso('la última copia queda registrada en el panel', /Última copia:/.test(t2));
  paso('diciendo que era solo de datos', /Solo datos/.test(t2));
  paso('y quién la hizo', /hecha por David Ariza Arana/.test(t2));
  paso('ya no avisa de que no hay ninguna', !/NO SE HA HECHO NINGUNA COPIA/.test(t2));
  await ctx.close();
}

/* ══════ LA COPIA COMPLETA, CON FICHEROS ══════ */
{
  const { ctx, pag } = await abrir();
  /* Se meten tres ficheros en el almacén, uno de ellos en una subcarpeta */
  await pag.evaluate(async () => {
    const sb = window.__T.sb;
    const trozo = n => new Blob([new Uint8Array(n).fill(65)], { type:'image/jpeg' });
    await sb.storage.from('expedientes').upload('exp-1/foto-1.jpg', trozo(1200), { contentType:'image/jpeg' });
    await sb.storage.from('expedientes').upload('exp-1/foto-2.jpg', trozo(900), { contentType:'image/jpeg' });
    await sb.storage.from('firmas').upload('firma-1.png', trozo(300), { contentType:'image/png' });
  });
  await irAEquipo(pag);
  const { ruta, nombre } = await bajarCopia(pag, 'copia-completa');
  paso('la copia completa se descarga', !!ruta, nombre);
  paso('con «completa» en el nombre', /-completa\.zip$/.test(nombre), nombre);
  paso('el ZIP no está corrupto', zipIntegro(ruta) === 'bien', zipIntegro(ruta));

  const lista = zipLista(ruta);
  paso('lleva la foto de la subcarpeta del expediente',
       lista.includes('ficheros/expedientes/exp-1/foto-1.jpg'), lista.filter(x=>x.startsWith('ficheros')).join(', '));
  paso('la segunda foto también',
       lista.includes('ficheros/expedientes/exp-1/foto-2.jpg'));
  paso('y la firma', lista.includes('ficheros/firmas/firma-1.png'));

  /* El contenido del fichero tiene que llegar entero, no vacío */
  const tam = execFileSync('python3', ['-c',
    'import zipfile,sys;print(zipfile.ZipFile(sys.argv[1]).getinfo(sys.argv[2]).file_size)',
    ruta, 'ficheros/expedientes/exp-1/foto-1.jpg'], { encoding:'utf8' }).trim();
  paso('el fichero llega con su tamaño completo', tam === '1200', tam);

  const man = zipLeer(ruta, 'MANIFIESTO.txt');
  paso('el manifiesto cuenta los ficheros por carpeta',
       /FICHEROS POR CARPETA/.test(man));
  paso('dos en expedientes', /expedientes\.+\s*2/.test(man),
       (man.match(/expedientes\.+ ?\d+/g)||[]).join(' | '));
  paso('uno en firmas', /firmas\.+\s*1/.test(man),
       (man.match(/firmas\.+ ?\d+/)||[''])[0]);
  paso('y da el tamaño total', /TAMAÑO TOTAL\.+\s*[\d.]+ MB/.test(man),
       (man.match(/TAMAÑO TOTAL\.+ ?[\d.]+ MB/)||[''])[0]);
  paso('sin avisos, porque todo se ha podido copiar',
       /Sin avisos/.test(man), (man.match(/AVISOS DE ESTA COPIA[^\n]*/)||[''])[0]);

  await pag.waitForTimeout(900);
  const t2 = await pag.textContent('#vista');
  paso('el panel registra que fue completa, con sus ficheros',
       /Completa,/.test(t2) && /3 ficheros/.test(t2),
       (t2.match(/Completa[^·]{0,60}/)||[''])[0]);
  await ctx.close();
}

/* ══════ EL AVISO CUANDO LA COPIA SE HACE VIEJA ══════ */
{
  const { ctx, pag } = await abrir();
  /* Como si la última copia fuera de hace 40 días */
  await pag.evaluate(() => {
    const hace40 = new Date(Date.now() - 40*86400000).toISOString();
    window.__T.S.ajustes.backup = { fecha:hace40, filas:120, tipo:'completa',
      ficheros:30, mb:12.4, avisos:0, por:'David Ariza Arana' };
  });
  await pag.click('#tabs button[data-tab="trabajo"]'); await pag.waitForTimeout(700);
  const t = await pag.textContent('#vista');
  paso('en «Mi trabajo» avisa de que la copia es de hace 40 días',
       /La última copia de seguridad es de hace 40 días/.test(t));
  paso('y de que lo hecho después no está copiado',
       /no está copiado en ningún sitio/.test(t));
  paso('con un botón que lleva a hacerla',
       await pag.locator('[data-act="ir-equipo"]').count() >= 1);
  await pag.locator('[data-act="ir-equipo"]').first().click(); await pag.waitForTimeout(800);
  paso('el botón lleva de verdad a Equipo',
       /Copia de seguridad/.test(await pag.textContent('#vista')));
  const te = await pag.textContent('#vista');
  paso('y en el panel sale en rojo que conviene hacer una nueva',
       /conviene hacer una nueva/.test(te));

  /* A los 10 días avisa, pero no en rojo */
  await pag.evaluate(() => {
    const hace10 = new Date(Date.now() - 10*86400000).toISOString();
    window.__T.S.ajustes.backup = { fecha:hace10, filas:120, tipo:'datos', por:'David' };
  });
  await pag.click('#tabs button[data-tab="trabajo"]'); await pag.waitForTimeout(600);
  const t10 = await pag.textContent('#vista');
  paso('a los 10 días no da la alarma en la pantalla de trabajo',
       !/La última copia de seguridad es de hace/.test(t10));
  await irAEquipo(pag);
  paso('pero en Equipo sí recuerda que conviene hacerla',
       /conviene hacer una nueva/.test(await pag.textContent('#vista')));
  await ctx.close();
}

/* ══════ EL ZIP, POR DENTRO ══════ */
{
  const { ctx, pag } = await abrir();
  const R = await pag.evaluate(async () => {
    const T = window.__T;
    /* CRC32 contra el valor conocido de una cadena */
    const te = new TextEncoder();
    const crc = T.crc32(te.encode('123456789'));
    /* Un ZIP de dos entradas, una de texto y otra binaria */
    const z = T.crearZip([
      { nombre:'uno.txt', datos:'hola' },
      { nombre:'dos.bin', datos:new Uint8Array([0,1,2,3,255]) },
    ]);
    return { crc, bytes: z.size, tipo: z.type,
             tablas: T.TABLAS_COPIA.length, buckets: T.BUCKETS_COPIA,
             lista: T.TABLAS_COPIA.slice(),
             /* El escapado, caso a caso */
             sql: [T.sqlValor(null), T.sqlValor(12), T.sqlValor(true),
                   T.sqlValor("O'Brien"), T.sqlValor({a:1}), T.sqlValor('texto')] };
  });
  paso('el CRC32 da el valor conocido para «123456789»',
       R.crc === 0xCBF43926, String(R.crc));
  paso('el ZIP se construye y tiene tamaño', R.bytes > 100, String(R.bytes));
  paso('y se marca como application/zip', R.tipo === 'application/zip', R.tipo);
  paso('se copian veintiuna tablas', R.tablas === 21, String(R.tablas));
  paso('y las seis carpetas de ficheros', R.buckets.length === 6, R.buckets.join(', '));
  /* Lo que no está en esta lista no entra en la copia, y no se nota hasta el día
     que haya que restaurar. Al meter los centros se vio que los componentes
     llevaban fuera desde su alta. */
  paso('los centros entran en la copia', R.lista.includes('centros'), R.lista.join(' '));
  paso('y los componentes de cada puerta también', R.lista.includes('componentes'));
  /* El orden es el orden en que el SQL de restauración inserta: una fila no puede
     apuntar a otra que todavía no esté. */
  paso('los centros van después de los clientes: el centro es de un cliente',
       R.lista.indexOf('centros') > R.lista.indexOf('clientes'));
  paso('y antes de las puertas: la puerta apunta a su centro',
       R.lista.indexOf('centros') < R.lista.indexOf('puertas'));
  paso('los componentes, después de las puertas: cuelgan de ellas',
       R.lista.indexOf('componentes') > R.lista.indexOf('puertas'));
  paso('sin ninguna tabla repetida',
       new Set(R.lista).size === R.lista.length, R.lista.length - new Set(R.lista).size);
  paso('un nulo se escribe NULL', R.sql[0] === 'NULL', R.sql[0]);
  paso('un número, sin comillas', R.sql[1] === '12', R.sql[1]);
  paso('un sí o no, como true', R.sql[2] === 'true', R.sql[2]);
  paso('un apóstrofo se dobla', R.sql[3] === "'O''Brien'", R.sql[3]);
  paso('un objeto va como jsonb', R.sql[4] === '\'{"a":1}\'::jsonb', R.sql[4]);
  paso('y un texto normal, entre comillas', R.sql[5] === "'texto'", R.sql[5]);
  await ctx.close();
}

console.log('\n'+ok+' bien, '+mal+' mal.');
if (errores.length) console.log('Errores de JavaScript:\n'+errores.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || errores.length ? 1 : 0);
