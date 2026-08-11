import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";
import IRSimulator from "@/components/IRSimulator";
import crypto from "crypto";

export const dynamic = "force-dynamic";

async function createCompany(formData: FormData) {
  "use server";
  const name = String(formData.get("name") || "").trim();
  const ownerEmail = String(formData.get("ownerEmail") || "").toLowerCase().trim();
  if (!name || !ownerEmail) return;

  const tempPassword = crypto.randomBytes(6).toString("base64url");
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const company = await prisma.company.create({ data: { name } });
  await prisma.user.create({
    data: { email: ownerEmail, passwordHash, role: "COMPANY_OWNER", companyId: company.id },
  });

  redirect(`/admin?created=${encodeURIComponent(ownerEmail)}&pwd=${encodeURIComponent(tempPassword)}`);
}

async function toggleCase(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const current = await prisma.supportCase.findUnique({ where: { id } });
  if (!current) return;
  await prisma.supportCase.update({ where: { id }, data: { resolved: !current.resolved } });
}

async function createCase(formData: FormData) {
  "use server";
  const companyId = String(formData.get("companyId") || "");
  const title = String(formData.get("title") || "").trim();
  const detail = String(formData.get("detail") || "").trim();
  if (!companyId || !title) return;
  await prisma.supportCase.create({ data: { companyId, title, detail } });
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { created?: string; pwd?: string };
}) {
  const companies = await prisma.company.findMany({
    include: { employees: true },
    orderBy: { createdAt: "desc" },
  });
  const cases = await prisma.supportCase.findMany({
    include: { company: true },
    orderBy: { createdAt: "desc" },
  });

  const openCases = cases.filter((c) => !c.resolved);
  const totalEmployees = companies.reduce((a, c) => a + c.employees.length, 0);

  return (
    <main className="min-h-screen bg-bg text-ink px-6 py-10 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Panel de proveedor</h1>
          <div className="text-inkfaint text-xs font-mono mt-1">CEIBA · CUENTA ADMINISTRADORA</div>
        </div>
        <SignOutButton />
      </div>

      {searchParams.created && (
        <div className="bg-emerald/10 border border-emerald rounded-xl p-4 mb-8 text-sm">
          Cuenta creada para <strong>{searchParams.created}</strong>. Contraseña temporal:{" "}
          <code className="bg-black/30 px-2 py-1 rounded">{searchParams.pwd}</code>
          <div className="text-inkfaint text-xs mt-2">
            Envíasela por un canal seguro (no por este enlace) y pídele que la cambie
            en su primer ingreso — este flujo aún no incluye cambio de contraseña
            forzado ni envío automático de correo.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <Stat label="Negocios registrados" value={String(companies.length)} />
        <Stat label="Colaboradores gestionados" value={String(totalEmployees)} />
        <Stat label="Casos abiertos" value={String(openCases.length)} accent="gold" />
      </div>

      <section className="bg-panel border border-line rounded-xl p-6 mb-6">
        <h3 className="font-serif text-lg font-semibold mb-4">Negocios</h3>
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="text-inkfaint text-xs uppercase font-mono text-left border-b border-linestrong">
              <th className="pb-2">Negocio</th><th className="pb-2">Colaboradores</th>
              <th className="pb-2">INSS patronal</th><th className="pb-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-b border-line">
                <td className="py-3 font-medium">{c.name}</td>
                <td className="py-3">{c.employees.length}</td>
                <td className="py-3">{c.employees.length >= 50 ? "22.5%" : "21.5%"}</td>
                <td className="py-3 text-xs font-mono text-emerald">{c.status}</td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-inkfaint">Todavía no registras negocios.</td></tr>
            )}
          </tbody>
        </table>

        <form action={createCompany} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-inkdim mb-1.5">Nombre del negocio</label>
            <input name="name" required placeholder="Café del Bosque S.A."
              className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-inkdim mb-1.5">Correo del dueño / RRHH</label>
            <input name="ownerEmail" type="email" required placeholder="dueño@negocio.com"
              className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm" />
          </div>
          <button className="px-5 py-3 rounded-lg bg-emerald text-[#eafaf3] text-sm font-medium">
            Registrar negocio
          </button>
        </form>
      </section>

      <section className="bg-panel border border-line rounded-xl p-6 mb-6">
        <h3 className="font-serif text-lg font-semibold mb-4">Casos abiertos — requieren tu intervención</h3>
        {cases.length === 0 && <div className="text-inkfaint text-sm">No hay casos registrados todavía.</div>}
        {cases.map((c) => (
          <div key={c.id} className="py-4 border-b border-line flex justify-between items-start gap-4">
            <div>
              <div className="font-mono text-[11px] text-inkfaint mb-1">{c.company.name.toUpperCase()}</div>
              <div className={`font-medium mb-1 ${c.resolved ? "line-through text-inkfaint" : ""}`}>{c.title}</div>
              <div className="text-sm text-inkdim max-w-xl">{c.detail}</div>
            </div>
            <form action={toggleCase}>
              <input type="hidden" name="id" value={c.id} />
              <button className={`px-3.5 py-2 rounded-lg text-xs font-medium ${c.resolved ? "border border-linestrong" : "bg-emerald text-[#eafaf3]"}`}>
                {c.resolved ? "Reabrir" : "Marcar resuelto"}
              </button>
            </form>
          </div>
        ))}

        <form action={createCase} className="flex flex-wrap gap-3 items-end mt-5 pt-5 border-t border-line">
          <div>
            <label className="block text-xs text-inkdim mb-1.5">Negocio</label>
            <select name="companyId" required className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm">
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-inkdim mb-1.5">Título del caso</label>
            <input name="title" required placeholder="Ej. Salario variable / comisiones"
              className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm w-64" />
          </div>
          <div>
            <label className="block text-xs text-inkdim mb-1.5">Detalle</label>
            <input name="detail" placeholder="Qué necesita revisión y por qué"
              className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm w-80" />
          </div>
          <button className="px-5 py-3 rounded-lg bg-lava text-white text-sm font-medium">
            Registrar caso
          </button>
        </form>
      </section>

      <section className="bg-panel border border-line rounded-xl p-6">
        <h3 className="font-serif text-lg font-semibold mb-4">Simulador de verificación</h3>
        <p className="text-inkdim text-sm mb-4">
          Para depurar un caso a mano: recalcula paso a paso con la misma fórmula
          que usa la plataforma (Art. 23, Ley 822).
        </p>
        <IRSimulator />
      </section>
    </main>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "gold" }) {
  return (
    <div className="bg-panel border border-line rounded-xl px-5 py-5">
      <div className="text-inkfaint text-[11px] uppercase font-mono tracking-wide">{label}</div>
      <div className={`font-serif text-2xl font-semibold mt-2 ${accent === "gold" ? "text-gold" : ""}`}>{value}</div>
    </div>
  );
}
