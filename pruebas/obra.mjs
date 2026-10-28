/* ================================================================
   obra.mjs — el alta obligatoria de la puerta en obra.

   Por qué existe: una puerta que no está dada de alta no existe para
   la empresa. No tiene ficha, ni QR, ni historial, ni expediente, y no
   se le puede sacar una hoja de campo. Y el único momento en que se
   puede documentar de verdad es cuando el técnico está delante de ella:
   las medidas se toman con el flexómetro allí, las fotos se hacen allí
   y la placa se lee allí. Vuelto al taller ya no se puede.

   Lo que fija esta suite:
     1. Qué asistencias obligan a documentar y cuáles no.
     2. Sin ficha no se cierra: ni con firma ni con horas.
     3. Cada punto del mínimo bloquea por sí solo.
     4. La matrícula se puede tomar de tres maneras, y las tres valen.
     5. Las fotos se cuentan en la base de datos, no en la pantalla.
     6. Lo que no se puede resolver en obra no bloquea, pero deja la
        visita señalada como pendiente.
     7. Con el mínimo completo, la visita se cierra.
     8. El aviso sale en la tarjeta de trabajo, antes de salir de casa.
     9. Lo recomendado no bloquea nada.
    10. Una avería corriente no pide nada de esto.
    11. Los dos campos nuevos de la ficha se guardan y se recuperan.
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
    /* Etiquetas de sobra para que «no quedan etiquetas libres» sea algo que la
       prueba provoca cuando quiere, y no el estado de partida. */
    ['AR-0101','AR-0102','AR-0103','AR-0104'].forEach(cod =>
      db.etiquetas.push({ codigo:cod, token:'tok-'+cod, creado:new Date().toISOString() }));
    /* La puerta del caso: existe en la obra pero no en la empresa. Ficha recién
       creada, sin etiqueta, sin tipo, sin medidas, sin fotos y sin matrícula. */
    db.puertas.push({ id:'pt-sin-doc', codigo:null, cliente_id:db.clientes[0].id,
      cliente:db.clientes[0].nombre, direccion:'Polígono El Palmar, nave 12',
      ubicacion:'Muelle de carga', estado:'operativa', creado:new Date().toISOString() });
    /* Una asistencia de cada tipo que obliga, y una avería para contrastar. */
    const base = { estado:'asignado', prioridad:'normal', tecnico_id:'usuario-admin',
                   cliente_id:db.clientes[0].id, creado:new Date().toISOString(),
                   fecha_prevista:new Date().toISOString().slice(0,10) };
    db.avisos.push({ ...base, id:'av-inst',  tipo:'instalacion',     puerta_id:'pt-sin-doc',
                     descripcion:'Montar la puerta nueva del muelle 12' });
    db.avisos.push({ ...base, id:'av-norm',  tipo:'normativa',       puerta_id:'pt-sin-doc',
                     descripcion:'Adecuación a normativa' });
    db.avisos.push({ ...base, id:'av-ps',    tipo:'puesta_servicio', puerta_id:null,
                     descripcion:'Puesta en servicio de un kit, puerta sin dar de alta' });
    db.avisos.push({ ...base, id:'av-aver',  tipo:'averia',          puerta_id:'pt-sin-doc',
                     descripcion:'No cierra del todo' });
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
const esperar = (ms=350) => pag.waitForTimeout(ms);

/* Deja la puerta del caso como estaba al empezar: sin nada documentado. */
const limpiarPuerta = () => T(async () => {
  const g = window.__T;
  await g.sb.from('puertas').update({ codigo:null, tipo:null, ancho_mm:null, alto_mm:null,
    matricula:null, sin_matricula:null, uso:null, peso_kg:null, cuadro:null, motor:null })
    .eq('id', 'pt-sin-doc');
  const { data } = await g.sb.from('fotos').select('*').eq('puerta_id', 'pt-sin-doc');
  for (const f of (data || [])) await g.sb.from('fotos').delete().eq('id', f.id);
  const { data: c } = await g.sb.from('componentes').select('*').eq('puerta_id', 'pt-sin-doc');
  for (const x of (c || [])) await g.sb.from('componentes').delete().eq('id', x.id);
  await g.cargar();
});

/* Abre el parte y rellena todo lo que NO es del alta en obra, de modo que lo
   único que pueda impedir el cierre sea la documentación de la puerta. */
const abrirParte = async (avisoId) => {
  await T(id => { window.__T.dlgCierre(id); }, avisoId);
  await esperar(900);
  await pag.fill('#z-trab', 'Trabajo hecho.');
  await pag.fill('#z-horas', '2');
  await pag.fill('#z-sin', 'No había nadie para firmar.');
  await esperar(200);
};
const cerrarIntento = async (avisoId) => {
  const err = await T(async id => {
    const g = window.__T;
    const a = g.S.avisos.find(x => x.id === id);
    await g.guardarCierre(a, true);
    const e = document.querySelector('#dlg-form .err');
    return { err: e ? e.textContent : '(sin recuadro de error)',
             cerrado: !!(g.S.avisos.find(x => x.id === id) || {}).cerrado };
  }, avisoId);
  return err;
};

/* ================================================================
   1. Qué asistencias obligan
   ================================================================ */
bloque('1. Qué asistencias obligan a documentar la puerta');

const obliga = await T(() => {
  const g = window.__T, out = {};
  Object.keys(g.ASISTENCIAS).forEach(t => { out[t] = g.obligaAltaObra({ tipo:t }); });
  return { out, lista: g.ALTA_OBRA_OBLIGA, min: g.MIN_FOTOS_OBRA };
});
paso('instalación obliga', obliga.out.instalacion === true);
paso('puesta en servicio obliga', obliga.out.puesta_servicio === true);
paso('normativa y adecuación obliga', obliga.out.normativa === true);
paso('preventiva obliga', obliga.out.mantenimiento === true);
paso('una avería no obliga: puede ser un cambio de pila',
  obliga.out.averia === false);
paso('una comercial no obliga: se va a ofertar, no a tocar la puerta',
  obliga.out.comercial === false);
paso('un desplazamiento en falso no obliga', obliga.out.falso === false);
paso('una urgencia fuera de horario no obliga', obliga.out.urgencia === false);
paso('la garantía tampoco: la puerta ya está documentada de antes',
  obliga.out.garantia === false);
paso('son exactamente cuatro los tipos que obligan',
  obliga.lista.length === 4, obliga.lista.join(','));
paso('el mínimo de fotos son dos', obliga.min === 2, obliga.min);
paso('sin asistencia no se obliga a nada, y no se rompe',
  await T(() => window.__T.obligaAltaObra(null) === false));

/* ================================================================
   2. Sin ficha no se cierra
   ================================================================ */
bloque('2. Una puerta sin ficha no deja cerrar la visita');

const sinFicha = await T(() => {
  const g = window.__T;
  const m = g.minimoObra(null, 0);
  return { sinFicha: m.sinFicha, completo: m.completo, bloquean: m.bloquean.length,
           html: g.bloqueAltaObra({ id:'av-ps', tipo:'puesta_servicio' }, null, 0) };
});
paso('minimoObra de una puerta que no existe lo dice',
  sinFicha.sinFicha === true && sinFicha.completo === false);
paso('y bloquea', sinFicha.bloquean === 1, sinFicha.bloquean);
/* Cambiada a propósito el 28-10-2026. Antes el recuadro decía «no tiene ficha ni
   etiqueta con QR: para la empresa todavía no existe», y eso estaba mal dicho en
   una instalación: ahí la puerta normalmente no existe todavía porque aún no está
   montada. Ahora, en instalación y puesta en servicio, el texto dice que está
   bien que no exista mientras se monta, y que lo que no se puede es cerrar la
   obra sin ella. En los demás tipos sigue diciendo que hay que darla de alta ya. */
paso('el recuadro no da por hecho que la puerta ya exista',
  /no tiene ninguna puerta dada de alta/.test(sinFicha.html)
  && /la ficha se crea cuando la puerta ya está puesta/.test(sinFicha.html));
paso('y avisa de que aun así la obra no se cierra sin ella',
  /la obra no se cierra sin ella/.test(sinFicha.html));
paso('y ofrece darla de alta desde el propio parte',
  /data-act="alta-puerta-asis"/.test(sinFicha.html));

await abrirParte('av-ps');
paso('el parte de una puesta en servicio sin puerta trae el recuadro',
  await pag.locator('#obra-bloque').count() === 1);
