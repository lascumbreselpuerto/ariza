/* ================================================================
   ayudas.mjs — qué hay que comprobar, cómo y hasta dónde.

   Por qué existe: lo pidió David el 14-10-2026 después de revisar la
   aplicación. Los puntos que citan una norma o que piden medir algo no
   decían QUÉ medir, CÓMO ni cuál era el límite, así que el técnico
   tenía que acordarse o tirar de apuntes. Y lo que se hace de memoria
   se acaba haciendo mal.

   La regla de la casa aquí es la de siempre, y es lo que más vigila
   esta suite: el MÉTODO se puede escribir porque es la forma de
   trabajar de la empresa; los LÍMITES no se inventan. Los de fuerza
   salen de la tabla de la empresa (y se dicen sin contrastar); los de
   distancia, velocidad y tiempo nacen vacíos y la aplicación dice que
   no están cargados en vez de poner un número cualquiera.

   Lo que fija:
     1. Que la ayuda sale SOLO donde David la pidió.
     2. Que el método está y es accionable.
     3. Que ningún límite está escrito a mano en el código.
     4. Que los límites de fuerza se leen de la tabla y la siguen.
     5. Que lo no cargado se dice, y que aun así se manda medir.
     6. Que la oficina puede escribir su propia ayuda y manda.
     7. Que sale en el chequeo del técnico y en la hoja de campo.
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
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    db.ajustes.push({ clave:'empresa', valor:{
      razon_social:'Ariza Puertas y Automatismos S.L.U.', nif:'B72004849',
      domicilio:'Calle Orilla 19', cp:'11500', poblacion:'El Puerto de Santa María',
      provincia:'Cádiz', telefono:'661 352 795', email:'arizapuertasautomaticas@gmail.com',
      representante:'David Ariza Arana', cargo_firmante:'Administrador único',
      responsable_tecnico:'David Ariza Arana' } });
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

/* ================================================================
   1. Dónde sale y dónde no
   ================================================================ */
bloque('1. La ayuda sale solo donde se pidió');

const alcance = await T(() => {
  const g = window.__T;
  const corr = g.guionDe('Corredera autoportante');
  const conNormaOMedida = corr.filter(x => x.t && (x.n || x.m === 'num'));
  const sinNada = corr.filter(x => x.t && !x.n && x.m !== 'num');
  return {
    conAyuda: conNormaOMedida.filter(x => g.lineasAyuda(x)).length,
    conNorma: conNormaOMedida.length,
    sueltosConAyuda: sinNada.filter(x => g.lineasAyuda(x)).map(x => x.t),
    cabecera: g.lineasAyuda({ h:'Seguridad (bloque crítico)' }),
  };
});
paso('los puntos que citan norma o piden medida llevan ayuda',
  alcance.conAyuda >= 12, alcance.conAyuda + ' de ' + alcance.conNorma);
paso('NO se llenan de ayudas los puntos corrientes: sería ruido',
  alcance.sueltosConAyuda.length <= 2, alcance.sueltosConAyuda.join(' | ') || 'ninguno');
paso('una cabecera de bloque no lleva ayuda', alcance.cabecera === null);

/* Las claves se escriben legibles, con comas y dos puntos, y se normalizan al
   vuelo. Una clave que no case con ningún punto real es una ayuda que no sale
   nunca y de la que nadie se entera: por eso se comprueban TODAS. */
const huerfanas = await T(() => {
  const g = window.__T;
  const puntos = new Set();
  g.TIPOS.concat(['Corredera','Enrollable','Peatonal automática'])
    .forEach(t => g.guionDe(t).forEach(x => { if (x.t) puntos.add(g.normTxt(x.t)); }));
  return Object.keys(g.AYUDA_PUNTO).filter(k => !puntos.has(g.normTxt(k)));
});
paso('NINGUNA ayuda escrita se queda huérfana: todas casan con un punto real',
  huerfanas.length === 0, huerfanas.join(' | ') || 'ninguna');

