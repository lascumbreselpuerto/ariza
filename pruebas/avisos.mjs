/* ================================================================
   avisos.mjs — lo que se manda al grupo de la oficina.  04-11-2026

   POR QUÉ EXISTE
   Esta suite prueba la función de avisos del servidor (avisar.ts),
   que hasta hoy no probaba nadie: se desplegaba y se miraba el
   grupo a ver qué salía. Eso vale para ver si llega; no vale para
   saber si lo que llega dice la verdad.

   Y lo que dice importa, porque la oficina ACTÚA sobre ello. En
   concreto, de la nota del cierre salen dos decisiones de dinero:
     · ¿se ha cobrado ya, y cómo?
     · ¿hay que facturarla, o no?
   Cobrar y facturar no son lo mismo. Lo cobrado en obra hay que
   facturarlo igual, y confundirlo ya dejó una vez visitas cobradas
   que no facturaba nadie.

   CÓMO SE PRUEBA
   No hay Deno aquí, ni Supabase, ni Telegram. Así que se compila
   avisar.ts cambiando el cliente de Supabase por uno de mentira con
   datos preparados, se finge el entorno de Deno y se intercepta la
   llamada a Telegram para leer el mensaje que habría salido. Lo que
   se comprueba es el texto exacto, palabra por palabra.
   ================================================================ */
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';

const AQUI = dirname(fileURLToPath(import.meta.url));
const FUENTE = join(AQUI, '..', 'servidor', 'avisar.ts');

let ok = 0, mal = 0;
const paso = (t, bien, extra = '') => { bien ? ok++ : mal++;
  console.log((bien ? '  OK  ' : ' FALLA ') + t + (extra !== '' && extra !== undefined ? ' → ' + String(extra) : '')); };
const bloque = t => console.log('\n· ' + t);

/* ---- Los datos de mentira ----
   Una tabla por nombre. El cliente falso devuelve la primera fila que
   cuadre con los .eq() que le hayan pedido, igual que haría Supabase. */
let DATOS = {};
const tmp = mkdtempSync(join(tmpdir(), 'ariza-avisos-'));

const stub = `
export function createClient(){
  const consulta = (tabla) => {
    const filtros = [];
    const api = {
      select(){ return api; },
      eq(col, val){ filtros.push([col, val]); return api; },
      order(){ return api; },
      limit(){ return api; },
      not(){ return api; },
      lte(){ return api; },
      insert(fila){
        const t = (globalThis.__DATOS[tabla] = globalThis.__DATOS[tabla] || []);
        const clave = fila && fila.clave;
        if (clave != null && t.some(x => x.clave === clave))
          return Promise.resolve({ data:null, error:{ message:'duplicada' } });
        t.push(fila);
        return Promise.resolve({ data:null, error:null });
      },
      update(){ return { eq(){ return Promise.resolve({ data:null, error:null }); } }; },
      maybeSingle(){
        const filas = (globalThis.__DATOS[tabla] || []).filter(f =>
          filtros.every(([c, v]) => String(f[c]) === String(v)));
        return Promise.resolve({ data: filas[0] || null, error:null });
      },
      then(res){
        const filas = (globalThis.__DATOS[tabla] || []).filter(f =>
          filtros.every(([c, v]) => String(f[c]) === String(v)));
        return Promise.resolve({ data: filas, error:null }).then(res);
      },
    };
    return api;
  };
  return { from: consulta, auth: { admin: { getUserById: async () => ({ data:null }) } } };
}
`;
writeFileSync(join(tmp, 'stub.js'), stub);

/* Se compila avisar.ts cambiando el import de internet por el de mentira */
const salida = join(tmp, 'avisar.mjs');
await build({
  entryPoints: [FUENTE], outfile: salida, bundle: true, format: 'esm',
  platform: 'neutral', target: 'es2022', logLevel: 'silent',
  plugins: [{
    name: 'supabase-de-mentira',
    setup(b){
      b.onResolve({ filter: /esm\.sh/ }, () => ({ path: join(tmp, 'stub.js') }));
    },
  }],
});

