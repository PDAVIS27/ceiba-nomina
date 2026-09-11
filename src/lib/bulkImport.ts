import * as XLSX from "xlsx";

export interface FilaImportada {
  externalCode: string | null;
  fullName: string;
  cedula: string | null;
  cuentaBancaria: string | null;
  role: string;
  grossSalary: number;
  horasExtraCantidad: number;
  viaticos: number;
  retroactivos: number;
  otrasDeducciones: number;
  otrasDeduccionesConcepto: string | null;
  startDate: Date | null; // null = mantener la que ya tenía / hoy si es nueva
}

export interface ResultadoImportacion {
  filas: FilaImportada[];
  errores: string[];
}

// Encabezados aceptados por columna (sin distinguir mayúsculas/acentos ni
// espacios extra). Los primeros cuatro son obligatorios; los demás son
// opcionales — si el archivo no los trae, se asumen en cero.
const ALIAS = {
  externalCode: ["codigo colaborador", "codigo", "id colaborador", "código colaborador"],
  fullName: ["nombre del colaborador", "nombre completo", "nombre", "colaborador"],
  cedula: ["n° de cedula", "no de cedula", "numero de cedula", "cedula", "n de cedula", "n° cedula"],
  cuentaBancaria: ["cuenta bancaria", "n° de cuenta", "numero de cuenta", "cuenta"],
  role: ["departamento", "puesto", "cargo", "area", "área"],
  grossSalary: [
    "salario mensual (c$)", "salario mensual", "salario bruto (c$)", "salario bruto", "salario",
  ],
  horasExtraCantidad: ["horas extras", "horas extra", "h. extra"],
  viaticos: ["viaticos (c$)", "viáticos (c$)", "viaticos", "viáticos"],
  retroactivos: ["retroactivos (c$)", "retroactivos", "retroactivo"],
  otrasDeducciones: ["otras deducciones (c$)", "otras deducciones", "otra deduccion"],
  otrasDeduccionesConcepto: [
    "motivo de otras deducciones", "motivo otras deducciones", "motivo de la deduccion", "motivo deduccion",
  ],
  startDate: ["fecha de ingreso (aaaa-mm-dd)", "fecha de ingreso", "fecha ingreso", "fecha"],
} as const;

type Campo = keyof typeof ALIAS;
const CAMPOS_OBLIGATORIOS: Campo[] = ["fullName", "role", "grossSalary"];

const NOMBRE_LEGIBLE: Record<Campo, string> = {
  externalCode: "Código colaborador",
  fullName: "Nombre del colaborador",
  cedula: "N° de cédula",
  cuentaBancaria: "Cuenta bancaria",
  role: "Departamento",
  grossSalary: "Salario mensual",
  horasExtraCantidad: "Horas extras",
  viaticos: "Viáticos",
  retroactivos: "Retroactivos",
  otrasDeducciones: "Otras deducciones",
  otrasDeduccionesConcepto: "Motivo de otras deducciones",
  startDate: "Fecha de ingreso",
};

function normaliza(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function numero(v: unknown): number {
  const limpio = String(v ?? "").replace(/[^0-9.\-]/g, "");
  const n = Number(limpio);
  return isNaN(n) ? 0 : n;
}

/**
 * Lee la plantilla de nómina (hoja "Datos de Nómina" u otra, siempre toma la
 * primera hoja con datos) y devuelve filas listas para: 1) crear o
 * actualizar colaboradores, y 2) generar una preplanilla con sus horas
 * extra, viáticos y retroactivos del período.
 */
export function parsearExcelColaboradores(buffer: ArrayBuffer): ResultadoImportacion {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array" });
  } catch {
    return { filas: [], errores: ["No pude leer el archivo. Asegúrate de que sea un .xlsx válido."] };
  }

  // Usa la hoja "Datos de Nómina" si existe; si no, la primera hoja del archivo.
  const nombreHoja = wb.SheetNames.find((n) => normaliza(n).includes("datos")) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[nombreHoja];
  if (!sheet) return { filas: [], errores: ["El archivo no tiene ninguna hoja con datos."] };

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  if (rows.length < 2) {
    return { filas: [], errores: ["El archivo no tiene filas de datos debajo del encabezado."] };
  }

  const encabezados = (rows[0] as unknown[]).map(normaliza);
  const indice: Partial<Record<Campo, number>> = {};
  const erroresEncabezado: string[] = [];

  for (const campo of Object.keys(ALIAS) as Campo[]) {
    const idx = encabezados.findIndex((h) => ALIAS[campo].some((alias) => normaliza(alias) === h));
    if (idx !== -1) {
      indice[campo] = idx;
    } else if (CAMPOS_OBLIGATORIOS.includes(campo)) {
      erroresEncabezado.push(`No encontré la columna "${NOMBRE_LEGIBLE[campo]}" (obligatoria).`);
    }
  }

  if (erroresEncabezado.length > 0) {
    return { filas: [], errores: erroresEncabezado };
  }

  const filas: FilaImportada[] = [];
  const errores: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const fila = rows[i] as unknown[];
    const vacia = !fila || fila.every((c) => c === "" || c === undefined || c === null);
    if (vacia) continue;

    const get = (campo: Campo) => (indice[campo] !== undefined ? fila[indice[campo]!] : undefined);

    const externalCodeRaw = String(get("externalCode") ?? "").trim();
    const fullName = String(get("fullName") ?? "").trim();
    const role = String(get("role") ?? "").trim();
    const grossSalary = numero(get("grossSalary"));

    if (!fullName || !role || !grossSalary || grossSalary <= 0) {
      const faltantes: string[] = [];
      if (!fullName) faltantes.push("nombre");
      if (!role) faltantes.push("departamento");
      if (!grossSalary || grossSalary <= 0) faltantes.push("salario válido");
      // Si al menos el nombre vino en la fila, lo usamos para identificar el
      // error — así se sabe exactamente a quién corregirle el archivo, en
      // vez de tener que ir a contar filas a mano.
      const quien = fullName ? `"${fullName}"` : `Fila ${i + 1}`;
      errores.push(`${quien}: falta ${faltantes.join(", ")} — se omitió.`);
      continue;
    }

    let startDate: Date | null = null;
    const fechaRaw = get("startDate");
    if (fechaRaw) {
      const parsed = new Date(String(fechaRaw));
      if (!isNaN(parsed.getTime())) startDate = parsed;
    }

    const cedula = String(get("cedula") ?? "").trim();
    const cuentaBancaria = String(get("cuentaBancaria") ?? "").trim();
    const otrasDeducciones = numero(get("otrasDeducciones"));
    const otrasDeduccionesConcepto = String(get("otrasDeduccionesConcepto") ?? "").trim();

    filas.push({
      externalCode: externalCodeRaw || null,
      fullName,
      cedula: cedula || null,
      cuentaBancaria: cuentaBancaria || null,
      role,
      grossSalary,
      horasExtraCantidad: numero(get("horasExtraCantidad")),
      viaticos: numero(get("viaticos")),
      retroactivos: numero(get("retroactivos")),
      otrasDeducciones,
      otrasDeduccionesConcepto: otrasDeducciones > 0 ? (otrasDeduccionesConcepto || null) : null,
      startDate,
    });
  }

  return { filas, errores };
}
