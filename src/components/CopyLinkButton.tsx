"use client";

import { useState } from "react";

// Botón que copia un texto (el enlace de aprobación, o el mensaje de
// WhatsApp ya armado con ese enlace adentro) al portapapeles del negocio —
// para que lo pegue donde quiera (WhatsApp, SMS, su propio correo) sin
// depender de que Ceiba tenga un proveedor de correo configurado. Tiene que
// ser un componente cliente aparte por lo mismo que AutoSubmitSelect: un
// onClick en línea en un Server Component truena.
export default function CopyLinkButton({
  text,
  className,
  label = "Copiar enlace",
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(text);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Si el portapapeles no está disponible (navegador viejo, http sin
      // permiso), el negocio igual puede seleccionar y copiar el texto a
      // mano — el enlace o mensaje ya está visible al lado de este botón.
    }
  }

  return (
    <button type="button" onClick={copiar} className={className}>
      {copiado ? "¡Copiado! ✓" : label}
    </button>
  );
}
