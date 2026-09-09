// ---------------------------------------------------------------------------
// Histórico de provisiones laborales por colaborador (aguinaldo, vacaciones,
// indemnización) y cálculo de la liquidación final al dar de baja.
//
// CÓMO SE ACUMULA: cada vez que se aprueba una planilla (PayrollPeriod con
// status "APROBADA"), el Payslip de ese colaborador ya trae guardado cuánto
// se provisionó ese mes (ver src/lib/payroll.ts). Este archivo simplemente
// SUMA esos montos por colaborador para tener el acumulado histórico — no
// hay una tabla aparte de "provisión mensual".
//
// LIMITACIÓN CONOCIDA: si un mes no se corre/aprueba ninguna planilla para un
// colaborador, ese mes no acumula provisión (no hay un cálculo independiente
// por calendario). Para que el histórico sea confiable, la nómina debe
// correrse y aprobarse puntualmente cada período.
//
// PAGOS Y DISFRUTE: el aguinaldo pagado en diciembre y las vacaciones tomadas
// se registran como ProvisionMovement y se restan del acumulado para dar el
// "saldo" pendiente. La indemnización no tiene pagos parciales — solo se
// liquida una vez, al dar de baja.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/prisma";
import { calcularIR, impuestoAnualSegunTabla, INSS_LABORAL } from "@/lib/payroll";

export type TerminationTypeKey =
  | "RENUNCIA"
  | "DESPIDO_JUSTA_CAUSA"
  | "DESPIDO_SIN_CAUSA"
  | "OTRA_CAUSA_AJENA";

// Indemnización por antigüedad (Art. 45 CT) normalmente solo corresponde
// cuando la relación termina por causas ajenas al trabajador — no en
// renuncia voluntaria ni en despido con justa causa (Art. 48 CT).
// IMPORTANTE: esto es una guía general, no asesoría legal — un caso real
// (sobre todo uno disputado) debe revisarlo un abogado laboral nicaragüense.
export const TERMINATION_LABELS: Record<
  TerminationTypeKey,
  { label: string; aplicaIndemnizacion: boolean; ayuda: string }
> = {
  RENUNCIA: {
    label: "Renuncia voluntaria",
    aplicaIndemnizacion: false,
    ayuda: "El colaborador se va por su propia decisión. No genera indemnización por antigüedad.",
  },
  DESPIDO_JUSTA_CAUSA: {
    label: "Despido con justa causa (Art. 48 CT)",
    aplicaIndemnizacion: false,
    ayuda: "Falta grave comprobada del colaborador. No genera indemnización por antigüedad.",
  },
  DESPIDO_SIN_CAUSA: {
    label: "Despido sin causa justificada",
    aplicaIndemnizacion: true,
    ayuda: "El negocio termina la relación sin una causa legal comprobada. Sí genera indemnización por antigüedad.",
  },
  OTRA_CAUSA_AJENA: {
    label: "Otra causa ajena al trabajador (mutuo acuerdo, cierre del negocio, etc.)",
    aplicaIndemnizacion: true,
    ayuda: "Cualquier otro motivo no atribuible al colaborador. Sí genera indemnización por antigüedad.",
  },
};

export function aplicaIndemnizacionPorTipo(tipo: TerminationTypeKey): boolean {
  return TERMINATION_LABELS[tipo]?.aplicaIndemnizacion ?? false;
}

export interface BalanceProvisiones {
  aguinaldoAcumulado: number;
  aguinaldoPagado: number;
  aguinaldoSaldo: number;
  vacacionesAcumulado: number;
  vacacionesTomado: number;
  vacacionesSaldo: number;
  // Total acumulado a la fecha de la última planilla aprobada — es lo que se
  // pagaría por indemnización SI la baja aplicara (ver aplicaIndemnizacionPorTipo).
  indemnizacionAcumulada: number;
}

export async function balanceProvisiones(employeeId: string): Promise<BalanceProvisiones> {
  const [payslips, movimientos] = await Promise.all([
    prisma.payslip.findMany({
      where: { employeeId, period: { status: "APROBADA" } },
      select: { provisionAguinaldo: true, provisionVacaciones: true, provisionIndemnizacion: true },
    }),
    prisma.provisionMovement.findMany({ where: { employeeId } }),
  ]);

  const aguinaldoAcumulado = round2(payslips.reduce((a, p) => a + Number(p.provisionAguinaldo), 0));
  const vacacionesAcumulado = round2(payslips.reduce((a, p) => a + Number(p.provisionVacaciones), 0));
  const indemnizacionAcumulada = round2(payslips.reduce((a, p) => a + Number(p.provisionIndemnizacion), 0));

  const aguinaldoPagado = round2(
    movimientos.filter((m) => m.tipo === "AGUINALDO").reduce((a, m) => a + Number(m.amount), 0)
  );
  const vacacionesTomado = round2(
    movimientos.filter((m) => m.tipo === "VACACIONES").reduce((a, m) => a + Number(m.amount), 0)
  );

  return {
    aguinaldoAcumulado,
    aguinaldoPagado,
    aguinaldoSaldo: round2(Math.max(0, aguinaldoAcumulado - aguinaldoPagado)),
    vacacionesAcumulado,
    vacacionesTomado,
    vacacionesSaldo: round2(Math.max(0, vacacionesAcumulado - vacacionesTomado)),
    indemnizacionAcumulada,
  };
}

