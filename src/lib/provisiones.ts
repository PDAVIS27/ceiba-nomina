// ---------------------------------------------------------------------------
// Histórico de provisiones laborales por colaborador (aguinaldo, vacaciones,
// indemnización) y cálculo de la liquidación final al dar de baja.
//
// CÓMO SE ACUMULA:
// 1) Cada vez que se aprueba una planilla (PayrollPeriod con status
//    "APROBADA"), el Payslip de ese colaborador ya trae guardado cuánto se
//    provisionó en ese período (ver src/lib/payroll.ts). Eso se SUMA como
//    base del acumulado.
// 2) Además, se PRORRATEA por día el tramo entre el fin de la última planilla
//    aprobada (su `periodEnd`) y la fecha de corte solicitada (hoy, o la
//    fecha de baja) — así un colaborador que sale a mitad de un período no
//    pierde esos días sueltos. Si una planilla vieja no tiene `periodEnd`
//    guardado (periodos creados antes de este campo), se usa su `createdAt`
//    como aproximación de hasta dónde llegaba cubierto.
//
// PAGOS Y DISFRUTE: el aguinaldo pagado en diciembre y las vacaciones tomadas
// se registran como ProvisionMovement y se restan del acumulado para dar el
// "saldo" pendiente. La indemnización no tiene pagos parciales — solo se
// liquida una vez, al dar de baja.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/prisma";
import {
  calcularIR,
  calcularHorasExtra,
  provisionAguinaldoPorDias,
  provisionVacacionesPorDias,
  provisionIndemnizacionPorDias,
} from "@/lib/payroll";
import { mesesEntre, diasEntre360 } from "@/lib/dateUtils";

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
  // Salario bruto mensual actual del colaborador — se usa para valorar horas
  // extra pendientes al momento de la baja. 0 si el colaborador no existe.
  salarioActual: number;
  aguinaldoAcumulado: number;
  aguinaldoPagado: number;
  aguinaldoSaldo: number;
  vacacionesAcumulado: number;
  vacacionesTomado: number;
  vacacionesSaldo: number;
  // Total acumulado a la fecha de corte — es lo que se pagaría por
  // indemnización SI la baja aplicara (ver aplicaIndemnizacionPorTipo).
  indemnizacionAcumulada: number;
  // Días sueltos (después de la última planilla aprobada) que se
  // prorratearon por día para llegar a la fecha de corte. 0 si la fecha de
  // corte ya estaba cubierta por una planilla aprobada, o si el colaborador
  // no tiene planillas ni fecha de ingreso registrada.
  diasProrrateados: number;
}

/**
 * Acumulado de provisiones de un colaborador hasta la fecha `hasta`
 * (por defecto, hoy). Para un colaborador dado de baja, pásale su fecha de
 * baja para "congelar" el cálculo ahí en vez de seguir corriendo hasta hoy.
 */
