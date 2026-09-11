import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SubmitButton from "@/components/SubmitButton";
import { aprobarPlanilla, eliminarBorrador } from "@/app/dashboard/actions";

export const dynamic = "force-dynamic";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

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

  // ---------- Agrupar el histórico por año y mes ----------
  // La fecha real del período (periodEnd/periodStart) manda; para períodos
  // viejos creados antes de que existiera ese campo, se cae a createdAt —
  // el mismo criterio que ya usa el histórico de provisiones.
  const fechaDelPeriodo = (p: (typeof periods)[number]) => p.periodEnd ?? p.periodStart ?? p.createdAt;

  const porAnio = new Map<number, Map<number, typeof periods>>();
  for (const p of periods) {
    const fecha = fechaDelPeriodo(p);
    const anio = fecha.getFullYear();
    const mes = fecha.getMonth();
    if (!porAnio.has(anio)) porAnio.set(anio, new Map());
    const porMes = porAnio.get(anio)!;
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes)!.push(p);
  }
  const anios = Array.from(porAnio.keys()).sort((a, b) => b - a);

  const netoDePeriodo = (p: (typeof periods)[number]) =>
    p.payslips.reduce((acc, ps) => acc + Number(ps.netPay), 0);

  const periodosAprobados = periods.filter((p) => p.status === "APROBADA");
  const totalNetoHistorico = periodosAprobados.reduce((acc, p) => acc + netoDePeriodo(p), 0);
  const colaboradoresDistintos = new Set(periods.flatMap((p) => p.payslips.map((ps) => ps.employeeId))).size;

  const anioSeleccionado = selectedPeriod ? fechaDelPeriodo(selectedPeriod).getFullYear() : anios[0];
  const totalesPorMes = Array.from({ length: 12 }, (_, mes) => {
    const delMes = (porAnio.get(anioSeleccionado)?.get(mes) ?? []).filter((p) => p.status === "APROBADA");
    return { mes, total: delMes.reduce((acc, p) => acc + netoDePeriodo(p), 0) };
  });
  const maxMes = Math.max(1, ...totalesPorMes.map((t) => t.total));

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="Períodos guardados" value={String(periods.length)} />
            <Stat
              label="Años de historial"
              value={anios.length === 1 ? String(anios[0]) : `${anios[anios.length - 1]}–${anios[0]}`}
            />
            <Stat label="Neto pagado (histórico)" value={money(totalNetoHistorico)} />
            <Stat label="Colaboradores distintos" value={String(colaboradoresDistintos)} />
          </div>

          <div className="bg-panel border border-line rounded-xl p-5 mb-6">
            <div className="text-xs text-inkfaint font-mono uppercase mb-3">
              Neto pagado por mes · {anioSeleccionado} (planillas aprobadas)
            </div>
            <div className="space-y-1.5">
              {totalesPorMes.map(({ mes, total }) => (
                <div key={mes} className="flex items-center gap-3 text-xs">
                  <div className="w-9 text-inkfaint font-mono shrink-0">{MESES[mes].slice(0, 3)}</div>
                  <div className="flex-1 h-4 bg-bg rounded overflow-hidden">
                    {total > 0 && (
                      <div
                        className="h-full bg-emerald rounded"
                        style={{ width: `${Math.max(3, (total / maxMes) * 100)}%` }}
                      />
                    )}
                  </div>
                  <div className="w-28 text-right font-mono text-inkdim shrink-0">
                    {total > 0 ? money(total) : "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 mb-6">
            {anios.map((anio) => {
              const porMes = porAnio.get(anio)!;
              const meses = Array.from(porMes.keys()).sort((a, b) => b - a);
              const periodosDelAnio = meses.reduce((acc, m) => acc + porMes.get(m)!.length, 0);
              const netoDelAnio = meses.reduce(
                (acc, m) => acc + porMes.get(m)!.filter((p) => p.status === "APROBADA").reduce((a, p) => a + netoDePeriodo(p), 0),
                0
              );
              return (
                <details key={anio} open={anio === anioSeleccionado} className="bg-panel border border-line rounded-xl px-5 py-4 group">
                  <summary className="flex justify-between items-center cursor-pointer list-none">
                    <div className="flex items-baseline gap-3">
                      <span className="font-serif text-xl font-semibold">{anio}</span>
                      <span className="text-xs text-inkfaint font-mono">
                        {periodosDelAnio} período{periodosDelAnio === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono text-inkdim">{money(netoDelAnio)} neto pagado</span>
                      <span className="text-inkfaint text-xs group-open:rotate-180 transition-transform">▾</span>
                    </div>
                  </summary>
                  <div className="mt-4 pt-4 border-t border-line space-y-3">
                    {meses.map((mes) => (
                      <div key={mes}>
                        <div className="text-[11px] text-inkfaint uppercase font-mono mb-1.5">{MESES[mes]}</div>
                        <div className="flex gap-2 flex-wrap">
                          {porMes.get(mes)!.map((p) => (
                            <a
                              key={p.id}
                              href={`/dashboard/historicos?periodo=${p.id}`}
                              className={`px-3 py-1.5 rounded-full text-xs font-mono border ${
                                p.id === selectedPeriod.id
                                  ? "bg-gold text-[#1b1500] border-gold"
                                  : p.status === "BORRADOR"
                                    ? "border-gold/40 text-gold"
                                    : "border-linestrong text-inkdim"
                              }`}
                            >
                              {p.tipo === "AGUINALDO" && "🎁 "}{p.label}
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>

          <section className="bg-panel border border-line rounded-xl p-6">
            <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
              <div className="text-xs text-inkfaint font-mono">
                {selectedPeriod.tipo === "AGUINALDO" && <span className="text-gold">🎁 AGUINALDO · </span>}
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
                  {selectedPeriod.tipo === "AGUINALDO"
                    ? (selectedPeriod.status === "BORRADOR" ? "Descargar preplanilla de aguinaldo (PDF)" : "Descargar planilla de aguinaldo (PDF)")
                    : (selectedPeriod.status === "BORRADOR" ? "Descargar preplanilla (PDF)" : "Descargar planilla (PDF)")}
                </a>
                {selectedPeriod.status === "APROBADA" && (
                  <a
                    href={`/api/listado-pago/${selectedPeriod.id}`}
                    className="px-4 py-2 rounded-lg border border-linestrong text-xs text-inkdim hover:border-gold hover:text-gold transition"
                  >
                    Descargar listado de pago (PDF)
                  </a>
                )}
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
                    {selectedPeriod.tipo === "AGUINALDO" ? (
                      <div className="mt-4 pt-4 border-t border-line grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm">
                        <Detalle label="Aguinaldo pagado (exento de INSS/IR)" value={money(Number(ps.grossSalary))} />
                        <Detalle label="Neto pagado" value={money(Number(ps.netPay))} bold />
                      </div>
                    ) : (
                      <div className="mt-4 pt-4 border-t border-line grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm">
                        <Detalle label="Salario bruto" value={money(Number(ps.grossSalary))} />
                        <Detalle label="Horas extra" value={`${Number(ps.horasExtraCantidad)} h · ${money(Number(ps.horasExtraMonto))}`} />
                        <Detalle label="Comisiones" value={money(Number(ps.comisiones))} />
                        <Detalle label="Retroactivos" value={money(Number(ps.retroactivos))} />
                        <Detalle label="Viáticos (no gravable)" value={money(Number(ps.viaticos))} />
                        <Detalle label="INSS laboral (7%)" value={"− " + money(Number(ps.inssLaboral))} />
                        <Detalle label="IR retenido" value={"− " + money(Number(ps.irMensual))} />
                        {Number(ps.otrasDeducciones) > 0 && (
                          <Detalle
                            label={ps.otrasDeduccionesConcepto || "Otras deducciones"}
                            value={"− " + money(Number(ps.otrasDeducciones))}
                          />
                        )}
                        <Detalle label="Neto a pagar" value={money(Number(ps.netPay))} bold />
                        <Detalle label="Provisión aguinaldo" value={money(Number(ps.provisionAguinaldo))} />
                        <Detalle label="Provisión vacaciones" value={money(Number(ps.provisionVacaciones))} />
                        <Detalle label="Provisión indemnización" value={money(Number(ps.provisionIndemnizacion))} />
                        <Detalle label="Total provisiones del mes" value={money(provisiones)} bold />
                      </div>
                    )}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel border border-line rounded-xl px-4 py-3.5">
      <div className="text-inkfaint text-[10px] uppercase font-mono tracking-wide">{label}</div>
      <div className="font-serif text-xl font-semibold mt-1">{value}</div>
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
