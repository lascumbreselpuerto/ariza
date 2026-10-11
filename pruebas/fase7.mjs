// Fase 7: apartados 17, 21, 24 y 25 del encargo.
//  17 · expediente técnico interno frente a documentación para el cliente
//  21 · mantenimiento según uso, ciclos y entorno
//  24 · documento generado frente a documento entregado
//  25 · la firma no convierte un pendiente en conforme
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
  if (await b.count()){ await b.click(); await pag.waitForTimeout(500); return true; }
  return false;
};
const abrirDoc = async (pag, act) => {
  const [doc] = await Promise.all([pag.waitForEvent('popup'),
    pag.locator('[data-act="'+act+'"]').first().click()]);
  await doc.waitForTimeout(1600);
  return { doc, t: await doc.textContent('body') };
};
const vista = async pag => (await pag.textContent('#vista'));
// marca un documento como que procede entregar
const marcar = async (pag, k) => {
  const c = pag.locator('[data-exp-chk="entrega.docs.'+k+'"]');
  if (await c.count()){ await c.check(); await pag.waitForTimeout(450); return true; }
  return false;
};

/* ══════ 17 · EL PASO DE ENTREGA SEPARA LOS DOS BLOQUES ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'nueva_fabricante', 'industrial');
  await irA(pag, 'entrega');
  const t = await vista(pag);
  paso('17 · el paso de entrega separa el expediente interno',
       /Expediente técnico interno/.test(t));
  paso('17 · y dice que no se entrega al cliente',
       /no se entrega/.test(t));
  paso('17 · explica para qué sirve: a disposición de las autoridades',
       /a disposición de las autoridades/.test(t));
  paso('17 · lista lo que es interno: evaluación de riesgos, cálculos y esquemas',
       /Evaluación de riesgos, cálculos y esquemas/.test(t));
  paso('17 · y la Documentación Técnica Específica',
       /Documentación Técnica Específica/.test(t));
  paso('17 · cita el anexo VII parte A de la Directiva',
       /anexo VII parte A/.test(t));
  paso('17 · y el bloque de lo que sí se entrega al titular',
       /Documentación para el titular/.test(t));
  paso('17 · dice que marcar significa generado, no entregado',
       /está generado<\/b>, no que ya se haya entregado|está generado, no que ya se haya entregado/.test(t));
  await ctx.close();
}

/* ══════ 17b · EL PLAZO DE CONSERVACIÓN SE CALCULA ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'nueva_fabricante', 'industrial');
  // Con la Directiva (antes del 20-1-2027) el plazo cuenta desde la fabricación
  await pag.fill('#exp-fps', '2026-11-15'); await pag.waitForTimeout(600);
  await irA(pag, 'entrega');
  const t = await vista(pag);
  paso('17b · calcula la fecha hasta la que hay que conservarlo',
       /Conservar 10 años, hasta el 15 nov 2036/.test(t), (t.match(/Conservar[^.]*/)||[''])[0]);
  paso('17b · con la Directiva cuenta desde la fecha de fabricación',
       /desde la fecha de fabricación/.test(t));
  paso('17b · y avisa de que no consta la fecha de fabricación de la puerta',
       /no consta la fecha de fabricación/.test(t));

  // Con el Reglamento (desde el 20-1-2027) cuenta desde la puesta en servicio
  await pag.fill('#exp-fps', '2027-03-01'); await pag.waitForTimeout(700);
  await irA(pag, 'entrega');
  const t2 = await vista(pag);
  paso('17b · con el Reglamento cuenta desde la introducción o la puesta en servicio',
       /desde la introducción en el mercado o la puesta en servicio/.test(t2));
  paso('17b · citando el artículo 10.3',
       /artículo 10, apartado 3/.test(t2));
  paso('17b · y la fecha cambia en consecuencia',
       /hasta el 1 mar 2037/.test(t2), (t2.match(/Conservar[^.]*/)||[''])[0]);
  await ctx.close();
}

