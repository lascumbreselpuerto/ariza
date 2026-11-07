/* ================================================================
   subtipos.mjs — cada asistencia con su subtipo.      04-11-2026

   POR QUÉ EXISTE
   David, 04-11-2026: «Al crear aviso deberíamos diferenciar cada
   tipo de avisos en función de su forma y contenido.» Correctiva
   pasa a contener avería y garantía; instalación pasa a contener
   puerta completa (automática, manual o peatonal), automatismo y
   normativa y adecuación.

   LO QUE MÁS IMPORTA VIGILAR
   Garantía era un TIPO y pasa a ser un SUBTIPO, y es el único sitio
   donde una visita se pone a cero euros. Hay dos maneras de hacerlo
   mal y las dos cuestan dinero:
     · facturar una garantía nueva, porque la regla solo mira el tipo;
     · facturar una garantía vieja, porque la regla solo mira el
       subtipo y el histórico no lo tiene.
   Las dos están probadas aquí, una en cada dirección, igual que en
   el banco de SQL. La regla vive en dos sitios (la aplicación y el
   servidor) y las dos tienen que decir lo mismo.

   Y una decisión de David que esta suite fija: el histórico NO se
   toca. Las asistencias cerradas como tipo «garantía» o tipo
   «normativa» se quedan como están y se siguen leyendo igual.
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
    const cli = db.puertas[0].cliente_id;
    const ayer = new Date(Date.now() - 86400000).toISOString();
    /* El histórico: una garantía y una normativa de las de antes, con su tipo
       viejo y sin subtipo, que es exactamente lo que hay en la base de David. */
    db.avisos.push(
      { id:'st-gar-vieja', tipo:'garantia', estado:'cerrado', prioridad:'normal',
        cliente_id:cli, puerta_id:db.puertas[0].id, horas:2, cerrado:ayer, creado:ayer },
      { id:'st-norm-vieja', tipo:'normativa', estado:'cerrado', prioridad:'normal',
        cliente_id:cli, puerta_id:db.puertas[0].id, horas:2, cerrado:ayer, creado:ayer },
      /* Y las nuevas, con subtipo */
      { id:'st-gar-nueva', tipo:'averia', subtipo:'garantia', estado:'cerrado', prioridad:'normal',
        cliente_id:cli, puerta_id:db.puertas[0].id, horas:2, cerrado:ayer, creado:ayer },
      { id:'st-averia', tipo:'averia', subtipo:'averia', estado:'asignado', prioridad:'normal',
        tecnico_id:'usuario-admin', cliente_id:cli, puerta_id:db.puertas[0].id,
        creado:new Date().toISOString() });
    /* La garantía cerrada necesita su valoración para poder abrirla: en cero,
       que es justo lo que vale una garantía. */
    db.valoraciones.push({ aviso_id:'st-gar-nueva', imp_mano_obra:0, imp_desplazamiento:0,
      imp_materiales:0, imp_total:0, coste_total:44, margen:-44, facturado:false });
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
   1. El catálogo
   ================================================================ */
bloque('1. El catálogo de subtipos');

const cat = await T(() => {
  const g = window.__T;
  return {
    averia: g.subtiposDe('averia').map(x => x[0]),
    instalacion: g.subtiposDe('instalacion').map(x => x[0]),
    mantenimiento: g.subtiposDe('mantenimiento'),
    viejos: g.ASIST_VIEJOS,
    nombre: g.nombreSubtipo('averia', 'garantia'),
    nombreInst: g.nombreSubtipo('instalacion', 'automatismo'),
    nombreVacio: g.nombreSubtipo('averia', ''),
    /* Un subtipo que no es de ese tipo no se traduce: se devuelve tal cual, en
       vez de inventarse un nombre bonito que esconda el error. */
    nombreCruzado: g.nombreSubtipo('instalacion', 'garantia'),
  };
});
/* ---- Las dos listas crecieron el 06-11-2026 ----
   Antes se comprobaba la lista EXACTA, y esto salió en rojo al añadir los cuatro
   trabajos que no son una puerta entera (periféricos, sustitución de motor,
   sustitución de central y otros), que David pidió en los DOS tipos. El cambio
   es deliberado, así que se cambia la comprobación y se deja escrito por qué.

   Lo que se vigila ahora es lo que de verdad importa: que lo de siempre siga
   estando Y EN SU ORDEN. Si al añadir los nuevos se hubiera perdido «garantía»,
   las visitas de garantía dejarían de poder crearse y se facturarían como
   averías: eso es dinero. Los cuatro nuevos tienen su propia suite entera en
   perifericos.mjs. */