/* ================================================================
   2. El método: que sirva para hacerlo, no para adornar
   ================================================================ */
bloque('2. El método');

const met = await T(() => {
  const g = window.__T;
  const de = t => {
    const L = g.lineasAyuda({ t, m:'num' });
    return L ? Object.fromEntries(L) : null;
  };
  return {
    fd: de('Fuerza dinámica máxima medida'),
    consumo: de('Consumo del motor en marcha'),
    foto: de('Fotocélulas alineadas, limpias y con corte efectivo'),
    banda: de('Banda de seguridad responde y su autocontrol funciona'),
    desbl: de('Desbloqueo manual accesible, señalizado y operativo'),
    para: de('La puerta para e invierte ante un obstáculo en todo el recorrido'),
    paracaidas: de('Paracaídas o dispositivo anticaída: prueba de actuación'),
  };
});
paso('la fuerza dinámica dice con qué se mide y dónde se apoya',
  /dinamómetro calibrado/i.test(met.fd['Cómo']) && /canto principal de cierre/i.test(met.fd['Cómo']),
  met.fd['Cómo'].slice(0, 70));
paso('y cuántas veces se repite, que es donde se falla',
  /tres lecturas/i.test(met.fd['Cómo']));
paso('el consumo del motor dice el instrumento y contra qué se compara',
  /pinza amperim/i.test(met.consumo['Cómo']) && /placa/i.test(met.consumo['Cómo']));
paso('las fotocélulas: cortar el haz en los extremos y en el centro, no en un sitio',
  /extremos/i.test(met.foto['Cómo']) && /centro/i.test(met.foto['Cómo']));
paso('la banda: PROBAR EL AUTOCONTROL desconectándola, que es lo que nadie hace',
  /desconectarla/i.test(met.banda['Cómo']));
paso('el desbloqueo: quitar tensión y hacerlo de verdad, no mirar que está la llave',
  /quitar tensión/i.test(met.desbl['Cómo']) && /no solo mirar/i.test(met.desbl['Cómo']));
paso('la parada ante obstáculo: en tres alturas y en los dos sentidos',
  /media altura/i.test(met.para['Cómo']) && /dos sentidos/i.test(met.para['Cómo']));
paso('el paracaídas: si no se puede probar sin riesgo, NO se marca conforme',
  /nunca como conforme/i.test(met.paracaidas['Cómo']), met.paracaidas['Cómo'].slice(-60));

/* ================================================================
   3. Ningún límite escrito a mano
   ================================================================ */
bloque('3. Ningún número inventado');

const numeros = await T(() => {
  const g = window.__T;
  /* Un número con unidad dentro del texto de una ayuda sería un límite escrito a
     mano: justo lo que no se puede hacer con normas que no se han leído. */
  const sospechosas = [];
  Object.entries(g.AYUDA_PUNTO).forEach(([k, v]) => {
    const txt = (v.que || '') + ' ' + (v.como || '');
    const m = txt.match(/\d+[\s,.]*\d*\s*(mm|cm|m\/s|N\b|newton|segundos?|s\b|km\/h)/i);
    if (m) sospechosas.push(k + ': ' + m[0]);
  });
  return sospechosas;
});
paso('NINGUNA ayuda lleva un valor límite escrito en su texto',
  numeros.length === 0, numeros.join(' | ') || 'ninguna');

const obraVacia = await T(() => {
  const g = window.__T;
  return { campos: g.LIM_OBRA_CAMPOS.map(x => x[0]), cargados: Object.keys(g.limitesObra()) };
});
paso('los límites de obra nacen vacíos: no hay valores de fábrica',
  obraVacia.cargados.length === 0, obraVacia.cargados.join(',') || 'ninguno cargado');
paso('y están los campos que hacen falta para cargarlos',
  ['separacion_mm','velocidad_cierre_ms','fuerza_peatonal_n'].every(k => obraVacia.campos.includes(k)),
  obraVacia.campos.join(','));

