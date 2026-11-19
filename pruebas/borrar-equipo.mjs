/* ================================================================
   borrar-equipo.mjs — Eliminar a alguien del equipo, del todo
                                                     19-11-2026

   DE DÓNDE SALE
   David, al repasar la aplicación con la base ya limpia:
   «yo no puedo eliminar a un usuario, puedo darle acceso o no pero
   no eliminarlo. Y quiero poder eliminar definitivamente al usuario
   que necesite.»

   LO QUE HAY QUE ENTENDER ANTES DE LEER ESTO
   Una cuenta son DOS piezas: la ficha del equipo y la credencial de
   acceso. La aplicación puede borrar la ficha; la credencial no,
   porque hace falta la clave maestra del proyecto y esa clave no
   puede vivir dentro de una página web.

   Y borrar SOLO la ficha es peor que no borrar nada: la aplicación
   la vuelve a crear sola la próxima vez que esa persona entre, y
   nacería ACTIVA. O sea, le devolvería el acceso que querías
   quitarle. Por eso el borrado va por una función del servidor que
   se lleva las dos piezas, o ninguna.

   QUÉ VIGILA ESTA SUITE
   Los cuatro cerrojos, y que el aviso diga la verdad sobre lo que
   se pierde y lo que no. Un botón que borra personas no se entrega
   porque «funcione»: se entrega cuando está demostrado que NO borra
   a quien no debe.
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
    /* Un equipo de verdad: el administrador, uno activo, uno sin acceso y
       otro sin acceso que además tiene furgoneta y visitas a su nombre. */
    db.perfiles.push(
      { id:'p-tec-activo', nombre:'Dani Activo',   rol:'tecnico', activo:true,  creado:new Date().toISOString() },
      { id:'p-tec-fuera',  nombre:'Pedro Saliente', rol:'tecnico', activo:false, creado:new Date().toISOString() },
      { id:'p-ofi-fuera',  nombre:'Marta Oficina',  rol:'oficina', activo:false, creado:new Date().toISOString() },
      { id:'p-otro-admin', nombre:'Otro Jefe',      rol:'admin',   activo:true,  creado:new Date().toISOString() },
    );
    db.ubicaciones = db.ubicaciones || [];
    db.ubicaciones.push({ id:'u-furgo-9', nombre:'Furgo 9', tipo:'furgoneta',
                          perfil_id:'p-tec-fuera', activo:true });
    const pu = db.puertas[0];
    db.avisos.push(
      { id:'av-sal-1', tipo:'averia', estado:'cerrado', cliente_id:pu.cliente_id,
        puerta_id:pu.id, tecnico_id:'p-tec-fuera', tecnico:'Pedro Saliente',
        creado:new Date().toISOString(), cerrado:new Date().toISOString() },
      { id:'av-sal-2', tipo:'averia', estado:'cerrado', cliente_id:pu.cliente_id,
        puerta_id:pu.id, tecnico_id:'p-tec-fuera', tecnico:'Pedro Saliente',
        creado:new Date().toISOString(), cerrado:new Date().toISOString() },
    );
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

const faltan = await T(() => window.__T_FALTAN || ['no se ha construido __T']);
paso('las funciones de esta suite están a la vista', faltan.length === 0, faltan.join(' '));

/* ================================================================
   1. El botón sale donde tiene que salir, y no donde no
   ================================================================
   La regla: solo se puede borrar a quien YA está sin acceso. Para llegar a
   borrar hay que haber dado antes un paso que obliga a pensarlo.
   ================================================================ */
bloque('1. Dónde aparece el botón de eliminar');

const tabla = await T(async () => {
  const S = window.__T.S;
  S.exp = null; S.ficha = null; S.fichaCliente = null;
  S.tab = 'equipo'; S.perfil.rol = 'admin';
  window.__T.pintar();
  await new Promise(f => setTimeout(f, 250));
  const filas = Array.from(document.querySelectorAll('tbody tr')).map(tr => ({
    texto: tr.textContent.replace(/\s+/g, ' '),
    borrar: !!tr.querySelector('[data-act="equipo-borrar"]'),
    acceso: !!tr.querySelector('[data-act="equipo-activo"]'),
  }));
  return filas;
});

