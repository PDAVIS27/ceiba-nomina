import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { balanceProvisiones, TERMINATION_LABELS } from "@/lib/provisiones";
import { mesesEntre } from "@/lib/dateUtils";
import Link from "next/link";
import SubmitButton from "@/components/SubmitButton";
import {
  pagarAguinaldo,
  registrarVacacionesTomadas,
  darDeBaja,
  reingresarColaborador,
} from "@/app/dashboard/actions";

export const dynamic = "force-dynamic";

const MENSAJES_OK: Record<string, string> = {
  aguinaldo: "Se registró el pago de aguinaldo.",
  vacaciones: "Se registraron los días de vacaciones tomados.",
  baja: "Se dio de baja al colaborador y se calculó su liquidación.",
  reingreso: "Se reingresó al colaborador.",
};

export default async function ColaboradorDetallePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string; error?: string };
}) {
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId as string;

  const employee = await prisma.employee.findUnique({ where: { id: params.id } });
  if (!employee || employee.companyId !== companyId) {
    return (
      <div>
        <p className="text-inkfaint text-sm">No encontré ese colaborador.</p>
        <Link href="/dashboard/colaboradores" className="text-gold text-sm">← Volver a Colaboradores</Link>
      </div>
    );
  }

  const hoy = new Date();
  const fechaCorte = employee.terminatedAt ? new Date(employee.terminatedAt) : hoy;

  const [balance, payslips, movimientos, liquidacion] = await Promise.all([
    balanceProvisiones(employee.id, fechaCorte),
    prisma.payslip.findMany({
      where: { employeeId: employee.id, period: { status: "APROBADA" } },
      include: { period: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.provisionMovement.findMany({ where: { employeeId: employee.id }, orderBy: { fecha: "desc" } }),
    prisma.liquidacion.findUnique({ where: { employeeId: employee.id } }),
  ]);

  const antiguedadMeses = mesesEntre(new Date(employee.startDate), fechaCorte);

  return (
    <div>
      <Link href="/dashboard/colaboradores" className="text-inkfaint text-xs hover:text-gold transition">← Colaboradores</Link>

      <div className="flex justify-between items-start flex-wrap gap-3 mt-3 mb-8">
        <div>
          <h1 className="font-serif text-3xl font-semibold">{employee.fullName}</h1>
          <div className="text-inkfaint text-sm mt-1">
            {employee.role} {employee.externalCode && `· ${employee.externalCode}`} · {antiguedadMeses} meses de antigüedad
          </div>
        </div>
        {employee.active ? (
          <span className="text-xs font-mono px-3 py-1.5 rounded-full bg-emerald/10 text-emerald border border-emerald">ACTIVO</span>
        ) : (
          <span className="text-xs font-mono px-3 py-1.5 rounded-full bg-lava/10 text-lava border border-lava">
            BAJA — {employee.terminatedAt && new Date(employee.terminatedAt).toLocaleDateString("es-NI")}
          </span>
        )}
      </div>

      {searchParams.ok && MENSAJES_OK[searchParams.ok] && (
        <div className="bg-emerald/10 border border-emerald rounded-lg p-3 mb-6 text-sm">{MENSAJES_OK[searchParams.ok]}</div>
      )}
      {searchParams.error && (
        <div className="bg-lava/10 border border-lava rounded-lg p-3 mb-6 text-sm">{searchParams.error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <ProvStat
          label="Aguinaldo"
          saldo={balance.aguinaldoSaldo}
          acumulado={balance.aguinaldoAcumulado}
          movido={balance.aguinaldoPagado}
          movidoLabel="pagado"
        />
        <ProvStat
          label="Vacaciones"
          saldo={balance.vacacionesSaldo}
          acumulado={balance.vacacionesAcumulado}
          movido={balance.vacacionesTomado}
          movidoLabel="tomado"
        />
        <div className="bg-panel border border-line rounded-xl px-5 py-5">
          <div className="text-inkfaint text-[11px] uppercase font-mono tracking-wide">Indemnización acumulada</div>
          <div className="font-serif text-2xl font-semibold mt-2 text-gold">{money(balance.indemnizacionAcumulada)}</div>
          <div className="text-xs text-inkdim mt-1">Solo se paga si la baja es sin causa u otra causa ajena (Art. 45 CT)</div>
        </div>
      </div>

      {balance.diasProrrateados > 0 && (
        <div className="bg-panel/60 border border-line rounded-xl px-5 py-3 mb-8 text-xs text-inkdim">
          Los montos de arriba incluyen <span className="text-ink font-mono">{balance.diasProrrateados} día{balance.diasProrrateados === 1 ? "" : "s"}</span>{" "}
          prorrateados{"  "}
          ({employee.terminatedAt ? "hasta su fecha de baja" : "hasta hoy"}) que todavía no están cubiertos por ninguna
          planilla aprobada — se calculan con la convención de 30 días por mes, igual que el resto de la nómina.
        </div>
      )}

      <section className="bg-panel border border-line rounded-xl p-6 mb-6">
        <h3 className="font-serif text-lg font-semibold mb-4">Histórico de provisiones por período</h3>
        {payslips.length === 0 && (
          <p className="text-inkfaint text-sm">
            Todavía no hay planillas aprobadas para este colaborador — las provisiones se acumulan cada vez que
            apruebas un período en <Link href="/dashboard/historicos" className="text-gold">Históricos</Link>.
          </p>
        )}
        {payslips.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-inkfaint text-xs uppercase font-mono text-left border-b border-linestrong">
                <th className="pb-2">Período</th>
                <th className="pb-2 text-right">Aguinaldo</th>
                <th className="pb-2 text-right">Vacaciones</th>
                <th className="pb-2 text-right">Indemnización</th>
              </tr>
            </thead>
            <tbody>
              {payslips.map((ps) => (
                <tr key={ps.id} className="border-b border-line">
                  <td className="py-2.5">{ps.period.label}</td>
                  <td className="py-2.5 text-right font-mono">{money(Number(ps.provisionAguinaldo))}</td>
                  <td className="py-2.5 text-right font-mono">{money(Number(ps.provisionVacaciones))}</td>
                  <td className="py-2.5 text-right font-mono">{money(Number(ps.provisionIndemnizacion))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {movimientos.length > 0 && (
        <section className="bg-panel border border-line rounded-xl p-6 mb-6">
          <h3 className="font-serif text-lg font-semibold mb-4">Pagos y vacaciones tomadas</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-inkfaint text-xs uppercase font-mono text-left border-b border-linestrong">
                <th className="pb-2">Fecha</th>
                <th className="pb-2">Tipo</th>
                <th className="pb-2 text-right">Monto</th>
                <th className="pb-2">Nota</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id} className="border-b border-line">
                  <td className="py-2.5 text-xs font-mono text-inkfaint">{new Date(m.fecha).toLocaleDateString("es-NI")}</td>
                  <td className="py-2.5">
                    {m.tipo === "AGUINALDO" ? "Aguinaldo pagado" : `Vacaciones tomadas${m.dias ? ` (${Number(m.dias)} días)` : ""}`}
                  </td>
                  <td className="py-2.5 text-right font-mono">{money(Number(m.amount))}</td>
                  <td className="py-2.5 text-xs text-inkdim">{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {employee.active && (
        <>
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <section className="bg-panel border border-line rounded-xl p-6">
              <h3 className="font-serif text-lg font-semibold mb-3">Registrar pago de aguinaldo</h3>
              <p className="text-inkdim text-sm mb-4">Normalmente se paga en diciembre. Esto reduce el saldo acumulado.</p>
              <form action={pagarAguinaldo} className="flex flex-wrap gap-3 items-end">
                <input type="hidden" name="employeeId" value={employee.id} />
                <div>
                  <label className="block text-xs text-inkdim mb-1.5">Monto pagado (C$)</label>
                  <input name="amount" type="number" min="0" step="0.01" defaultValue={balance.aguinaldoSaldo}
                    className="w-36 bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-inkdim mb-1.5">Nota (opcional)</label>
                  <input name="note" placeholder="Ej. Aguinaldo dic 2026"
                    className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm" />
                </div>
                <SubmitButton className="px-4 py-2.5 rounded-lg bg-emerald text-[#eafaf3] text-sm font-medium" pendingText="Guardando…">
                  Registrar pago
                </SubmitButton>
              </form>
            </section>

            <section className="bg-panel border border-line rounded-xl p-6">
              <h3 className="font-serif text-lg font-semibold mb-3">Registrar vacaciones tomadas</h3>
              <p className="text-inkdim text-sm mb-4">El monto se calcula con el salario actual (salario ÷ 30 × días).</p>
              <form action={registrarVacacionesTomadas} className="flex flex-wrap gap-3 items-end">
                <input type="hidden" name="employeeId" value={employee.id} />
                <div>
                  <label className="block text-xs text-inkdim mb-1.5">Días tomados</label>
                  <input name="dias" type="number" min="0" step="0.5" placeholder="6"
                    className="w-28 bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-inkdim mb-1.5">Nota (opcional)</label>
                  <input name="note" placeholder="Ej. Semana santa"
                    className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm" />
                </div>
                <SubmitButton className="px-4 py-2.5 rounded-lg bg-emerald text-[#eafaf3] text-sm font-medium" pendingText="Guardando…">
                  Registrar
                </SubmitButton>
              </form>
            </section>
          </div>

          <section className="bg-panel border border-lava/40 rounded-xl p-6">
            <h3 className="font-serif text-lg font-semibold mb-1 text-lava">Dar de baja</h3>
            <p className="text-inkdim text-sm mb-4">
              Esto marca al colaborador como inactivo y calcula su liquidación final (aguinaldo y vacaciones
              pendientes, más indemnización por antigüedad si el tipo de baja corresponde). No es reversible desde
              aquí sin usar "Reingresar" — hazlo con calma.
            </p>
            <form action={darDeBaja} className="flex flex-wrap gap-3 items-end">
              <input type="hidden" name="employeeId" value={employee.id} />
              <div>
                <label className="block text-xs text-inkdim mb-1.5">Fecha de baja</label>
                <input name="terminatedAt" type="date" defaultValue={hoy.toISOString().slice(0, 10)}
                  className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-inkdim mb-1.5">Tipo de baja</label>
                <select name="terminationType" required className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm w-72">
                  {Object.entries(TERMINATION_LABELS).map(([key, v]) => (
                    <option key={key} value={key}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-inkdim mb-1.5">Nota (opcional)</label>
                <input name="note" placeholder="Detalle del caso"
                  className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm" />
              </div>

              <div className="w-full border-t border-line pt-3 mt-1">
                <p className="text-xs text-inkfaint mb-3">
                  Salario que se le debe y todavía no se le ha pagado (una quincena que no se alcanzó a planillar,
                  un mes adicional, etc.) — opcional. Se le calcula INSS e IR igual que a cualquier salario.
                </p>
              </div>
              <div>
                <label className="block text-xs text-inkdim mb-1.5">Concepto del pago pendiente</label>
                <input name="pagoPendienteConcepto" placeholder='Ej. "Quincena 1-15 sept" o "Mes adicional"'
                  className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm w-64" />
              </div>
              <div>
                <label className="block text-xs text-inkdim mb-1.5">Monto bruto pendiente (C$)</label>
                <input name="pagoPendienteBruto" type="number" min="0" step="0.01" defaultValue="0"
                  className="w-36 bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm" />
              </div>

              <SubmitButton className="px-5 py-3 rounded-lg bg-lava text-white text-sm font-medium" pendingText="Calculando…">
                Dar de baja y calcular liquidación
              </SubmitButton>
            </form>
          </section>
        </>
      )}

      {!employee.active && liquidacion && (
        <section className="bg-panel border border-line rounded-xl p-6">
          <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
            <h3 className="font-serif text-lg font-semibold">Liquidación final</h3>
            <div className="flex gap-2">
              <a
                href={`/api/liquidacion/${employee.id}`}
                className="px-4 py-2 rounded-lg border border-linestrong text-xs text-inkdim hover:border-gold hover:text-gold transition"
              >
                Descargar liquidación (PDF)
              </a>
              <form action={reingresarColaborador}>
                <input type="hidden" name="employeeId" value={employee.id} />
                <SubmitButton className="px-4 py-2 rounded-lg border border-linestrong text-xs text-inkdim hover:border-gold hover:text-gold transition" pendingText="Reingresando…">
                  Reingresar
                </SubmitButton>
              </form>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3 text-sm mb-4">
            <Detalle label="Tipo de baja" value={TERMINATION_LABELS[liquidacion.terminationType as keyof typeof TERMINATION_LABELS]?.label ?? liquidacion.terminationType} />
            <Detalle label="Fecha de baja" value={new Date(liquidacion.terminatedAt).toLocaleDateString("es-NI")} />
            <Detalle label="Antigüedad" value={`${liquidacion.antiguedadMeses} meses`} />
            <Detalle label="Aguinaldo pendiente" value={money(Number(liquidacion.aguinaldoPendiente))} />
            <Detalle label="Vacaciones pendientes" value={money(Number(liquidacion.vacacionesPendientes))} />
            <Detalle
              label="Indemnización"
              value={liquidacion.aplicaIndemnizacion ? money(Number(liquidacion.indemnizacion)) : "No aplica"}
            />
          </div>

          {Number(liquidacion.pagoPendienteBruto) > 0 && (
            <div className="border-t border-line pt-4 mb-4">
              <div className="text-xs text-inkfaint uppercase font-mono mb-2">
                Pago pendiente{liquidacion.pagoPendienteConcepto && ` — ${liquidacion.pagoPendienteConcepto}`}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2 text-sm">
                <Detalle label="Bruto" value={money(Number(liquidacion.pagoPendienteBruto))} />
                <Detalle label="INSS laboral (7%)" value={"− " + money(Number(liquidacion.pagoPendienteInss))} />
                <Detalle label="IR retenido" value={"− " + money(Number(liquidacion.pagoPendienteIr))} />
                <Detalle label="Neto pendiente" value={money(Number(liquidacion.pagoPendienteNeto))} />
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-line flex justify-between items-center">
            <span className="text-sm text-inkdim">Total a liquidar</span>
            <span className="font-serif text-2xl font-semibold">{money(Number(liquidacion.total))}</span>
          </div>
          {liquidacion.note && <p className="text-inkfaint text-xs mt-3">Nota: {liquidacion.note}</p>}
        </section>
      )}
    </div>
  );
}

function ProvStat({
  label,
  saldo,
  acumulado,
  movido,
  movidoLabel,
}: {
  label: string;
  saldo: number;
  acumulado: number;
  movido: number;
  movidoLabel: string;
}) {
  return (
    <div className="bg-panel border border-line rounded-xl px-5 py-5">
      <div className="text-inkfaint text-[11px] uppercase font-mono tracking-wide">{label} — saldo</div>
      <div className="font-serif text-2xl font-semibold mt-2 text-emerald">{money(saldo)}</div>
      <div className="text-xs text-inkdim mt-1">
        {money(acumulado)} acumulado · {money(movido)} {movidoLabel}
      </div>
    </div>
  );
}

function Detalle({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-inkfaint text-[11px] uppercase font-mono">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}

function money(n: number) {
  return "C$ " + n.toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
