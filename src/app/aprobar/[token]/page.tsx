import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import SubmitButton from "@/components/SubmitButton";
import CeibaLogo from "@/components/CeibaLogo";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Página PÚBLICA (sin login) a la que llega el cliente desde el enlace de
// aprobación — ya sea porque se lo mandaron por correo junto con la
// preplanilla (enviarPlanillaPorCorreo) o porque el negocio lo copió y lo
// compartió a mano por WhatsApp/SMS/lo que sea (generarEnlaceAprobacion),
// ambas en src/app/dashboard/actions.ts. No está bajo /dashboard ni /admin,
// así que el middleware (src/middleware.ts) no le exige sesión.
//
// A propósito, el clic de "Aprobar" aquí NO cambia el status de la planilla
// en el sistema (sigue BORRADOR) — solo deja constancia (clientApprovedAt)
// de que el cliente dio su visto bueno, para que quien tenga acceso a la
// cuenta de ese negocio lo vea en Históricos/Inicio y haga la aprobación
// real ahí, con los mismos controles de siempre. Así, alguien que solo tenga
// el enlace del correo (sin acceso a Ceiba) no puede aprobar planillas
// directamente en el sistema.
// ---------------------------------------------------------------------------

async function aprobarPorCorreo(formData: FormData) {
  "use server";
  const token = String(formData.get("token") || "");
  if (!token) return;
  const period = await prisma.payrollPeriod.findUnique({ where: { clientApprovalToken: token } });
  if (!period) return;
  if (!period.clientApprovedAt) {
    await prisma.payrollPeriod.update({
      where: { id: period.id },
      data: { clientApprovedAt: new Date() },
    });
  }
  redirect(`/aprobar/${token}`);
}

export default async function AprobarPorCorreoPage({ params }: { params: { token: string } }) {
  const period = await prisma.payrollPeriod.findUnique({
    where: { clientApprovalToken: params.token },
    include: { company: true, payslips: true },
  });

  return (
    <main className="min-h-screen flex items-center justify-center px-5 bg-bg">
      <div className="w-full max-w-[460px] bg-panel border border-line rounded-2xl p-9">
        <div className="flex justify-center mb-6">
          <CeibaLogo size={40} />
        </div>

        {!period ? (
          <div className="text-center">
            <div className="font-serif text-xl font-semibold mb-2">Enlace no válido</div>
            <p className="text-inkdim text-sm">
              Este enlace de aprobación no existe o ya no está disponible. Pide al negocio que te reenvíe el correo
              con la prenómina más reciente.
            </p>
          </div>
        ) : (
          <>
            <div className="text-center mb-7">
              <div className="font-serif text-xl font-semibold mb-1">{period.company.name}</div>
              <div className="text-inkdim text-sm">
                {period.tipo === "AGUINALDO" ? "🎁 Aguinaldo — " : ""}Período: {period.label}
              </div>
            </div>

            <div className="bg-[#12181a] border border-line rounded-xl p-4 mb-5 text-sm space-y-2">
              <Row label="Colaboradores" value={String(period.payslips.length)} />
              <Row
                label="Total neto a pagar"
                value={money(period.payslips.reduce((a, ps) => a + Number(ps.netPay), 0))}
              />
            </div>

            <a
              href={`/api/aprobar/${params.token}/pdf`}
              className="block text-center w-full border border-linestrong rounded-lg py-2.5 mb-6 text-sm text-inkdim hover:border-gold hover:text-gold transition"
            >
              Descargar PDF con el detalle completo
            </a>

            {period.status === "APROBADA" ? (
              <p className="text-emerald text-sm text-center">
                Este período ya fue aprobado y procesado en el sistema. No necesitas hacer nada más.
              </p>
            ) : period.clientApprovedAt ? (
              <p className="text-emerald text-sm text-center">
                Ya diste tu aprobación el {formatFecha(period.clientApprovedAt)}. El negocio todavía necesita
                confirmarlo dentro de Ceiba para que quede aprobada de forma final.
              </p>
            ) : (
              <>
                <p className="text-inkdim text-sm text-center mb-5">
                  Revisa el PDF con el detalle completo arriba. Si todo está correcto, confirma tu aprobación con el
                  botón de abajo — el negocio verá que aprobaste y hará la aprobación final en su sistema.
                </p>
                <form action={aprobarPorCorreo}>
                  <input type="hidden" name="token" value={params.token} />
                  <SubmitButton
                    className="w-full bg-emerald text-[#eafaf3] rounded-lg py-3 font-medium"
                    pendingText="Enviando…"
                  >
                    Aprobar prenómina
                  </SubmitButton>
                </form>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-inkfaint">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function money(n: number) {
  return "C$ " + n.toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatFecha(d: Date) {
  return new Date(d).toLocaleDateString("es-NI", { day: "numeric", month: "long", year: "numeric" });
}
