import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TERMINATION_LABELS, type TerminationTypeKey } from "@/lib/provisiones";
import { generarPDFLiquidacion } from "@/lib/pdfPreplanilla";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: { employeeId: string } }) {
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId;
  if (!companyId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const employee = await prisma.employee.findUnique({
    where: { id: params.employeeId },
    include: { company: true, liquidacion: { include: { pagosPendientes: true } } },
  });

  if (!employee || employee.companyId !== companyId || !employee.liquidacion) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const liq = employee.liquidacion;
  const tipo = liq.terminationType as TerminationTypeKey;

  const bytes = await generarPDFLiquidacion({
    empresa: employee.company.name,
    colaborador: employee.fullName,
    cedula: employee.cedula ?? undefined,
    puesto: employee.role,
    fechaIngreso: new Date(employee.startDate),
    fechaBaja: new Date(liq.terminatedAt),
    antiguedadMeses: liq.antiguedadMeses,
    tipoBajaLabel: TERMINATION_LABELS[tipo]?.label ?? tipo,
    aguinaldoPendiente: Number(liq.aguinaldoPendiente),
    vacacionesPendientes: Number(liq.vacacionesPendientes),
    horasExtraCantidad: Number(liq.horasExtraCantidad),
    horasExtraMonto: Number(liq.horasExtraMonto),
    aplicaIndemnizacion: liq.aplicaIndemnizacion,
    indemnizacion: Number(liq.indemnizacion),
    pagosPendientes: liq.pagosPendientes.map((p) => ({ concepto: p.concepto, monto: Number(p.monto) })),
    gravableBruto: Number(liq.gravableBruto),
    gravableInss: Number(liq.gravableInss),
    gravableIr: Number(liq.gravableIr),
    totalIngresos: Number(liq.totalIngresos),
    total: Number(liq.total),
  });

  const filename = `liquidacion-${employee.fullName.replace(/[^a-z0-9]+/gi, "-")}.pdf`;

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
