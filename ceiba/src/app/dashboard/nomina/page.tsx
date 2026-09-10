import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SubmitButton from "@/components/SubmitButton";
import { runPayroll, cargarPlanillaDesdeExcel } from "@/app/dashboard/actions";

export const dynamic = "force-dynamic";

export default async function NominaPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId as string;

  const employees = await prisma.employee.findMany({
    where: { companyId, active: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold mb-8">Correr nómina</h1>

      {searchParams.error && (
        <div className="bg-lava/10 border border-lava rounded-lg p-3 mb-6 text-sm">{searchParams.error}</div>
      )}

      <section className="bg-panel border border-line rounded-xl p-6 mb-6">
        <h3 className="font-serif text-lg font-semibold mb-2">Cargar planilla desde Excel</h3>
        <p className="text-inkdim text-sm mb-4">
          Sube el archivo con código, nombre, departamento, salario, horas extra, viáticos y retroactivos —
          crea a quien no exista, actualiza a quien ya exista, y genera la preplanilla de una sola vez.
        </p>
        <div className="flex flex-wrap gap-3 items-end mb-3">
          <a
            href="/api/plantilla-colaboradores"
            className="px-4 py-2.5 rounded-lg border border-linestrong text-sm text-inkdim hover:border-gold hover:text-gold transition"
          >
            Descargar plantilla (.xlsx)
          </a>
        </div>
        <form action={cargarPlanillaDesdeExcel} className="flex flex-wrap gap-3 items-end">
          <Field name="label" label="Nombre del período" placeholder="16–31 jul 2026" />
          <FechaField name="periodStart" label="Fecha de inicio" />
          <FechaField name="periodEnd" label="Fecha de fin" />
          <div>
            <label className="block text-xs text-inkdim mb-1.5">Archivo (.xlsx)</label>
            <input
              name="file" type="file" accept=".xlsx,.xls" required
              className="text-sm text-inkdim file:mr-3 file:py-2.5 file:px-4 file:rounded-lg file:border file:border-linestrong file:bg-[#12181a] file:text-ink file:text-sm"
            />
          </div>
          <SubmitButton className="px-5 py-3 rounded-lg bg-gold text-[#1b1500] text-sm font-medium" pendingText="Procesando…">
            Cargar y generar preplanilla
          </SubmitButton>
        </form>
      </section>

      <section className="bg-panel border border-line rounded-xl p-6">
        <h3 className="font-serif text-lg font-semibold mb-2">Generar preplanilla a mano</h3>
        <p className="text-inkdim text-sm mb-4">
          Esto crea un borrador para revisión — todavía no es la final. Complétalo, descarga el PDF en
          Históricos, y cuando el cliente lo apruebe, márcalo como aprobado ahí mismo. La fecha de fin es
          importante: es lo que usa la plataforma para saber hasta qué día quedó cubierto cada colaborador en
          el histórico de provisiones (ver su detalle en Colaboradores).
        </p>
        <form action={runPayroll}>
          <div className="mb-4 flex flex-wrap gap-3 items-end">
            <Field name="label" label="Nombre del período" placeholder="16–31 jul 2026" />
            <FechaField name="periodStart" label="Fecha de inicio" />
            <FechaField name="periodEnd" label="Fecha de fin" />
          </div>

          {employees.length > 0 && (
            <table className="w-full text-sm mb-5">
              <thead>
                <tr className="text-inkfaint text-xs uppercase font-mono text-left border-b border-linestrong">
                  <th className="pb-2">Colaborador</th>
                  <th className="pb-2 text-right">Horas extra</th>
                  <th className="pb-2 text-right">Comisiones (C$)</th>
                  <th className="pb-2 text-right">Retroactivos (C$)</th>
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
                      <input name={`retro_${e.id}`} type="number" min="0" step="1" defaultValue="0"
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
          {employees.length === 0 && (
            <p className="text-inkfaint text-sm mb-5">Agrega al menos un colaborador antes de correr la planilla.</p>
          )}

          <SubmitButton className="px-5 py-3 rounded-lg bg-gold text-[#1b1500] text-sm font-medium" pendingText="Calculando…">
            Generar preplanilla (borrador)
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}

function Field({ name, label, placeholder }: { name: string; label: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-inkdim mb-1.5">{label}</label>
      <input name={name} type="text" required placeholder={placeholder}
        className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm" />
    </div>
  );
}

function FechaField({ name, label }: { name: string; label: string }) {
  return (
    <div>
      <label className="block text-xs text-inkdim mb-1.5">{label}</label>
      <input name={name} type="date" required
        className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm" />
    </div>
  );
}
