import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcularPeriodo } from "@/lib/payroll";
import { mesesEntre } from "@/lib/dateUtils";
import { esExentoIR } from "@/lib/regimenFiscal";
import { TERMINATION_LABELS } from "@/lib/provisiones";
import { formatMonto } from "@/lib/moneda";
import Link from "next/link";
import SubmitButton from "@/components/SubmitButton";
import TipoContratoYPrestaciones from "@/components/TipoContratoYPrestaciones";
import { addEmployee } from "@/app/dashboard/actions";

export const dynamic = "force-dynamic";

export default async function ColaboradoresPage() {
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId as string;

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const exentoIR = esExentoIR(company?.regimenFiscal);
  const employees = await prisma.employee.findMany({
    where: { companyId, active: true },
    orderBy: { createdAt: "asc" },
  });
  const bajas = await prisma.employee.findMany({
    where: { companyId, active: false },
    include: { liquidacion: true },
    orderBy: { terminatedAt: "desc" },
  });

  const hoy = new Date();
  // Esta tabla es solo de REFERENCIA (no una corrida real), así que para un
  // colaborador en dólares no hay un tipo de cambio del día para calcular
  // bien el IR (ver calcularIR() en src/lib/payroll.ts) — se calcula igual
  // (sale en 0 al no convertir nada) pero se muestra como "—" en la tabla,
  // con una nota, para no dar una cifra que parezca exacta sin serlo. El
  // INSS sí es confiable sin tipo de cambio (tasa fija, no por tramos).
  const rows = employees.map((e) => ({
    e,
    d: calcularPeriodo({
      bruto: Number(e.grossSalary),
      antiguedadMeses: mesesEntre(new Date(e.startDate), hoy),
      exentoIR,
      tipoContrato: e.tipoContrato,
      acumulaPrestaciones: e.acumulaPrestaciones,
      moneda: e.moneda === "USD" ? "USD" : "NIO",
      periodicidad: e.periodicidad === "QUINCENAL" ? "QUINCENAL" : e.periodicidad === "SEMANAL" ? "SEMANAL" : "MENSUAL",
    }),
  }));

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold mb-8">Colaboradores</h1>

      <section className="bg-panel border border-line rounded-xl p-6 mb-6">
        <h3 className="font-serif text-lg font-semibold mb-4">Agregar colaborador</h3>
        <form action={addEmployee} className="flex flex-wrap gap-3 items-end">
          <Field name="fullName" label="Nombre completo" placeholder="Ej. Ana Reyes" />
          <Field name="cedula" label="N° de cédula (opcional)" placeholder="001-010190-0001A" required={false} />
          <Field name="cuentaBancaria" label="Cuenta bancaria (opcional)" placeholder="10012345678" required={false} />
          <Field name="role" label="Puesto / Departamento" placeholder="Ej. Cajera" />
          <div>
            <label className="block text-xs text-inkdim mb-1.5">Moneda</label>
            <select name="moneda" defaultValue="NIO" className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm">
              <option value="NIO">Córdobas (C$)</option>
              <option value="USD">Dólares (US$)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-inkdim mb-1.5">Periodicidad habitual</label>
            <select name="periodicidad" defaultValue="MENSUAL" className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm">
              <option value="MENSUAL">Mensual</option>
              <option value="QUINCENAL">Quincenal</option>
              <option value="SEMANAL">Semanal</option>
            </select>
          </div>
          <Field name="grossSalary" label="Salario bruto" type="number" placeholder="9200" />
          <Field name="startDate" label="Fecha de ingreso" type="date" />
          <TipoContratoYPrestaciones defaultTipoContrato="LABORAL" defaultAcumulaPrestaciones={true} />
          <SubmitButton className="px-5 py-3 rounded-lg bg-emerald text-[#eafaf3] text-sm font-medium">
            Agregar
          </SubmitButton>
        </form>
        <p className="text-inkfaint text-xs mt-3">
          ¿Muchos colaboradores a la vez? Súbelos desde Excel en <a href="/dashboard/nomina" className="text-gold">Correr nómina</a>.
          Un colaborador de <strong>servicios profesionales</strong> normalmente NO acumula prestaciones — es una relación
          civil/mercantil sin subordinación, no un contrato laboral; confirma con un abogado si tienes dudas sobre cuál
          aplica a un caso real. Por eso la casilla "Acumula..." salta a apagada para ese tipo, pero sigue siendo tuya:
          actívala a mano si, en la práctica, sí le reconoces aguinaldo/vacaciones/antigüedad a ese colaborador. Por
          defecto se le retiene un 10% fijo (Art. 44 Reglamento Ley 822), salvo que el negocio esté registrado como
          <strong> Cuota Fija</strong>, caso en el que no se retiene nada — el Art. 259 de la Ley 822 exonera a estos
          negocios de hacer retenciones de IR (ver Régimen fiscal en el panel de proveedor). Si el colaborador se paga
          en <strong>dólares</strong>, el INSS y el IR se calculan igual pero convertidos a córdobas con el tipo de
          cambio que indiques al correr su planilla (la tabla de IR usa tramos en córdobas) — por eso la columna de IR
          y Neto de abajo muestra "—" para un colaborador en USD: es solo de referencia, el cálculo real sale al
          correr nómina. La <strong>periodicidad habitual</strong> es con qué frecuencia se le paga normalmente — en
          "Correr nómina" cada colaborador trae su propia fila con esta periodicidad ya marcada, así puedes incluir en
          la MISMA corrida a alguien semanal junto con el resto que es quincenal o mensual, sin tener que separar la
          planilla.
        </p>
      </section>

      <section className="bg-panel border border-line rounded-xl p-6">
        <h3 className="font-serif text-lg font-semibold mb-4">Tu equipo</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-inkfaint text-xs uppercase font-mono text-left border-b border-linestrong">
              <th className="pb-2">Colaborador</th>
              <th className="pb-2 text-right">Bruto</th>
              <th className="pb-2 text-right">INSS</th>
              <th className="pb-2 text-right">IR / Retención</th>
              <th className="pb-2 text-right">Neto</th>
              <th className="pb-2 text-right">Ingreso</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, d }) => (
              <tr key={e.id} className="border-b border-line">
                <td className="py-3">
                  <div className="font-medium">
                    {e.fullName}
                    {e.moneda === "USD" && <span className="text-gold text-[10px] font-mono ml-1.5">USD</span>}
                    {e.periodicidad !== "MENSUAL" && (
                      <span className="text-inkdim text-[10px] font-mono ml-1.5 border border-linestrong rounded px-1 py-0.5">
                        {e.periodicidad === "SEMANAL" ? "SEMANAL" : "QUINCENAL"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-inkfaint">
                    {e.role} {e.externalCode && `· ${e.externalCode}`} {e.cedula && `· ${e.cedula}`} {e.cuentaBancaria && `· Cta. ${e.cuentaBancaria}`}
                    {d.esServiciosProfesionales && <span className="text-gold"> · Servicios profesionales</span>}
                    {!e.acumulaPrestaciones && <span className="text-lava"> · No acumula prestaciones</span>}
                    {d.esServiciosProfesionales && e.acumulaPrestaciones && <span className="text-emerald"> · Sí acumula prestaciones</span>}
                  </div>
                </td>
                <td className="py-3 text-right font-mono">{money(d.bruto, e.moneda)}</td>
                <td className="py-3 text-right font-mono">{d.esServiciosProfesionales ? "—" : money(d.inssLaboral, e.moneda)}</td>
                <td className="py-3 text-right font-mono">
                  {e.moneda === "USD" ? (
                    <span className="text-inkfaint" title="Solo se calcula con el tipo de cambio del día, al correr nómina">—</span>
                  ) : (
                    <>
                      {money(d.irMensual, e.moneda)}
                      {d.esServiciosProfesionales && <span className="text-inkfaint text-[10px]"> (10%)</span>}
                    </>
                  )}
                </td>
                <td className="py-3 text-right font-mono">
                  {e.moneda === "USD" ? (
                    <span className="text-inkfaint" title="Solo se calcula con el tipo de cambio del día, al correr nómina">—</span>
                  ) : (
                    money(d.netoPagar, e.moneda)
                  )}
                </td>
                <td className="py-3 text-right text-xs text-inkfaint font-mono">
                  {new Date(e.startDate).toLocaleDateString("es-NI")}
                </td>
                <td className="py-3 text-right">
                  <Link href={`/dashboard/colaboradores/${e.id}`} className="text-xs text-gold hover:underline">
                    Ver →
                  </Link>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-inkfaint">Todavía no agregas colaboradores.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {bajas.length > 0 && (
        <section className="bg-panel border border-line rounded-xl p-6 mt-6">
          <h3 className="font-serif text-lg font-semibold mb-4">Colaboradores dados de baja</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-inkfaint text-xs uppercase font-mono text-left border-b border-linestrong">
                <th className="pb-2">Colaborador</th>
                <th className="pb-2">Tipo de baja</th>
                <th className="pb-2">Fecha</th>
                <th className="pb-2 text-right">Total liquidado</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {bajas.map((e) => (
                <tr key={e.id} className="border-b border-line">
                  <td className="py-3">
                    <div className="font-medium">{e.fullName}</div>
                    <div className="text-xs text-inkfaint">{e.role}</div>
                  </td>
                  <td className="py-3 text-xs text-inkdim">
                    {e.terminationType ? TERMINATION_LABELS[e.terminationType as keyof typeof TERMINATION_LABELS]?.label : "—"}
                  </td>
                  <td className="py-3 text-xs font-mono text-inkfaint">
                    {e.terminatedAt && new Date(e.terminatedAt).toLocaleDateString("es-NI")}
                  </td>
                  <td className="py-3 text-right font-mono">
                    {e.liquidacion ? money(Number(e.liquidacion.total), e.liquidacion.moneda) : "—"}
                  </td>
                  <td className="py-3 text-right">
                    <Link href={`/dashboard/colaboradores/${e.id}`} className="text-xs text-gold hover:underline">
                      Ver →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  placeholder,
  type = "text",
  required,
}: {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-inkdim mb-1.5">{label}</label>
      <input name={name} type={type} required={required ?? type !== "date"} placeholder={placeholder}
        className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm" />
    </div>
  );
}

function money(n: number, moneda?: string | null) {
  return formatMonto(n, moneda);
}
