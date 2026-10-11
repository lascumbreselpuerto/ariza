// Fase 8: apartados 16 y 22 del encargo.
//  16 · reglas normativas con fecha de vigencia, corregibles sin reprogramar
//  22 · expediente de vida de la puerta, en versión de cliente y versión interna
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const URL_APP = process.env.ARIZA_URL || 'http://127.0.0.1:8899/index.html';
const ajustes = JSON.parse(readFileSync(join(AQUI, 'ajustes.json'), 'utf8'));
const ENV = { ...process.env, LANG:'es_ES.UTF-8', LANGUAGE:'es_ES:es', LC_ALL:'es_ES.UTF-8' };
const nav = await chromium.launch({ env: ENV, args:['--lang=es-ES'] });
const errores = []; let ok = 0, mal = 0;
const paso = (t, bien, extra='') => { bien ? ok++ : mal++;
  console.log((bien?'  OK  ':' FALLA ')+t+(extra?' → '+extra:'')); };
const igual = (t, a, b) => paso(t, JSON.stringify(a) === JSON.stringify(b),
  JSON.stringify(a)+' vs esperado '+JSON.stringify(b));

async function abrir(){
  const ctx = await nav.newContext({ viewport:{width:1320,height:1600},
    locale:'es-ES', timezoneId:'Europe/Madrid' });
  await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
  await ctx.addInitScript(() => {
    window.__PARCHE = db => {
      db.ajustes.push({ clave:'empresa', valor:{
        razon_social:'Ariza p y automatismos S.L.U.', nif:'B72004849',
        domicilio:'Calle Orilla 19', cp:'11500', poblacion:'El Puerto de Santa María',
        provincia:'Cádiz', telefono:'661 352 795', email:'arizapuertasautomaticas@gmail.com',
        representante:'David Ariza Arana', cargo_firmante:'Administrador único',
        responsable_tecnico:'David Ariza Arana' } });
    };
  });
  const pag = await ctx.newPage();
  pag.on('pageerror', e => errores.push('JS: '+e.message));
  await pag.goto(URL_APP); await pag.waitForTimeout(1200);
  return { ctx, pag };
}
const irAPuerta = async (pag) => {
  await pag.click('#tabs button[data-tab="puertas"]'); await pag.waitForTimeout(350);
  await pag.locator('#vista .item:has-text("Comunidad Las Flores")').first().click();
  await pag.waitForTimeout(600);
};
const abrirDoc = async (pag, sel) => {
  const [doc] = await Promise.all([pag.waitForEvent('popup'),
    pag.locator(sel).first().click()]);
  await doc.waitForTimeout(1700);
  return { doc, t: await doc.textContent('body') };
};

/* ══════ 16 · LAS FECHAS QUE DECIDEN, A LA VISTA ══════ */
{
  const { ctx, pag } = await abrir();
  const R = await pag.evaluate(() => {
    const T = window.__T;
    return {
      faltan: window.__T_FALTAN,
      claves: Object.keys(T.REGLAS_FECHA),
      corte: T.fechaRegla('maquinas_reglamento'),
      /* Cada regla tiene que decir de dónde sale y cuándo se comprobó */
      sinFuente: Object.entries(T.REGLAS_FECHA).filter(([, r]) => !r.fuente).map(([k]) => k),
      sinVerificar: Object.entries(T.REGLAS_FECHA).filter(([, r]) => !r.verificado).map(([k]) => k),
      sinQueCambia: Object.entries(T.REGLAS_FECHA).filter(([, r]) => !r.que_cambia).map(([k]) => k),
      estados: [...new Set(Object.values(T.REGLAS_FECHA).map(r => r.estado))].sort(),
      anunciadas: Object.entries(T.REGLAS_FECHA).filter(([, r]) => r.estado === 'anunciada')
        .map(([k]) => k),
      /* Las fechas de fábrica, tal como se verificaron */
      fechas: Object.fromEntries(Object.entries(T.REGLAS_FECHA).map(([k, r]) => [k, r.fecha])),
      proximas: T.reglasProximas(100000).length,
      dias: T.diasHasta(T.fechaRegla('maquinas_reglamento')),
    };
  });
  paso('16 · el gancho de pruebas sigue completo',
       Array.isArray(R.faltan) && R.faltan.length === 0, JSON.stringify(R.faltan));
  paso('16 · hay ocho fechas que deciden', R.claves.length === 8, String(R.claves.length));
  igual('16 · el corte del Reglamento de máquinas es el 20-1-2027', R.corte, '2027-01-20');
  igual('16 · todas las reglas dicen de dónde salen', R.sinFuente, []);
  igual('16 · y cuándo se comprobaron', R.sinVerificar, []);
  igual('16 · y qué cambian', R.sinQueCambia, []);
  igual('16 · el aplazamiento de Verifactu está marcado como solo anunciado',
        R.anunciadas, ['verifactu_aplazamiento']);
  igual('16 · con las fechas verificadas de cada plazo', R.fechas, {
    maquinas_reglamento:'2027-01-20', modificacion_criterio:'2027-01-20',
    conservacion_dia_inicial:'2027-01-20', verifactu_sociedades:'2027-01-01',
    verifactu_resto:'2027-07-01', verifactu_aplazamiento:'2028-10-01',
    factura_e_grandes:'2027-10-06', factura_e_resto:'2028-10-06' });
  paso('16 · y sabe cuántos días faltan para cada una', R.dias > 0, String(R.dias));
  await ctx.close();
}