/* ================================================================
   4. Los límites de fuerza salen de la tabla de la empresa
   ================================================================ */
bloque('4. Los límites de fuerza');

/* CAMBIO DE CRITERIO DEL 14-10-2026. Hasta ese día el límite dinámico salía de la
   tabla editable de la empresa y se presentaba como «sin contrastar». David aportó
   la EN 12453 leída de su ejemplar, así que ahora sale de la norma, con su
   apartado, y depende de la forma de moverse de la puerta. Lo que se comprueba
   aquí ya no es que siga a la tabla, sino que cite la norma y no se pueda cambiar
   a mano por accidente. */
const fuerza = await T(() => {
  const g = window.__T;
  const L = Object.fromEntries(g.lineasAyuda({ t:'Fuerza dinámica máxima medida', m:'num' }, 'corredera'));
  return { lim: L['Límite'] };
});
paso('el límite dinámico cita la norma y su apartado',
  /UNE-EN 12453/.test(fuerza.lim) && /A\.2\.1/.test(fuerza.lim), fuerza.lim.slice(-70));
paso('y NO se presenta como valor de la empresa sin contrastar',
  !/sin contrastar con la norma/.test(fuerza.lim));

const cambiado = await T(async () => {
  const g = window.__T;
  /* Tocar la tabla de Equipo ya no puede cambiar el límite dinámico: viene de la
     norma. Si alguien escribe ahí un 333, la guía del técnico tiene que seguir
     dando lo que dice la 12453, no el 333. */
  await g.sb.from('ajustes').upsert({ clave:'limites_fuerza',
    valor: Object.assign({}, g.limitesFuerza(), { fd_aplastamiento_n: 333 }) }, { onConflict:'clave' });
  g.S.ajustes.limites_fuerza = Object.assign({}, g.limitesFuerza(), { fd_aplastamiento_n: 333 });
  const L = Object.fromEntries(g.lineasAyuda({ t:'Fuerza dinámica máxima medida', m:'num' }, 'corredera'));
  return L['Límite'];
});
paso('un valor raro escrito en Equipo NO se cuela en el límite dinámico',
  !/333/.test(cambiado) && /400 N/.test(cambiado), cambiado.slice(0, 60));

/* ================================================================
   5. Lo que no está cargado se dice, y se mide igual
   ================================================================ */
bloque('5. Lo no cargado');

const sinCargar = await T(() => {
  const g = window.__T;
  return Object.fromEntries(g.lineasAyuda({ t:'Separación entre hoja y elementos fijos, o protección equivalente', m:'num' }));
});
paso('una distancia sin cargar dice que no está cargada',
  /no cargado/i.test(sinCargar['Límite']), sinCargar['Límite'].slice(0, 50));
paso('dice dónde se carga, para que se pueda arreglar',
  /Equipo → Límites de obra/.test(sinCargar['Límite']));
paso('Y MANDA MEDIR IGUALMENTE: el dato sirve aunque el límite no esté',
  /mide y anota el valor igualmente/i.test(sinCargar['Límite']));
paso('el método sí está desde el primer día',
  /calibre|galgas/i.test(sinCargar['Cómo']), sinCargar['Cómo'].slice(0, 60));

const cargado = await T(async () => {
  const g = window.__T;
  await g.sb.from('ajustes').upsert({ clave:'limites_obra', valor:{ separacion_mm: 25 } }, { onConflict:'clave' });
  g.S.ajustes.limites_obra = { separacion_mm: 25 };
  const L = Object.fromEntries(g.lineasAyuda({ t:'Separación entre hoja y elementos fijos, o protección equivalente', m:'num' }));
  return L['Límite'];
});
paso('en cuanto se carga, sale el valor y desaparece el aviso',
  /^25 mm/.test(cargado) && !/no cargado/.test(cargado), cargado);
paso('y NO lleva la coletilla de «sin contrastar»: lo ha puesto la empresa con la norma delante',
  !/sin contrastar/.test(cargado), cargado);

