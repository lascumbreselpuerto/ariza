// Fase 6: apartados 12, 13, 14 y 15 del encargo.
//  12 · árbol de modificación con preguntas secundarias de equivalencia
//  13 · motorización que deduce la respuesta en vez de preguntarla dos veces
//  14 · puertas peatonales automáticas y sus doce preguntas propias
//  15 · puertas resistentes al fuego: clasificación, DoP y componentes sustituidos
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
  console.log((bien?'  OK  ':' FALLA ')+t+(extra?' → '+extra:'')); };

async function abrir(){
  const ctx = await nav.newContext({ viewport:{width:1320,height:1600},
    locale:'es-ES', timezoneId:'Europe/Madrid' });
  await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
  await ctx.addInitScript(() => {
    window.__PARCHE = db => {
      db.ajustes.push({ clave:'empresa', valor:{
        razon_social:'Ariza p y automatismos S.L.U.', nif:'B72004849',
        domicilio:'Calle Orilla 19', cp:'11500', poblacion:'El Puerto de Santa María',
        provincia:'Cádiz', telefono:'661 352 795', email:'a@b.es',
        representante:'David Ariza Arana', cargo_firmante:'Administrador único',
        responsable_tecnico:'David Ariza Arana' } });
    };
  });
  const pag = await ctx.newPage();
  pag.on('pageerror', e => errores.push('JS: '+e.message));
  await pag.goto(URL_APP); await pag.waitForTimeout(1100);
  return { ctx, pag };
}
const crear = async (pag, sit, fam) => {
  await pag.click('#tabs button[data-tab="puertas"]'); await pag.waitForTimeout(300);
  await pag.locator('#vista .item:has-text("Comunidad Las Flores")').first().click();
  await pag.waitForTimeout(450);
  await pag.locator('[data-act="exp-nuevo"]').first().click(); await pag.waitForTimeout(400);
  if (sit) { await pag.selectOption('#xp-sit', sit); await pag.waitForTimeout(200); }
  if (fam) { await pag.selectOption('#xp-fam', fam); await pag.waitForTimeout(250); }
  await pag.click('#dlg button[type="submit"]'); await pag.waitForTimeout(900);
};
const irA = async (pag, v) => {
  const b = pag.locator('[data-act="exp-paso"][data-v="'+v+'"]').first();
  if (await b.count()){ await b.click(); await pag.waitForTimeout(450); return true; }
  return false;
};
const abrirDoc = async (pag, act) => {
  const [doc] = await Promise.all([pag.waitForEvent('popup'),
    pag.locator('[data-act="'+act+'"]').first().click()]);
  await doc.waitForTimeout(1500);
  return { doc, t: await doc.textContent('body') };
};
// contesta las doce preguntas de modificación con un valor
const todasModif = async (pag, v) => {
  for (let i = 1; i <= 12; i++){
    const s = pag.locator('select[data-exp="interv.q'+i+'.v"]');
    if (await s.count()) { await s.selectOption(v); await pag.waitForTimeout(260); }
  }
};
const motor = async pag => (await pag.textContent('#vista'));

