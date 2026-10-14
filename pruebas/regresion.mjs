// ================================================================
// Suite de regresión de ARIZA SAT.
//
// Reconstruye las comprobaciones de las fases 1 a 5, que se perdieron
// cuando se recicló el entorno de trabajo el 11-10-2026.
//
// Dos partes:
//   A · LÓGICA. Comprueba las funciones internas directamente, con
//       expedientes de mentira construidos a mano. Es rápido, no
//       depende de clics y no se rompe porque cambie un botón de sitio.
//       Puede hacerlo porque preparar.sh deja esas funciones a la vista
//       en window.__T, solo en la copia de pruebas.
//   B · PANTALLA Y DOCUMENTOS. Lo que sí hay que mirar con los ojos:
//       que la aplicación arranque, que los pasos estén, y que los
//       documentos salgan con sus apartados.
//
// Cada comprobación dice qué fija y por qué importa.
// ================================================================
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
  JSON.stringify(a) + ' vs esperado ' + JSON.stringify(b));

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
  if (await b.count()){ await b.click(); await pag.waitForTimeout(480); return true; }
  return false;
};
const abrirDoc = async (pag, act) => {
  const [doc] = await Promise.all([pag.waitForEvent('popup'),
    pag.locator('[data-act="'+act+'"]').first().click()]);
  await doc.waitForTimeout(1600);
  return { doc, t: await doc.textContent('body') };
};

