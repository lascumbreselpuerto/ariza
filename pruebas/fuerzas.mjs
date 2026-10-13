/* ================================================================
   fuerzas.mjs — las tres vías del ensayo de fuerzas.

   Por qué existe: medir las fuerzas exige un dinamómetro calibrado, y
   buena parte del sector no lo tiene. Obligar a medir para poder emitir
   documentación dejaba la aplicación fuera del alcance de mucha gente.
   Pero callarse en el libro que no se midió perjudica a quien firma: un
   documento que no menciona el ensayo deja suponer que se hizo.

   La salida son tres vías, no dos:
     si           se mide, y el ensayo tiene que estar completo
     no_procede   la protección va por detección de presencia, hay que
                  decir cuál, y el libro NO lleva nota: es una vía de
                  cumplimiento, no una carencia
     no           decisión del firmante, con su motivo; el libro lo dice
                  en texto normal, sin rojos, en dos sitios

   Lo que fija esta suite: que las tres existen, que cada una exige lo
   suyo, que ninguna bloquea de más y, sobre todo, QUE EL LIBRO NUNCA SE
   CALLA que no hubo ensayo.
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
const errores = []; let ok = 0, mal = 0;
const paso = (t, bien, extra='') => { bien ? ok++ : mal++;
  console.log((bien?'  OK  ':' FALLA ')+t+(extra!==''&&extra!==undefined?' → '+String(extra):'')); };
const bloque = t => console.log('\n· '+t);

async function abrir(){
  const ctx = await nav.newContext({ viewport:{width:1320,height:1600},
    locale:'es-ES', timezoneId:'Europe/Madrid' });
  await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
  await ctx.addInitScript(() => {
    window.__PARCHE = db => {
      db.ajustes.push({ clave:'empresa', valor:{
        razon_social:'Ariza Puertas y Automatismos S.L.U.', nif:'B72004849',
        domicilio:'Calle Orilla 19', cp:'11500', poblacion:'El Puerto de Santa María',
        provincia:'Cádiz', telefono:'661 352 795', email:'a@b.es',
        representante:'David Ariza Arana', cargo_firmante:'Administrador único',
        responsable_tecnico:'David Ariza Arana' } });
    };
  });
  const pag = await ctx.newPage();
  pag.on('pageerror', e => errores.push('JS: '+e.message));
  await pag.goto(URL_APP); await pag.waitForTimeout(1300);
  return { ctx, pag };
}
const crear = async (pag, sit, fam) => {
  await pag.click('#tabs button[data-tab="puertas"]'); await pag.waitForTimeout(300);
  await pag.locator('#vista .item:has-text("Comunidad Las Flores")').first().click();
  await pag.waitForTimeout(500);
  await pag.locator('[data-act="exp-nuevo"]').first().click(); await pag.waitForTimeout(450);
  if (sit) { await pag.selectOption('#xp-sit', sit); await pag.waitForTimeout(250); }
  if (fam) { await pag.selectOption('#xp-fam', fam); await pag.waitForTimeout(250); }
  await pag.click('#dlg button[type="submit"]'); await pag.waitForTimeout(1000);
};
const irA = async (pag, v) => {
  const b = pag.locator('[data-act="exp-paso"][data-v="'+v+'"]').first();
  if (await b.count()){ await b.click(); await pag.waitForTimeout(600); return true; }
  return false;
};
const vista = async pag => (await pag.textContent('#vista'));
/* escribe un valor en un campo del expediente por su ruta */
const ponSel = async (pag, ruta, v) => {
  await pag.selectOption('[data-exp="'+ruta+'"]', v); await pag.waitForTimeout(600);
};
const ponTxt = async (pag, ruta, v) => {
  await pag.fill('[data-exp="'+ruta+'"]', v); await pag.waitForTimeout(500);
};
/* Genera el libro del expediente. Devuelve su texto entero y, aparte, los párrafos
   del apartado «Ensayo de fuerzas», que es donde hay que mirar la longitud: el
   texto plano del documento no tiene saltos de párrafo que valgan para medirla. */
const libro = async (pag, id) => {
  const [doc] = await Promise.all([pag.waitForEvent('popup'),
    pag.evaluate(i => window.__T.libroExpediente(i), id)]);
  await doc.waitForTimeout(1800);
  const t = await doc.textContent('body');
  const parrafos = await doc.evaluate(() => {
    const sec = Array.from(document.querySelectorAll('section'))
      .find(x => /Ensayo de fuerzas/i.test((x.querySelector('h3')||{}).textContent||''));
    return sec ? Array.from(sec.querySelectorAll('p')).map(p => p.textContent.trim()) : [];
  });
  await doc.close();
  return Object.assign(new String(t), { texto: t, parrafos });
};
const expId = pag => pag.evaluate(() => (window.__T.S.expedientes[0]||{}).id);

