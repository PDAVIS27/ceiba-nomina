"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Correo o contraseña incorrectos.");
      return;
    }
    // El middleware redirige según el rol al entrar a /post-login
    router.push("/post-login");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-5 bg-bg">
      <div className="w-full max-w-[400px] bg-panel border border-line rounded-2xl p-9 relative">
        <Link href="/" className="absolute top-5 left-6 text-xs text-inkfaint">← Volver</Link>
        <div className="text-center mb-7">
          <div className="font-serif text-2xl font-semibold mb-1">Bienvenido de nuevo</div>
          <div className="text-inkdim text-sm">Entra con tu cuenta de Ceiba</div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-inkdim mb-1.5">Correo</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-3 text-sm"
              placeholder="tuempresa@correo.com"
            />
          </div>
          <div>
            <label className="block text-xs text-inkdim mb-1.5">Contraseña</label>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#12181a] border border-linestrong rounded-lg px-3.5 py-3 text-sm"
              placeholder="••••••••"
            />
          </div>
          {error && <div className="text-lava text-sm">{error}</div>}
          <button
            type="submit" disabled={loading}
            className="w-full bg-emerald text-[#eafaf3] rounded-lg py-3 font-medium disabled:opacity-60"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <div className="text-center text-xs text-inkfaint mt-6">
          ¿Primera vez configurando Ceiba?{" "}
          <Link href="/setup" className="text-gold">Crear la cuenta de proveedor</Link>
        </div>
      </div>
    </main>
  );
}
