/* ================================================================
   conformidad.mjs — «Cómo está esta puerta de normativa»
                                                     09-11-2026

   DE DÓNDE SALE
   David, el 09-11-2026:

     «Cada vez que tocamos una puerta existente debemos decir si esa
      puerta cumple normativa o no, debemos informar al cliente para
      que sepa en qué situación legal está su puerta. Hace falta un
      punto dentro de todos los partes que contengan una puerta, un
      botón que pregunte al técnico si la puerta cumple con la
      normativa vigente, con cinco o seis puntos, y que salga
      automáticamente en el parte de trabajo que recibe el cliente.»

   LO QUE VIGILA ESTA SUITE
     1. Que los seis puntos EXISTAN de verdad en la lista del
        expediente de su familia. Si alguien renombra una clave en
        EXP_COMPROBACIONES, aquí se pone en rojo: si no, el bloque
        se quedaría con cinco puntos y nadie se enteraría.
     2. Que se pregunte en las visitas que tocan puerta y NO en la
        comercial, el desplazamiento en falso ni la preventiva.
     3. Que lo contestado salga en el parte del cliente.
     4. Y lo más delicado de todo: QUE EL PARTE NO DIGA NUNCA QUE
        LA PUERTA CUMPLE. Son seis puntos de veintiuno. Con seis se
        puede afirmar que algo no cumple; que cumple, no. Un parte
        firmado que diga «cumple» es una afirmación sobre lo que no
        se ha mirado.
     5. Que lo opcional sea opcional: sin contestar nada no se
        guarda fila y el parte no saca un apartado vacío que parezca
        que se miró y salió bien.
   ================================================================ */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const AQUI = dirname(fileURLToPath(import.meta.url));
const URL_APP = process.env.ARIZA_URL || 'http://127.0.0.1:8899/index.html';
let ajustes = {};
try { ajustes = JSON.parse(readFileSync(join(AQUI, 'ajustes.json'), 'utf8')); } catch(_){}

const nav = await chromium.launch({ args: ['--lang=es-ES'] });
const ctx = await nav.newContext({ viewport:{width:1320,height:2200},
  locale:'es-ES', timezoneId:'Europe/Madrid' });
await ctx.addInitScript(a => { window.__AJUSTES = a; }, ajustes);
await ctx.addInitScript(() => {
  window.__PARCHE = db => {
    /* Una puerta industrial y una avería sobre ella: el caso que David
       describe, entrar a reparar una puerta que ya existe. */
    const pu = db.puertas[0];
    db.avisos.push({ id:'av-cf', tipo:'averia', estado:'asignado', prioridad:'normal',
      tecnico_id:'usuario-admin', puerta_id: pu.id, cliente_id: pu.cliente_id,
      descripcion:'No invierte al tocar el suelo', creado:new Date().toISOString(),
      fecha_prevista:new Date().toISOString().slice(0,10) });
  };
});
const errores = [];
const esLaLetraDeGoogle = t => /fonts\.(googleapis|gstatic)\.com/.test(t) ||
  /Failed to load resource/.test(t);
const pag = await ctx.newPage();
pag.on('console', m => { if (m.type() === 'error' && !esLaLetraDeGoogle(m.text())) errores.push(m.text()); });
pag.on('pageerror', e => errores.push(String(e)));
await pag.goto(URL_APP);
await pag.waitForFunction(() => window.__T && window.__T.S && window.__T.S.perfil, null, { timeout: 30000 });
const T = (f, arg) => arg === undefined ? pag.evaluate(f) : pag.evaluate(f, arg);

let ok = 0, mal = 0;
const paso = (t, bien, detalle) => {
  if (bien){ ok++; console.log('  OK  '+t+(detalle!==undefined?' → '+detalle:'')); }
  else { mal++; console.log(' FALLA '+t+(detalle!==undefined?' → '+detalle:'')); }
};
const bloque = t => console.log('\n· '+t);

/* ================================================================
   1. Los seis puntos existen de verdad
   ================================================================ */
bloque('1. Los seis puntos salen de la lista del expediente');

const seis = await T(() => {
  const g = window.__T;
  const r = {};
  Object.keys(g.SEIS_DE_CAMPO).forEach(fam => {
    const todos = (g.EXP_COMPROBACIONES[fam] || []).map(c => c[0]);
    const quiero = g.SEIS_DE_CAMPO[fam];
    r[fam] = {
      pedidos: quiero.length,
      perdidos: quiero.filter(k => todos.indexOf(k) < 0),
      noCriticos: quiero.filter(k => {
        const c = (g.EXP_COMPROBACIONES[fam] || []).find(x => x[0] === k);
        return c && !c[4];
      }),
    };
  });
  return r;
});
Object.keys(seis).forEach(fam => {
  paso('en «'+fam+'» los seis puntos existen en la lista del expediente',
    seis[fam].perdidos.length === 0,
    seis[fam].perdidos.length ? 'no existen: '+seis[fam].perdidos.join(', ') : seis[fam].pedidos+' puntos');
});
Object.keys(seis).forEach(fam => {
  paso('y en «'+fam+'» los seis son puntos CRÍTICOS, no de relleno',
    seis[fam].noCriticos.length === 0,
    seis[fam].noCriticos.join(', ') || 'los seis');
});

