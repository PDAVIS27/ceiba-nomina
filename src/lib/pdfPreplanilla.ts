import { PDFDocument, StandardFonts, rgb, PageSizes } from "pdf-lib";

export interface FilaPDF {
  nombre: string;
  codigo?: string | null;
  cedula?: string | null;
  fechaIngreso?: Date | null;
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
  cedula?: string | null;
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
  texto(datos.puesto + (datos.cedula ? `  ·  Cédula ${datos.cedula}` : ""), margin, y, { size: 8, color: DIM });
  y -= 14;
  linea();

  texto("INGRESOS", margin, y, { size: 7.5, bold: true, color: EMERALD });
  y -= 14;
  fila("Salario bruto", money(datos.bruto));
  if (datos.horasExtraMonto > 0) fila(`Horas extra (${datos.horasExtraCantidad}h)`, money(datos.horasExtraMonto));
  if (datos.comisiones > 0) fila("Comisiones", money(datos.comisiones));
  if (datos.retroactivos > 0) fila("Retroactivos", money(datos.retroactivos));
  if (datos.viaticos > 0) fila("Viáticos", money(datos.viaticos));

  linea();
  texto("RETENCIONES", margin, y, { size: 7.5, bold: true, color: GOLD });
  y -= 14;
  fila("INSS laboral", "- " + money(datos.inss));
  fila("IR retenido", "- " + money(datos.ir));
  linea(false);
  fila("NETO A PAGAR", money(datos.neto), true);

  return pdf.save();
}