/* ════════════════════════════════════════════════════════════════
   PARTE A · LÓGICA
   ════════════════════════════════════════════════════════════════ */
{
  const { ctx, pag } = await abrir();

  const faltan = await pag.evaluate(() => window.__T_FALTAN || ['sin gancho']);
  paso('A0 · el gancho de pruebas deja a la vista todas las funciones esperadas',
       Array.isArray(faltan) && faltan.length === 0, JSON.stringify(faltan));
  if (!Array.isArray(faltan) || faltan.length){
    console.log('\nEl gancho no está completo. ¿Has ejecutado ./preparar.sh?');
    await ctx.close(); await nav.close(); process.exit(1);
  }

  // Un expediente de mentira, con la misma forma que los de verdad
  const R = await pag.evaluate(() => {
    const T = window.__T;
    const ex = (over) => {
      const base = { id:'x', referencia:'T-1', familia:'industrial', situacion:'adecuacion',
        estado:'borrador', fecha_puesta_servicio:'2026-11-15', autor:'Prueba',
        datos:{ obra:{}, puerta:{}, cumple:{}, peligro:{}, interv:{}, entrega:{},
                fuerzas:{}, prest:{}, comp:{} } };
      const o = JSON.parse(JSON.stringify(base));
      Object.keys(over||{}).forEach(k => {
        if (k === 'datos') Object.assign(o.datos, over.datos); else o[k] = over[k];
      });
      return o;
    };
    const doce = (v, extra) => {
      const d = {};
      for (let i = 1; i <= 12; i++) d['q'+i] = { v: v };
      Object.assign(d, extra||{});
      return d;
    };
    const salida = {};

    /* ---- 1. Horas facturables: horas completas, al alza desde 30 minutos ---- */
    salida.horas = [0,1,29,30,59,60,89,90,119,149,150,181].map(m => T.horasFacturables(m));
    salida.minimo = (T.S.tarifas||{}).minimo_horas;

    /* ---- 2. La hoja de la puerta es la puerta: no se escriben dos veces ---- */
    salida.hoja = [
      T.datosHoja(ex({ datos:{ puerta:{ marca:'Erreka', modelo:'Rino 4', serie:'S-1' } } })),
      T.datosHoja(ex({ datos:{ comp:{ hoja:{ marca:'Angel Mir', modelo:'M2', serie:'S-2' } } } })),
      T.datosHoja(ex({ datos:{ puerta:{ marca:'Erreka' },
                               comp:{ hoja:{ marca:'Otro', modelo:'M3' } } } })),
    ];

    /* ---- 3. Qué acredita conformidad y qué no ---- */
    salida.acreditan = Object.keys(T.RESULTADO_COMPROBACION).filter(k => T.acredita(k));
    salida.abiertos = ['', 'pendiente', 'nc', 'condicionado', 'si', 'no', 'na', 'deficiencia']
      .filter(v => T.esAbierto(v));

    /* ---- 4. Marco legal por la fecha de puesta en servicio ---- */
    salida.marco = ['2026-12-31','2027-01-19','2027-01-20','2027-06-01',''].map(f => T.marcoDeFecha(f));
    salida.documentos = [T.EXP_MARCO.directiva.documento, T.EXP_MARCO.reglamento.documento];
    salida.criterio = ['2026-12-31','2027-01-20',''].map(f => T.criterioModificacion(f));

    /* ---- 5. Régimen de cada familia ---- */
    salida.regimen = {
      industrial:  T.regimenDe(ex({ familia:'industrial' })).ddp === true,
      peatonal:    T.regimenDe(ex({ familia:'peatonal' })).ddp === false,
      peatonalNota:/16361 no está citada en el DOUE/.test(T.regimenDe(ex({familia:'peatonal'})).nota||''),
      barreraSi:   T.regimenDe(ex({ familia:'barrera' })).ddp === true,
      barreraNo:   T.regimenDe(ex({ familia:'barrera',
                     datos:{ puerta:{ acceso_personas:'no' } } })).ddp === false,
      cortafuegos: T.regimenDe(ex({ familia:'cortafuegos' })).ddp === false,
      cfBloquea:   T.regimenDe(ex({ familia:'cortafuegos' })).bloqueaFabricante === true,
    };
    salida.matrizNoAplica = T.MATRIZ_NO_APLICA_A;

    /* ---- 6. Ningún perfil de fuerza está validado: no se dictamina ---- */
    salida.perfilesValidados = Object.values(T.PERFILES_FUERZA).filter(p => p.validado).length;
    salida.perfilPeatonalValidado = !!T.PERFILES_FUERZA.peatonal.validado;
    salida.limites = T.LIM_FUERZA_FABRICA;

    /* ---- 7. Prioridades, con las antiguas traducidas ---- */
    salida.prioridad = ['muy_grave','grave','leve','critica','alta','inventada','']
      .map(v => T.prioridadDe(v));

    /* ---- 8. Huecos: nunca un dato inventado ---- */
    salida.huecos = [T.oHueco('', 'no_aportado'), T.oHueco('  ', 'no_identificado'),
                     T.oHueco('', 'no_verificado'), T.oHueco('', ''), T.oHueco('dato', 'no_aportado')];

    /* ---- 9. Motor de intervención ---- */
    const iv = o => T.evaluarIntervencion(ex(o));
    salida.interv = {
      sinTipo:      iv({}).bloqueos.length > 0 && iv({}).resultado === null,
      puertaNueva:  iv({ datos:{ interv:{ tipo:'nueva_propia' } } }).requiere_cuestionario === false,
      incompleto:   iv({ datos:{ interv:{ tipo:'mantenimiento' } } }).resultado === null,
      ordinaria:    iv({ datos:{ interv:Object.assign({ tipo:'mantenimiento' }, doce('no')) } }).resultado,
      mejora:       iv({ datos:{ interv:Object.assign({ tipo:'mejora_seguridad' }, doce('no')) } }).resultado,
      decisiva:     iv({ datos:{ interv:Object.assign({ tipo:'reparacion' }, doce('no'),
                      { q1:{ v:'si' } }) } }).resultado,
      criticaDesc:  iv({ datos:{ interv:Object.assign({ tipo:'reparacion' }, doce('no'),
                      { q7:{ v:'desconocido' } }) } }).resultado,
      sinSegundo:   iv({ datos:{ interv:Object.assign({ tipo:'reparacion' }, doce('no'),
                      { q8:{ v:'si' } }) } }).resultado,
      equivSinBase: iv({ datos:{ interv:Object.assign({ tipo:'reparacion' }, doce('no'),
                      { q8:{ v:'si', eq:'equivalente' } }) } }).resultado,
      equivOk:      iv({ datos:{ interv:Object.assign({ tipo:'reparacion' }, doce('no'),
                      { q8:{ v:'si', eq:'equivalente', eq_base:'Hoja de producto del fabricante' } }) } }).resultado,
      noEquiv:      iv({ datos:{ interv:Object.assign({ tipo:'reparacion' }, doce('no'),
                      { q8:{ v:'si', eq:'no_equivalente' } }) } }).resultado,
      descEquiv:    iv({ datos:{ interv:Object.assign({ tipo:'reparacion' }, doce('no'),
                      { q8:{ v:'si', eq:'desconocido' } }) } }).resultado,
      motoriza:     iv({ datos:{ interv:{ tipo:'motorizacion' } } }).resultado,
      motorizaDed:  (iv({ datos:{ interv:{ tipo:'motorizacion' } } }).deducidas||[])
                      .filter(x => x.id === 'q9' && x.valor === 'si').length === 1,
      noClasif:     iv({ datos:{ interv:{ tipo:'no_clasificable' } } }).resultado,
      sustancial:   iv({ datos:{ interv:{ tipo:'modif_sustancial' } } }).resultado,
    };
    /* Cortafuegos con componente no original: q12 deducida y resultado E */
    const cfE = ex({ familia:'cortafuegos',
      datos:{ cf:{ comp_sust:'si', comp_lista:'Cierrapuertas', comp_orig:'no' },
              interv:Object.assign({ tipo:'reparacion' }, doce('no')) } });
    salida.interv.cortafuegosE = T.evaluarIntervencion(cfE).resultado;
    salida.interv.cortafuegosDed = Object.keys(T.deduccionesIntervencion(cfE));

    /* ---- 10. Peatonales ---- */
    const pe = o => T.evaluarPeatonal(ex(Object.assign({ familia:'peatonal' }, o)));
    salida.peatonal = {
      noAplica:  T.evaluarPeatonal(ex({ familia:'industrial' })).aplica === false,
      total:     pe({}).total,
      sinNada:   pe({}).sinContestar.length,
      evacua:    pe({ datos:{ pea:{ p1:{ v:'si' } } } }).evacuacion === true,
      bloqueos:  pe({ datos:{ pea:{ p1:{ v:'si' } } } }).bloqueos.length,
      publico:   pe({ datos:{ pea:{ p7:{ v:'si' } } } }).publico === true,
      vidrioNo:  pe({ datos:{ pea:{ p6:{ v:'no' } } } }).bloqueos.length > 0,
      descNoEsNo:pe({ datos:{ pea:{ p6:{ v:'desconocido' } } } }).bloqueos.length === 0,
    };

    /* ---- 11. Cortafuegos ---- */
    const cf = o => T.evaluarCortafuegos(ex(Object.assign({ familia:'cortafuegos' }, o)));
    salida.cortafuegos = {
      noAplica: T.evaluarCortafuegos(ex({ familia:'industrial' })).aplica === false,
      campos:   T.CAMPOS_CORTAFUEGOS.length,
      faltanTodos: cf({}).faltan.length,
      sinPregunta: cf({}).bloqueos.some(x => /pregunta obligatoria/.test(x)),
      fuera:    cf({ datos:{ cf:{ comp_sust:'si', comp_lista:'x', comp_orig:'no' } } }).fueraCertificacion,
      fueraDesc:cf({ datos:{ cf:{ comp_sust:'si', comp_lista:'x', comp_orig:'desconocido' } } }).fueraCertificacion,
      dentro:   cf({ datos:{ cf:{ comp_sust:'no' } } }).fueraCertificacion,
    };

    /* ---- 12. Conservación del expediente ---- */
    const co = (fps, fab) => T.conservacionExpediente(ex({ fecha_puesta_servicio:fps,
      datos: fab ? { puerta:{ fecha_fabricacion:fab } } : {} }));
    salida.conserva = {
      sinFecha:   T.conservacionExpediente(ex({ fecha_puesta_servicio:null })).pendiente === true,
      directiva:  co('2026-11-15').hasta,
      aproximado: co('2026-11-15').aproximado === true,
      conFab:     co('2026-11-15','2024-03-02').hasta,
      conFabExacto: co('2026-11-15','2024-03-02').aproximado === false,
      reglamento: co('2027-03-01').hasta,
      regDesde:   /introducción en el mercado o la puesta en servicio/.test(co('2027-03-01').desde),
      anios:      co('2026-11-15').anios,
    };

    /* ---- 13. Mantenimiento: uso, ciclos y entorno ---- */
    const per = o => T.periodicidadMantenimiento(ex(o));
    const mant = (m, uso, tipo) => per({ datos:{ mant:m, obra:{ uso_edificio:uso||'' },
                                                 puerta:{ tipo:tipo||'Corredera' } } });
    salida.mant = {
      sinContestar: mant({}).meses === null,
      fabricante:   mant({ fab_consta:'si', fab_meses:'4', fab_donde:'Manual, pág. 12' }).meses,
      fabSinDonde:  mant({ fab_consta:'si', fab_meses:'4' }).falta.length,
      fabSinMeses:  mant({ fab_consta:'si' }).meses === null,
      comercial6:   mant({ fab_consta:'no', ciclos_dia:6, ciclos_origen:'contador' }, 'Comercio').meses,
      comercial4:   mant({ fab_consta:'no', ciclos_dia:40, ciclos_origen:'contador' }, 'Comercio').meses,
      comercialSinCiclos: mant({ fab_consta:'no' }, 'Comercio').meses === null,
      enrollable:   mant({ fab_consta:'no' }, 'Comercio', 'Enrollable').meses,
      rapida:       mant({ fab_consta:'no', rapida:'si' }, 'Industria').meses,
      industrial:   mant({ fab_consta:'no' }, 'Industria').meses,
      entorno1:     mant({ fab_consta:'no', ciclos_dia:6, ciclos_origen:'contador',
                           ent:{ marino:'si' } }, 'Comercio').meses,
      entorno2:     mant({ fab_consta:'no', ciclos_dia:6, ciclos_origen:'contador',
                           ent:{ marino:'si', lavado:'si' } }, 'Comercio').meses,
      entorno5:     mant({ fab_consta:'no', ciclos_dia:6, ciclos_origen:'contador',
                           ent:{ marino:'si', lavado:'si', polvo:'si', frio:'si', trafico:'si' } },
                         'Comercio').meses,
      ajusteDicho:  /criterio de esta empresa, no de ninguna norma/.test(
                      (mant({ fab_consta:'no', ciclos_dia:6, ciclos_origen:'contador',
                              ent:{ marino:'si' } }, 'Comercio').ajustes||[]).join(' ')),
      recomNoValidada: T.RECOM_PERIODICIDAD.validado === false,
      recomFuente:  /FD-138/.test(T.RECOM_PERIODICIDAD.fuente),
      vivienda:     mant({ fab_consta:'no' }, 'Comunidad de propietarios').origen,
    };

    /* ---- 14. Qué documento se puede emitir ---- */
    const sd = o => T.salidaDocumental(ex(o));
    salida.salida = {
      vacioClave:  sd({}).clave,
      vacioAcredita: sd({}).acredita,
      siempreEmite:  sd({}).puedeEmitir === true,
      abiertas:      sd({}).cuenta.abiertas === (T.EXP_COMPROBACIONES.industrial||[]).length,
      claves:        Object.keys(T.SALIDAS_DOCUMENTALES),
      criticosOrdenados: sd({}).todos.length === sd({}).criticos.length + sd({}).advertencias.length,
    };

    /* ---- 15. Validación: lo que impide titular un documento como conforme ---- */
    const bl = o => T.validarExpediente(ex(o)).bloqueos.map(x => x.area+': '+x.texto).join(' | ');
    salida.valida = {
      sinFecha:   /Falta la fecha de puesta en servicio/.test(bl({ fecha_puesta_servicio:null })),
      ficticio:   /caso de prueba con datos ficticios/.test(bl({ datos:{ ficticio:'si' } })),
      comprobaciones: /comprobaciones de normativa sin contestar/.test(bl({})),
      peatonalEvac: /Peatonal/.test(bl({ familia:'peatonal',
                      datos:{ pea:{ p1:{ v:'si' } } } })),
      cortafuegos: /Cortafuegos/.test(bl({ familia:'cortafuegos' })),
    };
    salida.pendientesTexto = T.expPendientes(ex({ fecha_puesta_servicio:null }))
      .some(x => /fecha de puesta en servicio/.test(x));

    /* ---- 16. Entregas: generado no es entregado ---- */
    const en = o => T.estadoEntregas(ex(o));
    salida.entregas = {
      nada:        en({}).regs.length === 0 && en({}).sinRegistrar.length === 0,
      marcadoSinEntregar: en({ datos:{ entrega:{ docs:{ informe:'si' } } } }).sinRegistrar,
      internoNoCuenta: en({ datos:{ entrega:{ docs:{ expediente:'si' } } } }).sinRegistrar.length === 0,
      entregado:   en({ datos:{ entrega:{ docs:{ informe:'si' } },
                     entregas:[{ n:1, fecha:'2026-10-11', docs:['informe'],
                                 receptor:'Fulano', dni:'1234A' }] } }).sinRegistrar.length === 0,
      sinDni:      en({ datos:{ entregas:[{ n:1, fecha:'2026-10-11', docs:['informe'],
                                 receptor:'Fulano', dni:'' }] } }).incompletos.length === 1,
      destinos:    [T.destinoDe('expediente'), T.destinoDe('dc'), T.destinoDe('marcado'),
                    T.destinoDe('manual'), T.destinoDe('informe')],
      internos:    T.docsPorDestino('interno').length,
    };

    /* ---- 17. La firma no convierte un pendiente en conforme ---- */
    const kInd = (T.EXP_COMPROBACIONES.industrial||[])[0][0];
    const pf = o => T.pendientesAlFirmar(ex(o));
    salida.firma = {
      todoAbierto: pf({}).length >= (T.EXP_COMPROBACIONES.industrial||[]).length,
      deficiencia: pf({ datos:{ cumple:{ [kInd]:{ v:'deficiencia' } } } })
                     .some(x => x.clase === 'deficiencia'),
      noConforme:  pf({ datos:{ cumple:{ [kInd]:{ v:'no' } } } })
                     .some(x => x.clase === 'deficiencia'),
      noVerificado: pf({ datos:{ cumple:{ [kInd]:{ v:'nc' } } } })
                     .some(x => x.clase === 'sin_resultado'),
      conformeNoSale: !pf({ datos:{ cumple:{ [kInd]:{ v:'si' } } } })
                     .some(x => x.texto === (T.EXP_COMPROBACIONES.industrial||[])[0][1]),
      clases: Object.keys(T.CLASE_PENDIENTE),
    };

    /* ---- 18. Estados del expediente ---- */
    salida.estados = {
      cuantos: Object.keys(T.EXP_ESTADO).length,
      borradorPorDefecto: T.estadoExp(ex({})) === 'borrador',
      documental: T.estadoExp(ex({ estado:'borrador', datos:{ estado_doc:'conforme' } })) === 'conforme',
      historicos: ['borrador','completo','emitido'].every(k => !!T.EXP_ESTADO[k]),
    };

    /* ---- 19. Fechas en español ---- */
    salida.fechas = [T.fechaCorta('2036-11-15'), T.fechaCorta('2027-03-01')];

    return salida;
  });

  /* ---- Comprobaciones sobre lo devuelto ---- */
  igual('A1 · horas facturables: horas completas, al alza desde 30 minutos',
        R.horas, [0,1,1,1,1,1,1,2,2,2,3,3]);
  paso('A1 · y nunca por debajo del mínimo de la tarifa', R.minimo === 1, String(R.minimo));

  igual('A2 · la hoja toma los datos de la puerta cuando los tiene',
        R.hoja[0], { marca:'Erreka', modelo:'Rino 4', serie:'S-1' });
  igual('A2 · y los del componente cuando la puerta no los tiene',
        R.hoja[1], { marca:'Angel Mir', modelo:'M2', serie:'S-2' });
  igual('A2 · con los de la puerta por delante, sin escribir dos veces lo mismo',
        R.hoja[2], { marca:'Erreka', modelo:'M3', serie:'' });

  igual('A3 · solo «conforme» y «corregido» acreditan conformidad',
        R.acreditan, ['si','corregido']);
  igual('A3 · pendiente, no verificado y condicionado quedan abiertos',
        R.abiertos, ['', 'pendiente', 'nc', 'condicionado']);

  igual('A4 · el marco legal lo decide la fecha, con el corte el 20-1-2027',
        R.marco, ['directiva','directiva','reglamento','reglamento','pendiente']);
  igual('A4 · y con él cambia el nombre del documento',
        R.documentos, ['Declaración CE de conformidad','Declaración UE de conformidad']);
  igual('A4 · igual que el criterio de modificación sustancial',
        R.criterio, ['guia_azul','reglamento_2023','guia_azul']);

  paso('A5 · una industrial lleva declaración de prestaciones', R.regimen.industrial);
  paso('A5 · una peatonal no la lleva', R.regimen.peatonal);
  paso('A5 · y dice por qué: la 16361 no está citada en el DOUE', R.regimen.peatonalNota);
  paso('A5 · una barrera accesible a personas sí la lleva', R.regimen.barreraSi);
  paso('A5 · una barrera de solo vehículos no', R.regimen.barreraNo);
  paso('A5 · una cortafuegos no se autocertifica', R.regimen.cortafuegos && R.regimen.cfBloquea);
  igual('A5 · la matriz de la 12453 no se aplica a las peatonales',
        R.matrizNoAplica, ['peatonal']);

  /* CAMBIO DE CRITERIO DEL 14-10-2026. Hasta ese día NINGÚN perfil estaba
     validado y la aplicación no dictaminaba. David aportó la EN 12453:2017+A1:2021
     leída de su ejemplar, con sus apartados, así que los perfiles que se rigen por
     esa norma (industrial, barrera y cortafuegos en su funcionamiento ordinario)
     pasaron a validados y la aplicación ya puede decir si una puerta pasa. El de
     peatonales NO, porque su norma es la EN 16005 y esa sigue sin verse. */
  paso('A6 · los perfiles de la 12453 están validados desde que se aportó la norma',
       R.perfilesValidados === 3, String(R.perfilesValidados));
  paso('A6 · y el de peatonales sigue sin validar: su norma es la 16005',
       R.perfilPeatonalValidado === false, String(R.perfilPeatonalValidado));
  igual('A6 · los límites de fábrica siguen siendo los de siempre', R.limites,
        { fd_aplastamiento_n:400, fd_impacto_n:1400, fs_estatica_n:150,
          fs_tiempo_s:5, fe_residual_n:25, td_dinamico_s:0.75 });

  igual('A7 · las gravedades antiguas se traducen a las cinco prioridades',
        R.prioridad, ['critica','alta','media','critica','alta','','']);

  igual('A8 · un hueco nunca se rellena con un dato inventado',
        R.huecos, ['NO APORTADO','NO IDENTIFICADO','NO VERIFICADO','PENDIENTE','dato']);

  const I = R.interv;
  paso('A9 · sin tipo de intervención no se clasifica nada', I.sinTipo);
  paso('A9 · una puerta nueva no pasa por el cuestionario de modificación', I.puertaNueva);
  paso('A9 · el cuestionario incompleto no da resultado', I.incompleto);
  paso('A9 · doce noes en un mantenimiento dan A', I.ordinaria === 'A', I.ordinaria);
  paso('A9 · doce noes en una mejora de seguridad dan B', I.mejora === 'B', I.mejora);
  paso('A9 · una pregunta decisiva da D', I.decisiva === 'D', I.decisiva);
  paso('A9 · una crítica desconocida da E, no se trata como un «no»',
       I.criticaDesc === 'E', I.criticaDesc);
  paso('A9 · el segundo nivel sin contestar no clasifica', I.sinSegundo === null, String(I.sinSegundo));
  paso('A9 · equivalencia sin decir en qué se basa, tampoco',
       I.equivSinBase === null, String(I.equivSinBase));
  paso('A9 · equivalencia acreditada no computa como modificación', I.equivOk === 'A', I.equivOk);
  paso('A9 · declarado no equivalente sube a D', I.noEquiv === 'D', I.noEquiv);
  paso('A9 · «no se puede determinar» se queda en C', I.descEquiv === 'C', I.descEquiv);
  paso('A9 · motorizar es D', I.motoriza === 'D', I.motoriza);
  paso('A9 · y deduce la respuesta a la pregunta 9', I.motorizaDed);
  paso('A9 · un caso no clasificable es E', I.noClasif === 'E', I.noClasif);
  paso('A9 · una modificación sustancial declarada es D', I.sustancial === 'D', I.sustancial);
  paso('A9 · una cortafuegos fuera de certificación es E, no D',
       I.cortafuegosE === 'E', I.cortafuegosE);
  igual('A9 · deduciendo la pregunta 12 de lo registrado en la puerta',
        I.cortafuegosDed, ['q12']);

  const P = R.peatonal;
  paso('A10 · el bloque de peatonales no se aplica a otras familias', P.noAplica);
  paso('A10 · son doce preguntas', P.total === 12, String(P.total));
  paso('A10 · sin contestar, las doce quedan señaladas', P.sinNada === 12, String(P.sinNada));
  paso('A10 · marcar evacuación lo detecta', P.evacua);
  paso('A10 · y exige los requisitos propios de esa condición', P.bloqueos >= 3, String(P.bloqueos));
  paso('A10 · uso público o usuarios vulnerables también se detecta', P.publico);
  paso('A10 · el vidrio sin señalizar impide acreditar conformidad', P.vidrioNo);
  paso('A10 · pero «no se ha podido comprobar» no es un incumplimiento', P.descNoEsNo);

  const C = R.cortafuegos;
  paso('A11 · el bloque de cortafuegos no se aplica a otras familias', C.noAplica);
  paso('A11 · pide seis datos del fabricante', C.campos === 6, String(C.campos));
  paso('A11 · sin ellos, los seis salen como que faltan', C.faltanTodos === 6, String(C.faltanTodos));
  paso('A11 · y la pregunta obligatoria no puede quedar en blanco', C.sinPregunta);
  paso('A11 · un componente no original deja la puerta fuera de lo certificado', C.fuera);
  paso('A11 · y tampoco vale «no se puede determinar»', C.fueraDesc);
  paso('A11 · sin sustituciones, la configuración sigue siendo la certificada', !C.dentro);

  const K = R.conserva;
  paso('A12 · sin fecha no se da ningún plazo de conservación', K.sinFecha);
  paso('A12 · con la Directiva, diez años desde la fabricación',
       K.directiva === '2036-11-15' && K.anios === 10, K.directiva);
  paso('A12 · y avisa si la fecha de fabricación no consta', K.aproximado);
  paso('A12 · con fecha de fabricación, el plazo cuenta desde ella',
       K.conFab === '2034-03-02' && K.conFabExacto, K.conFab);
  paso('A12 · con el Reglamento, desde la puesta en servicio',
       K.reglamento === '2037-03-01' && K.regDesde, K.reglamento);

  const M = R.mant;
  paso('A13 · sin contestar qué dice el fabricante no se propone periodicidad', M.sinContestar);
  paso('A13 · si el fabricante la fija, es la que vale', M.fabricante === 4, String(M.fabricante));
  paso('A13 · pero hay que decir dónde consta', M.fabSinDonde === 1, String(M.fabSinDonde));
  paso('A13 · y sin el número tampoco se inventa nada', M.fabSinMeses);
  paso('A13 · comercio con 6 ciclos al día: cada 6 meses', M.comercial6 === 6, String(M.comercial6));
  paso('A13 · comercio con más de 10 ciclos: cada 4 meses', M.comercial4 === 4, String(M.comercial4));
  paso('A13 · en comercio, sin ciclos no se propone nada', M.comercialSinCiclos);
  paso('A13 · un cierre enrollable, cada 12 meses', M.enrollable === 12, String(M.enrollable));
  paso('A13 · una industrial rápida, cada 4 meses', M.rapida === 4, String(M.rapida));
  paso('A13 · una industrial, cada 6 meses', M.industrial === 6, String(M.industrial));
  paso('A13 · una condición del entorno acorta un tramo', M.entorno1 === 4, String(M.entorno1));
  paso('A13 · dos condiciones, dos tramos', M.entorno2 === 3, String(M.entorno2));
  paso('A13 · y el suelo son tres meses, no baja más', M.entorno5 === 3, String(M.entorno5));
  paso('A13 · el ajuste por entorno se declara como criterio propio', M.ajusteDicho);
  paso('A13 · la recomendación está marcada como no contrastada con la norma',
       M.recomNoValidada);
  paso('A13 · y dice de qué fuente sale', M.recomFuente);
  paso('A13 · una vivienda no encaja en la recomendación y se decide a mano',
       M.vivienda === 'sin_recomendacion', M.vivienda);

  const D = R.salida;
  paso('A14 · un expediente recién creado da informe de situación',
       D.vacioClave === 'situacion', D.vacioClave);
  paso('A14 · que no acredita conformidad', D.vacioAcredita === false, String(D.vacioAcredita));
  paso('A14 · pero siempre se puede emitir algo', D.siempreEmite);
  paso('A14 · y todas las comprobaciones cuentan como abiertas', D.abiertas);
  igual('A14 · hay tres salidas documentales', D.claves,
        ['situacion','intervencion','conformidad']);
  paso('A14 · los avisos se ordenan por nivel sin perder ninguno', D.criticosOrdenados);

  const V = R.valida;
  paso('A15 · sin fecha de puesta en servicio no se puede titular como conforme', V.sinFecha);
  paso('A15 · un caso de prueba nunca pasa por real', V.ficticio);
  paso('A15 · las comprobaciones sin contestar impiden acreditar', V.comprobaciones);
  paso('A15 · una peatonal en evacuación añade sus propios bloqueos', V.peatonalEvac);
  paso('A15 · y una cortafuegos los suyos', V.cortafuegos);
  paso('A15 · «Falta por rellenar» nombra la fecha de puesta en servicio', R.pendientesTexto);

  const E = R.entregas;
  paso('A16 · un expediente nuevo no tiene entregas', E.nada);
  igual('A16 · un documento marcado y sin registrar queda pendiente de entrega',
        E.marcadoSinEntregar, ['informe']);
  paso('A16 · el expediente técnico interno no cuenta como pendiente de entregar',
       E.internoNoCuenta);
  paso('A16 · con la entrega registrada, deja de estar pendiente', E.entregado);
  paso('A16 · un registro sin DNI sale como incompleto', E.sinDni);
  igual('A16 · cada documento tiene su destino',
        E.destinos, ['interno','cliente','puerta','cliente','cliente']);
  paso('A16 · y hay cuatro documentos internos', E.internos === 4, String(E.internos));

  const F = R.firma;
  paso('A17 · al firmar, todo lo no acreditado consta como pendiente', F.todoAbierto);
  paso('A17 · una deficiencia consta como deficiencia', F.deficiencia);
  paso('A17 · un «no» también', F.noConforme);
  paso('A17 · un «no verificado» consta como comprobación sin resultado', F.noVerificado);
  paso('A17 · y lo que está conforme no aparece como pendiente', F.conformeNoSale);
  igual('A17 · las clases de pendiente son cinco', F.clases,
        ['deficiencia','sin_resultado','riesgo','peatonal','cortafuegos']);

  const S = R.estados;
  paso('A18 · hay catorce estados de expediente', S.cuantos === 14, String(S.cuantos));
  paso('A18 · un expediente nace borrador', S.borradorPorDefecto);
  paso('A18 · el estado documental manda sobre el de la base de datos', S.documental);
  paso('A18 · y los estados antiguos siguen reconociéndose', S.historicos);

  igual('A19 · las fechas se escriben en español', R.fechas, ['15 nov 2036','1 mar 2027']);

  await ctx.close();
}

