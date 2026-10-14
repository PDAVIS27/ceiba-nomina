"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcularPeriodo } from "@/lib/payroll";
import { esExentoIR } from "@/lib/regimenFiscal";
import { parsearExcelColaboradores } from "@/lib/bulkImport";
import {
  calcularLiquidacion,
  TERMINATION_LABELS,
  type TerminationTypeKey,
  type PagoPendienteItem,
} from "@/lib/provisiones";
import { generarPDFPreplanilla, generarPDFListadoPago } from "@/lib/pdfPreplanilla";
import { enviarPDFPorCorreo } from "@/lib/email";
import { redirect } from "next/navigation";
import crypto from "crypto";

import { mesesEntre } from "@/lib/dateUtils";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function requireCompanyId(): Promise<string> {
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId;
  if (!companyId) redirect("/login");
  return companyId as string;
}

// Enlace público de aprobación por correo/WhatsApp/lo que sea — ver el
// comentario grande en schema.prisma. Se usa tanto al enviar la preplanilla
// por correo (enviarPlanillaPorCorreo) como al generar el enlace para
// compartir a mano (generarEnlaceAprobacion). El token se genera una sola
// vez por período y se reutiliza siempre — así cualquier copia del enlace
// que ya hayas compartido sigue sirviendo.
async function obtenerOCrearEnlaceAprobacion(
  periodId: string,
  existingToken: string | null,
  destinatarioEmail?: string
): Promise<string> {
  const token = existingToken || crypto.randomBytes(24).toString("base64url");
  await prisma.payrollPeriod.update({
    where: { id: periodId },
    data: {
      clientApprovalToken: token,
      ...(destinatarioEmail ? { clientApprovalEmail: destinatarioEmail } : {}),
    },
  });
  const base = (process.env.NEXTAUTH_URL || "").replace(/\/+$/, "");
  return `${base}/aprobar/${token}`;
}

export async function addEmployee(formData: FormData) {
  const companyId = await requireCompanyId();
  const fullName = String(formData.get("fullName") || "").trim();
  const cedula = String(formData.get("cedula") || "").trim();
  const cuentaBancaria = String(formData.get("cuentaBancaria") || "").trim();
  const role = String(formData.get("role") || "").trim();
  const grossSalary = Number(formData.get("grossSalary") || 0);
  const startDateRaw = String(formData.get("startDate") || "");
  const startDate = startDateRaw ? new Date(startDateRaw) : new Date();
  const tipoContratoRaw = String(formData.get("tipoContrato") || "LABORAL");
  const tipoContrato = tipoContratoRaw === "SERVICIOS_PROFESIONALES" ? "SERVICIOS_PROFESIONALES" : "LABORAL";
  // Un colaborador de servicios profesionales nunca acumula prestaciones —
  // la casilla del formulario no aplica para él y se ignora.
  const acumulaPrestaciones = tipoContrato === "SERVICIOS_PROFESIONALES" ? false : formData.get("acumulaPrestaciones") !== null;
  if (!fullName || !role || grossSalary <= 0) return;
  await prisma.employee.create({
    data: {
      companyId,
      fullName,
      cedula: cedula || null,
      cuentaBancaria: cuentaBancaria || null,
      role,
      grossSalary,
      startDate,
      tipoContrato,
      acumulaPrestaciones,
    },
  });
  redirect("/dashboard/colaboradores?ok=1");
}

/**
 * Cambia el tipo de contrato y/o si acumula prestaciones de un colaborador
 * ya existente — desde su página de detalle. No toca nada más (salario,
 * nombre, etc. se editan con la carga de Excel o directo en la base).
 */
