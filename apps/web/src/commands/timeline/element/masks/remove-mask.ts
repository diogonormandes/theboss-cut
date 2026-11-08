import { EditorCore } from "@/core";
import { Command, type CommandResult } from "@/commands/base-command";
import { isMaskableElement, updateElementInSceneTracks } from "@/timeline";
import type { SceneTracks, MaskableElement } from "@/timeline";
import { SceneTracksTarget } from "@/commands/timeline/scene-tracks-target";

function removeMaskFromElement({
	element,
	maskId,
}: {
	element: MaskableElement;
	maskId: string;
}): MaskableElement {
	const currentMasks = element.masks ?? [];
	const filteredMasks = currentMasks.filter((mask) => mask.id !== maskId);
	return { ...element, masks: filteredMasks };
}

export class RemoveMaskCommand extends Command {
	private readonly target = new SceneTracksTarget();

	getTargetSceneId(): string | null {
		return this.target.getSceneId();
	}
	private savedState: SceneTracks | null = null;
	private readonly trackId: string;
	private readonly elementId: string;
	private readonly maskId: string;

	constructor({
		trackId,
		elementId,
		maskId,
	}: {
		trackId: string;
		elementId: string;
		maskId: string;
	}) {
		super();
		this.trackId = trackId;
		this.elementId = elementId;
		this.maskId = maskId;
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = this.target.read();

		const updatedTracks = updateElementInSceneTracks({
			tracks: this.savedState,
			trackId: this.trackId,
			elementId: this.elementId,
			elementPredicate: isMaskableElement,
			update: (element) => {
				if (!isMaskableElement(element)) return element;
				return removeMaskFromElement({
					element,
					maskId: this.maskId,
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