/* ---- El entorno: Deno, el servidor y Telegram ---- */
let manejador = null;
let ultimoTelegram = null;
const ENTORNO = {
  AVISOS_SECRETO: 'secreto-de-prueba',
  SUPABASE_URL: 'http://local', SUPABASE_SERVICE_ROLE_KEY: 'k',
  TELEGRAM_TOKEN: 'token-de-prueba', TELEGRAM_CHAT: '-123',
  RESEND_API_KEY: '',           // sin correo: aquí se prueba el grupo
};
globalThis.Deno = {
  env: { get: k => ENTORNO[k] },
  serve: fn => { manejador = fn; },
};
globalThis.fetch = async (url, op) => {
  if (String(url).includes('api.telegram.org')) {
    ultimoTelegram = JSON.parse(op.body);
    return { ok: true, text: async () => '' };
  }
  return { ok: true, text: async () => '' };
};
await import(pathToFileURL(salida).href);

const pedir = async (cuerpo) => {
  ultimoTelegram = null;
  const req = new Request('http://local/avisar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ariza-secreto': 'secreto-de-prueba' },
    body: JSON.stringify(cuerpo),
  });
  const res = await manejador(req);
  return { respuesta: await res.json(), texto: ultimoTelegram ? ultimoTelegram.text : null };
};

/* ---- Un caso base del que salen todos los demás ---- */
const VISITA = {
  id: 'av-1', tipo: 'averia', cliente_id: 'cli-1', puerta_id: 'pu-1',
  tecnico: 'Juan Pérez', horas: 1.5, num_tecnicos: 1,
  hora_inicio: '2026-11-04T08:12:00Z', hora_fin: '2026-11-04T09:48:00Z',
  ruta: 'ruta2', trabajo: 'Sustituida la banda y ajustado el final de carrera',
  firma_ruta: 'firmas/av-1.png', firma_nombre: 'Manuel Ruiz',
  cobrado: false, sin_cargo: false, pendiente: false,
};
const base = (cambios = {}) => {
  globalThis.__DATOS = DATOS = {
    avisos: [{ ...VISITA, ...cambios }],
    puertas: [{ id: 'pu-1', codigo: 'AR-0012', cliente: 'Comunidad Las Flores',
                direccion: 'Calle Larga 1', ubicacion: 'Portal 3', centro_id: null }],
    clientes: [{ id: 'cli-1', nombre: 'Comunidad Las Flores' }],
    centros: [],
    materiales: [{ aviso_id: 'av-1', descripcion: 'Banda ASO 2 m', precio: 40 }],
    tarifas: [{ id: 1, ruta1_nombre: 'El Puerto', ruta1_importe: 30,
                ruta2_nombre: 'Jerez', ruta2_importe: 45, desplazamiento_fijo: 30 }],
    jornadas: [],
    telegram_enviados: [],
  };
};

/* ================================================================
   1. Que la nota salga, y que diga de quién y de dónde
   ================================================================ */
bloque('1. La nota del cierre');

base();
const cierre = await pedir({ tipo: 'cierre', aviso_id: 'av-1' });
paso('el cierre manda una nota al grupo', !!cierre.texto);
paso('dice que es un parte cerrado y quién lo cerró',
  /PARTE CERRADO<\/b> · Juan Pérez/.test(cierre.texto || ''),
  (cierre.texto || '').split('\n')[0]);
paso('dice el cliente, dónde y qué puerta',
  /Comunidad Las Flores/.test(cierre.texto) && /Portal 3/.test(cierre.texto) &&
  /AR-0012/.test(cierre.texto));
paso('las horas van en hora de Madrid, no en UTC',
  /De 09:12 a 10:48/.test(cierre.texto),
  (cierre.texto.match(/De \d\d:\d\d a \d\d:\d\d/) || ['no sale'])[0]);
paso('el desplazamiento dice el NOMBRE de la ruta, no un código',
  /Desplazamiento: Jerez/.test(cierre.texto));
paso('y el trabajo que se hizo', /Sustituida la banda/.test(cierre.texto));

/* ================================================================
   2. Cobrar y facturar, que no son lo mismo
   ================================================================
   Lo que David pidió el 04-11-2026: que la nota diga siempre si se
   ha cobrado, cómo, y si hay que facturarla. Las cuatro variantes.
   ================================================================ */
