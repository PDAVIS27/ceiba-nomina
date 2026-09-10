import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function createAdmin(formData: FormData) {
  "use server";
  const existing = await prisma.user.count();
  if (existing > 0) {
    // Ya existe al menos un usuario: no se puede volver a usar /setup.
    redirect("/login");
  }
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const password = String(formData.get("password") || "");
  if (!email || password.length < 8) {
    throw new Error("Correo inválido o contraseña muy corta (mínimo 8 caracteres).");
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { email, passwordHash, role: "PROVIDER_ADMIN" },
  });
  redirect("/login");
}

export default async function SetupPage() {
  const userCount = await prisma.user.count();

  if (userCount > 0) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="max-w-md text-center text-inkdim">
          <p className="mb-4">
            Ceiba ya tiene una cuenta de proveedor configurada. Esta página de
            configuración inicial ya no está disponible por seguridad.
          </p>
          <a href="/login" className="text-gold">Ir a iniciar sesión →</a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-[420px] bg-panel border border-line rounded-2xl p-9">
        <div className="text-center mb-7">
          <div className="font-serif text-2xl font-semibold mb-1">Configura Ceiba</div>
          <div className="text-inkdim text-sm">
            Esta es la primera vez que se instala la plataforma. Crea tu cuenta
            de proveedor — con ella administrarás a todos tus negocios clientes.
          </div>
        </div>
        <form action={createAdmin} className="space-y-4">
          <div>
            <label className="block text-xs text-inkdim mb-1.5">Tu correo</label>
            <input name="email" type="email" required
              className="w-full bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-3 text-sm"
              placeholder="tu@empresa.com" />
          </div>
          <div>
            <label className="block text-xs text-inkdim mb-1.5">Contraseña (mínimo 8 caracteres)</label>
            <input name="password" type="password" required minLength={8}
              className="w-full bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-3 text-sm"
              placeholder="••••••••" />
          </div>
          <button type="submit" className="w-full bg-gold text-[#1b1500] rounded-lg py-3 font-medium">
            Crear cuenta de proveedor
          </button>
        </form>
      </div>
    </main>
  );
}