/* ════════════════════════════════════════════════════════════════
   PARTE B · PANTALLA Y DOCUMENTOS
   ════════════════════════════════════════════════════════════════ */
{
  const { ctx, pag } = await abrir();
  paso('B1 · la aplicación arranca y no pide contraseña',
       await pag.locator('#login').count() === 0 ||
       !(await pag.locator('#login').isVisible()));
  paso('B1 · con sus diez pestañas',
       await pag.locator('#tabs button').count() === 10,
       String(await pag.locator('#tabs button').count()));
  const t = await pag.textContent('body');
  paso('B1 · y reconoce al usuario', /David Ariza Arana/.test(t));
  await ctx.close();
}

{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  const pasos = await pag.locator('[data-act="exp-paso"]').allTextContents();
  paso('B2 · una industrial tiene los pasos esperados, sin el de familia',
       pasos.includes('Tipo de intervención') && pasos.includes('La puerta') &&
       pasos.includes('Cumplimiento de normativa') && pasos.includes('Mantenimiento') &&
       pasos.includes('Entrega y firma') && !pasos.includes('Peatonal automática'),
       pasos.join(' | '));
  paso('B2 · y el tipo de intervención va primero', pasos[0] === 'Tipo de intervención');
  await ctx.close();
}

{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'cumplimiento');
  const sel = pag.locator('#vista select[data-exp^="cumple."][data-exp$=".v"]').first();
  const k = (await sel.getAttribute('data-exp')).split('.')[1];
  await sel.selectOption('na'); await pag.waitForTimeout(700);
  const motivos = await pag.locator('[data-exp="cumple.'+k+'.motivo"]').count();
  const notas = await pag.locator('[data-exp="cumple.'+k+'.nota"]').count();
  paso('B3 · un «no aplica» pide el motivo UNA vez, no dos',
       motivos === 1 && notas === 0, 'motivo:'+motivos+' nota:'+notas);
  const txt = await pag.textContent('#vista');
  paso('B3 · con la pregunta correcta', /Por qué no aplica/.test(txt));
  await sel.selectOption('nc'); await pag.waitForTimeout(600);
  const t2 = await pag.textContent('#vista');
  paso('B3 · y un «no comprobado» pregunta otra cosa',
       /Por qué no se ha podido comprobar/.test(t2));
  await ctx.close();
}