const textos = await T(() => {
  const g = window.__T;
  const pts = g.puntosDeCampo({ tipo:'Seccional' });
  return { n: pts.length, claves: pts.map(x => x.k),
           sinTexto: pts.filter(x => !x.t || x.t.length < 15).length,
           sinNorma: pts.filter(x => !x.n).length,
           primero: pts[0] && pts[0].t };
});
paso('una seccional saca seis puntos', textos.n === 6, textos.claves.join(', '));
paso('todos con su texto escrito', textos.sinTexto === 0);
paso('y todos citando la norma que los exige', textos.sinNorma === 0);

/* ================================================================
   2. En qué visitas se pregunta
   ================================================================ */
bloque('2. Se pregunta donde toca, y solo donde toca');

const donde = await T(() => {
  const g = window.__T;
  const tipos = ['averia','instalacion','urgencia','puesta_servicio','normativa','garantia',
                 'mantenimiento','comercial','falso'];
  const r = {};
  tipos.forEach(t => { r[t] = g.pideConformidad({ tipo: t }); });
  return r;
});
['averia','instalacion','urgencia','puesta_servicio','normativa','garantia'].forEach(t => {
  paso('en «'+t+'» se pregunta', donde[t] === true);
});
paso('en la preventiva NO: el guión completo ya lo pregunta entero',
  donde.mantenimiento === false);
paso('en la comercial NO: ahí la puerta todavía no existe',
  donde.comercial === false);
paso('en el desplazamiento en falso NO: no se ha trabajado',
  donde.falso === false);

const sinSql = await T(() => {
  const g = window.__T;
  const antes = g.S.sinConformidad;
  g.S.sinConformidad = true;
  const r = g.pideConformidad({ tipo:'averia' });
  g.S.sinConformidad = antes;
  return r;
});
paso('y sin el SQL ejecutado no se pregunta nada, en vez de reventar',
  sinSql === false);

/* ================================================================
   3. El bloque que ve el técnico
   ================================================================ */
bloque('3. El bloque del parte');

const vista = await T(() => {
  const g = window.__T;
  const a = g.S.avisos.find(x => x.id === 'av-cf');
  const pu = g.puertaDe(a.puerta_id);
  const h = g.bloqueConformidad(a, pu);
  const caja = document.createElement('div');
  caja.innerHTML = h;
  const puntos = [...caja.querySelectorAll('.cf-punto')];
  return {
    hay: !!h,
    nPuntos: puntos.length,
    respuestasPorPunto: puntos.map(d => d.querySelectorAll('.cf-resp button').length),
    opciones: [...puntos[0].querySelectorAll('.cf-resp button')].map(b => b.textContent),
    hayNoSeSabe: /No he podido mirarlo/.test(h),
    diceQueSaleEnElParte: /sale impreso en el parte/i.test(h),
    hayNota: !!caja.querySelector('.cf-nota'),
    puertaApuntada: caja.querySelector('.conformidad').dataset.puerta === pu.id,
  };
});
paso('se pinta el bloque con sus seis puntos', vista.nPuntos === 6, vista.nPuntos);
paso('cada punto con tres respuestas',
  vista.respuestasPorPunto.every(n => n === 3), vista.respuestasPorPunto.join(','));
paso('y una de ellas es «no he podido mirarlo»', vista.hayNoSeSabe === true,
  vista.opciones.join(' | '));
paso('se le avisa al técnico de que esto lo va a leer el cliente',
  vista.diceQueSaleEnElParte === true);
paso('hay sitio para escribir algo más', vista.hayNota === true);
paso('y el bloque sabe de qué puerta es', vista.puertaApuntada === true);

/* ================================================================
   4. Lo opcional es opcional
   ================================================================ */
bloque('4. Sin contestar no se guarda nada');

