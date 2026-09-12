import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";
import SubmitButton from "@/components/SubmitButton";
import IRSimulator from "@/components/IRSimulator";
import crypto from "crypto";
import { CATEGORIAS_PROBLEMA, etiquetaCategoria } from "@/lib/supportCategories";
import { REGIMENES_FISCALES, etiquetaRegimen } from "@/lib/regimenFiscal";
import CeibaLogo from "@/components/CeibaLogo";

export const dynamic = "force-dynamic";

async function createCompany(formData: FormData) {
  "use server";
  const name = String(formData.get("name") || "").trim();
  const ownerEmail = String(formData.get("ownerEmail") || "").toLowerCase().trim();
  const regimenRaw = String(formData.get("regimenFiscal") || "GENERAL");
  const regimenFiscal = REGIMENES_FISCALES.some((r) => r.value === regimenRaw) ? regimenRaw : "GENERAL";
  if (!name || !ownerEmail) return;

  // Si ya existe una cuenta con ese correo (por ejemplo, por un doble clic o
  // porque ya se había registrado antes), no truena — solo avisa.
  const yaExiste = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (yaExiste) {
    redirect(`/admin?error=${encodeURIComponent(`Ya existe una cuenta con el correo ${ownerEmail}. Usa otro correo o revisa la lista de negocios.`)}`);
  }

  const tempPassword = crypto.randomBytes(6).toString("base64url");
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const company = await prisma.company.create({ data: { name, regimenFiscal: regimenFiscal as any } });
  await prisma.user.create({
    data: { email: ownerEmail, passwordHash, role: "COMPANY_OWNER", companyId: company.id },
  });

  redirect(`/admin?created=${encodeURIComponent(ownerEmail)}&pwd=${encodeURIComponent(tempPassword)}`);
}

async function actualizarRegimen(formData: FormData) {
  "use server";
  const companyId = String(formData.get("companyId") || "");
  const regimenRaw = String(formData.get("regimenFiscal") || "GENERAL");
  const regimenFiscal = REGIMENES_FISCALES.some((r) => r.value === regimenRaw) ? regimenRaw : "GENERAL";
  if (!companyId) return;
  await prisma.company.update({ where: { id: companyId }, data: { regimenFiscal: regimenFiscal as any } });
}

async function toggleCase(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const providerNote = String(formData.get("providerNote") || "").trim() || null;
  const current = await prisma.supportCase.findUnique({ where: { id } });
  if (!current) return;
  // Solo esta función (dentro de /admin, protegido para PROVIDER_ADMIN por
  // el middleware) puede marcar un caso como resuelto — el negocio cliente
  // nunca ve un botón para esto en su propio panel.
  await prisma.supportCase.update({
    where: { id },
    data: {
      resolved: !current.resolved,
      // Al reabrir un caso no se borra la nota anterior; al resolverlo, si
      // escribiste una nueva, reemplaza la anterior.
      ...(providerNote && !current.resolved ? { providerNote } : {}),
    },
  });
}

async function createCase(formData: FormData) {
  "use server";
  const companyId = String(formData.get("companyId") || "");
  const category = String(formData.get("category") || "").trim() || null;
  const title = String(formData.get("title") || "").trim();
  const detail = String(formData.get("detail") || "").trim();
  if (!companyId || !title) return;
  await prisma.supportCase.create({ data: { companyId, category, title, detail } });
}

/**
 * Herramienta de corrección de errores: te deja borrar un período de planilla
 * completo (y sus comprobantes) sin importar su estado — para limpiar
 * duplicados u otros errores humanos, como los que genera dar clic varias
 * veces en "Generar preplanilla".
 *
 * Usa deleteMany (no delete) a propósito: si el período ya no existe —por
 * ejemplo, porque el clic se registró dos veces— no truena con un error,
 * simplemente no borra nada de nuevo.
 */
