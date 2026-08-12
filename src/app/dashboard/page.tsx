import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcularPeriodo, costoPatronalMensual, inssPatronalRate } from "@/lib/payroll";
import { redirect } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

function mesesEntre(desde: Date, hasta: Date): number {
  return Math.max(
    0,
    (hasta.getFullYear() - desde.getFullYear()) * 12 + (hasta.getMonth() - desde.getMonth())
  );
}

async function addEmployee(formData: FormData) {
  "use server";
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId;
  if (!companyId) return;
  const fullName = String(formData.get("fullName") || "").trim();
  const role = String(formData.get("role") || "").trim();
  const grossSalary = Number(formData.get("grossSalary") || 0);
  const startDateRaw = String(formData.get("startDate") || "");
  const startDate = startDateRaw ? new Date(startDateRaw) : new Date();
  if (!fullName || !role || grossSalary <= 0) return;
  await prisma.employee.create({
    data: { companyId, fullName, role, grossSalary, startDate },
  });
}

async function runPayroll(formData: FormData) {
  "use server";
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId;
  if (!companyId) return;

  const employees = await prisma.employee.findMany({
    where: { companyId, active: true },
  });
  if (employees.length === 0) return;

  const label = String(formData.get("label") || "Período sin nombre");
  const period = await prisma.payrollPeriod.create({
    data: { companyId, label },
  });

  const hoy = new Date();

  await prisma.payslip.createMany({
    data: employees.map((e) => {
      const horasExtraCantidad = Number(formData.get(`horas_${e.id}`) || 0);
      const comisiones = Number(formData.get(`com_${e.id}`) || 0);
      const viaticos = Number(formData.get(`via_${e.id}`) || 0);
      const antiguedadMeses = mesesEntre(new Date(e.startDate), hoy);

      const d = calcularPeriodo({
        bruto: Number(e.grossSalary),
        horasExtraCantidad,
        comisiones,
        viaticos,
        antiguedadMeses,
      });

      return {
        periodId: period.id,
        employeeId: e.id,
        grossSalary: d.bruto,
        horasExtraCantidad: d.horasExtraCantidad,
        horasExtraMonto: d.horasExtraMonto,
        comisiones: d.comisiones,
        viaticos: d.viaticos,
        provisionAguinaldo: d.provisionAguinaldo,
        provisionVacaciones: d.provisionVacaciones,
        provisionIndemnizacion: d.provisionIndemnizacion,
        inssLaboral: d.inssLaboral,
        irMensual: d.irMensual,
        netPay: d.netoPagar,
      };
    }),
  });
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId;
  if (!companyId) redirect("/login");

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const employees = await prisma.employee.findMany({
    where: { companyId, active: true },
    orderBy: { createdAt: "asc" },
  });
  const lastPeriod = await prisma.payrollPeriod.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    include: { payslips: { include: { employee: true } } },
  });

  const hoy = new Date();
  const totalBruto = employees.reduce((a, e) => a + Number(e.grossSalary), 0);
  const rows = employees.map((e) => ({
    e,
    d: calcularPeriodo({
      bruto: Number(e.grossSalary),
      antiguedadMeses: mesesEntre(new Date(e.startDate), hoy),
    }),
  }));
  const totalDeducciones = rows.reduce((a, r) => a + r.d.inssLaboral + r.d.irMensual, 0);
  const totalNeto = rows.reduce((a, r) => a + r.d.netoPagar, 0);
  const totalProvisiones = rows.reduce(
    (a, r) => a + r.d.provisionAguinaldo + r.d.provisionVacaciones + r.d.provisionIndemnizacion,
    0
  );
  const costoPatronal = costoPatronalMensual(totalBruto, employees.length);
  const tasaPatronal = inssPatronalRate(employees.length);

  return (
    <main className="min-h-screen bg-bg text-ink px-6 py-10 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">{company?.name ?? "Tu negocio"}</h1>
          <div className="text-inkfaint text-xs font-mono mt-1">
            {employees.length} colaboradores activos
          </div>
        </div>
        <SignOutButton />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <Stat label="Planilla bruta" value={money(totalBruto)} />
        <Stat label="Deducciones de ley" value={money(totalDeducciones)} accent="emerald" />
        <Stat label="Costo patronal" value={money(costoPatronal)} accent="gold" sub={`INSS ${(tasaPatronal*100).toFixed(1)}% + INATEC 2%`} />
        <Stat label="Provisiones laborales" value={money(totalProvisiones)} accent="gold" sub="Aguinaldo + vacaciones + antigüedad" />
        <Stat label="Neto a pagar" value={money(totalNeto)} />
      </div>

      <section className="bg-panel border border-line rounded-xl p-6 mb-6">
        <h3 className="font-serif text-lg font-semibold mb-4">Colaboradores</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-inkfaint text-xs uppercase font-mono text-left border-b border-linestrong">
              <th className="pb-2">Colaborador</th>
              <th className="pb-2 text-right">Bruto</th>
              <th className="pb-2 text-right">INSS 7%</th>
              <th className="pb-2 text-right">IR</th>
              <th className="pb-2 text-right">Neto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, d }) => (
              <tr key={e.id} className="border-b border-line">
                <td className="py-3">
                  <div className="font-medium">{e.fullName}</div>
                  <div className="text-xs text-inkfaint">{e.role}</div>
                </td>
                <td className="py-3 text-right font-mono">{money(d.bruto)}</td>
                <td className="py-3 text-right font-mono">{money(d.inssLaboral)}</td>
                <td className="py-3 text-right font-mono">{money(d.irMensual)}</td>
                <td className="py-3 text-right font-mono">{money(d.netoPagar)}</td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-inkfaint">Todavía no agregas colaboradores.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="bg-panel border border-line rounded-xl p-6 mb-6">
        <h3 className="font-serif text-lg font-semibold mb-4">Agregar colaborador</h3>
        <form action={addEmployee} className="flex flex-wrap gap-3 items-end">
          <Field name="fullName" label="Nombre completo" placeholder="Ej. Ana Reyes" />
          <Field name="role" label="Puesto" placeholder="Ej. Cajera" />
          <Field name="grossSalary" label="Salario bruto (C$)" type="number" placeholder="9200" />
          <Field name="startDate" label="Fecha de ingreso" type="date" />
          <SubmitButton className="px-5 py-3 rounded-lg bg-emerald text-[#eafaf3] text-sm font-medium">
            Agregar
          </SubmitButton>
        </form>
      </section>

      <section className="bg-panel border border-line rounded-xl p-6">
        <h3 className="font-serif text-lg font-semibold mb-4">Correr planilla</h3>
        <p className="text-inkdim text-sm mb-4">
          Si algún colaborador tuvo horas extra, comisiones o viáticos este período, complétalos abajo antes de correr la planilla. Deja en blanco lo que no aplique.
        </p>
        <form action={runPayroll}>
          <div className="mb-4">
            <Field name="label" label="Nombre del período" placeholder="16–31 jul 2026" />
          </div>

          {employees.length > 0 && (
            <table className="w-full text-sm mb-5">
              <thead>
                <tr className="text-inkfaint text-xs uppercase font-mono text-left border-b border-linestrong">
                  <th className="pb-2">Colaborador</th>
                  <th className="pb-2 text-right">Horas extra</th>
                  <th className="pb-2 text-right">Comisiones (C$)</th>
                  <th className="pb-2 text-right">Viáticos (C$)</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className="border-b border-line">
                    <td className="py-2.5">{e.fullName}</td>
                    <td className="py-2.5 text-right">
                      <input name={`horas_${e.id}`} type="number" min="0" step="0.5" defaultValue="0"
                        className="w-24 bg-[#12181a] border border-linestrong rounded-lg px-2.5 py-1.5 text-sm text-right" />
                    </td>
                    <td className="py-2.5 text-right">
                      <input name={`com_${e.id}`} type="number" min="0" step="1" defaultValue="0"
                        className="w-28 bg-[#12181a] border border-linestrong rounded-lg px-2.5 py-1.5 text-sm text-right" />
                    </td>
                    <td className="py-2.5 text-right">
                      <input name={`via_${e.id}`} type="number" min="0" step="1" defaultValue="0"
                        className="w-28 bg-[#12181a] border border-linestrong rounded-lg px-2.5 py-1.5 text-sm text-right" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <SubmitButton className="px-5 py-3 rounded-lg bg-gold text-[#1b1500] text-sm font-medium" pendingText="Calculando…">
            Correr planilla ahora
          </SubmitButton>
        </form>
        {lastPeriod && (
          <div className="text-xs text-inkfaint mt-4">
            Último período generado: <span className="text-ink">{lastPeriod.label}</span> ·{" "}
            {lastPeriod.payslips.length} comprobantes creados.
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value, accent, sub }: { label: string; value: string; accent?: "emerald" | "gold"; sub?: string }) {
  const color = accent === "gold" ? "text-gold" : accent === "emerald" ? "text-emerald" : "text-ink";
  return (
    <div className="bg-panel border border-line rounded-xl px-5 py-5">
      <div className="text-inkfaint text-[11px] uppercase font-mono tracking-wide">{label}</div>
      <div className={`font-serif text-2xl font-semibold mt-2 ${color}`}>{value}</div>
      {sub && <div className="text-xs text-inkdim mt-1">{sub}</div>}
    </div>
  );
}

function Field({ name, label, placeholder, type = "text" }: { name: string; label: string; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="block text-xs text-inkdim mb-1.5">{label}</label>
      <input name={name} type={type} required={type !== "date"} placeholder={placeholder}
        className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm" />
    </div>
  );
}

function money(n: number) {
  return "C$ " + n.toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