export async function balanceProvisiones(employeeId: string, hasta: Date = new Date()): Promise<BalanceProvisiones> {
  const [employee, payslips, movimientos] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId } }),
    prisma.payslip.findMany({
      where: { employeeId, period: { status: "APROBADA" } },
      select: {
        provisionAguinaldo: true,
        provisionVacaciones: true,
        provisionIndemnizacion: true,
        createdAt: true,
        period: { select: { periodEnd: true } },
      },
    }),
    prisma.provisionMovement.findMany({ where: { employeeId } }),
  ]);

  const aguinaldoDePlanillas = round2(payslips.reduce((a, p) => a + Number(p.provisionAguinaldo), 0));
  const vacacionesDePlanillas = round2(payslips.reduce((a, p) => a + Number(p.provisionVacaciones), 0));
  const indemnizacionDePlanillas = round2(payslips.reduce((a, p) => a + Number(p.provisionIndemnizacion), 0));

  // Prorrateo del tramo final: desde el día siguiente al fin de la última
  // planilla aprobada (o desde su fecha de ingreso, si nunca se le ha
  // corrido una) hasta la fecha de corte — para no perder los días sueltos
  // de un colaborador que sale a mitad de un período.
  let diasProrrateados = 0;
  let aguinaldoProrrateo = 0;
  let vacacionesProrrateo = 0;
  let indemnizacionProrrateo = 0;

  if (employee) {
    const fechasCobertura = payslips.map((p) => p.period.periodEnd ?? p.createdAt);
    const ultimaFechaCubierta =
      fechasCobertura.length > 0 ? new Date(Math.max(...fechasCobertura.map((d) => d.getTime()))) : null;

    const desde = ultimaFechaCubierta
      ? new Date(ultimaFechaCubierta.getTime() + 24 * 60 * 60 * 1000)
      : new Date(employee.startDate);

    if (desde <= hasta) {
      const dias = diasEntre360(desde, hasta) + 1;
      if (dias > 0) {
        const salario = Number(employee.grossSalary);
        const mesesAlIniciarTramo = mesesEntre(new Date(employee.startDate), desde);
        diasProrrateados = dias;
        aguinaldoProrrateo = provisionAguinaldoPorDias(salario, dias);
        vacacionesProrrateo = provisionVacacionesPorDias(salario, dias);
        indemnizacionProrrateo = provisionIndemnizacionPorDias(salario, mesesAlIniciarTramo, dias);
      }
    }
  }

  const aguinaldoAcumulado = round2(aguinaldoDePlanillas + aguinaldoProrrateo);
  const vacacionesAcumulado = round2(vacacionesDePlanillas + vacacionesProrrateo);
  const indemnizacionAcumulada = round2(indemnizacionDePlanillas + indemnizacionProrrateo);

  const aguinaldoPagado = round2(
    movimientos.filter((m) => m.tipo === "AGUINALDO").reduce((a, m) => a + Number(m.amount), 0)
  );
  const vacacionesTomado = round2(
    movimientos.filter((m) => m.tipo === "VACACIONES").reduce((a, m) => a + Number(m.amount), 0)
  );

  return {
    salarioActual: employee ? Number(employee.grossSalary) : 0,
    aguinaldoAcumulado,
    aguinaldoPagado,
    aguinaldoSaldo: round2(Math.max(0, aguinaldoAcumulado - aguinaldoPagado)),
    vacacionesAcumulado,
    vacacionesTomado,
    vacacionesSaldo: round2(Math.max(0, vacacionesAcumulado - vacacionesTomado)),
    indemnizacionAcumulada,
    diasProrrateados,
  };
}

export interface DesgloseRetencion {
  bruto: number;
  inss: number;
  ir: number;
  neto: number;
}

/**
 * Retenciones sobre un monto gravable que se paga como si fuera, él solo, el
 * salario de un período — INSS laboral 7%, base imponible, expectativa de
 * renta anual (base × 12) y tarifa progresiva del Art. 23 (Ley 822) sobre esa
 * expectativa. Es EXACTAMENTE la misma fórmula que calcularIR() usa para la
 * planilla normal.
 *
 * NO se combina con el salario regular del colaborador ni con lo que ya haya
 * ganado en el año: el monto se evalúa de forma independiente contra la
 * tabla, igual que se evaluaría un cheque aparte. Por eso montos pequeños
 * casi siempre caen enteros en el tramo exento (hasta C$100,000 de
 * expectativa anual) y no generan IR, mientras que un monto grande se grava
 * igual que un mes normal de ese mismo salario.
 *
 * SIMPLIFICACIÓN: si el colaborador ya tuvo otros ingresos variables altos
 * en planillas anteriores de este mismo año, el método acumulativo del
 * Reglamento pediría sumarlos todos antes de aplicar la tabla — esta
 * plataforma no lleva ese acumulado interanual. Un contador debe confirmar
 * el cálculo antes de liquidar un caso real.
 */
export function calcularRetencionIndependiente(bruto: number, exentoIR: boolean = false): DesgloseRetencion {
  if (bruto <= 0) {
    return { bruto: 0, inss: 0, ir: 0, neto: 0 };
  }
  const d = calcularIR(bruto, exentoIR);
  return { bruto: round2(bruto), inss: d.inssLaboral, ir: d.irMensual, neto: d.neto };
}

export interface PagoPendienteItem {
  concepto: string;
  monto: number;
}

