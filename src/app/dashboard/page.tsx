import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcularPeriodo, costoPatronalMensual, inssPatronalRate } from "@/lib/payroll";
import { parsearExcelColaboradores } from "@/lib/bulkImport";
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

async function cargarPlanillaDesdeExcel(formData: FormData) {
  "use server";
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId;
  if (!companyId) return;

  const file = formData.get("file") as File | null;
  const label = String(formData.get("label") || "Período sin nombre");
  if (!file || file.size === 0) {
    redirect(`/dashboard?carga=error&msg=${encodeURIComponent("No seleccionaste ningún archivo.")}`);
  }

  const buffer = await file!.arrayBuffer();
  const { filas, errores } = parsearExcelColaboradores(buffer);

  if (filas.length === 0) {
    redirect(
      `/dashboard?carga=error&omitidos=${errores.length}&msg=${encodeURIComponent(
        errores[0] || "El archivo no tiene filas válidas."
      )}`
    );
  }

  const hoy = new Date();
  const employeeIds: string[] = [];

  for (const f of filas) {
    let empleado = null as null | { id: string; startDate: Date };

    // Primero intenta emparejar por código de colaborador (si el archivo lo trae).
    if (f.externalCode) {
      empleado = await prisma.employee.findUnique({
        where: { companyId_externalCode: { companyId, externalCode: f.externalCode } },
        select: { id: true, startDate: true },
      });
    }
    // Si no hay código o no coincide, intenta por nombre exacto dentro del negocio.
    if (!empleado) {
      empleado = await prisma.employee.findFirst({
        where: { companyId, fullName: { equals: f.fullName, mode: "insensitive" } },
        select: { id: true, startDate: true },
      });
    }

    if (empleado) {
      await prisma.employee.update({
        where: { id: empleado.id },
        data: {
          fullName: f.fullName,
          role: f.role,
          grossSalary: f.grossSalary,
          externalCode: f.externalCode ?? undefined,
          ...(f.startDate ? { startDate: f.startDate } : {}),
        },
      });
      employeeIds.push(empleado.id);
    } else {
      const nuevo = await prisma.employee.create({
        data: {
          companyId,
          externalCode: f.externalCode,
          fullName: f.fullName,
          role: f.role,
          grossSalary: f.grossSalary,
          startDate: f.startDate ?? hoy,
        },
      });
      empleado = { id: nuevo.id, startDate: nuevo.startDate };
      employeeIds.push(nuevo.id);
    }

    (f as any)._employeeId = empleado.id;
    (f as any)._startDate = empleado.startDate;
  }

  const period = await prisma.payrollPeriod.create({ data: { companyId, label } });

  await prisma.payslip.createMany({
    data: filas.map((f: any) => {
      const antiguedadMeses = mesesEntre(new Date(f._startDate), hoy);
      const d = calcularPeriodo({
        bruto: f.grossSalary,
        horasExtraCantidad: f.horasExtraCantidad,
        comisiones: 0,
        retroactivos: f.retroactivos,
        viaticos: f.viaticos,
        antiguedadMeses,
      });
      return {
        periodId: period.id,
        employeeId: f._employeeId,
        grossSalary: d.bruto,
        horasExtraCantidad: d.horasExtraCantidad,
        horasExtraMonto: d.horasExtraMonto,
        comisiones: d.comisiones,
        retroactivos: d.retroactivos,
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

  const params = new URLSearchParams();
  params.set("periodo", period.id);
  params.set("carga", "ok");
  params.set("agregados", String(filas.length));
  params.set("omitidos", String(errores.length));
  redirect(`/dashboard?${params.toString()}`);
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
      const retroactivos = Number(formData.get(`retro_${e.id}`) || 0);
      const viaticos = Number(formData.get(`via_${e.id}`) || 0);
      const antiguedadMeses = mesesEntre(new Date(e.startDate), hoy);

      const d = calcularPeriodo({
        bruto: Number(e.grossSalary),
        horasExtraCantidad,
        comisiones,
        retroactivos,
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
        retroactivos: d.retroactivos,
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

async function aprobarPlanilla(formData: FormData) {
  "use server";
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId;
  if (!companyId) return;
  const periodId = String(formData.get("periodId") || "");
  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period || period.companyId !== companyId || period.status === "APROBADA") return;
  await prisma.payrollPeriod.update({
    where: { id: periodId },
    data: { status: "APROBADA", approvedAt: new Date() },
  });
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { periodo?: string; carga?: string; agregados?: string; omitidos?: string; msg?: string };
}) {
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId;
  if (!companyId) redirect("/login");

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const employees = await prisma.employee.findMany({
    where: { companyId, active: true },
    orderBy: { createdAt: "asc" },
  });
  const periods = await prisma.payrollPeriod.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    include: { payslips: { include: { employee: true }, orderBy: { createdAt: "asc" } } },
  });
  const selectedPeriod = searchParams.periodo
    ? periods.find((p) => p.id === searchParams.periodo) ?? periods[0]
    : periods[0];

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

      <section className="bg-panel border border-line rounded-xl p-6 mb-6">
        <h3 className="font-serif text-lg font-semibold mb-2">Cargar planilla desde Excel</h3>
        <p className="text-inkdim text-sm mb-4">
          Sube el archivo con código, nombre, departamento, salario, horas extra, viáticos y retroactivos —
          la plataforma crea a quien no exista, actualiza a quien ya exista (por código o nombre), y genera
          la preplanilla del período de una sola vez.
        </p>

        {searchParams.carga === "ok" && (
          <div className="bg-emerald/10 border border-emerald rounded-lg p-3 mb-4 text-sm">
            Se procesaron <strong>{searchParams.agregados}</strong> colaboradores y se generó la preplanilla.
            {Number(searchParams.omitidos) > 0 && (
              <> Se omitieron {searchParams.omitidos} filas por datos incompletos.</>
            )}
          </div>
        )}
        {searchParams.carga === "error" && (
          <div className="bg-lava/10 border border-lava rounded-lg p-3 mb-4 text-sm">
            {searchParams.msg || "No se agregó ningún colaborador — revisa que el archivo use las columnas de la plantilla."}
          </div>
        )}

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
        <h3 className="font-serif text-lg font-semibold mb-4">Generar preplanilla</h3>
        <p className="text-inkdim text-sm mb-4">
          Esto crea un borrador para revisión — todavía no es la planilla final. Descarga el PDF, mándaselo al cliente, y cuando lo apruebe, márcalo como aprobada abajo.
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

          <SubmitButton className="px-5 py-3 rounded-lg bg-gold text-[#1b1500] text-sm font-medium" pendingText="Calculando…">
            Generar preplanilla (borrador)
          </SubmitButton>
        </form>
      </section>

      {periods.length > 0 && selectedPeriod && (
        <section className="bg-panel border border-line rounded-xl p-6 mt-6">
          <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
            <h3 className="font-serif text-lg font-semibold">Comprobantes generados</h3>
            {periods.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {periods.map((p) => (
                  <a
                    key={p.id}
                    href={`/dashboard?periodo=${p.id}`}
                    className={`px-3 py-1.5 rounded-full text-xs font-mono border ${
                      p.id === selectedPeriod.id
                        ? "bg-gold text-[#1b1500] border-gold"
                        : "border-linestrong text-inkdim"
                    }`}
                  >
                    {p.label}
                  </a>
                ))}
              </div>
            )}
          </div>

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
                <form action={aprobarPlanilla}>
                  <input type="hidden" name="periodId" value={selectedPeriod.id} />
                  <SubmitButton className="px-4 py-2 rounded-lg bg-emerald text-[#eafaf3] text-xs font-medium" pendingText="Aprobando…">
                    Marcar como aprobada
                  </SubmitButton>
                </form>
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
                </details>
              );
            })}
          </div>
        </section>
      )}
    </main>
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
