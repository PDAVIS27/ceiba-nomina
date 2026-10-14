import { prisma } from "@/lib/prisma";
import { generarPDFPreplanilla } from "@/lib/pdfPreplanilla";
import { NextResponse } from "next/server";

// Versión PÚBLICA (sin login) del PDF de preplanilla, autenticada por el
// mismo token de un solo uso lógico que /aprobar/[token] — para que el
// cliente pueda descargar el PDF desde ahí cuando el negocio comparte el
// enlace a mano (WhatsApp, SMS, etc.) en vez de que Ceiba lo mande por
// correo como adjunto. No requiere sesión porque el token mismo es el
// secreto; solo expone el mismo PDF que ya descarga el negocio desde
// Históricos para ESE período en particular.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const period = await prisma.payrollPeriod.findUnique({
    where: { clientApprovalToken: params.token },
    include: { payslips: { include: { employee: true } }, company: true },
  });

  if (!period) {
    return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });
  }

  const bytes = await generarPDFPreplanilla({
    empresa: period.company.name,
    periodo: period.label,
    estado: period.status as "BORRADOR" | "APROBADA",
    generadoEl: period.createdAt,
    aprobadoEl: period.approvedAt,
    tipoPeriodo: period.tipo as "NOMINA" | "AGUINALDO",
    filas: period.payslips.map((ps) => ({
      nombre: ps.employee.fullName,
      codigo: ps.employee.externalCode,
      cedula: ps.employee.cedula,
      fechaIngreso: ps.employee.startDate,
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
      esServiciosProfesionales: ps.employee.tipoContrato === "SERVICIOS_PROFESIONALES",
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