paso('y no repite el aviso viejo de «no tiene puerta asignada»',
  !/no tiene puerta asignada/.test(await pag.textContent('#dlg-form')));
const r2 = await cerrarIntento('av-ps');
paso('la visita NO se cierra', r2.cerrado === false, r2.cerrado);
/* Cambiada a propósito el 28-10-2026: el mensaje pasó de hablar de «la puerta»
   a hablar de la obra, porque una obra puede llevar varias. */
paso('y el error dice que hay que darla de alta',
  /no hay ninguna puerta dada de alta/.test(r2.err), r2.err);
await T(() => window.__T.cerrarDlg()); await esperar(300);

/* ================================================================
   3. Punto por punto
   ================================================================ */
bloque('3. Cada punto del mínimo bloquea por sí solo');

const completa = { codigo:'AR-0101', tipo:'Corredera', ancho_mm:4200, alto_mm:2400,
                   matricula:'Erreka, Rino 4, nº 2019-0481' };
const puntoAPunto = await T(async base => {
  const g = window.__T;
  const quita = async campo => {
    const o = Object.assign({}, base);
    o[campo] = null;
    await g.sb.from('puertas').update(o).eq('id','pt-sin-doc');
    await g.cargar();
    const m = g.minimoObra(g.puertaDe('pt-sin-doc'), 2);
    return { bloquean: m.bloquean.map(x => x.clave), completo: m.completo };
  };
  const out = {};
  for (const campo of ['codigo','tipo','ancho_mm','alto_mm','matricula'])
    out[campo] = await quita(campo);
  // y con todo puesto
  await g.sb.from('puertas').update(base).eq('id','pt-sin-doc');
  await g.cargar();
  const p = g.puertaDe('pt-sin-doc');
  out.todo = { conFotos: g.minimoObra(p, 2).completo,
               unaFoto:  g.minimoObra(p, 1).bloquean.map(x => x.clave),
               sinContar: g.minimoObra(p, null).puntos.find(x => x.clave === 'fotos') };
  return out;
}, completa);

paso('sin etiqueta: bloquea la etiqueta y nada más',
  puntoAPunto.codigo.bloquean.join(',') === 'etiqueta', puntoAPunto.codigo.bloquean.join(','));
paso('sin tipo de puerta: bloquea el tipo',
  puntoAPunto.tipo.bloquean.join(',') === 'tipo', puntoAPunto.tipo.bloquean.join(','));
paso('sin ancho: bloquean las medidas',
  puntoAPunto.ancho_mm.bloquean.join(',') === 'medidas', puntoAPunto.ancho_mm.bloquean.join(','));
paso('sin alto: bloquean las medidas igual',
  puntoAPunto.alto_mm.bloquean.join(',') === 'medidas', puntoAPunto.alto_mm.bloquean.join(','));
paso('sin matrícula: bloquea la matrícula',
  puntoAPunto.matricula.bloquean.join(',') === 'matricula', puntoAPunto.matricula.bloquean.join(','));
paso('ninguno de esos casos se da por completo',
  ['codigo','tipo','ancho_mm','alto_mm','matricula'].every(k => puntoAPunto[k].completo === false));
paso('con todo puesto y dos fotos, el mínimo está completo',
  puntoAPunto.todo.conFotos === true);
paso('con una sola foto, bloquean las fotos',
  puntoAPunto.todo.unaFoto.join(',') === 'fotos', puntoAPunto.todo.unaFoto.join(','));
paso('mientras no se han contado, las fotos quedan en duda y no se dan por buenas',
  puntoAPunto.todo.sinContar.duda === true && puntoAPunto.todo.sinContar.ok === false,
  JSON.stringify(puntoAPunto.todo.sinContar && { ok:puntoAPunto.todo.sinContar.ok, duda:puntoAPunto.todo.sinContar.duda }));

const textos = await T(() => {
  const g = window.__T;
  return g.minimoObra(g.puertaDe('pt-sin-doc'), 0).puntos.map(x => ({ c:x.clave, q:x.que }));
});
/* Todos menos «ficha», que no pide nada: cuando sale, ya está hecha. */
paso('cada punto que pide algo explica qué hay que tomar y cómo',
  textos.filter(x => x.c !== 'ficha').every(x => x.q && x.q.length > 40),
  textos.map(x=>x.c+':'+(x.q||'').length).join(' '));
paso('las medidas dicen que es el paso libre y en milímetros',
  /paso libre/.test((textos.find(x=>x.c==='medidas')||{}).q) &&
  /milímetros/.test((textos.find(x=>x.c==='medidas')||{}).q));
paso('las fotos dicen cuáles: el conjunto y la placa o el cuadro',
  /conjunto/.test((textos.find(x=>x.c==='fotos')||{}).q) &&
  /placa de características o del cuadro/.test((textos.find(x=>x.c==='fotos')||{}).q));
paso('el tipo explica que de él salen el guión y los límites de fuerza',
  /guión de revisión/.test((textos.find(x=>x.c==='tipo')||{}).q) &&
  /límite/.test((textos.find(x=>x.c==='tipo')||{}).q));

/* ================================================================
   4. Las tres maneras de tomar la matrícula
   ================================================================ */
bloque('4. La matrícula: de la puerta, de un componente, o por qué no hay');

const mat = await T(async () => {
  const g = window.__T, out = {};
  const poner = async o => { await g.sb.from('puertas').update(o).eq('id','pt-sin-doc'); await g.cargar();
                             return g.matriculaTomada(g.puertaDe('pt-sin-doc')); };
  out.conPlaca = await poner({ matricula:'Erreka, Rino 4, nº 2019-0481', sin_matricula:null });
  out.sinNada  = await poner({ matricula:null, sin_matricula:null });
  // la del motor, dada de alta como componente con su número de serie
  await g.sb.from('componentes').insert({ puerta_id:'pt-sin-doc', clave:'motor', nombre:'Motor',
    marca:'Erreka', modelo:'Rino 4', num_serie:'MT-55120', creado_por:'prueba' });
  await g.cargar();
  out.porComponente = g.matriculaTomada(g.puertaDe('pt-sin-doc'));
  // un componente sin nada escrito no cuenta como matrícula
  const { data: c } = await g.sb.from('componentes').select('*').eq('puerta_id','pt-sin-doc');
  for (const x of (c||[])) await g.sb.from('componentes').delete().eq('id', x.id);
  await g.sb.from('componentes').insert({ puerta_id:'pt-sin-doc', clave:'motor', nombre:'Motor',
    creado_por:'prueba' });
  await g.cargar();
  out.componenteVacio = g.matriculaTomada(g.puertaDe('pt-sin-doc'));
  // un componente retirado tampoco: ya no está puesto
  await g.sb.from('componentes').update({ marca:'Erreka', modelo:'Rino 4', num_serie:'MT-55120',
    activo:false }).eq('puerta_id','pt-sin-doc');
  await g.cargar();
  out.componenteRetirado = g.matriculaTomada(g.puertaDe('pt-sin-doc'));
  const { data: c2 } = await g.sb.from('componentes').select('*').eq('puerta_id','pt-sin-doc');
  for (const x of (c2||[])) await g.sb.from('componentes').delete().eq('id', x.id);
  await g.cargar();
  // y el motivo escrito cuenta como dato tomado
  const p = g.puertaDe('pt-sin-doc');
  out.sinMotivo = g.minimoObra(p, 2).bloquean.map(x => x.clave).join(',');
  await g.sb.from('puertas').update({ sin_matricula:'Puerta de los años 80 sin placa; el motor es nuevo y va en su componente.' }).eq('id','pt-sin-doc');
  await g.cargar();
  out.conMotivo = g.minimoObra(g.puertaDe('pt-sin-doc'), 2).completo;
  out.motivoNoEsMatricula = g.matriculaTomada(g.puertaDe('pt-sin-doc'));
  return out;
});
paso('la placa de la puerta cuenta', mat.conPlaca === true);
paso('sin nada, no hay matrícula tomada', mat.sinNada === false);
paso('el número de serie del motor, como componente, cuenta',
  mat.porComponente === true);
paso('un componente dado de alta sin marca ni serie no cuenta',
  mat.componenteVacio === false);
paso('un componente retirado no cuenta: ya no está puesto',
  mat.componenteRetirado === false);
paso('sin matrícula ni motivo, el punto bloquea',
  mat.sinMotivo === 'matricula', mat.sinMotivo);
paso('con el motivo escrito, el mínimo se completa',
  mat.conMotivo === true);