const fila = n => tabla.find(f => f.texto.includes(n)) || {};
paso('la pantalla del equipo se pinta', tabla.length >= 4, tabla.length+' filas');
paso('al que está SIN ACCESO sí se le puede eliminar',
  fila('Pedro Saliente').borrar === true);
paso('y a la de oficina sin acceso también',
  fila('Marta Oficina').borrar === true);
paso('al que está ACTIVO no, hay que quitarle el acceso primero',
  fila('Dani Activo').borrar === false);
paso('a un administrador NUNCA, ni activo ni sin acceso',
  fila('Otro Jefe').borrar === false);
paso('a un administrador tampoco se le puede quitar el acceso',
  fila('Otro Jefe').acceso === false);

/* ================================================================
   2. El aviso dice la verdad, con números
   ================================================================ */
bloque('2. Lo que dice el aviso antes de borrar');

const aviso = await T(async () => {
  window.__T.dlgBorrarDelEquipo('p-tec-fuera');
  await new Promise(f => setTimeout(f, 200));
  const f = document.getElementById('dlg-form');
  return { html: f.innerHTML, texto: f.textContent.replace(/\s+/g, ' ') };
});

paso('dice a quién se va a borrar', /Pedro Saliente/.test(aviso.texto));
paso('avisa de que no tiene vuelta atrás', /No tiene vuelta atrás/i.test(aviso.texto));
paso('dice que el trabajo NO se pierde', /Lo que NO se pierde/.test(aviso.texto) &&
  /su nombre escrito/.test(aviso.texto));
paso('cuenta cuántas visitas se quedan sin técnico',
  /2 visita\(s\)/.test(aviso.texto), aviso.texto.match(/\d+ visita\(s\)[^.]*/)?.[0]);
paso('y nombra la furgoneta que se queda sin dueño',
  /Furgo 9/.test(aviso.texto));
paso('avisa de que la foto se borra', /su foto se borra/i.test(aviso.texto));
paso('pide escribir el nombre para confirmar',
  /Escribe/.test(aviso.texto) && /para confirmar/.test(aviso.texto) &&
  /id="bt-nombre"/.test(aviso.html));

/* ================================================================
   3. El nombre tiene que coincidir
   ================================================================
   Es el cerrojo que impide borrar a quien no querías por un clic mal dado en
   una tabla con una fila por persona.
   ================================================================ */
bloque('3. Hay que escribir el nombre');

const probarNombre = async escrito => T(async txt => {
  const campo = document.getElementById('bt-nombre');
  campo.value = txt;
  document.querySelector('#dlg-form .err').textContent = '';
  const f = document.getElementById('dlg-form');
  f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable:true }));
  await new Promise(r => setTimeout(r, 350));
  return {
    error: (document.querySelector('#dlg-form .err') || {}).textContent || '',
    sigueAbierto: !!document.getElementById('bt-nombre'),
  };
}, escrito);

let r = await probarNombre('');
paso('en blanco no borra', /no coincide/i.test(r.error) && r.sigueAbierto);
r = await probarNombre('Pedro');
paso('con el nombre a medias tampoco', /no coincide/i.test(r.error) && r.sigueAbierto);
r = await probarNombre('Marta Oficina');
paso('con el nombre de OTRA persona tampoco',
  /no coincide/i.test(r.error) && r.sigueAbierto);
r = await probarNombre('  pedro   saliente  ');
paso('escrito con otras mayúsculas y espacios de más, sí vale',
  !/no coincide/i.test(r.error), r.error || 'aceptado');

await T(() => { try { window.__T.cerrarDlg(); } catch(_){} });

/* ================================================================
   4. Los cerrojos de la propia función
   ================================================================ */
bloque('4. A quién se niega a borrar, aunque se le llame a mano');

