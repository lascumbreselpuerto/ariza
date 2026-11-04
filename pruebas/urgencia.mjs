/* ================================================================
   urgencia.mjs — el recargo según cuándo se hace.     04-11-2026

   POR QUÉ EXISTE
   David, 04-11-2026: «Para una urgencia en horario laboral el precio
   hora y el desplazamiento sería por dos. Si hay que realizarla
   fuera del horario, en un horario nocturno o en fin de semana,
   sería tanto hora como desplazamiento por tres.»

   Esto multiplica por dos o por tres una factura, así que lo que se
   prueba aquí no es que «funcione»: es que el número que sale sea
   el que toca y que se sepa POR QUÉ. Cada caso se monta con una
   hora de llegada concreta y se comprueba el factor y el motivo.

   Lo que más se vigila:
     · el límite exacto de la franja (a las 18:00 ya es fuera);
     · el fin de semana y los festivos;
     · que sin hora de llegada sellada la aplicación diga que NO
       está segura, en vez de dar un número con aplomo;
     · que si no hay festivos cargados, se avise, porque un festivo
       que falte se cobra como un martes cualquiera.
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
    db.tarifas = [{ id:1, precio_hora:45, coste_hora:22, minimo_horas:1,
                    desplazamiento_fijo:30, precio_km:0.45, coste_km:0.2,
                    recargo_material:40, recargo_urgencia:50, iva:21,
                    ruta1_nombre:'El Puerto', ruta1_importe:30, ruta1_coste:10,
                    ruta2_nombre:'Jerez', ruta2_importe:45, ruta2_coste:15,
                    urgencia_x_laboral:2, urgencia_x_fuera:3,
                    urgencia_desde:8, urgencia_hasta:18 }];
    /* Dos festivos de 2026 para probar: uno entre semana (el 8 de diciembre,
       que en 2026 cae en martes) y la Nochebuena, que no es festivo nacional
       pero puede serlo para ellos. */
    db.ajustes.push({ clave:'festivos', valor:['2026-12-08','2026-12-25'] });
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
   1. Qué factor le toca a cada hora
   ================================================================
   Las fechas van con hora local de Madrid a propósito: el fallo del
   reloj que ya nos mordió una vez venía de mezclar UTC con local.
   2026-11-04 es miércoles; 2026-11-07, sábado; 2026-11-08, domingo;
   2026-12-08, martes y festivo.
   ================================================================ */
bloque('1. Cada hora, su factor');

const casos = await T(() => {
  const g = window.__T;
  const f = (fechaHora) => {
    const r = g.factorUrgencia({ tipo:'urgencia', hora_inicio: new Date(fechaHora).toISOString() });
    return { factor: r.factor, motivo: r.motivo, seguro: r.seguro };
  };
  return {
    media:    f('2026-11-04T11:30:00'),   // miércoles a media mañana
    justoIni: f('2026-11-04T08:00:00'),   // justo cuando empieza
    antes:    f('2026-11-04T07:59:00'),   // un minuto antes
    justoFin: f('2026-11-04T18:00:00'),   // justo cuando acaba: YA es fuera
    antesFin: f('2026-11-04T17:59:00'),
    noche:    f('2026-11-04T03:15:00'),
    sabado:   f('2026-11-07T10:00:00'),
    domingo:  f('2026-11-08T10:00:00'),
    festivo:  f('2026-12-08T10:00:00'),   // martes, pero festivo cargado
    noFestivo:f('2026-12-09T10:00:00'),   // miércoles normal
  };
});
paso('miércoles a las 11:30 es horario laboral: ×2',
  casos.media.factor === 2, casos.media.motivo);
paso('a las 8:00 en punto ya cuenta como laboral', casos.justoIni.factor === 2);
paso('a las 7:59 todavía no: ×3', casos.antes.factor === 3, casos.antes.motivo);
paso('a las 18:00 en punto YA es fuera de horario: ×3', casos.justoFin.factor === 3,
  casos.justoFin.motivo);