paso('pero el motivo no se cuenta como matrícula tomada: son cosas distintas',
  mat.motivoNoEsMatricula === false);

/* ================================================================
   5. Las fotos se cuentan en la base de datos
   ================================================================ */
bloque('5. Las fotos se cuentan donde están, no en la pantalla');

await limpiarPuerta();
const fotos = await T(async base => {
  const g = window.__T;
  await g.sb.from('puertas').update(base).eq('id','pt-sin-doc');
  await g.cargar();
  const out = { cero: await g.contarFotos('pt-sin-doc') };
  await g.sb.from('fotos').insert({ puerta_id:'pt-sin-doc', ruta:'pt-sin-doc/a.jpg', autor:'prueba' });
  out.una = await g.contarFotos('pt-sin-doc');
  await g.sb.from('fotos').insert({ puerta_id:'pt-sin-doc', ruta:'pt-sin-doc/b.jpg', autor:'prueba' });
  out.dos = await g.contarFotos('pt-sin-doc');
  // las de otra puerta no se cuentan aquí
  await g.sb.from('fotos').insert({ puerta_id: g.S.puertas[0].id, ruta:'otra/c.jpg', autor:'prueba' });
  out.trasOtra = await g.contarFotos('pt-sin-doc');
  out.sinPuerta = await g.contarFotos(null);
  out.cacheada = g.S.fotosCuenta['pt-sin-doc'];
  return out;
}, completa);
paso('sin fotos, cero', fotos.cero === 0, fotos.cero);
paso('con una, una', fotos.una === 1, fotos.una);
paso('con dos, dos', fotos.dos === 2, fotos.dos);
paso('las fotos de otra puerta no se cuentan en esta',
  fotos.trasOtra === 2, fotos.trasOtra);
paso('sin puerta, cero y sin romperse', fotos.sinPuerta === 0, fotos.sinPuerta);
paso('la cuenta se guarda para no volver a preguntarla sin motivo',
  fotos.cacheada === 2, fotos.cacheada);

/* El cierre vuelve a contar: no se fía de lo que se pintó al abrir el parte */
const recuenta = await T(async () => {
  const g = window.__T;
  const { data } = await g.sb.from('fotos').select('*').eq('puerta_id','pt-sin-doc');
  for (const f of (data||[])) await g.sb.from('fotos').delete().eq('id', f.id);
  g.S.fotosCuenta['pt-sin-doc'] = 7;          // una cuenta vieja y falsa, a propósito
  return g.S.fotosCuenta['pt-sin-doc'];
});
paso('se deja una cuenta vieja de 7 fotos para engañar al cierre', recuenta === 7);
await abrirParte('av-inst');
const rFotos = await cerrarIntento('av-inst');
paso('el cierre no se fía de la cuenta vieja: vuelve a contar y no deja cerrar',
  rFotos.cerrado === false, rFotos.cerrado);
paso('y dice que faltan las fotos',
  /fotos/i.test(rFotos.err), rFotos.err);
await T(() => window.__T.cerrarDlg()); await esperar(300);

/* ================================================================
   6. Lo que no se puede resolver en obra
   ================================================================ */
bloque('6. Sin etiquetas libres: no bloquea, pero queda pendiente');

const sinEtiquetas = await T(async base => {
  const g = window.__T;
  /* Se le dan a la puerta todos los datos menos la etiqueta, y se dejan todas las
     etiquetas de la furgoneta asignadas a otras puertas: el técnico no puede pegar
     ninguna, y eso no es culpa suya. */
  await g.sb.from('puertas').update(Object.assign({}, base, { codigo:null })).eq('id','pt-sin-doc');
  await g.sb.from('fotos').insert([
    { puerta_id:'pt-sin-doc', ruta:'pt-sin-doc/a.jpg', autor:'prueba' },
    { puerta_id:'pt-sin-doc', ruta:'pt-sin-doc/b.jpg', autor:'prueba' }]);
  /* El cargar() va aquí a propósito: sin él, la lista de puertas en memoria
     todavía diría que esta tiene la etiqueta AR-0101, y la prueba dejaría una
     etiqueta libre sin querer. */
  await g.cargar();
  const libres = g.S.etiquetas.filter(e => !g.S.puertas.some(p => p.codigo === e.codigo));
  for (const e of libres)
    await g.sb.from('puertas').insert({ codigo:e.codigo, cliente:'Relleno de la prueba',
      direccion:'Para gastar las etiquetas libres' });
  await g.cargar();
  const m = g.minimoObra(g.puertaDe('pt-sin-doc'), 2);
  return { faltan: m.faltan.map(x => x.clave), bloquean: m.bloquean.map(x => x.clave),
           imposible: (m.puntos.find(x => x.clave === 'etiqueta') || {}).imposible,
           porque: (m.puntos.find(x => x.clave === 'etiqueta') || {}).porque,
           html: g.bloqueAltaObra({ id:'av-inst', tipo:'instalacion' }, g.puertaDe('pt-sin-doc'), 2) };
}, completa);
paso('la etiqueta sigue faltando', sinEtiquetas.faltan.join(',') === 'etiqueta', sinEtiquetas.faltan.join(','));
paso('pero no bloquea: no se puede resolver allí',
  sinEtiquetas.bloquean.length === 0, sinEtiquetas.bloquean.join(','));
paso('y queda marcada como no resoluble en obra', sinEtiquetas.imposible === true);
paso('con el motivo explicado, no a secas',
  /No quedan etiquetas libres/.test(sinEtiquetas.porque||''), sinEtiquetas.porque);
paso('el recuadro lo dice sin dar a entender que da igual',
  /Se puede cerrar la visita, pero queda como pendiente/.test(sinEtiquetas.html));

await abrirParte('av-inst');
const rPend = await T(async () => {
  const g = window.__T;
  const a = g.S.avisos.find(x => x.id === 'av-inst');
  await g.guardarCierre(a, true);
  await g.cargar();
  const d = g.S.avisos.find(x => x.id === 'av-inst') || {};
  return { cerrado: !!d.cerrado, pendiente: !!d.pendiente, texto: d.pendiente_texto || '' };
});
paso('la visita se cierra', rPend.cerrado === true);
paso('pero queda señalada como pendiente', rPend.pendiente === true);
paso('y el pendiente dice qué fue lo que no se pudo hacer',
  /[Ee]tiqueta/.test(rPend.texto), rPend.texto);

/* ================================================================
   7. Con el mínimo completo se cierra
   ================================================================ */
bloque('7. Con el mínimo completo, la visita se cierra sin pelear');

const completo = await T(async base => {
  const g = window.__T;
  // se libera una etiqueta quitando los rellenos de la prueba anterior
  const rellenos = g.S.puertas.filter(p => p.cliente === 'Relleno de la prueba');
  for (const p of rellenos) await g.sb.from('puertas').delete().eq('id', p.id);
  await g.sb.from('puertas').update(base).eq('id','pt-sin-doc');
  await g.cargar();
  const m = g.minimoObra(g.puertaDe('pt-sin-doc'), await g.contarFotos('pt-sin-doc'));
  return { completo: m.completo, faltan: m.faltan.length };
}, completa);
paso('la puerta queda documentada del todo',
  completo.completo === true && completo.faltan === 0, JSON.stringify(completo));

await abrirParte('av-norm');
const rOk = await T(async () => {
  const g = window.__T;
  const a = g.S.avisos.find(x => x.id === 'av-norm');
  await g.guardarCierre(a, true);
  await g.cargar();
  const d = g.S.avisos.find(x => x.id === 'av-norm') || {};
  return { cerrado: !!d.cerrado, pendiente: !!d.pendiente,
           err: (document.querySelector('#dlg-form .err') || {}).textContent || '' };
});
paso('la adecuación a normativa se cierra', rOk.cerrado === true, rOk.err);
paso('y no se le inventa ningún pendiente', rOk.pendiente === false);
const htmlOk = await T(() => {
  const g = window.__T;
  return g.bloqueAltaObra({ id:'av-norm', tipo:'normativa' }, g.puertaDe('pt-sin-doc'), 2);
});
paso('el recuadro lo dice en verde y sin avisos',
  /El mínimo de obra está completo/.test(htmlOk) && !/no se cierra sin eso/.test(htmlOk));

/* ================================================================
   8. El aviso sale antes de salir de casa
   ================================================================ */
bloque('8. La tarjeta de trabajo avisa antes de salir');

