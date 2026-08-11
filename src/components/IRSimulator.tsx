"use client";
import { useState } from "react";
import { calcularIR } from "@/lib/payroll";

export default function IRSimulator() {
  const [salario, setSalario] = useState(9200);
  const d = calcularIR(salario || 0);

  return (
    <div>
      <div className="mb-4 max-w-[240px]">
        <label className="block text-xs text-inkdim mb-1.5">Salario bruto mensual (C$)</label>
        <input
          type="number" value={salario} min={0} step={100}
          onChange={(e) => setSalario(Number(e.target.value))}
          className="w-full bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm"
        />
      </div>
      <table className="w-full text-sm">
        <tbody>
          <Row label="Salario bruto mensual" value={money(d.bruto)} />
          <Row label="INSS laboral (7%)" value={"− " + money(d.inssLaboral)} />
          <Row label="Base imponible mensual" value={money(d.baseImponibleMensual)} />
          <Row label="Expectativa de renta anual (× 12)" value={money(d.expectativaAnual)} />
          <Row label="Tramo aplicable (Art. 23, Ley 822)" value={`hasta ${d.tramo.hasta === Infinity ? "∞" : money(d.tramo.hasta)}, ${(d.tramo.tasa * 100).toFixed(0)}%`} />
          <Row label="IR anual" value={money(d.irAnual)} />
          <Row label="IR mensual a retener (÷12)" value={money(d.irMensual)} />
          <tr className="border-t border-linestrong">
            <td className="py-2 font-semibold">Neto mensual</td>
            <td className="py-2 text-right font-semibold font-mono">{money(d.neto)}</td>
          </tr>
        </tbody>
      </table>
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