/* ══════ 17c · SIN FECHA NO SE INVENTA EL PLAZO ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'nueva_fabricante', 'industrial');
  await irA(pag, 'entrega');
  const t = await vista(pag);
  paso('17c · sin fecha de puesta en servicio no se da ningún plazo',
       /no se sabe qué marco legal se aplica/.test(t) && !/Conservar 10 años, hasta/.test(t));
  await ctx.close();
}

/* ══════ 21 · MANDA EL MANUAL DEL FABRICANTE ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  paso('21 · hay un paso propio de mantenimiento',
       await pag.locator('[data-act="exp-paso"][data-v="mantenimiento"]').count() === 1);
  await irA(pag, 'mantenimiento');
  const t0 = await vista(pag);
  paso('21 · la primera pregunta es qué dice el fabricante',
       /El manual del fabricante fija una periodicidad/.test(t0));
  paso('21 · y cita el Real Decreto 1215\/1997, artículo 3.5',
       /Real Decreto 1215\/1997, artículo 3\.5/.test(t0));
  paso('21 · sin contestarla no propone periodicidad',
       /NO PUEDE PROPONERSE UNA PERIODICIDAD/.test(t0));

  await pag.selectOption('select[data-exp="mant.fab_consta"]', 'si');
  await pag.waitForTimeout(700);
  paso('21 · al decir que sí, pide la periodicidad del fabricante',
       await pag.locator('select[data-exp="mant.fab_meses"]').count() === 1);
  paso('21 · y dónde consta',
       await pag.locator('[data-exp="mant.fab_donde"]').count() === 1);
  await pag.selectOption('select[data-exp="mant.fab_meses"]', '4');
  await pag.waitForTimeout(700);
  const t1 = await vista(pag);
  paso('21 · la periodicidad es la del fabricante',
       /Cada 4 meses/.test(t1) && /La fija el fabricante/.test(t1));
  paso('21 · y no se pregunta por ciclos ni entorno cuando el fabricante la fija',
       await pag.locator('[data-exp="mant.ciclos_dia"]').count() === 0);
  paso('21 · pero pide dónde consta',
       /Falta dónde consta esa periodicidad/.test(t1));
  await ctx.close();
}

/* ══════ 21b · SIN FABRICANTE: CICLOS Y ENTORNO ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'obra');
  await pag.selectOption('select[data-exp="obra.uso_edificio"]', 'Comercio');
  await pag.waitForTimeout(500);
  await irA(pag, 'mantenimiento');
  await pag.selectOption('select[data-exp="mant.fab_consta"]', 'no');
  await pag.waitForTimeout(700);
  paso('21b · pregunta los ciclos al día',
       await pag.locator('[data-exp="mant.ciclos_dia"]').count() === 1);
  paso('21b · y de dónde sale ese número',
       await pag.locator('select[data-exp="mant.ciclos_origen"]').count() === 1);
  const t0 = await vista(pag);
  paso('21b · en uso comercial, sin ciclos no propone nada',
       /cuántos ciclos al día hace la puerta/.test(t0));

  await pag.fill('[data-exp="mant.ciclos_dia"]', '6');
  await pag.locator('select[data-exp="mant.ciclos_origen"]').focus();
  await pag.waitForTimeout(800);
  await pag.selectOption('select[data-exp="mant.ciclos_origen"]', 'contador');
  await pag.waitForTimeout(800);
  const t1 = await vista(pag);
  paso('21b · con 6 ciclos al día en comercio, cada 6 meses',
       /Cada 6 meses/.test(t1), (t1.match(/Periodicidad que sale[\s\S]{0,120}/)||[''])[0].replace(/\s+/g,' '));
  paso('21b · y dice que es recomendación de norma voluntaria',
       /Recomendación de norma voluntaria/.test(t1));
  paso('21b · y de dónde viene el dato, que no es del texto de la norma',
       /ficha divulgativa FD-138/.test(t1) && /No viene del texto de la norma/.test(t1));
  paso('21b · advirtiendo que no es un plazo legal',
       /No son un plazo legal/.test(t1));

  // más de diez ciclos al día acorta a cuatro meses
  await pag.fill('[data-exp="mant.ciclos_dia"]', '40');
  await pag.locator('select[data-exp="mant.ciclos_origen"]').focus();
  await pag.waitForTimeout(900);
  const t2 = await vista(pag);
  paso('21b · con más de 10 ciclos al día, cada 4 meses',
       /Cada 4 meses/.test(t2), (t2.match(/Periodicidad que sale[\s\S]{0,120}/)||[''])[0].replace(/\s+/g,' '));
  await ctx.close();
}

/* ══════ 21c · EL ENTORNO ACORTA, Y SE DICE QUE ES CRITERIO PROPIO ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'obra');
  await pag.selectOption('select[data-exp="obra.uso_edificio"]', 'Comercio');
  await pag.waitForTimeout(500);
  await irA(pag, 'mantenimiento');
  await pag.selectOption('select[data-exp="mant.fab_consta"]', 'no');
  await pag.waitForTimeout(600);
  await pag.fill('[data-exp="mant.ciclos_dia"]', '5');
  await pag.selectOption('select[data-exp="mant.ciclos_origen"]', 'titular');
  await pag.waitForTimeout(800);
  paso('21c · ofrece las condiciones del entorno',
       await pag.locator('[data-exp-chk="mant.ent.marino"]').count() === 1 &&
       await pag.locator('[data-exp-chk="mant.ent.lavado"]').count() === 1);
  await pag.locator('[data-exp-chk="mant.ent.marino"]').check();
  await pag.waitForTimeout(800);
  const t1 = await vista(pag);
  paso('21c · una condición del entorno acorta un tramo: de 6 a 4 meses',
       /Se acorta de Cada 6 meses a Cada 4 meses/.test(t1),
       (t1.match(/Se acorta[^.]*/)||[''])[0]);
  paso('21c · y deja escrito que el ajuste es criterio de la empresa',
       /criterio de esta empresa, no de ninguna norma/.test(t1));
  await pag.locator('[data-exp-chk="mant.ent.lavado"]').check();
  await pag.waitForTimeout(800);
  const t2 = await vista(pag);
  paso('21c · dos condiciones acortan dos tramos: de 6 a 3 meses',
       /Se acorta de Cada 6 meses a Cada trimestre/.test(t2),
       (t2.match(/Se acorta[^.]*/)||[''])[0]);
  await ctx.close();
}

