/* ================================================================
   tipos.mjs — qué forma tiene la puerta.

   Por qué existe: el desplegable tenía ocho tipos y la aplicación ya
   sabía tratar por dentro algunos que no se podían elegir. Una puerta
   rápida o una plegable se quedaban sin sus peligros propios, y una
   guillotina sin su paracaídas, porque nadie podía escribir ese tipo.
   Y cuando el técnico escribía un tipo a mano que no se reconocía, la
   puerta se quedaba sin peligros SIN QUE NADA LO DIJERA.

   Lo que fija esta suite:
     1. Que el desplegable ofrece los tipos que el motor sabe tratar.
     2. Que lo que decide no es la lista, sino el reconocimiento del
        texto, y que el orden del reconocimiento es el correcto:
        «peatonal automática corredera» no es una corredera de garaje.
     3. Que cada forma recibe sus peligros, sus componentes mínimos y
        su familia.
     4. Que un tipo que NO se reconoce se dice, en pantalla y en el
        validador, en vez de callarse.
     5. Que una peatonal sin lista de peligros NO genera aviso falso.
     6. Que las puertas ya dadas de alta con los tipos antiguos siguen
        funcionando igual.
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
/* Expediente de mentira con el tipo que se le diga, para no tener que pasar por
   la pantalla en cada una de las veinte comprobaciones de reconocimiento. */
const exp = tipo => ({ id:'x', familia:'industrial', datos:{ puerta:{ tipo } } });

/* ================================================================
   1. El desplegable ofrece lo que el motor sabe tratar
   ================================================================ */
bloque('1. El desplegable');

const lista = await T(() => window.__T.TIPOS);
paso('hay más de los ocho de antes', lista.length >= 15, lista.length);
['Rápida de lona','Plegable','Guillotina o vertical','Cortafuegos'].forEach(t =>
  paso('se puede elegir «'+t+'», que antes no estaba', lista.includes(t)));
['Corredera autoportante','Corredera con guía en el suelo'].forEach(t =>
  paso('la corredera se puede precisar: «'+t+'»', lista.includes(t)));
paso('las peatonales van separadas por su mecanismo',
  ['corredera','batiente','giratoria','curva'].every(x =>
    lista.some(t => /peatonal/i.test(t) && new RegExp(x,'i').test(t))),
  lista.filter(t => /peatonal/i.test(t)).join(' | '));
paso('y sigue estando «Otro», para la puerta rara', lista.includes('Otro'));

const sinForma = await T(l => l.filter(t => t !== 'Otro' && !window.__T.formaDePuerta(t)), lista);
paso('TODOS los tipos del desplegable los reconoce el motor',
  sinForma.length === 0, sinForma.join(', ') || 'ninguno suelto');

/* ================================================================
   2. El reconocimiento del texto, y su orden
   ================================================================ */
bloque('2. Reconocer el tipo escrito');

const casos = [
  ['Corredera autoportante',            'corredera'],
  ['Corredera con guía en el suelo',    'corredera'],
  ['corredera de dos hojas',            'corredera'],
  ['Batiente',                          'batiente'],
  ['cancela abatible de forja',         'batiente'],
  ['Seccional',                         'seccional'],
  ['Basculante',                        'basculante'],
  ['Enrollable industrial',             'enrollable'],
  ['Cierre enrollable de local',        'enrollable'],
  ['persiana metálica del escaparate',  'enrollable'],
  ['Plegable',                          'plegable'],
  ['puerta de acordeón',                'plegable'],
  ['Rápida de lona',                    'rapida'],
  ['Guillotina o vertical',             'guillotina'],
  ['Cortafuegos',                       'cortafuegos'],
  ['Barrera',                           'barrera'],
  ['Peatonal automática corredera',     'peatonal'],
  ['Peatonal automática batiente',      'peatonal'],
  ['Peatonal automática giratoria',     'peatonal'],
  ['Peatonal automática curva',         'peatonal'],
];
const res = await T(cs => cs.map(([t]) => window.__T.formaDePuerta(t)), casos);
casos.forEach(([t, esperado], i) =>
  paso('«'+t+'» → '+esperado, res[i] === esperado, res[i] || '(nada)'));

