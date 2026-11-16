import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SubmitButton from "@/components/SubmitButton";
import CopyLinkButton from "@/components/CopyLinkButton";
import {
  aprobarPlanilla,
  eliminarBorrador,
  generarEnlaceAprobacion,
  actualizarCorreoAvisoAprobacion,
} from "@/app/dashboard/actions";
import { formatMonto, formatTotalPorMoneda } from "@/lib/moneda";

// El envío por correo (enviarPlanillaPorCorreo, en actions.ts) se deja de
// mostrar aquí por el momento — el negocio pidió usar enlaces para
// WhatsApp en su lugar — pero la función y src/lib/email.ts se quedan tal
// cual en el código por si se vuelve a activar más adelante.

export const dynamic = "force-dynamic";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Etiqueta para el resumen del período (PayrollPeriod.periodicidad) — MENSUAL
// no se muestra (es el caso de siempre, sin aclaración). "MIXTA" significa
// que se corrieron juntos colaboradores con distinta periodicidad habitual
// en la misma planilla (ver Employee.periodicidad en schema.prisma) — cada
// Payslip individual trae la suya propia (ver el detalle de cada uno abajo).
const PERIODICIDAD_PERIODO_LABELS: Record<string, string> = {
  QUINCENAL: "Quincenal",
  SEMANAL: "Semanal",
  SEMANAL_5: "Semanal (lunes a viernes)",
  SEMANAL_4: "Semanal (mes de 4 semanas)",
  MIXTA: "periodicidad mixta",
};

// Etiqueta corta para el tag junto al nombre de cada colaborador en la lista
// de comprobantes — solo cuando no es Mensual (el caso de siempre).
const PERIODICIDAD_PAYSLIP_LABELS: Record<string, string> = {
  QUINCENAL: "QUINCENAL",
  SEMANAL: "SEMANAL",
  SEMANAL_5: "SEMANAL · L-V",
  SEMANAL_4: "SEMANAL · ÷4",
};

