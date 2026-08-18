import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

export async function GET() {
  const datos = [
    [
      "Código colaborador", "Nombre del colaborador", "Departamento",
      "Salario mensual (C$)", "Horas extras", "Viáticos (C$)", "Retroactivos (C$)",
    ],
    ["COL001", "Ana Reyes", "Cajera", 9200, 0, 0, 0],
    ["COL002", "Carlos Espinoza", "Bodeguero", 8500, 5, 500, 0],
  ];
  const instrucciones = [
    ["Campo", "Descripción"],
    ["Código colaborador", "Identificador único del colaborador en tu empresa. Si ya existe, se actualiza; si no, se crea."],
    ["Nombre del colaborador", "Nombre completo."],
    ["Departamento", "Área, puesto o departamento del colaborador."],
    ["Salario mensual (C$)", "Salario bruto mensual de referencia."],
    ["Horas extras", "Cantidad de horas extra de este período (recargo del 100% según el Código del Trabajo)."],
    ["Viáticos (C$)", "Monto de viáticos del período — no gravable."],
    ["Retroactivos (C$)", "Monto retroactivo del período — se suma a la base gravable."],
  ];

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(datos);
  ws1["!cols"] = [{ wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 18 }];
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