/* El orden es lo que hace que esto funcione, y es lo que se rompe solo */
const orden = await T(() => ({
  peatonalCorredera: window.__T.formaDePuerta('Peatonal automática corredera'),
  seccionalRapida:   window.__T.formaDePuerta('seccional rápida de lona'),
  cortaEnrollable:   window.__T.formaDePuerta('cortafuegos enrollable'),
}));
paso('EL ORDEN MANDA: «peatonal automática corredera» NO es una corredera de garaje',
  orden.peatonalCorredera === 'peatonal', orden.peatonalCorredera);
paso('«seccional rápida de lona» se trata como rápida, que es lo que David pidió',
  orden.seccionalRapida === 'rapida', orden.seccionalRapida);
paso('«cortafuegos enrollable» manda cortafuegos, que es lo que cambia su cierre',
  orden.cortaEnrollable === 'cortafuegos', orden.cortaEnrollable);

const vacios = await T(() => [window.__T.formaDePuerta(''), window.__T.formaDePuerta(null),
                              window.__T.formaDePuerta(undefined), window.__T.formaDePuerta('   ')]);
paso('un tipo vacío no revienta ni inventa forma',
  vacios.every(x => x === ''), JSON.stringify(vacios));

const guiada = await T(() => ({
  auto: window.__T.correderaGuiada('Corredera autoportante'),
  gui:  window.__T.correderaGuiada('Corredera con guía en el suelo'),
  seca: window.__T.correderaGuiada('Corredera'),
  otra: window.__T.correderaGuiada('Seccional'),
}));
paso('una autoportante consta como sin guía en el suelo', guiada.auto === false);
paso('una con guía consta como guiada', guiada.gui === true);
paso('y una «Corredera» a secas NO se inventa cuál es: queda sin constar',
  guiada.seca === null, String(guiada.seca));
paso('la pregunta no tiene sentido en lo que no es corredera', guiada.otra === null);

/* ================================================================
   3. Cada forma recibe lo suyo
   ================================================================ */
bloque('3. Peligros, componentes y familia por forma');

const pelig = await T(() => {
  const g = window.__T;
  const f = t => { const p = g.peligrosDe({ datos:{ puerta:{ tipo:t } } }); return p ? p.clave : null; };
  return {
    rapida: f('Rápida de lona'), plegable: f('Plegable'),
    guillotina: f('Guillotina o vertical'), cortafuegos: f('Cortafuegos'),
    nGuillotina: (g.PELIGROS_POR_TIPO.guillotina||[]).length,
    nCorta: (g.PELIGROS_POR_TIPO.cortafuegos||[]).length,
    textosCorta: (g.PELIGROS_POR_TIPO.cortafuegos||[]).map(x => x[1]+' | '+x[2]).join(' ~ '),
  };
});
paso('una rápida recibe los peligros de la rápida, que antes no recibía',
  pelig.rapida === 'rapida', pelig.rapida);
paso('una plegable, los de la plegable', pelig.plegable === 'plegable');
paso('una guillotina tiene ahora lista propia', pelig.guillotina === 'guillotina' && pelig.nGuillotina >= 4,
  pelig.nGuillotina);
paso('y una cortafuegos también', pelig.cortafuegos === 'cortafuegos' && pelig.nCorta >= 4, pelig.nCorta);
/* El peligro propio de una cortafuegos es que cierra sola y TIENE que cerrar:
   su protección no puede ser un dispositivo que impida el cierre. */
paso('la cortafuegos recoge el cierre automático imprevisto',
  /alarma|falte? corriente|faltar corriente/i.test(pelig.textosCorta));
paso('Y DICE que lo que se instale no puede impedir que termine de cerrar',
  /no pueden impedir que la puerta termine de cerrar/i.test(pelig.textosCorta));
paso('y que puede bloquear el recorrido de evacuación',
  /evacuaci[óo]n/i.test(pelig.textosCorta));

