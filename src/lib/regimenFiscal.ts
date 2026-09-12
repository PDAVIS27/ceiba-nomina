// Figuras fiscales que un negocio cliente puede tener ante la DGI.
//
// IMPORTANTE — Cuota Fija y el IR laboral: la fuente pública disponible
// (Ley 822 y su Reglamento, guías de firmas contables, el acuerdo ministerial
// que regula Cuota Fija) describe ese régimen como un sustituto del IR y el
// IVA del NEGOCIO (persona natural, pequeño contribuyente, ingresos ≤
// C$100,000/mes) — no encontramos una exención explícita para el IR laboral
// de sus colaboradores, que en general depende del salario de cada quien
// (Art. 23, Ley 822), no del régimen del empleador. Aun así, a pedido
// explícito del proveedor de esta plataforma (quien conoce el trato real que
// le da la DGI a estos negocios en la práctica), Ceiba NO calcula IR laboral
// para ningún colaborador de un negocio marcado como Cuota Fija — ver
// esExentoIR() y su uso en calcularPeriodo()/calcularLiquidacion(). El INSS
// laboral (7%) se sigue calculando igual siempre, sin importar el régimen.
// Zona Franca exonera el IR de renta de LA EMPRESA — no cambia nada del
// cálculo de nómina de sus colaboradores.
export const REGIMENES_FISCALES = [
  { value: "GENERAL", label: "Régimen General", detalle: "Rentas de actividades económicas — la mayoría de negocios formales." },
  { value: "CUOTA_FIJA", label: "Cuota Fija", detalle: "Persona natural, pequeño contribuyente ante la DGI. No se calcula IR laboral a sus colaboradores." },
  { value: "ZONA_FRANCA", label: "Zona Franca", detalle: "Empresa exonerada de IR bajo régimen de zona franca." },
] as const;

export type RegimenFiscalValue = (typeof REGIMENES_FISCALES)[number]["value"];

export function etiquetaRegimen(value?: string | null): string {
  return REGIMENES_FISCALES.find((r) => r.value === value)?.label ?? "Régimen General";
}

/** Cuota Fija: no se calcula/retiene IR laboral a ningún colaborador de ese negocio. */
export function esExentoIR(regimenFiscal?: string | null): boolean {
  return regimenFiscal === "CUOTA_FIJA";
}
