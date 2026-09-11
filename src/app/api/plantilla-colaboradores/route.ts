import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

export async function GET() {
  const datos = [
    [
      "N°", "Código colaborador", "Nombre del colaborador", "N° de cédula", "Cuenta bancaria", "Departamento",
      "Salario mensual (C$)", "Horas extras", "Viáticos (C$)", "Retroactivos (C$)",
      "Otras deducciones (C$)", "Motivo de otras deducciones",
    ],
    [1, "COL001", "Ana Reyes", "001-010190-0001A", "10012345678", "Cajera", 9200, 0, 0, 0, 0, ""],
    [2, "COL002", "Carlos Espinoza", "", "", "Bodeguero", 8500, 5, 500, 0, 300, "Descuento por llegada tardía"],
  ];
  const instrucciones = [
    ["Campo", "Descripción"],
    ["N°", "Solo para tu referencia al llenar la hoja (numerar las filas) — la plataforma no la usa, puedes dejarla en blanco."],
    ["Código colaborador", "Identificador único del colaborador en tu empresa. Si ya existe, se actualiza; si no, se crea."],
    ["Nombre del colaborador", "Nombre completo."],
    ["N° de cédula", "Opcional. Número de cédula de identidad del colaborador."],
    ["Cuenta bancaria", "Opcional. Número de cuenta bancaria donde se le deposita el pago."],
    ["Departamento", "Área, puesto o departamento del colaborador."],
    ["Salario mensual (C$)", "Salario bruto mensual de referencia."],
    ["Horas extras", "Cantidad de horas extra de este período (recargo del 100% según el Código del Trabajo)."],
    ["Viáticos (C$)", "Monto de viáticos del período — no gravable."],
    ["Retroactivos (C$)", "Monto retroactivo del período — se suma a la base gravable."],
    ["Otras deducciones (C$)", "Opcional. Descuento que decide tu negocio y no es de ley (error de pago, falta, llegada tardía, etc.) — se resta directo del neto a pagar, no afecta el INSS ni el IR."],
    ["Motivo de otras deducciones", "Opcional. Explica de qué se trata el monto de la columna anterior (ej. \"Descuento por falta el 3 de junio\"). Si dejas el monto en cero, este campo se ignora."],
  ];

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(datos);
  ws1["!cols"] = [
    { wch: 6 }, { wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 16 }, { wch: 18 },
    { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "Datos de Nómina");

  const ws2 = XLSX.utils.aoa_to_sheet(instrucciones);
  ws2["!cols"] = [{ wch: 24 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Instrucciones");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=plantilla-nomina-ceiba.xlsx",
    },
  });
}
