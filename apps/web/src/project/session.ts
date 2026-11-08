// Recuperação: enquanto um projeto está aberto, fica uma anotação no PC.
// Se o programa fechar direito, a anotação é apagada. Se o PC desligar ou o programa travar,
// ela continua lá, e a tela inicial avisa que o projeto foi salvo e oferece continuar.

import type { EditorCore } from "@/core";

const SESSION_KEY = "thebosscut-sessao";

export type OpenSession = {
	projectId: string;
	projectName: string;
	openedAt: string;
};

export function markSessionOpen({
	projectId,
	projectName,
}: {
	projectId: string;
	projectName: string;
}): void {
	try {
		const session: OpenSession = {
			projectId,
			projectName,
			openedAt: new Date().toISOString(),
		};
		localStorage.setItem(SESSION_KEY, JSON.stringify(session));
	} catch {
		// sem espaço para a anotação: só não vai ter o aviso de recuperação
	}
}

export function markSessionClosed(): void {
	try {
		localStorage.removeItem(SESSION_KEY);
	} catch {
		// nada a fazer
	}
}

/** Projeto que estava aberto quando o programa fechou de repente (ou null). */
export function takeInterruptedSession(): OpenSession | null {
	try {
		const raw = localStorage.getItem(SESSION_KEY);
		if (!raw) return null;
		localStorage.removeItem(SESSION_KEY);
		const parsed = JSON.parse(raw) as Partial<OpenSession>;
		if (typeof parsed.projectId !== "string") return null;
		return {
			projectId: parsed.projectId,
			projectName:
				typeof parsed.projectName === "string" ? parsed.projectName : "",
			openedAt: typeof parsed.openedAt === "string" ? parsed.openedAt : "",
		};
	} catch {
		return null;
	}
}

type CloseHookWindow = Window & {
	/** chamado pelo programa do Windows antes de fechar a janela (desktop/main.js) */
	__thebosscutBeforeClose?: () => Promise<boolean>;
};

/**
 * Liga, enquanto o editor está aberto: salvar tudo antes de fechar a janela
 * (com a miniatura atualizada) e a anotação de recuperação.
 */
export function attachEditorSession({
	editor,
	projectId,
	projectName,
}: {
	editor: EditorCore;
	projectId: string;
	projectName: string;
}): () => void {
	markSessionOpen({ projectId, projectName });
	const win = window as CloseHookWindow;

	win.__thebosscutBeforeClose = async () => {
		try {
			await editor.project.prepareExit();
			const ok = await editor.save.flush();
			if (ok) markSessionClosed();
			return ok;
		} catch (error) {
			console.error("Failed to save before closing:", error);
			return false;
		}
	};

	// no navegador (ou se a janela fechar sem passar pelo programa): tenta salvar o que faltar
	const onPageHide = () => {
		if (editor.save.getIsDirty()) {
			void editor.save.flush();
		} else {
			markSessionClosed();
		}
	};
	window.addEventListener("pagehide", onPageHide);

	return () => {
		window.removeEventListener("pagehide", onPageHide);
		if (win.__thebosscutBeforeClose) delete win.__thebosscutBeforeClose;
		markSessionClosed();
	};
}
