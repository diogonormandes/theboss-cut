import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import { isVisualElement, updateElementInSceneTracks } from "@/timeline";
import type { SceneTracks, VisualElement } from "@/timeline";
import { SceneTracksTarget } from "@/commands/timeline/scene-tracks-target";

export function toggleEffectOnElement({
	element,
	effectId,
}: {
	element: VisualElement;
	effectId: string;
}): VisualElement {
	const currentEffects = element.effects ?? [];
	const updated = currentEffects.map((effect) =>
		effect.id === effectId ? { ...effect, enabled: !effect.enabled } : effect,
	);
	return { ...element, effects: updated };
}

export class ToggleClipEffectCommand extends Command {
	private readonly target = new SceneTracksTarget();

	getTargetSceneId(): string | null {
		return this.target.getSceneId();
	}
	private savedState: SceneTracks | null = null;
	private readonly trackId: string;
	private readonly elementId: string;
	private readonly effectId: string;

	constructor({
		trackId,
		elementId,
		effectId,
	}: {
		trackId: string;
		elementId: string;
		effectId: string;
	}) {
		super();
		this.trackId = trackId;
		this.elementId = elementId;
		this.effectId = effectId;
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
			return toggleEffectOnElement({
				element: element as VisualElement,
				effectId: this.effectId,
			});
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
}