paso('la correctiva sigue empezando por avería y garantía',
  cat.averia.slice(0, 2).join(',') === 'averia,garantia', cat.averia.join(' · '));
paso('la instalación sigue teniendo sus cinco de siempre, en orden',
  cat.instalacion.slice(0, 5).join(',') ===
    'puerta_automatica,puerta_manual,puerta_peatonal,automatismo,normativa',
  cat.instalacion.join(' · '));
paso('y los cuatro trabajos nuevos están en los dos tipos (06-11-2026)',
  ['perifericos','sust_motor','sust_central','otros']
    .every(k => cat.averia.includes(k) && cat.instalacion.includes(k)));
paso('la preventiva no tiene subtipos todavía', cat.mantenimiento.length === 0);
paso('garantía y normativa quedan como tipos viejos',
  cat.viejos.join(',') === 'garantia,normativa', cat.viejos.join(' · '));
paso('cada subtipo tiene su nombre de persona',
  cat.nombre === 'Garantía' && /Automatismo/.test(cat.nombreInst),
  cat.nombre+' · '+cat.nombreInst);
paso('sin subtipo no se inventa nada', cat.nombreVacio === '');
paso('un subtipo que no es de ese tipo no se maquilla',
  cat.nombreCruzado === 'garantia', cat.nombreCruzado);

/* ================================================================
   2. LA REGLA DEL DINERO
   ================================================================ */
bloque('2. La garantía no se factura, venga como venga');

const cero = await T(() => {
  const g = window.__T;
  const de = id => g.S.avisos.find(x => x.id === id);
  return {
    garNueva: g.seValoraEnCero(de('st-gar-nueva')),
    garVieja: g.seValoraEnCero(de('st-gar-vieja')),
    normVieja: g.seValoraEnCero(de('st-norm-vieja')),
    averia: g.seValoraEnCero(de('st-averia')),
    comercial: g.seValoraEnCero({ tipo:'comercial' }),
    sinCargo: g.seValoraEnCero({ tipo:'averia', subtipo:'averia', sin_cargo:true }),
    esGarNueva: g.esGarantia(de('st-gar-nueva')),
    esGarVieja: g.esGarantia(de('st-gar-vieja')),
    esGarAveria: g.esGarantia(de('st-averia')),
  };
});
paso('una garantía NUEVA (por subtipo) se valora en cero', cero.garNueva === true);
paso('una garantía VIEJA (por tipo) sigue valorándose en cero', cero.garVieja === true);
paso('una avería normal NO se valora en cero', cero.averia === false);
paso('una normativa de las antiguas tampoco: esa se cobra', cero.normVieja === false);
paso('la comercial y lo marcado «no se cobra» siguen igual',
  cero.comercial === true && cero.sinCargo === true);
paso('y esGarantia reconoce las dos formas, y solo esas',
  cero.esGarNueva === true && cero.esGarVieja === true && cero.esGarAveria === false);

/* ================================================================
   3. Lo que se ve en pantalla
   ================================================================ */
bloque('3. El subtipo se ve donde se ve el tipo');

const pantalla = await T(() => {
  const g = window.__T;
  const de = id => g.S.avisos.find(x => x.id === id);
  return {
    conSub: g.tipoAsis(de('st-gar-nueva')),
    sinSub: g.tipoAsis(de('st-averia')),
    vieja: g.tipoAsis(de('st-gar-vieja')),
    /* Se le puede pasar el tipo suelto: hay sitios que solo tienen eso */
    cadena: g.tipoAsis('averia'),
    tarjeta: g.tarjetaTrabajo(de('st-averia')),
  };
});
paso('con subtipo, se dice: «Correctiva (avería) · Garantía»',
  /Correctiva/.test(pantalla.conSub) && /Garantía/.test(pantalla.conSub), pantalla.conSub);
paso('con subtipo «avería» también se dice, que no es lo mismo que nada',
  /Avería/.test(pantalla.sinSub), pantalla.sinSub);
paso('una garantía vieja sigue diciendo que es garantía', /Garantía/.test(pantalla.vieja),
  pantalla.vieja);
paso('pasándole solo el tipo, devuelve el tipo y ya', pantalla.cadena === 'Correctiva (avería)',
  pantalla.cadena);