export async function actualizarTipoContrato(formData: FormData) {
  const companyId = await requireCompanyId();
  const employeeId = String(formData.get("employeeId") || "");
  const employee = await getOwnEmployee(companyId, employeeId);
  if (!employee) return;

  const tipoContratoRaw = String(formData.get("tipoContrato") || "LABORAL");
  const tipoContrato = tipoContratoRaw === "SERVICIOS_PROFESIONALES" ? "SERVICIOS_PROFESIONALES" : "LABORAL";
  const acumulaPrestaciones = tipoContrato === "SERVICIOS_PROFESIONALES" ? false : formData.get("acumulaPrestaciones") !== null;

  await prisma.employee.update({
    where: { id: employeeId },
    data: { tipoContrato, acumulaPrestaciones },
  });
  redirect(`/dashboard/colaboradores/${employeeId}?ok=config`);
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

/**
 * Lee y valida las fechas de inicio/fin de un período desde el formulario.
 * Se guardan en el PayrollPeriod para que el histórico de provisiones sepa
 * exactamente hasta qué día quedó cubierto (ver src/lib/provisiones.ts) —
 * sin esto, un colaborador que sale a mitad de un período pierde esos días.
 */
function leerFechasPeriodo(formData: FormData, redirectA: string): { periodStart: Date; periodEnd: Date } {
  const periodStartRaw = String(formData.get("periodStart") || "");
  const periodEndRaw = String(formData.get("periodEnd") || "");
  if (!periodStartRaw || !periodEndRaw) {
    redirect(`${redirectA}?error=${encodeURIComponent("Indica la fecha de inicio y fin del período.")}`);
  }
  const periodStart = new Date(periodStartRaw);
  const periodEnd = new Date(periodEndRaw);
  if (periodEnd < periodStart) {
    redirect(`${redirectA}?error=${encodeURIComponent("La fecha de fin no puede ser anterior a la de inicio.")}`);
  }
  return { periodStart, periodEnd };
}

export async function runPayroll(formData: FormData) {
  const companyId = await requireCompanyId();

  const employees = await prisma.employee.findMany({ where: { companyId, active: true } });
  if (employees.length === 0) return;
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const exentoIR = esExentoIR(company?.regimenFiscal);

  const label = String(formData.get("label") || "Período sin nombre").trim();
  const { periodStart, periodEnd } = leerFechasPeriodo(formData, "/dashboard/nomina");

  const duplicado = await existeBorradorConEseNombre(companyId, label);
  if (duplicado) {
    redirect(
      `/dashboard/nomina?error=${encodeURIComponent(
        `Ya existe un borrador llamado "${label}" pendiente de aprobación. Ábrelo en Históricos, elimínalo o usa otro nombre de período.`
      )}`
    );
  }

  const period = await prisma.payrollPeriod.create({ data: { companyId, label, periodStart, periodEnd } });
  const hoy = new Date();

  await prisma.payslip.createMany({
    data: employees.map((e) => {
      const horasExtraCantidad = Number(formData.get(`horas_${e.id}`) || 0);
      const comisiones = Number(formData.get(`com_${e.id}`) || 0);
      const retroactivos = Number(formData.get(`retro_${e.id}`) || 0);
      const viaticos = Number(formData.get(`via_${e.id}`) || 0);
      const otrasDeducciones = Math.max(Number(formData.get(`otrasDed_${e.id}`)) || 0, 0);
      const otrasDeduccionesConcepto = String(formData.get(`otrasDedMotivo_${e.id}`) || "").trim() || null;
      const antiguedadMeses = mesesEntre(new Date(e.startDate), hoy);

      const d = calcularPeriodo({
        bruto: Number(e.grossSalary),
        horasExtraCantidad,
        comisiones,
        retroactivos,
        viaticos,
        antiguedadMeses,
        otrasDeducciones,
        otrasDeduccionesConcepto,
        exentoIR,
        tipoContrato: e.tipoContrato,
        acumulaPrestaciones: e.acumulaPrestaciones,
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
        otrasDeducciones: d.otrasDeducciones,
        otrasDeduccionesConcepto: d.otrasDeduccionesConcepto,
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
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const exentoIR = esExentoIR(company?.regimenFiscal);

  const file = formData.get("file") as File | null;
  const label = String(formData.get("label") || "Período sin nombre").trim();
  if (!file || file.size === 0) {
    redirect(`/dashboard/nomina?error=${encodeURIComponent("No seleccionaste ningún archivo.")}`);
  }
  const { periodStart, periodEnd } = leerFechasPeriodo(formData, "/dashboard/nomina");

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
    let empleado: { id: string; startDate: Date; tipoContrato: "LABORAL" | "SERVICIOS_PROFESIONALES"; acumulaPrestaciones: boolean } | null = null;

    if (f.externalCode) {
      empleado = await prisma.employee.findUnique({
        where: { companyId_externalCode: { companyId, externalCode: f.externalCode } },
        select: { id: true, startDate: true, tipoContrato: true, acumulaPrestaciones: true },
      });
    }
    if (!empleado) {
      empleado = await prisma.employee.findFirst({
        where: { companyId, fullName: { equals: f.fullName, mode: "insensitive" } },
        select: { id: true, startDate: true, tipoContrato: true, acumulaPrestaciones: true },
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
          ...(f.cedula ? { cedula: f.cedula } : {}),
          ...(f.cuentaBancaria ? { cuentaBancaria: f.cuentaBancaria } : {}),
          ...(f.startDate ? { startDate: f.startDate } : {}),
        },
      });
    } else {
      const nuevo = await prisma.employee.create({
        data: {
          companyId,
          externalCode: f.externalCode,
          fullName: f.fullName,
          cedula: f.cedula ?? null,
          cuentaBancaria: f.cuentaBancaria ?? null,
          role: f.role,
          grossSalary: f.grossSalary,
          startDate: f.startDate ?? hoy,
        },
      });
      empleado = {
        id: nuevo.id,
        startDate: nuevo.startDate,
        tipoContrato: nuevo.tipoContrato,
        acumulaPrestaciones: nuevo.acumulaPrestaciones,
      };
    }

    (f as any)._employeeId = empleado.id;
    (f as any)._startDate = empleado.startDate;
    // La plantilla de Excel no trae tipo de contrato — se respeta lo que el
    // colaborador ya tenía configurado (o LABORAL por defecto si es nuevo).
    (f as any)._tipoContrato = empleado.tipoContrato;
    (f as any)._acumulaPrestaciones = empleado.acumulaPrestaciones;
  }

  const period = await prisma.payrollPeriod.create({ data: { companyId, label, periodStart, periodEnd } });

  await prisma.payslip.createMany({
    data: (filas as any[]).map((f) => {
      const antiguedadMeses = mesesEntre(new Date(f._startDate), hoy);
      const d = calcularPeriodo({
        bruto: f.grossSalary,
        horasExtraCantidad: f.horasExtraCantidad,
        comisiones: f.comisiones,
        retroactivos: f.retroactivos,
        viaticos: f.viaticos,
        antiguedadMeses,
        otrasDeducciones: f.otrasDeducciones,
        otrasDeduccionesConcepto: f.otrasDeduccionesConcepto,
        exentoIR,
        tipoContrato: f._tipoContrato,
        acumulaPrestaciones: f._acumulaPrestaciones,
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
        otrasDeducciones: d.otrasDeducciones,
        otrasDeduccionesConcepto: d.otrasDeduccionesConcepto,
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
  // Detalle de a quién se le omitió y por qué (ej. "Juan Pérez: falta salario
  // válido"), para no tener que adivinar revisando el Excel fila por fila.
  if (errores.length > 0) {
    params.set("omitidosDetalle", JSON.stringify(errores));
  }
  redirect(`/dashboard/historicos?${params.toString()}`);
}

export async function aprobarPlanilla(formData: FormData) {
  const companyId = await requireCompanyId();
  const periodId = String(formData.get("periodId") || "");
  const period = await prisma.payrollPeriod.findUnique({
    where: { id: periodId },
    include: { payslips: true },
  });
  if (!period || period.companyId !== companyId || period.status === "APROBADA") return;

  // Un período de AGUINALDO no es planilla normal: al aprobarse, además de
  // marcarlo APROBADA, hay que REGISTRAR EL PAGO (ProvisionMovement) de cada
  // colaborador, igual que "Registrar pago de aguinaldo" en su detalle — así
  // se descuenta del saldo acumulado y no se puede volver a pagar dos veces.
  if (period.tipo === "AGUINALDO") {
    await prisma.$transaction([
      prisma.payrollPeriod.update({
        where: { id: periodId },
        data: { status: "APROBADA", approvedAt: new Date() },
      }),
      ...period.payslips
        .filter((ps) => Number(ps.netPay) > 0)
        .map((ps) =>
          prisma.provisionMovement.create({
            data: {
              employeeId: ps.employeeId,
              companyId,
              tipo: "AGUINALDO",
              amount: ps.netPay,
              note: `Pago de aguinaldo — período "${period.label}"`,
            },
          })
        ),
    ]);
  } else {
    await prisma.payrollPeriod.update({
      where: { id: periodId },
      data: { status: "APROBADA", approvedAt: new Date() },
    });
  }

  redirect(`/dashboard/historicos?periodo=${periodId}`);
}

/**
 * Genera el borrador de pago de aguinaldo (diciembre): para cada colaborador
 * activo con saldo de aguinaldo acumulado, crea un Payslip especial dentro de
 * un PayrollPeriod de tipo AGUINALDO — el monto va íntegro (exento de INSS e
 * IR, Art. 97 CT) y no acumula provisiones nuevas, porque es un pago, no un
 * período trabajado. El saldo se descuenta hasta que el período se aprueba
 * (ver aprobarPlanilla) — así, si se genera dos veces por error antes de
 * aprobar, no se duplica el pago.
 */
export async function generarPreplanillaAguinaldo(formData: FormData) {
  const companyId = await requireCompanyId();
  const label = String(formData.get("label") || "Aguinaldo").trim();
  const fechaPagoRaw = String(formData.get("fechaPago") || "");
  const fechaPago = fechaPagoRaw ? new Date(fechaPagoRaw) : new Date();

  const duplicado = await existeBorradorConEseNombre(companyId, label);
  if (duplicado) {
    redirect(
      `/dashboard/nomina?error=${encodeURIComponent(
        `Ya existe un borrador llamado "${label}" pendiente de aprobación. Ábrelo en Históricos, elimínalo o usa otro nombre.`
      )}`
    );
  }

  const employees = await prisma.employee.findMany({ where: { companyId, active: true } });
  if (employees.length === 0) {
    redirect(`/dashboard/nomina?error=${encodeURIComponent("No hay colaboradores activos.")}`);
  }

  const montos: { employeeId: string; monto: number }[] = [];
  for (const e of employees) {
    const montoFormulario = formData.get(`aguinaldo_${e.id}`);
    const monto =
      montoFormulario !== null
        ? Math.max(Number(montoFormulario) || 0, 0)
        : 0;
    if (monto > 0) montos.push({ employeeId: e.id, monto: round2(monto) });
  }

  if (montos.length === 0) {
    redirect(
      `/dashboard/nomina?error=${encodeURIComponent(
        "No hay ningún monto de aguinaldo mayor a cero para pagar."
      )}`
    );
  }

  const period = await prisma.payrollPeriod.create({
    data: { companyId, label, tipo: "AGUINALDO", periodStart: fechaPago, periodEnd: fechaPago },
  });

  await prisma.payslip.createMany({
    data: montos.map((m) => ({
      periodId: period.id,
      employeeId: m.employeeId,
      grossSalary: m.monto,
      horasExtraCantidad: 0,
      horasExtraMonto: 0,
      comisiones: 0,
      retroactivos: 0,
      viaticos: 0,
      provisionAguinaldo: 0,
      provisionVacaciones: 0,
      provisionIndemnizacion: 0,
      otrasDeducciones: 0,
      inssLaboral: 0,
      irMensual: 0,
      netPay: m.monto,
    })),
  });

  redirect(`/dashboard/historicos?periodo=${period.id}`);
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
  const category = String(formData.get("category") || "").trim() || null;
  const title = String(formData.get("title") || "").trim();
  const detail = String(formData.get("detail") || "").trim();
  if (!title) return;
  await prisma.supportCase.create({ data: { companyId, category, title, detail } });
  redirect("/dashboard/reportar?ok=1");
}

async function getOwnEmployee(companyId: string, employeeId: string) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.companyId !== companyId) return null;
  return employee;
}

/** Registra que se pagó el aguinaldo (normalmente en diciembre) — reduce el saldo acumulado. */
export async function pagarAguinaldo(formData: FormData) {
  const companyId = await requireCompanyId();
  const employeeId = String(formData.get("employeeId") || "");
  const amount = Number(formData.get("amount") || 0);
  const note = String(formData.get("note") || "").trim() || null;

  const employee = await getOwnEmployee(companyId, employeeId);
  if (!employee) return;
  if (amount <= 0) {
    redirect(`/dashboard/colaboradores/${employeeId}?error=${encodeURIComponent("Ingresa un monto mayor a cero.")}`);
  }

  await prisma.provisionMovement.create({
    data: { employeeId, companyId, tipo: "AGUINALDO", amount, note },
  });
  redirect(`/dashboard/colaboradores/${employeeId}?ok=aguinaldo`);
}

/** Registra días de vacaciones tomados/disfrutados — reduce el saldo acumulado. */
export async function registrarVacacionesTomadas(formData: FormData) {
  const companyId = await requireCompanyId();
  const employeeId = String(formData.get("employeeId") || "");
  const dias = Number(formData.get("dias") || 0);
  const note = String(formData.get("note") || "").trim() || null;

  const employee = await getOwnEmployee(companyId, employeeId);
  if (!employee) return;
  if (dias <= 0) {
    redirect(`/dashboard/colaboradores/${employeeId}?error=${encodeURIComponent("Ingresa una cantidad de días mayor a cero.")}`);
  }

  const amount = round2((Number(employee.grossSalary) / 30) * dias);
  await prisma.provisionMovement.create({
    data: { employeeId, companyId, tipo: "VACACIONES", amount, dias, note },
  });
  redirect(`/dashboard/colaboradores/${employeeId}?ok=vacaciones`);
}

/**
 * Da de baja a un colaborador: lo marca inactivo, guarda el motivo de la
 * baja, y congela la liquidación calculada en ese momento (aguinaldo y
 * vacaciones pendientes, más indemnización por antigüedad si el tipo de baja
 * corresponde — ver src/lib/provisiones.ts).
 */
export async function darDeBaja(formData: FormData) {
  const companyId = await requireCompanyId();
  const employeeId = String(formData.get("employeeId") || "");
  const terminationType = String(formData.get("terminationType") || "") as TerminationTypeKey;
  const terminatedAtRaw = String(formData.get("terminatedAt") || "");
  const note = String(formData.get("note") || "").trim() || null;

  // Puede haber varios conceptos de pago pendiente a la vez (quincena, mes
  // adicional, comisión, etc.) — cada fila del formulario manda un par
  // ppConcepto/ppMonto; se emparejan por posición y se descartan los montos
  // en cero (filas vacías que el colaborador nunca llenó).
  const conceptosRaw = formData.getAll("ppConcepto").map((v) => String(v).trim());
  const montosRaw = formData.getAll("ppMonto").map((v) => Number(v) || 0);
  const pagosPendientes: PagoPendienteItem[] = conceptosRaw
    .map((concepto, i) => ({ concepto, monto: montosRaw[i] ?? 0 }))
    .filter((p) => p.monto > 0);

  // Horas extra pendientes de pagar (se valoran con el salario actual del
  // colaborador, con el mismo recargo del 100% que usa la planilla normal).
  const horasExtraCantidad = Math.max(Number(formData.get("horasExtra")) || 0, 0);

  const employee = await getOwnEmployee(companyId, employeeId);
  if (!employee || !employee.active) return;

  if (!Object.keys(TERMINATION_LABELS).includes(terminationType)) {
    redirect(`/dashboard/colaboradores/${employeeId}?error=${encodeURIComponent("Elige un tipo de baja válido.")}`);
  }

  const terminatedAt = terminatedAtRaw ? new Date(terminatedAtRaw) : new Date();
  if (terminatedAt < new Date(employee.startDate)) {
    redirect(
      `/dashboard/colaboradores/${employeeId}?error=${encodeURIComponent(
        "La fecha de baja no puede ser anterior a la fecha de ingreso."
      )}`
    );
  }
  if (pagosPendientes.some((p) => !p.concepto)) {
    redirect(
      `/dashboard/colaboradores/${employeeId}?error=${encodeURIComponent(
        "Todo pago pendiente con un monto debe indicar de qué se trata (ej. \"Quincena 1-15 sept\" o \"Mes adicional\")."
      )}`
    );
  }

  const antiguedadMeses = mesesEntre(new Date(employee.startDate), terminatedAt);
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const liq = await calcularLiquidacion(
    employeeId,
    terminationType,
    terminatedAt,
    pagosPendientes,
    horasExtraCantidad,
    esExentoIR(company?.regimenFiscal),
    employee.tipoContrato
  );

  const datosComunes = {
    terminationType,
    terminatedAt,
    antiguedadMeses,
    aguinaldoPendiente: liq.aguinaldoSaldo,
    vacacionesPendientes: liq.vacacionesSaldo,
    horasExtraCantidad: liq.horasExtraCantidad,
    horasExtraMonto: liq.horasExtraMonto,
    aplicaIndemnizacion: liq.aplicaIndemnizacion,
    indemnizacion: liq.indemnizacion,
    gravableBruto: liq.gravable.bruto,
    gravableInss: liq.gravable.inss,
    gravableIr: liq.gravable.ir,
    gravableNeto: liq.gravable.neto,
    totalIngresos: liq.totalIngresos,
    total: liq.total,
    note,
  };
  const pagosPendientesData = pagosPendientes.map((p) => ({ concepto: p.concepto, monto: p.monto }));

  await prisma.$transaction([
    prisma.employee.update({
      where: { id: employeeId },
      data: { active: false, terminatedAt, terminationType, terminationNote: note },
    }),
    prisma.liquidacion.upsert({
      where: { employeeId },
      create: {
        employeeId,
        companyId,
        ...datosComunes,
        pagosPendientes: { create: pagosPendientesData },
      },
      update: {
        ...datosComunes,
        // Reemplaza los conceptos anteriores por los nuevos — no se puede
        // dar de baja dos veces al mismo colaborador sin reingresarlo antes,
        // pero por seguridad ante un reintento, se limpia y se vuelve a crear.
        pagosPendientes: {
          deleteMany: {},
          create: pagosPendientesData,
        },
      },
    }),
  ]);

  redirect(`/dashboard/colaboradores/${employeeId}?ok=baja`);
}

/**
 * Reingresa a un colaborador dado de baja por error — lo reactiva y borra
 * su liquidación calculada (no borra el histórico de planillas ni de pagos).
 */
export async function reingresarColaborador(formData: FormData) {
  const companyId = await requireCompanyId();
  const employeeId = String(formData.get("employeeId") || "");
  const employee = await getOwnEmployee(companyId, employeeId);
  if (!employee || employee.active) return;

  await prisma.$transaction([
    prisma.liquidacion.deleteMany({ where: { employeeId } }),
    prisma.employee.update({
      where: { id: employeeId },
      data: { active: true, terminatedAt: null, terminationType: null, terminationNote: null },
    }),
  ]);
  redirect(`/dashboard/colaboradores/${employeeId}?ok=reingreso`);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Envía por correo (vía Resend, ver src/lib/email.ts) el mismo PDF que
 * generan /api/preplanilla y /api/listado-pago — reconstruye el PDF con los
 * mismos datos en vez de pegarle a esos endpoints, para mandarlo como
 * adjunto en el correo. Requiere RESEND_API_KEY configurada en Vercel; si
 * falta, enviarPDFPorCorreo devuelve un error claro en vez de fallar feo.
 */
export async function enviarPlanillaPorCorreo(formData: FormData) {
  const companyId = await requireCompanyId();
  const periodId = String(formData.get("periodId") || "");
  const destinatario = String(formData.get("destinatario") || "").trim();
  const documento = String(formData.get("documento") || "preplanilla"); // "preplanilla" | "listado"
  const mensajePersonal = String(formData.get("mensaje") || "").trim();

  if (!EMAIL_RE.test(destinatario)) {
    redirect(
      `/dashboard/historicos?periodo=${periodId}&correoError=${encodeURIComponent("Ingresa un correo válido.")}`
    );
  }

  const period = await prisma.payrollPeriod.findUnique({
    where: { id: periodId },
    include: { payslips: { include: { employee: true } }, company: true },
  });
  if (!period || period.companyId !== companyId) {
    redirect(`/dashboard/historicos?correoError=${encodeURIComponent("No encontré ese período.")}`);
  }

  let bytes: Uint8Array;
  let nombreArchivo: string;
  let etiquetaDocumento: string;

  if (documento === "listado") {
    if (period!.status !== "APROBADA") {
      redirect(
        `/dashboard/historicos?periodo=${periodId}&correoError=${encodeURIComponent(
          "El listado de pago solo está disponible para planillas ya aprobadas."
        )}`
      );
    }
    bytes = await generarPDFListadoPago({
      empresa: period!.company.name,
      periodo: period!.label,
      estado: period!.status as "BORRADOR" | "APROBADA",
      generadoEl: new Date(),
      filas: period!.payslips.map((ps) => ({
        nombre: ps.employee.fullName,
        cedula: ps.employee.cedula,
        cuentaBancaria: ps.employee.cuentaBancaria,
        neto: Number(ps.netPay),
      })),
    });
    nombreArchivo = `listado-pago-${period!.label.replace(/[^a-z0-9]+/gi, "-")}.pdf`;
    etiquetaDocumento = "listado de pago";
  } else {
    bytes = await generarPDFPreplanilla({
      empresa: period!.company.name,
      periodo: period!.label,
      estado: period!.status as "BORRADOR" | "APROBADA",
      generadoEl: period!.createdAt,
      aprobadoEl: period!.approvedAt,
      tipoPeriodo: period!.tipo as "NOMINA" | "AGUINALDO",
      filas: period!.payslips.map((ps) => ({
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
    nombreArchivo = `${period!.status === "BORRADOR" ? "preplanilla" : "planilla"}-${period!.label.replace(/[^a-z0-9]+/gi, "-")}.pdf`;
    etiquetaDocumento = period!.status === "BORRADOR" ? "preplanilla" : "planilla";
  }

  // Enlace de aprobación por correo — solo tiene sentido para una preplanilla
  // (status BORRADOR) todavía pendiente de aprobar; un listado de pago o una
  // planilla ya aprobada no necesitan que nadie apruebe nada. El token se
  // genera una sola vez y se reutiliza en envíos siguientes, así el mismo
  // enlace sigue sirviendo si reenvías el correo más adelante. Ver el
  // comentario en schema.prisma sobre por qué esto NO aprueba nada por sí
  // solo dentro del sistema.
  let enlaceAprobacion: string | null = null;
  if (documento === "preplanilla" && period!.status === "BORRADOR") {
    enlaceAprobacion = await obtenerOCrearEnlaceAprobacion(period!.id, period!.clientApprovalToken, destinatario);
  }

  const asunto = `${period!.company.name} — ${etiquetaDocumento}: ${period!.label}`;
  const mensaje =
    (mensajePersonal ? mensajePersonal + "\n\n" : "") +
    `Adjunto el PDF de ${etiquetaDocumento} del período "${period!.label}" de ${period!.company.name}.` +
    (enlaceAprobacion
      ? `\n\nPara aprobar esta prenómina, entra a este enlace:\n${enlaceAprobacion}`
      : "") +
    `\n\n— Enviado desde Ceiba`;

  const resultado = await enviarPDFPorCorreo({
    destinatario,
    asunto,
    mensaje,
    nombreArchivo,
    contenidoPDF: bytes,
  });

  if (!resultado.ok) {
    redirect(
      `/dashboard/historicos?periodo=${periodId}&correoError=${encodeURIComponent(resultado.error || "No se pudo enviar el correo.")}`
    );
  }

  redirect(`/dashboard/historicos?periodo=${periodId}&correoOk=${encodeURIComponent(destinatario)}`);
}

/**
 * Genera (o reutiliza) el enlace de aprobación de una preplanilla SIN
 * enviar ningún correo — para que lo copies y lo mandes tú mismo por donde
 * quieras (WhatsApp, SMS, tu propio correo). No depende de Resend ni de
 * ninguna variable de entorno de correo.
 */
export async function generarEnlaceAprobacion(formData: FormData) {
  const companyId = await requireCompanyId();
  const periodId = String(formData.get("periodId") || "");

  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period || period.companyId !== companyId) {
    redirect(`/dashboard/historicos?correoError=${encodeURIComponent("No encontré ese período.")}`);
  }
  if (period!.status !== "BORRADOR") {
    redirect(
      `/dashboard/historicos?periodo=${periodId}&correoError=${encodeURIComponent(
        "El enlace de aprobación solo aplica a una preplanilla pendiente (BORRADOR)."
      )}`
    );
  }

  await obtenerOCrearEnlaceAprobacion(period!.id, period!.clientApprovalToken);
  redirect(`/dashboard/historicos?periodo=${periodId}&enlaceGenerado=1`);
}