bloque('2. Cobro y factura: las dos líneas, siempre');

paso('sin cobrar, lo dice en vez de callarse',
  /Cobro: <b>no se ha cobrado en obra<\/b>/.test(cierre.texto),
  (cierre.texto.match(/Cobro:.*/) || ['no sale'])[0]);
paso('y dice que hay que facturarla',
  /Facturar: <b>SÍ<\/b>\. Queda pendiente de facturar/.test(cierre.texto),
  (cierre.texto.match(/Facturar:.*/) || ['no sale'])[0]);

base({ cobrado: true, cobro_importe: 121, cobro_forma: 'efectivo', cobro_ref: 'recibo 14' });
const cobrada = await pedir({ tipo: 'cierre', aviso_id: 'av-1' });
paso('cobrada en obra: importe, forma y referencia',
  /Cobro: <b>cobrado en obra<\/b>, 121,00 € en efectivo \(recibo 14\)/.test(cobrada.texto),
  (cobrada.texto.match(/Cobro:.*/) || ['no sale'])[0]);
paso('Y AUN ASÍ hay que facturarla, y lo dice',
  /Facturar: <b>SÍ<\/b>\. Hay que facturarla igual, aunque esté cobrada/.test(cobrada.texto),
  (cobrada.texto.match(/Facturar:.*/) || ['no sale'])[0]);

base({ sin_cargo: true, sin_cargo_motivo: 'cortesía: el cliente tiene contrato desde enero' });
const sinCargo = await pedir({ tipo: 'cierre', aviso_id: 'av-1' });
paso('marcada como que no se cobra: NO se factura, con el motivo del técnico',
  /Facturar: <b>NO<\/b>\. cortesía: el cliente tiene contrato/.test(sinCargo.texto),
  (sinCargo.texto.match(/Facturar:.*/) || ['no sale'])[0]);
paso('y la línea del cobro sigue saliendo igual',
  /Cobro: <b>no se ha cobrado en obra<\/b>/.test(sinCargo.texto));

base({ tipo: 'garantia' });
const garantia = await pedir({ tipo: 'cierre', aviso_id: 'av-1' });
paso('una garantía no se factura, y dice por qué',
  /Facturar: <b>NO<\/b>, es una visita de garantía/.test(garantia.texto),
  (garantia.texto.match(/Facturar:.*/) || ['no sale'])[0]);

base({ tipo: 'comercial' });
const comercial = await pedir({ tipo: 'cierre', aviso_id: 'av-1' });
paso('una comercial tampoco',
  /Facturar: <b>NO<\/b>, es una visita comercial/.test(comercial.texto));

/* ================================================================
   3. Lo que hay que rematar en oficina
   ================================================================ */
bloque('3. Material sin precio y ruta sin valorar');

base();
DATOS.materiales = [
  { aviso_id: 'av-1', descripcion: 'Banda ASO 2 m', precio: 40 },
  { aviso_id: 'av-1', descripcion: 'Tornillería', precio: null },
  { aviso_id: 'av-1', descripcion: 'Perfil de goma', precio: null },
];
const sinPrecio = await pedir({ tipo: 'cierre', aviso_id: 'av-1' });
paso('el material sin precio se nombra, y se dice cuántos son',
  /2 materiales sin precio: Tornillería, Perfil de goma/.test(sinPrecio.texto),
  (sinPrecio.texto.match(/\d+ materiales sin precio[^.]*/) || ['no sale'])[0]);
paso('y se explica qué pasa si no se remata',
  /No entra en la factura hasta que se le ponga/.test(sinPrecio.texto));

base({ ruta: 'ruta4' });
DATOS.tarifas = [{ id: 1, ruta4_nombre: 'Huelva', ruta4_importe: null, desplazamiento_fijo: 30 }];
const rutaSin = await pedir({ tipo: 'cierre', aviso_id: 'av-1' });
paso('una ruta sin importe se avisa, con su nombre',
  /la ruta Huelva no tiene importe puesto en Tarifas/.test(rutaSin.texto),
  (rutaSin.texto.match(/la ruta [^:]*/) || ['no sale'])[0]);
paso('y se dice lo que eso significa: desplazamiento a cero',
  /entra a cero euros/.test(rutaSin.texto));

