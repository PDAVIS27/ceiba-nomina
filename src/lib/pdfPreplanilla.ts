import { PDFDocument, StandardFonts, rgb, PageSizes } from "pdf-lib";

export interface FilaPDF {
  nombre: string;
  puesto: string;
  bruto: number;
  horasExtraCantidad: number;
  horasExtraMonto: number;
  comisiones: number;
  retroactivos: number;
  viaticos: number;
  inss: number;
  ir: number;
  neto: number;
}

export interface DatosPreplanillaPDF {
  empresa: string;
  periodo: string;
  estado: "BORRADOR" | "APROBADA";
  generadoEl: Date;
  aprobadoEl?: Date | null;
  filas: FilaPDF[];
}

function money(n: number): string {
  return "C$ " + n.toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function generarPDFComprobanteIndividual(datos: {
  empresa: string;
  periodo: string;
  colaborador: string;
  puesto: string;
  bruto: number;
  horasExtraCantidad: number;
  horasExtraMonto: number;
  comisiones: number;
  retroactivos: number;
  viaticos: number;
  inss: number;
  ir: number;
  neto: number;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 320;
  const pageHeight = 520;
  const margin = 24;
  const page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function texto(t: string, x: number, yy: number, opts: { size?: number; bold?: boolean; color?: any } = {}) {
    page.drawText(t, { x, y: yy, size: opts.size ?? 9, font: opts.bold ? fontBold : font, color: opts.color ?? INK });
  }
  function linea(punteada = true) {
    y -= 4;
    if (punteada) {
      for (let x = margin; x < pageWidth - margin; x += 4) {
        page.drawLine({ start: { x, y }, end: { x: x + 2, y }, thickness: 0.75, color: LINE });
      }
    } else {
      page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: INK });
    }
    y -= 12;
  }
  function fila(label: string, valor: string, bold = false) {
    texto(label, margin, y, { size: 9, color: bold ? INK : DIM, bold });
    texto(valor, pageWidth - margin - font.widthOfTextAtSize(valor, 9), y, { size: 9, bold });
    y -= 16;
  }

  texto("COMPROBANTE DE PAGO", margin, y, { size: 13, bold: true, color: EMERALD });
  y -= 18;
  texto(datos.empresa, margin, y, { size: 9, bold: true });
  y -= 13;
  texto(`Período: ${datos.periodo}`, margin, y, { size: 8, color: DIM });
  linea();

  texto(datos.colaborador, margin, y, { size: 11, bold: true });
  y -= 12;
  texto(datos.puesto, margin, y, { size: 8, color: DIM });
  y -= 14;
  linea();

  fila("Salario bruto", money(datos.bruto));
  if (datos.horasExtraMonto > 0) fila(`Horas extra (${datos.horasExtraCantidad}h)`, money(datos.horasExtraMonto));
  if (datos.comisiones > 0) fila("Comisiones", money(datos.comisiones));
  if (datos.retroactivos > 0) fila("Retroactivos", money(datos.retroactivos));
  if (datos.viaticos > 0) fila("Viáticos (no gravable)", money(datos.viaticos));
  fila("INSS laboral (7%)", "- " + money(datos.inss));
  fila("IR retenido", "- " + money(datos.ir));
  linea(false);
  fila("NETO A PAGAR", money(datos.neto), true);

  return pdf.save();
}

