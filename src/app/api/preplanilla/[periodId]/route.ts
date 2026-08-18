import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generarPDFPreplanilla } from "@/lib/pdfPreplanilla";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: { periodId: string } }) {
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const period = await prisma.payrollPeriod.findUnique({
    where: { id: params.periodId },
    include: { payslips: { include: { employee: true } }, company: true },
  });

  // Solo el negocio dueño de este período puede descargar su PDF.
  if (!period || period.companyId !== companyId) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const bytes = await generarPDFPreplanilla({
    empresa: period.company.name,
    periodo: period.label,
    estado: period.status as "BORRADOR" | "APROBADA",
    generadoEl: period.createdAt,
    aprobadoEl: period.approvedAt,
    filas: period.payslips.map((ps) => ({
      nombre: ps.employee.fullName,
      puesto: ps.employee.role,
      bruto: Number(ps.grossSalary),
      horasExtraCantidad: Number(ps.horasExtraCantidad),
      horasExtraMonto: Number(ps.horasExtraMonto),
      comisiones: Number(ps.comisiones),
      retroactivos: Number(ps.retroactivos),
      viaticos: Number(ps.viaticos),
      inss: Number(ps.inssLaboral),
      ir: Number(ps.irMensual),
      neto: Number(ps.netPay),
    })),
  });

  const filename = `${period.status === "BORRADOR" ? "preplanilla" : "planilla"}-${period.label.replace(/[^a-z0-9]+/gi, "-")}.pdf`;

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