/* El ensayo de fuerzas registra la medida pero no dictamina: el perfil no está
   contrastado con el texto de la norma. Esto es de la fase 1 y es de lo más
   importante que hay que no se rompa nunca. */
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'fuerzas');
  const campo = pag.locator('#vista input[data-exp^="fuerzas.m0."]').first();
  if (await campo.count()){
    const ruta = await campo.getAttribute('data-exp');
    await campo.fill('180');
    await pag.locator('#vista').click({ position:{ x:5, y:5 } });
    await pag.waitForTimeout(900);
    const t = await pag.textContent('#vista');
    /* CAMBIO DE CRITERIO DEL 14-10-2026, mismo motivo que A6: con la norma
       aportada, una medición dentro de límites en una industrial SÍ se puede
       llamar «Pasa». Antes se quedaba en «Pendiente de evaluación» porque el
       perfil no estaba contrastado. */
    /* Ojo con el \b: textContent pega las celdas sin espacios («sueloPasaCanto»),
       así que el límite de palabra no existe. Se mira que diga Pasa y que no sea
       un «No pasa». */
    paso('B3b · con una medición dentro de límites ya SÍ dice «Pasa»',
         /Pasa/.test(t) && !/No pasa/.test(t), (t.match(/.{0,30}Pasa.{0,20}/)||[''])[0] || ruta);
    paso('B3b · ya no se queda en «Pendiente de evaluación»',
         !/Pendiente de evaluación/.test(t), ruta);
    paso('B3b · y la pantalla cita la norma verificada con su apartado',
         /A\.2\.1/.test(t) && /Límites verificados/.test(t));
  } else {
    paso('B3b · el paso de fuerzas tiene campos de medición', false, 'no hay fuerzas.m0.*');
  }
  await ctx.close();
}