export async function generarPDFLiquidacion(datos: {
  empresa: string;
  colaborador: string;
  puesto: string;
  fechaIngreso: Date;
  fechaBaja: Date;
  antiguedadMeses: number;
  tipoBajaLabel: string;
  aguinaldoPendiente: number;
  vacacionesPendientes: number;
  aplicaIndemnizacion: boolean;
  indemnizacion: number;
  total: number;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 320;
  const pageHeight = 560;
  const margin = 24;
  const page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function texto(t: string, x: number, yy: number, opts: { size?: number; bold?: boolean; color?: any } = {}) {
    page.drawText(t, { x, y: yy, size: opts.size ?? 9, font: opts.bold ? fontBold : font, color: opts.color ?? INK });
  }
  function textoMultilinea(t: string, x: number, ancho: number, size = 7.5, color = DIM) {
    const palabras = t.split(" ");
    let linea = "";
    for (const palabra of palabras) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (font.widthOfTextAtSize(prueba, size) > ancho && linea) {
        texto(linea, x, y, { size, color });
        y -= size + 3;
        linea = palabra;
      } else {
        linea = prueba;
      }
    }
    if (linea) {
      texto(linea, x, y, { size, color });
      y -= size + 3;
    }
  }
  function linea(punteada = true) {
    y -= 4;
    if (punteada) {
      for (let x = margin; x < pageWidth - margin; x += 4) {
        page.drawLine({ start: { x, y }, end: { x: x + 2, y }, thickness: 0.75, color: LINE });
      }
    } else {
      page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: INK });
    }
    y -= 12;
  }
  function fila(label: string, valor: string, bold = false) {
    texto(label, margin, y, { size: 9, color: bold ? INK : DIM, bold });
    texto(valor, pageWidth - margin - font.widthOfTextAtSize(valor, 9), y, { size: 9, bold });
    y -= 16;
  }

  texto("LIQUIDACIÓN FINAL", margin, y, { size: 13, bold: true, color: EMERALD });
  y -= 18;
  texto(datos.empresa, margin, y, { size: 9, bold: true });
  y -= 13;
  texto(`Generada: ${new Date().toLocaleString("es-NI")}`, margin, y, { size: 8, color: DIM });
  linea();

  texto(datos.colaborador, margin, y, { size: 11, bold: true });
  y -= 12;
  texto(datos.puesto, margin, y, { size: 8, color: DIM });
  y -= 14;
  linea();

  fila("Fecha de ingreso", datos.fechaIngreso.toLocaleDateString("es-NI"));
  fila("Fecha de baja", datos.fechaBaja.toLocaleDateString("es-NI"));
  fila("Antigüedad", `${datos.antiguedadMeses} meses`);
  fila("Tipo de baja", "");
  textoMultilinea(datos.tipoBajaLabel, margin, pageWidth - margin * 2, 8, INK);
  linea();

  fila("Aguinaldo pendiente", money(datos.aguinaldoPendiente));
  fila("Vacaciones pendientes", money(datos.vacacionesPendientes));
  if (datos.aplicaIndemnizacion) {
    fila("Indemnización por antigüedad", money(datos.indemnizacion));
  } else {
    texto("Indemnización por antigüedad: no aplica", margin, y, { size: 8, color: DIM });
    y -= 16;
  }
  linea(false);
  fila("TOTAL A LIQUIDAR", money(datos.total), true);
  y -= 10;

  textoMultilinea(
    "Este cálculo es una aproximación generada por la plataforma a partir de las planillas aprobadas y los movimientos registrados. No sustituye la revisión de un contador o abogado laboral, especialmente en bajas disputadas o con conceptos no cubiertos por Ceiba (doble empleador, salario variable no planillado, etc.).",
    margin,
    pageWidth - margin * 2,
    7,
    DIM
  );

  return pdf.save();
}

const INK = rgb(0.11, 0.14, 0.15);
const DIM = rgb(0.42, 0.47, 0.46);
const GOLD = rgb(0.61, 0.48, 0.12);
const EMERALD = rgb(0.18, 0.42, 0.34);
const LINE = rgb(0.85, 0.85, 0.82);