export async function generarPDFLiquidacion(datos: {
  empresa: string;
  colaborador: string;
  cedula?: string;
  puesto: string;
  fechaIngreso: Date;
  fechaBaja: Date;
  antiguedadMeses: number;
  tipoBajaLabel: string;
  aguinaldoPendiente: number;
  vacacionesPendientes: number;
  horasExtraCantidad: number;
  horasExtraMonto: number;
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
    ...(datos.cedula ? ([["N° de cédula", datos.cedula]] as [string, string][]) : []),
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
    ...(datos.horasExtraCantidad > 0
      ? [
          {
            concepto: `Horas extra pendientes · ${datos.horasExtraCantidad} hrs (gravable)`,
            monto: money(datos.horasExtraMonto),
          },
        ]
      : []),
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
  y -= 16;

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
    `Yo, ${datos.colaborador}, declaro haber recibido a mi entera satisfacción las prestaciones arriba descritas, a las cuales tenía derecho, y con las que doy por terminada totalmente mi relación laboral con ${datos.empresa.replace(/\.+$/, "")}. Declaro estar conforme con la presente liquidación y me comprometo a no presentar ningún reclamo posterior, ni personalmente ni por medio de representante, relacionado con dicha relación laboral.`,
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

/**
 * Preplanilla / planilla: un bloque por colaborador (identificación +
 * detalle de "Concepto" con Asignación/Deducción), en vez de una sola fila
 * por colaborador — tipo así lo hacen los reportes de nómina tradicionales.
 * Formato carta vertical, para que cada bloque respire igual que en un
 * comprobante impreso.
 */
export async function generarPDFPreplanilla(datos: DatosPreplanillaPDF): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = PageSizes.Letter[0];
  const pageHeight = PageSizes.Letter[1];
  const margin = 46;
  const tableLeft = margin;
  const tableRight = pageWidth - margin;

  // Bloque de identificación: dos columnas de pares etiqueta:valor.
  const colLabelA = margin;
  const colValA = margin + 70;
  const colLabelB = margin + 260;
  const colValB = margin + 330;

  // Tabla de conceptos: Concepto | Cantidad | Asignación | Deducción.
  const colConcepto = margin;
  const colCantidadRight = margin + 300;
  const colAsignacionRight = margin + 410;
  const colDeduccionRight = tableRight;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function texto(t: string, x: number, yy: number, opts: { size?: number; bold?: boolean; color?: any } = {}) {
    page.drawText(t, { x, y: yy, size: opts.size ?? 9, font: opts.bold ? fontBold : font, color: opts.color ?? INK });
  }
  function textoDer(t: string, xRight: number, yy: number, opts: { size?: number; bold?: boolean; color?: any } = {}) {
    const size = opts.size ?? 9;
    const f = opts.bold ? fontBold : font;
    texto(t, xRight - f.widthOfTextAtSize(t, size), yy, opts);
  }
  function hline(x1: number, x2: number, yy: number, color = LINE, thickness = 0.75) {
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness, color });
  }

  const tituloEstado = datos.estado === "BORRADOR" ? "PREPLANILLA — NO VÁLIDO PARA PAGO" : "PLANILLA APROBADA";
  const colorEstado = datos.estado === "BORRADOR" ? GOLD : EMERALD;

  function encabezadoCompleto() {
    texto("CEIBA", margin, y, { size: 20, bold: true, color: EMERALD });
    textoDer(`Generado: ${datos.generadoEl.toLocaleString("es-NI")}`, tableRight, y + 5, { size: 8, color: DIM });
    y -= 18;
    texto(tituloEstado, margin, y, { size: 12, bold: true, color: colorEstado });
    if (datos.aprobadoEl) {
      textoDer(`Aprobado: ${datos.aprobadoEl.toLocaleString("es-NI")}`, tableRight, y + 3, { size: 8, color: DIM });
    }
    y -= 18;
    texto(`${datos.empresa}  ·  Período: ${datos.periodo}`, margin, y, { size: 10, bold: true });
    y -= 12;
    hline(tableLeft, tableRight, y, INK, 1.2);
    y -= 22;
  }

  function encabezadoContinuacion() {
    texto(`${datos.empresa}  ·  Período: ${datos.periodo}`, margin, y, { size: 9, bold: true, color: DIM });
    textoDer(tituloEstado, tableRight, y, { size: 8, bold: true, color: colorEstado });
    y -= 10;
    hline(tableLeft, tableRight, y);
    y -= 20;
  }

  function nuevaPagina() {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
    encabezadoContinuacion();
  }

  encabezadoCompleto();

  let totAsignacion = 0;
  let totDeduccion = 0;
  let totNeto = 0;
  let n = 0;

  for (const f of datos.filas) {
    n++;

    // Conceptos que forman parte de esta liquidación de período (se omiten
    // los que no aplican, para no llenar el comprobante de ceros).
    type Concepto = { nombre: string; cantidad?: string; asignacion?: number; deduccion?: number };
    const conceptos: Concepto[] = [{ nombre: "Salario base", asignacion: f.bruto }];
    if (f.horasExtraMonto > 0) {
      conceptos.push({ nombre: "Horas extra", cantidad: `${f.horasExtraCantidad} h`, asignacion: f.horasExtraMonto });
    }
    if (f.comisiones > 0) conceptos.push({ nombre: "Comisiones", asignacion: f.comisiones });
    if (f.retroactivos > 0) conceptos.push({ nombre: "Retroactivos", asignacion: f.retroactivos });
    if (f.viaticos > 0) conceptos.push({ nombre: "Viáticos", asignacion: f.viaticos });
    conceptos.push({ nombre: "INSS laboral", cantidad: "7%", deduccion: f.inss });
    conceptos.push({ nombre: "IR retenido", deduccion: f.ir });

    // Alto estimado del bloque completo, para decidir si cabe en lo que
    // queda de página antes de empezar a dibujarlo.
    const altoBloque = 58 + conceptos.length * 13 + 40;
    if (y - altoBloque < margin + (datos.estado === "BORRADOR" ? 60 : 0)) nuevaPagina();

    // ---------- Identificación del colaborador ----------
    texto("Trabajador", colLabelA, y, { size: 8, color: DIM });
    texto(f.codigo || String(n).padStart(3, "0"), colValA, y, { size: 9, bold: true });
    texto("Cédula", colLabelB, y, { size: 8, color: DIM });
    texto(f.cedula || "—", colValB, y, { size: 9 });
    y -= 15;

    texto("Nombre", colLabelA, y, { size: 8, color: DIM });
    texto(f.nombre, colValA, y, { size: 10, bold: true });
    texto("Ingreso", colLabelB, y, { size: 8, color: DIM });
    texto(f.fechaIngreso ? new Date(f.fechaIngreso).toLocaleDateString("es-NI") : "—", colValB, y, { size: 9 });
    y -= 15;

    texto("Cargo", colLabelA, y, { size: 8, color: DIM });
    texto(f.puesto, colValA, y, { size: 9 });
    texto("Sueldo", colLabelB, y, { size: 8, color: DIM });
    textoDer(money(f.bruto), tableRight, y, { size: 9, bold: true });
    y -= 12;
    hline(tableLeft, tableRight, y);
    y -= 14;

    // ---------- Tabla de conceptos ----------
    texto("Concepto", colConcepto, y, { size: 7.5, bold: true, color: DIM });
    textoDer("Cantidad", colCantidadRight, y, { size: 7.5, bold: true, color: DIM });
    textoDer("Asignación", colAsignacionRight, y, { size: 7.5, bold: true, color: EMERALD });
    textoDer("Deducción", colDeduccionRight, y, { size: 7.5, bold: true, color: GOLD });
    y -= 5;
    hline(tableLeft, tableRight, y);
    y -= 13;

    let subAsignacion = 0;
    let subDeduccion = 0;
    conceptos.forEach((c, i) => {
      texto(`${i + 1}`, colConcepto, y, { size: 8, color: DIM });
      texto(c.nombre, colConcepto + 16, y, { size: 8.5 });
      if (c.cantidad) textoDer(c.cantidad, colCantidadRight, y, { size: 8, color: DIM });
      if (c.asignacion !== undefined) {
        textoDer(money(c.asignacion), colAsignacionRight, y, { size: 8.5 });
        subAsignacion = round2(subAsignacion + c.asignacion);
      }
      if (c.deduccion !== undefined) {
        textoDer(money(c.deduccion), colDeduccionRight, y, { size: 8.5 });
        subDeduccion = round2(subDeduccion + c.deduccion);
      }
      y -= 13;
    });

    hline(colCantidadRight + 4, tableRight, y + 3);
    y -= 2;
    texto("Totales:", colConcepto + 16, y, { size: 8.5, bold: true });
    textoDer(money(subAsignacion), colAsignacionRight, y, { size: 8.5, bold: true });
    textoDer(money(subDeduccion), colDeduccionRight, y, { size: 8.5, bold: true });
    y -= 15;

    texto("Total neto del colaborador:", colConcepto + 16, y, { size: 9, bold: true, color: EMERALD });
    textoDer(money(f.neto), tableRight, y, { size: 10, bold: true, color: EMERALD });
    y -= 18;
    hline(tableLeft, tableRight, y, LINE, 1.4);
    y -= 22;

    totAsignacion = round2(totAsignacion + subAsignacion);
    totDeduccion = round2(totDeduccion + subDeduccion);
    totNeto = round2(totNeto + f.neto);
  }

  // ---------- Totales del período ----------
  if (y < margin + (datos.estado === "BORRADOR" ? 100 : 40)) nuevaPagina();
  texto(`TOTAL ${datos.estado === "BORRADOR" ? "PREPLANILLA" : "PLANILLA"} — ${datos.empresa}`, colConcepto, y, {
    size: 9.5,
    bold: true,
  });
  textoDer(`${n} colaborador${n === 1 ? "" : "es"}`, colCantidadRight, y, { size: 8, color: DIM });
  textoDer(money(totAsignacion), colAsignacionRight, y, { size: 9.5, bold: true });
  textoDer(money(totDeduccion), colDeduccionRight, y, { size: 9.5, bold: true });
  y -= 16;
  texto("Total neto del período:", colConcepto, y, { size: 9.5, bold: true, color: EMERALD });
  textoDer(money(totNeto), tableRight, y, { size: 11, bold: true, color: EMERALD });
  y -= 30;

  if (datos.estado === "BORRADOR") {
    if (y < margin + 60) nuevaPagina();
    texto(
      "Este documento es un borrador para revisión. Los montos no son definitivos hasta que el negocio los apruebe dentro de la plataforma.",
      margin,
      y,
      { size: 8, color: DIM }
    );
    y -= 34;
    texto("Aprobado por (nombre y firma): _______________________________", margin, y, { size: 9 });
    texto("Fecha: ______________", tableRight - 140, y, { size: 9 });
  }

  return pdf.save();
}