const tarjetas = await T(() => {
  const g = window.__T;
  const conTodo = g.tarjetaTrabajo(g.S.avisos.find(x => x.id === 'av-inst'));
  // y la misma asistencia con la puerta vuelta a dejar sin medidas
  return { conTodo };
});
paso('con la puerta documentada, la tarjeta no mete ruido',
  !/Falta documentar/.test(tarjetas.conTodo) && !/Puerta sin documentar/.test(tarjetas.conTodo));

const tarjetaFalta = await T(async () => {
  const g = window.__T;
  await g.sb.from('puertas').update({ ancho_mm:null, alto_mm:null }).eq('id','pt-sin-doc');
  await g.cargar();
  const conFalta = g.tarjetaTrabajo(g.S.avisos.find(x => x.id === 'av-inst'));
  const averia   = g.tarjetaTrabajo(g.S.avisos.find(x => x.id === 'av-aver'));
  const sinPuerta = g.tarjetaTrabajo(g.S.avisos.find(x => x.id === 'av-ps'));
  return { conFalta, averia, sinPuerta };
});
paso('si falta algo, la tarjeta lo dice y nombra qué',
  /Falta documentar la puerta/.test(tarjetaFalta.conFalta) &&
  /ancho y alto/i.test(tarjetaFalta.conFalta));
paso('las fotos no se nombran en la tarjeta: no se cuentan por tarjeta',
  !/fotos de la puerta/i.test(tarjetaFalta.conFalta));
paso('una puerta sin ficha sale como «puerta sin documentar»',
  /Puerta sin documentar/.test(tarjetaFalta.sinPuerta) &&
  /medidas, fotos y matrículas/.test(tarjetaFalta.sinPuerta));
paso('la avería de la misma puerta no dice nada de esto',
  !/documentar/.test(tarjetaFalta.averia));

/* ================================================================
   9. Lo recomendado no bloquea
   ================================================================ */
bloque('9. Lo recomendado se ofrece, no se exige');

const rec = await T(async base => {
  const g = window.__T;
  await g.sb.from('puertas').update(base).eq('id','pt-sin-doc');
  await g.cargar();
  const p = g.puertaDe('pt-sin-doc');
  const antes = g.recomendadoObra(p);
  const m = g.minimoObra(p, 2);
  await g.sb.from('puertas').update({ uso:'Comunidad de vecinos', peso_kg:180,
    cuadro:'Erreka Roma', motor:'Erreka Rino 4' }).eq('id','pt-sin-doc');
  await g.cargar();
  const despues = g.recomendadoObra(g.puertaDe('pt-sin-doc'));
  return { antes, completo: m.completo, despues, sinPuerta: g.recomendadoObra(null) };
}, completa);
paso('con el mínimo hecho y lo recomendado sin hacer, el mínimo está completo',
  rec.completo === true);
paso('y lo recomendado se enumera aparte',
  rec.antes.length >= 4, rec.antes.join(' · '));
paso('el peso de la hoja es recomendado, nunca obligatorio',
  rec.antes.some(x => /[Pp]eso/.test(x)));
paso('al rellenarlo, la lista se queda corta',
  rec.despues.length < rec.antes.length, rec.despues.join(' · '));
paso('de una puerta que no existe no se recomienda nada',
  rec.sinPuerta.length === 0);

const recHtml = await T(async () => {
  const g = window.__T;
  await g.sb.from('puertas').update({ uso:null, peso_kg:null }).eq('id','pt-sin-doc');
  await g.cargar();
  return g.bloqueAltaObra({ id:'av-inst', tipo:'instalacion' }, g.puertaDe('pt-sin-doc'), 2);
});
paso('lo recomendado sale en el parte, plegado y marcado como recomendado',
  /Recomendado/.test(recHtml) && /datos más, si están a mano/.test(recHtml));
paso('y dice por qué el peso no está arriba: en obra no hay báscula',
  /en obra no hay báscula/.test(recHtml));
paso('pero no se pinta ningún aviso de que falte el mínimo',
  /El mínimo de obra está completo/.test(recHtml));

/* ================================================================
   10. Una avería corriente no pide nada
   ================================================================ */
bloque('10. Una avería corriente se cierra como siempre');

await T(async () => {
  const g = window.__T;
  await g.sb.from('puertas').update({ codigo:null, tipo:null, ancho_mm:null, alto_mm:null,
    matricula:null, sin_matricula:null }).eq('id','pt-sin-doc');
  await g.cargar();
});
await abrirParte('av-aver');
paso('el parte de una avería no trae el recuadro de obra',
  await pag.locator('#obra-bloque').count() === 0);
const rAv = await T(async () => {
  const g = window.__T;
  const a = g.S.avisos.find(x => x.id === 'av-aver');
  await g.guardarCierre(a, true);
  await g.cargar();
  const d = g.S.avisos.find(x => x.id === 'av-aver') || {};
  return { cerrado: !!d.cerrado, pendiente: !!d.pendiente,
           err: (document.querySelector('#dlg-form .err')||{}).textContent || '' };
});
paso('y se cierra con la puerta a medio documentar', rAv.cerrado === true, rAv.err);
paso('sin inventarle pendientes', rAv.pendiente === false);

/* ================================================================
   11. Los campos nuevos de la ficha
   ================================================================ */
bloque('11. Matrícula y motivo en la ficha de la puerta');

const ficha = await T(() => {
  const g = window.__T;
  g.dlgPuerta('pt-sin-doc');
  return { mat: !!document.getElementById('f-matricula'),
           sin: !!document.getElementById('f-sinmat'),
           enBorrador: g.CAMPOS_PUERTA.includes('f-matricula') && g.CAMPOS_PUERTA.includes('f-sinmat'),
           sinObra: g.S.sinObra };
});
paso('la base de datos de pruebas tiene las columnas de obra', ficha.sinObra === false);
paso('la ficha pide la matrícula', ficha.mat === true);
paso('y por qué no hay, si no la hay', ficha.sin === true);
paso('los dos campos se recuperan si se sale a crear un cliente',
  ficha.enBorrador === true);

const guardado = await T(async () => {
  document.getElementById('f-matricula').value = 'Hörmann SPU F42, nº 4471-2019';
  document.getElementById('f-sinmat').value = '';
  document.querySelector('#dlg button[type="submit"]').click();
  await new Promise(r => setTimeout(r, 1200));
  const g = window.__T;
  return (g.puertaDe('pt-sin-doc') || {}).matricula;
});
paso('lo escrito se guarda tal cual, sin interpretarlo',
  guardado === 'Hörmann SPU F42, nº 4471-2019', guardado);

const enFicha = await T(async () => {
  const g = window.__T;
  g.S.ficha = 'pt-sin-doc'; g.S.tab = 'puertas'; g.pintar();
  // pintar() espera al siguiente fotograma: sin esta pausa se lee la pantalla vieja
  await new Promise(r => setTimeout(r, 400));
  const t = document.getElementById('vista').textContent;
  return { matricula: /Hörmann SPU F42/.test(t) };
});
paso('y sale en la ficha técnica de la puerta', enFicha.matricula === true);

const sinColumnas = await T(() => {
  const g = window.__T;
  g.S.sinObra = true;
  g.dlgPuerta('pt-sin-doc');
  const hay = !!document.getElementById('f-matricula');
  const html = g.bloqueAltaObra({ id:'av-inst', tipo:'instalacion' }, g.puertaDe('pt-sin-doc'), 2);
  g.cerrarDlg(); g.S.sinObra = false;
  return { hay, html };
});
paso('si el SQL de obra no está ejecutado, esos campos no se enseñan',
  sinColumnas.hay === false);
paso('y el parte lo dice en vez de dejar al técnico buscando el campo',
  /Falta ejecutar en la base de datos el SQL de obra/.test(sinColumnas.html));

/* ================================================================
   12. Los ficheros elegidos dentro del diálogo
   ================================================================ */
bloque('12. Subir fotos desde el propio parte');

const oyente = await T(async () => {
  const g = window.__T;
  await g.sb.from('puertas').update({ codigo:'AR-0101', tipo:'Corredera' }).eq('id','pt-sin-doc');
  await g.cargar();
  g.dlgCierre('av-inst');
  await new Promise(r => setTimeout(r, 800));
  const inp = document.querySelector('[data-act="obra-foto"]');
  return { hay: !!inp, puerta: inp ? inp.dataset.id : '', aviso: inp ? inp.dataset.aviso : '',
           camara: inp ? inp.getAttribute('capture') : '' };
});
paso('el parte trae su propio botón de fotos', oyente.hay === true);
paso('apuntando a esta puerta y a esta asistencia',
  oyente.puerta === 'pt-sin-doc' && oyente.aviso === 'av-inst',
  oyente.puerta+' / '+oyente.aviso);