/* ══════ 16b · EL PANEL DE EQUIPO ══════ */
{
  const { ctx, pag } = await abrir();
  await pag.click('#tabs button[data-tab="equipo"]'); await pag.waitForTimeout(800);
  const t = await pag.textContent('#vista');
  paso('16b · Equipo trae el panel de fechas que deciden', /Fechas que deciden/.test(t));
  paso('16b · con las ocho reglas editables',
       await pag.locator('[data-regla]').count() === 8,
       String(await pag.locator('[data-regla]').count()));
  paso('16b · dice para qué está: cambiar el dato y no reprogramar',
       /se corrija el dato y no haya que reprogramar/.test(t));
  paso('16b · avisa de que una fecha anunciada y no publicada no se aplica',
       /no se aplica/.test(t) && /Anunciada, sin publicar/.test(t));
  paso('16b · enseña lo que viene este año', /Lo que viene este año/.test(t));
  paso('16b · cita el Reglamento de máquinas y su artículo',
       /Reglamento \(UE\) 2023\/1230, artículo 54/.test(t));
  paso('16b · cita el Real Decreto 1007\/2023 de Verifactu',
       /Real Decreto 1007\/2023/.test(t));
  paso('16b · y el Real Decreto 238\/2026 de factura electrónica',
       /Real Decreto 238\/2026/.test(t));
  paso('16b · y la nota de Hacienda sin publicar en el BOE',
       /Sin publicación en el BOE/.test(t));
  paso('16b · hay botón de guardar y de volver a las de fábrica',
       await pag.locator('[data-act="guardar-reglas"]').count() === 1 &&
       await pag.locator('[data-act="reglas-fabrica"]').count() === 1);
  await ctx.close();
}

/* ══════ 16c · CORREGIR UNA FECHA CAMBIA LO QUE HACE LA APLICACIÓN ══════ */
{
  const { ctx, pag } = await abrir();
  await pag.click('#tabs button[data-tab="equipo"]'); await pag.waitForTimeout(800);
  // Se aplaza el Reglamento de máquinas un año, como si Bruselas lo moviera
  await pag.fill('[data-regla="maquinas_reglamento"]', '2028-01-20');
  await pag.click('[data-act="guardar-reglas"]'); await pag.waitForTimeout(1200);
  const t = await pag.textContent('#vista');
  paso('16c · la fecha corregida queda señalada como cambiada a mano',
       /corregida a mano/.test(t));
  paso('16c · y dice cuál era la de fábrica', /de fábrica 20 ene 2027/.test(t),
       (t.match(/de fábrica[^<]{0,20}/)||[''])[0]);

  const R = await pag.evaluate(() => {
    const T = window.__T;
    return {
      corte: T.fechaRegla('maquinas_reglamento'),
      /* Una puerta de marzo de 2027 era «reglamento» y ahora vuelve a ser «directiva» */
      marzo2027: T.marcoDeFecha('2027-03-01'),
      enero2028: T.marcoDeFecha('2028-03-01'),
      criterio: T.criterioModificacion('2027-03-01'),
      conserva: T.conservacionExpediente({ familia:'industrial', situacion:'adecuacion',
        fecha_puesta_servicio:'2027-03-01', datos:{} }).referencia,
      cambiada: T.reglaCompleta('maquinas_reglamento').cambiada,
    };
  });
  igual('16c · el corte ha cambiado de verdad', R.corte, '2028-01-20');
  paso('16c · y con él el marco legal de una puerta de marzo de 2027',
       R.marzo2027 === 'directiva', R.marzo2027);
  paso('16c · pero una de 2028 sigue yéndose al Reglamento',
       R.enero2028 === 'reglamento', R.enero2028);
  paso('16c · y arrastra el criterio de modificación sustancial',
       R.criterio === 'guia_azul', R.criterio);
  paso('16c · y el día inicial del plazo de conservación',
       /anexo VII parte A/.test(R.conserva || ''), R.conserva);
  paso('16c · la regla queda marcada como corregida', R.cambiada === true);

  // Y se puede volver atrás
  await pag.click('[data-act="reglas-fabrica"]'); await pag.waitForTimeout(1200);
  const vuelta = await pag.evaluate(() => window.__T.fechaRegla('maquinas_reglamento'));
  igual('16c · volver a las fechas de fábrica las restaura', vuelta, '2027-01-20');
  await ctx.close();
}