const comp = await T(() => {
  const g = window.__T;
  const f = t => g.componentesMinimos({ id:'p', tipo:t }).todos.map(x => x.clave);
  return { guillotina: f('Guillotina o vertical'), seccional: f('Seccional'),
           corredera: f('Corredera autoportante') };
});
paso('una guillotina pide paracaídas, que antes no pedía porque no se podía elegir',
  comp.guillotina.includes('paracaidas'), comp.guillotina.join(','));
paso('una seccional lo sigue pidiendo', comp.seccional.includes('paracaidas'));
paso('una corredera sigue sin pedirlo: no cuelga sobre el hueco',
  !comp.corredera.includes('paracaidas'), comp.corredera.join(','));

const fam = await T(() => {
  const g = window.__T;
  const f = t => g.familiaDePuerta({ id:'z-'+t, tipo:t });
  return { peatonal: f('Peatonal automática giratoria'), barrera: f('Barrera'),
           corta: f('Cortafuegos'), seccional: f('Seccional') };
});
paso('una peatonal giratoria cae en la familia peatonal', fam.peatonal === 'peatonal', fam.peatonal);
paso('una barrera, en barrera', fam.barrera === 'barrera');
paso('una cortafuegos, en cortafuegos, que antes no pasaba', fam.corta === 'cortafuegos', fam.corta);
paso('y el resto, en industrial', fam.seccional === 'industrial', fam.seccional);

const aplica = await T(() => {
  const g = window.__T;
  const r = (clave, tipo) => {
    const x = g.procede(g.APLICA_COMPROBACION, clave, { datos:{ puerta:{ tipo } } });
    return (x && x.no) ? 'no' : (x === true ? 'si' : 'nulo');
  };
  return {
    descPeatonal: r('descarrile', 'Peatonal automática corredera'),
    descCorredera: r('descarrile', 'Corredera con guía en el suelo'),
    caidaGuillotina: r('caida', 'Guillotina o vertical'),
    caidaCorredera: r('caida', 'Corredera autoportante'),
  };
});
paso('EL DESCARRILAMIENTO no se le pregunta a una peatonal corredera: no es esa puerta',
  aplica.descPeatonal === 'no', aplica.descPeatonal);
paso('pero sí a una corredera de garaje', aplica.descCorredera === 'si');
paso('la caída de hoja sí aplica a una guillotina', aplica.caidaGuillotina === 'si');
paso('y no a una corredera', aplica.caidaCorredera === 'no');

/* ================================================================
   4. Un tipo que no se reconoce se DICE
   ================================================================ */
bloque('4. El tipo que no se reconoce');

const porque = await T(() => {
  const g = window.__T;
  const f = t => g.porQueSinPeligros({ datos:{ puerta:{ tipo:t } } });
  return { raro: f('Puerta de esclusa neumática'), vacio: f(''),
           pea: f('Peatonal automática curva'), conocido: f('Seccional') };
});
paso('un tipo que no se coloca se marca como no reconocido',
  porque.raro && porque.raro.clave === 'sin_reconocer', JSON.stringify(porque.raro && porque.raro.clave));
paso('y lo dice con el tipo escrito delante, no en abstracto',
  /Puerta de esclusa neum[áa]tica/.test((porque.raro||{}).texto||''));
paso('diciendo qué hacer: valorarlos a mano o escribirlo de otra forma',
  /valorarlos a mano/.test((porque.raro||{}).texto||''));
paso('sin tipo, se dice que falta el tipo, que no es lo mismo',
  porque.vacio && porque.vacio.clave === 'sin_tipo');
paso('UNA PEATONAL NO ES UN FALLO: sus peligros están en sus comprobaciones',
  porque.pea && porque.pea.clave === 'peatonal', JSON.stringify(porque.pea && porque.pea.clave));
paso('y lo explica, en vez de parecer que le faltan peligros',
  /UNE-EN 16005/.test((porque.pea||{}).texto||''));
