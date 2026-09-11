// Marca de Ceiba — ícono (copa de la ceiba, plana y superpuesta, con acento
// dorado) + wordmark en Fraunces, la misma fuente que ya usan los títulos de
// la plataforma (ver tailwind.config.ts: fontFamily.serif).
//
// Uso:
//   <CeibaLogo />                          // ícono + "CEIBA", para fondo oscuro
//   <CeibaLogo variant="light" />          // para fondo claro (PDF, impresos)
//   <CeibaLogo iconOnly size={28} />       // solo el ícono, ej. favicon/nav
//   <CeibaLogo direction="vertical" />     // apilado, para pantallas de carga

export default function CeibaLogo({
  variant = "dark",
  iconOnly = false,
  direction = "horizontal",
  size = 32,
  className = "",
}: {
  variant?: "dark" | "light";
  iconOnly?: boolean;
  direction?: "horizontal" | "vertical";
  size?: number;
  className?: string;
}) {
  const wordColor = variant === "light" ? "#1c2624" : "#f3efe6";

  const icon = (
    <svg viewBox="0 0 100 100" role="img" aria-label="Ceiba" width={size} height={size}>
      <path d="M45,94 L55,94 L52,62 L48,62 Z" fill="#2a5c4b" />
      <path d="M10,66 C10,44 90,44 90,66 Z" fill="#2a5c4b" />
      <path d="M12,66 C12,40 64,40 64,66 Z" fill="#3d8a73" />
      <path d="M46,66 C46,42 92,42 92,66 Z" fill="#5fae8f" />
      <circle cx="58" cy="47" r="4.2" fill="#c9a227" />
    </svg>
  );

  if (iconOnly) return <span className={className}>{icon}</span>;

  return (
    <span
      className={`inline-flex items-center ${direction === "vertical" ? "flex-col gap-2" : "gap-2.5"} ${className}`}
    >
      {icon}
      <span
        className="font-serif font-semibold"
        style={{ color: wordColor, letterSpacing: "0.06em", fontSize: size * 0.62 }}
      >
        CEIBA
      </span>
    </span>
  );
}
