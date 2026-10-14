// Figuras fiscales que un negocio cliente puede tener ante la DGI.
//
// IMPORTANTE — Cuota Fija, el IR laboral y la retención de servicios
// profesionales: la fuente pública disponible (Ley 822 y su Reglamento,
// guías de firmas contables, el acuerdo ministerial que regula Cuota Fija)
// describe ese régimen como un sustituto del IR y el IVA del NEGOCIO (persona
// natural, pequeño contribuyente, ingresos ≤ C$100,000/mes) — no encontramos
// una exención explícita para el IR laboral de sus colaboradores, que en
// general depende del salario de cada quien (Art. 23, Ley 822), no del
// régimen del empleador. Aun así, a pedido explícito del proveedor de esta
// plataforma (quien conoce el trato real que le da la DGI a estos negocios en
// la práctica), Ceiba NO calcula IR laboral para ningún colaborador de un
// negocio marcado como Cuota Fija — ver esExentoIR() y su uso en
// calcularPeriodo()/calcularLiquidacion(). El INSS laboral (7%) se sigue
// calculando igual siempre, sin importar el régimen.
//
// esExentoIR() también exonera la retención fija de servicios profesionales
// (TipoContrato.SERVICIOS_PROFESIONALES). A diferencia del IR laboral, aquí sí
// hay base legal más directa: el Art. 44 del Reglamento de la Ley 822 liga esa
// retención a los "contribuyentes del régimen general", el Art. 57.5 exige
// que la Administración Tributaria nombre y notifique a una persona natural
// como agente retenedor (algo que no ocurre automáticamente por operar), y
// Cuota Fija (Art. 259 LCT) es en sí un régimen exclusivo de personas
// naturales con negocios pequeños, categóricamente separado del régimen
// general. No es una cita única y literal — es una conclusión que cruza esos
// tres artículos — así que sigue siendo recomendable que un contador la
// confirme antes de operar con clientes reales, igual que el resto de este
// archivo.
//
// Zona Franca exonera el IR de renta de LA EMPRESA — no cambia nada del
// cálculo de nómina de sus colaboradores ni de la retención de servicios
// profesionales que esa empresa le haga a terceros.
export const REGIMENES_FISCALES = [
  { value: "GENERAL", label: "Régimen General", detalle: "Rentas de actividades económicas — la mayoría de negocios formales." },
  { value: "CUOTA_FIJA", label: "Cuota Fija", detalle: "Persona natural, pequeño contribuyente ante la DGI. No se calcula IR laboral a sus colaboradores ni retención de servicios profesionales a terceros." },
  { value: "ZONA_FRANCA", label: "Zona Franca", detalle: "Empresa exonerada de IR bajo régimen de zona franca." },
] as const;

export type RegimenFiscalValue = (typeof REGIMENES_FISCALES)[number]["value"];

export function etiquetaRegimen(value?: string | null): string {
  return REGIMENES_FISCALES.find((r) => r.value === value)?.label ?? "Régimen General";
}

/**
 * Cuota Fija: no se calcula/retiene IR laboral a ningún colaborador LABORAL
 * de ese negocio, y tampoco se retiene el 10% de servicios profesionales a
 * los colaboradores SERVICIOS_PROFESIONALES de ese mismo negocio.
 */
export function esExentoIR(regimenFiscal?: string | null): boolean {
  return regimenFiscal === "CUOTA_FIJA";
}
