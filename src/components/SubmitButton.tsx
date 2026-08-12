"use client";
import { useFormStatus } from "react-dom";

/**
 * Botón de envío que se desactiva mientras la acción del servidor está en
 * curso, para evitar que un doble clic cree registros duplicados.
 */
export default function SubmitButton({
  children,
  className,
  pendingText = "Guardando…",
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-60 disabled:cursor-not-allowed`}>
      {pending ? pendingText : children}
    </button>
  );
}
