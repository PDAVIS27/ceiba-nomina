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

// Retención en la fuente a cuenta de IR para servicios profesionales
// prestados por una persona natural residente (Art. 44, numeral 2.5, inciso
// a, Reglamento de la Ley 822 — Decreto 01-2013). No es progresiva como la
// tabla del Art. 23: es un porcentaje fijo sobre todo lo pagado, y sustituye
// por completo el INSS y la tabla de IR laboral para un colaborador en
// TipoContrato.SERVICIOS_PROFESIONALES (ver ese enum en schema.prisma).
// Un contador debe confirmar esta tasa antes de operar con clientes reales,
// igual que el resto de las tasas de este archivo.
export const RETENCION_SERVICIOS_PROFESIONALES = 0.10;

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
/** Impuesto anual según la tarifa progresiva del Art. 23, sobre una expectativa de renta anual ya calculada. */
export function impuestoAnualSegunTabla(expectativaAnual: number): number {
  const tramo = TABLA_IR.find((t) => expectativaAnual <= t.hasta)!;
  return round2(Math.max(tramo.base + (expectativaAnual - tramo.exceso) * tramo.tasa, 0));
}

/**
 * `exentoIR`: para negocios en régimen Cuota Fija (ver src/lib/regimenFiscal.ts)
 * — a pedido explícito del proveedor, no calcula ni retiene IR laboral para
 * ningún colaborador de ese negocio. El INSS laboral (7%) SIEMPRE se calcula
 * igual, sin importar el régimen — es un aporte a la INSS, no un impuesto de
 * la DGI.
 *
 * `tipoCambio`: SOLO para un colaborador pagado en dólares (Employee.moneda
 * "USD" — ver schema.prisma). Los tramos de la Tabla de IR (Art. 23, Ley
 * 822) son montos fijos EN CÓRDOBAS, así que para decidir en qué tramo cae
 * un ingreso en dólares hay que convertir la expectativa anual a córdobas
 * con el tipo de cambio de la corrida (córdobas por 1 dólar). El INSS
 * laboral (7%, tasa fija, no por tramos) NO necesita esto — el 7% de un
 * monto en dólares ya es correcto en dólares sin convertir nada. El
 * resultado (irAnual/irMensual) se devuelve YA CONVERTIDO DE VUELTA a la
 * misma moneda de `brutoMensual`, para poder restarlo del bruto sin más
 * conversiones. Déjalo undefined/0 para un colaborador en córdobas (de
 * siempre) — el comportamiento no cambia en ese caso.
 */