{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'intervencion');
  await pag.selectOption('select[data-exp="interv.tipo"]', 'mejora_seguridad');
  await pag.waitForTimeout(400);
  const r = await abrirDoc(pag, 'exp-informe');
  paso('B4 · el informe de situación sale con su portada',
       /Informe técnico de situación/.test(r.t));
  paso('B4 · con índice', /Índice/i.test(r.t) || /indice/i.test(r.t));
  paso('B4 · diciendo que no es una declaración de conformidad',
       /No constituye una declaración de conformidad/.test(r.t));
  const secciones = ['Identificación del expediente','Titular','Emplazamiento',
    'Identificación de la puerta','Objeto del informe','Alcance de la inspección',
    'Documentación disponible','Comprobaciones realizadas','Riesgos detectados',
    'Deficiencias detectadas','Evidencias fotográficas','Actuaciones recomendadas',
    'Limitaciones del informe','Conclusión','Mantenimiento de la instalación',
    'Recepción por el cliente'];
  const faltan = secciones.filter(s => !r.t.includes(s));
  paso('B4 · y con todos sus apartados', faltan.length === 0, faltan.join('; '));
  paso('B4 · incluida la recepción, que dice que no consta entregado',
       /NO CONSTA ENTREGADO/.test(r.t));
  await r.doc.close();
  await ctx.close();
}

