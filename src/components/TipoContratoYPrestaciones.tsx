"use client";

import { useState } from "react";

// Selector de "Tipo de contrato" + casilla "Acumula prestaciones", juntos en
// un componente cliente porque necesitan reaccionar el uno al otro: al
// cambiar el tipo de contrato, la casilla salta al valor típico de ese tipo
// (marcada para Laboral, sin marcar para Servicios profesionales) — pero
// sigue siendo un checkbox normal que el negocio puede marcar o desmarcar a
// mano después, para cualquiera de los dos tipos. Antes, Ceiba forzaba la
// casilla apagada y deshabilitada para Servicios profesionales sin dejar
// override — eso impedía reconocerle prestaciones a un colaborador que, en
// la práctica, SÍ debía acumularlas aunque se le pague por servicios
// profesionales (sin INSS/IR). Ver calcularPeriodo() en src/lib/payroll.ts.
//
// Sigue siendo parte de un <form action={...}> normal por fuera: el
// <select> y el <input type="checkbox"> de aquí adentro tienen sus mismos
// `name`, así que el server action que reciba el formulario los lee igual
// que antes — este componente solo sincroniza sus valores por defecto.
export default function TipoContratoYPrestaciones({
  defaultTipoContrato,
  defaultAcumulaPrestaciones,
  idPrefix,
}: {
  defaultTipoContrato: "LABORAL" | "SERVICIOS_PROFESIONALES";
  defaultAcumulaPrestaciones: boolean;
  idPrefix?: string;
}) {
  const [tipoContrato, setTipoContrato] = useState(defaultTipoContrato);
  const [acumula, setAcumula] = useState(defaultAcumulaPrestaciones);

  return (
    <>
      <div>
        <label className="block text-xs text-inkdim mb-1.5">Tipo de contrato</label>
        <select
          name="tipoContrato"
          id={idPrefix ? `tipoContrato-${idPrefix}` : undefined}
          value={tipoContrato}
          onChange={(e) => {
            const nuevo = e.target.value === "SERVICIOS_PROFESIONALES" ? "SERVICIOS_PROFESIONALES" : "LABORAL";
            setTipoContrato(nuevo);
            // Salta al valor típico de ese tipo — el negocio puede
            // corregirlo manualmente después con la casilla de al lado.
            setAcumula(nuevo === "LABORAL");
          }}
          className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm w-56"
        >
          <option value="LABORAL">Laboral (planilla, con prestaciones)</option>
          <option value="SERVICIOS_PROFESIONALES">Servicios profesionales (honorarios, sin relación laboral)</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs text-inkdim pb-2.5">
        <input
          type="checkbox"
          name="acumulaPrestaciones"
          checked={acumula}
          onChange={(e) => setAcumula(e.target.checked)}
          className="accent-emerald"
        />
        Acumula aguinaldo / vacaciones / antigüedad
      </label>
    </>
  );
}
