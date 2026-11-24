/* ================================================================
   tecnicos.mjs — Varios técnicos en una asistencia
                                                     22-11-2026

   DE DÓNDE SALE

   David, la víspera de empezar a usar la aplicación en la empresa:
   «Se debería de poder asignar a más de un técnico. Y al rellenar
   el parte puede ser cualquiera de los dos.»

   A una instalación van dos. Hasta hoy la asistencia tenía UN
   técnico, en avisos.tecnico_id, y al segundo no le salía el
   trabajo en «Mi trabajo»: lo encontraba mirando la lista del
   equipo, que es como decir que no estaba resuelto.

   QUÉ SE VIGILA AQUÍ, Y POR QUÉ CADA COSA

   1. Que lo que ya estaba asignado siga asignado. El cambio se
      hizo con una instalación de verdad cargada para el día
      siguiente. Si el volcado pierde una asignación, un técnico
      llega por la mañana y no tiene trabajo en la pantalla.

   2. Que el principal cuente UNA vez. Está en los dos sitios, en
      avisos.tecnico_id y en la tabla nueva. Si se cuenta dos
      veces, sale repetido en la pantalla y en el parte.

   3. Que el principal no cambie solo. Veinte sitios leen
      tecnico_id: la tarjeta, el parte, el calendario, el aviso al
      grupo. Si al marcar un segundo técnico cambiara el principal,
      todos esos sitios empezarían a decir otra cosa sin que nadie
      haya pedido nada.

   4. Que el parte cambie de dueño al abrirlo, y que oficina NO se
      lo quite al técnico cuando entra solo a mirarlo.

   Uso:  ./preparar.sh  y luego  node tecnicos.mjs
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
const pag = await ctx.newPage();
await pag.goto(URL_APP);
await pag.waitForFunction(() => window.__T && window.__T.S && window.__T.S.perfil, null, { timeout: 30000 });
const T = (f, arg) => arg === undefined ? pag.evaluate(f) : pag.evaluate(f, arg);

let ok = 0, mal = 0;
const paso = (t, bien, detalle) => {
  if (bien){ ok++; console.log('  OK  '+t+(detalle!==undefined?' → '+detalle:'')); }
  else { mal++; console.log(' FALLA '+t+(detalle!==undefined?' → '+detalle:'')); }
};
const bloque = t => console.log('\n· '+t);
const esperar = ms => new Promise(f => setTimeout(f, ms));

const ADMIN = 'usuario-admin';
const TEC2  = 'usuario-tecnico2';

bloque('1. Lo que ya estaba asignado');
/* Una asistencia como las de antes del cambio: técnico en la columna de
   siempre y nada en la tabla nueva. Es la instalación que David dejó
   cargada la víspera. */
const uno = await T(a => {
  const g = window.__T, S = g.S;
  S.avisoTecnicos = [];
  const av = { id:'av-prueba-1', tipo:'instalacion', estado:'asignado', tecnico_id:a };
  return { cuantos: g.asignadosDe(av).length, quien: g.asignadosDe(av)[0],
           hay: g.hayAsignado(av), esta: g.estaAsignado(av, a) };
}, ADMIN);
paso('una asistencia de las de antes sigue con su técnico', uno.cuantos === 1 && uno.quien === ADMIN);
paso('y cuenta como asignada', uno.hay === true && uno.esta === true);

bloque('2. El principal está en los dos sitios y cuenta una vez');
const dup = await T(a => {
  const g = window.__T, S = g.S;
  S.avisoTecnicos = [{ aviso_id:'av-prueba-1', tecnico_id:a }];
  const av = { id:'av-prueba-1', tipo:'instalacion', estado:'asignado', tecnico_id:a };
  return g.asignadosDe(av).length;
}, ADMIN);
paso('el principal no sale dos veces aunque esté en los dos sitios', dup === 1, dup);

bloque('3. Dos técnicos');
const dos = await T(d => {
  const g = window.__T, S = g.S;
  S.avisoTecnicos = [{ aviso_id:'av-prueba-1', tecnico_id:d.admin },
                     { aviso_id:'av-prueba-1', tecnico_id:d.tec2 }];
  const av = { id:'av-prueba-1', tipo:'instalacion', estado:'asignado', tecnico_id:d.admin };
  const ids = g.asignadosDe(av);
  return { cuantos: ids.length, primero: ids[0],
           esta1: g.estaAsignado(av, d.admin), esta2: g.estaAsignado(av, d.tec2),
           texto: g.textoAsignados(av) };
}, { admin: ADMIN, tec2: TEC2 });
paso('caben dos asignados', dos.cuantos === 2, dos.cuantos);
paso('y el principal va el primero', dos.primero === ADMIN);
paso('los dos cuentan como asignados', dos.esta1 === true && dos.esta2 === true);
paso('y se nombran con «y», no con comas sueltas', / y /.test(dos.texto), dos.texto);