/* ================================================================
   6. La ayuda que escribe la oficina manda
   ================================================================ */
bloque('6. La ayuda propia de la oficina');

const propia = await T(() => {
  const g = window.__T;
  const L = g.lineasAyuda({ t:'Fuerza dinámica máxima medida', m:'num',
                            a:'En esta empresa se mide siempre con el Chauvin del furgón 2.' });
  return Object.fromEntries(L);
});
paso('si la oficina escribe su propia guía, es la que sale',
  /Chauvin del furgón 2/.test(propia['Cómo']), propia['Cómo']);
paso('y no se mezcla con la de fábrica',
  !/dinamómetro calibrado/i.test(propia['Cómo']));

/* ================================================================
   7. Dónde se ve: chequeo del técnico y hoja de campo
   ================================================================ */
bloque('7. Dónde se ve');

const enChequeo = await T(async () => {
  const g = window.__T, S = g.S;
  const p = S.puertas.find(x => x.codigo === 'AR-0001');
  await g.sb.from('puertas').update({ tipo:'Corredera autoportante' }).eq('id', p.id);
  await g.cargar();
  const html = g.bloqueGuion({ id:'a1' }, g.puertaDe(p.id));
  const div = document.createElement('div'); div.innerHTML = html;
  const det = Array.from(div.querySelectorAll('details.g-ayuda'));
  return { n: det.length, abiertas: det.filter(d => d.open).length,
           texto: div.textContent, resumen: (det[0]||{}).textContent || '' };
});
paso('el chequeo del técnico lleva la guía en sus puntos',
  enChequeo.n >= 10, enChequeo.n + ' puntos con guía');
paso('PLEGADA: el que ya lo sabe no la ve',
  enChequeo.abiertas === 0, enChequeo.abiertas + ' abiertas');
paso('se abre con un texto que se entiende', /Cómo se comprueba/.test(enChequeo.resumen));
paso('y dentro está el método', /dinamómetro calibrado/i.test(enChequeo.texto));
paso('dice que es guía de la empresa, no el texto de la norma',
  /No reproduce el texto de la norma/.test(enChequeo.texto));

const enHoja = await T(async () => {
  const g = window.__T, S = g.S;
  const p = g.S.puertas.find(x => x.codigo === 'AR-0001');
  const exp = { id:'xp-ayuda', puerta_id:p.id, familia:'industrial', estado:'borrador',
    referencia:'EXP-AYUDA', creado:new Date().toISOString(),
    datos:{ puerta:{ denominacion:'Corredera del portal', tipo:'Corredera autoportante',
                     modo:'impulso_sin_vista', usuarios:'no_informados' } } };
  S.expedientes.unshift(exp);
  let html = '';
  const abrir = window.open;
  window.open = () => ({ document:{ write:t => { html += t; }, close(){} } });
  try { g.hojaDeCampo(exp.id); } finally { window.open = abrir; }
  S.expedientes.shift();
  return html;
});
paso('la hoja de campo impresa lleva la tabla de cómo se comprueba',
  /Cómo se comprueba y hasta dónde/.test(enHoja));
paso('con el método dentro', /dinamómetro calibrado/i.test(enHoja));
paso('con la columna de límite', /<th[^>]*>Límite<\/th>/.test(enHoja));
paso('con el límite dinámico que le toca a esa puerta por su forma',
  /400 N con abertura/.test(enHoja), (enHoja.match(/400 N con abertura[^<]*/)||[''])[0].slice(0,60));
paso('y con los puntos de medida verificados de la 12453',
  /50 mm sobre el borde inferior/.test(enHoja) && /Aberturas de ensayo/.test(enHoja));
paso('y el número de lecturas por punto', /3 por cada punto/.test(enHoja));
paso('y diciendo que no reproduce ninguna norma',
  /No reproduce el texto de ninguna norma/.test(enHoja));

