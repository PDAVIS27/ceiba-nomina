import * as XLSX from "xlsx";

export interface FilaImportada {
  fullName: string;
  role: string;
  grossSalary: number;
  startDate: Date;
}

export interface ResultadoImportacion {
  filas: FilaImportada[];
  errores: string[];
}

// Encabezados aceptados por columna (sin distinguir mayúsculas/acentos ni
// espacios extra) — así el archivo del cliente no tiene que coincidir letra
// por letra con la plantilla.
const ALIAS: Record<"fullName" | "role" | "grossSalary" | "startDate", string[]> = {
  fullName: ["nombre completo", "nombre", "colaborador", "empleado"],
  role: ["puesto", "cargo", "posicion", "posición"],
  grossSalary: [
    "salario bruto (c$)", "salario bruto", "salario", "salario mensual", "salario bruto mensual",
  ],
  startDate: [
    "fecha de ingreso (aaaa-mm-dd)", "fecha de ingreso", "fecha ingreso", "fecha",
  ],
};

function normaliza(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // quita acentos para comparar
}

/**
 * Lee un archivo Excel (.xlsx) subido por el usuario y devuelve las filas
 * válidas listas para insertar como colaboradores, más una lista de errores
 * o filas omitidas para mostrarle al usuario qué corregir.
 */
export function parsearExcelColaboradores(buffer: ArrayBuffer): ResultadoImportacion {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array" });
  } catch {
    return { filas: [], errores: ["No pude leer el archivo. Asegúrate de que sea un .xlsx válido."] };
  }

  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { filas: [], errores: ["El archivo no tiene ninguna hoja con datos."] };

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  if (rows.length < 2) {
    return { filas: [], errores: ["El archivo no tiene filas de datos debajo del encabezado."] };
  }

  const encabezados = (rows[0] as unknown[]).map(normaliza);
  const campos = Object.keys(ALIAS) as (keyof typeof ALIAS)[];
  const indice: Partial<Record<keyof typeof ALIAS, number>> = {};
  const erroresEncabezado: string[] = [];

  for (const campo of campos) {
    const idx = encabezados.findIndex((h) => ALIAS[campo].some((alias) => normaliza(alias) === h));
    if (idx === -1) {
      erroresEncabezado.push(
        `No encontré una columna para "${campo === "fullName" ? "Nombre completo" : campo === "role" ? "Puesto" : campo === "grossSalary" ? "Salario bruto" : "Fecha de ingreso"}". Usa los encabezados de la plantilla.`
      );
    } else {
      indice[campo] = idx;
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

    const fullName = String(fila[indice.fullName!] ?? "").trim();
    const role = String(fila[indice.role!] ?? "").trim();
    const salarioTexto = String(fila[indice.grossSalary!] ?? "").replace(/[^0-9.]/g, "");
    const grossSalary = Number(salarioTexto);
    const fechaRaw = fila[indice.startDate!];

    let startDate = new Date();
    if (fechaRaw) {
      const parsed = new Date(String(fechaRaw));
      if (!isNaN(parsed.getTime())) startDate = parsed;
    }

    if (!fullName || !role || !grossSalary || grossSalary <= 0) {
      errores.push(`Fila ${i + 1}: falta nombre, puesto o un salario válido — se omitió.`);
      continue;
    }

    filas.push({ fullName, role, grossSalary, startDate });
  }

  return { filas, errores };
}