paso('a las 17:59 todavía es laboral: ×2', casos.antesFin.factor === 2);
paso('de madrugada, ×3', casos.noche.factor === 3, casos.noche.motivo);
paso('sábado, ×3 aunque sea a las diez de la mañana',
  casos.sabado.factor === 3 && /sábado/.test(casos.sabado.motivo), casos.sabado.motivo);
paso('domingo, ×3', casos.domingo.factor === 3 && /domingo/.test(casos.domingo.motivo));
paso('un martes FESTIVO, ×3, y dice que es festivo',
  casos.festivo.factor === 3 && /festivo/.test(casos.festivo.motivo), casos.festivo.motivo);
paso('y el miércoles siguiente, que no lo es, ×2', casos.noFestivo.factor === 2);
paso('todos estos son seguros: salen de una hora de llegada sellada',
  [casos.media, casos.sabado, casos.festivo].every(x => x.seguro === true));

/* ================================================================
   2. Sin hora de llegada, no se finge saber
   ================================================================ */
bloque('2. Sin hora sellada, se dice que no se sabe');

const sinHora = await T(() => {
  const g = window.__T;
  return {
    laborable: g.factorUrgencia({ tipo:'urgencia', fecha_prevista:'2026-11-04' }),
    sabado:    g.factorUrgencia({ tipo:'urgencia', fecha_prevista:'2026-11-07' }),
    festivo:   g.factorUrgencia({ tipo:'urgencia', fecha_prevista:'2026-12-08' }),
    nada:      g.factorUrgencia({ tipo:'urgencia' }),
    noEsUrgencia: g.factorUrgencia({ tipo:'averia', hora_inicio:'2026-11-08T03:00:00Z' }),
  };
});
paso('con la fecha prevista en día laborable propone ×2, pero NO se declara seguro',
  sinHora.laborable.factor === 2 && sinHora.laborable.seguro === false,
  sinHora.laborable.motivo);
paso('y avisa de que si se fue de noche hay que corregirlo',
  /si se fue de noche/.test(sinHora.laborable.motivo));
paso('si la fecha prevista cae en sábado, ×3, pero tampoco es seguro',
  sinHora.sabado.factor === 3 && sinHora.sabado.seguro === false, sinHora.sabado.motivo);
paso('y si es festivo, igual', sinHora.festivo.factor === 3 && sinHora.festivo.seguro === false);
paso('sin nada de nada, propone el de laboral y lo dice',
  sinHora.nada.factor === 2 && sinHora.nada.seguro === false, sinHora.nada.motivo);
paso('y lo que no es una urgencia no tiene factor: null',
  sinHora.noEsUrgencia === null);

/* ================================================================
   3. Los festivos
   ================================================================ */
bloque('3. Los festivos');

const fest = await T(async () => {
  const g = window.__T;
  const antes = g.festivos();
  const falta2027 = g.faltanFestivos(2027);
  const falta2026 = g.faltanFestivos(2026);
  /* Se añade uno desde el panel, como lo haría la oficina */
  g.S.tab = 'equipo'; g.pintar();
  await new Promise(r => setTimeout(r, 900));
  const panel = document.getElementById('vista').innerText;
  document.getElementById('fest-pega').value = '2027-01-01, 2027-01-06  2027-02-28';
  document.querySelector('[data-act="fest-pegar"]').click();
  await new Promise(r => setTimeout(r, 1500));
  const despues = g.festivos();
  return { antes, despues, falta2026, falta2027,
           ahora2027: g.faltanFestivos(2027),
           aviso: /No hay ningún festivo de/.test(panel),
           esFestivo: g.esFestivo('2026-12-08'), noEs: g.esFestivo('2026-12-09') };
});
paso('los dos festivos de prueba están cargados', fest.antes.length === 2, fest.antes.join(' · '));
paso('esFestivo acierta y no se pasa',
  fest.esFestivo === true && fest.noEs === false);