{
  const { ctx, pag } = await abrir();
  await crear(pag, 'nueva_fabricante', 'industrial');
  await pag.fill('#exp-fps', '2026-11-15'); await pag.waitForTimeout(500);
  await irA(pag, 'intervencion');
  await pag.selectOption('select[data-exp="interv.tipo"]', 'nueva_propia');
  await pag.waitForTimeout(400);
  const l = await abrirDoc(pag, 'exp-libro');
  const secciones = ['Objeto y alcance','Naturaleza de la intervención',
    'Identificación de la puerta','Marco normativo aplicado','Elementos de la instalación',
    'Comprobaciones de cumplimiento','Ensayo de fuerzas','Instrucciones de uso y seguridad',
    'Libro de mantenimiento','Entrega y firmas'];
  const faltan = secciones.filter(s => !l.t.includes(s));
  paso('B5 · el libro del expediente sale con sus secciones', faltan.length === 0, faltan.join('; '));
  paso('B5 · en borrador, avisa de que no vale para declarar conformidad',
       /BORRADOR/.test(l.t) || /no emitido/i.test(l.t));
  paso('B5 · con la Declaración CE que toca por la fecha',
       /Declaración CE de conformidad/.test(l.t));
  await l.doc.close();
  await ctx.close();
}

{
  const { ctx, pag } = await abrir();
  await crear(pag, 'nueva_fabricante', 'industrial');
  await irA(pag, 'obra');
  await pag.selectOption('select[data-exp="ficticio"]', 'si');
  await pag.waitForTimeout(700);
  const l = await abrirDoc(pag, 'exp-libro');
  const marca = await l.doc.evaluate(() => {
    const s = [...document.querySelectorAll('style')].map(x => x.textContent).join(' ');
    return /FICTICIOS/.test(s) || /FICTICIOS/.test(document.body.textContent);
  });
  paso('B6 · un caso de prueba sale marcado en el documento', marca);
  await l.doc.close();
  await ctx.close();
}

