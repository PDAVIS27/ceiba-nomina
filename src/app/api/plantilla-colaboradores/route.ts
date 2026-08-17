import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

export async function GET() {
  const data = [
    ["Nombre completo", "Puesto", "Salario bruto (C$)", "Fecha de ingreso (aaaa-mm-dd)"],
    ["Ana Reyes", "Cajera", 9200, "2025-03-01"],
    ["Carlos Espinoza", "Bodeguero", 8500, "2024-11-15"],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 24 }, { wch: 18 }, { wch: 20 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, ws, "Colaboradores");
  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=plantilla-colaboradores-ceiba.xlsx",
    },
  });
}
