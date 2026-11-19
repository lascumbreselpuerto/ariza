// ============================================================================
// ARIZA SAT · Borrar del todo a alguien del equipo
//
// POR QUÉ EXISTE ESTA FUNCIÓN Y NO SE HACE DESDE LA APLICACIÓN
// Una cuenta son DOS piezas: la ficha del equipo, que vive en la tabla
// perfiles, y la credencial de acceso (correo y contraseña), que vive en el
// sistema de acceso de Supabase.
//
// La aplicación puede borrar la ficha. La credencial NO: hace falta la clave
// maestra del proyecto, y esa clave no puede estar dentro de una página web,
// porque la vería cualquiera que abriese el código.
//
// Y borrar solo la ficha es peor que no borrar nada: la aplicación vuelve a
// crearla sola la próxima vez que esa persona entre, y nacería ACTIVA. O sea,
// le devolvería el acceso. Por eso se borran las dos o ninguna.
//
// QUÉ SE LLEVA POR DELANTE, Y QUÉ NO
//   Se va:  la credencial, la ficha del equipo y su foto.
//   Se queda: todo su trabajo. Los partes llevan el nombre del técnico
//             ESCRITO, no un enlace, así que seguirás viendo quién hizo cada
//             visita. Lo mismo con los mensajes y las firmas.
//   Se suelta: sus visitas quedan sin técnico asignado y su furgoneta sin
//             dueño. Hay que reasignarlas.
//
// LOS CUATRO CERROJOS
//   1. Quien llama tiene que haber entrado en la aplicación. Sin sesión, no.
//   2. Y tiene que ser ADMINISTRADOR. Se comprueba aquí, leyendo su ficha, no
//      en la página: lo que diga el navegador no vale como permiso.
//   3. No puede borrarse a sí mismo. Quedarse sin administrador y sin poder
//      entrar a arreglarlo es un día perdido.
//   4. No puede borrar a otro administrador.
//
// CÓMO SE DESPLIEGA
//   Panel de Supabase → Edge Functions → Deploy a new function
//   Nombre: borrar-tecnico
//   Se pega este fichero entero.
//   No hay que configurar ningún secreto: SUPABASE_URL y
//   SUPABASE_SERVICE_ROLE_KEY ya las pone Supabase sola.
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const ok = (c: unknown, e = 200) =>
  new Response(JSON.stringify(c), { status: e, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const URL_SB = Deno.env.get('SUPABASE_URL')!;
    const CLAVE_MAESTRA = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const CLAVE_PUBLICA = Deno.env.get('SUPABASE_ANON_KEY')!;
    if (!URL_SB || !CLAVE_MAESTRA) return ok({ error: 'falta la configuración del proyecto' }, 500);

    /* ---- Cerrojo 1: quién llama ----
       Se mira la sesión que viene en la cabecera. Si no hay, o no vale, aquí
       se acaba. */
    const cabecera = req.headers.get('Authorization') || '';
    if (!cabecera.startsWith('Bearer ')) return ok({ error: 'sin sesión' }, 401);

    const comoElQueLlama = createClient(URL_SB, CLAVE_PUBLICA, {
      global: { headers: { Authorization: cabecera } },
    });
    const { data: quien } = await comoElQueLlama.auth.getUser();
    const yo = quien?.user;
    if (!yo) return ok({ error: 'sin sesión' }, 401);

    const admin = createClient(URL_SB, CLAVE_MAESTRA);

    /* ---- Cerrojo 2: y tiene que ser administrador ----
       Se lee su ficha con la clave maestra, para que la respuesta no dependa
       de los permisos de quien pregunta. */
    const { data: miFicha } = await admin
      .from('perfiles').select('rol, activo').eq('id', yo.id).maybeSingle();
    if (!miFicha || miFicha.rol !== 'admin' || !miFicha.activo)
      return ok({ error: 'solo el administrador puede borrar cuentas' }, 403);

    const cuerpo = await req.json().catch(() => ({}));
    const destino = String(cuerpo?.id || '').trim();
    if (!destino) return ok({ error: 'no se ha dicho a quién borrar' }, 400);

    /* ---- Cerrojo 3: no a uno mismo ---- */
    if (destino === yo.id)
      return ok({ error: 'no puedes borrarte a ti mismo' }, 400);

    /* ---- Cerrojo 4: no a otro administrador ----
       Si alguna vez hay dos administradores y uno quiere quitar al otro, eso
       se hace a mano y pensándolo, no con un botón. */
    const { data: suFicha } = await admin
      .from('perfiles').select('rol, nombre, foto_ruta').eq('id', destino).maybeSingle();
    if (suFicha && suFicha.rol === 'admin')
      return ok({ error: 'no se puede borrar a un administrador desde aquí' }, 400);

    const nombre = (suFicha?.nombre || '').trim();

    /* ---- Y ahora sí, las tres piezas, en este orden ----
       Primero la foto, que es lo que no se puede recuperar de ninguna manera
       si se queda huérfana; luego la ficha; y la credencial la última, porque
       es la que de verdad cierra la puerta. Si algo falla por el camino, lo
       que queda es una cuenta sin acceso a nada, no una cuenta borrada a
       medias que pueda volver a entrar. */
    const pasos: string[] = [];

    if (suFicha?.foto_ruta) {
      const { error } = await admin.storage.from('equipo').remove([suFicha.foto_ruta]);
      pasos.push(error ? 'la foto no se ha podido borrar: ' + error.message : 'foto borrada');
    }

    const { error: eFicha } = await admin.from('perfiles').delete().eq('id', destino);
    if (eFicha) return ok({ error: 'no se ha podido borrar la ficha: ' + eFicha.message }, 500);
    pasos.push('ficha borrada');

    const { error: eCuenta } = await admin.auth.admin.deleteUser(destino);
    if (eCuenta) {
      /* La ficha ya no está y la credencial sí. Es el caso feo: esa persona
         podría entrar y la aplicación le crearía una ficha nueva, activa. Así
         que se vuelve a poner la ficha, sin acceso, y se avisa. */
      await admin.from('perfiles')
        .insert({ id: destino, nombre: nombre || 'Pendiente de borrar', rol: 'tecnico', activo: false });
      return ok({
        error: 'no se ha podido borrar la credencial: ' + eCuenta.message +
               '. La cuenta se ha dejado SIN ACCESO para que nadie pueda entrar con ella.',
      }, 500);
    }
    pasos.push('credencial borrada');

    return ok({ ok: true, nombre, pasos });
  } catch (e) {
    return ok({ error: String((e as Error)?.message || e) }, 500);
  }
});