export interface DesglosePagoPendiente {
  bruto: number;
  inss: number;
  ir: number;
  neto: number;
}

/**
 * Retenciones sobre un pago pendiente al momento de la baja (una quincena que
 * no se alcanzó a planillar, un mes adicional, una comisión, etc.), aplicando
 * el Art. 23 de la Ley 822 correctamente para un pago ÚNICO (no recurrente):
 *
 * 1. INSS laboral 7% sobre el monto pendiente, como cualquier ingreso gravable.
 * 2. Se suma la base del pendiente (ya sin INSS) UNA SOLA VEZ a la expectativa
 *    de renta anual del colaborador — no doce veces. Sumarlo doce veces (como
 *    si el pendiente se fuera a repetir cada mes) infla artificialmente la
 *    proyección anual y puede hacerlo cruzar un tramo de IR que un pago único
 *    real nunca cruzaría.
 * 3. Se calcula el impuesto anual con esa expectativa ajustada y se le resta
 *    el impuesto anual que ya le correspondía por su salario regular — esa
 *    diferencia es el IR que genera el pendiente.
 * 4. Como es un pago único y la relación laboral termina aquí, esa diferencia
 *    se retiene COMPLETA en este pago — no se divide entre 12 meses (no hay
 *    próximos meses en los que seguir cobrándola).
 *
 * SIMPLIFICACIÓN: esto asume que el pendiente es el único ingreso adicional
 * del año para ese colaborador. Un contador debe confirmar el cálculo antes
 * de liquidar un caso real, sobre todo si ya hubo otros pagos variables
 * (horas extra, comisiones) en planillas anteriores de este mismo año.
 */
export function calcularRetencionPagoPendiente(
  salarioMensualRegular: number,
  pagoPendienteBruto: number
): DesglosePagoPendiente {
  if (pagoPendienteBruto <= 0) {
    return { bruto: 0, inss: 0, ir: 0, neto: 0 };
  }
  const sinPendiente = calcularIR(salarioMensualRegular);

  const inss = round2(pagoPendienteBruto * INSS_LABORAL);
  const baseImponiblePendiente = round2(pagoPendienteBruto - inss);
  const expectativaAnualConPendiente = round2(sinPendiente.expectativaAnual + baseImponiblePendiente);

  const irAnualConPendiente = impuestoAnualSegunTabla(expectativaAnualConPendiente);
  const ir = round2(Math.max(irAnualConPendiente - sinPendiente.irAnual, 0));

  const neto = round2(pagoPendienteBruto - inss - ir);
  return { bruto: round2(pagoPendienteBruto), inss, ir, neto };
}

export interface DesgloseLiquidacion extends BalanceProvisiones {
  aplicaIndemnizacion: boolean;
  indemnizacion: number;
  pagoPendiente: DesglosePagoPendiente;
  total: number;
}

/**
 * Calcula lo que corresponde pagarle a un colaborador si se le diera de baja
 * hoy con el tipo de terminación indicado, incluyendo cualquier pago
 * pendiente (quincena no planillada, mes adicional, etc.) con sus
 * retenciones de ley. No escribe nada en la base de datos — eso lo hace la
 * acción darDeBaja al confirmar.
 */
export async function calcularLiquidacion(
  employeeId: string,
  terminationType: TerminationTypeKey,
  pagoPendienteBruto: number = 0
): Promise<DesgloseLiquidacion> {
  const [balance, employee] = await Promise.all([
    balanceProvisiones(employeeId),
    prisma.employee.findUnique({ where: { id: employeeId }, select: { grossSalary: true } }),
  ]);
  const aplicaIndemnizacion = aplicaIndemnizacionPorTipo(terminationType);
  const indemnizacion = aplicaIndemnizacion ? balance.indemnizacionAcumulada : 0;
  const pagoPendiente = calcularRetencionPagoPendiente(Number(employee?.grossSalary ?? 0), pagoPendienteBruto);
  const total = round2(balance.aguinaldoSaldo + balance.vacacionesSaldo + indemnizacion + pagoPendiente.neto);
  return { ...balance, aplicaIndemnizacion, indemnizacion, pagoPendiente, total };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