/* ================================================================
   8. Los límites de la UNE-EN 12453, ya verificados.

   El 14-10-2026 David leyó de su ejemplar los límites, sus apartados,
   los puntos de medida y las aberturas de ensayo. Lo que cambió no son
   los números, que ya coincidían, sino que ahora se sabe CUÁNDO se
   aplica cada uno. Lo que más vigila este bloque es el caso que la
   aplicación antes resolvía mal: una puerta de movimiento vertical
   lleva 400 N en todo el recorrido, no 1.400 N por encima de 500 mm.
   Dar 1.400 N ahí deja pasar una puerta que no debe pasar.
   ================================================================ */
bloque('8. Los límites de la UNE-EN 12453, verificados');

const v12453 = await T(() => {
  const g = window.__T, F = g.FUERZA_12453;
  return { norma:F.norma, apartados:F.apartados, validado:F.validado, verificado:F.verificado,
           td:F.td_s, trasTd:F.tras_td_n, residual:F.residual_n, tt:F.tt_s,
           horizontal: g.textoLimiteDinamico('corredera'),
           batiente:   g.textoLimiteDinamico('batiente'),
           vertical:   g.textoLimiteDinamico('seccional'),
           enrollable: g.textoLimiteDinamico('enrollable'),
           barrera:    g.textoLimiteDinamico('barrera'),
           plegable:   g.textoLimiteDinamico('plegable'),
           corta:      g.textoLimiteDinamico('cortafuegos') };
});
paso('la norma se cita con su edición', /EN 12453:2017\+A1:2021/.test(v12453.norma), v12453.norma);
paso('y con el apartado de cada valor', /A\.2\.1/.test(v12453.apartados) && /A\.2\.2/.test(v12453.apartados));
paso('queda marcada como validada, con su fecha',
  v12453.validado === true && v12453.verificado === '2026-10-14');
paso('Td 0,75 s, tras Td 150 N, residual 25 N y Tt 5 s',
  v12453.td === 0.75 && v12453.trasTd === 150 && v12453.residual === 25 && v12453.tt === 5,
  [v12453.td, v12453.trasTd, v12453.residual, v12453.tt].join(' / '));
paso('una corredera: 400 N de 50 a 500 mm y 1.400 N por encima',
  /400 N con abertura de 50 a 500 mm/.test(v12453.horizontal) &&
  /1400 N con abertura desde 500 mm/.test(v12453.horizontal), v12453.horizontal);
paso('una batiente, lo mismo, por girar sobre eje perpendicular al suelo',
  /400 N con abertura de 50 a 500/.test(v12453.batiente) && /1400 N/.test(v12453.batiente));
paso('UNA SECCIONAL LLEVA 400 N EN TODO EL RECORRIDO, no 1.400 por encima de 500 mm',
  /400 N con abertura desde 50 mm en adelante/.test(v12453.vertical) &&
  !/1400/.test(v12453.vertical), v12453.vertical);
paso('y una enrollable igual, que también es de movimiento vertical',
  !/1400/.test(v12453.enrollable), v12453.enrollable);
paso('una barrera: 400 N, sin tramo de 1.400',
  /400 N/.test(v12453.barrera) && !/1400/.test(v12453.barrera), v12453.barrera);
paso('una plegable se trata como corredera, y lo dice de las partes rígidas',
  /1400 N/.test(v12453.plegable) && /partes rígidas/.test(v12453.plegable));
paso('una cortafuegos no tiene eje determinado: se explican los casos en vez de elegir uno',
  /Depende de cómo se mueva la hoja/.test(v12453.corta), v12453.corta.slice(0, 50));

const puntos = await T(() => {
  const g = window.__T;
  const f = (forma, alto) => g.puntosFuerza(forma, alto);
  return { corr: f('corredera', 2200), corrAlta: f('corredera', 3200),
           bat: f('batiente', 2200), vert: f('seccional', 3000), vertBaja: f('seccional', 2400),
           barr: f('barrera', null), pleg: f('plegable', null), peat: f('peatonal', null) };
});
paso('una corredera normal se mide a 50 mm, en el centro y a 300 mm del borde superior',
  /50 mm sobre el borde inferior/.test(puntos.corr.puntos[0]) &&
  /300 mm bajo el borde superior/.test(puntos.corr.puntos[2]), puntos.corr.puntos.join(' | '));
