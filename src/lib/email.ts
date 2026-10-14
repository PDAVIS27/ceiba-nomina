// ---------------------------------------------------------------------------
// Envío de correo (pre-nómina / nómina / listado de pago en PDF) vía Resend.
//
// Variables de entorno requeridas en Vercel:
//   RESEND_API_KEY   — tu clave de API de https://resend.com (gratis hasta
//                       3,000 correos/mes).
//   RESEND_FROM_EMAIL — remitente, ej. "Ceiba <nomina@tudominio.com>". El
//                       dominio debe estar VERIFICADO en Resend para poder
//                       enviar a cualquier destinatario. Mientras no
//                       verifiques un dominio propio, Resend solo deja
//                       enviar a la casilla con la que creaste la cuenta, y
//                       esta plataforma usa "Ceiba <onboarding@resend.dev>"
//                       como remitente de prueba por defecto.
// ---------------------------------------------------------------------------

import { Resend } from "resend";

export interface EnvioCorreoResultado {
  ok: boolean;
  error?: string;
}

/** true si falta configurar RESEND_API_KEY — así la UI puede avisar antes de intentar enviar. */
export function envioCorreoConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function enviarPDFPorCorreo(params: {
  destinatario: string;
  asunto: string;
  mensaje: string;
  nombreArchivo: string;
  contenidoPDF: Uint8Array;
}): Promise<EnvioCorreoResultado> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "El envío de correo todavía no está configurado — falta la variable de entorno RESEND_API_KEY en Vercel.",
    };
  }

  const remitente = process.env.RESEND_FROM_EMAIL || "Ceiba <onboarding@resend.dev>";

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: remitente,
      to: [params.destinatario],
      subject: params.asunto,
      text: params.mensaje,
      attachments: [
        {
          filename: params.nombreArchivo,
          content: Buffer.from(params.contenidoPDF),
        },
      ],
    });
    if (error) {
      return { ok: false, error: error.message || "Resend rechazó el envío." };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudo enviar el correo." };
  }
}