paso('y abre la cámara de atrás del móvil, no el carrete',
  oyente.camara === 'environment', oyente.camara);

/* El fichero se elige de verdad, para comprobar que el diálogo tiene oyente:
   antes de esto, los botones de fichero dentro de un diálogo no hacían nada,
   porque el oyente estaba puesto en la vista y el <dialog> no está dentro. */
const antesFotos = await T(() => window.__T.contarFotos('pt-sin-doc'));
await pag.setInputFiles('[data-act="obra-foto"]', [{
  name:'placa.png', mimeType:'image/png',
  buffer: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' +
                      '0d0a2db40000000049454e44ae426082', 'hex') }]);
await esperar(2500);
const despuesFotos = await T(() => window.__T.contarFotos('pt-sin-doc'));
paso('al elegir la foto, se sube sin salir del parte',
  despuesFotos === antesFotos + 1, antesFotos+' → '+despuesFotos);
paso('y el recuadro se vuelve a pintar con la cuenta nueva',
  await pag.locator('#obra-bloque').count() === 1);
const compInput = await T(() => {
  const g = window.__T;
  g.cerrarDlg();
  g.dlgComponente(null, 'pt-sin-doc');
  const f = document.querySelector('[data-act="comp-foto"]');
  const d = document.querySelector('[data-act="comp-doc"]');
  g.cerrarDlg();
  return { f: !!f, d: !!d };
});
paso('el componente también ofrece su foto y su papel dentro del diálogo',
  compInput.f === true && compInput.d === true);

/* ================================================================
   El dintel
   ================================================================
   La medida que decide si una seccional entra o no entra. Se pide
   solo donde manda algo: en todo lo que sube. */
bloque('El dintel');

const dintel = await T(async () => {
  const g = window.__T;
  const donde = {};
  ['Seccional', 'Enrollable', 'Puerta rápida', 'Basculante', 'Guillotina',
   'Corredera', 'Batiente', 'Barrera'].forEach(t => { donde[t] = g.pideDintel(t); });
  /* En la ficha de una puerta seccional el campo tiene que estar visible */
  const pu = g.S.puertas.find(x => /seccional/i.test(x.tipo || '')) || g.S.puertas[0];
  await g.sb.from('puertas').update({ tipo:'Seccional' }).eq('id', pu.id);
  await g.cargar();
  g.dlgPuerta(pu.id);
  await new Promise(r => setTimeout(r, 400));
  const caja = document.getElementById('f-caja-dintel');
  const visibleSeccional = !!caja && !caja.hidden;
  /* Se escribe y se guarda */
  document.getElementById('f-dintel').value = '420';
  /* Y al cambiar a corredera, el campo se esconde solo */
  const tipo = document.getElementById('f-tipo');
  const antes = tipo.value;
  tipo.value = 'Corredera';
  tipo.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 150));
  const visibleCorredera = !!caja && !caja.hidden;
  tipo.value = antes;
  tipo.dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 150));
  document.querySelector('#dlg-form [type="submit"]').click();
  await new Promise(r => setTimeout(r, 900));
  const guardado = (g.puertaDe(pu.id) || {}).dintel_mm;
  g.cerrarDlg();
  return { donde, visibleSeccional, visibleCorredera, guardado };
});
paso('el dintel se pide en todo lo que sube',
  dintel.donde['Seccional'] && dintel.donde['Enrollable'] && dintel.donde['Puerta rápida'] &&
  dintel.donde['Basculante'] && dintel.donde['Guillotina'],
  JSON.stringify(dintel.donde));
paso('y no se pide donde no decide nada',
  !dintel.donde['Corredera'] && !dintel.donde['Batiente'] && !dintel.donde['Barrera']);
paso('en la ficha de una seccional el campo está a la vista',
  dintel.visibleSeccional === true);
paso('y al cambiar el tipo a corredera desaparece solo',
  dintel.visibleCorredera === false);
paso('el dintel se guarda con la puerta', dintel.guardado === 420, dintel.guardado);

/* ================================================================
   Obras de varios días
   ================================================================
   Una obra de cuatro días no cabía en una sola jornada. El técnico
   tenía que acordarse el jueves de lo que hizo el lunes. */
bloque('Obras de varios días');

const obraLarga = await T(async () => {
  const g = window.__T;
  const av = g.S.avisos[0];
  /* Lunes */
  g.dlgJornada(av.id, null);
  await new Promise(r => setTimeout(r, 300));
  const sinJornadas = document.getElementById('dlg-form').innerText;
  document.getElementById('j-fecha').value = '2026-10-19';
  document.getElementById('j-horas').value = '8';
  document.getElementById('j-trab').value = 'Montadas las guías y el eje.';
  document.getElementById('j-prox').value = 'Falta traer el cuadro de maniobra y dos emisores.';
  document.querySelector('#dlg-form [type="submit"]').click();
  await new Promise(r => setTimeout(r, 900));
  const unaJornada = g.jornadasDe(av.id).length;
  const marcada = (g.S.avisos.find(x => x.id === av.id) || {}).obra_larga;

  /* Martes: al abrir el parte tiene que leerse lo que se dejó dicho el lunes */
  g.dlgJornada(av.id, null);
  await new Promise(r => setTimeout(r, 300));
  const avisoPrevio = document.getElementById('dlg-form').innerText;
  document.getElementById('j-fecha').value = '2026-10-20';
  document.getElementById('j-horas').value = '6';
  document.getElementById('j-trab').value = 'Puesto el cuadro y probada la maniobra.';
  document.querySelector('#dlg-form [type="submit"]').click();
  await new Promise(r => setTimeout(r, 900));
  const js = g.jornadasDe(av.id);

  /* Material del martes */
  const j2 = js[1];
  g.dlgMaterialJornada(j2.id, av.id);
  await new Promise(r => setTimeout(r, 300));
  document.getElementById('jm-desc').value = 'Cuadro de maniobra';
  document.getElementById('jm-cant').value = '1';
  document.querySelector('#dlg-form [type="submit"]').click();
  await new Promise(r => setTimeout(r, 1100));
  /* Los materiales no están en memoria: se piden por jornada, igual que hace
     la propia aplicación al abrir el parte. */
  const { data: matsJ } = await g.sb.from('materiales').select('*').eq('jornada_id', j2.id);
  const mats = matsJ || [];
  const enParte = document.getElementById('dlg-form').innerText;

  /* Y al cerrar, el resumen de las dos jornadas */
  g.cerrarDlg();
  g.dlgCierre(av.id);
  await new Promise(r => setTimeout(r, 500));
  const enCierre = document.getElementById('dlg-form').innerText;
  const sinFirmaDiaria = !document.getElementById('j-firma');
  g.cerrarDlg();
  return { avisoId: av.id, sinJornadas, unaJornada, marcada, avisoPrevio,
    n: js.length, horas: g.horasObra(av.id),
    mats: mats.length, enParte, enCierre, sinFirmaDiaria,
    proxima: (g.avisoProxima(av.id) || {}).proxima };
});
paso('el parte del día no pide firma: la firma es del cierre',
  obraLarga.sinFirmaDiaria === true && /no se firma/.test(obraLarga.sinJornadas));
paso('se guarda la primera jornada', obraLarga.unaJornada === 1);
paso('y la asistencia queda marcada como obra de varios días',
  obraLarga.marcada === true);
paso('al abrir el parte del día siguiente, lo primero es lo que se dejó dicho',
  /Falta traer el cuadro/.test(obraLarga.avisoPrevio), 'avisó de lo pendiente');
paso('se guardan las dos jornadas con sus horas',
  obraLarga.n === 2 && obraLarga.horas === 14, obraLarga.n+' jornadas, '+obraLarga.horas+' horas');
paso('el material se apunta al día en que se gastó', obraLarga.mats === 1);
paso('y el parte de ese día lo enseña',
  /Cuadro de maniobra/.test(obraLarga.enParte || ''), 'en el parte del martes');
paso('al cerrar, el diálogo se llama «Cerrar la obra» y resume las jornadas',
  /Cerrar la obra/.test(obraLarga.enCierre) && /Jornadas de esta obra/.test(obraLarga.enCierre));
paso('diciendo las horas totales, que son las que se facturan',
  /14 horas en total/.test(obraLarga.enCierre), (obraLarga.enCierre.match(/\d+ jornadas?[^.]*/)||[''])[0]);