paso('con aberturas de 50 y 500 mm, y 1.500 mm en el centro',
  /50 mm y 500 mm/.test(puntos.corr.aberturas) && /1\.500 mm en el punto central/.test(puntos.corr.aberturas));
paso('tres lecturas por punto', puntos.corr.lecturas === 3);
paso('UNA CORREDERA DE MÁS DE 2.800 mm se mide sobre el suelo, no sobre la hoja',
  /1\.500 mm sobre el suelo/.test(puntos.corrAlta.puntos[1]) &&
  /2\.500 mm sobre el suelo/.test(puntos.corrAlta.puntos[2]), puntos.corrAlta.puntos.join(' | '));
paso('y la aplicación dice por qué cambian los puntos',
  /más de 2\.800 mm/.test(puntos.corrAlta.porAltura), puntos.corrAlta.porAltura);
paso('una batiente lleva además la abertura de 1.500 mm',
  /1\.500 mm/.test(puntos.bat.aberturas), puntos.bat.aberturas);
paso('una de movimiento vertical se mide a 200 mm de cada lateral y en el centro',
  puntos.vert.puntos.length === 3 && /200 mm del lateral/.test(puntos.vert.puntos[0]),
  puntos.vert.puntos.join(' | '));
paso('con aberturas de 50, 300 y 2.500 mm', /50 mm, 300 mm y 2\.500 mm/.test(puntos.vert.aberturas));
paso('CON HUECO MENOR DE 2.800 mm cambia la tercera abertura',
  /300 mm por debajo de la apertura completa/.test(puntos.vertBaja.aberturas),
  puntos.vertBaja.aberturas);
paso('una barrera se mide a 200 mm del extremo de la barra',
  /200 mm del extremo de la barra/.test(puntos.barr.puntos[0]));
paso('y con el aviso de comprobar en 300 mm si el hueco baja de ahí',
  /baja de 300 mm/.test(puntos.barr.aberturas));
paso('una plegable dice que se trata como corredera y como batiente',
  /corredera/.test(puntos.pleg.nota) && /batiente/.test(puntos.pleg.nota));
paso('una peatonal no recibe puntos de la 12453: no es su norma',
  puntos.peat === null);

const perfiles = await T(() => {
  const g = window.__T;
  const p = f => { const x = g.PERFILES_FUERZA[f]; return { v:x.validado, ap:x.apartado }; };
  return { ind:p('industrial'), bar:p('barrera'), cf:p('cortafuegos'), pea:p('peatonal') };
});
paso('el perfil industrial deja de estar sin validar',
  perfiles.ind.v === true && /A\.2\.1/.test(perfiles.ind.ap), perfiles.ind.ap);
paso('el de barreras también', perfiles.bar.v === true);
paso('y el de cortafuegos, para su funcionamiento ordinario', perfiles.cf.v === true);
paso('EL DE PEATONALES SIGUE SIN VALIDAR: lo aportado es la 12453, no la 16005',
  perfiles.pea.v === false && /pendiente/.test(perfiles.pea.ap), perfiles.pea.ap);

const manual = await T(() => {
  const g = window.__T;
  const L = Object.fromEntries(g.lineasAyuda(
    { t:'Desbloqueo manual accesible, señalizado y operativo' }, 'corredera'));
  return { texto: g.textoFuerzaManual(), limite: L['Límite'], apartado: g.FUERZA_MANUAL.apartado };
});
paso('la fuerza de maniobra manual está cargada, con sus dos casos',
  /Garaje en área privada: 150 N/.test(manual.texto) && /225 N/.test(manual.texto), manual.texto.slice(0,70));
paso('y el caso industrial, por persona',
  /260 N/.test(manual.texto) && /390 N/.test(manual.texto) && /por persona/.test(manual.texto));
