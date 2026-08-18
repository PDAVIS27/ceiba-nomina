// ---------------------------------------------------------------------------
// Cálculo de nómina según la ley nicaragüense.
// Fuente: Art. 23, Ley No. 822 (Ley de Concertación Tributaria), reformado
// por el Art. 5 de la Ley No. 891 · Art. 19 de su Reglamento (método de
// proyección simple para salario fijo) · INSS laboral 7% fijo ·
// INSS patronal 21.5% (<50 colaboradores) / 22.5% (>=50) · INATEC 2% (Ley 90).
//
// Esta fórmula fue verificada contra un ejemplo de cálculo documentado:
// base imponible mensual C$18,750 -> expectativa anual C$225,000 ->
// impuesto anual C$20,000 -> retención mensual C$1,666.67. Coincide exacto.
//
// IMPORTANTE: estos parámetros pueden cambiar por reforma legal o resolución
// administrativa. Un contador o abogado laboral debe validarlos antes de
// operar con clientes reales, y hay que actualizarlos aquí si la ley cambia.
// ---------------------------------------------------------------------------

export const INSS_LABORAL = 0.07;
export const INATEC = 0.02;
export const INSS_PATRONAL_PEQUENA = 0.215; // < 50 colaboradores
export const INSS_PATRONAL_GRANDE = 0.225; // >= 50 colaboradores

export interface TramoIR {
  hasta: number;
  base: number;
  tasa: number;
  exceso: number;
}

// Tarifa progresiva anual, Art. 23 Ley 822.
export const TABLA_IR: TramoIR[] = [
  { hasta: 100000, base: 0, tasa: 0.0, exceso: 0 },
  { hasta: 200000, base: 0, tasa: 0.15, exceso: 100000 },
  { hasta: 350000, base: 15000, tasa: 0.2, exceso: 200000 },
  { hasta: 500000, base: 45000, tasa: 0.25, exceso: 350000 },
  { hasta: Infinity, base: 82500, tasa: 0.3, exceso: 500000 },
];

export function inssPatronalRate(employeeCount: number): number {
  return employeeCount >= 50 ? INSS_PATRONAL_GRANDE : INSS_PATRONAL_PEQUENA;
}

export interface DesgloseIR {
  bruto: number;
  inssLaboral: number;
  baseImponibleMensual: number;
  expectativaAnual: number;
  tramo: TramoIR;
  irAnual: number;
  irMensual: number;
  neto: number;
}

/**
 * Calcula la retención mensual de IR sobre un salario bruto mensual FIJO.
 * No cubre: salario variable/comisiones, aguinaldo, vacaciones, indemnizaciones
 * ni doble empleador — esos casos requieren revisión manual (ver SupportCase).
 */
export function calcularIR(brutoMensual: number): DesgloseIR {
  const inssLaboral = round2(brutoMensual * INSS_LABORAL);
  const baseImponibleMensual = round2(brutoMensual - inssLaboral);
  const expectativaAnual = round2(baseImponibleMensual * 12);
  const tramo = TABLA_IR.find((t) => expectativaAnual <= t.hasta)!;
  const irAnual = round2(
    Math.max(tramo.base + (expectativaAnual - tramo.exceso) * tramo.tasa, 0)
  );
  const irMensual = round2(irAnual / 12);
  const neto = round2(brutoMensual - inssLaboral - irMensual);
  return {
    bruto: brutoMensual,
    inssLaboral,
    baseImponibleMensual,
    expectativaAnual,
    tramo,
    irAnual,
    irMensual,
    neto,
  };
}

export function costoPatronalMensual(
  totalBrutoPlanilla: number,
  employeeCount: number
) {
  const tasaPatronal = inssPatronalRate(employeeCount);
  return round2(totalBrutoPlanilla * (tasaPatronal + INATEC));
}

// ---------------------------------------------------------------------------
// Horas extra y provisiones laborales — Código del Trabajo (Ley No. 185).
//
// Horas extra: Art. 62 y 65 CT — recargo del 100% (se paga el doble de la
// hora ordinaria). Límite legal: 3 horas diarias / 9 semanales — la
// plataforma no impone ese límite, es responsabilidad del negocio respetarlo.
//
// Aguinaldo (Art. 93-99 CT): se acumula 1/12 del salario mensual cada mes.
// Totalmente EXENTO de INSS e IR (Art. 97 CT).
//
// Vacaciones (Art. 76-82 CT): se acumula 1/12 del salario mensual (2.5 días
// por mes). A diferencia del aguinaldo, SÍ paga INSS e IR al disfrutarse.
//
// Indemnización por antigüedad (Art. 45 CT): 30 días de salario por cada uno
// de los primeros 3 años trabajados, 20 días por cada año del 4 al 6, con un
// tope de 5 meses de salario (150 días) — no se acumula más allá de 6 años
// de antigüedad. Exenta de INSS e IR.
//
// Estas son provisiones contables (lo que el negocio va acumulando como
// obligación futura), no necesariamente el pago en efectivo del mes: el
// aguinaldo se paga en diciembre, las vacaciones cuando se disfrutan, y la
// indemnización solo al terminar la relación laboral.
// ---------------------------------------------------------------------------