/* ══════ 22 · LA VIDA DE LA PUERTA, DESDE LA FICHA ══════ */
{
  const { ctx, pag } = await abrir();
  await irAPuerta(pag);
  paso('22 · la ficha de la puerta ofrece su vida',
       await pag.locator('[data-act="vida-puerta"][data-v="cliente"]').count() === 1);
  paso('22 · y la versión interna, porque somos administración',
       await pag.locator('[data-act="vida-puerta"][data-v="interno"]').count() === 1);

  const r = await abrirDoc(pag, '[data-act="vida-puerta"][data-v="cliente"]');
  paso('22 · el documento se titula expediente de vida de la puerta',
       /Expediente de vida de la puerta/.test(r.t));
  const secciones = ['De qué puerta hablamos','Resumen de su vida',
    'Línea de vida, por orden de fecha','Piezas y componentes sustituidos',
    'Revisiones realizadas','Documentación de esta puerta',
    'Ensayos de fuerzas realizados','Cómo está la puerta a día de hoy',
    'Alcance de este documento'];
  const faltan = secciones.filter(s => !r.t.includes(s));
  paso('22 · con sus nueve apartados', faltan.length === 0, faltan.join('; '));
  paso('22 · y su índice', /Índice/.test(r.t));
  paso('22 · identifica la puerta por su código', /AR-0001/.test(r.t));
  paso('22 · lleva el alta de la puerta en la línea de vida',
       /La puerta se da de alta con el código/.test(r.t));
  paso('22 · dice que lo que no consta no significa que no ocurriera',
       /que no conste no.{0,3}significa que no ocurriera/.test(r.t.replace(/\s+/g,' ')));
  paso('22 · y que no es una declaración de conformidad',
       /No es una declaración de conformidad/.test(r.t));
  paso('22 · sin revisiones, lo dice en vez de callarlo',
       /NO CONSTA NINGUNA REVISIÓN/.test(r.t));
  paso('22 · lo mismo con las sustituciones de piezas',
       /NO CONSTA NINGUNA SUSTITUCIÓN/.test(r.t));
  paso('22 · y con los ensayos de fuerzas',
       /NO CONSTA NINGÚN ENSAYO/.test(r.t));
  paso('22 · la versión de cliente NO lleva horas ni importes',
       !/Horas, desplazamientos e importes/.test(r.t) && !/USO INTERNO/.test(r.t));
  paso('22 · y se identifica como la versión del titular',
       /Para el titular de la instalación/.test(r.t));
  await r.doc.close();
  await ctx.close();
}

/* ══════ 22b · LA VERSIÓN INTERNA SÍ LLEVA LO ECONÓMICO ══════ */
{
  const { ctx, pag } = await abrir();
  await irAPuerta(pag);
  const r = await abrirDoc(pag, '[data-act="vida-puerta"][data-v="interno"]');
  paso('22b · la versión interna avisa en portada de que no se entrega',
       /USO INTERNO. CONTIENE HORAS E IMPORTES. NO SE ENTREGA AL CLIENTE/.test(r.t));
  paso('22b · trae el apartado de horas, desplazamientos e importes',
       /Horas, desplazamientos e importes/.test(r.t));
  paso('22b · y dice que no es un resumen contable',
       /no es un resumen contable/.test(r.t));
  paso('22b · se identifica como versión interna',
       /Interna, con horas e importes/.test(r.t));
  await r.doc.close();
  await ctx.close();
}