paso('la tarjeta del técnico lo lleva', /Avería/.test(pantalla.tarjeta));

const papeles = await T(async () => {
  const g = window.__T;
  g.dlgValoracion('st-gar-nueva');
  await new Promise(r => setTimeout(r, 600));
  const val = document.getElementById('dlg-form').innerText;
  g.cerrarDlg();
  return { val };
});
paso('la valoración también lo dice', /Garantía/.test(papeles.val),
  (papeles.val.match(/Correctiva[^\n]*/) || ['no sale'])[0]);

/* ================================================================
   4. El alta
   ================================================================ */
bloque('4. El alta de asistencia');

const alta = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null);
  await new Promise(r => setTimeout(r, 900));
  const tipo = document.getElementById('a-tipo');
  const ofrecidos = [...tipo.options].map(o => o.value);
  const sub = document.getElementById('a-sub');
  const cajaSub = document.getElementById('a-caja-sub');
  const cajaTp = document.getElementById('a-caja-tp');
  const r = { ofrecidos,
    subEnAveria: [...sub.options].map(o => o.value),
    visibleEnAveria: !cajaSub.hidden,
    tpEnAveria: !cajaTp.hidden,
    pista: (document.getElementById('a-tipopista') || {}).textContent || '' };
  /* Se cambia a instalación: el subtipo tiene que cambiar entero */
  tipo.value = 'instalacion';
  tipo.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r2 => setTimeout(r2, 250));
  r.subEnInstalacion = [...document.getElementById('a-sub').options].map(o => o.value);
  r.pistaInst = (document.getElementById('a-tipopista') || {}).textContent || '';
  /* Automatismo pide los tipos de puerta */
  document.getElementById('a-sub').value = 'automatismo';
  document.getElementById('a-sub').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r2 => setTimeout(r2, 250));
  r.tpEnAutomatismo = !document.getElementById('a-caja-tp').hidden;
  r.pistaSub = (document.getElementById('a-subpista') || {}).textContent || '';
  /* Y puerta completa no los pide: ahí la puerta se da de alta entera */
  document.getElementById('a-sub').value = 'puerta_automatica';
  document.getElementById('a-sub').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r2 => setTimeout(r2, 250));
  r.tpEnPuertaCompleta = !document.getElementById('a-caja-tp').hidden;
  /* Puesta en servicio: ni subtipo ni tipos de puerta, pero sí su explicación */
  tipo.value = 'puesta_servicio';
  tipo.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r2 => setTimeout(r2, 250));
  r.subEnPuesta = !document.getElementById('a-caja-sub').hidden;
  r.pistaPuesta = (document.getElementById('a-tipopista') || {}).textContent || '';
  g.cerrarDlg();
  return r;
});
paso('garantía y normativa YA NO se ofrecen como tipo',
  !alta.ofrecidos.includes('garantia') && !alta.ofrecidos.includes('normativa'),
  alta.ofrecidos.join(' · '));
/* Las dos listas crecieron el 06-11-2026 con los cuatro trabajos que no son una
   puerta entera, así que ya no se compara la lista entera (ver el motivo escrito
   arriba, en el bloque 1). Lo que se comprueba es que el desplegable sigue
   empezando por el hueco vacío y por lo de siempre, y que al cambiar el tipo se
   repinta ENTERO: si no se repintara, «garantía» seguiría ofreciéndose dentro de
   una instalación y se guardaría un subtipo imposible. */
paso('en una correctiva el subtipo sale, con avería y garantía delante',
  alta.visibleEnAveria === true && alta.subEnAveria.slice(0, 3).join(',') === ',averia,garantia',
  alta.subEnAveria.join(' · '));
paso('y no pide tipos de puerta: para eso está la ficha', alta.tpEnAveria === false);
paso('al cambiar a instalación, el subtipo cambia entero',
  alta.subEnInstalacion.slice(0, 6).join(',') ===
    ',puerta_automatica,puerta_manual,puerta_peatonal,automatismo,normativa' &&
  !alta.subEnInstalacion.includes('garantia'),
  alta.subEnInstalacion.join(' · '));
paso('el automatismo SÍ pide sobre qué tipos de puerta', alta.tpEnAutomatismo === true);
paso('y una puerta completa no, porque la puerta se da de alta entera',
  alta.tpEnPuertaCompleta === false);
paso('puesta en servicio no tiene subtipo', alta.subEnPuesta === false);
paso('cada tipo explica para qué es, en el propio alta',
  /lo que se ha roto/i.test(alta.pista) && /Montaje nuevo/.test(alta.pistaInst),
  alta.pista.slice(0, 50));
