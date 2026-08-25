"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcularPeriodo } from "@/lib/payroll";
import { parsearExcelColaboradores } from "@/lib/bulkImport";
import { redirect } from "next/navigation";

import { mesesEntre } from "@/lib/dateUtils";

async function requireCompanyId(): Promise<string> {
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId;
  if (!companyId) redirect("/login");
  return companyId as string;
}

export async function addEmployee(formData: FormData) {
  const companyId = await requireCompanyId();
  const fullName = String(formData.get("fullName") || "").trim();
  const role = String(formData.get("role") || "").trim();
  const grossSalary = Number(formData.get("grossSalary") || 0);
  const startDateRaw = String(formData.get("startDate") || "");
  const startDate = startDateRaw ? new Date(startDateRaw) : new Date();
  if (!fullName || !role || grossSalary <= 0) return;
  await prisma.employee.create({
    data: { companyId, fullName, role, grossSalary, startDate },
  });
  redirect("/dashboard/colaboradores?ok=1");
}

/**
 * Antes de crear un período de planilla, revisa si ya existe un BORRADOR con
 * el mismo nombre para este negocio — así se evita el caso de "le di clic
 * varias veces sin darme cuenta" que generaba períodos duplicados.
 */
async function existeBorradorConEseNombre(companyId: string, label: string) {
  const existente = await prisma.payrollPeriod.findFirst({
    where: { companyId, label: { equals: label, mode: "insensitive" }, status: "BORRADOR" },
  });
  return existente;
}

export async function runPayroll(formData: FormData) {
  const companyId = await requireCompanyId();

  const employees = await prisma.employee.findMany({ where: { companyId, active: true } });
  if (employees.length === 0) return;

  const label = String(formData.get("label") || "Período sin nombre").trim();

  const duplicado = await existeBorradorConEseNombre(companyId, label);
  if (duplicado) {
    redirect(
      `/dashboard/nomina?error=${encodeURIComponent(
        `Ya existe un borrador llamado "${label}" pendiente de aprobación. Ábrelo en Históricos, elimínalo o usa otro nombre de período.`
      )}`
    );
  }

  const period = await prisma.payrollPeriod.create({ data: { companyId, label } });
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

  redirect(`/dashboard/historicos?periodo=${period.id}`);
}

export async function cargarPlanillaDesdeExcel(formData: FormData) {
  const companyId = await requireCompanyId();

  const file = formData.get("file") as File | null;
  const label = String(formData.get("label") || "Período sin nombre").trim();
  if (!file || file.size === 0) {
    redirect(`/dashboard/nomina?error=${encodeURIComponent("No seleccionaste ningún archivo.")}`);
  }

  const duplicado = await existeBorradorConEseNombre(companyId, label);
  if (duplicado) {
    redirect(
      `/dashboard/nomina?error=${encodeURIComponent(
        `Ya existe un borrador llamado "${label}" pendiente de aprobación. Ábrelo en Históricos, elimínalo o usa otro nombre de período.`
      )}`
    );
  }

  const buffer = await file!.arrayBuffer();
  const { filas, errores } = parsearExcelColaboradores(buffer);

  if (filas.length === 0) {
    redirect(
      `/dashboard/nomina?error=${encodeURIComponent(errores[0] || "El archivo no tiene filas válidas.")}`
    );
  }

  const hoy = new Date();

  for (const f of filas) {
    let empleado: { id: string; startDate: Date } | null = null;

    if (f.externalCode) {
      empleado = await prisma.employee.findUnique({
        where: { companyId_externalCode: { companyId, externalCode: f.externalCode } },
        select: { id: true, startDate: true },
      });
    }
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
    }

    (f as any)._employeeId = empleado.id;
    (f as any)._startDate = empleado.startDate;
  }

  const period = await prisma.payrollPeriod.create({ data: { companyId, label } });

  await prisma.payslip.createMany({
    data: (filas as any[]).map((f) => {
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
  redirect(`/dashboard/historicos?${params.toString()}`);
}

export async function aprobarPlanilla(formData: FormData) {
  const companyId = await requireCompanyId();
  const periodId = String(formData.get("periodId") || "");
  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period || period.companyId !== companyId || period.status === "APROBADA") return;
  await prisma.payrollPeriod.update({
    where: { id: periodId },
    data: { status: "APROBADA", approvedAt: new Date() },
  });
  redirect(`/dashboard/historicos?periodo=${periodId}`);
}

/**
 * Autoservicio para que el propio negocio corrija un error suyo: borra un
 * período que todavía está en BORRADOR (nunca uno ya aprobado, para no
 * perder un registro final).
 */
export async function eliminarBorrador(formData: FormData) {
  const companyId = await requireCompanyId();
  const periodId = String(formData.get("periodId") || "");
  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period || period.companyId !== companyId || period.status !== "BORRADOR") return;
  await prisma.payslip.deleteMany({ where: { periodId } });
  await prisma.payrollPeriod.delete({ where: { id: periodId } });
  redirect("/dashboard/historicos");
}

export async function reportarProblema(formData: FormData) {
  const companyId = await requireCompanyId();
  const title = String(formData.get("title") || "").trim();
  const detail = String(formData.get("detail") || "").trim();
  if (!title) return;
  await prisma.supportCase.create({ data: { companyId, title, detail } });
  redirect("/dashboard/reportar?ok=1");
}
