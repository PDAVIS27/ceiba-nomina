import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generarPDFListadoPago } from "@/lib/pdfPreplanilla";
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

  const bytes = await generarPDFListadoPago({
    empresa: period.company.name,
    periodo: period.label,
    estado: period.status as "BORRADOR" | "APROBADA",
    generadoEl: new Date(),
    filas: period.payslips.map((ps) => ({
      nombre: ps.employee.fullName,
      cedula: ps.employee.cedula,
      cuentaBancaria: ps.employee.cuentaBancaria,
      neto: Number(ps.netPay),
    })),
  });

  const filename = `listado-pago-${period.label.replace(/[^a-z0-9]+/gi, "-")}.pdf`;

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
