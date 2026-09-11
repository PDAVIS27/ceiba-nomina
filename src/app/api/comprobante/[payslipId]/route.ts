import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generarPDFComprobanteIndividual } from "@/lib/pdfPreplanilla";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: { payslipId: string } }) {
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId;
  if (!companyId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ps = await prisma.payslip.findUnique({
    where: { id: params.payslipId },
    include: { employee: true, period: { include: { company: true } } },
  });

  if (!ps || ps.period.companyId !== companyId) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const bytes = await generarPDFComprobanteIndividual({
    empresa: ps.period.company.name,
    periodo: ps.period.label,
    colaborador: ps.employee.fullName,
    cedula: ps.employee.cedula,
    puesto: ps.employee.role,
    bruto: Number(ps.grossSalary),
    horasExtraCantidad: Number(ps.horasExtraCantidad),
    horasExtraMonto: Number(ps.horasExtraMonto),
    comisiones: Number(ps.comisiones),
    retroactivos: Number(ps.retroactivos),
    viaticos: Number(ps.viaticos),
    otrasDeducciones: Number(ps.otrasDeducciones),
    otrasDeduccionesConcepto: ps.otrasDeduccionesConcepto,
    inss: Number(ps.inssLaboral),
    ir: Number(ps.irMensual),
    neto: Number(ps.netPay),
  });

  const filename = `comprobante-${ps.employee.fullName.replace(/[^a-z0-9]+/gi, "-")}-${ps.period.label.replace(/[^a-z0-9]+/gi, "-")}.pdf`;

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
