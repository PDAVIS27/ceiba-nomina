// ---------------------------------------------------------------------------
// Helpers de moneda — Ceiba ahora admite colaboradores pagados en córdobas
// (NIO, la mayoría) o en dólares (USD, por colaborador — ver Employee.moneda
// en schema.prisma). El INSS y el IR siempre se calculan en córdobas (son
// obligaciones de ley en esa moneda — ver src/lib/payroll.ts), pero el
// salario, las provisiones y el neto a pagar de un colaborador en USD se
// manejan y se muestran en dólares.
//
// IMPORTANTE sobre totales: nunca hay que SUMAR directamente un monto en
// córdobas con uno en dólares (sería sumar peras con manzanas). Las
// funciones de abajo agrupan por moneda y, si hay más de una, muestran cada
// total aparte en vez de mezclarlos.
// ---------------------------------------------------------------------------

export type MonedaKey = "NIO" | "USD";

export function simboloMoneda(moneda?: string | null): string {
  return moneda === "USD" ? "US$" : "C$";
}

export function formatMonto(n: number, moneda?: string | null): string {
  return `${simboloMoneda(moneda)} ${n.toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Suma un conjunto de {moneda, monto} agrupando por moneda — nunca mezcla
 * córdobas con dólares en una sola suma. Devuelve un texto listo para
 * mostrar: "C$ 45,230.00" si todo es de una sola moneda (el caso de
 * siempre), o "C$ 45,230.00 + US$ 500.00" si hay de las dos.
 */
export function formatTotalPorMoneda(items: { moneda?: string | null; monto: number }[]): string {
  const totales = new Map<string, number>();
  for (const it of items) {
    const key = it.moneda === "USD" ? "USD" : "NIO";
    totales.set(key, round2((totales.get(key) ?? 0) + it.monto));
  }
  if (totales.size === 0) return formatMonto(0, "NIO");
  // NIO primero si existe, para que el total "principal" vaya adelante.
  const orden = ["NIO", "USD"];
  return orden
    .filter((k) => totales.has(k))
    .map((k) => formatMonto(totales.get(k)!, k))
    .join(" + ");
}

/** Totales por moneda como números (para gráficas/sumatorias internas, no para mostrar directo). */
export function totalesPorMoneda(items: { moneda?: string | null; monto: number }[]): { NIO: number; USD: number } {
  let NIO = 0;
  let USD = 0;
  for (const it of items) {
    if (it.moneda === "USD") USD = round2(USD + it.monto);
    else NIO = round2(NIO + it.monto);
  }
  return { NIO, USD };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
