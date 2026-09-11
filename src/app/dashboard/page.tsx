import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcularPeriodo, costoPatronalMensual, inssPatronalRate, INATEC } from "@/lib/payroll";
import { mesesEntre } from "@/lib/dateUtils";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function InicioPage() {
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId as string;

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const employees = await prisma.employee.findMany({ where: { companyId, active: true } });
  const ultimoBorrador = await prisma.payrollPeriod.findFirst({
    where: { companyId, status: "BORRADOR" },
    orderBy: { createdAt: "desc" },
  });

  const hoy = new Date();
  const totalBruto = employees.reduce((a, e) => a + Number(e.grossSalary), 0);
  const rows = employees.map((e) =>
    calcularPeriodo({ bruto: Number(e.grossSalary), antiguedadMeses: mesesEntre(new Date(e.startDate), hoy) })
  );
  const totalDeducciones = rows.reduce((a, d) => a + d.inssLaboral + d.irMensual, 0);
  const totalNeto = rows.reduce((a, d) => a + d.netoPagar, 0);
  const totalProvisiones = rows.reduce(
    (a, d) => a + d.provisionAguinaldo + d.provisionVacaciones + d.provisionIndemnizacion,
    0
  );
  const costoPatronal = costoPatronalMensual(totalBruto, employees.length);
  const tasaPatronal = inssPatronalRate(employees.length);

  // Lo que el negocio debe remitir el mes que viene, según su planilla activa
  // actual: INSS patronal (aporte del empleador) + INSS laboral (retenido a
  // colaboradores) — ambos se pagan juntos a la INSS — más INATEC (Ley 90,
  // también vía INSS), y por separado el IR retenido, que se declara y paga
  // a la DGI.
  const inssPatronalMonto = round2(totalBruto * tasaPatronal);
  const inatecMonto = round2(totalBruto * INATEC);
  const inssLaboralTotal = round2(rows.reduce((a, d) => a + d.inssLaboral, 0));
  const irTotal = round2(rows.reduce((a, d) => a + d.irMensual, 0));
  const totalInss = round2(inssPatronalMonto + inssLaboralTotal + inatecMonto);

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold mb-1">{company?.name ?? "Tu negocio"}</h1>
      <div className="text-inkfaint text-xs font-mono mb-8">{employees.length} colaboradores activos</div>

      {ultimoBorrador && (
        <div className="bg-gold/10 border border-gold rounded-xl p-4 mb-8 flex justify-between items-center flex-wrap gap-3">
          <div className="text-sm">
            Tienes un borrador pendiente de aprobación: <strong>{ultimoBorrador.label}</strong>
          </div>
          <Link
            href={`/dashboard/historicos?periodo=${ultimoBorrador.id}`}
            className="px-4 py-2 rounded-lg bg-gold text-[#1b1500] text-xs font-medium"
          >
            Revisar y aprobar →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
        <Stat label="Planilla bruta" value={money(totalBruto)} />
        <Stat label="Deducciones de ley" value={money(totalDeducciones)} accent="emerald" />
        <Stat label="Costo patronal" value={money(costoPatronal)} accent="gold" sub={`INSS ${(tasaPatronal * 100).toFixed(1)}% + INATEC 2%`} />
        <Stat label="Provisiones laborales" value={money(totalProvisiones)} accent="gold" sub="Aguinaldo + vacaciones + antigüedad" />
        <Stat label="Neto a pagar" value={money(totalNeto)} />
      </div>

      {employees.length > 0 && (
        <div className="mb-10">
          <div className="flex items-baseline justify-between mb-3 flex-wrap gap-1">
            <h2 className="font-serif text-xl font-semibold">Lo que debes pagar el próximo mes</h2>
            <div className="text-inkfaint text-xs font-mono">Según tu planilla activa actual</div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-panel border border-line rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-line bg-emerald/10 flex justify-between items-center">
                <div className="font-serif font-semibold">INSS + INATEC</div>
                <div className="text-inkfaint text-[10px] font-mono uppercase tracking-wide">A la INSS</div>
              </div>
              <div className="px-5 py-4">
                <RowPago label="INSS patronal" sub={`${(tasaPatronal * 100).toFixed(1)}% sobre planilla bruta`} value={money(inssPatronalMonto)} />
                <RowPago label="INSS laboral retenido" sub="7% retenido a colaboradores" value={money(inssLaboralTotal)} />
                <RowPago label="INATEC" sub="2% sobre planilla bruta (Ley 90)" value={money(inatecMonto)} />
                <div className="border-t border-line mt-3 pt-3 flex justify-between items-baseline">
                  <span className="text-sm font-medium">Total a la INSS</span>
                  <span className="font-serif text-lg font-semibold text-emerald">{money(totalInss)}</span>
                </div>
              </div>
            </div>
            <div className="bg-panel border border-line rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-line bg-gold/10 flex justify-between items-center">
                <div className="font-serif font-semibold">IR retenido</div>
                <div className="text-inkfaint text-[10px] font-mono uppercase tracking-wide">A la DGI</div>
              </div>
              <div className="px-5 py-4">
                <RowPago label="IR mensual retenido" sub="Art. 23, Ley 822 — retenido a colaboradores" value={money(irTotal)} />
                <div className="border-t border-line mt-3 pt-3 flex justify-between items-baseline">
                  <span className="text-sm font-medium">Total a la DGI</span>
                  <span className="font-serif text-lg font-semibold text-gold">{money(irTotal)}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="text-inkfaint text-xs mt-3">
            Estimado según tus {employees.length} colaborador{employees.length === 1 ? "" : "es"} activo{employees.length === 1 ? "" : "s"} — confirma fechas límite y montos exactos con tu contador antes de pagar.
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Atajo href="/dashboard/nomina" titulo="Correr nómina" texto="Genera una preplanilla nueva, a mano o desde Excel." />
        <Atajo href="/dashboard/colaboradores" titulo="Colaboradores" texto="Agrega, revisa o actualiza a tu equipo." />
        <Atajo href="/dashboard/historicos" titulo="Históricos" texto="Revisa, aprueba y descarga planillas anteriores." />
        <Atajo href="/dashboard/reportar" titulo="Reportar un problema" texto="Avísale al proveedor de un caso que necesita revisión." />
      </div>
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

function RowPago({ label, sub, value }: { label: string; sub: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-4 py-1.5">
      <div>
        <div className="text-sm">{label}</div>
        <div className="text-inkfaint text-xs mt-0.5">{sub}</div>
      </div>
      <div className="font-mono text-sm shrink-0 tabular-nums">{value}</div>
    </div>
  );
}

function Atajo({ href, titulo, texto }: { href: string; titulo: string; texto: string }) {
  return (
    <Link href={href} className="bg-panel border border-line rounded-xl p-5 hover:border-gold transition block">
      <div className="font-serif text-lg font-semibold mb-1.5">{titulo} →</div>
      <div className="text-inkdim text-sm">{texto}</div>
    </Link>
  );
}

function money(n: number) {
  return "C$ " + n.toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