{
  const { ctx, pag } = await abrir();
  await crear(pag, 'nueva_fabricante', 'industrial');
  const e = await abrirDoc(pag, 'exp-marcado');
  paso('B7 · la etiqueta de marcado CE se genera',
       /CE/.test(e.t) && /Ariza/i.test(e.t));
  await e.doc.close();
  await ctx.close();
}

{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  const h = await abrirDoc(pag, 'exp-hoja-campo');
  paso('B8 · la hoja de campo se genera', h.t.length > 200);
  await h.doc.close();
  /* El libro de mantenimiento se pide desde un diálogo, no abre ventana solo */
  await pag.locator('[data-act="exp-libro-mant"]').first().click();
  await pag.waitForTimeout(800);
  const td = await pag.textContent('#dlg');
  paso('B9 · el libro de mantenimiento se puede pedir', td.length > 50, td.slice(0,60));
  await pag.click('#dlg [data-cerrar]'); await pag.waitForTimeout(300);
  await ctx.close();
}

/* ================================================================
   B10 · Cómo cita la aplicación el informe del Ministerio.

   Es el documento con el que trabaja el sector, y hay nueve versiones
   circulando. Citarlo sin versión ni fecha no dice cuál se ha seguido,
   y la versión 8 de 2019 todavía aparece en medio sector. Además, su
   título no alcanza a las puertas peatonales: citarlo en el documento
   de una peatonal sería citar un papel que no habla de ese producto.
   ================================================================ */
{
  const { ctx, pag } = await abrir();
  const inf = await pag.evaluate(() => {
    const g = window.__T;
    return { d: g.INFORME_MINISTERIO, cita: g.citaInforme(),
             ind: g.informeAplicaA('industrial'), bar: g.informeAplicaA('barrera'),
             pea: g.informeAplicaA('peatonal') };
  });
  paso('B10 · el informe se guarda con número de versión', inf.d.version === 9, String(inf.d.version));
  paso('B10 · y con su fecha', inf.d.fecha === '2024-02-14', inf.d.fecha);
  paso('B10 · la cita impresa lleva las dos cosas',
       /versión 9/.test(inf.cita) && /14 de febrero de 2024/.test(inf.cita), inf.cita.slice(-60));
  paso('B10 · y dice qué versión anula, porque la 8 sigue circulando',
       /versión 8/.test(inf.d.anula), inf.d.anula);
  paso('B10 · se aplica a industriales y barreras', inf.ind && inf.bar);
  paso('B10 · NO a las peatonales: su título no las alcanza', inf.pea === false);
  /* Lo que no se ha podido comprobar se dice, no se da por bueno. */
  paso('B10 · consta que la portada del PDF no se ha leído directamente',
       inf.d.portada_leida === false);
  paso('B10 · y la fecha de la última comprobación', !!inf.d.verificado, inf.d.verificado);

  await crear(pag, 'nueva_fabricante', 'industrial');
  const l = await abrirDoc(pag, 'exp-libro');
  paso('B10 · el libro de una industrial cita el informe con versión y fecha',
       /versión 9/.test(l.t) && /14 de febrero de 2024/.test(l.t));
  paso('B10 · y deja claro que no es una norma ni un reglamento',
       /no es una norma ni un reglamento/.test(l.t));
  paso('B10 · en apartado propio, no mezclado con las normas técnicas',
       /Documento interpretativo de la Administración/.test(l.t));
  await l.doc.close();
  await ctx.close();
}
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'nueva_fabricante', 'peatonal');
  const l = await abrirDoc(pag, 'exp-libro');
  paso('B10 · el libro de una PEATONAL no cita el informe',
       !/Documento interpretativo de la Administración/.test(l.t));
  await l.doc.close();
  await ctx.close();
}

