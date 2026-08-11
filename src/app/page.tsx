import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <nav className="border-b border-line sticky top-0 bg-bg/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-8 h-[72px] flex items-center justify-between">
          <div className="font-serif text-xl font-semibold">Ceiba</div>
          <div className="flex gap-3">
            <Link href="/login" className="px-4 py-2 rounded-lg border border-linestrong text-sm hover:border-gold hover:text-gold transition">
              Iniciar sesión
            </Link>
          </div>
        </div>
      </nav>

      <header className="max-w-6xl mx-auto px-8 py-24 grid md:grid-cols-2 gap-14 items-center">
        <div>
          <div className="font-mono text-xs tracking-widest uppercase text-gold mb-5">
            Nómina hecha para la ley nicaragüense
          </div>
          <h1 className="font-serif text-5xl leading-tight mb-6">
            Cada quincena, <em className="text-emerald not-italic">cuadrada</em> antes de que la pidan.
          </h1>
          <p className="text-inkdim text-lg max-w-md mb-8">
            Ceiba calcula INSS, IR e INATEC con la Ley 822 y su Reglamento,
            arma la planilla de tu empresa en córdobas y deja el comprobante
            listo para cada colaborador.
          </p>
          <Link href="/login" className="inline-block px-7 py-3 rounded-lg bg-gold text-[#1b1500] font-medium">
            Entrar a la plataforma →
          </Link>
        </div>

        <div className="receipt rounded-sm p-6 max-w-[340px] mx-auto font-mono text-sm shadow-2xl -rotate-2">
          <div className="text-center border-b border-dashed border-black/30 pb-3 mb-3">
            <div className="font-serif text-lg font-semibold">Comprobante de pago</div>
            <div className="text-[11px] tracking-wide text-black/50">PERIODO · 16–31 JUL 2026</div>
          </div>
          <Row label="María Gutiérrez — Cajera" value="" />
          <Row label="Salario bruto" value="C$ 9,200.00" dim />
          <Row label="INSS laboral (7%)" value="− C$ 644.00" dim />
          <Row label="IR (Art. 23, Ley 822)" value="− C$ 33.40" dim />
          <div className="border-t border-dashed border-black/30 mt-2 pt-3 flex justify-between font-semibold text-base">
            <span>Neto a pagar</span><span>C$ 8,522.60</span>
          </div>
        </div>
      </header>

      <footer className="border-t border-line py-10">
        <div className="max-w-6xl mx-auto px-8 text-inkfaint text-sm flex justify-between flex-wrap gap-4">
          <div>Ceiba · Nómina para Nicaragua</div>
          <div>Hecho para PYMEs de Managua, León y Granada</div>
        </div>
      </footer>
    </main>
  );
}

function Row({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${dim ? "text-black/60" : ""}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