export async function generarPDFPreplanilla(datos: DatosPreplanillaPDF): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const [pageWidth, pageHeight] = [PageSizes.Letter[1], PageSizes.Letter[0]]; // landscape
  const margin = 40;
  const colX = {
    nombre: margin,
    bruto: margin + 175,
    horas: margin + 275,
    com: margin + 340,
    retro: margin + 400,
    via: margin + 460,
    inss: margin + 520,
    ir: margin + 575,
    neto: margin + 630,
  };

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function nuevaPagina() {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
    dibujarEncabezadoTabla();
  }

  function texto(
    t: string,
    x: number,
    yy: number,
    opts: { size?: number; bold?: boolean; color?: any } = {}
  ) {
    page.drawText(t, {
      x,
      y: yy,
      size: opts.size ?? 9,
      font: opts.bold ? fontBold : font,
      color: opts.color ?? INK,
    });
  }

  // ---------- Encabezado del documento ----------
  texto("CEIBA", margin, y, { size: 20, bold: true, color: EMERALD });
  texto(
    datos.estado === "BORRADOR" ? "PREPLANILLA — PENDIENTE DE APROBACIÓN" : "PLANILLA APROBADA",
    margin,
    y - 20,
    { size: 12, bold: true, color: datos.estado === "BORRADOR" ? GOLD : EMERALD }
  );
  y -= 42;
  texto(`Negocio: ${datos.empresa}`, margin, y, { size: 10, bold: true });
  y -= 15;
  texto(`Período: ${datos.periodo}`, margin, y, { size: 10 });
  y -= 15;
  texto(
    `Generado: ${datos.generadoEl.toLocaleString("es-NI")}` +
      (datos.aprobadoEl ? `   ·   Aprobado: ${datos.aprobadoEl.toLocaleString("es-NI")}` : ""),
    margin,
    y,
    { size: 9, color: DIM }
  );
  y -= 26;

  function dibujarEncabezadoTabla() {
    texto("Colaborador", colX.nombre, y, { size: 8, bold: true, color: DIM });
    texto("Bruto", colX.bruto, y, { size: 8, bold: true, color: DIM });
    texto("H. extra", colX.horas, y, { size: 8, bold: true, color: DIM });
    texto("Comis.", colX.com, y, { size: 8, bold: true, color: DIM });
    texto("Retro.", colX.retro, y, { size: 8, bold: true, color: DIM });
    texto("Viáticos", colX.via, y, { size: 8, bold: true, color: DIM });
    texto("INSS", colX.inss, y, { size: 8, bold: true, color: DIM });
    texto("IR", colX.ir, y, { size: 8, bold: true, color: DIM });
    texto("Neto", colX.neto, y, { size: 8, bold: true, color: DIM });
    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.75,
      color: LINE,
    });
    y -= 14;
  }

  dibujarEncabezadoTabla();

  let totBruto = 0,
    totExtra = 0,
    totCom = 0,
    totRetro = 0,
    totVia = 0,
    totInss = 0,
    totIr = 0,
    totNeto = 0;

  for (const f of datos.filas) {
    if (y < margin + 90) nuevaPagina();

    texto(f.nombre.slice(0, 28), colX.nombre, y, { size: 9 });
    texto(money(f.bruto), colX.bruto, y, { size: 8.5 });
    texto(`${f.horasExtraCantidad}h/${money(f.horasExtraMonto)}`, colX.horas, y, { size: 7.5 });
    texto(money(f.comisiones), colX.com, y, { size: 8.5 });
    texto(money(f.retroactivos), colX.retro, y, { size: 8.5 });
    texto(money(f.viaticos), colX.via, y, { size: 8.5 });
    texto(money(f.inss), colX.inss, y, { size: 8.5 });
    texto(money(f.ir), colX.ir, y, { size: 8.5 });
    texto(money(f.neto), colX.neto, y, { size: 8.5, bold: true });
    y -= 8;
    texto(f.puesto.slice(0, 28), colX.nombre, y, { size: 7.5, color: DIM });
    y -= 14;

    totBruto += f.bruto;
    totExtra += f.horasExtraMonto;
    totCom += f.comisiones;
    totRetro += f.retroactivos;
    totVia += f.viaticos;
    totInss += f.inss;
    totIr += f.ir;
    totNeto += f.neto;
  }

  y -= 4;
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: INK });
  y -= 16;

  texto("TOTALES", colX.nombre, y, { size: 9, bold: true });
  texto(money(totBruto), colX.bruto, y, { size: 8.5, bold: true });
  texto(money(totExtra), colX.horas, y, { size: 8.5, bold: true });
  texto(money(totCom), colX.com, y, { size: 8.5, bold: true });
  texto(money(totRetro), colX.retro, y, { size: 8.5, bold: true });
  texto(money(totVia), colX.via, y, { size: 8.5, bold: true });
  texto(money(totInss), colX.inss, y, { size: 8.5, bold: true });
  texto(money(totIr), colX.ir, y, { size: 8.5, bold: true });
  texto(money(totNeto), colX.neto, y, { size: 8.5, bold: true });
  y -= 40;

  if (datos.estado === "BORRADOR") {
    if (y < margin + 70) nuevaPagina();
    texto(
      "Este documento es un borrador para revisión. Los montos no son definitivos hasta que el negocio los apruebe dentro de la plataforma.",
      margin,
      y,
      { size: 8, color: DIM }
    );
    y -= 40;
    texto("Aprobado por (nombre y firma): _______________________________", margin, y, { size: 9 });
    texto("Fecha: ______________", margin + 380, y, { size: 9 });
  }

  return pdf.save();
}
