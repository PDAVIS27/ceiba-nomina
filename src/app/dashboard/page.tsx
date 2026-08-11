import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcularIR, costoPatronalMensual, inssPatronalRate } from "@/lib/payroll";
import { redirect } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

async function addEmployee(formData: FormData) {
  "use server";
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId;
  if (!companyId) return;
  const fullName = String(formData.get("fullName") || "").trim();
  const role = String(formData.get("role") || "").trim();
  const grossSalary = Number(formData.get("grossSalary") || 0);
  if (!fullName || !role || grossSalary <= 0) return;
  await prisma.employee.create({
    data: { companyId, fullName, role, grossSalary },
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

  await prisma.payslip.createMany({
    data: employees.map((e) => {
      const d = calcularIR(Number(e.grossSalary));
      return {
        periodId: period.id,
        employeeId: e.id,
        grossSalary: d.bruto,
        inssLaboral: d.inssLaboral,
        irMensual: d.irMensual,
        netPay: d.neto,
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

  const totalBruto = employees.reduce((a, e) => a + Number(e.grossSalary), 0);
  const rows = employees.map((e) => ({ e, d: calcularIR(Number(e.grossSalary)) }));
  const totalDeducciones = rows.reduce((a, r) => a + r.d.inssLaboral + r.d.irMensual, 0);
  const totalNeto = rows.reduce((a, r) => a + r.d.neto, 0);
  const costoPatronal = costoPatronalMensual(totalBruto, employees.length);
  const tasaPatronal = inssPatronalRate(employees.length);

  return (
    <main className="min-h-screen bg-bg text-ink px-6 py-10 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">{company?.name ?? "Tu negocio"}</h1>
          <div className="text-inkfaint text-xs font-mono mt-1">
            {employees.length} colaboradores activos
          </div>
        </div>
        <SignOutButton />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat label="Planilla bruta" value={money(totalBruto)} />
        <Stat label="Deducciones de ley" value={money(totalDeducciones)} accent="emerald" />
        <Stat label="Costo patronal" value={money(costoPatronal)} accent="gold" sub={`INSS ${(tasaPatronal*100).toFixed(1)}% + INATEC 2%`} />
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
                <td className="py-3 text-right font-mono">{money(d.neto)}</td>
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
          <button className="px-5 py-3 rounded-lg bg-emerald text-[#eafaf3] text-sm font-medium">Agregar</button>
        </form>
      </section>

      <section className="bg-panel border border-line rounded-xl p-6">
        <h3 className="font-serif text-lg font-semibold mb-4">Correr planilla</h3>
        <form action={runPayroll} className="flex flex-wrap gap-3 items-end mb-2">
          <Field name="label" label="Nombre del período" placeholder="16–31 jul 2026" />
          <button className="px-5 py-3 rounded-lg bg-gold text-[#1b1500] text-sm font-medium">
            Correr planilla ahora
          </button>
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
      <input name={name} type={type} required placeholder={placeholder}
        className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm" />
    </div>
  );
}

function money(n: number) {
  return "C$ " + n.toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
