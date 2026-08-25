export function mesesEntre(desde: Date, hasta: Date): number {
  return Math.max(
    0,
    (hasta.getFullYear() - desde.getFullYear()) * 12 + (hasta.getMonth() - desde.getMonth())
  );
}
