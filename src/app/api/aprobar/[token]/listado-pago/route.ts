import { prisma } from "@/lib/prisma";
import { generarPDFListadoPago } from "@/lib/pdfPreplanilla";
import { NextResponse } from "next/server";

// Versión PÚBLICA (sin login) del listado de pago — autenticada por el mismo
// token que /aprobar/[token] y /api/aprobar/[token]/pdf. A pedido del
// negocio: el cliente que confirma la aprobación desde el enlace también
// necesita ver el detalle de cuenta bancaria por colaborador (nombre,
// cédula, cuenta, neto), no solo el total.
//
// A propósito, SOLO funciona si el período ya quedó APROBADA — igual que el
// botón "Descargar listado de pago (PDF)" en Históricos, que tampoco se
// muestra para una preplanilla en BORRADOR (los montos aún podrían cambiar).
// Este detalle (cuentas bancarias de los colaboradores) es más sensible que
// el resumen de la página pública, así que solo se genera cuando hace falta:
// nadie puede descargarlo con solo adivinar o reusar el enlace antes de que
// el negocio apruebe.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const period = await prisma.payrollPeriod.findUnique({
    where: { clientApprovalToken: params.token },
    include: { payslips: { include: { employee: true } }, company: true },
  });

  if (!period) {
    return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });
  }
  if (period.status !== "APROBADA") {
    return NextResponse.json(
      { error: "El listado de pago solo está disponible una vez que el período queda aprobado." },
      { status: 403 }
    );
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