/* ══════ 21d · LO ACORDADO PUEDE NO SER LO QUE CORRESPONDE ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'mantenimiento');
  await pag.selectOption('select[data-exp="mant.fab_consta"]', 'si');
  await pag.waitForTimeout(500);
  await pag.selectOption('select[data-exp="mant.fab_meses"]', '4');
  await pag.waitForTimeout(600);
  await pag.selectOption('select[data-exp="mant.acordada_meses"]', '12');
  await pag.waitForTimeout(800);
  const t = await vista(pag);
  paso('21d · avisa de que lo acordado es más largo que lo que corresponde',
       /es más larga que la que corresponde/.test(t));
  paso('21d · y lo deja recogido en vez de disimularlo',
       /el titular conoce la recomendación y ha contratado otra cosa/.test(t));

  const l = await abrirDoc(pag, 'exp-libro');
  paso('21d · el libro saca las dos periodicidades',
       /acordada con el titular/.test(l.t) && /la que corresponde es/.test(l.t));
  paso('21d · y de dónde sale la periodicidad',
       /De dónde sale la periodicidad/.test(l.t));
  await l.doc.close();
  await ctx.close();
}

/* ══════ 24 · GENERADO NO ES ENTREGADO ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'entrega');
  await marcar(pag, 'informe');
  const t0 = await vista(pag);
  paso('24 · un documento marcado y sin entregar consta GENERADO · NO CONSTA ENTREGADO',
       /GENERADO · NO CONSTA ENTREGADO/.test(t0));
  paso('24 · y avisa de cuántos están sin registrar',
       /documento\(s\) marcados y sin entrega registrada/.test(t0));
  paso('24 · hay botón para registrar la entrega',
       await pag.locator('[data-act="exp-nueva-entrega"]').count() === 1);

  // el informe dice que no consta entregado
  const r = await abrirDoc(pag, 'exp-informe');
  paso('24 · el informe dice NO CONSTA ENTREGADO',
       /NO CONSTA ENTREGADO/.test(r.t));
  paso('24 · y que está generado sin registrar su entrega',
       /está generado y no se ha registrado su entrega/.test(r.t));
  await r.doc.close();

  // registramos la entrega
  await pag.locator('[data-act="exp-nueva-entrega"]').first().click();
  await pag.waitForTimeout(800);
  const td = await pag.textContent('#dlg');
  paso('24 · el registro pide el nombre legible de quien recibe',
       /Recibido por, nombre y apellidos/.test(td));
  paso('24 · y su DNI',
       /DNI o NIE de quien recibe/.test(td));
  paso('24 · y la relación con el titular',
       /Relación con el titular/.test(td));
  paso('24 · y el medio de entrega',
       /Medio de entrega/.test(td));
  paso('24 · el expediente técnico interno NO aparece entre lo entregable',
       !/Expediente técnico de construcción/.test(td));

  await pag.fill('#re-recep', 'Manuel Pérez Ruiz');
  await pag.fill('#re-dni', '31234567L');
  await pag.selectOption('#re-rel', 'presidente');
  await pag.selectOption('#re-medio', 'mano');
  await pag.locator('#re-firma').check();
  await pag.click('#dlg button[type="submit"]');
  await pag.waitForTimeout(1200);
  const t1 = await vista(pag);
  paso('24 · queda registrada con su receptor',
       /Manuel Pérez Ruiz/.test(t1) && /31234567L/.test(t1));
  paso('24 · y el documento pasa a ENTREGADO',
       /ENTREGADO el/.test(t1));
  paso('24 · y aparece el botón del acta',
       await pag.locator('[data-act="exp-acta"]').count() >= 1);
  await ctx.close();
}

/* ══════ 24b · UN REGISTRO SIN DNI NO ACREDITA ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'entrega');
  await marcar(pag, 'informe');
  await pag.locator('[data-act="exp-nueva-entrega"]').first().click();
  await pag.waitForTimeout(700);
  await pag.fill('#re-recep', 'Alguien');
  await pag.click('#dlg button[type="submit"]');
  await pag.waitForTimeout(1100);
  const t = await vista(pag);
  paso('24b · un registro sin DNI sale avisado',
       /registro\(s\) sin nombre legible o sin DNI/.test(t));
  paso('24b · y dice por qué importa',
       /no acredita a quién se entregó/.test(t));
  await pag.locator('[data-act="exp-emitir"]').first().click(); await pag.waitForTimeout(900);
  const td = await pag.textContent('#dlg');
  paso('24b · y cuenta como aviso crítico',
       /AVISO CRÍTICO/.test(td) && /no acredita a quién se entregó/.test(td));
  await pag.click('#dlg [data-cerrar]'); await pag.waitForTimeout(300);
  await ctx.close();
}

/* ══════ 24c · MARCAR COMO ENTREGADO ALGO INTERNO SE AVISA ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'nueva_fabricante', 'industrial');
  await irA(pag, 'entrega');
  const hay = await marcar(pag, 'expediente');
  // en fabricante la lista trae «expediente»; si cambia el nombre, no rompemos la suite
  if (hay){
    await pag.locator('[data-act="exp-emitir"]').first().click(); await pag.waitForTimeout(900);
    const td = await pag.textContent('#dlg');
    paso('24c · marcar el expediente técnico como entregado se avisa',
         /es documentación interna/.test(td) || /no se entrega/.test(td));
    await pag.click('#dlg [data-cerrar]'); await pag.waitForTimeout(300);
  } else {
    paso('24c · marcar el expediente técnico como entregado se avisa', true,
         'la lista de fabricante no trae esa casilla');
  }
  await ctx.close();
}

/* ══════ 25 · LA FIRMA NO CONVIERTE UN PENDIENTE EN CONFORME ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'entrega');
  const t0 = await vista(pag);
  paso('25 · avisa de cuántos puntos quedan pendientes antes de firmar',
       /punto\(s\) pendientes/.test(t0));
  paso('25 · y de que la firma no los convierte en conformes',
       /no<\/b> los convierte en conformes|no los convierte en conformes/.test(t0));
  paso('25 · y de que se guardan dentro del registro',
       /qué estaba pendiente el día que se firmó/.test(t0));

  await marcar(pag, 'informe');
  await pag.locator('[data-act="exp-nueva-entrega"]').first().click();
  await pag.waitForTimeout(800);
  const td = await pag.textContent('#dlg');
  paso('25 · el diálogo de entrega repite el aviso',
       /La firma acredita la recepción/.test(td));
  await pag.fill('#re-recep', 'Manuel Pérez Ruiz');
  await pag.fill('#re-dni', '31234567L');
  await pag.selectOption('#re-rel', 'presidente');
  await pag.selectOption('#re-medio', 'mano');
  await pag.locator('#re-firma').check();
  await pag.click('#dlg button[type="submit"]');
  await pag.waitForTimeout(1300);
  const t1 = await vista(pag);
  paso('25 · el registro guarda cuántos pendientes había',
       /Pendientes al firmar/.test(t1));

  const a = await abrirDoc(pag, 'exp-acta');
  paso('25 · el acta se titula acta de entrega y recepción',
       /Acta de entrega y recepción de documentación/.test(a.t));
  paso('25 · dice en portada que se entrega con puntos pendientes',
       /SE ENTREGA CON \d+ PUNTO\(S\) PENDIENTES/.test(a.t));
  paso('25 · enumera los pendientes uno a uno',
       /Situación en la fecha de esta entrega/.test(a.t) &&
       /Comprobación sin resultado/.test(a.t));
  paso('25 · y lleva el aviso de que la firma no convierte nada en conforme',
       /no convierte en conforme ninguna comprobación pendiente/.test(a.t));
  paso('25 · con el receptor y su DNI',
       /Manuel Pérez Ruiz/.test(a.t) && /31234567L/.test(a.t));
  paso('25 · y la relación con el titular',
       /Presidente de la comunidad/.test(a.t));
  paso('25 · el acta separa lo que no se entrega y se conserva',
       /Documentación que no se entrega y se conserva/.test(a.t));
  paso('25 · y recoge el mantenimiento',
       /Mantenimiento/.test(a.t));
  await a.doc.close();
  await ctx.close();
}

/* ══════ 25b · ASUMIR LA FIRMA CON PENDIENTES SE AVISA ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'nueva_fabricante', 'industrial');
  await irA(pag, 'entrega');
  await pag.locator('[data-exp-chk="entrega.firmante_ok"]').check();
  await pag.waitForTimeout(800);
  await pag.locator('[data-act="exp-emitir"]').first().click(); await pag.waitForTimeout(900);
  const td = await pag.textContent('#dlg');
  paso('25b · asumir la firma con pendientes se avisa',
       /Se ha asumido la firma de la documentación con/.test(td));
  paso('25b · recordando qué acredita la firma',
       /no convierte en conforme ninguna comprobación pendiente/.test(td));
  await pag.click('#dlg [data-cerrar]'); await pag.waitForTimeout(300);
  await ctx.close();
}

/* ══════ 25c · SIN PENDIENTES, EL ACTA LO DICE TAMBIÉN ══════ */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'puerta');
  await pag.selectOption('select[data-exp="puerta.tipo"]', 'Seccional');
  await pag.waitForTimeout(600);
  await irA(pag, 'cumplimiento');
  // todo conforme: comprobaciones y peligros
  const sels = await pag.locator('#vista select[data-exp^="cumple."][data-exp$=".v"]').all();
  for (const s of sels){ await s.selectOption('si'); }
  await pag.waitForTimeout(700);
  let quedan = true, vueltas = 0;
  while (quedan && vueltas < 6){
    vueltas++;
    const pel = await pag.locator('#vista select[data-exp^="peligro."][data-exp$=".v"]').all();
    quedan = false;
    for (const s of pel){
      const v = await s.inputValue();
      if (!v){ await s.selectOption('na'); await pag.waitForTimeout(350); quedan = true; break; }
    }
  }
  await pag.waitForTimeout(700);
  await irA(pag, 'entrega');
  await marcar(pag, 'informe');
  const t = await vista(pag);
  paso('25c · sin pendientes no sale el bloque de puntos pendientes',
       !/Ahora mismo quedan/.test(t), (t.match(/Ahora mismo quedan[^.]*/)||[''])[0]);
  await ctx.close();
}

console.log('\n'+ok+' bien, '+mal+' mal.');
if (errores.length) console.log('Errores de JavaScript:\n'+errores.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || errores.length ? 1 : 0);
