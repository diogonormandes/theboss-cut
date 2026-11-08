import type { EditorCore } from "@/core";

type SaveManagerOptions = {
	debounceMs?: number;
};

/** Situação do salvamento, mostrada no topo do editor. */
export type SaveStatus = "saved" | "pending" | "saving" | "error";

// Salvamento automático: menos de 1 segundo depois de cada mudança o projeto é guardado no PC.
// Se não der para salvar, tenta de novo sozinho de tempos em tempos e avisa no topo do editor.
const RETRY_AFTER_ERROR_MS = 10_000;

export class SaveManager {
	private debounceMs: number;
	private isPaused = false;
	private isSaving = false;
	private hasPendingSave = false;
	private hasError = false;
	private lastSavedAt: Date | null = null;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private unsubscribeHandlers: Array<() => void> = [];
	private listeners = new Set<() => void>();

	constructor({
		editor,
		debounceMs = 800,
	}: {
		editor: EditorCore;
	} & SaveManagerOptions) {
		this.editor = editor;
		this.debounceMs = debounceMs;
	}

	private editor: EditorCore;

	start(): void {
		if (this.unsubscribeHandlers.length > 0) return;

		this.unsubscribeHandlers = [
			this.editor.scenes.subscribe(() => {
				this.markDirty();
			}),
			this.editor.timeline.subscribe(() => {
				this.markDirty();
			}),
		];
	}

	stop(): void {
		for (const unsubscribe of this.unsubscribeHandlers) {
			unsubscribe();
		}
		this.unsubscribeHandlers = [];
		this.clearTimer();
	}

	pause(): void {
		this.isPaused = true;
	}

	resume(): void {
		this.isPaused = false;
		if (this.hasPendingSave) {
			this.queueSave();
		}
	}

	markDirty({ force = false }: { force?: boolean } = {}): void {
		if (this.isPaused && !force) return;
		this.hasPendingSave = true;
		this.queueSave();
		this.notify();
	}

	/** Salva agora (ex.: antes de fechar). Devolve false se não deu para salvar. */
	async flush(): Promise<boolean> {
		this.hasPendingSave = true;
		// espera um salvamento que já esteja acontecendo terminar
		while (this.isSaving) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		await this.saveNow();
		return !this.hasError;
	}

	getIsDirty(): boolean {
		return this.hasPendingSave || this.isSaving;
	}

	getStatus(): SaveStatus {
		if (this.isSaving) return "saving";
		if (this.hasError) return "error";
		if (this.hasPendingSave) return "pending";
		return "saved";
	}

	getLastSavedAt(): Date | null {
		return this.lastSavedAt;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}

	private queueSave(delayMs = this.debounceMs): void {
		if (this.isSaving) return;
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
		}
		this.saveTimer = setTimeout(() => {
			void this.saveNow();
		}, delayMs);
	}

	private async saveNow(): Promise<void> {
		if (this.isSaving) return;
		if (!this.hasPendingSave) return;

		const activeProject = this.editor.project.getActive();
		if (!activeProject) return;
		if (this.editor.project.getIsLoading()) return;
		if (this.editor.project.getMigrationState().isMigrating) return;

		this.isSaving = true;
		this.hasPendingSave = false;
		this.clearTimer();
		this.notify();

		try {
			const ok = await this.editor.project.saveCurrentProject();
			if (ok) {
				this.hasError = false;
				this.lastSavedAt = new Date();
			} else {
				this.hasError = true;
				// não perde a mudança: fica pendente e tenta de novo daqui a pouco
				this.hasPendingSave = true;
			}
		} finally {
			this.isSaving = false;
			this.notify();
			if (this.hasPendingSave) {
				this.queueSave(this.hasError ? RETRY_AFTER_ERROR_MS : this.debounceMs);
			}
		}
	}

	private clearTimer(): void {
		if (!this.saveTimer) return;
		clearTimeout(this.saveTimer);
		this.saveTimer = null;
	}
}