paso('un tipo conocido no da explicación ninguna: tiene su lista',
  porque.conocido === null);

const val = await T(() => {
  const g = window.__T;
  const base = sit => ({ id:'v', familia:'industrial', situacion:'adecuacion',
    estado:'borrador', datos:{ puerta:{ tipo: sit } } });
  const avisos = e => g.validarExpediente(e).avisos.map(x => x.texto || x.mensaje || JSON.stringify(x)).join(' ~ ');
  return { raro: avisos(base('Puerta de esclusa neumática')),
           pea:  avisos(base('Peatonal automática curva')) };
});
paso('el validador avisa del tipo no reconocido',
  /no corresponde a ninguno de los grupos/.test(val.raro));
paso('Y NO AVISA de una peatonal: un aviso falso enseña a ignorar los avisos',
  !/no corresponde a ninguno de los grupos/.test(val.pea));

/* ================================================================
   5. Las puertas que ya estaban dadas de alta
   ================================================================ */
bloque('5. Lo que ya estaba dado de alta');

const viejos = await T(() => {
  const g = window.__T;
  const antiguos = ['Corredera','Batiente','Seccional','Enrollable','Basculante',
                    'Peatonal automática','Barrera'];
  return antiguos.map(t => t + '=' + (g.formaDePuerta(t) || 'NADA'));
});
paso('los siete tipos antiguos se siguen reconociendo igual',
  viejos.every(x => !/=NADA$/.test(x)), viejos.join(' '));

const conserva = await T(async () => {
  const g = window.__T;
  const p = g.S.puertas.find(x => x.codigo === 'AR-0001');
  await g.sb.from('puertas').update({ tipo:'Corredera' }).eq('id', p.id);   // tipo antiguo
  await g.cargar();
  g.dlgPuerta(g.puertaDe(p.id).id);
  await new Promise(r => setTimeout(r, 600));
  const sel = document.getElementById('f-tipo');
  const v = sel.value;
  const ops = Array.from(sel.options).map(o => o.value);
  g.cerrarDlg();
  return { v, tieneAntiguo: ops.includes('Corredera'), nuevos: ops.includes('Corredera autoportante') };
});
paso('al abrir una puerta con un tipo antiguo, el desplegable NO se lo borra',
  conserva.v === 'Corredera', conserva.v);
paso('lo conserva como opción', conserva.tieneAntiguo);
paso('y ofrece los nuevos al lado', conserva.nuevos);

/* ================================================================
   6. En pantalla
   ================================================================ */
bloque('6. En pantalla');

const pantalla = await T(async () => {
  const g = window.__T, S = g.S;
  const p = g.S.puertas.find(x => x.codigo === 'AR-0001');
  const e = { id:'xp-tipo', puerta_id:p.id, familia:'industrial', situacion:'adecuacion',
    estado:'borrador', referencia:'T1', creado:new Date().toISOString(),
    datos:{ puerta:{ tipo:'Puerta de esclusa neumática' } } };
  S.expedientes.unshift(e);
  S.exp = e.id; S.expPaso = 'cumplimiento'; g.pintar();
  await new Promise(r => setTimeout(r, 600));
  const t1 = document.body.innerText;
  g.expDe('xp-tipo').datos.puerta.tipo = 'Guillotina o vertical';
  g.pintar();
  await new Promise(r => setTimeout(r, 600));
  const t2 = document.body.innerText;
  S.exp = null; S.expedientes.shift(); g.pintar();
  return { raro: t1, guillo: t2 };
});
paso('el técnico ve en pantalla que esa puerta se queda sin peligros propios',
  /no tiene lista de peligros propios/i.test(pantalla.raro));
paso('con el tipo que escribió, para que sepa qué corregir',
  /esclusa neum[áa]tica/i.test(pantalla.raro));
paso('y al poner un tipo que sí se reconoce, aparecen sus peligros',
  /borde inferior al bajar la hoja/i.test(pantalla.guillo));
paso('y desaparece el aviso', !/no tiene lista de peligros propios/i.test(pantalla.guillo));