/* ================================================================
   B11 · Los siete apartados de la EN 13241 que faltaban.

   Lo importante aquí NO es que existan, sino que la aplicación no los
   haga pasar por apartados acreditados de una norma que no se ha
   leído. Misma regla que los perfiles de fuerza y las periodicidades
   de la UNE 85635: lo que no está verificado se dice.
   ================================================================ */
{
  const { ctx, pag } = await abrir();
  const c = await pag.evaluate(() => {
    const g = window.__T;
    const ind = g.EXP_COMPROBACIONES.industrial.map(x => x[0]);
    return { ind, pend: g.COMPROBACIONES_A_CONTRASTAR,
             tropiezo: g.comprobacionSinContrastar('tropiezo'),
             presencia: g.comprobacionSinContrastar('presencia'),
             criticos: g.EXP_COMPROBACIONES.industrial
               .filter(x => g.comprobacionSinContrastar(x[0])).map(x => x[4]),
             sinApartado: g.EXP_COMPROBACIONES.industrial
               .filter(x => g.comprobacionSinContrastar(x[0]))
               .filter(x => /apartado|cláusula|punto \d|§/i.test(x[2])).map(x => x[0]) };
  });
  const siete = ['tropiezo','aprision','levantar','emc','durabilidad_mec','sustancias_ob','viento_ob'];
  paso('B11 · los siete puntos están en la familia industrial',
       siete.every(k => c.ind.includes(k)), siete.filter(k => !c.ind.includes(k)).join(',') || 'todos');
  paso('B11 · y los siete salen marcados como no contrastados con la norma',
       siete.every(k => c.pend.claves.includes(k)));
  paso('B11 · todavía no hay ninguno contrastado, y se dice',
       Array.isArray(c.pend.contrastadas) && c.pend.contrastadas.length === 0);
  paso('B11 · un punto de los antiguos NO sale marcado', c.presencia === false);
  paso('B11 · uno de los nuevos SÍ', c.tropiezo === true);
  paso('B11 · NINGUNO cita un apartado concreto de una norma que no se ha leído',
       c.sinApartado.length === 0, c.sinApartado.join(',') || 'ninguno');
  paso('B11 · y ninguno es imprescindible: no bloquean el documento mientras no estén contrastados',
       c.criticos.every(x => !x), JSON.stringify(c.criticos));

  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'cumplimiento');
  const vis = await pag.textContent('#vista');
  paso('B11 · el técnico los ve en el cuestionario',
       /riesgo de tropiezo/.test(vis) && /quedar encerrado/.test(vis));
  paso('B11 · y lee ahí mismo que es un punto propio de la empresa',
       /no se ha contrastado con el texto de la norma/.test(vis));
  await ctx.close();
}
{
  const { ctx, pag } = await abrir();
  await crear(pag, 'adecuacion', 'industrial');
  await irA(pag, 'cumplimiento');
  await pag.selectOption('select[data-exp="cumple.tropiezo.v"]', 'si');
  await pag.waitForTimeout(500);
  const l = await abrirDoc(pag, 'exp-libro');
  paso('B11 · en el libro el punto sale con su marca',
       /\(\*\)/.test(l.t), '');
  paso('B11 · y la nota al pie dice qué significa la marca',
       /no acredita por sí solo el apartado de la norma/.test(l.t));
  paso('B11 · diciendo que un NO CONFORME sí es una deficiencia real',
       /es una deficiencia real y se trata como tal/.test(l.t));
  await l.doc.close();
  await ctx.close();
}

console.log('\n'+ok+' bien, '+mal+' mal.');
if (errores.length) console.log('Errores de JavaScript:\n'+errores.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || errores.length ? 1 : 0);
