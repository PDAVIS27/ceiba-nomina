// Marca de Ceiba — ícono (copa de la ceiba, plana y superpuesta, con acento
// dorado) + wordmark en Fraunces, la misma fuente que ya usan los títulos de
// la plataforma (ver tailwind.config.ts: fontFamily.serif).
//
// Uso:
//   <CeibaLogo />                          // ícono + "CEIBA", para fondo oscuro
//   <CeibaLogo variant="light" />          // para fondo claro (PDF, impresos)
//   <CeibaLogo iconOnly size={28} />       // solo el ícono, ej. favicon/nav
//   <CeibaLogo direction="vertical" />     // apilado, para pantallas de carga
//   <CeibaLogo animated size={44} />       // entrada animada (copa "crece" +
//                                          // acento dorado con brillo) — usar
//                                          // solo donde el logo es protagonista
//                                          // del momento (ej. login), no en
//                                          // usos utilitarios repetidos como
//                                          // el sidebar. Ver @keyframes
//                                          // ceiba-* en globals.css.

export default function CeibaLogo({
  variant = "dark",
  iconOnly = false,
  direction = "horizontal",
  size = 32,
  animated = false,
  className = "",
}: {
  variant?: "dark" | "light";
  iconOnly?: boolean;
  direction?: "horizontal" | "vertical";
  size?: number;
  animated?: boolean;
  className?: string;
}) {
  const wordColor = variant === "light" ? "#1c2624" : "#f3efe6";
  const part = (cls: string) => (animated ? `ceiba-part ${cls}` : undefined);

  const icon = (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="Ceiba"
      width={size}
      height={size}
      className={animated ? "ceiba-anim-icon" : undefined}
    >
      <path d="M45,94 L55,94 L52,62 L48,62 Z" fill="#2a5c4b" className={part("ceiba-part-trunk")} />
      <path d="M10,66 C10,44 90,44 90,66 Z" fill="#2a5c4b" className={part("ceiba-part-lobe1")} />
      <path d="M12,66 C12,40 64,40 64,66 Z" fill="#3d8a73" className={part("ceiba-part-lobe2")} />
      <path d="M46,66 C46,42 92,42 92,66 Z" fill="#5fae8f" className={part("ceiba-part-lobe3")} />
      <circle cx="58" cy="47" r="4.2" fill="#c9a227" className={part("ceiba-part-bud")} />
    </svg>
  );

  if (iconOnly) return <span className={className}>{icon}</span>;

  return (
    <span
      className={`inline-flex items-center ${direction === "vertical" ? "flex-col gap-2" : "gap-2.5"} ${className}`}
    >
      {icon}
      <span
        className={`font-serif font-semibold ${animated ? "ceiba-anim-word" : ""}`}
        style={{ color: wordColor, letterSpacing: "0.06em", fontSize: size * 0.62 }}
      >
        CEIBA
      </span>
    </span>
  );
}
