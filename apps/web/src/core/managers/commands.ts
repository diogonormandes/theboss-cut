import type { EditorCore } from "@/core";
import type { Command, CommandResult } from "@/commands";
import type { EditorSelectionSnapshot } from "@/selection/editor-selection";
import { applyRippleAdjustments, computeRippleAdjustments } from "@/ripple";
import type { SceneTracks } from "@/timeline/types";

/** Cena em que o comando mexeu (ou a aberta, se o comando não diz). */
export interface CommandReactorContext {
	sceneId: string | null;
}

interface CommandHistoryEntry {
	command: Command;
	previousSelection: EditorSelectionSnapshot;
	selectionOverride?: EditorSelectionSnapshot;
}

export class CommandManager {
	public isRippleEnabled = false;
	private history: CommandHistoryEntry[] = [];
	private redoStack: CommandHistoryEntry[] = [];
	private reactors: Array<(context: CommandReactorContext) => void> = [];

	constructor(private editor: EditorCore) {}

	execute({ command }: { command: Command }): Command {
		const beforeTracks = this.isRippleEnabled
			? (this.editor.scenes.getActiveSceneOrNull()?.tracks ?? null)
			: null;
		const previousSelection = this.getSelectionSnapshot();
		const result = command.execute();
		this.applyRippleIfEnabled({ beforeTracks });
		const selectionOverride = this.applySelectionOverride(result);
		this.runReactors({
			sceneId:
				command.getTargetSceneId() ??
				this.editor.scenes.getActiveSceneOrNull()?.id ??
				null,
		});
		this.history.push({
			command,
			previousSelection,
			selectionOverride,
		});
		this.redoStack = [];
		return command;
	}

	push({ command }: { command: Command }): void {
		this.history.push({
			command,
			previousSelection: this.getSelectionSnapshot(),
		});
		this.redoStack = [];
	}

	registerReactor(reactor: (context: CommandReactorContext) => void): void {
		this.reactors.push(reactor);
	}

	undo(): void {
		if (this.history.length === 0) return;
		const entry = this.history.pop();
		// A cena do comando sumiu: o passo não tem onde agir. Descarta em vez
		// de aplicar na cena aberta (que é outra).
		if (entry && this.isTargetSceneMissing(entry.command)) return;
		entry?.command.undo();
		if (entry) {
			// Only restore selection for commands that explicitly changed it.
			// Commands without selection intent leave selection untouched,
			// preserving any UI-driven selection changes (clicks, box select)
			// that happened between commands. Commands that remove editor-owned
			// selection targets must declare a selection override to clear stale refs.
			const targetSceneId = entry.command.getTargetSceneId();
			const isOtherScene =
				targetSceneId !== null &&
				targetSceneId !==
					(this.editor.scenes.getActiveSceneOrNull()?.id ?? null);
			if (entry.selectionOverride !== undefined && !isOtherScene) {
				this.editor.selection.restoreSnapshot({
					snapshot: entry.previousSelection,
				});
			}
			this.redoStack.push(entry);
		}
	}

	redo(): void {
		if (this.redoStack.length === 0) return;
		const entry = this.redoStack.pop();
		if (!entry) {
			return;
		}
		if (this.isTargetSceneMissing(entry.command)) return;

		// Refazer age na cena do comando, mesmo que outra cena esteja aberta.
		const targetSceneId = entry.command.getTargetSceneId();
		const activeSceneId = this.editor.scenes.getActiveSceneOrNull()?.id ?? null;
		const isOtherScene =
			targetSceneId !== null && targetSceneId !== activeSceneId;
		const rippleSceneId = targetSceneId ?? activeSceneId;
		const beforeTracks =
			this.isRippleEnabled && rippleSceneId
				? (this.editor.scenes.getSceneById(rippleSceneId)?.tracks ?? null)
				: null;
		const previousSelection = this.getSelectionSnapshot();
		const result = entry.command.redo();
		this.applyRippleIfEnabled({ beforeTracks, sceneId: rippleSceneId });
		// A seleção só vale para a cena aberta: não seleciona itens de outra cena.
		const selectionOverride = isOtherScene
			? undefined
			: this.applySelectionOverride(result);
		this.runReactors({ sceneId: rippleSceneId });

		this.history.push({
			command: entry.command,
			previousSelection,
			selectionOverride,
		});
	}

	canUndo(): boolean {
		return this.history.length > 0;
	}

	canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	clear(): void {
		this.history = [];
		this.redoStack = [];
	}

	private getSelectionSnapshot(): EditorSelectionSnapshot {
		return this.editor.selection.getSnapshot();
	}

	private applySelectionOverride(
		result: CommandResult | undefined,
	): EditorSelectionSnapshot | undefined {
		if (!result?.selection) {
			return undefined;
		}
		return this.editor.selection.applySelectionPatch({
			patch: result.selection,
		});
	}

	private runReactors(context: CommandReactorContext): void {
		for (const reactor of this.reactors) {
			reactor(context);
		}
	}

	private isTargetSceneMissing(command: Command): boolean {
		const sceneId = command.getTargetSceneId();
		return sceneId !== null && this.editor.scenes.getSceneById(sceneId) === null;
	}

	private applyRippleIfEnabled({
		beforeTracks,
		sceneId,
	}: {
		beforeTracks: SceneTracks | null;
		sceneId?: string | null;
	}): void {
		if (!this.isRippleEnabled || !beforeTracks) {
			return;
		}

		const afterTracks = sceneId
			? this.editor.scenes.getSceneById(sceneId)?.tracks
			: this.editor.scenes.getActiveSceneOrNull()?.tracks;
		if (!afterTracks) {
			return;
		}
		const adjustments = computeRippleAdjustments({
			beforeTracks,
			afterTracks,
		});
		if (adjustments.length === 0) {
			return;
		}

		const tracksWithRipple = applyRippleAdjustments({
			tracks: afterTracks,
			adjustments,
		});
		this.editor.timeline.updateTracks(tracksWithRipple, { sceneId });
	}
}