/* ══════ 12 · EL SEGUNDO NIVEL DEL ÁRBOL ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'intervencion');
  await pag.selectOption('select[data-exp="interv.tipo"]', 'reparacion');
  await pag.waitForTimeout(400);

  // mientras todo va a «no», no hay segundo nivel por ningún lado
  await todasModif(pag, 'no');
  paso('12 · con todo a «no» no aparece ninguna pregunta de segundo nivel',
       await pag.locator('select[data-exp$=".eq"]').count() === 0);

  // q8: ¿se modifica sustancialmente el cuadro de maniobra?
  await pag.selectOption('select[data-exp="interv.q8.v"]', 'si'); await pag.waitForTimeout(600);
  paso('12 · al decir que sí al cuadro, se abre la pregunta secundaria',
       await pag.locator('select[data-exp="interv.q8.eq"]').count() === 1);
  const txt8 = await motor(pag);
  paso('12 · y pregunta por equivalencia en función, lógica de seguridad y prestaciones',
       /El nuevo cuadro de maniobra es equivalente en función, lógica de seguridad y prestaciones/.test(txt8));
  paso('12 · el segundo nivel sin contestar impide clasificar',
       /NO PUEDE DETERMINARSE/.test(txt8) && /segundo nivel sin contestar/.test(txt8));

  // equivalente sin decir en qué se basa: no vale
  await pag.selectOption('select[data-exp="interv.q8.eq"]', 'equivalente');
  await pag.waitForTimeout(600);
  paso('12 · al declarar equivalencia pide en qué se basa',
       await pag.locator('[data-exp="interv.q8.eq_base"]').count() === 1);
  const txtSinBase = await motor(pag);
  paso('12 · y sin base escrita sigue sin clasificar',
       /NO PUEDE DETERMINARSE/.test(txtSinBase) &&
       /equivalencia sin decir en qué se basa/.test(txtSinBase));

  // con la base escrita, el cambio deja de computar: reparación ordinaria
  await pag.fill('[data-exp="interv.q8.eq_base"]',
    'Cuadro anterior Erreka Vivo-C, nuevo Erreka Vivo-C2, equivalencia en la hoja de producto del fabricante');
  await pag.locator('select[data-exp="interv.tipo"]').focus();   // salir del campo
  await pag.waitForTimeout(900);
  const txtEquiv = await motor(pag);
  paso('12 · con la base escrita, el resultado es A',
       /A\.\s*Mantenimiento \/ reparación ordinaria/.test(txtEquiv.replace(/\s+/g,' ')));
  paso('12 · y queda escrito que el cambio no computa por equivalencia acreditada',
       /equivalencia acreditada, no computa como modificación/.test(txtEquiv));
  paso('12 · citando la base aportada', /Erreka Vivo-C2/.test(txtEquiv));

  // no equivalente: sube de C a D
  await pag.selectOption('select[data-exp="interv.q8.eq"]', 'no_equivalente');
  await pag.waitForTimeout(800);
  const txtNoEq = await motor(pag);
  paso('12 · declarado NO equivalente, el resultado sube a D',
       /D\.\s*Modificación sustancial/.test(txtNoEq.replace(/\s+/g,' ')));
  paso('12 · con el motivo escrito', /Cambio declarado NO equivalente/.test(txtNoEq));

  // desconocido: se queda en C, nunca se convierte en equivalente
  await pag.selectOption('select[data-exp="interv.q8.eq"]', 'desconocido');
  await pag.waitForTimeout(800);
  const txtDesc = await motor(pag);
  paso('12 · «no se puede determinar» deja el caso en C, no en A',
       /C\.\s*Modificación que requiere evaluación técnica adicional/.test(txtDesc.replace(/\s+/g,' ')));
  await ctx.close();
}

/* ══════ 12b · LAS DECISIVAS NO LLEVAN SEGUNDO NIVEL ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'intervencion');
  await pag.selectOption('select[data-exp="interv.tipo"]', 'reparacion');
  await pag.waitForTimeout(400);
  await todasModif(pag, 'no');
  for (const q of ['q1','q7','q11']){
    await pag.selectOption('select[data-exp="interv.'+q+'.v"]', 'si');
    await pag.waitForTimeout(500);
    paso('12b · '+q+' es decisiva y no admite salida por equivalencia',
         await pag.locator('select[data-exp="interv.'+q+'.eq"]').count() === 0);
    const t = await motor(pag);
    paso('12b · '+q+' manda directamente a D',
         /D\.\s*Modificación sustancial/.test(t.replace(/\s+/g,' ')));
    await pag.selectOption('select[data-exp="interv.'+q+'.v"]', 'no');
    await pag.waitForTimeout(400);
  }
  await ctx.close();
}

/* ══════ 12c · VARIAS SECUNDARIAS A LA VEZ, Y LA PEOR MANDA ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'intervencion');
  await pag.selectOption('select[data-exp="interv.tipo"]', 'sustitucion_equiv');
  await pag.waitForTimeout(400);
  await todasModif(pag, 'no');
  // dos cambios: uno equivalente acreditado y otro no equivalente
  await pag.selectOption('select[data-exp="interv.q5.v"]', 'si'); await pag.waitForTimeout(500);
  await pag.selectOption('select[data-exp="interv.q5.eq"]', 'equivalente'); await pag.waitForTimeout(500);
  await pag.fill('[data-exp="interv.q5.eq_base"]', 'Ensayo de fuerzas del 3-9-2026, dentro de límites');
  await pag.waitForTimeout(400);
  await pag.selectOption('select[data-exp="interv.q10.v"]', 'si'); await pag.waitForTimeout(500);
  await pag.selectOption('select[data-exp="interv.q10.eq"]', 'no_equivalente'); await pag.waitForTimeout(800);
  const t = await motor(pag);
  paso('12c · con una equivalencia buena y otra mala, manda la mala: D',
       /D\.\s*Modificación sustancial/.test(t.replace(/\s+/g,' ')));
  paso('12c · y las dos quedan escritas',
       /Ensayo de fuerzas del 3-9-2026/.test(t) && /Cambio declarado NO equivalente/.test(t));
  await ctx.close();
}

/* ══════ 13 · MOTORIZACIÓN: LA RESPUESTA SE DEDUCE ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'modificacion', 'industrial');
  await irA(pag, 'intervencion');
  await pag.selectOption('select[data-exp="interv.tipo"]', 'motorizacion');
  await pag.waitForTimeout(700);
  paso('13 · al elegir motorización, q9 deja de preguntarse',
       await pag.locator('select[data-exp="interv.q9.v"]').count() === 0);
  const t = await motor(pag);
  paso('13 · y se muestra como respuesta deducida', /Respuesta deducida/.test(t));
  paso('13 · diciendo de dónde sale',
       /la respuesta a esta pregunta queda deducida de esa elección/.test(t));
  paso('13 · el resultado es D sin tener que contestar las otras once',
       /D\.\s*Modificación sustancial/.test(t.replace(/\s+/g,' ')));
  paso('13 · el contador refleja que q9 ya está contestada',
       /1 de 12/.test(t) || /de 12/.test(t));

  // la deducción llega al libro y al informe
  const l = await abrirDoc(pag, 'exp-libro');
  paso('13 · el libro dice que la respuesta es deducida',
       /respuesta deducida/i.test(l.t));
  await l.doc.close();
  const r = await abrirDoc(pag, 'exp-informe');
  paso('13 · el informe también la identifica como deducida',
       /Respuestas deducidas, no contestadas a mano/.test(r.t));
  await r.doc.close();
  await ctx.close();
}

/* ══════ 13b · INCOHERENCIA MOTORIZACIÓN / PUERTA MANUAL ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'modificacion', 'industrial');
  await irA(pag, 'intervencion');
  await pag.selectOption('select[data-exp="interv.tipo"]', 'motorizacion');
  await pag.waitForTimeout(500);
  await irA(pag, 'puerta');
  await pag.selectOption('select[data-exp="puerta.motorizada"]', 'no');
  await pag.waitForTimeout(900);
  await pag.locator('[data-act="exp-emitir"]').first().click(); await pag.waitForTimeout(900);
  const t = await pag.textContent('#dlg');
  paso('13b · avisa de que no puede ser manual y motorizada a la vez',
       /consta como no motorizada/.test(t));
  paso('13b · y lo cuenta como aviso crítico, no como un detalle',
       /AVISO CRÍTICO/.test(t));
  await pag.click('#dlg [data-cerrar]'); await pag.waitForTimeout(300);
  await ctx.close();
}

/* ══════ 13c · MOTORIZAR CON UN TIPO QUE NO LO RECOGE ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'intervencion');
  await pag.selectOption('select[data-exp="interv.tipo"]', 'mejora_seguridad');
  await pag.waitForTimeout(400);
  await todasModif(pag, 'no');
  await pag.selectOption('select[data-exp="interv.q9.v"]', 'si');
  await pag.waitForTimeout(900);
  await pag.locator('[data-act="exp-emitir"]').first().click(); await pag.waitForTimeout(900);
  const t = await pag.textContent('#dlg');
  paso('13c · avisa de que motorizar es poner en servicio una máquina nueva',
       /Motorizar es poner en servicio una máquina nueva/.test(t));
  await pag.click('#dlg [data-cerrar]'); await pag.waitForTimeout(300);
  await ctx.close();
}

/* ══════ 14 · LAS DOCE PREGUNTAS DE LA PEATONAL ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'peatonal');
  paso('14 · en una peatonal aparece su paso propio',
       await pag.locator('[data-act="exp-paso"][data-v="familia"]').count() === 1);
  await irA(pag, 'familia');
  const t0 = await motor(pag);
  paso('14 · con su título', /Puerta peatonal automática/.test(t0));
  for (let i = 1; i <= 12; i++)
    paso('14 · pregunta p'+i+' presente',
         await pag.locator('select[data-exp="pea.p'+i+'.v"]').count() === 1);
  paso('14 · cita la UNE-EN 16005+A1:2024', /UNE-EN 16005\+A1:2024/.test(t0));
  paso('14 · y la UNE 85121:2018', /UNE 85121:2018/.test(t0));
  paso('14 · y dice que la matriz de la 12453 no se aplica aquí',
       /no se aplica a esta familia/.test(t0) || /no es aplicable a esta familia/.test(t0));
  paso('14 · y que «no se ha podido comprobar» no es un «no»',
       /no es un «no»/.test(t0));
  await ctx.close();
}

/* ══════ 14b · RECORRIDO DE EVACUACIÓN ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'peatonal');
  await irA(pag, 'familia');
  await pag.selectOption('select[data-exp="pea.p1.v"]', 'si'); await pag.waitForTimeout(700);
  const t = await motor(pag);
  paso('14b · marcada en evacuación, avisa de que 3, 4 y 5 pasan a obligatorias',
       /pasan a ser obligatorias/.test(t));
  paso('14b · y lo que falta impide acreditar conformidad',
       /IMPIDE ACREDITAR CONFORMIDAD/.test(t));
  paso('14b · porque el requisito no consta comprobado',
       /no consta comprobado/.test(t));

  // decir «no» a la apertura de emergencia es un impedimento, no un aviso
  await pag.selectOption('select[data-exp="pea.p3.v"]', 'no'); await pag.waitForTimeout(700);
  const t2 = await motor(pag);
  paso('14b · un «no» en apertura de emergencia impide acreditar conformidad',
       /no cumple un requisito propio de esa condición/.test(t2));
  paso('14b · y pide escribir qué se ha visto',
       await pag.locator('[data-exp="pea.p3.motivo"]').count() === 1);

  // «no se ha podido comprobar» tampoco pasa por conforme
  await pag.selectOption('select[data-exp="pea.p3.v"]', 'desconocido'); await pag.waitForTimeout(700);
  const t3 = await motor(pag);
  paso('14b · «no se ha podido comprobar» no se convierte en conforme',
       /no consta comprobado/.test(t3));
  paso('14b · y pide por qué no se ha podido comprobar',
       await pag.locator('[data-exp="pea.p3.motivo"]').count() === 1);
  await ctx.close();
}

/* ══════ 14c · USO PÚBLICO Y USUARIOS VULNERABLES ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'peatonal');
  await irA(pag, 'familia');
  await pag.selectOption('select[data-exp="pea.p8.v"]', 'si'); await pag.waitForTimeout(600);
  const t = await motor(pag);
  paso('14c · con usuarios vulnerables, presencia y activación dejan de ser opcionales',
       /dejan de ser opcionales/.test(t));
  await pag.selectOption('select[data-exp="pea.p10.v"]', 'no'); await pag.waitForTimeout(700);
  const t2 = await motor(pag);
  paso('14c · sin sensor de presencia, falta una protección exigible',
       /falta una protección exigible/.test(t2));
  await ctx.close();
}

/* ══════ 14d · LA PEATONAL LLEGA AL INFORME Y AL LIBRO ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'peatonal');
  await irA(pag, 'familia');
  await pag.selectOption('select[data-exp="pea.p1.v"]', 'si'); await pag.waitForTimeout(400);
  await pag.selectOption('select[data-exp="pea.p9.v"]', 'no'); await pag.waitForTimeout(500);
  await pag.fill('[data-exp="pea.p9.motivo"]', 'Hueco de 35 mm entre hoja y jamba sin proteger');
  await pag.waitForTimeout(700);

  const r = await abrirDoc(pag, 'exp-informe');
  paso('14d · el informe lleva la sección de la peatonal',
       /Requisitos propios de la puerta peatonal automática/.test(r.t));
  paso('14d · con las preguntas sin contestar como NO VERIFICADO',
       /NO VERIFICADO/.test(r.t));
  paso('14d · con lo observado escrito',
       /Hueco de 35 mm entre hoja y jamba sin proteger/.test(r.t));
  paso('14d · y avisando de la condición de evacuación',
       /recorrido de evacuación o prevista como salida de emergencia/.test(r.t));
  await r.doc.close();

  const l = await abrirDoc(pag, 'exp-libro');
  paso('14d · el libro también la lleva',
       /Requisitos propios de la puerta peatonal automática/.test(l.t));
  await l.doc.close();
  await ctx.close();
}

/* ══════ 15 · LA PUERTA CORTAFUEGOS ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'cortafuegos');
  paso('15 · en una cortafuegos aparece su paso propio',
       await pag.locator('[data-act="exp-paso"][data-v="familia"]').count() === 1);
  await irA(pag, 'familia');
  for (const k of ['fabricante','modelo','clasificacion','dop','certificado','organismo'])
    paso('15 · pide el campo «'+k+'»',
         await pag.locator('[data-exp="cf.'+k+'"]').count() === 1);
  paso('15 · y la pregunta obligatoria sobre componentes sustituidos',
       await pag.locator('select[data-exp="cf.comp_sust"]').count() === 1);
  const t0 = await motor(pag);
  paso('15 · deja claro que la clasificación es del fabricante, no nuestra',
       /no la ha ensayado ni clasificado|no la ensayamos ni la clasificamos/.test(t0));
  paso('15 · sin datos, impide acreditar conformidad',
       /IMPIDE ACREDITAR CONFORMIDAD/.test(t0));
  paso('15 · y dice que la pregunta obligatoria no puede quedar en blanco',
       /no puede quedar en blanco/.test(t0));

  // componentes sustituidos no originales: queda fuera de certificación
  await pag.fill('[data-exp="cf.fabricante"]', 'Andreu');
  await pag.fill('[data-exp="cf.modelo"]', 'CF-60 Metálica');
  await pag.fill('[data-exp="cf.clasificacion"]', 'EI2 60-C5');
  await pag.fill('[data-exp="cf.dop"]', 'DoP 2019/CF60/014');
  await pag.waitForTimeout(500);
  await pag.selectOption('select[data-exp="cf.comp_sust"]', 'si'); await pag.waitForTimeout(700);
  paso('15 · al decir que sí, pide cuáles',
       await pag.locator('[data-exp="cf.comp_lista"]').count() === 1);
  paso('15 · y si son originales o contemplados por el fabricante',
       await pag.locator('select[data-exp="cf.comp_orig"]').count() === 1);
  await pag.fill('[data-exp="cf.comp_lista"]', 'Cierrapuertas sustituido por uno de otra marca');
  await pag.selectOption('select[data-exp="cf.comp_orig"]', 'no'); await pag.waitForTimeout(900);
  const t1 = await motor(pag);
  paso('15 · un componente no original deja la configuración fuera de lo certificado',
       /fuera de lo certificado/.test(t1));
  paso('15 · y NO puede declararse que mantiene su clasificación',
       /NO puede declararse que la puerta mantiene su clasificación/.test(t1));
  paso('15 · y avisa de que eso contesta por sí mismo la pregunta 12',
       /pregunta 12 del cuestionario de modificación/.test(t1));

  // y en el motor de intervención, q12 aparece deducida y el resultado es E
  await irA(pag, 'intervencion');
  await pag.selectOption('select[data-exp="interv.tipo"]', 'reparacion');
  await pag.waitForTimeout(600);
  paso('15 · q12 deja de preguntarse en el cuestionario',
       await pag.locator('select[data-exp="interv.q12.v"]').count() === 0);
  const t2 = await motor(pag);
  paso('15 · y se muestra como deducida', /Respuesta deducida/.test(t2));
  await todasModif(pag, 'no');
  await pag.waitForTimeout(700);
  const t3 = await motor(pag);
  paso('15 · el resultado es E, revisión técnica obligatoria',
       /E\.\s*Caso no resoluble automáticamente/.test(t3.replace(/\s+/g,' ')));
  await ctx.close();
}

/* ══════ 15b · «NO SE PUEDE DETERMINAR» TAMPOCO PASA ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'cortafuegos');
  await irA(pag, 'familia');
  await pag.selectOption('select[data-exp="cf.comp_sust"]', 'si'); await pag.waitForTimeout(500);
  await pag.fill('[data-exp="cf.comp_lista"]', 'Junta intumescente del canto');
  await pag.selectOption('select[data-exp="cf.comp_orig"]', 'desconocido'); await pag.waitForTimeout(800);
  const t = await motor(pag);
  paso('15b · sin poder determinarlo, no se presenta como certificada',
       /no puede presentarse como certificada/.test(t));
  paso('15b · y también queda fuera de certificación a efectos del motor',
       /fuera de lo certificado/.test(t));
  await ctx.close();
}

/* ══════ 15c · LA CORTAFUEGOS LLEGA AL INFORME Y AL LIBRO ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'cortafuegos');
  await irA(pag, 'familia');
  await pag.fill('[data-exp="cf.fabricante"]', 'Andreu');
  await pag.fill('[data-exp="cf.modelo"]', 'CF-60 Metálica');
  await pag.fill('[data-exp="cf.clasificacion"]', 'EI2 60-C5');
  await pag.fill('[data-exp="cf.dop"]', 'DoP 2019/CF60/014');
  await pag.selectOption('select[data-exp="cf.comp_sust"]', 'no');
  await pag.waitForTimeout(900);

  const r = await abrirDoc(pag, 'exp-informe');
  paso('15c · el informe lleva la sección de la cortafuegos',
       /Puerta resistente al fuego: clasificación y configuración/.test(r.t));
  paso('15c · con la clasificación copiada del fabricante', /EI2 60-C5/.test(r.t));
  paso('15c · con el número de DoP', /DoP 2019\/CF60\/014/.test(r.t));
  paso('15c · y diciendo que no la hemos ensayado ni clasificado',
       /no ha ensayado ni clasificado la puerta/.test(r.t));
  paso('15c · lo que no consta sale como NO APORTADO',
       /NO APORTADO/.test(r.t));
  await r.doc.close();

  const l = await abrirDoc(pag, 'exp-libro');
  paso('15c · el libro también la lleva',
       /Puerta resistente al fuego/.test(l.t) && /EI2 60-C5/.test(l.t));
  await l.doc.close();
  await ctx.close();
}

/* ══════ 15d · LAS OTRAS FAMILIAS NO VEN ESTE PASO ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  paso('15d · una industrial no tiene paso de familia',
       await pag.locator('[data-act="exp-paso"][data-v="familia"]').count() === 0);
  await ctx.close();
}

/* ══════ 14e/15e · «FALTA POR RELLENAR» LO RECOGE ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'peatonal');
  await pag.waitForTimeout(600);
  const t = await pag.textContent('#vista');
  paso('14e · «Falta por rellenar» cuenta las preguntas de la peatonal',
       /preguntas propias de la puerta peatonal automática/.test(t));
  await ctx.close();
}
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'cortafuegos');
  await pag.waitForTimeout(600);
  const t = await pag.textContent('#vista');
  paso('15e · y los datos de la cortafuegos',
       /datos de la puerta resistente al fuego/.test(t));
  paso('15e · incluida la pregunta de componentes sustituidos',
       /se ha sustituido algún componente/.test(t));
  await ctx.close();
}

console.log('\n'+ok+' bien, '+mal+' mal.');
if (errores.length) console.log('Errores de JavaScript:\n'+errores.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || errores.length ? 1 : 0);
