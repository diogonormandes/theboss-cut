import type { EditorSelectionPatch } from "@/selection/editor-selection";
import type { ElementRef } from "@/timeline/types";

export interface CommandResult {
	selection?: EditorSelectionPatch;
}

export function createElementSelectionResult(
	selectedElements: ElementRef[],
): CommandResult {
	return {
		selection: {
			selectedElements,
			selectedKeyframes: [],
			keyframeSelectionAnchor: null,
			selectedMaskPoints: null,
		},
	};
}

export abstract class Command {
	abstract execute(): CommandResult | undefined;

	undo(): void {
		throw new Error("Undo not implemented for this command");
	}

	redo(): CommandResult | undefined {
		return this.execute();
	}

	/**
	 * Cena em que o comando mexeu (gravada na primeira execução), para o
	 * desfazer/refazer agir nela mesmo que outra cena esteja aberta.
	 * `null` quando o comando não mexe nas faixas de uma cena.
	 */
	getTargetSceneId(): string | null {
		return null;
	}
}