paso('y lo que quedó dicho sigue disponible',
  /cuadro de maniobra/i.test(obraLarga.proxima || ''), obraLarga.proxima);

/* ================================================================
   Declarar que la obra no se acaba hoy
   ================================================================
   Antes la obra larga se deducía: apuntabas un parte y la aplicación
   la marcaba sola. Ahora se declara a propósito, porque cambia dónde
   se firma y de dónde salen las horas que se facturan. */
bloque('Obra sin terminar');

const declarar = await T(async () => {
  const g = window.__T;
  /* Una asistencia nueva, sin partes */
  const { data: nv } = await g.sb.from('avisos').insert({
    tipo:'instalacion', estado:'asignado', prioridad:'normal',
    tecnico_id: g.S.perfil.id, cliente_id: g.S.clientes[0].id,
    descripcion:'Obra de varios días' }).select().maybeSingle();
  await g.cargar();
  const av = g.S.avisos.find(x => x.id === nv.id);

  const tarjeta = g.tarjetaTrabajo(av);
  const antes = { larga: g.esObraLarga(av),
    sinTerminar: /data-act="obra-sin-terminar"/.test(tarjeta),
    parteHoy: /data-act="jornada-hoy"/.test(tarjeta),
    cerrar: (tarjeta.match(/>Cerrar [^<]*/)||[''])[0] };

  /* Se pulsa: primero explica qué cambia */
  g.dlgObraSinTerminar(av.id);
  await new Promise(r => setTimeout(r, 300));
  const aviso = document.getElementById('dlg-form').innerText;
  document.querySelector('[data-act="obra-sin-terminar-ok"]').click();
  await new Promise(r => setTimeout(r, 900));
  const abreParte = !!document.getElementById('j-trab');
  g.cerrarDlg();
  await g.cargar();
  const av2 = g.S.avisos.find(x => x.id === nv.id);
  const tarjeta2 = g.tarjetaTrabajo(av2);
  const despues = { larga: g.esObraLarga(av2),
    sinTerminar: /data-act="obra-sin-terminar"/.test(tarjeta2),
    parteHoy: /data-act="jornada-hoy"/.test(tarjeta2),
    cerrar: (tarjeta2.match(/>Cerrar [^<]*/)||[''])[0] };

  /* Marcada pero sin partes: al cerrar avisa y deja volver atrás */
  g.dlgCierre(av.id);
  await new Promise(r => setTimeout(r, 500));
  const enCierre = document.getElementById('dlg-form').innerText;
  const hayDeshacer = !!document.querySelector('[data-act="obra-terminada"]');
  const bot = document.querySelector('[data-act="obra-terminada"]');
  bot.click(); await new Promise(r => setTimeout(r, 150));
  bot.click(); await new Promise(r => setTimeout(r, 900));
  await g.cargar();
  const av3 = g.S.avisos.find(x => x.id === nv.id);
  const deshecha = g.esObraLarga(av3);
  g.cerrarDlg();
  return { antes, aviso, abreParte, despues, enCierre, hayDeshacer, deshecha };
});
paso('una asistencia nueva sale con «Obra sin terminar» y «Cerrar visita»',
  declarar.antes.larga === false && declarar.antes.sinTerminar === true &&
  declarar.antes.parteHoy === false && /Cerrar visita/.test(declarar.antes.cerrar),
  JSON.stringify(declarar.antes));
paso('antes de marcarla, explica las cuatro cosas que cambian',
  /parte, no un cierre/.test(declarar.aviso) && /firma una sola vez/.test(declarar.aviso) &&
  /dejes dicho sale al volver/.test(declarar.aviso) && /horas de todos los días/.test(declarar.aviso));
paso('al aceptar, abre directamente el parte del día',
  declarar.abreParte === true);
paso('y la tarjeta cambia a «Parte de hoy» y «Cerrar la obra»',
  declarar.despues.larga === true && declarar.despues.parteHoy === true &&
  declarar.despues.sinTerminar === false && /Cerrar la obra/.test(declarar.despues.cerrar),
  JSON.stringify(declarar.despues));
paso('marcada y sin ningún parte, al cerrar avisa en vez de dejarte perder las horas',
  /no tiene ningún parte/.test(declarar.enCierre) && declarar.hayDeshacer === true);
paso('y se puede deshacer mientras no haya partes',
  declarar.deshecha === false);

/* ================================================================
   Lo que se factura de una obra larga
   ================================================================
   El agujero que apareció al repasarlo: la valoración de una visita
   multiplica horas por técnicos y lee SOLO el campo del cierre. Sumar
   las jornadas en un cartel y dejar el campo con las horas del último
   día habría hecho facturar de menos en todas las obras largas. */
bloque('Las horas de la obra llegan a facturación');

/* Se trabaja sobre el MISMO aviso que el bloque anterior: ahí quedaron las
   dos jornadas. Coger «el primero de la lista» va bien hasta que otro bloque
   crea un aviso y lo adelanta, que es lo que pasó el 27-10-2026. */
const facturacion = await T(async (avisoId) => {
  const g = window.__T;
  const av = g.S.avisos.find(x => x.id === avisoId);
  /* Mismos técnicos todos los días: 8 + 6 = 14 h, dos técnicos */
  await g.sb.from('jornadas').update({ num_tecnicos:2, km:30 }).eq('aviso_id', av.id);
  await g.cargar();
  const iguales = g.resumenHorasObra(av.id);

  g.dlgCierre(av.id);
  await new Promise(r => setTimeout(r, 600));
  const campoH = document.getElementById('z-horas').value;
  const campoT = document.getElementById('z-ntec').value;
  const campoK = document.getElementById('z-km').value;
  const pista = document.getElementById('z-horas').parentElement.textContent;
  /* Y que el cálculo automático de entrada y salida no lo pise */
  document.getElementById('z-ini').value = '09:00';
  document.getElementById('z-ini').dispatchEvent(new Event('change', { bubbles:true }));
  document.getElementById('z-fin').value = '11:00';
  document.getElementById('z-fin').dispatchEvent(new Event('change', { bubbles:true }));
  await new Promise(r => setTimeout(r, 200));
  const trasHoras = document.getElementById('z-horas').value;
  const hayBoton = !!document.querySelector('[data-act="jornada-hoy"]');
  g.cerrarDlg();

  /* Y ahora con distinto número de técnicos cada día */
  const js = g.jornadasDe(av.id);
  await g.sb.from('jornadas').update({ num_tecnicos:1 }).eq('id', js[0].id);
  await g.cargar();
  const distintos = g.resumenHorasObra(av.id);
  g.dlgCierre(av.id);
  await new Promise(r => setTimeout(r, 600));
  const campoH2 = document.getElementById('z-horas').value;
  const campoT2 = document.getElementById('z-ntec').value;
  const pista2 = document.getElementById('z-horas').parentElement.textContent;
  g.cerrarDlg();
  return { iguales, distintos, campoH, campoT, campoK, pista, trasHoras, hayBoton,
           campoH2, campoT2, pista2 };
}, obraLarga.avisoId);
paso('con los mismos técnicos todos los días, se suman las horas tal cual',
  facturacion.iguales.horas === 14 && facturacion.iguales.tecnicos === 2 &&
  facturacion.iguales.facturar === 14,
  JSON.stringify(facturacion.iguales));
paso('y el cierre las trae puestas, con sus técnicos',
  facturacion.campoH === '14' && facturacion.campoT === '2',
  facturacion.campoH+' h × '+facturacion.campoT);
paso('diciendo de dónde salen', /Suma de las 2 jornadas/.test(facturacion.pista), 'lo explica');
paso('el cálculo de entrada y salida ya no las pisa',
  facturacion.trasHoras === '14', facturacion.trasHoras);
paso('los kilómetros también se suman', facturacion.campoK === '60', facturacion.campoK);
paso('y hay un botón para apuntar la jornada de hoy antes de cerrar',
  facturacion.hayBoton === true);
paso('si el número de técnicos cambió de un día a otro, se pasan a horas de técnico',
  facturacion.distintos.horasPersona === 20 && facturacion.distintos.facturar === 20 &&
  facturacion.distintos.tecnicos === 1,
  '8 h × 1 + 6 h × 2 = '+facturacion.distintos.horasPersona);
paso('el cierre lo refleja, con un solo técnico para no multiplicar dos veces',
  facturacion.campoH2 === '20' && facturacion.campoT2 === '1',
  facturacion.campoH2+' h × '+facturacion.campoT2);
