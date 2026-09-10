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
  const pageHeight = 570;
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

  texto("INGRESOS", margin, y, { size: 7.5, bold: true, color: EMERALD });
  y -= 14;
  fila("Salario bruto", money(datos.bruto));
  if (datos.horasExtraMonto > 0) fila(`Horas extra (${datos.horasExtraCantidad}h)`, money(datos.horasExtraMonto));
  if (datos.comisiones > 0) fila("Comisiones", money(datos.comisiones));
  if (datos.retroactivos > 0) fila("Retroactivos", money(datos.retroactivos));
  if (datos.viaticos > 0) fila("Viáticos (no gravable)", money(datos.viaticos));

  linea();
  texto("RETENCIONES", margin, y, { size: 7.5, bold: true, color: GOLD });
  y -= 14;
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
  pagosPendientes: { concepto: string; monto: number }[];
  // Base gravable = vacacionesPendientes + la suma de pagosPendientes —
  // aguinaldo e indemnización quedan fuera, exentos de ley. El INSS y el IR
  // se calculan UNA sola vez sobre gravableBruto, no por separado.
  gravableBruto: number;
  gravableInss: number;
  gravableIr: number;
  totalIngresos: number;
  total: number;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Formato tipo "comprobante de liquidación" clásico: cuadro de datos del
  // colaborador, tabla de ingresos con líneas de cuadrícula, tabla de
  // deducciones, neto a recibir, y una constancia de recibido con firmas —
  // carta tamaño completo (no un recibo angosto) para que quepa como tabla.
  const pageWidth = PageSizes.Letter[0];
  const pageHeight = PageSizes.Letter[1];
  const margin = 46;
  const tableLeft = margin;
  const tableRight = pageWidth - margin;
  const page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function texto(t: string, x: number, yy: number, opts: { size?: number; bold?: boolean; color?: any } = {}) {
    page.drawText(t, { x, y: yy, size: opts.size ?? 9, font: opts.bold ? fontBold : font, color: opts.color ?? INK });
  }
  function textoDer(t: string, xRight: number, yy: number, opts: { size?: number; bold?: boolean; color?: any } = {}) {
    const size = opts.size ?? 9;
    const f = opts.bold ? fontBold : font;
    texto(t, xRight - f.widthOfTextAtSize(t, size), yy, opts);
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
  function hline(x1: number, x2: number, yy: number, color = LINE, thickness = 0.75) {
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness, color });
  }
  function vline(x: number, y1: number, y2: number, color = LINE, thickness = 0.75) {
    page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness, color });
  }

  // ---------- Encabezado ----------
  texto("CÁLCULO DE LIQUIDACIÓN LABORAL", margin, y, { size: 14, bold: true, color: EMERALD });
  textoDer(`Generado: ${new Date().toLocaleDateString("es-NI")}`, tableRight, y + 2, { size: 8, color: DIM });
  y -= 20;
  texto(datos.empresa, margin, y, { size: 10, color: DIM });
  y -= 22;

  // ---------- Cuadro de datos del colaborador ----------
  const datosFilas: [string, string][] = [
    ["Colaborador", datos.colaborador],
    ["Cargo", datos.puesto],
    ["Motivo de baja", datos.tipoBajaLabel],
    ["Fecha de ingreso", datos.fechaIngreso.toLocaleDateString("es-NI")],
    ["Fecha de liquidación", datos.fechaBaja.toLocaleDateString("es-NI")],
    ["Antigüedad", `${datos.antiguedadMeses} meses`],
  ];
  const filaAltoDatos = 20;
  const cuadroTop = y;
  const cuadroBottom = y - datosFilas.length * filaAltoDatos;
  const colDatosValor = margin + 150;
  page.drawRectangle({
    x: tableLeft,
    y: cuadroBottom,
    width: tableRight - tableLeft,
    height: cuadroTop - cuadroBottom,
    borderColor: LINE,
    borderWidth: 1,
  });
  vline(colDatosValor, cuadroTop, cuadroBottom);
  datosFilas.forEach(([label, valor], i) => {
    const yy = cuadroTop - i * filaAltoDatos - 14;
    texto(label, margin + 8, yy, { size: 9, color: DIM });
    texto(valor, colDatosValor + 8, yy, { size: 9, bold: true });
    if (i > 0) hline(tableLeft, tableRight, cuadroTop - i * filaAltoDatos);
  });
  y = cuadroBottom - 24;

  // ---------- Tabla de INGRESOS ----------
  texto("INGRESOS", margin, y, { size: 10, bold: true, color: EMERALD });
  y -= 16;

  const colConcepto = margin;
  const colMonto = tableRight - 140;
  const filaAlto = 19;

  const ingresoFilas: { concepto: string; monto: string; bold?: boolean }[] = [
    { concepto: "Aguinaldo pendiente (exento)", monto: money(datos.aguinaldoPendiente) },
    { concepto: "Vacaciones pendientes (gravable)", monto: money(datos.vacacionesPendientes) },
    {
      concepto: "Indemnización por antigüedad" + (datos.aplicaIndemnizacion ? " (exenta)" : ""),
      monto: datos.aplicaIndemnizacion ? money(datos.indemnizacion) : "No aplica",
    },
    ...datos.pagosPendientes.map((p) => ({
      concepto: `${p.concepto || "Pago pendiente"} (gravable)`,
      monto: money(p.monto),
    })),
    { concepto: "TOTAL INGRESOS", monto: money(datos.totalIngresos), bold: true },
  ];

  const ingresosTop = y;
  ingresoFilas.forEach((f, i) => {
    const yy = ingresosTop - i * filaAlto - 13;
    texto(f.concepto, colConcepto + 6, yy, { size: 9, bold: f.bold, color: f.bold ? INK : undefined });
    textoDer(f.monto, tableRight - 6, yy, { size: 9, bold: f.bold });
  });
  const ingresosBottom = ingresosTop - ingresoFilas.length * filaAlto;
  page.drawRectangle({
    x: tableLeft,
    y: ingresosBottom,
    width: tableRight - tableLeft,
    height: ingresosTop - ingresosBottom,
    borderColor: LINE,
    borderWidth: 1,
  });
  vline(colMonto, ingresosTop, ingresosBottom);
  for (let i = 1; i <= ingresoFilas.length; i++) hline(tableLeft, tableRight, ingresosTop - i * filaAlto);
  hline(tableLeft, tableRight, ingresosTop - (ingresoFilas.length - 1) * filaAlto, INK, 1);
  y = ingresosBottom - 24;

  // ---------- Tabla de DEDUCCIONES ----------
  texto("DEDUCCIONES", margin, y, { size: 10, bold: true, color: GOLD });
  y -= 13;
  textoMultilinea(
    `El INSS laboral (7%) y el IR se calculan UNA sola vez sobre vacaciones + pagos pendientes juntos (${money(datos.gravableBruto)} gravable) — el aguinaldo y la indemnización están exentos de ley y no forman parte de esta base.`,
    margin,
    tableRight - margin,
    7.5,
    DIM
  );
  y -= 3;

  const deduccionFilas: { concepto: string; monto: string; bold?: boolean }[] = [
    { concepto: "Seguro Social (INSS 7%)", monto: "- " + money(datos.gravableInss) },
    { concepto: "Impuesto sobre la renta (IR)", monto: "- " + money(datos.gravableIr) },
    { concepto: "TOTAL DEDUCCIONES", monto: "- " + money(round2(datos.gravableInss + datos.gravableIr)), bold: true },
  ];
  const deduccionesTop = y;
  deduccionFilas.forEach((f, i) => {
    const yy = deduccionesTop - i * filaAlto - 13;
    texto(f.concepto, colConcepto + 6, yy, { size: 9, bold: f.bold });
    textoDer(f.monto, tableRight - 6, yy, { size: 9, bold: f.bold });
  });
  const deduccionesBottom = deduccionesTop - deduccionFilas.length * filaAlto;
  page.drawRectangle({
    x: tableLeft,
    y: deduccionesBottom,
    width: tableRight - tableLeft,
    height: deduccionesTop - deduccionesBottom,
    borderColor: LINE,
    borderWidth: 1,
  });
  vline(colMonto, deduccionesTop, deduccionesBottom);
  for (let i = 1; i <= deduccionFilas.length; i++) hline(tableLeft, tableRight, deduccionesTop - i * filaAlto);
  hline(tableLeft, tableRight, deduccionesTop - (deduccionFilas.length - 1) * filaAlto, INK, 1);
  y = deduccionesBottom - 26;

  // ---------- NETO A RECIBIR ----------
  const netoAlto = 30;
  page.drawRectangle({
    x: tableLeft,
    y: y - netoAlto,
    width: tableRight - tableLeft,
    height: netoAlto,
    color: rgb(0.93, 0.96, 0.94),
    borderColor: EMERALD,
    borderWidth: 1,
  });
  texto("NETO A RECIBIR", colConcepto + 10, y - 20, { size: 11, bold: true, color: EMERALD });
  textoDer(money(datos.total), tableRight - 10, y - 20, { size: 13, bold: true, color: EMERALD });
  y -= netoAlto + 28;

  // ---------- Constancia y firmas ----------
  textoMultilinea(
    `Yo, ${datos.colaborador}, declaro haber recibido las prestaciones arriba descritas, a las cuales tenía derecho, y con las que doy por terminada mi relación laboral. Este documento es una aproximación generada por la plataforma a partir de las planillas aprobadas y los movimientos registrados — no sustituye la revisión de un contador o abogado laboral, especialmente en bajas disputadas o con conceptos no cubiertos por Ceiba (doble empleador, salario variable no planillado, etc.).`,
    margin,
    tableRight - margin,
    8,
    DIM
  );
  y -= 36;

  const firmaAncho = (tableRight - tableLeft - 40) / 2;
  hline(margin, margin + firmaAncho, y);
  hline(tableRight - firmaAncho, tableRight, y);
  texto("Recibí conforme", margin, y - 12, { size: 8, color: DIM });
  texto(datos.colaborador, margin, y - 24, { size: 8 });
  texto("Autorizado por", tableRight - firmaAncho, y - 12, { size: 8, color: DIM });

  return pdf.save();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
    // Rótulo de grupo, para que quede claro de un vistazo qué columnas son
    // ingresos y cuáles son retenciones de ley.
    texto("INGRESOS", colX.bruto, y, { size: 7, bold: true, color: EMERALD });
    texto("RETENCIONES", colX.inss, y, { size: 7, bold: true, color: GOLD });
    y -= 11;

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