/* ================================================================
   7. El guión de revisión de cada tipo.

   ESTE ES EL FALLO QUE ENCONTRÓ DAVID USANDO LA APLICACIÓN, y era el
   grave de los dos. Los guiones de fábrica están guardados con el
   NOMBRE EXACTO del tipo. Al afinar la lista, «Corredera autoportante»
   dejó de coincidir con la clave «Corredera», así que una corredera
   dada de alta con el nombre nuevo se habría quedado con el guión
   genérico: sin cremallera, sin rodillos y sin antidescarrilamiento.
   Un guión de revisión más pobre no se nota hasta que hay un informe
   malo en la mano.
   ================================================================ */
bloque('7. El guión de revisión de cada tipo');

const gu = await T(() => {
  const g = window.__T;
  const txt = t => g.guionDe(t).map(x => x.h || x.t).join(' ~ ');
  return {
    autoportante: txt('Corredera autoportante'),
    guiada:       txt('Corredera con guía en el suelo'),
    vieja:        txt('Corredera'),
    generico:     txt('Otro'),
    peatCurva:    txt('Peatonal automática curva'),
    rapida:       txt('Rápida de lona'),
    plegable:     txt('Plegable'),
    guillotina:   txt('Guillotina o vertical'),
    cortafuegos:  txt('Cortafuegos'),
    nAuto:        g.guionDe('Corredera autoportante').length,
    nGenerico:    g.guionDe('Otro').length,
  };
});
paso('UNA CORREDERA AUTOPORTANTE RECIBE EL GUIÓN DE CORREDERA, no el genérico',
  /Cremallera/.test(gu.autoportante), gu.autoportante.slice(0,0) || (gu.autoportante.match(/Propio de [^~]*/)||[''])[0]);
paso('con el antidescarrilamiento, que es lo que se pierde al caer en el genérico',
  /antidescarrilamiento|antivuelco/i.test(gu.autoportante));
paso('y es el mismo guión que el de la corredera guiada',
  gu.autoportante === gu.guiada);
paso('y el mismo que el del nombre antiguo «Corredera»',
  gu.autoportante === gu.vieja);
paso('que NO es el genérico', gu.autoportante !== gu.generico && gu.nAuto > 10,
  gu.nAuto + ' puntos frente a ' + gu.nGenerico);
paso('una peatonal curva recibe el guión de peatonal automática',
  /Sensores de presencia/.test(gu.peatCurva), (gu.peatCurva.match(/Propio de [^~]*/)||[''])[0]);

/* Las cuatro formas que no tenían guión de fábrica se montan sobre el genérico */
paso('una rápida tiene bloque propio, que antes no tenía',
  /Propio de rápida/.test(gu.rapida) && /reenganche de la lona/i.test(gu.rapida));
paso('con la velocidad de cierre medida, que es lo suyo',
  /Velocidad de cierre medida/.test(gu.rapida));
paso('una plegable, el suyo', /Propio de plegable/.test(gu.plegable) &&
  /Articulaciones y bisagras/.test(gu.plegable));
paso('una guillotina, el suyo', /Propio de guillotina/.test(gu.guillotina) &&
  /anticaída/i.test(gu.guillotina));
paso('una cortafuegos, el suyo', /Propio de puerta cortafuegos/.test(gu.cortafuegos));
paso('con la prueba de cierre por alarma cronometrada',
  /tiempo hasta cierre completo/i.test(gu.cortafuegos));
paso('Y CON EL PUNTO QUE NO PUEDE FALTAR: que nada impida terminar de cerrar',
  /NINGÚN dispositivo instalado impide que la puerta termine de cerrar/.test(gu.cortafuegos));
paso('los cuatro conservan los bloques generales: seguridad y eléctrica',
  [gu.rapida, gu.plegable, gu.guillotina, gu.cortafuegos].every(x =>
    /Seguridad \(bloque crítico\)/.test(x) && /Instalación eléctrica/.test(x)));
