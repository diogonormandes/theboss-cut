import type { ShortcutKey } from "@/actions/keybinding";
import { t } from "@/i18n";
import type { TActionWithOptionalArgs } from "./types";

export type TActionCategory =
	| "playback"
	| "navigation"
	| "editing"
	| "selection"
	| "history"
	| "timeline"
	| "controls"
	| "assets";

export interface TActionBaseDefinition {
	description: string;
	category: TActionCategory;
	args?: Record<string, unknown>;
}

export interface TActionDefinition extends TActionBaseDefinition {
	defaultShortcuts?: readonly ShortcutKey[];
}

export const ACTIONS = {
	"toggle-play": {
		get description() {
			return t("actions.list.togglePlay");
		},
		category: "playback",
	},
	"stop-playback": {
		get description() {
			return t("actions.list.stopPlayback");
		},
		category: "playback",
	},
	"seek-forward": {
		get description() {
			return t("actions.list.seekForward");
		},
		category: "playback",
		args: { seconds: "number" },
	},
	"seek-backward": {
		get description() {
			return t("actions.list.seekBackward");
		},
		category: "playback",
		args: { seconds: "number" },
	},
	"frame-step-forward": {
		get description() {
			return t("actions.list.frameStepForward");
		},
		category: "navigation",
	},
	"frame-step-backward": {
		get description() {
			return t("actions.list.frameStepBackward");
		},
		category: "navigation",
	},
	"jump-forward": {
		get description() {
			return t("actions.list.jumpForward");
		},
		category: "navigation",
		args: { seconds: "number" },
	},
	"jump-backward": {
		get description() {
			return t("actions.list.jumpBackward");
		},
		category: "navigation",
		args: { seconds: "number" },
	},
	"goto-start": {
		get description() {
			return t("actions.list.gotoStart");
		},
		category: "navigation",
	},
	"goto-end": {
		get description() {
			return t("actions.list.gotoEnd");
		},
		category: "navigation",
	},
	split: {
		get description() {
			return t("actions.list.split");
		},
		category: "editing",
	},
	"split-left": {
		get description() {
			return t("actions.list.splitLeft");
		},
		category: "editing",
	},
	"split-right": {
		get description() {
			return t("actions.list.splitRight");
		},
		category: "editing",
	},
	"delete-selected": {
		get description() {
			return t("actions.list.deleteSelected");
		},
		category: "editing",
	},
	"copy-selected": {
		get description() {
			return t("actions.list.copySelected");
		},
		category: "editing",
	},
	"paste-copied": {
		get description() {
			return t("actions.list.pasteCopied");
		},
		category: "editing",
	},
	"toggle-snapping": {
		get description() {
			return t("actions.list.toggleSnapping");
		},
		category: "editing",
	},
	"toggle-ripple-editing": {
		get description() {
			return t("actions.list.toggleRippleEditing");
		},
		category: "editing",
	},
	"toggle-source-audio": {
		get description() {
			return t("actions.list.toggleSourceAudio");
		},
		category: "editing",
	},
	"select-all": {
		get description() {
			return t("actions.list.selectAll");
		},
		category: "selection",
	},
	"cancel-interaction": {
		get description() {
			return t("actions.list.cancelInteraction");
		},
		category: "controls",
	},
	"deselect-all": {
		get description() {
			return t("actions.list.deselectAll");
		},
		category: "selection",
	},
	"duplicate-selected": {
		get description() {
			return t("actions.list.duplicateSelected");
		},
		category: "selection",
	},
	"toggle-elements-muted-selected": {
		get description() {
			return t("actions.list.toggleElementsMutedSelected");
		},
		category: "selection",
	},
	"toggle-elements-visibility-selected": {
		get description() {
			return t("actions.list.toggleElementsVisibilitySelected");
		},
		category: "selection",
	},
	"toggle-bookmark": {
		get description() {
			return t("actions.list.toggleBookmark");
		},
		category: "timeline",
	},
	undo: {
		get description() {
			return t("actions.list.undo");
		},
		category: "history",
	},
	redo: {
		get description() {
			return t("actions.list.redo");
		},
		category: "history",
	},
	"remove-media-asset": {
		get description() {
			return t("actions.list.removeMediaAsset");
		},
		category: "assets",
		args: { projectId: "string", assetId: "string" },
	},
	"remove-media-assets": {
		get description() {
			return t("actions.list.removeMediaAssets");
		},
		category: "assets",
		args: { projectId: "string", assetIds: "string[]" },
	},
} as const satisfies Record<string, TActionBaseDefinition>;

export type TAction = keyof typeof ACTIONS;

const ACTION_DEFAULT_SHORTCUTS = [
	["toggle-play", ["space", "k"]],
	["seek-forward", ["l"]],
	["seek-backward", ["j"]],
	["frame-step-forward", ["right"]],
	["frame-step-backward", ["left"]],
	["jump-forward", ["shift+right"]],
	["jump-backward", ["shift+left"]],
	["goto-start", ["home", "enter"]],
	["goto-end", ["end"]],
	["split", ["s"]],
	["split-left", ["q"]],
	["split-right", ["w"]],
	["delete-selected", ["backspace", "delete"]],
	["copy-selected", ["ctrl+c"]],
	["paste-copied", ["ctrl+v"]],
	["toggle-snapping", ["n"]],
	["select-all", ["ctrl+a"]],
	["cancel-interaction", ["escape"]],
	["duplicate-selected", ["ctrl+d"]],
	["undo", ["ctrl+z"]],
	["redo", ["ctrl+shift+z", "ctrl+y"]],
] as const satisfies ReadonlyArray<
	readonly [TActionWithOptionalArgs, readonly ShortcutKey[]]
>;

const ACTION_DEFAULT_SHORTCUTS_BY_ACTION = new Map<
	TAction,
	readonly ShortcutKey[]
>(ACTION_DEFAULT_SHORTCUTS);

export function getActionDefinition({
	action,
}: {
	action: TAction;
}): TActionDefinition {
	return {
		...ACTIONS[action],
		defaultShortcuts: ACTION_DEFAULT_SHORTCUTS_BY_ACTION.get(action),
	};
}

export function getDefaultShortcuts(): Map<
	ShortcutKey,
	TActionWithOptionalArgs
> {
	const shortcuts = new Map<ShortcutKey, TActionWithOptionalArgs>();

	for (const [action, defaultShortcuts] of ACTION_DEFAULT_SHORTCUTS) {
		for (const shortcut of defaultShortcuts) {
			shortcuts.set(shortcut, action);
		}
	}

	return shortcuts;
}

/** Ações que só funcionam com dados extras (não podem ir num atalho de teclado). */
const ACTIONS_WITH_REQUIRED_ARGS = new Set<string>([
	"remove-media-asset",
	"remove-media-assets",
]);

/** Confere se um texto (ex.: vindo de um atalho salvo) é uma ação que dá para chamar sem dados extras. */
export function isActionWithOptionalArgs(
	value: string,
): value is TActionWithOptionalArgs {
	return Object.hasOwn(ACTIONS, value) && !ACTIONS_WITH_REQUIRED_ARGS.has(value);
}
