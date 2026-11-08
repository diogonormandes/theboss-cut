import { notFound } from "next/navigation";
import type { ReactNode } from "react";

// As páginas em /dev são ferramentas internas de teste: na versão do público elas não existem.
export default function DevLayout({ children }: { children: ReactNode }) {
	if (process.env.NODE_ENV === "production") notFound();
	return children;
}