export interface DesgloseLiquidacion extends BalanceProvisiones {
  aplicaIndemnizacion: boolean;
  indemnizacion: number;
  // Horas extra pendientes de pagar al momento de la baja (Art. 62/65 CT,
  // recargo del 100%) — valoradas con el salario actual del colaborador. El
  // monto también forma parte de gravable.bruto, más abajo.
  horasExtraCantidad: number;
  horasExtraMonto: number;
  // Cada concepto de pago pendiente por separado, para mostrarlo desglosado
  // (el monto de cada uno también forma parte de gravable.bruto, más abajo).
  pagosPendientes: PagoPendienteItem[];
  // Vacaciones pendientes (balance.vacacionesSaldo) + horas extra pendientes
  // + todos los pagos pendientes, sumados en UNA sola base gravable — así se
  // paga en la práctica un solo cheque de liquidación, y así lo calculan
  // también los formatos reales de liquidación (ej. el de Grupo STT): el
  // aguinaldo y la indemnización quedan FUERA de esta base porque están
  // exentos de ley (Art. 97 y Art. 45 CT); vacaciones, horas extra y pagos
  // pendientes sí son gravables, se suman, y el INSS laboral (7%) y el IR se
  // calculan UNA sola vez sobre ese total combinado — no por separado.
  gravable: DesgloseRetencion;
  // Suma de TODOS los ingresos de la liquidación (exentos + gravables),
  // antes de cualquier retención — útil para mostrar un renglón de "Total
  // ingresos" igual que en un comprobante de liquidación tradicional.
  totalIngresos: number;
  total: number;
}

/**
 * Calcula lo que corresponde pagarle a un colaborador si se le diera de baja
 * en `terminatedAt` con el tipo de terminación indicado, incluyendo
 * cualquier pago pendiente (quincena no planillada, mes adicional, comisión,
 * etc. — pueden ser varios conceptos a la vez) con sus retenciones de ley.
 * Las provisiones se calculan CONGELADAS a esa fecha (no a hoy),
 * prorrateando por día el tramo desde la última planilla aprobada. No
 * escribe nada en la base de datos — eso lo hace la acción darDeBaja al
 * confirmar.
 *
 * Vacaciones pendientes y los pagos pendientes se pagan juntos en el mismo
 * cheque de liquidación, así que se SUMAN en una sola base gravable y la
 * retención de Ley 822 se calcula UNA sola vez sobre ese total combinado (no
 * una vez por concepto) — así es como de verdad se paga en la práctica, y
 * así lo hacen los formatos reales de liquidación.
 */
export async function calcularLiquidacion(
  employeeId: string,
  terminationType: TerminationTypeKey,
  terminatedAt: Date,
  pagosPendientes: PagoPendienteItem[] = [],
  horasExtraCantidad: number = 0,
  exentoIR: boolean = false
): Promise<DesgloseLiquidacion> {
  const balance = await balanceProvisiones(employeeId, terminatedAt);
  const aplicaIndemnizacion = aplicaIndemnizacionPorTipo(terminationType);
  const indemnizacion = aplicaIndemnizacion ? balance.indemnizacionAcumulada : 0;

  const horasExtraMonto = round2(calcularHorasExtra(balance.salarioActual, Math.max(horasExtraCantidad, 0)));

  const pagoPendienteBrutoTotal = round2(
    pagosPendientes.reduce((a, p) => a + Math.max(p.monto, 0), 0)
  );
  const gravableBruto = round2(balance.vacacionesSaldo + horasExtraMonto + pagoPendienteBrutoTotal);
  const gravable = calcularRetencionIndependiente(gravableBruto, exentoIR);

  const totalIngresos = round2(balance.aguinaldoSaldo + gravableBruto + indemnizacion);
  const total = round2(balance.aguinaldoSaldo + indemnizacion + gravable.neto);

  return {
    ...balance,
    aplicaIndemnizacion,
    indemnizacion,
    horasExtraCantidad: Math.max(horasExtraCantidad, 0),
    horasExtraMonto,
    pagosPendientes,
    gravable,
    totalIngresos,
    total,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