export function calcularIR(brutoMensual: number, exentoIR: boolean = false, tipoCambio?: number): DesgloseIR {
  const inssLaboral = round2(brutoMensual * INSS_LABORAL);
  const baseImponibleMensual = round2(brutoMensual - inssLaboral);
  const expectativaAnual = round2(baseImponibleMensual * 12);
  const factorNIO = tipoCambio && tipoCambio > 0 ? tipoCambio : 1;
  const expectativaAnualNIO = round2(expectativaAnual * factorNIO);
  const tramo = TABLA_IR.find((t) => expectativaAnualNIO <= t.hasta)!;
  const irAnualNIO = exentoIR ? 0 : impuestoAnualSegunTabla(expectativaAnualNIO);
  const irAnual = factorNIO !== 1 ? round2(irAnualNIO / factorNIO) : irAnualNIO;
  const irMensual = exentoIR ? 0 : round2(irAnual / 12);
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

// ---------------------------------------------------------------------------
// Versiones POR DÍA de las tres provisiones de arriba — para prorratear el
// tramo final de un colaborador que sale a mitad de un período (ver
// src/lib/provisiones.ts). Usan la misma convención de 30 días por mes / 360
// por año que ya usa valorHoraOrdinaria().
// ---------------------------------------------------------------------------

/** Aguinaldo por una cantidad exacta de días trabajados (salario/360 por día). */
export function provisionAguinaldoPorDias(salarioMensual: number, dias: number): number {
  return round2((salarioMensual / 360) * Math.max(dias, 0));
}

/** Vacaciones por una cantidad exacta de días trabajados (salario/360 por día). */
export function provisionVacacionesPorDias(salarioMensual: number, dias: number): number {
  return round2((salarioMensual / 360) * Math.max(dias, 0));
}

/**
 * Indemnización por antigüedad para un tramo de días, usando la tasa del año
 * de antigüedad vigente AL INICIAR ese tramo (30 días/año los primeros 3
 * años, 20 días/año del 4 al 6, nada después del año 6). Asume que el tramo
 * completo de días cae dentro del mismo año de antigüedad — razonable porque
 * este tramo suele ser de pocos días (el resto del período en que sale el
 * colaborador, no meses enteros).
 */
export function provisionIndemnizacionPorDias(
  salarioMensual: number,
  antiguedadMesesAlIniciarTramo: number,
  dias: number
): number {
  if (antiguedadMesesAlIniciarTramo >= 72 || dias <= 0) return 0;
  const anioEnCurso = Math.floor(antiguedadMesesAlIniciarTramo / 12) + 1;
  const diasPorAnio = anioEnCurso <= 3 ? 30 : 20;
  return round2((salarioMensual / 30) * (diasPorAnio / 360) * dias);
}

export type TipoContratoKey = "LABORAL" | "SERVICIOS_PROFESIONALES";

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
  otrasDeducciones: number;
  otrasDeduccionesConcepto: string | null;
  netoPagar: number;
  // true si este período se calculó como servicios profesionales (retención
  // fija de 10%, sin INSS) en vez del cálculo laboral de siempre — útil para
  // que la interfaz muestre la etiqueta correcta sin tener que repetir la
  // comparación de tipoContrato en cada página.
  esServiciosProfesionales: boolean;
  // "NIO" (de siempre) o "USD" — en qué moneda están TODOS los montos de
  // este desglose (bruto, provisiones, inssLaboral, irMensual, netoPagar).
  moneda: MonedaKey;
  // Tipo de cambio (córdobas por 1 dólar) que de verdad se usó para el
  // cálculo de IR — solo cuando moneda es "USD" y se indicó uno válido al
  // correr la planilla; undefined en cualquier otro caso.
  tipoCambioAplicado?: number;
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
// SEMANAL: semana completa (7/30 del mes) — incluye el séptimo día de
// descanso pagado (Art. 64 CT), sin importar si el colaborador trabaja 5 o
// 6 días esa semana. Es el caso normal en Nicaragua.
// SEMANAL_5: SOLO los 5 días realmente trabajados de lunes a viernes (5/30
// del mes), sin nada por el fin de semana — a pedido explícito del negocio
// para un colaborador con el que de verdad se acordó pagar únicamente por
// día trabajado, sin descanso semanal pagado. Ver el comentario de
// `periodicidad` más abajo.
export type PeriodicidadKey = "MENSUAL" | "QUINCENAL" | "SEMANAL" | "SEMANAL_5";
export type MonedaKey = "NIO" | "USD";

/** Normaliza un valor suelto (de un campo de formulario, o de Employee/Payslip.periodicidad en la base) a un PeriodicidadKey válido — MENSUAL por defecto si no lo es. Única fuente de verdad para este chequeo: úsala en vez de repetir el ternario en cada página/acción. */
export function normalizarPeriodicidad(raw: unknown): PeriodicidadKey {
  if (raw === "QUINCENAL") return "QUINCENAL";
  if (raw === "SEMANAL") return "SEMANAL";
  if (raw === "SEMANAL_5") return "SEMANAL_5";
  return "MENSUAL";
}

export function calcularPeriodo(params: {
  // SIEMPRE el salario mensual de referencia, sin importar `periodicidad` —
  // nunca lo dividas tú mismo antes de llamar esta función. Si
  // `periodicidad` es QUINCENAL o SEMANAL, esta función prorratea
  // internamente la base salarial y las provisiones (ver más abajo); el
  // valor de la hora extra también sigue derivándose de este salario
  // mensual completo (Art. 62/65 CT: salario/30/8), no del monto ya
  // prorrateado. Está en la moneda de `moneda` (ver más abajo) — un
  // colaborador en USD tiene aquí su salario mensual en dólares, no en
  // córdobas.
  bruto: number;
  // Monto YA correspondiente a este período específico (no mensual) — así
  // ya lo pide la plantilla de Excel para estas columnas.
  horasExtraCantidad?: number;
  comisiones?: number;
  retroactivos?: number;
  viaticos?: number;
  antiguedadMeses?: number;
  otrasDeducciones?: number;
  otrasDeduccionesConcepto?: string | null;
  // MENSUAL (por defecto, sin cambios de comportamiento), QUINCENAL,
  // SEMANAL o SEMANAL_5 (ver el comentario de PeriodicidadKey arriba). En
  // QUINCENAL/SEMANAL/SEMANAL_5, la base salarial y las provisiones de este
  // período se prorratean (15/30, 7/30 o 5/30 del mes), y el IR se proyecta
  // sobre 24 quincenas o 52 semanas al año en vez de 12 meses — así el
  // salario mensual de referencia nunca cambia en Colaboradores/Excel, y no
  // hay que calcular la parte a mano. Tanto SEMANAL como SEMANAL_5 usan 52
  // pagos/año (hay 52 viernes de pago al año sin importar si cada uno cubre
  // 5 o 7 días) — igual de simple que el resto de este motor ("proyección
  // simple", ver comentario de la función).
  periodicidad?: PeriodicidadKey;
  // "NIO" (por defecto, córdobas) o "USD" (dólares) — Employee.moneda. Todos
  // los montos de entrada (bruto, comisiones, retroactivos, viáticos, otras
  // deducciones) deben venir en ESTA moneda; el resultado completo también
  // queda en esta moneda.
  moneda?: MonedaKey;
  // Tipo de cambio (córdobas por 1 dólar) del día de esta corrida — SOLO
  // relevante cuando moneda es "USD" (se ignora para NIO). Necesario porque
  // la tabla progresiva de IR (Art. 23, Ley 822) usa tramos en córdobas; sin
  // un tipo de cambio válido, un colaborador en USD NO se le retiene IR (se
  // trata como si no se pudiera calcular) — por eso la interfaz de Correr
  // nómina exige este dato antes de dejar correr una planilla con
  // colaboradores en dólares. El INSS laboral (7%, tasa fija) no lo necesita.
  tipoCambio?: number;
  // Negocio en régimen Cuota Fija — ver comentario de calcularIR() arriba.
  // También exonera la retención fija de servicios profesionales (ver más
  // abajo). Base legal verificada: Art. 259 de la Ley 822 (LCT, dentro del
  // capítulo del Régimen Simplificado de Cuota Fija) establece expresamente
  // que estos contribuyentes "no están obligados a realizar anticipos ni
  // retenciones a cuenta del Impuesto sobre la Renta (IR)". Como respaldo
  // adicional: el Art. 44 del Reglamento de la Ley 822 (Decreto 01-2013)
  // liga la obligación general de retener a los "contribuyentes del régimen
  // general" — un negocio en Cuota Fija no lo es — y su numeral 2.5, inciso
  // a) es la norma que fija el 10% para servicios profesionales de persona
  // natural residente quien SÍ debe retener.
  exentoIR?: boolean;
  // LABORAL (por defecto) o SERVICIOS_PROFESIONALES — ver TipoContrato en
  // schema.prisma. SERVICIOS_PROFESIONALES ignora la tabla progresiva:
  // retiene el 10% fijo sobre todo lo pagado, sin INSS — salvo que exentoIR
  // sea true (Cuota Fija), caso en el que no retiene nada, igual que ya
  // ocurre con el IR laboral.
  tipoContrato?: TipoContratoKey;
  // Si acumula aguinaldo/vacaciones/indemnización este período — decisión
  // del negocio por colaborador (Employee.acumulaPrestaciones),
  // INDEPENDIENTE del tipo de contrato. Por defecto true para LABORAL (lo
  // que corresponde por ley) y false para SERVICIOS_PROFESIONALES (no es un
  // derecho de esa relación civil/mercantil) — pero un negocio puede
  // activarlo a mano para un colaborador de servicios profesionales al que,
  // en la práctica, sí le reconoce esas prestaciones.
  acumulaPrestaciones?: boolean;
}): DesglosePeriodo {
  const salarioMensualReferencia = params.bruto;
  const horasExtraCantidad = params.horasExtraCantidad || 0;
  const comisiones = params.comisiones || 0;
  const retroactivos = params.retroactivos || 0;
  const viaticos = params.viaticos || 0;
  const antiguedadMeses = params.antiguedadMeses || 0;
  const otrasDeducciones = Math.max(params.otrasDeducciones || 0, 0);
  const otrasDeduccionesConcepto = otrasDeducciones > 0 ? (params.otrasDeduccionesConcepto || null) : null;
  const exentoIR = params.exentoIR || false;
  const esServiciosProfesionales = params.tipoContrato === "SERVICIOS_PROFESIONALES";
  const acumulaPrestaciones = params.acumulaPrestaciones ?? !esServiciosProfesionales;
  const periodicidad = params.periodicidad ?? "MENSUAL";
  const moneda: MonedaKey = params.moneda === "USD" ? "USD" : "NIO";
  // Tipo de cambio válido solo si viene un número mayor que cero — igual que
  // en calcularIR(), un USD sin tipo de cambio se trata como "no se puede
  // ubicar el tramo de IR en córdobas" (ver más abajo), nunca se inventa uno.
  const tipoCambio = moneda === "USD" && params.tipoCambio && params.tipoCambio > 0 ? params.tipoCambio : undefined;
  // Días de referencia para prorratear provisiones con las mismas funciones
  // *PorDias que ya usa src/lib/provisiones.ts para la liquidación — con 30
  // días dan exactamente lo mismo que provisionAguinaldo()/Vacaciones()/
  // Indemnizacion() de siempre (salarioMensual/360 × 30 = salarioMensual/12),
  // así que MENSUAL queda bit a bit igual que antes de este cambio.
  const diasDelPeriodo =
    periodicidad === "SEMANAL_5" ? 5 : periodicidad === "SEMANAL" ? 7 : periodicidad === "QUINCENAL" ? 15 : 30;
  // Solo la BASE salarial se prorratea — horas extra, comisiones,
  // retroactivos, viáticos y otras deducciones ya vienen como montos de ESTE
  // período (así lo pide la plantilla de Excel), no se tocan.
  const baseSalarialDelPeriodo = round2(salarioMensualReferencia * (diasDelPeriodo / 30));
  // Cuántos de estos períodos hay en un año — para proyectar la expectativa
  // anual de renta sobre la que se aplica la tarifa progresiva del Art. 23 (o
  // el 10% fijo), igual que ya se hacía para un mes, pero generalizado.
  // SEMANAL y SEMANAL_5 usan 52 (aproximación estándar, ver comentario de
  // `periodicidad` en los parámetros de la función) — da igual si cada pago
  // cubre 5 o 7 días, lo que importa aquí es cuántos pagos hay al año.
  const periodosPorAnio =
    periodicidad === "SEMANAL" || periodicidad === "SEMANAL_5" ? 52 : periodicidad === "QUINCENAL" ? 24 : 12;

  const horasExtraMonto = calcularHorasExtra(salarioMensualReferencia, horasExtraCantidad);
  const totalGravable = round2(baseSalarialDelPeriodo + horasExtraMonto + comisiones + retroactivos);

  let inssLaboral: number;
  let baseImponibleMensual: number;
  let expectativaAnual: number;
  let tramo: TramoIR;
  let irAnual: number;
  let irMensual: number;

  if (esServiciosProfesionales) {
    // Sin relación de subordinación: no hay INSS, y la retención es un
    // porcentaje fijo sobre todo lo pagado, no la tabla progresiva del
    // Art. 23 (esa tabla es solo para rentas del trabajo en relación de
    // dependencia). Ver RETENCION_SERVICIOS_PROFESIONALES arriba. Al ser un
    // porcentaje fijo (no por tramos), funciona igual sin importar la
    // moneda — no hace falta convertir nada aquí, a diferencia del caso
    // laboral de abajo.
    //
    // Si exentoIR (Cuota Fija) está activo, tampoco se retiene esto — ver la
    // base legal verificada (Art. 259 LCT) en el comentario de `exentoIR`
    // más arriba.
    inssLaboral = 0;
    baseImponibleMensual = totalGravable;
    expectativaAnual = 0;
    tramo = { hasta: Infinity, base: 0, tasa: exentoIR ? 0 : RETENCION_SERVICIOS_PROFESIONALES, exceso: 0 };
    irMensual = exentoIR ? 0 : round2(totalGravable * RETENCION_SERVICIOS_PROFESIONALES);
    irAnual = round2(irMensual * periodosPorAnio);
  } else {
    // INSS laboral: 7% fijo, no por tramos — correcto en cualquier moneda
    // sin convertir nada (7% de US$ ya es correcto en dólares).
    inssLaboral = round2(totalGravable * INSS_LABORAL);
    baseImponibleMensual = round2(totalGravable - inssLaboral);
    expectativaAnual = round2(baseImponibleMensual * periodosPorAnio);
    // La Tabla de IR (Art. 23, Ley 822) sí tiene tramos fijos EN CÓRDOBAS —
    // para un colaborador en USD hay que convertir la expectativa anual a
    // córdobas SOLO para ubicar el tramo y calcular el impuesto anual, y
    // luego devolver ese impuesto ya convertido de vuelta a dólares (para
    // poder restarlo del bruto sin más conversiones). Sin un tipo de cambio
    // válido, un colaborador en USD queda sin IR calculado (factorNIO = 1
    // trataría dólares como si fueran córdobas, subestimando muchísimo el
    // tramo) — la interfaz de Correr nómina exige este dato antes de dejar
    // avanzar una corrida con colaboradores en dólares.
    const factorNIO = tipoCambio ?? 1;
    const expectativaAnualNIO = round2(expectativaAnual * factorNIO);
    tramo = TABLA_IR.find((t) => expectativaAnualNIO <= t.hasta)!;
    const irAnualNIO = exentoIR
      ? 0
      : round2(Math.max(tramo.base + (expectativaAnualNIO - tramo.exceso) * tramo.tasa, 0));
    irAnual = factorNIO !== 1 ? round2(irAnualNIO / factorNIO) : irAnualNIO;
    irMensual = exentoIR ? 0 : round2(irAnual / periodosPorAnio);
  }

  const provAguinaldo = acumulaPrestaciones ? provisionAguinaldoPorDias(salarioMensualReferencia, diasDelPeriodo) : 0;
  const provVacaciones = acumulaPrestaciones ? provisionVacacionesPorDias(salarioMensualReferencia, diasDelPeriodo) : 0;
  const provIndemnizacion = acumulaPrestaciones
    ? provisionIndemnizacionPorDias(salarioMensualReferencia, antiguedadMeses, diasDelPeriodo)
    : 0;

  const totalDevengado = round2(totalGravable + viaticos);
  // Otras deducciones (no son de ley: error de pago, faltas, llegadas tardías,
  // etc.) se restan directo del neto — NO afectan la base gravable ni el
  // cálculo de INSS/IR, que son solo de ley.
  const netoPagar = round2(totalDevengado - inssLaboral - irMensual - otrasDeducciones);

  return {
    // La base salarial REAL de este período (ya prorrateada si es
    // QUINCENAL) — lo que efectivamente se le paga y se guarda en el
    // comprobante, no el salario mensual de referencia sin tocar.
    bruto: baseSalarialDelPeriodo,
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
    otrasDeducciones,
    otrasDeduccionesConcepto,
    netoPagar,
    esServiciosProfesionales,
    moneda,
    tipoCambioAplicado: tipoCambio,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