paso('le llega al técnico en el punto del desbloqueo manual',
  /150 N/.test(manual.limite || ''), (manual.limite||'').slice(0, 60));
paso('y queda anotado que falta el apartado del que sale, en vez de inventarlo',
  /pendiente de anotar/.test(manual.apartado), manual.apartado);

const enGuia = await T(() => {
  const g = window.__T;
  const L = Object.fromEntries(g.lineasAyuda({ t:'Fuerza dinámica máxima medida', m:'num' }, 'seccional'));
  const L2 = Object.fromEntries(g.lineasAyuda({ t:'Fuerza dinámica máxima medida', m:'num' }, 'corredera'));
  return { secc: L['Límite'], corr: L2['Límite'] };
});
paso('LA GUÍA DEL TÉCNICO DA UN LÍMITE DISTINTO SEGÚN LA PUERTA que tiene delante',
  enGuia.secc !== enGuia.corr, 'seccional: '+enGuia.secc.slice(0,40));
paso('y la de una seccional no le ofrece los 1.400 N', !/1400/.test(enGuia.secc));
paso('citando la norma y el apartado, no «valor de la empresa»',
  /UNE-EN 12453/.test(enGuia.secc) && !/sin contrastar/.test(enGuia.secc), enGuia.secc.slice(-60));

/* ================================================================
   9. EL VEREDICTO. Lo más importante de todo este cambio.

   Antes del 14-10-2026 la aplicación preguntaba al técnico «¿puede
   aplastar o no?» y de ahí sacaba 400 o 1.400 N. Ese no es el criterio
   de la norma, y el error iba en la dirección mala: una seccional
   marcada «sin riesgo de aplastamiento» recibía 1.400 N, cuando a una
   puerta de movimiento vertical le tocan 400 en todo el recorrido. Una
   puerta que mide 900 N pasaba el ensayo y se firmaba como conforme.

   Y hay una segunda trampa: la pantalla y el libro tienen que aplicar
   EL MISMO tope. Si no, el técnico ve «No pasa» y el documento firmado
   dice otra cosa, o al revés.
   ================================================================ */
bloque('9. El veredicto: la vertical de 900 N');

const libroDe = async (tipo, fuerzas) => T(async d => {
  const g = window.__T, S = g.S;
  const p = S.puertas.find(x => x.codigo === 'AR-0001');
  await g.sb.from('puertas').update({ tipo: d.tipo }).eq('id', p.id);
  await g.cargar();
  const e = { id:'xp-v', puerta_id:p.id, familia:'industrial', situacion:'adecuacion',
    estado:'emitido', referencia:'V1', creado:new Date().toISOString(),
    datos:{ puerta:{ tipo:d.tipo, motorizada:'si' }, fuerzas: d.f } };
  S.expedientes.unshift(e);
  let html = '';
  const ab = window.open;
  window.open = () => ({ document:{ write:t => { html += t; }, close(){} } });
  try { await g.libroExpediente('xp-v'); } finally { window.open = ab; }
  S.expedientes.shift();
  return html;
}, { tipo, f: fuerzas });

/* Una seccional (movimiento vertical) que mide 900 N en el primer punto */
const medida900 = { incluir:'si', instrumento:'X', calibracion:'2026', fecha:'2026-10-14',
                    m0:{ fd:900, fs:100, fe:20, td:0.5 } };
const seccional900 = await libroDe('Seccional', medida900);
paso('UNA SECCIONAL CON 900 N NO PASA: le tocan 400, no 1.400',
  /No pasa/.test(seccional900), (seccional900.match(/No pasa|Pasa|Pendiente de evaluación/)||[''])[0]);
paso('y el libro deja escrito el límite que se le aplicó',
  /Límite de fuerza dinámica aplicado[\s\S]{0,80}400 N/.test(seccional900),
  (seccional900.match(/Límite de fuerza dinámica aplicado[\s\S]{0,60}/)||[''])[0].replace(/<[^>]*>/g,' ').slice(0,70));