const cerrojos = await T(async () => {
  const S = window.__T.S;
  const salida = {};
  /* Ojo con esto, que me costó tres comprobaciones en rojo el 19-11-2026:
     cerrarDlg() cierra el diálogo pero NO vacía su contenido, así que el campo
     del diálogo anterior sigue estando en la página. Preguntar «¿existe
     bt-nombre?» daba que sí siempre, aunque no se hubiera abierto nada.
     Así que se vacía a mano antes, y se mira además si el diálogo está
     ABIERTO. Era la prueba la que estaba mal, no la aplicación. */
  const abre = async id => {
    try { window.__T.cerrarDlg(); } catch(_){}
    document.getElementById('dlg-form').innerHTML = '';
    await window.__T.dlgBorrarDelEquipo(id);
    await new Promise(f => setTimeout(f, 150));
    const dlg = document.getElementById('dlg');
    const abierto = !!(dlg && dlg.open) && !!document.getElementById('bt-nombre');
    try { window.__T.cerrarDlg(); } catch(_){}
    return abierto;
  };
  salida.otroAdmin = await abre('p-otro-admin');
  const antes = S.perfil.id;
  S.perfil.id = 'p-tec-fuera';
  salida.aMiMismo = await abre('p-tec-fuera');
  S.perfil.id = antes;
  salida.inventado = await abre('no-existe-este-id');
  salida.normal = await abre('p-tec-fuera');
  return salida;
});

paso('a otro administrador ni abre el diálogo', cerrojos.otroAdmin === false);
paso('a uno mismo tampoco', cerrojos.aMiMismo === false);
paso('a alguien que no existe, no se rompe', cerrojos.inventado === false);
paso('y a quien sí procede, abre', cerrojos.normal === true);

/* ================================================================
   5. Lo que el código del servidor promete
   ================================================================
   La función vive fuera de la aplicación y no se puede ejecutar desde aquí,
   así que lo que se comprueba es que SIGA TENIENDO sus cuatro cerrojos. Si
   alguien los quita un día «para simplificar», esto se pone en rojo.
   ================================================================ */
bloque('5. Los cerrojos de la función del servidor');

const FN = readFileSync(join(AQUI, '..', 'servidor', 'borrar-tecnico.ts'), 'utf8');

paso('la función existe', FN.length > 1000, FN.length+' caracteres');
paso('exige sesión', /sin sesión/.test(FN) && /Authorization/.test(FN));
paso('comprueba que quien llama es administrador EN EL SERVIDOR',
  /rol !== 'admin'/.test(FN) && /solo el administrador puede borrar/.test(FN));
paso('y que además esté activo', /!miFicha\.activo/.test(FN));
paso('no deja borrarse a uno mismo', /destino === yo\.id/.test(FN));
paso('no deja borrar a otro administrador',
  /suFicha\.rol === 'admin'/.test(FN));
paso('borra las TRES piezas: foto, ficha y credencial',
  /storage\.from\('equipo'\)\.remove/.test(FN) &&
  /from\('perfiles'\)\.delete/.test(FN) &&
  /auth\.admin\.deleteUser/.test(FN));
paso('si la credencial no se puede borrar, deja la cuenta SIN ACCESO',
  /activo: false/.test(FN) && /SIN ACCESO/.test(FN));
paso('la clave maestra sale del entorno, no está escrita dentro',
  /Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/.test(FN) &&
  !/sb_secret_|eyJhbGciOi/.test(FN));

/* La clave maestra NUNCA puede acabar en la página. Esto lo vigila. */
const FUENTE = await T(() => document.documentElement.outerHTML);
paso('y en la aplicación no hay ninguna clave secreta',
  !/sb_secret_|service_role/.test(FUENTE));

/* ================================================================
   Final
   ================================================================ */
console.log('\n'+ok+' bien, '+mal+' mal.');
if (errores.length) console.log('JS: '+errores.join('\nJS: '));
else console.log('Sin errores de JavaScript.');
await nav.close();
process.exit(mal || errores.length ? 1 : 0);
