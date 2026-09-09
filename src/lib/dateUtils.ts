export function mesesEntre(desde: Date, hasta: Date): number {
  return Math.max(
    0,
    (hasta.getFullYear() - desde.getFullYear()) * 12 + (hasta.getMonth() - desde.getMonth())
  );
}

/**
 * Días entre dos fechas usando la convención comercial de 30 días por mes /
 * 360 por año (la misma que ya usa payroll.ts para el valor de la hora
 * ordinaria: salario/30). Se usa para prorratear salario y provisiones por
 * fracciones de mes — no es un conteo de días calendario real.
 */
export function diasEntre360(desde: Date, hasta: Date): number {
  let d1 = desde.getDate();
  let d2 = hasta.getDate();
  if (d1 === 31) d1 = 30;
  if (d2 === 31 && d1 === 30) d2 = 30;
  return (
    (hasta.getFullYear() - desde.getFullYear()) * 360 +
    (hasta.getMonth() - desde.getMonth()) * 30 +
    (d2 - d1)
  );
}