paso('2026 tiene festivos y 2027 no', fest.falta2026 === false && fest.falta2027 === true);
paso('pegando tres de una vez, entran los tres',
  fest.despues.length === 5, fest.despues.join(' · '));
paso('y ya no falta 2027', fest.ahora2027 === false);

const malas = await T(async () => {
  const g = window.__T;
  const antes = g.festivos().length;
  document.getElementById('fest-pega').value = '2027-02-31, 31/12/2027, mañana';
  document.querySelector('[data-act="fest-pegar"]').click();
  await new Promise(r => setTimeout(r, 1200));
  const trasBasura = g.festivos().length;
  /* Y uno repetido no se duplica */
  document.getElementById('fest-pega').value = '2027-01-01';
  document.querySelector('[data-act="fest-pegar"]').click();
  await new Promise(r => setTimeout(r, 1200));
  return { antes, trasBasura, trasRepetido: g.festivos().length,
           aviso: (document.getElementById('toast') || {}).textContent || '' };
});
paso('una fecha que no existe (31 de febrero) no entra',
  malas.trasBasura === malas.antes, malas.antes+' → '+malas.trasBasura);
paso('ni lo que no es una fecha', malas.trasBasura === malas.antes);
paso('y un festivo repetido no se duplica',
  malas.trasRepetido === malas.antes && /ya estaban/i.test(malas.aviso), malas.aviso);

/* ================================================================
   4. En el parte
   ================================================================ */
bloque('4. Lo que ve el técnico al cerrar');

const parte = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  /* Una urgencia con llegada sellada un sábado por la mañana */
  await g.sb.from('avisos').insert({ id:'ur-sabado', tipo:'urgencia', estado:'en_curso',
    prioridad:'urgente', tecnico_id:'usuario-admin', cliente_id:cli.id,
    puerta_id:g.S.puertas[0].id, hora_inicio:new Date('2026-11-07T10:00:00').toISOString(),
    creado:new Date().toISOString() });
  await g.cargar();
  g.dlgCierre('ur-sabado');
  await new Promise(r => setTimeout(r, 1000));
  const sel = document.getElementById('z-urg');
  const texto = document.getElementById('dlg-form').innerText;
  const comoAdmin = sel ? sel.tagName : 'no hay';
  const valor = sel ? sel.value : '';
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 200));
  /* Y lo mismo visto por un técnico: lo ve, no lo toca */
  const rol = g.S.perfil.rol;
  g.S.perfil.rol = 'tecnico';
  g.dlgCierre('ur-sabado');
  await new Promise(r => setTimeout(r, 1000));
  const sel2 = document.getElementById('z-urg');
  const texto2 = document.getElementById('dlg-form').innerText;
  g.cerrarDlg();
  g.S.perfil.rol = rol;
  return { comoAdmin, valor, texto, comoTecnico: sel2 ? sel2.tagName : 'no hay', texto2 };
});
paso('en una urgencia el parte enseña el recargo', /Recargo de urgencia/.test(parte.texto));
paso('propone ×3 porque llegó en sábado, y lo dice',
  parte.valor === '3' && /sábado/.test(parte.texto), (parte.texto.match(/Puesto solo:[^.]*/)||[''])[0]);
paso('la oficina lo puede cambiar', parte.comoAdmin === 'SELECT');
paso('el técnico lo ve pero no lo toca',
  parte.comoTecnico === 'INPUT' && /Lo cambia la oficina/.test(parte.texto2),
  parte.comoTecnico);

const noUrg = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  await g.sb.from('avisos').insert({ id:'ur-normal', tipo:'averia', estado:'asignado',
    prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:cli.id,
    puerta_id:g.S.puertas[0].id, creado:new Date().toISOString() });
  await g.cargar();
  g.dlgCierre('ur-normal');
  await new Promise(r => setTimeout(r, 900));
  const hay = !!document.getElementById('z-urg');
  const texto = document.getElementById('dlg-form').innerText;
  g.cerrarDlg();
  return { hay, texto };
});
paso('en una visita normal no sale nada de recargo',
  noUrg.hay === false && !/Recargo de urgencia/.test(noUrg.texto));