base({ ruta: 'ruta1' });
DATOS.tarifas = [{ id: 1, ruta1_nombre: 'El Puerto', ruta1_importe: null, desplazamiento_fijo: 30 }];
const ruta1 = await pedir({ tipo: 'cierre', aviso_id: 'av-1' });
paso('la ruta 1 sin importe NO se avisa: cae al importe fijo de siempre',
  !/no tiene importe puesto/.test(ruta1.texto));

base();
const limpia = await pedir({ tipo: 'cierre', aviso_id: 'av-1' });
paso('y cuando no hay nada que rematar, no se dice nada',
  !/A rematar en oficina/.test(limpia.texto));

/* ================================================================
   4. La firma y lo que queda pendiente
   ================================================================ */
bloque('4. Firma y pendientes');

paso('firmada: dice quién firmó', /Firmado por Manuel Ruiz/.test(limpia.texto));
base({ firma_ruta: null, firma_sin: 'el cliente se había ido' });
const sinFirma = await pedir({ tipo: 'cierre', aviso_id: 'av-1' });
paso('sin firma: se dice en negrita y con el motivo',
  /<b>Sin firma del cliente\.<\/b> el cliente se había ido/.test(sinFirma.texto),
  (sinFirma.texto.match(/Sin firma[^\n]*/) || ['no sale'])[0]);

base({ pendiente: true, pendiente_texto: 'falta el cuadro, vuelvo el jueves' });
const pend = await pedir({ tipo: 'cierre', aviso_id: 'av-1' });
paso('lo que queda pendiente sale destacado',
  /QUEDA PENDIENTE:<\/b> falta el cuadro/.test(pend.texto));

/* ================================================================
   5. La llegada
   ================================================================ */
bloque('5. Ha llegado');

base({ cerrado: null });
const lleg = await pedir({ tipo: 'llegada', aviso_id: 'av-1' });
paso('la llegada manda su nota', !!lleg.texto);
paso('dice quién ha llegado y a dónde',
  /HA LLEGADO<\/b> · Juan Pérez/.test(lleg.texto) && /Comunidad Las Flores/.test(lleg.texto));
paso('y la hora de entrada, en hora de Madrid',
  /Hora de entrada: <b>09:12<\/b>/.test(lleg.texto),
  (lleg.texto.match(/Hora de entrada:.*/) || ['no sale'])[0]);

/* ================================================================
   6. Un aviso, una vez
   ================================================================
   Un grupo que suena tres veces por la misma llegada se silencia,
   y entonces no sirve de nada.
   ================================================================ */
bloque('6. Un aviso, una vez');

base();
const una = await pedir({ tipo: 'cierre', aviso_id: 'av-1' });
const dos = await pedir({ tipo: 'cierre', aviso_id: 'av-1' });
paso('la primera vez sale', !!una.texto);
paso('la segunda NO sale', dos.texto === null && dos.respuesta.repetido === true);

/* ================================================================
   7. Sin configurar, no se rompe nada
   ================================================================ */
bloque('7. Sin token, la función no revienta');

ENTORNO.TELEGRAM_TOKEN = '';
base();
const sinToken = await pedir({ tipo: 'cierre', aviso_id: 'av-1' });
paso('sin token no se manda nada y se dice por qué, sin fallar',
  sinToken.texto === null && sinToken.respuesta.detalle === 'sin configurar',
  JSON.stringify(sinToken.respuesta));
ENTORNO.TELEGRAM_TOKEN = 'token-de-prueba';

/* ================================================================
   8. El secreto manda
   ================================================================ */
bloque('8. Nadie llama a esto desde fuera');

base();
const sinSecreto = await (async () => {
  ultimoTelegram = null;
  const req = new Request('http://local/avisar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo: 'cierre', aviso_id: 'av-1' }),
  });
  const res = await manejador(req);
  return { estado: res.status, texto: ultimoTelegram };
})();
paso('sin el secreto, ni se mira el aviso ni se manda nada',
  sinSecreto.estado === 401 && sinSecreto.texto === null, sinSecreto.estado);

console.log('\n' + ok + ' bien, ' + mal + ' mal.');
process.exit(mal ? 1 : 0);