paso('diciendo por qué: es una puerta de movimiento vertical',
  /movimiento vertical/.test(seccional900));

/* La misma medida en una corredera con la abertura por encima de 500 mm sí entra */
const corredera900 = await libroDe('Corredera autoportante',
  Object.assign({}, medida900, { abertura:'mas_500' }));
paso('la misma medida en una corredera con abertura mayor de 500 mm sí entra en límites',
  !/No pasa/.test(corredera900), (corredera900.match(/No pasa|Pasa/)||[''])[0]);
paso('y el libro dice que el límite aplicado fue 1.400 N',
  /Límite de fuerza dinámica aplicado[\s\S]{0,80}1400 N/.test(corredera900));
paso('y deja constancia de la abertura declarada',
  /más de 500 mm/.test(corredera900));

/* Sin declarar la abertura manda el tramo más exigente: lo prudente */
const sinAbertura = await libroDe('Corredera autoportante', medida900);
paso('SIN DECLARAR LA ABERTURA se aplica el tramo más exigente, no el más cómodo',
  /No pasa/.test(sinAbertura) &&
  /Límite de fuerza dinámica aplicado[\s\S]{0,80}400 N/.test(sinAbertura));
paso('y el libro dice que la abertura no consta, en vez de callarlo',
  /no consta/.test(sinAbertura));

/* El viejo campo «hueco» ya no puede subir el tope por la puerta de atrás */
const viejoHueco = await libroDe('Seccional',
  Object.assign({}, medida900, { hueco:'impacto' }));
paso('EL CAMPO VIEJO «sin riesgo de aplastamiento» YA NO SUBE EL LÍMITE a 1.400',
  /No pasa/.test(viejoHueco) &&
  /Límite de fuerza dinámica aplicado[\s\S]{0,80}400 N/.test(viejoHueco),
  'expedientes antiguos quedan evaluados con el criterio correcto');

/* El caso del apartado A.2.1 sobre superficie plana grande sí sube a 1.400 */
const superficie = await libroDe('Seccional',
  Object.assign({}, medida900, { superficie:'si' }));
paso('la superficie plana de más de 0,1 m² sí sube el límite a 1.400 N',
  /Límite de fuerza dinámica aplicado[\s\S]{0,80}1400 N/.test(superficie));
paso('y queda escrito en el libro que se aplicó ese caso',
  /superficies de más de 0,1 m²/.test(superficie));

/* Pantalla y libro, el mismo tope */
const pantalla = await T(async () => {
  const g = window.__T, S = g.S;
  const p = S.puertas.find(x => x.codigo === 'AR-0001');
  await g.sb.from('puertas').update({ tipo:'Seccional' }).eq('id', p.id);
  await g.cargar();
  const e = { id:'xp-p', puerta_id:p.id, familia:'industrial', situacion:'adecuacion',
    estado:'borrador', referencia:'P1', creado:new Date().toISOString(),
    datos:{ puerta:{ tipo:'Seccional', motorizada:'si' },
            fuerzas:{ incluir:'si', m0:{ fd:900, fs:100, fe:20, td:0.5 } } } };
  S.expedientes.unshift(e);
  S.exp = e.id; S.expPaso = 'fuerzas'; g.pintar();
  await new Promise(r => setTimeout(r, 600));
  const t = document.body.innerText;
  S.exp = null; S.expedientes.shift(); g.pintar();
  return t;
});
paso('LA PANTALLA DICE LO MISMO QUE EL LIBRO: no pasa', /No pasa/.test(pantalla));
paso('y ya no pregunta si puede aplastar, que no era el criterio',
  !/Tipo de hueco en el canto de cierre/.test(pantalla));
paso('pregunta la abertura, que sí lo es', /Abertura en el punto de medida/.test(pantalla));
paso('y el caso de la superficie plana grande, que es el único que sube el límite',
  /superficie plana grande/i.test(pantalla));

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