/* ================================================================
   5. Lo que se guarda al cerrar
   ================================================================ */
bloque('5. Lo que queda guardado');

const guardado = await T(async () => {
  const g = window.__T;
  g.dlgCierre('ur-sabado');
  await new Promise(r => setTimeout(r, 1000));
  document.getElementById('z-trab').value = 'Abierta y puesta en seguridad';
  document.getElementById('z-horas').value = '2';
  document.querySelector('#dlg-form [data-act="guardar-avance"]').click();
  await new Promise(r => setTimeout(r, 1800));
  const av = g.S.avisos.find(x => x.id === 'ur-sabado');
  g.cerrarDlg();
  return { factor: av.urgencia_factor, llegada: av.hora_inicio };
});
paso('al guardar, el factor queda escrito en la visita',
  Number(guardado.factor) === 3, guardado.factor);
/* ---- El fallo que destapó esta suite (04-11-2026) ----
   El campo de la hora de entrada se reconstruía con el DÍA DEL CIERRE, así que
   una urgencia del sábado cerrada el lunes se quedaba fechada en lunes y pasaba
   de ×3 a ×2 sola. Daba igual mientras la hora solo servía para contar horas;
   desde hoy cuesta dinero. Esta comprobación es la que lo vigila. */
paso('y la hora de llegada sellada NO se pisa con el día del cierre',
  String(guardado.llegada).slice(0, 10) === '2026-11-07',
  String(guardado.llegada).slice(0, 10));

const aMano = await T(async () => {
  const g = window.__T;
  g.dlgCierre('ur-sabado');
  await new Promise(r => setTimeout(r, 1000));
  /* La oficina lo baja a ×2 a mano */
  const sel = document.getElementById('z-urg');
  sel.value = '2';
  document.querySelector('#dlg-form [data-act="guardar-avance"]').click();
  await new Promise(r => setTimeout(r, 1800));
  const av = g.S.avisos.find(x => x.id === 'ur-sabado');
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 200));
  /* Y al volver a abrir, manda lo que se puso a mano, no la propuesta */
  g.dlgCierre('ur-sabado');
  await new Promise(r => setTimeout(r, 1000));
  const texto = document.getElementById('dlg-form').innerText;
  const v = document.getElementById('z-urg').value;
  g.cerrarDlg();
  return { factor: av.urgencia_factor, v, texto };
});
paso('si la oficina lo cambia a mano, se guarda lo que ella diga',
  Number(aMano.factor) === 2, aMano.factor);
paso('y al volver a abrir el parte sigue puesto el suyo', aMano.v === '2');
paso('diciendo que lo pusieron a mano y qué propondría la aplicación',
  /Puesto a mano/.test(aMano.texto) && /propondría ×3/.test(aMano.texto),
  (aMano.texto.match(/Puesto a mano[^.]*/)||[''])[0]);

/* ================================================================
   6. Sin el SQL, nada se rompe
   ================================================================ */
bloque('6. Sin urgencia.sql');

const sinSql = await T(async () => {
  const g = window.__T;
  g.S.sinUrgencia = true;
  g.dlgCierre('ur-sabado');
  await new Promise(r => setTimeout(r, 900));
  const hay = !!document.getElementById('z-urg');
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 200));
  g.S.tab = 'equipo'; g.pintar();
  await new Promise(r => setTimeout(r, 800));
  const panel = /Días festivos/.test(document.getElementById('vista').innerText);
  g.S.sinUrgencia = false;
  return { hay, panel };
});
paso('sin la columna, el parte no enseña el recargo', sinSql.hay === false);
paso('ni Equipo enseña el panel de festivos', sinSql.panel === false);

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