export function valorHoraOrdinaria(salarioMensual: number): number {
  return salarioMensual / 30 / 8;
}

/** Art. 62/65 CT: recargo del 100% sobre el valor de la hora ordinaria. */
export function calcularHorasExtra(salarioMensual: number, horas: number): number {
  const valorHora = valorHoraOrdinaria(salarioMensual);
  return round2(valorHora * 2 * horas);
}

/** Art. 93-99 CT: 1/12 del salario mensual, exenta de INSS e IR. */
export function provisionAguinaldo(salarioMensual: number): number {
  return round2(salarioMensual / 12);
}

/** Art. 76-82 CT: 1/12 del salario mensual (2.5 días/mes). Sí paga INSS e IR al disfrutarse. */
export function provisionVacaciones(salarioMensual: number): number {
  return round2(salarioMensual / 12);
}

/**
 * Art. 45 CT: escala progresiva de indemnización por antigüedad.
 * Años 1-3: 30 días de salario por año. Años 4-6: 20 días de salario por año.
 * Tope: 5 meses de salario (150 días) — se alcanza exactamente a los 6 años,
 * así que no se provisiona más después de ese punto.
 */
export function provisionIndemnizacion(salarioMensual: number, antiguedadMeses: number): number {
  if (antiguedadMeses >= 72) return 0; // tope de 5 meses ya cubierto a los 6 años
  const anioEnCurso = Math.floor(antiguedadMeses / 12) + 1;
  const diasPorAnio = anioEnCurso <= 3 ? 30 : 20;
  const diasMensuales = diasPorAnio / 12;
  return round2((salarioMensual / 30) * diasMensuales);
}

export interface DesglosePeriodo {
  bruto: number;
  horasExtraCantidad: number;
  horasExtraMonto: number;
  comisiones: number;
  retroactivos: number;
  viaticos: number;
  totalGravable: number;
  inssLaboral: number;
  baseImponibleMensual: number;
  expectativaAnual: number;
  tramo: TramoIR;
  irAnual: number;
  irMensual: number;
  provisionAguinaldo: number;
  provisionVacaciones: number;
  provisionIndemnizacion: number;
  totalDevengado: number;
  netoPagar: number;
}

/**
 * Cálculo completo de un período de planilla para un colaborador, incluyendo
 * horas extra, comisiones y retroactivos (gravables), viáticos (no gravable)
 * y las provisiones laborales del mes.
 *
 * SIMPLIFICACIÓN IMPORTANTE: para horas extra, comisiones y retroactivos
 * (ingreso variable), el Reglamento de la Ley 822 contempla un método de
 * retención acumulativa más preciso (año a año, ajustando lo ya retenido).
 * Esta plataforma usa, por ahora, una proyección simple del ingreso de ESTE
 * período × 12 — es una aproximación razonable pero no el método acumulativo
 * completo. Un contador debe confirmar si esto es aceptable antes de usarlo
 * con clientes reales.
 */
export function calcularPeriodo(params: {
  bruto: number;
  horasExtraCantidad?: number;
  comisiones?: number;
  retroactivos?: number;
  viaticos?: number;
  antiguedadMeses?: number;
}): DesglosePeriodo {
  const bruto = params.bruto;
  const horasExtraCantidad = params.horasExtraCantidad || 0;
  const comisiones = params.comisiones || 0;
  const retroactivos = params.retroactivos || 0;
  const viaticos = params.viaticos || 0;
  const antiguedadMeses = params.antiguedadMeses || 0;

  const horasExtraMonto = calcularHorasExtra(bruto, horasExtraCantidad);
  const totalGravable = round2(bruto + horasExtraMonto + comisiones + retroactivos);

  const inssLaboral = round2(totalGravable * INSS_LABORAL);
  const baseImponibleMensual = round2(totalGravable - inssLaboral);
  const expectativaAnual = round2(baseImponibleMensual * 12);
  const tramo = TABLA_IR.find((t) => expectativaAnual <= t.hasta)!;
  const irAnual = round2(
    Math.max(tramo.base + (expectativaAnual - tramo.exceso) * tramo.tasa, 0)
  );
  const irMensual = round2(irAnual / 12);

  const provAguinaldo = provisionAguinaldo(bruto);
  const provVacaciones = provisionVacaciones(bruto);
  const provIndemnizacion = provisionIndemnizacion(bruto, antiguedadMeses);

  const totalDevengado = round2(totalGravable + viaticos);
  const netoPagar = round2(totalDevengado - inssLaboral - irMensual);

  return {
    bruto,
    horasExtraCantidad,
    horasExtraMonto,
    comisiones,
    retroactivos,
    viaticos,
    totalGravable,
    inssLaboral,
    baseImponibleMensual,
    expectativaAnual,
    tramo,
    irAnual,
    irMensual,
    provisionAguinaldo: provAguinaldo,
    provisionVacaciones: provVacaciones,
    provisionIndemnizacion: provIndemnizacion,
    totalDevengado,
    netoPagar,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
