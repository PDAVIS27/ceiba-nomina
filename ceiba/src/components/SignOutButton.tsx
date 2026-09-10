"use client";
import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="text-sm text-inkfaint hover:text-lava transition"
    >
      Cerrar sesión
    </button>
  );
}