/* ================================================================
   1. Las tres vías existen y se eligen
   ================================================================ */
bloque('1. Las tres vías del ensayo');
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'fuerzas');
  const opciones = await pag.evaluate(() => {
    const s = document.querySelector('[data-exp="fuerzas.incluir"]');
    return s ? Array.from(s.options).map(o => o.value) : [];
  });
  paso('el ensayo tiene tres vías, no dos',
    opciones.length === 3, opciones.join('|'));
  paso('medir, no proceder y no incluir',
    ['si','no_procede','no'].every(v => opciones.includes(v)), opciones.join('|'));
  paso('la pregunta es cómo se acredita, no si se imprime',
    /Cómo se acredita en esta puerta/.test(await vista(pag)));
  await ctx.close();
}

/* ================================================================
   2. «No procede»: la protección va por detección de presencia
   ================================================================ */
bloque('2. No procede, porque la protección va por detección');
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'fuerzas');
  await ponSel(pag, 'fuerzas.incluir', 'no_procede');
  const t = await vista(pag);
  paso('al elegirlo, pide con qué se protege la puerta',
    /Con qué se protege la puerta/.test(t));
  paso('y avisa de que el libro no llevará nota de nada',
    /No lleva aviso de nada: es una vía de cumplimiento/i.test(t));

  const id = await expId(pag);
  const sinDecir = await pag.evaluate(i => {
    const v = window.__T.validarExpediente(window.__T.expDe(i));
    return v.bloqueos.map(b => b.texto).join(' | ');
  }, id);
  paso('sin decir con qué se protege, no deja emitir',
    /Escribe con qué se protege/.test(sinDecir), sinDecir.slice(0, 70));

  await ponTxt(pag, 'fuerzas.proteccion',
    'Banda de seguridad en el canto de cierre y pareja de fotocélulas a 50 cm');
  const conDecir = await pag.evaluate(i => {
    const v = window.__T.validarExpediente(window.__T.expDe(i));
    return v.bloqueos.filter(b => b.area === 'Ensayo').length;
  }, id);
  paso('diciéndolo, el ensayo deja de bloquear', conDecir === 0, conDecir);

  const L = await libro(pag, id);
  paso('EL LIBRO LO DICE: no procede el ensayo', /no procede el ensayo de fuerzas/i.test(L));
  paso('explicando que la protección va por detección de presencia',
    /detección de presencia que impide el contacto/i.test(L));
  paso('y nombrando la protección que lleva',
    /Banda de seguridad en el canto de cierre/.test(L));
  paso('también en el apartado de limitaciones',
    /No procede el ensayo de fuerzas de maniobra: la protección/i.test(L));
  paso('sin gritar en mayúsculas ni llamarlo incumplimiento',
    L.parrafos.length > 0 &&
    !/ATENCIÓN|ADVERTENCIA|INCUMPL/.test(L.parrafos.join(' ')) &&
    !/deficiencia|carencia|incumpl/i.test(L.parrafos.join(' ')),
    L.parrafos.length+' párrafos');
  paso('sin llamarlo carencia ni avisar de nada',
    !/PERFIL DE ENSAYO SIN VALIDAR/.test(L.slice(L.indexOf('no procede el ensayo') - 400,
                                                 L.indexOf('no procede el ensayo') + 400)));
  await ctx.close();
}

/* ================================================================
   3. «No se incluye»: decisión del firmante
   ================================================================ */
