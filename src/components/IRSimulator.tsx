"use client";
import { useState } from "react";
import { calcularPeriodo } from "@/lib/payroll";

export default function IRSimulator() {
  const [salario, setSalario] = useState(9200);
  const [horas, setHoras] = useState(0);
  const [comisiones, setComisiones] = useState(0);
  const [retroactivos, setRetroactivos] = useState(0);
  const [viaticos, setViaticos] = useState(0);
  const [antiguedadMeses, setAntiguedadMeses] = useState(12);
  const [exentoIR, setExentoIR] = useState(false);
  const [tipoContrato, setTipoContrato] = useState<"LABORAL" | "SERVICIOS_PROFESIONALES">("LABORAL");
  const [acumulaPrestaciones, setAcumulaPrestaciones] = useState(true);

  const d = calcularPeriodo({
    bruto: salario || 0,
    horasExtraCantidad: horas || 0,
    comisiones: comisiones || 0,
    retroactivos: retroactivos || 0,
    viaticos: viaticos || 0,
    antiguedadMeses: antiguedadMeses || 0,
    exentoIR,
    tipoContrato,
    acumulaPrestaciones,
  });

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-3">
        <NumField label="Salario bruto (C$)" value={salario} onChange={setSalario} />
        <NumField label="Horas extra" value={horas} onChange={setHoras} step={0.5} />
        <NumField label="Comisiones (C$)" value={comisiones} onChange={setComisiones} />
        <NumField label="Retroactivos (C$)" value={retroactivos} onChange={setRetroactivos} />
        <NumField label="Viáticos (C$)" value={viaticos} onChange={setViaticos} />
        <NumField label="Antigüedad (meses)" value={antiguedadMeses} onChange={setAntiguedadMeses} />
      </div>
      <div className="flex flex-wrap items-center gap-4 mb-5">
        <div>
          <label className="block text-xs text-inkdim mb-1.5">Tipo de contrato</label>
          <select
            value={tipoContrato}
            onChange={(e) => setTipoContrato(e.target.value as "LABORAL" | "SERVICIOS_PROFESIONALES")}
            className="bg-[#12181a] border border-linestrong rounded-lg px-3 py-2 text-sm"
          >
            <option value="LABORAL">Laboral</option>
            <option value="SERVICIOS_PROFESIONALES">Servicios profesionales</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-inkdim">
          <input type="checkbox" checked={exentoIR} onChange={(e) => setExentoIR(e.target.checked)} disabled={tipoContrato === "SERVICIOS_PROFESIONALES"} />
          Simular negocio en régimen Cuota Fija (no se calcula IR laboral)
        </label>
        <label className="flex items-center gap-2 text-xs text-inkdim">
          <input
            type="checkbox"
            checked={acumulaPrestaciones}
            onChange={(e) => setAcumulaPrestaciones(e.target.checked)}
            disabled={tipoContrato === "SERVICIOS_PROFESIONALES"}
          />
          Acumula prestaciones (aguinaldo/vacaciones/antigüedad)
        </label>
      </div>
      <table className="w-full text-sm">
        <tbody>
          <Row label="Salario bruto" value={money(d.bruto)} />
          <Row label="Horas extra (recargo 100%, Art. 62/65 CT)" value={money(d.horasExtraMonto)} />
          <Row label="Comisiones" value={money(d.comisiones)} />
          <Row label="Retroactivos" value={money(d.retroactivos)} />
          <Row label="Total gravable" value={money(d.totalGravable)} />
          {d.esServiciosProfesionales ? (
            <>
              <Row label="INSS laboral" value="No aplica — sin relación de subordinación" />
              <Row label="Retención servicios profesionales (10% fijo)" value={"− " + money(d.irMensual)} />
            </>
          ) : (
            <>
              <Row label="INSS laboral (7%)" value={"− " + money(d.inssLaboral)} />
              <Row label="Base imponible mensual" value={money(d.baseImponibleMensual)} />
              <Row label="Expectativa de renta anual (× 12)" value={money(d.expectativaAnual)} />
              <Row label="Tramo aplicable (Art. 23, Ley 822)" value={`hasta ${d.tramo.hasta === Infinity ? "∞" : money(d.tramo.hasta)}, ${(d.tramo.tasa * 100).toFixed(0)}%`} />
              <Row label={exentoIR ? "IR mensual a retener (exento — Cuota Fija)" : "IR mensual a retener"} value={"− " + money(d.irMensual)} />
            </>
          )}
          <Row label="Viáticos (no gravable)" value={"+ " + money(d.viaticos)} />
          <tr className="border-t border-linestrong">
            <td className="py-2 font-semibold">Neto a pagar</td>
            <td className="py-2 text-right font-semibold font-mono">{money(d.netoPagar)}</td>
          </tr>
          <tr><td colSpan={2} className="pt-4 pb-1 text-xs text-inkfaint uppercase font-mono">Provisiones laborales del mes (Código del Trabajo)</td></tr>
          {!acumulaPrestaciones || d.esServiciosProfesionales ? (
            <tr><td colSpan={2} className="py-2 text-xs text-inkfaint">No acumula — {d.esServiciosProfesionales ? "servicios profesionales" : "acumulación apagada"}.</td></tr>
          ) : (
            <>
              <Row label="Aguinaldo (Art. 93-99 CT, exenta)" value={money(d.provisionAguinaldo)} />
              <Row label="Vacaciones (Art. 76-82 CT, sí paga INSS/IR al disfrutarse)" value={money(d.provisionVacaciones)} />
              <Row label="Indemnización por antigüedad (Art. 45 CT, exenta)" value={money(d.provisionIndemnizacion)} />
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function NumField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <div>
      <label className="block text-xs text-inkdim mb-1.5">{label}</label>
      <input
        type="number" value={value} min={0} step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-[#12181a] border border-linestrong rounded-lg px-3 py-2 text-sm"
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-line">
      <td className="py-2 text-inkdim">{label}</td>
      <td className="py-2 text-right font-mono">{value}</td>
    </tr>
  );
}

function money(n: number) {
  return "C$ " + n.toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