paso('y NO arrastran el punto vacío del genérico',
  ![gu.rapida, gu.plegable, gu.guillotina, gu.cortafuegos].some(x =>
    /Propio de esta puerta/.test(x)));

const editado = await T(async () => {
  const g = window.__T;
  /* Si el guión de corredera se edita a mano, la autoportante tiene que recibir
     el editado, no el de fábrica: lo contrario sería ignorar el trabajo hecho. */
  const arr = g.guionDe('Corredera').slice();
  arr.push({ t:'Punto añadido a mano por la oficina' });
  await g.guardarLista(g.claveGuion('Corredera'), arr);
  return g.guionDe('Corredera autoportante').map(x => x.h || x.t).join(' ~ ');
});
paso('si editas el guión de corredera, la autoportante recibe TU versión',
  /Punto añadido a mano por la oficina/.test(editado));

/* ================================================================
   8. La lista guardada en Ajustes tapaba la de fábrica
   ================================================================ */
bloque('8. La lista guardada en Ajustes');

const tapada = await T(async () => {
  const g = window.__T;
  /* La situación real de David: una lista de tipos guardada hace meses, con los
     ocho de entonces. La aplicación usa esa y la de fábrica no se ve nunca. */
  const antiguos = ['Corredera','Batiente','Seccional','Enrollable','Basculante',
                    'Peatonal automática','Barrera','Un tipo mío','Otro'];
  await g.guardarLista('tipos', antiguos);
  return { enUso: g.lista('tipos', g.TIPOS), panel: g.panelLista('tipos','Tipos de puerta',g.TIPOS,'') };
});
paso('con una lista guardada, la aplicación usa la guardada: mandas tú',
  tapada.enUso.includes('Un tipo mío') && !tapada.enUso.includes('Rápida de lona'),
  tapada.enUso.length + ' tipos');
paso('PERO LO DICE: el panel avisa de los que trae la aplicación y tú no tienes',
  /no tiene \d+ elementos? que sí trae la aplicación/.test(tapada.panel));
paso('nombrándolos, para que se vea qué te estás perdiendo',
  /Rápida de lona/.test(tapada.panel) && /Guillotina o vertical/.test(tapada.panel));
paso('y ofrece añadirlos de un clic', /data-act="lista-faltan"/.test(tapada.panel));

const anadidos = await T(async () => {
  const g = window.__T;
  const antes = g.lista('tipos', g.TIPOS).slice();
  const base = g.TIPOS;
  const faltan = base.filter(x => !antes.some(y => y.toLowerCase() === x.toLowerCase()));
  await g.guardarLista('tipos', antes.concat(faltan));
  const despues = g.lista('tipos', g.TIPOS);
  return { antes, despues, panel: g.panelLista('tipos','Tipos de puerta',g.TIPOS,'') };
});
paso('al añadirlos, están todos los de fábrica',
  anadidos.despues.includes('Rápida de lona') && anadidos.despues.includes('Cortafuegos'));
paso('LO TUYO NO SE PIERDE: «Un tipo mío» sigue ahí',
  anadidos.despues.includes('Un tipo mío'));
paso('y en el mismo sitio en que estaba: no se reordena nada',
  anadidos.despues.slice(0, anadidos.antes.length).join('|') === anadidos.antes.join('|'));
paso('sin duplicar ninguno',
  new Set(anadidos.despues.map(x => x.toLowerCase())).size === anadidos.despues.length);
paso('y el aviso desaparece, porque ya no falta nada',
  !/no tiene \d+ elementos? que sí trae/.test(anadidos.panel));

const sinGuardar = await T(() => {
  const g = window.__T;
  const copia = g.S.ajustes.tipos;
  delete g.S.ajustes.tipos;                       // como quien nunca ha tocado la lista
  const p = g.panelLista('tipos','Tipos de puerta',g.TIPOS,'');
  g.S.ajustes.tipos = copia;
  return p;
});
paso('a quien nunca ha tocado la lista no se le da la lata con el aviso',
  !/no tiene \d+ elementos? que sí trae/.test(sinGuardar));

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