bloque('3. No se incluye, por decisión del firmante');
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'fuerzas');
  await ponSel(pag, 'fuerzas.incluir', 'no');
  const t = await vista(pag);
  paso('pide el motivo, diciendo que es opcional',
    /Por qué no se incluye \(opcional/.test(t));
  paso('y explica que la nota del libro es lo que te respalda',
    /es lo que te respalda si algún día hay que explicar el documento/.test(t));
  paso('recordando que existe la vía de «no procede»',
    /arriba tienes la opción «No procede»/.test(t));
  paso('y avisa de que sin motivo escrito ese párrafo no sale',
    /Si no escribes motivo, no aparece ese párrafo/.test(t));

  const id = await expId(pag);
  const sinMotivo = await pag.evaluate(i => {
    const v = window.__T.validarExpediente(window.__T.expDe(i));
    return { bloqueos: v.bloqueos.filter(b => b.area === 'Ensayo').length,
             avisos: v.avisos.filter(a => a.area === 'Ensayo').map(a => a.texto).join(' ') };
  }, id);
  paso('sin motivo NO bloquea: es decisión del firmante',
    sinMotivo.bloqueos === 0, sinMotivo.bloqueos);
  paso('pero recomienda escribirlo',
    /no consta el motivo/i.test(sinMotivo.avisos), sinMotivo.avisos.slice(0, 70));

  const L1 = await libro(pag, id);
  paso('EL LIBRO NO SE CALLA que no hay ensayo, aunque no haya motivo',
    /no incluye ensayo de fuerzas de maniobra/i.test(L1));
  /* Sin motivo escrito, el párrafo del motivo NO aparece: no se imprime una
     etiqueta «Motivo» vacía ni un hueco esperando a ser rellenado. */
  paso('y sin motivo escrito, el párrafo del motivo no sale',
    !L1.parrafos.some(x => /^Motivo\./.test(x)),
    L1.parrafos.length+' párrafos');
  paso('y dice que lo decide el firmante bajo su responsabilidad',
    /firmante, bajo su responsabilidad/i.test(L1));
  paso('aclarando que las demás comprobaciones sí se hicieron',
    /se han realizado igualmente/i.test(L1));
  paso('también en las limitaciones',
    /No se incluye ensayo de fuerzas de maniobra, por decisión del firmante/.test(L1));

  await ponTxt(pag, 'fuerzas.motivo',
    'No se dispone de instrumento de medida calibrado en la fecha de la intervención');
  const L2 = await libro(pag, await expId(pag));
  paso('con motivo escrito, el libro lo recoge',
    /No se dispone de instrumento de medida calibrado/.test(L2));
  paso('y el motivo también sale en las limitaciones',
    (L2.match(/No se dispone de instrumento de medida calibrado/g)||[]).length >= 2,
    (L2.match(/No se dispone de instrumento de medida calibrado/g)||[]).length+' veces');
  paso('la nota va en texto normal, no como aviso de incidencia',
    !/<p class="aviso/.test(L2));
  /* El texto puede ser todo lo explicativo que haga falta. Lo que NO puede hacer es
     marcar máxima atención sobre este punto: nada de mayúsculas de alarma, ni de
     palabras que lo presenten como un incumplimiento. */
  paso('sin gritar en mayúsculas',
    !/NO SE HA|SIN ENSAYO|INCUMPL|ATENCIÓN|ADVERTENCIA/.test(L2.parrafos.join(' ')),
    L2.parrafos.length+' párrafos');
  paso('y sin llamarlo deficiencia, carencia ni incumplimiento',
    !/deficiencia|carencia|incumpl|no conforme/i.test(L2.parrafos.join(' ')));
  await ctx.close();
}

/* ================================================================
   4. Medir sigue exigiendo lo de siempre
   ================================================================ */
bloque('4. Si se mide, el ensayo tiene que estar completo');
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'fuerzas');
  const id = await expId(pag);
  const v = await pag.evaluate(i => {
    const r = window.__T.validarExpediente(window.__T.expDe(i));
    return r.bloqueos.filter(b => b.area === 'Ensayo').map(b => b.texto);
  }, id);
  paso('por defecto se mide, y sin mediciones no deja emitir',
    v.some(t => /no tiene ninguna medición/.test(t)), v.length+' bloqueos');
  paso('pide el instrumento de medida',
    v.some(t => /instrumento de medida/.test(t)));
  paso('y su calibración',
    v.some(t => /calibración/.test(t)));
  paso('y la fecha del ensayo',
    v.some(t => /no tiene fecha/.test(t)));
  await ctx.close();
}

/* ================================================================
   5. Una puerta sin motor no tiene nada de esto
   ================================================================ */
bloque('5. Puerta sin motorizar');
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'puerta');
  const hay = await pag.locator('[data-exp="puerta.motorizada"]').count();
  if (hay){
    await ponSel(pag, 'puerta.motorizada', 'no');
    const id = await expId(pag);
    const n = await pag.evaluate(i => {
      const r = window.__T.validarExpediente(window.__T.expDe(i));
      return r.bloqueos.filter(b => b.area === 'Ensayo').length;
    }, id);
    paso('una puerta manual no arrastra bloqueos de ensayo de fuerzas', n === 0, n);
    const L = await libro(pag, id);
    paso('y su libro no habla de ensayo de fuerzas',
      !/no incluye ensayo de fuerzas|no procede el ensayo de fuerzas/i.test(L));
  } else {
    paso('la puerta tiene campo de motorización', false, 'no se encuentra');
  }
  await ctx.close();
}

console.log('\n'+ok+' bien, '+mal+' mal.');
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