export default async function HistoricosPage({
  searchParams,
}: {
  searchParams: {
    periodo?: string;
    carga?: string;
    agregados?: string;
    omitidos?: string;
    omitidosDetalle?: string;
    correoOk?: string;
    correoError?: string;
    avisoGuardado?: string;
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

  // Solo el nombre, para armar el mensaje de WhatsApp del enlace de
  // aprobación/confirmación más abajo — el resto de la página no necesita
  // los datos del negocio porque es el propio negocio viendo lo suyo.
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, avisoAprobacionEmail: true },
  });

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

  // Neto de un período, SOLO en córdobas — para la gráfica de barras y los
  // acumulados que necesitan un número comparable en una sola escala. Un
  // período con algún colaborador en dólares (Employee.moneda) también
  // acumula ese neto aparte (ver netoUsdDePeriodo) — nunca se suman juntos
  // (ver src/lib/moneda.ts).
  const netoDePeriodo = (p: (typeof periods)[number]) =>
    p.payslips.filter((ps) => ps.moneda !== "USD").reduce((acc, ps) => acc + Number(ps.netPay), 0);
  const netoUsdDePeriodo = (p: (typeof periods)[number]) =>
    p.payslips.filter((ps) => ps.moneda === "USD").reduce((acc, ps) => acc + Number(ps.netPay), 0);
  // Texto con el total REAL del período, agrupado por moneda (para mostrar,
  // no para graficar) — "C$ 1,000.00" o "C$ 1,000.00 + US$ 500.00".
  const netoTextoDePeriodo = (p: (typeof periods)[number]) =>
    formatTotalPorMoneda(p.payslips.map((ps) => ({ moneda: ps.moneda, monto: Number(ps.netPay) })));

  const periodosAprobados = periods.filter((p) => p.status === "APROBADA");
  const totalNetoHistorico = formatTotalPorMoneda(
    periodosAprobados.flatMap((p) => p.payslips.map((ps) => ({ moneda: ps.moneda, monto: Number(ps.netPay) })))
  );
  const colaboradoresDistintos = new Set(periods.flatMap((p) => p.payslips.map((ps) => ps.employeeId))).size;

  const anioSeleccionado = selectedPeriod ? fechaDelPeriodo(selectedPeriod).getFullYear() : anios[0];
  // La gráfica de barras de abajo es solo en córdobas (necesita una sola
  // escala numérica) — si el año tiene algo pagado en dólares, se muestra
  // aparte en totalUsdAnio, debajo de la gráfica.
  const totalesPorMes = Array.from({ length: 12 }, (_, mes) => {
    const delMes = (porAnio.get(anioSeleccionado)?.get(mes) ?? []).filter((p) => p.status === "APROBADA");
    return { mes, total: delMes.reduce((acc, p) => acc + netoDePeriodo(p), 0) };
  });
  const maxMes = Math.max(1, ...totalesPorMes.map((t) => t.total));
  const totalUsdAnio = Array.from((porAnio.get(anioSeleccionado) ?? new Map()).values())
    .flat()
    .filter((p) => p.status === "APROBADA")
    .reduce((acc, p) => acc + netoUsdDePeriodo(p), 0);

  // Mensaje de WhatsApp listo para copiar y pegar, armado alrededor del
  // mismo enlace de aprobación/confirmación (generarEnlaceAprobacion en
  // actions.ts). Antes de que el negocio apruebe en el sistema, pide la
  // aprobación del cliente; una vez APROBADA, es solo un aviso de
  // confirmación con el total — en ambos casos el enlace público
  // (/aprobar/[token]) ya muestra nada más el total y la cantidad de
  // colaboradores, sin nombres ni datos sensibles.
  const mensajeEnlace: string | null =
    selectedPeriod && selectedPeriod.clientApprovalToken
      ? selectedPeriod.status === "BORRADOR"
        ? mensajeSolicitudAprobacion({
            empresa: company?.name ?? "tu negocio",
            label: selectedPeriod.label,
            tipo: selectedPeriod.tipo,
            token: selectedPeriod.clientApprovalToken,
          })
        : mensajeConfirmacionAprobada({
            empresa: company?.name ?? "tu negocio",
            label: selectedPeriod.label,
            tipo: selectedPeriod.tipo,
            token: selectedPeriod.clientApprovalToken,
            totalTexto: netoTextoDePeriodo(selectedPeriod),
            colaboradores: selectedPeriod.payslips.length,
          })
      : null;

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

      {searchParams.correoOk && (
        <div className="bg-emerald/10 border border-emerald rounded-lg p-3 mb-6 text-sm">
          Se envió el PDF por correo a <strong>{searchParams.correoOk}</strong>.
        </div>
      )}
      {searchParams.correoError && (
        <div className="bg-lava/10 border border-lava rounded-lg p-3 mb-6 text-sm">{searchParams.correoError}</div>
      )}
      {searchParams.avisoGuardado && (
        <div className="bg-emerald/10 border border-emerald rounded-lg p-3 mb-6 text-sm">
          Guardado. Los próximos avisos de aprobación de tus clientes llegarán ahí.
        </div>
      )}

      <details className="border border-line rounded-xl px-4 py-3 mb-6 group">
        <summary className="cursor-pointer text-sm text-inkdim hover:text-gold transition list-none flex items-center gap-2">
          <span className="text-inkfaint text-xs group-open:rotate-90 transition-transform">▸</span>
          ¿A qué correo quieres que te avisen cuando tu cliente apruebe?
        </summary>
        <form
          action={actualizarCorreoAvisoAprobacion}
          className="mt-4 flex flex-wrap gap-3 items-end"
        >
          <input type="hidden" name="periodId" value={selectedPeriod?.id ?? ""} />
          <div className="flex-1 min-w-[260px]">
            <label className="block text-xs text-inkdim mb-1.5">
              Correo(s) para avisos de aprobación — separados por coma si son varios
            </label>
            <input
              name="avisoAprobacionEmail"
              type="text"
              defaultValue={company?.avisoAprobacionEmail ?? ""}
              placeholder="tucorreo@negocio.com, otra-persona@negocio.com"
              className="w-full bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm"
            />
          </div>
          <SubmitButton className="px-4 py-2.5 rounded-lg bg-gold text-[#1b1500] text-sm font-medium" pendingText="Guardando…">
            Guardar
          </SubmitButton>
        </form>
        <p className="text-inkfaint text-xs mt-3">
          Por defecto, el aviso le llega al correo con el que accedes a Ceiba. Si prefieres que llegue a otro correo
          (o a varios), dilo aquí. Déjalo vacío para volver al comportamiento por defecto.
        </p>
      </details>

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
            <Stat label="Neto pagado (histórico)" value={totalNetoHistorico} />
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
            {totalUsdAnio > 0 && (
              <p className="text-inkfaint text-[11px] mt-3">
                La gráfica es solo en córdobas — este año también se pagó {formatMonto(totalUsdAnio, "USD")} a
                colaboradores en dólares (no incluido arriba).
              </p>
            )}
          </div>

          <div className="space-y-2 mb-6">
            {anios.map((anio) => {
              const porMes = porAnio.get(anio)!;
              const meses = Array.from(porMes.keys()).sort((a, b) => b - a);
              const periodosDelAnio = meses.reduce((acc, m) => acc + porMes.get(m)!.length, 0);
              const netoDelAnio = formatTotalPorMoneda(
                meses.flatMap((m) =>
                  porMes
                    .get(m)!
                    .filter((p) => p.status === "APROBADA")
                    .flatMap((p) => p.payslips.map((ps) => ({ moneda: ps.moneda, monto: Number(ps.netPay) })))
                )
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
                      <span className="text-xs font-mono text-inkdim">{netoDelAnio} neto pagado</span>
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
                {selectedPeriod.label}
                {PERIODICIDAD_PERIODO_LABELS[selectedPeriod.periodicidad] && ` · ${PERIODICIDAD_PERIODO_LABELS[selectedPeriod.periodicidad]}`} ·{" "}
                {selectedPeriod.payslips.length} comprobantes ·{" "}
                <span className={selectedPeriod.status === "BORRADOR" ? "text-gold" : "text-emerald"}>
                  {selectedPeriod.status === "BORRADOR" ? "BORRADOR — pendiente de aprobación" : "APROBADA"}
                </span>
                {selectedPeriod.status === "BORRADOR" && selectedPeriod.clientApprovedAt && (
                  <>
                    {" "}
                    ·{" "}
                    <span className="text-emerald">
                      ✓ el cliente aprobó desde el enlace
                      {selectedPeriod.clientApprovalEmail ? ` (enviado a ${selectedPeriod.clientApprovalEmail})` : ""}
                    </span>
                  </>
                )}
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

            <details className="border border-line rounded-lg px-4 py-3 mb-5 group" open={!selectedPeriod.clientApprovalToken}>
              <summary className="cursor-pointer text-sm text-inkdim hover:text-gold transition list-none flex items-center gap-2">
                <span className="text-inkfaint text-xs group-open:rotate-90 transition-transform">▸</span>
                {selectedPeriod.status === "BORRADOR" ? "Mensaje de aprobación (WhatsApp)" : "Mensaje de confirmación (WhatsApp)"}
              </summary>
              <div className="mt-4">
                {selectedPeriod.clientApprovalToken && mensajeEnlace ? (
                  <>
                    <p className="text-inkfaint text-xs mb-2">
                      {selectedPeriod.status === "BORRADOR"
                        ? "Copia este mensaje y mándalo tú mismo por WhatsApp (o por donde quieras) — ya trae el enlace para que el cliente revise el resumen, descargue el PDF y apruebe sin iniciar sesión."
                        : "Ya quedó aprobada en el sistema. Copia este mensaje para avisarle al cliente por WhatsApp — solo lleva el total y la cantidad de colaboradores, sin nombres ni datos sensibles."}
                    </p>
                    <textarea
                      readOnly
                      rows={5}
                      value={mensajeEnlace}
                      className="w-full bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-xs font-mono text-inkdim resize-none mb-2.5"
                    />
                    <CopyLinkButton
                      text={mensajeEnlace}
                      label="Copiar mensaje"
                      className="px-4 py-2.5 rounded-lg bg-gold text-[#1b1500] text-sm font-medium whitespace-nowrap"
                    />
                  </>
                ) : (
                  <form action={generarEnlaceAprobacion}>
                    <input type="hidden" name="periodId" value={selectedPeriod.id} />
                    <SubmitButton
                      className="px-4 py-2.5 rounded-lg bg-gold text-[#1b1500] text-sm font-medium"
                      pendingText="Generando…"
                    >
                      Generar enlace
                    </SubmitButton>
                  </form>
                )}
              </div>
            </details>

            <div className="space-y-3">
              {selectedPeriod.payslips.map((ps) => {
                const provisiones =
                  Number(ps.provisionAguinaldo) + Number(ps.provisionVacaciones) + Number(ps.provisionIndemnizacion);
                return (
                  <details key={ps.id} className="border border-line rounded-lg px-4 py-3 group">
                    <summary className="flex justify-between items-center cursor-pointer list-none">
                      <div>
                        <div className="font-medium">
                          {ps.employee.fullName}
                          {ps.moneda === "USD" && <span className="text-gold text-[10px] font-mono ml-1.5">USD</span>}
                          {PERIODICIDAD_PAYSLIP_LABELS[ps.periodicidad] && (
                            <span className="text-inkdim text-[10px] font-mono ml-1.5 border border-linestrong rounded px-1 py-0.5">
                              {PERIODICIDAD_PAYSLIP_LABELS[ps.periodicidad]}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-inkfaint">{ps.employee.role}</div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-[10px] uppercase text-inkfaint font-mono">Neto</div>
                          <div className="font-mono">{money(Number(ps.netPay), ps.moneda)}</div>
                        </div>
                        <span className="text-inkfaint text-xs group-open:rotate-180 transition-transform">▾</span>
                      </div>
                    </summary>
                    {selectedPeriod.tipo === "AGUINALDO" ? (
                      <div className="mt-4 pt-4 border-t border-line grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm">
                        <Detalle label="Aguinaldo pagado (exento de INSS/IR)" value={money(Number(ps.grossSalary), ps.moneda)} />
                        <Detalle label="Neto pagado" value={money(Number(ps.netPay), ps.moneda)} bold />
                      </div>
                    ) : (
                      <div className="mt-4 pt-4 border-t border-line grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm">
                        {ps.moneda === "USD" && ps.tipoCambioAplicado && (
                          <Detalle label="Tipo de cambio aplicado" value={`C$ ${Number(ps.tipoCambioAplicado).toFixed(4)} por US$1`} />
                        )}
                        <Detalle label="Salario bruto" value={money(Number(ps.grossSalary), ps.moneda)} />
                        <Detalle label="Horas extra" value={`${Number(ps.horasExtraCantidad)} h · ${money(Number(ps.horasExtraMonto), ps.moneda)}`} />
                        <Detalle label="Comisiones" value={money(Number(ps.comisiones), ps.moneda)} />
                        <Detalle label="Retroactivos" value={money(Number(ps.retroactivos), ps.moneda)} />
                        <Detalle label="Viáticos (no gravable)" value={money(Number(ps.viaticos), ps.moneda)} />
                        <Detalle label="INSS laboral (7%)" value={"− " + money(Number(ps.inssLaboral), ps.moneda)} />
                        <Detalle label="IR retenido" value={"− " + money(Number(ps.irMensual), ps.moneda)} />
                        {Number(ps.otrasDeducciones) > 0 && (
                          <Detalle
                            label={ps.otrasDeduccionesConcepto || "Otras deducciones"}
                            value={"− " + money(Number(ps.otrasDeducciones), ps.moneda)}
                          />
                        )}
                        <Detalle label="Neto a pagar" value={money(Number(ps.netPay), ps.moneda)} bold />
                        <Detalle label="Provisión aguinaldo" value={money(Number(ps.provisionAguinaldo), ps.moneda)} />
                        <Detalle label="Provisión vacaciones" value={money(Number(ps.provisionVacaciones), ps.moneda)} />
                        <Detalle label="Provisión indemnización" value={money(Number(ps.provisionIndemnizacion), ps.moneda)} />
                        <Detalle label="Total provisiones del mes" value={money(provisiones, ps.moneda)} bold />
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

function money(n: number, moneda?: string | null) {
  return formatMonto(n, moneda);
}

// Mismo criterio que obtenerOCrearEnlaceAprobacion() en actions.ts — arma la
// URL pública a partir del token ya guardado, para mostrarla/copiarla aquí.
function enlaceAprobacionDe(token: string): string {
  const base = (process.env.NEXTAUTH_URL || "").replace(/\/+$/, "");
  return `${base}/aprobar/${token}`;
}

// Mensaje para pedirle la aprobación al cliente — se muestra mientras el
// período sigue BORRADOR, listo para copiar y pegar en WhatsApp.
// Cierre corporativo genérico, igual en los dos mensajes — no identifica a
// ningún negocio en particular porque Ceiba lo usan distintas empresas.
const CIERRE_CORPORATIVO = "Quedamos atentos a cualquier consulta. Saludos cordiales.";

function mensajeSolicitudAprobacion(p: { empresa: string; label: string; tipo: string; token: string }): string {
  const que = p.tipo === "AGUINALDO" ? "la nómina de aguinaldo" : "la nómina";
  return `Buen día. Se comparte ${que} del período ${p.label} de ${p.empresa} para su aprobación. Favor aprobar en el siguiente enlace: ${enlaceAprobacionDe(
    p.token
  )}\n\n${CIERRE_CORPORATIVO}`;
}

// Mensaje de confirmación una vez que el período ya quedó APROBADA en el
// sistema — lleva solo el total y la cantidad de colaboradores (sin
// nombres, cédulas ni cuentas bancarias), listo para copiar y pegar en
// WhatsApp.
function mensajeConfirmacionAprobada(p: {
  empresa: string;
  label: string;
  tipo: string;
  token: string;
  totalTexto: string;
  colaboradores: number;
}): string {
  const que = p.tipo === "AGUINALDO" ? "la nómina de aguinaldo" : "la nómina";
  const plural = p.colaboradores === 1 ? "" : "es";
  return `Buen día. Gracias por su confirmación. Se comparte ${que} aprobada del período ${p.label} de ${
    p.empresa
  }. Total a pagar: ${p.totalTexto} a ${p.colaboradores} colaborador${plural}. Puede verla aquí: ${enlaceAprobacionDe(
    p.token
  )}\n\n${CIERRE_CORPORATIVO}`;
}
