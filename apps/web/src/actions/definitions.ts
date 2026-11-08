import type { ShortcutKey } from "@/actions/keybinding";
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
		description: "Tocar/Pausar",
		category: "playback",
	},
	"stop-playback": {
		description: "Parar",
		category: "playback",
	},
	"seek-forward": {
		description: "Avançar 1 segundo",
		category: "playback",
		args: { seconds: "number" },
	},
	"seek-backward": {
		description: "Voltar 1 segundo",
		category: "playback",
		args: { seconds: "number" },
	},
	"frame-step-forward": {
		description: "Avançar um quadro",
		category: "navigation",
	},
	"frame-step-backward": {
		description: "Voltar um quadro",
		category: "navigation",
	},
	"jump-forward": {
		description: "Avançar 5 segundos",
		category: "navigation",
		args: { seconds: "number" },
	},
	"jump-backward": {
		description: "Voltar 5 segundos",
		category: "navigation",
		args: { seconds: "number" },
	},
	"goto-start": {
		description: "Ir para o começo",
		category: "navigation",
	},
	"goto-end": {
		description: "Ir para o fim",
		category: "navigation",
	},
	split: {
		description: "Cortar na agulha",
		category: "editing",
	},
	"split-left": {
		description: "Cortar e tirar a esquerda",
		category: "editing",
	},
	"split-right": {
		description: "Cortar e tirar a direita",
		category: "editing",
	},
	"delete-selected": {
		description: "Apagar a seleção",
		category: "editing",
	},
	"copy-selected": {
		description: "Copiar os itens selecionados",
		category: "editing",
	},
	"paste-copied": {
		description: "Colar itens na agulha",
		category: "editing",
	},
	"toggle-snapping": {
		description: "Ligar/desligar encaixe",
		category: "editing",
	},
	"toggle-ripple-editing": {
		description: "Ligar/desligar edição em cascata",
		category: "editing",
	},
	"toggle-source-audio": {
		description: "Separar ou recuperar o áudio original",
		category: "editing",
	},
	"select-all": {
		description: "Selecionar todos os itens",
		category: "selection",
	},
	"cancel-interaction": {
		description: "Cancelar a ação atual",
		category: "controls",
	},
	"deselect-all": {
		description: "Tirar a seleção",
		category: "selection",
	},
	"duplicate-selected": {
		description: "Duplicar o item selecionado",
		category: "selection",
	},
	"toggle-elements-muted-selected": {
		description: "Tirar ou pôr o som dos itens selecionados",
		category: "selection",
	},
	"toggle-elements-visibility-selected": {
		description: "Mostrar ou esconder os itens selecionados",
		category: "selection",
	},
	"toggle-bookmark": {
		description: "Marcador na agulha",
		category: "timeline",
	},
	undo: {
		description: "Desfazer",
		category: "history",
	},
	redo: {
		description: "Refazer",
		category: "history",
	},
	"remove-media-asset": {
		description: "Remover mídia",
		category: "assets",
		args: { projectId: "string", assetId: "string" },
	},
	"remove-media-assets": {
		description: "Remover mídias",
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
