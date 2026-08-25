import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcularPeriodo } from "@/lib/payroll";
import { mesesEntre } from "@/lib/dateUtils";
import SubmitButton from "@/components/SubmitButton";
import { addEmployee } from "@/app/dashboard/actions";

export const dynamic = "force-dynamic";

export default async function ColaboradoresPage() {
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId as string;

  const employees = await prisma.employee.findMany({
    where: { companyId, active: true },
    orderBy: { createdAt: "asc" },
  });

  const hoy = new Date();
  const rows = employees.map((e) => ({
    e,
    d: calcularPeriodo({ bruto: Number(e.grossSalary), antiguedadMeses: mesesEntre(new Date(e.startDate), hoy) }),
  }));

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold mb-8">Colaboradores</h1>

      <section className="bg-panel border border-line rounded-xl p-6 mb-6">
        <h3 className="font-serif text-lg font-semibold mb-4">Agregar colaborador</h3>
        <form action={addEmployee} className="flex flex-wrap gap-3 items-end">
          <Field name="fullName" label="Nombre completo" placeholder="Ej. Ana Reyes" />
          <Field name="role" label="Puesto / Departamento" placeholder="Ej. Cajera" />
          <Field name="grossSalary" label="Salario bruto (C$)" type="number" placeholder="9200" />
          <Field name="startDate" label="Fecha de ingreso" type="date" />
          <SubmitButton className="px-5 py-3 rounded-lg bg-emerald text-[#eafaf3] text-sm font-medium">
            Agregar
          </SubmitButton>
        </form>
        <p className="text-inkfaint text-xs mt-3">
          ¿Muchos colaboradores a la vez? Súbelos desde Excel en <a href="/dashboard/nomina" className="text-gold">Correr nómina</a>.
        </p>
      </section>

      <section className="bg-panel border border-line rounded-xl p-6">
        <h3 className="font-serif text-lg font-semibold mb-4">Tu equipo</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-inkfaint text-xs uppercase font-mono text-left border-b border-linestrong">
              <th className="pb-2">Colaborador</th>
              <th className="pb-2 text-right">Bruto</th>
              <th className="pb-2 text-right">INSS 7%</th>
              <th className="pb-2 text-right">IR</th>
              <th className="pb-2 text-right">Neto</th>
              <th className="pb-2 text-right">Ingreso</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, d }) => (
              <tr key={e.id} className="border-b border-line">
                <td className="py-3">
                  <div className="font-medium">{e.fullName}</div>
                  <div className="text-xs text-inkfaint">
                    {e.role} {e.externalCode && `· ${e.externalCode}`}
                  </div>
                </td>
                <td className="py-3 text-right font-mono">{money(d.bruto)}</td>
                <td className="py-3 text-right font-mono">{money(d.inssLaboral)}</td>
                <td className="py-3 text-right font-mono">{money(d.irMensual)}</td>
                <td className="py-3 text-right font-mono">{money(d.netoPagar)}</td>
                <td className="py-3 text-right text-xs text-inkfaint font-mono">
                  {new Date(e.startDate).toLocaleDateString("es-NI")}
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-inkfaint">Todavía no agregas colaboradores.</td></tr>
            )}
          </tbody>
        </table>
      </section>
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