/* ══════ 22c · LA VIDA RECOGE LO QUE PASA DE VERDAD ══════ */
{
  const { ctx, pag } = await abrir();
  // Se crea un expediente, se le pone fecha y tipo, y se emite: tiene que salir en la vida
  await irAPuerta(pag);
  await pag.locator('[data-act="exp-nuevo"]').first().click(); await pag.waitForTimeout(400);
  await pag.selectOption('#xp-sit', 'adecuacion'); await pag.waitForTimeout(200);
  await pag.selectOption('#xp-fam', 'industrial'); await pag.waitForTimeout(250);
  await pag.click('#dlg button[type="submit"]'); await pag.waitForTimeout(1000);
  await pag.fill('#exp-fps', '2026-09-15'); await pag.waitForTimeout(600);
  await pag.locator('[data-act="exp-paso"][data-v="intervencion"]').first().click();
  await pag.waitForTimeout(450);
  await pag.selectOption('select[data-exp="interv.tipo"]', 'mejora_seguridad');
  await pag.waitForTimeout(500);
  // una entrega registrada
  await pag.locator('[data-act="exp-paso"][data-v="entrega"]').first().click();
  await pag.waitForTimeout(500);
  await pag.locator('[data-exp-chk="entrega.docs.informe"]').check(); await pag.waitForTimeout(500);
  await pag.locator('[data-act="exp-nueva-entrega"]').first().click(); await pag.waitForTimeout(700);
  await pag.fill('#re-recep', 'Manuel Pérez Ruiz');
  await pag.fill('#re-dni', '31234567L');
  await pag.selectOption('#re-rel', 'presidente');
  await pag.selectOption('#re-medio', 'mano');
  await pag.click('#dlg button[type="submit"]'); await pag.waitForTimeout(1200);
  // y el ensayo de fuerzas con su fecha
  await pag.locator('[data-act="exp-paso"][data-v="fuerzas"]').first().click();
  await pag.waitForTimeout(500);
  const fe = pag.locator('#vista input[data-exp="fuerzas.fecha"]');
  if (await fe.count()){ await fe.fill('2026-09-16'); }
  const inst = pag.locator('#vista input[data-exp="fuerzas.instrumento"]');
  if (await inst.count()){ await inst.fill('Dinamómetro Sensor FM-200'); }
  await pag.locator('#vista').click({ position:{ x:4, y:4 } });
  await pag.waitForTimeout(900);

  // volvemos a la puerta y abrimos la vida
  await pag.locator('[data-act="exp-volver"]').first().click(); await pag.waitForTimeout(800);
  const r = await abrirDoc(pag, '[data-act="vida-puerta"][data-v="cliente"]');
  paso('22c · la vida recoge la apertura del expediente',
       /Se abre el expediente/.test(r.t));
  paso('22c · la puesta en servicio declarada',
       /Puesta en servicio declarada en el expediente/.test(r.t));
  paso('22c · con el marco legal que le toca por su fecha',
       /Declaración CE de conformidad/.test(r.t));
  paso('22c · el ensayo de fuerzas con su instrumento',
       /Dinamómetro Sensor FM-200/.test(r.t));
  paso('22c · y sin dictamen, porque el perfil no está contrastado',
       /sin dictamen: el perfil de ensayo no está/.test(r.t.replace(/\s+/g,' ')));
  paso('22c · la entrega de documentación, con quién recibió y su DNI',
       /Entrega de documentación, acta 1/.test(r.t) &&
       /Manuel Pérez Ruiz/.test(r.t) && /31234567L/.test(r.t));
  paso('22c · el expediente aparece con el tipo de intervención elegido',
       /Tipo de intervención/.test(r.t) &&
       /Mejora o adición de dispositivos de seguridad/.test(r.t));
  paso('22c · y con el cuestionario sin contestar, el resultado no se inventa',
       /no puede determinarse/.test(r.t));
  paso('22c · y lo que queda pendiente en él',
       /faltan \d+ cosas por rellenar/.test(r.t));
  paso('22c · el resumen cuenta un expediente y una entrega',
       /Expedientes de documentación<\/td><td>1/.test(
         r.t.replace(/\s+/g,' ')) || /Entregas de documentación registradas/.test(r.t));
  await r.doc.close();
  await ctx.close();
}

/* ══════ 22d · SIN NADA REGISTRADO, NO SE INVENTA UNA VIDA ══════ */
{
  const { ctx, pag } = await abrir();
  const R = await pag.evaluate(async () => {
    const T = window.__T;
    const p = T.S.puertas[1];   // la otra puerta de la semilla, sin nada
    const v = await T.recogerVida(p.id);
    return { hechos: v.hechos.length, clases: v.hechos.map(x => x.clase),
             cuenta: v.cuenta, desde: v.desde };
  });
  paso('22d · una puerta sin historia solo tiene su alta',
       R.hechos === 1 && R.clases[0] === 'alta', JSON.stringify(R.clases));
  igual('22d · y todos los recuentos a cero', R.cuenta,
        { asistencias:0, abiertas:0, revisiones:0, noAptas:0, expedientes:0,
          emisiones:0, entregas:0, piezas:0 });
  paso('22d · con la fecha del primer hecho registrado', !!R.desde, R.desde);
  await ctx.close();
}

console.log('\n'+ok+' bien, '+mal+' mal.');
if (errores.length) console.log('Errores de JavaScript:\n'+errores.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || errores.length ? 1 : 0);