async function eliminarPeriodoAdmin(formData: FormData) {
  "use server";
  const periodId = String(formData.get("periodId") || "");
  if (!periodId) return;
  await prisma.payslip.deleteMany({ where: { periodId } });
  await prisma.payrollPeriod.deleteMany({ where: { id: periodId } });
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { created?: string; pwd?: string; error?: string };
}) {
  const companies = await prisma.company.findMany({
    include: { employees: true },
    orderBy: { createdAt: "desc" },
  });
  const cases = await prisma.supportCase.findMany({
    include: { company: true },
    orderBy: { createdAt: "desc" },
  });
  const periods = await prisma.payrollPeriod.findMany({
    include: { company: true, payslips: true },
    orderBy: { createdAt: "desc" },
  });

  const conteoPorNombre: Record<string, number> = {};
  for (const p of periods) {
    const clave = `${p.companyId}::${p.label.trim().toLowerCase()}`;
    conteoPorNombre[clave] = (conteoPorNombre[clave] || 0) + 1;
  }
  const periodosDuplicados = periods.filter(
    (p: (typeof periods)[number]) => conteoPorNombre[`${p.companyId}::${p.label.trim().toLowerCase()}`] > 1
  );

  const openCases = cases.filter((c) => !c.resolved);
  const totalEmployees = companies.reduce((a, c) => a + c.employees.length, 0);

  return (
    <main className="min-h-screen bg-bg text-ink px-6 py-10 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <CeibaLogo iconOnly size={28} />
            <h1 className="font-serif text-3xl font-semibold">Panel de proveedor</h1>
          </div>
          <div className="text-inkfaint text-xs font-mono mt-1">CEIBA · CUENTA ADMINISTRADORA</div>
        </div>
        <SignOutButton />
      </div>

      {searchParams.error && (
        <div className="bg-lava/10 border border-lava rounded-xl p-4 mb-8 text-sm">{searchParams.error}</div>
      )}

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
              <th className="pb-2">INSS patronal</th><th className="pb-2">Régimen fiscal</th><th className="pb-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-b border-line">
                <td className="py-3 font-medium">{c.name}</td>
                <td className="py-3">{c.employees.length}</td>
                <td className="py-3">{c.employees.length >= 50 ? "22.5%" : "21.5%"}</td>
                <td className="py-3">
                  <form action={actualizarRegimen} className="flex items-center gap-1.5">
                    <input type="hidden" name="companyId" value={c.id} />
                    <select
                      name="regimenFiscal"
                      defaultValue={c.regimenFiscal}
                      onChange={(e) => e.currentTarget.form?.requestSubmit()}
                      className="bg-[#12181a] border border-linestrong rounded-lg px-2 py-1 text-xs"
                      title="Solo informativo — no cambia el cálculo de IR de sus colaboradores"
                    >
                      {REGIMENES_FISCALES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </form>
                </td>
                <td className="py-3 text-xs font-mono text-emerald">{c.status}</td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-inkfaint">Todavía no registras negocios.</td></tr>
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
          <div>
            <label className="block text-xs text-inkdim mb-1.5">Régimen fiscal</label>
            <select name="regimenFiscal" defaultValue="GENERAL"
              className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm">
              {REGIMENES_FISCALES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <SubmitButton className="px-5 py-3 rounded-lg bg-emerald text-[#eafaf3] text-sm font-medium" pendingText="Registrando…">
            Registrar negocio
          </SubmitButton>
        </form>
        <div className="text-inkfaint text-xs mt-3">
          El régimen fiscal es solo un dato del negocio — no cambia el cálculo del IR de sus colaboradores, que siempre depende del salario de cada quien (Art. 23, Ley 822).
        </div>
      </section>

      <section className="bg-panel border border-line rounded-xl p-6 mb-6">
        <h3 className="font-serif text-lg font-semibold mb-4">Casos abiertos — requieren tu intervención</h3>
        {cases.length === 0 && <div className="text-inkfaint text-sm">No hay casos registrados todavía.</div>}
        {cases.map((c) => (
          <div key={c.id} className="py-4 border-b border-line flex justify-between items-start gap-4 flex-wrap">
            <div className="max-w-xl">
              <div className="font-mono text-[11px] text-inkfaint mb-1">
                {c.company.name.toUpperCase()} · {etiquetaCategoria(c.category)}
              </div>
              <div className={`font-medium mb-1 ${c.resolved ? "line-through text-inkfaint" : ""}`}>{c.title}</div>
              <div className="text-sm text-inkdim">{c.detail}</div>
              {c.providerNote && (
                <div className="text-xs text-emerald mt-1.5">Tu respuesta: {c.providerNote}</div>
              )}
            </div>
            <form action={toggleCase} className="flex gap-2 items-end flex-wrap">
              <input type="hidden" name="id" value={c.id} />
              {!c.resolved && (
                <div>
                  <label className="block text-xs text-inkdim mb-1.5">Respuesta (opcional)</label>
                  <input name="providerNote" placeholder="Qué hiciste o qué debe corregir"
                    className="bg-[#12181a] border border-linestrong rounded-lg px-3 py-2 text-xs w-56" />
                </div>
              )}
              <SubmitButton className={`px-3.5 py-2 rounded-lg text-xs font-medium ${c.resolved ? "border border-linestrong" : "bg-emerald text-[#eafaf3]"}`}>
                {c.resolved ? "Reabrir" : "Marcar resuelto"}
              </SubmitButton>
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
            <label className="block text-xs text-inkdim mb-1.5">Categoría</label>
            <select name="category" className="bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-2.5 text-sm">
              {CATEGORIAS_PROBLEMA.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
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
          <SubmitButton className="px-5 py-3 rounded-lg bg-lava text-white text-sm font-medium" pendingText="Registrando…">
            Registrar caso
          </SubmitButton>
        </form>
      </section>

      <section className="bg-panel border border-line rounded-xl p-6 mb-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-serif text-lg font-semibold">Corregir errores</h3>
          {periodosDuplicados.length > 0 && (
            <span className="text-xs font-mono text-lava">{periodosDuplicados.length} posibles duplicados</span>
          )}
        </div>
        <p className="text-inkdim text-sm mb-4">
          Aquí puedes borrar un período de planilla completo (con sus comprobantes) si se generó por error —
          por ejemplo, si un negocio le dio clic varias veces a "Generar preplanilla" con el mismo nombre.
          Ya agregamos un candado que avisa antes de repetir un nombre, pero esto sirve para limpiar lo que
          ya pasó.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-inkfaint text-xs uppercase font-mono text-left border-b border-linestrong">
              <th className="pb-2">Negocio</th>
              <th className="pb-2">Período</th>
              <th className="pb-2">Estado</th>
              <th className="pb-2">Comprobantes</th>
              <th className="pb-2">Creado</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => {
              const esDuplicado = conteoPorNombre[`${p.companyId}::${p.label.trim().toLowerCase()}`] > 1;
              return (
                <tr key={p.id} className={`border-b border-line ${esDuplicado ? "bg-lava/5" : ""}`}>
                  <td className="py-2.5">{p.company.name}</td>
                  <td className="py-2.5">
                    {p.label} {esDuplicado && <span className="text-lava text-xs ml-1">⚠ posible duplicado</span>}
                  </td>
                  <td className="py-2.5 text-xs font-mono">
                    <span className={p.status === "BORRADOR" ? "text-gold" : "text-emerald"}>{p.status}</span>
                  </td>
                  <td className="py-2.5">{p.payslips.length}</td>
                  <td className="py-2.5 text-xs text-inkfaint font-mono">
                    {new Date(p.createdAt).toLocaleString("es-NI")}
                  </td>
                  <td className="py-2.5 text-right">
                    <form action={eliminarPeriodoAdmin}>
                      <input type="hidden" name="periodId" value={p.id} />
                      <SubmitButton
                        className="px-3 py-1.5 rounded-lg border border-lava text-lava text-xs font-medium hover:bg-lava/10 transition"
                        pendingText="Eliminando…"
                      >
                        Eliminar
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              );
            })}
            {periods.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-inkfaint">Todavía no hay períodos de planilla generados.</td></tr>
            )}
          </tbody>
        </table>
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