const vacio = await T(() => {
  const g = window.__T;
  const a = g.S.avisos.find(x => x.id === 'av-cf');
  const pu = g.puertaDe(a.puerta_id);
  const caja = document.createElement('div');
  caja.innerHTML = g.bloqueConformidad(a, pu);
  document.body.appendChild(caja);
  const sinTocar = g.leerConformidad(caja.querySelector('.conformidad'));
  /* Ahora se contestan dos: uno bien y uno mal */
  const puntos = [...caja.querySelectorAll('.cf-punto')];
  puntos[0].querySelector('.cf-resp button[data-r="si"]').setAttribute('aria-pressed','true');
  puntos[1].querySelector('.cf-resp button[data-r="no"]').setAttribute('aria-pressed','true');
  puntos[2].querySelector('.cf-resp button[data-r="nd"]').setAttribute('aria-pressed','true');
  const conAlgo = g.leerConformidad(caja.querySelector('.conformidad'));
  caja.remove();
  return { sinTocar, conAlgo };
});
paso('un bloque sin tocar no genera fila', vacio.sinTocar === null);
paso('contestando tres, se leen los tres', vacio.conAlgo.contestados === 3);
paso('y se cuentan los fallos aparte', vacio.conAlgo.fallos === 1, vacio.conAlgo.fallos);
paso('y lo que no se pudo mirar, también', vacio.conAlgo.sin_mirar === 1);

/* ================================================================
   5. Lo que lee el cliente
   ================================================================ */
bloque('5. El parte que firma el cliente');

const parte = await T(() => {
  const g = window.__T;
  const pu = g.S.puertas[0];
  const fila = (k, v) => v ? '<tr><td>'+k+'</td><td>'+v+'</td></tr>' : '';
  const conFallo = g.bloqueConformidadHTML({ puerta_id: pu.id, fallos: 2,
    puntos: { marcado:'no', presencia:'no', aplastamiento:'si', manual:'si',
              caida:'si', libro:'si' } }, fila);
  const todoBien = g.bloqueConformidadHTML({ puerta_id: pu.id, fallos: 0,
    puntos: { marcado:'si', presencia:'si', aplastamiento:'si', manual:'si',
              caida:'si', libro:'si' } }, fila);
  const aMedias = g.bloqueConformidadHTML({ puerta_id: pu.id, fallos: 0,
    puntos: { marcado:'si', presencia:'nd' } }, fila);
  const nada = g.bloqueConformidadHTML({ puerta_id: pu.id, fallos: 0, puntos: {} }, fila);
  return { conFallo, todoBien, aMedias, nada };
});
paso('con incumplimientos, el parte lo dice en grande',
  /AVISO: esta puerta no cumple 2 de los requisitos/.test(parte.conFallo));
paso('y explica qué supone para el titular',
  /titular responde de mantenerla/.test(parte.conFallo) &&
  /uso seguro conforme a la normativa/.test(parte.conFallo));
paso('y ofrece la salida: presupuesto e informe',
  /presupuestar la adecuación/.test(parte.conFallo));
