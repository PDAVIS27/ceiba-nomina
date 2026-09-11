// Categorías de problemas que un negocio cliente puede reportar. Compartidas
// entre el formulario del cliente (dashboard/reportar) y el panel del
// proveedor (admin), para que ambos lados vean lo mismo de un vistazo — en
// vez de depender solo de texto libre.
export const CATEGORIAS_PROBLEMA = [
  { value: "SALARIO_VARIABLE", label: "Salario variable / comisiones no planilladas" },
  { value: "DOBLE_EMPLEADOR", label: "Colaborador con doble empleador" },
  { value: "CALCULO_NO_CUADRA", label: "Un cálculo no me cuadra" },
  { value: "CORREGIR_DATO", label: "Necesito corregir un dato (salario, fecha, cédula, etc.)" },
  { value: "LIQUIDACION_DISPUTADA", label: "Baja o liquidación disputada" },
  { value: "OTRO", label: "Otro" },
] as const;

export type CategoriaProblema = (typeof CATEGORIAS_PROBLEMA)[number]["value"];

export function etiquetaCategoria(value: string | null | undefined): string {
  if (!value) return "Sin categoría";
  return CATEGORIAS_PROBLEMA.find((c) => c.value === value)?.label ?? value;
}