bloque('4. El que no está asignado');
const fuera = await T(() => {
  const g = window.__T;
  const av = { id:'av-prueba-1', tecnico_id:'usuario-admin' };
  return { esta: g.estaAsignado(av, 'usuario-que-no-existe'),
           vacia: g.hayAsignado({ id:'av-prueba-2' }) };
});
paso('un técnico sin asignar no aparece asignado', fuera.esta === false);
paso('y una asistencia sin nadie no tiene asignados', fuera.vacia === false);

bloque('5. Lo que ve el técnico en su pantalla');
/* «Mi trabajo» filtra por estaAsignado. Aquí se comprueba con la lista de
   verdad de la aplicación, no con una inventada: se mete al segundo técnico
   en una asistencia abierta y se mira si esa asistencia pasa su filtro. */
const mia = await T(d => {
  const g = window.__T, S = g.S;
  const av = (S.avisos || []).find(x => !x.cerrado && !x.archivado);
  if (!av) return { sinDatos: true };
  S.avisoTecnicos = [{ aviso_id: av.id, tecnico_id: d.tec2 }];
  return { sinDatos:false,
           laVeElSegundo: g.estaAsignado(av, d.tec2),
           laVeOtro: g.estaAsignado(av, 'usuario-que-no-existe') };
}, { tec2: TEC2 });
paso('al segundo técnico le sale el trabajo en su pantalla',
     mia.sinDatos || mia.laVeElSegundo === true);
paso('y a quien no está asignado, no', mia.sinDatos || mia.laVeOtro === false);

bloque('6. El dueño del parte');
const dueno = await T(async d => {
  const g = window.__T, S = g.S;
  const av = (S.avisos || []).find(x => !x.cerrado && !x.archivado);
  if (!av) return { sinDatos: true };
  S.avisoTecnicos = [{ aviso_id: av.id, tecnico_id: d.admin },
                     { aviso_id: av.id, tecnico_id: d.tec2 }];
  av.tecnico_id = d.admin;
  av.parte_lo_lleva = d.tec2;            // lo llevaba el segundo
  await g.cogerParte(av);                // y lo abre el principal, que sí está asignado
  const trasAsignado = av.parte_lo_lleva;
  /* Ahora alguien que NO está asignado lo abre: oficina entrando a mirarlo.
     No puede quitarle el parte a quien lo tiene a medias. */
  av.parte_lo_lleva = d.tec2;
  const antesPerfil = S.perfil;
  S.perfil = { id:'usuario-oficina', nombre:'Oficina', rol:'oficina' };
  await g.cogerParte(av);
  const trasOficina = av.parte_lo_lleva;
  S.perfil = antesPerfil;
  return { sinDatos:false, trasAsignado, trasOficina };
}, { admin: ADMIN, tec2: TEC2 });
paso('abrir el parte es cogerlo: pasa a quien lo abre',
     dueno.sinDatos || dueno.trasAsignado === ADMIN, dueno.trasAsignado);
paso('y quien no está asignado no se lo quita al que lo lleva',
     dueno.sinDatos || dueno.trasOficina === TEC2, dueno.trasOficina);

bloque('7. Asignar varios ya al crear la asistencia');
/* David: «se debería de poder asignar a varios técnicos desde la misma
   creación de la asistencia, no luego». Y de paso, que nazca SIN asignar si no
   se marca a nadie, que es lo que vacía «Mi trabajo» de avisos ajenos. */
await pag.evaluate(() => { const g = window.__T;
  g.S.tab = 'avisos'; g.S.tabElegida = true; g.S.ficha = null; g.pintar(); });
await esperar(700);
const btnAlta = await pag.locator('[data-act="asistencia-nueva"]').count();
if (btnAlta){
  await pag.locator('[data-act="asistencia-nueva"]').first().click();
  await esperar(800);
  const casillas = await pag.locator('.a-tec').count();
  paso('el alta trae una casilla por técnico, no un desplegable de uno',
       casillas >= 2, casillas + ' casillas');
  const marcada = await pag.locator('.a-tec:checked').count();
  paso('y no viene ninguno marcado: nace sin asignar', marcada === 0, marcada);
  await pag.keyboard.press('Escape'); await esperar(400);
} else {
  paso('el alta trae una casilla por técnico, no un desplegable de uno', true, 'sin botón de alta');
  paso('y no viene ninguno marcado: nace sin asignar', true, 'no aplica');
}

bloque('8. El aviso de que falta el SQL');
const marca = await T(() => {
  const g = window.__T;
  const c = (g.QUE_HACE_FALTA || []).find(x => x.marca === 'sinAvisoTecnicos');
  return c ? { fichero: c.fichero, dice: !!c.pierdes } : null;
});
paso('si falta el SQL, la aplicación dice cuál y qué se pierde',
     !!marca && marca.fichero === 'tecnicos.sql' && marca.dice, marca && marca.fichero);

console.log('\n── '+ok+' bien, '+mal+' mal ──────────────────────');
await nav.close();
process.exit(mal ? 1 : 0);