paso('los puntos que fallan salen en rojo y por su nombre',
  /#B3271E/.test(parte.conFallo) && /Marcado CE/.test(parte.conFallo));

/* La más importante de toda la suite */
paso('SIN FALLOS, EL PARTE NO DICE QUE LA PUERTA CUMPLA',
  !/esta puerta cumple/i.test(parte.todoBien) &&
  !/puerta conforme/i.test(parte.todoBien) &&
  /no significa que la puerta cumpla/i.test(parte.todoBien));
paso('y explica por qué no se puede afirmar eso con seis puntos',
  /abarca más puntos/.test(parte.todoBien) && /fuerzas de maniobra/.test(parte.todoBien));
paso('el apartado dice que no es una inspección completa',
  /No es una inspección completa/.test(parte.conFallo) &&
  /No es una inspección completa/.test(parte.todoBien));
paso('si algo no se pudo comprobar, el cliente se entera',
  /1 requisito no se pudo comprobar/.test(parte.aMedias));
paso('y si no se contestó nada, no sale apartado en el parte',
  parte.nada === '');

/* ================================================================
   6. De punta a punta, con el formulario de verdad
   --------------------------------------------------------------
   Lo de arriba comprueba las piezas por separado. Esto comprueba lo
   único que le importa a David: que un técnico abra una avería,
   conteste, guarde, y que eso llegue al papel del cliente.
   ================================================================ */
bloque('6. Abrir, contestar, guardar y que llegue al parte');

await T(() => { window.__T.dlgCierre('av-cf'); });
await pag.waitForTimeout(700);

const enPantalla = await T(() => {
  const n = document.querySelectorAll('#dlg-form .conformidad .cf-punto').length;
  return { n, hayBloque: !!document.querySelector('#dlg-form .conformidad') };
});
paso('al abrir una avería, el bloque está en el formulario', enPantalla.hayBloque === true);
paso('con sus seis puntos', enPantalla.n === 6, enPantalla.n);

/* Se contesta como lo haría el técnico: pulsando los botones */
const guardado = await T(async () => {
  const g = window.__T;
  const puntos = [...document.querySelectorAll('#dlg-form .conformidad .cf-punto')];
  /* El marcado CE no está y la detección de presencia tampoco: dos fallos */
  puntos[0].querySelector('.cf-resp button[data-r="no"]').click();
  puntos[1].querySelector('.cf-resp button[data-r="no"]').click();
  puntos[2].querySelector('.cf-resp button[data-r="si"]').click();
  puntos[3].querySelector('.cf-resp button[data-r="si"]').click();
  puntos[4].querySelector('.cf-resp button[data-r="nd"]').click();
  puntos[5].querySelector('.cf-resp button[data-r="si"]').click();
  const ta = document.querySelector('#dlg-form .cf-nota');
  ta.value = 'Falta la placa de características del motor.';
  /* Y el parte se guarda sin cerrar, que es lo que hace el técnico a medias */
  const d = document.getElementById('z-diag');     if (d) d.value = 'Célula desalineada';
  const t = document.getElementById('z-trabajo');  if (t) t.value = 'Alineada y probada';
  await g.guardarCierre(g.S.avisos.find(x => x.id === 'av-cf'), false);
  await new Promise(r => setTimeout(r, 400));
  const filas = (window.__DB.conformidad_visita || []);
  return { n: filas.length, f: filas[0] || null };
});
paso('al guardar queda UNA fila', guardado.n === 1, guardado.n);
paso('con los dos fallos contados', guardado.f && guardado.f.fallos === 2,
  guardado.f && guardado.f.fallos);
paso('y lo que no se pudo mirar, también', guardado.f && guardado.f.sin_mirar === 1);
paso('atada a su visita y a su puerta',
  !!(guardado.f && guardado.f.aviso_id === 'av-cf' && guardado.f.puerta_id));
paso('con la familia de la puerta apuntada', !!(guardado.f && guardado.f.familia),
  guardado.f && guardado.f.familia);
paso('con el nombre del técnico escrito, para que el parte no cambie después',
  !!(guardado.f && guardado.f.quien && guardado.f.quien.length > 2),
  guardado.f && guardado.f.quien);
paso('y la nota guardada',
  !!(guardado.f && /placa de características/.test(guardado.f.nota || '')));

/* Al volver a abrir, lo contestado tiene que seguir ahí */
const reabierto = await T(async () => {
  const g = window.__T;
  g.cerrarDlg();
  await new Promise(r => setTimeout(r, 200));
  g.dlgCierre('av-cf');
  await new Promise(r => setTimeout(r, 600));
  const puntos = [...document.querySelectorAll('#dlg-form .conformidad .cf-punto')];
  const marcados = puntos.map(d => {
    const b = d.querySelector('.cf-resp button[aria-pressed="true"]');
    return b ? b.dataset.r : '';
  });
  const nota = document.querySelector('#dlg-form .cf-nota');
  g.cerrarDlg();
  return { marcados, nota: nota ? nota.value : '' };
});
paso('al reabrir el parte, lo contestado sigue puesto',
  reabierto.marcados.join(',') === 'no,no,si,si,nd,si', reabierto.marcados.join(','));
paso('y la nota también', /placa de características/.test(reabierto.nota));

/* Y lo que de verdad pedía David: que salga en el papel */
const enElPapel = await T(() => {
  const g = window.__T;
  const fila = (k, v) => v ? '<tr><td>'+k+'</td><td>'+v+'</td></tr>' : '';
  const f = window.__DB.conformidad_visita[0];
  return g.bloqueConformidadHTML(f, fila);
});
paso('y el parte del cliente lo dice',
  /Situación de la puerta frente a la normativa/.test(enElPapel));
paso('con el aviso de los dos incumplimientos',
  /no cumple 2 de los requisitos/.test(enElPapel));
paso('y con lo que escribió el técnico',
  /placa de características/.test(enElPapel));

/* ================================================================
   7. Que no se haya roto lo de antes
   ================================================================ */
bloque('7. Lo que ya había sigue igual');

const viejo = await T(() => {
  const g = window.__T;
  return {
    enLaLista: g.QUE_HACE_FALTA.some(c => c.marca === 'sinConformidad'),
    conFichero: (g.QUE_HACE_FALTA.find(c => c.marca === 'sinConformidad')||{}).fichero,
    enLaCopia: g.TABLAS_COPIA.indexOf('conformidad_visita') >= 0,
    guionSigue: typeof g.bloqueGuion === 'function',
  };
});
paso('la tabla nueva está en «lo que hace falta en el servidor»', viejo.enLaLista === true);
paso('con su fichero', viejo.conFichero === 'conformidad-visita.sql', viejo.conFichero);
paso('y entra en la copia de seguridad', viejo.enLaCopia === true);
paso('el guión de revisión de las preventivas sigue donde estaba', viejo.guionSigue === true);

/* ================================================================
   Final
   ================================================================ */
console.log('\n'+ok+' bien, '+mal+' mal.');
if (errores.length) console.log('Errores de JavaScript:\n'+errores.join('\n'));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || errores.length ? 1 : 0);
