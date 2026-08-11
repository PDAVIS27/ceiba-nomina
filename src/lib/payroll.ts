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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
