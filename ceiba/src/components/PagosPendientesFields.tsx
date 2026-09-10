"use client";
import { useState } from "react";

/**
 * Lista de conceptos de pago pendiente para el formulario de "Dar de baja" —
 * quincena no planillada, mes adicional, comisión, etc. Se pueden agregar
 * tantas filas como haga falta; cada una manda dos campos con el MISMO
 * nombre (ppConcepto / ppMonto), que el servidor lee con
 * formData.getAll(...) y empareja por posición. Todos se pagan juntos en el
 * mismo cheque de liquidación, así que la retención de ley se calcula sobre
 * la suma de todos, no fila por fila (ver src/lib/provisiones.ts).
 */
export default function PagosPendientesFields() {
  const [filas, setFilas] = useState<number[]>([0]);
  let siguienteId = filas.length ? Math.max(...filas) + 1 : 0;

  return (
    <div className="w-full space-y-2">
      {filas.map((id, i) => (
        <div key={id} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-inkdim mb-1.5">
              {i === 0 ? "Concepto del pago pendiente" : "Otro concepto"}
            </label>
            <input
              name="ppConcepto"
              placeholder='Ej. "Quincena 1-15 sept" o "Mes adicional"'
              className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm w-64"
            />
          </div>
          <div>
            <label className="block text-xs text-inkdim mb-1.5">Monto bruto (C$)</label>
            <input
              name="ppMonto"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
              className="w-36 bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm"
            />
          </div>
          {filas.length > 1 && (
            <button
              type="button"
              onClick={() => setFilas((f) => f.filter((x) => x !== id))}
              className="px-3 py-2.5 rounded-lg border border-linestrong text-xs text-inkfaint hover:border-lava hover:text-lava transition"
            >
              Quitar
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setFilas((f) => [...f, siguienteId])}
        className="text-xs text-gold hover:underline"
      >
        + Agregar otro pago pendiente
      </button>
      <p className="text-inkfaint text-xs">
        Se le calcula INSS laboral e IR igual que a cualquier salario — si agregas varios, se suman y la
        retención se calcula una sola vez sobre el total, porque se pagan juntos en el mismo cheque.
      </p>
    </div>
  );
}
