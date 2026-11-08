import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import { isVisualElement, updateElementInSceneTracks } from "@/timeline";
import type { SceneTracks, VisualElement } from "@/timeline";
import { buildDefaultEffectInstance } from "@/effects";
import { SceneTracksTarget } from "@/commands/timeline/scene-tracks-target";

function addEffectToElement({
	element,
	effectType,
}: {
	element: VisualElement;
	effectType: string;
}): VisualElement {
	const instance = buildDefaultEffectInstance({ effectType });
	const currentEffects = element.effects ?? [];
	return { ...element, effects: [...currentEffects, instance] };
}

export class AddClipEffectCommand extends Command {
	private readonly target = new SceneTracksTarget();

	getTargetSceneId(): string | null {
		return this.target.getSceneId();
	}
	private savedState: SceneTracks | null = null;
	private effectId: string | null = null;
	private readonly trackId: string;
	private readonly elementId: string;
	private readonly effectType: string;

	constructor({
		trackId,
		elementId,
		effectType,
	}: {
		trackId: string;
		elementId: string;
		effectType: string;
	}) {
		super();
		this.trackId = trackId;
		this.elementId = elementId;
		this.effectType = effectType;
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = this.target.read();

		const updatedTracks = updateElementInSceneTracks({
			tracks: this.savedState,
			trackId: this.trackId,
			elementId: this.elementId,
			elementPredicate: isVisualElement,
		update: (element) => {
			const updated = addEffectToElement({
				element: element as VisualElement,
				effectType: this.effectType,
			});
				const effects = updated.effects ?? [];
				this.effectId = effects[effects.length - 1]?.id ?? null;
				return updated;
			},
		});

		this.target.write(updatedTracks);
		return undefined;
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			this.target.write(this.savedState);
		}
	}

	getEffectId(): string | null {
		return this.effectId;
	}
}