paso('y la puesta en servicio lleva su definición, la que dio David',
  /no se pudo terminar por causas de la obra/.test(alta.pistaPuesta), alta.pistaPuesta);
paso('el subtipo garantía avisa de que no se factura',
  /NO se factura/.test(alta.pistaSub) === false, 'en automatismo no toca');

const avisoGar = await T(async () => {
  const g = window.__T;
  g.dlgAviso(null);
  await new Promise(r => setTimeout(r, 900));
  document.getElementById('a-sub').value = 'garantia';
  document.getElementById('a-sub').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 250));
  const pista = (document.getElementById('a-subpista') || {}).textContent || '';
  g.cerrarDlg();
  return { pista };
});
paso('al elegir garantía se avisa ahí mismo de que no se factura',
  /NO se factura/.test(avisoGar.pista), avisoGar.pista.slice(0, 60));

/* ================================================================
   5. Lo que se guarda
   ================================================================ */
bloque('5. Lo que se guarda');

const guardado = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  g.dlgAviso(null, null, cli.id);
  await new Promise(r => setTimeout(r, 900));
  document.getElementById('a-tipo').value = 'instalacion';
  document.getElementById('a-tipo').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 250));
  document.getElementById('a-sub').value = 'automatismo';
  document.getElementById('a-sub').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 250));
  const cajas = [...document.querySelectorAll('#a-tp .a-tp-c')];
  cajas[0].checked = true;
  cajas[4].checked = true;
  document.getElementById('a-desc').value = 'Automatizar la corredera del patio';
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 1800));
  const nuevo = g.S.avisos.filter(x => x.descripcion === 'Automatizar la corredera del patio')[0];
  return nuevo
    ? { tipo:nuevo.tipo, subtipo:nuevo.subtipo, tipos:nuevo.tipos_puerta }
    : { nada:true };
});
paso('se guarda el tipo y el subtipo',
  guardado.tipo === 'instalacion' && guardado.subtipo === 'automatismo',
  guardado.tipo+' · '+guardado.subtipo);
paso('y los tipos de puerta marcados, como lista',
  Array.isArray(guardado.tipos) && guardado.tipos.length === 2,
  (guardado.tipos || []).join(' · '));

const cruzado = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  /* Se elige garantía y luego se cambia el tipo a instalación: la garantía NO
     puede quedarse pegada, porque esa asistencia dejaría de facturarse. */
  g.dlgAviso(null, null, cli.id);
  await new Promise(r => setTimeout(r, 900));
  document.getElementById('a-sub').value = 'garantia';
  document.getElementById('a-sub').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 200));
  document.getElementById('a-tipo').value = 'instalacion';
  document.getElementById('a-tipo').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 250));
  const enPantalla = document.getElementById('a-sub').value;
  document.getElementById('a-desc').value = 'La que cambia de tipo';
  document.querySelector('#dlg-form button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 1800));
  const nuevo = g.S.avisos.filter(x => x.descripcion === 'La que cambia de tipo')[0];
  return { enPantalla, subtipo: nuevo ? nuevo.subtipo : 'no se guardó',
           cero: nuevo ? g.seValoraEnCero(nuevo) : null };
});
paso('al cambiar el tipo, un subtipo que no es suyo se cae de la pantalla',
  cruzado.enPantalla === '', JSON.stringify(cruzado.enPantalla));
paso('y NO se guarda: una instalación no puede quedarse con la garantía pegada',
  !cruzado.subtipo, JSON.stringify(cruzado.subtipo));
paso('así que esa instalación se factura, que es lo que toca', cruzado.cero === false);

/* ================================================================
   6. Sin el SQL ejecutado, nada se rompe
   ================================================================ */
bloque('6. Sin subtipo.sql, la aplicación sigue como antes');

const sinSql = await T(async () => {
  const g = window.__T;
  g.S.sinSubtipo = true;
  g.dlgAviso(null);
  await new Promise(r => setTimeout(r, 800));
  const hay = !!document.getElementById('a-sub');
  const tipos = !!document.getElementById('a-caja-tp');
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 200));
  g.S.sinSubtipo = false;
  return { hay, tipos };
});
paso('sin la columna, el alta no enseña el subtipo', sinSql.hay === false);
paso('ni los tipos de puerta', sinSql.tipos === false);

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