paso('y explica por qué', /horas de técnico/.test(facturacion.pista2), 'lo explica');

/* ================================================================
   Entrega en obra
   ================================================================ */
bloque('Entrega en obra');

const entrega = await T(async (avisoId) => {
  const g = window.__T;
  /* El guión sale del tipo de puerta */
  const guiones = {
    seccional: g.guionEntrega('Seccional').length,
    barrera: g.guionEntrega('Barrera').length,
    peatonal: g.guionEntrega('Peatonal automática').length,
    raro: g.guionEntrega('Algo que no existe').length };
  const hayMuelle = g.guionEntrega('Seccional').some(x => /muelle/i.test(x));
  const hayMastil = g.guionEntrega('Barrera').some(x => /mástil/i.test(x));

  const av = g.S.avisos.find(x => x.id === avisoId);
  await g.sb.from('avisos').update({ tipo:'instalacion' }).eq('id', av.id);
  await g.sb.from('puertas').update({ tipo:'Seccional' }).eq('id', av.puerta_id);
  await g.cargar();

  g.dlgEntregaObra(av.id, null);
  await new Promise(r => setTimeout(r, 450));
  const txt = document.getElementById('dlg-form').innerText;
  const nPuntos = document.querySelectorAll('#dlg-form input[type="radio"]').length / 3;

  /* Firmar sin marcar nada tiene que fallar */
  document.getElementById('eo-que').value = 'Puerta seccional 3x3 con motor y cuadro';
  document.querySelector('#dlg-form [type="submit"]').click();
  await new Promise(r => setTimeout(r, 300));
  const sinMarcar = document.querySelector('#dlg-form .err').textContent;

  /* Se marca todo bien menos uno, y se deja «Conforme» a propósito */
  document.querySelectorAll('#dlg-form input[type="radio"][value="bien"]').forEach(r => { r.checked = true; });
  const malo = document.querySelector('#dlg-form input[type="radio"][value="mal"]');
  malo.checked = true;
  document.querySelector('#dlg-form [type="submit"]').click();
  await new Promise(r => setTimeout(r, 300));
  const contradice = document.querySelector('#dlg-form .err').textContent;

  /* Se corrige la conformidad y se firma */
  document.getElementById('eo-conf').value = 'con_reparos';
  document.getElementById('eo-com').value = 'El desbloqueo cuesta. Vuelven el jueves.';
  document.getElementById('eo-form').checked = true;
  g.FIRMA.ctx.beginPath(); g.FIRMA.ctx.moveTo(10,10);
  g.FIRMA.ctx.lineTo(120,60); g.FIRMA.ctx.stroke(); g.FIRMA.pintado = true;
  document.getElementById('eo-nom').value = 'Antonio Gil';
  document.querySelector('#dlg-form [type="submit"]').click();
  await new Promise(r => setTimeout(r, 1000));
  const e = g.entregasObraDe(av.id)[0];

  /* Y el acta en papel */
  const abierto = [];
  const open0 = window.open;
  window.open = () => ({ document:{ write: t => abierto.push(t), close(){} } });
  g.documentoEntrega(e.id);
  window.open = open0;
  const papel = abierto.join('');
  /* Volver a abrirla: ya no se puede tocar */
  g.dlgEntregaObra(av.id, e.id);
  await new Promise(r => setTimeout(r, 400));
  const cerrada = document.getElementById('dlg-form').innerText;
  const sinRadios = document.querySelectorAll('#dlg-form input[type="radio"]').length === 0;
  g.cerrarDlg();
  return { guiones, hayMuelle, hayMastil, txt, nPuntos, sinMarcar, contradice,
    e: { conf:e.conformidad, firma:!!e.firma_ruta, nom:e.firma_nombre, com:e.comentario,
         malos: (e.pruebas||[]).filter(x => x.resultado === 'mal').length },
    papel, cerrada, sinRadios };
}, obraLarga.avisoId);
paso('cada tipo de puerta tiene su propio guión de pruebas',
  entrega.guiones.seccional !== entrega.guiones.barrera &&
  entrega.hayMuelle === true && entrega.hayMastil === true,
  JSON.stringify(entrega.guiones));
paso('y lo que no tiene lista propia usa la general',
  entrega.guiones.raro === 12, entrega.guiones.raro);
paso('el acta sale con los puntos de la seccional',
  entrega.nPuntos === entrega.guiones.seccional && /muelle/i.test(entrega.txt),
  entrega.nPuntos+' puntos');
paso('no deja firmar con puntos sin marcar',
  /sin marcar/.test(entrega.sinMarcar), entrega.sinMarcar);
paso('ni firmar «Conforme» con un punto marcado como mal',
  /Con reparos/.test(entrega.contradice), entrega.contradice);
paso('firmada, queda con reparos, con su firma y su nombre',
  entrega.e.conf === 'con_reparos' && entrega.e.firma === true && entrega.e.nom === 'Antonio Gil');
paso('guardando lo que dijo el cliente, tal cual',
  /desbloqueo cuesta/.test(entrega.e.com || ''), entrega.e.com);
paso('y qué punto falló', entrega.e.malos === 1);
paso('el acta en papel lleva las pruebas y la conformidad',
  /ACTA DE ENTREGA EN OBRA/.test(entrega.papel) && /Con reparos/.test(entrega.papel) &&
  /Antonio Gil/.test(entrega.papel));
paso('una entrega firmada ya no se toca',
  entrega.sinRadios === true && /no se cambia/.test(entrega.cerrada));

/* ================================================================
   Una obra con varias puertas

   El agujero que cierra este bloque: avisos.puerta_id era UNA puerta. Al dar de
   alta la segunda desde el parte, la aplicación escribía su id ahí y la primera
   se soltaba sin avisar. En una instalación de varios días eso es lo normal, no
   el caso raro: en la misma nave se montan dos seccionales y una peatonal.
   ================================================================ */
bloque('Una obra, varias puertas dentro');

const varias = await T(async () => {
  const g = window.__T;
  const cli = g.S.clientes[0];
  /* Tres puertas en la misma nave, como una obra de verdad */
  const puertas = [
    { id:'pt-m1', codigo:'AR-0201', tipo:'Seccional', ancho_mm:3000, alto_mm:3000,
      ubicacion:'Muelle 1', cliente_id:cli.id, cliente:cli.nombre, sin_matricula:'Sin placa' },
    { id:'pt-m2', codigo:'AR-0202', tipo:'Seccional', ancho_mm:3000, alto_mm:3000,
      ubicacion:'Muelle 2', cliente_id:cli.id, cliente:cli.nombre, sin_matricula:'Sin placa' },
    { id:'pt-pe', codigo:'AR-0203', tipo:'Peatonal corredera', ancho_mm:1200, alto_mm:2100,
      ubicacion:'Acceso oficinas', cliente_id:cli.id, cliente:cli.nombre, sin_matricula:'Sin placa' },
  ];
  for (const p of puertas) await g.sb.from('puertas').insert(p);
  await g.sb.from('avisos').insert({ id:'av-multi', tipo:'instalacion', estado:'asignado',
    prioridad:'normal', tecnico_id:'usuario-admin', cliente_id:cli.id, puerta_id:'pt-m1',
    descripcion:'Tres puertas en la nave del polígono',
    fecha_prevista:new Date().toISOString().slice(0,10), creado:new Date().toISOString() });
  await g.cargar();

  /* Enganchar la segunda: la principal NO se toca */
  await g.engancharPuerta('av-multi', 'pt-m2', cli.id);
  await g.engancharPuerta('av-multi', 'pt-pe', cli.id);
  await g.cargar();
  const tras2 = { principal: (g.S.avisos.find(x => x.id==='av-multi')||{}).puerta_id,
                  n: g.nPuertasDeAviso('av-multi') };

  /* Y la tercera por el camino de verdad: el alta desde el propio parte, que es
     donde se perdía la anterior. */
  g.dlgCierre('av-multi');
  await new Promise(r => setTimeout(r, 700));
  g.dlgPuerta(null, 'av-multi');
  await new Promise(r => setTimeout(r, 500));
  document.getElementById('f-dir').value = 'Polígono El Palmar, nave 12';
  document.getElementById('f-ubi').value = 'Muelle 3';
  document.querySelector('#dlg-form [type="submit"]').click();
  await new Promise(r => setTimeout(r, 1400));
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 300));
  const tras3 = { principal: (g.S.avisos.find(x => x.id==='av-multi')||{}).puerta_id,
                  n: g.nPuertasDeAviso('av-multi') };

  /* La lista y los dos recuadros del parte */
  const lista = g.bloquePuertasObra(g.S.avisos.find(x => x.id==='av-multi'),
                                    g.puertasDeAviso('av-multi'));
  const docu = g.bloqueAltaObra(g.S.avisos.find(x => x.id==='av-multi'),
                                g.puertasDeAviso('av-multi'), { 'pt-m1':2, 'pt-m2':2, 'pt-pe':2 });
  const tarjeta = g.tarjetaTrabajo(g.S.avisos.find(x => x.id==='av-multi'));

  return { tras2, tras3, lista, docu, tarjeta,
    codigos: g.puertasDeAviso('av-multi').map(p => p.codigo) };
});
paso('enganchar otras dos puertas NO suelta la primera',
  varias.tras2.principal === 'pt-m1' && varias.tras2.n === 3,
  varias.tras2.principal+', '+varias.tras2.n+' puertas');
