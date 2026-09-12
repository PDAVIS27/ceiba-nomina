"use client";

// <select> que envía su <form> automáticamente al cambiar de valor. Tiene
// que ser un componente cliente aparte: un onChange en línea dentro de un
// Server Component (como src/app/admin/page.tsx) hace que Next.js truene
// toda la página con "Event handlers cannot be passed to Client Component
// props" — los props de un elemento del DOM que vienen de un Server
// Component no pueden ser funciones.
export default function AutoSubmitSelect({
  name,
  defaultValue,
  options,
  className,
  title,
}: {
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  className?: string;
  title?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={className}
      title={title}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
