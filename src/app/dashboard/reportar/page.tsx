import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SubmitButton from "@/components/SubmitButton";
import { reportarProblema } from "@/app/dashboard/actions";

export const dynamic = "force-dynamic";

export default async function ReportarPage({
  searchParams,
}: {
  searchParams: { ok?: string };
}) {
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId as string;

  const casos = await prisma.supportCase.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold mb-8">Reportar un problema</h1>

      {searchParams.ok && (
        <div className="bg-emerald/10 border border-emerald rounded-lg p-3 mb-6 text-sm">
          Listo — tu proveedor ya puede ver este caso y darle seguimiento.
        </div>
      )}

      <section className="bg-panel border border-line rounded-xl p-6 mb-6">
        <p className="text-inkdim text-sm mb-4">
          Úsalo para casos que la plataforma no resuelve sola todavía: un colaborador con salario variable,
          un cálculo que no te cuadra, un dato que necesitas corregir, etc. Tu proveedor lo revisa a mano.
        </p>
        <form action={reportarProblema} className="space-y-3">
          <div>
            <label className="block text-xs text-inkdim mb-1.5">Título</label>
            <input name="title" required placeholder="Ej. Salario de Ana cambió a mitad de mes"
              className="w-full bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-inkdim mb-1.5">Detalle</label>
            <textarea name="detail" rows={4} placeholder="Cuéntanos qué pasó y qué necesitas"
              className="w-full bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <SubmitButton className="px-5 py-3 rounded-lg bg-gold text-[#1b1500] text-sm font-medium" pendingText="Enviando…">
            Reportar
          </SubmitButton>
        </form>
      </section>

      <section className="bg-panel border border-line rounded-xl p-6">
        <h3 className="font-serif text-lg font-semibold mb-4">Tus casos reportados</h3>
        {casos.length === 0 && <div className="text-inkfaint text-sm">Todavía no has reportado nada.</div>}
        <div className="space-y-3">
          {casos.map((c) => (
            <div key={c.id} className="border border-line rounded-lg px-4 py-3">
              <div className="flex justify-between items-start gap-3">
                <div className={`font-medium ${c.resolved ? "line-through text-inkfaint" : ""}`}>{c.title}</div>
                <span className={`text-xs font-mono ${c.resolved ? "text-emerald" : "text-gold"}`}>
                  {c.resolved ? "RESUELTO" : "PENDIENTE"}
                </span>
              </div>
              {c.detail && <div className="text-sm text-inkdim mt-1">{c.detail}</div>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
