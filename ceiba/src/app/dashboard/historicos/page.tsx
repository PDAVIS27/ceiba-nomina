import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SubmitButton from "@/components/SubmitButton";
import { aprobarPlanilla, eliminarBorrador } from "@/app/dashboard/actions";

export const dynamic = "force-dynamic";

export default async function HistoricosPage({
  searchParams,
}: {
  searchParams: {
    periodo?: string;
    carga?: string;
    agregados?: string;
    omitidos?: string;
    omitidosDetalle?: string;
  };
}) {
  let omitidosDetalle: string[] = [];
  if (searchParams.omitidosDetalle) {
    try {
      omitidosDetalle = JSON.parse(searchParams.omitidosDetalle);
    } catch {
      omitidosDetalle = [];
    }
  }
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId as string;

  const periods = await prisma.payrollPeriod.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    include: { payslips: { include: { employee: true }, orderBy: { createdAt: "asc" } } },
  });

  const selectedPeriod = searchParams.periodo
    ? periods.find((p) => p.id === searchParams.periodo) ?? periods[0]
    : periods[0];

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold mb-8">Históricos de nómina</h1>

      {searchParams.carga === "ok" && (
        <div className="bg-emerald/10 border border-emerald rounded-lg p-3 mb-6 text-sm">
          Se procesaron <strong>{searchParams.agregados}</strong> colaboradores desde el Excel.
          {Number(searchParams.omitidos) > 0 && <> Se omitieron {searchParams.omitidos} filas incompletas.</>}
          {omitidosDetalle.length > 0 && (
            <ul className="mt-2 ml-4 list-disc text-inkdim">
              {omitidosDetalle.map((linea, i) => (
                <li key={i}>{linea}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {periods.length === 0 && (
        <div className="bg-panel border border-line rounded-xl p-6 text-inkfaint text-sm">
          Todavía no has corrido ninguna planilla. Ve a <a href="/dashboard/nomina" className="text-gold">Correr nómina</a> para generar la primera.
        </div>
      )}

      {periods.length > 0 && selectedPeriod && (
        <>
          <div className="flex gap-2 flex-wrap mb-5">
            {periods.map((p) => (
              <a
                key={p.id}
                href={`/dashboard/historicos?periodo=${p.id}`}
                className={`px-3 py-1.5 rounded-full text-xs font-mono border ${
                  p.id === selectedPeriod.id ? "bg-gold text-[#1b1500] border-gold" : "border-linestrong text-inkdim"
                }`}
              >
                {p.label}
              </a>
            ))}
          </div>

          <section className="bg-panel border border-line rounded-xl p-6">
            <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
              <div className="text-xs text-inkfaint font-mono">
                {selectedPeriod.label} · {selectedPeriod.payslips.length} comprobantes ·{" "}
                <span className={selectedPeriod.status === "BORRADOR" ? "text-gold" : "text-emerald"}>
                  {selectedPeriod.status === "BORRADOR" ? "BORRADOR — pendiente de aprobación" : "APROBADA"}
                </span>
              </div>
              <div className="flex gap-2">
                <a
                  href={`/api/preplanilla/${selectedPeriod.id}`}
                  className="px-4 py-2 rounded-lg border border-linestrong text-xs text-inkdim hover:border-gold hover:text-gold transition"
                >
                  {selectedPeriod.status === "BORRADOR" ? "Descargar preplanilla (PDF)" : "Descargar planilla (PDF)"}
                </a>
                {selectedPeriod.status === "BORRADOR" && (
                  <>
                    <form action={aprobarPlanilla}>
                      <input type="hidden" name="periodId" value={selectedPeriod.id} />
                      <SubmitButton className="px-4 py-2 rounded-lg bg-emerald text-[#eafaf3] text-xs font-medium" pendingText="Aprobando…">
                        Marcar como aprobada
                      </SubmitButton>
                    </form>
                    <form action={eliminarBorrador}>
                      <input type="hidden" name="periodId" value={selectedPeriod.id} />
                      <SubmitButton className="px-4 py-2 rounded-lg border border-lava text-lava text-xs font-medium" pendingText="Eliminando…">
                        Eliminar borrador
                      </SubmitButton>
                    </form>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {selectedPeriod.payslips.map((ps) => {
                const provisiones =
                  Number(ps.provisionAguinaldo) + Number(ps.provisionVacaciones) + Number(ps.provisionIndemnizacion);
                return (
                  <details key={ps.id} className="border border-line rounded-lg px-4 py-3 group">
                    <summary className="flex justify-between items-center cursor-pointer list-none">
                      <div>
                        <div className="font-medium">{ps.employee.fullName}</div>
                        <div className="text-xs text-inkfaint">{ps.employee.role}</div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-[10px] uppercase text-inkfaint font-mono">Neto</div>
                          <div className="font-mono">{money(Number(ps.netPay))}</div>
                        </div>
                        <span className="text-inkfaint text-xs group-open:rotate-180 transition-transform">▾</span>
                      </div>
                    </summary>
                    <div className="mt-4 pt-4 border-t border-line grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm">
                      <Detalle label="Salario bruto" value={money(Number(ps.grossSalary))} />
                      <Detalle label="Horas extra" value={`${Number(ps.horasExtraCantidad)} h · ${money(Number(ps.horasExtraMonto))}`} />
                      <Detalle label="Comisiones" value={money(Number(ps.comisiones))} />
                      <Detalle label="Retroactivos" value={money(Number(ps.retroactivos))} />
                      <Detalle label="Viáticos (no gravable)" value={money(Number(ps.viaticos))} />
                      <Detalle label="INSS laboral (7%)" value={"− " + money(Number(ps.inssLaboral))} />
                      <Detalle label="IR retenido" value={"− " + money(Number(ps.irMensual))} />
                      <Detalle label="Neto a pagar" value={money(Number(ps.netPay))} bold />
                      <Detalle label="Provisión aguinaldo" value={money(Number(ps.provisionAguinaldo))} />
                      <Detalle label="Provisión vacaciones" value={money(Number(ps.provisionVacaciones))} />
                      <Detalle label="Provisión indemnización" value={money(Number(ps.provisionIndemnizacion))} />
                      <Detalle label="Total provisiones del mes" value={money(provisiones)} bold />
                    </div>
                    <a
                      href={`/api/comprobante/${ps.id}`}
                      className="inline-block mt-3 px-3.5 py-2 rounded-lg border border-linestrong text-xs text-inkdim hover:border-gold hover:text-gold transition"
                    >
                      Descargar comprobante individual (PDF)
                    </a>
                  </details>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Detalle({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between md:block">
      <div className="text-inkfaint text-[11px] uppercase font-mono">{label}</div>
      <div className={`font-mono ${bold ? "font-semibold text-ink" : "text-inkdim"}`}>{value}</div>
    </div>
  );
}

function money(n: number) {
  return "C$ " + n.toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