paso('dar de alta una puerta desde el parte la AÑADE, no la sustituye',
  varias.tras3.principal === 'pt-m1' && varias.tras3.n === 4,
  varias.tras3.principal+', '+varias.tras3.n+' puertas');
paso('la principal sigue siendo la primera, que es la que leen los documentos',
  varias.codigos[0] === 'AR-0201', varias.codigos.join(' · '));
paso('la lista del parte enseña las tres',
  /AR-0201/.test(varias.lista) && /AR-0202/.test(varias.lista) && /Muelle 3|AR-0203/.test(varias.lista));
paso('y dice que cada puerta lleva su propia acta',
  /su propia acta/.test(varias.lista));
paso('y que las horas son de la obra, no de cada puerta',
  /no de cada puerta/.test(varias.lista));
paso('el recuadro de documentar habla de LAS puertas, en plural',
  /Documentar las puertas en obra/.test(varias.docu));
paso('con una caja por puerta', (varias.docu.match(/id="obra-p-/g) || []).length === 4,
  (varias.docu.match(/id="obra-p-/g) || []).length);
paso('y el resumen cuenta cuántas quedan sin documentar',
  /de las 4 puertas/.test(varias.docu));
paso('la tarjeta de trabajo avisa de que la obra lleva más de una puerta',
  /3 puertas más en esta obra/.test(varias.tarjeta));
paso('y nombra las que están sin documentar',
  /Falta documentar \d+ de las 4 puertas/.test(varias.tarjeta), varias.tarjeta.includes('Falta documentar'));

/* ---- Un acta por puerta ---- */
const actas = await T(async () => {
  const g = window.__T;
  /* Sin decir de qué puerta, lo pregunta: adivinarlo sería firmar la equivocada */
  g.dlgEntregaObra('av-multi', null);
  await new Promise(r => setTimeout(r, 400));
  const pregunta = document.getElementById('dlg-form').innerText;
  const opciones = document.querySelectorAll('#dlg-form [data-act="entrega-obra"][data-puerta]').length;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 250));

  /* El acta de la peatonal, con el guión de la peatonal */
  g.dlgEntregaObra('av-multi', null, 'pt-pe');
  await new Promise(r => setTimeout(r, 450));
  const cabecera = document.getElementById('dlg-form').innerText;
  const nPuntos = document.querySelectorAll('#dlg-form input[type="radio"][value="bien"]').length;
  document.querySelectorAll('#dlg-form input[type="radio"][value="bien"]').forEach(r => { r.checked = true; });
  g.FIRMA.ctx.beginPath(); g.FIRMA.ctx.moveTo(10,10);
  g.FIRMA.ctx.lineTo(120,60); g.FIRMA.ctx.stroke(); g.FIRMA.pintado = true;
  document.getElementById('eo-nom').value = 'Encargado de la nave';
  document.querySelector('#dlg-form [type="submit"]').click();
  await new Promise(r => setTimeout(r, 1200));

  const dePe = g.entregasObraDePuerta('av-multi', 'pt-pe');
  const deM1 = g.entregasObraDePuerta('av-multi', 'pt-m1');
  const lista = g.bloquePuertasObra(g.S.avisos.find(x => x.id==='av-multi'),
                                    g.puertasDeAviso('av-multi'));
  /* La peatonal, ya firmada, no se puede quitar de la obra */
  await g.soltarPuerta('av-multi', 'pt-pe');
  const sigue = g.puertasDeAviso('av-multi').some(p => p.id === 'pt-pe');
  /* La del muelle 2, sin acta, sí */
  await g.soltarPuerta('av-multi', 'pt-m2');
  const fuera = !g.puertasDeAviso('av-multi').some(p => p.id === 'pt-m2');
  /* Y la obra sigue en el historial de la puerta que ya no es principal */
  const enHistorial = g.avisosDe('pt-pe').some(x => x.id === 'av-multi');
  return { pregunta, opciones, cabecera, nPuntos,
    pe: dePe.length ? { puerta: dePe[0].puerta_id, firma: !!dePe[0].firma_ruta,
                        conf: dePe[0].conformidad, n: dePe.length } : null,
    m1: deM1.length, lista, sigue, fuera, enHistorial,
    guionPeatonal: g.guionEntrega('Peatonal corredera').length,
    guionSeccional: g.guionEntrega('Seccional').length };
});
paso('con varias puertas, el acta pregunta primero de cuál es',
  /De qué puerta es el acta/.test(actas.pregunta) && actas.opciones === 4,
  actas.opciones+' opciones');
paso('el acta dice qué puerta de la obra es',
  /puerta 3 de 4 de esta obra/.test(actas.cabecera), (actas.cabecera.match(/puerta \d de \d[^.]*/)||[''])[0]);
paso('y avisa de que las otras llevan su propia acta',
  /con su propia acta/.test(actas.cabecera));
paso('sale con el guión de SU tipo, no con el de la principal',
  actas.nPuntos === actas.guionPeatonal && actas.guionPeatonal !== actas.guionSeccional,
  actas.nPuntos+' puntos, peatonal '+actas.guionPeatonal+' / seccional '+actas.guionSeccional);
paso('firmada, el acta queda enganchada a esa puerta y no a la principal',
  actas.pe && actas.pe.puerta === 'pt-pe' && actas.pe.firma === true, actas.pe && actas.pe.puerta);
paso('una sola acta por puerta: la peatonal tiene una', actas.pe && actas.pe.n === 1);
paso('y las otras siguen sin acta: firmar una no firma las demás',
  actas.m1 === 0, actas.m1);
paso('la lista marca cuál está firmada y cuáles no',
  /Acta firmada/.test(actas.lista) && /Sin acta/.test(actas.lista));
paso('una puerta con acta firmada no se quita de la obra', actas.sigue === true);
paso('una sin acta sí se puede quitar, y su ficha no se borra',
  actas.fuera === true && await T(() => !!window.__T.puertaDe('pt-m2')));
paso('la obra sale en el historial de una puerta que no era la principal',
  actas.enHistorial === true);

/* ---- Y el cierre mira las tres, no solo la primera ---- */
const cierreMulti = await T(async () => {
  const g = window.__T;
  const a = g.S.avisos.find(x => x.id === 'av-multi');
  g.dlgCierre('av-multi');
  await new Promise(r => setTimeout(r, 800));
  document.getElementById('z-trab').value = 'Montadas las tres puertas.';
  document.getElementById('z-horas').value = '24';
  document.getElementById('z-sin').value = 'No había nadie para firmar.';
  await g.guardarCierre(a, true);
  const e = document.querySelector('#dlg-form .err');
  const err = e ? e.textContent : '';
  const cerrado = !!(g.S.avisos.find(x => x.id === 'av-multi') || {}).cerrado;
  g.cerrarDlg();
  return { err, cerrado };
});
paso('la obra NO se cierra si le falta documentar una puerta cualquiera',
  cierreMulti.cerrado === false, cierreMulti.cerrado);
paso('y el error dice CUÁL falta, con su código',
  /AR-020\d/.test(cierreMulti.err), cierreMulti.err.slice(0, 160));

/* ================================================================
   Final
   ================================================================ */
console.log('\n'+ok+' bien, '+mal+' mal.');
/* Las fuentes de Google no se descargan en este entorno y la red lo dice por la
   consola. No es un fallo de la aplicación, así que no cuenta. */
const graves = errores.filter(x => !/fonts\.googleapis|ERR_TUNNEL|ERR_NAME|net::ERR|provocado por la prueba/.test(x));
if (graves.length) console.log('Errores de JavaScript:\n'+graves.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || graves.length ? 1 : 0);
