import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import CeibaLogo from "@/components/CeibaLogo";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId;
  if (!companyId) redirect("/login");
  const company = await prisma.company.findUnique({ where: { id: companyId } });

  const openCases = await prisma.supportCase.count({ where: { companyId, resolved: false } });

  return (
    <div className="min-h-screen bg-bg text-ink flex">
      <aside className="w-60 border-r border-line flex flex-col shrink-0">
        <div className="px-6 py-6 border-b border-line">
          <CeibaLogo size={24} />
          <div className="text-inkfaint text-xs font-mono mt-1 truncate">{company?.name}</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavLink href="/dashboard" label="Inicio" />
          <NavLink href="/dashboard/nomina" label="Correr nómina" />
          <NavLink href="/dashboard/colaboradores" label="Colaboradores" />
          <NavLink href="/dashboard/historicos" label="Históricos" />
          <NavLink href="/dashboard/reportar" label="Reportar un problema" badge={openCases > 0 ? openCases : undefined} />
        </nav>
        <div className="px-6 py-5 border-t border-line">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 px-8 py-10 max-w-5xl">{children}</main>
    </div>
  );
}

function NavLink({ href, label, badge }: { href: string; label: string; badge?: number }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-inkdim hover:bg-panel hover:text-ink transition"
    >
      <span>{label}</span>
      {badge !== undefined && (
        <span className="bg-lava text-white text-[10px] font-mono px-1.5 py-0.5 rounded-full">{badge}</span>
      )}
    </Link>
  );
}
