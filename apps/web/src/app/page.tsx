import { redirect } from "next/navigation";

// THEBOSS CUT abre direto na lista de projetos (sem página de apresentação).
export default function Home() {
	redirect("/projects");
}
