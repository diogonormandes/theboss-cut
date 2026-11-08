import { t } from "@/i18n";
import type {
	ParamDefinition,
	ParamValue,
	ParamValues,
} from "@/params";
import { MIN_TRANSFORM_SCALE } from "@/animation/transform";
import type { BlendMode } from "@/rendering";
import type {
	ElementType,
	TimelineElement,
} from "@/timeline";
import { DEFAULTS } from "@/timeline/defaults";
import { VOLUME_DB_MAX, VOLUME_DB_MIN } from "@/timeline/audio-constants";
import {
	CORNER_RADIUS_MAX,
	CORNER_RADIUS_MIN,
} from "@/text/background";

export type ElementParamDefinition<TKey extends string = string> =
	ParamDefinition<TKey> & {
		read?: ({ element }: { element: TimelineElement }) => ParamValue | null;
		write?: ({
			element,
			value,
		}: {
			element: TimelineElement;
			value: ParamValue;
		}) => TimelineElement;
	};

export function buildDefaultParamValues(
	params: readonly ParamDefinition[],
): ParamValues {
	const values: ParamValues = {};
	for (const param of params) {
		values[param.key] = param.default;
	}
	return values;
}

export class DefinitionRegistry<TKey extends string, TDefinition> {
	private definitions = new Map<TKey, TDefinition>();
	private entityName: string;

	constructor(entityName: string) {
		this.entityName = entityName;
	}

	register({
		key,
		definition,
	}: {
		key: TKey;
		definition: TDefinition;
	}): void {
		this.definitions.set(key, definition);
	}

	has(key: TKey): boolean {
		return this.definitions.has(key);
	}

	get(key: TKey): TDefinition {
		const def = this.definitions.get(key);
		if (!def) {
			throw new Error(`Unknown ${this.entityName}: ${key}`);
		}
		return def;
	}

	getAll(): TDefinition[] {
		return Array.from(this.definitions.values());
	}
}

const BLEND_MODE_OPTIONS: Array<{ value: BlendMode; label: string }> = [
	{ value: "normal", get label() { return t("effects.params.blendModes.normal"); } },
	{ value: "darken", get label() { return t("effects.params.blendModes.darken"); } },
	{ value: "multiply", get label() { return t("effects.params.blendModes.multiply"); } },
	{ value: "color-burn", get label() { return t("effects.params.blendModes.colorBurn"); } },
	{ value: "lighten", get label() { return t("effects.params.blendModes.lighten"); } },
	{ value: "screen", get label() { return t("effects.params.blendModes.screen"); } },
	{ value: "plus-lighter", get label() { return t("effects.params.blendModes.plusLighter"); } },
	{ value: "color-dodge", get label() { return t("effects.params.blendModes.colorDodge"); } },
	{ value: "overlay", get label() { return t("effects.params.blendModes.overlay"); } },
	{ value: "soft-light", get label() { return t("effects.params.blendModes.softLight"); } },
	{ value: "hard-light", get label() { return t("effects.params.blendModes.hardLight"); } },
	{ value: "difference", get label() { return t("effects.params.blendModes.difference"); } },
	{ value: "exclusion", get label() { return t("effects.params.blendModes.exclusion"); } },
	{ value: "hue", get label() { return t("effects.params.blendModes.hue"); } },
	{ value: "saturation", get label() { return t("effects.params.blendModes.saturation"); } },
	{ value: "color", get label() { return t("effects.params.blendModes.color"); } },
	{ value: "luminosity", get label() { return t("effects.params.blendModes.luminosity"); } },
];

const visualElementParams: ElementParamDefinition[] = [
	{
		key: "transform.positionX",
		get label() { return t("effects.params.positionX"); },
		type: "number",
		default: DEFAULTS.element.transform.position.x,
		min: -100_000,
		step: 1,
	},
	{
		key: "transform.positionY",
		get label() { return t("effects.params.positionY"); },
		type: "number",
		default: DEFAULTS.element.transform.position.y,
		min: -100_000,
		step: 1,
	},
	{
		key: "transform.scaleX",
		get label() { return t("effects.params.scaleX"); },
		type: "number",
		default: DEFAULTS.element.transform.scaleX,
		min: MIN_TRANSFORM_SCALE,
		step: 0.01,
	},
	{
		key: "transform.scaleY",
		get label() { return t("effects.params.scaleY"); },
		type: "number",
		default: DEFAULTS.element.transform.scaleY,
		min: MIN_TRANSFORM_SCALE,
		step: 0.01,
	},
	{
		key: "transform.rotate",
		get label() { return t("effects.params.rotate"); },
		type: "number",
		default: DEFAULTS.element.transform.rotate,
		min: -360,
		max: 360,
		step: 1,
	},
	{
		key: "opacity",
		get label() { return t("effects.params.opacity"); },
		type: "number",
		default: DEFAULTS.element.opacity,
		min: 0,
		max: 1,
		step: 0.01,
	},
	{
		key: "blendMode",
		get label() { return t("effects.params.blendMode"); },
		type: "select",
		default: DEFAULTS.element.blendMode,
		keyframable: false,
		options: BLEND_MODE_OPTIONS,
	},
];

const audioElementParams: ElementParamDefinition[] = [
	{
		key: "volume",
		get label() { return t("effects.params.volume"); },
		type: "number",
		default: DEFAULTS.element.volume,
		min: VOLUME_DB_MIN,
		max: VOLUME_DB_MAX,
		step: 0.01,
	},
	{
		key: "muted",
		get label() { return t("effects.params.muted"); },
		type: "boolean",
		default: false,
		keyframable: false,
	},
];

const textElementParams: ElementParamDefinition[] = [
	{
		key: "content",
		get label() { return t("effects.params.content"); },
		type: "text",
		get default() { return t("effects.text.defaultText"); },
		keyframable: false,
	},
	{
		key: "fontFamily",
		get label() { return t("effects.params.font"); },
		type: "font",
		default: "Arial",
		keyframable: false,
	},
	{
		key: "fontSize",
		get label() { return t("effects.params.fontSize"); },
		type: "number",
		default: 15,
		min: 1,
		step: 1,
	},
	{
		key: "color",
		get label() { return t("effects.params.color"); },
		type: "color",
		default: "#ffffff",
	},
	{
		key: "textAlign",
		get label() { return t("effects.params.textAlign"); },
		type: "select",
		default: "center",
		keyframable: false,
		options: [
			{ value: "left", get label() { return t("effects.params.align.left"); } },
			{ value: "center", get label() { return t("effects.params.align.center"); } },
			{ value: "right", get label() { return t("effects.params.align.right"); } },
		],
	},
	{
		key: "fontWeight",
		get label() { return t("effects.params.fontWeight"); },
		type: "select",
		default: "normal",
		keyframable: false,
		options: [
			{ value: "normal", get label() { return t("effects.params.weight.normal"); } },
			{ value: "bold", get label() { return t("effects.params.weight.bold"); } },
		],
	},
	{
		key: "fontStyle",
		get label() { return t("effects.params.fontStyle"); },
		type: "select",
		default: "normal",
		keyframable: false,
		options: [
			{ value: "normal", get label() { return t("effects.params.style.normal"); } },
			{ value: "italic", get label() { return t("effects.params.style.italic"); } },
		],
	},
	{
		key: "textDecoration",
		get label() { return t("effects.params.textDecoration"); },
		type: "select",
		default: "none",
		keyframable: false,
		options: [
			{ value: "none", get label() { return t("effects.params.decoration.none"); } },
			{ value: "underline", get label() { return t("effects.params.decoration.underline"); } },
			{ value: "line-through", get label() { return t("effects.params.decoration.lineThrough"); } },
		],
	},
	{
		key: "letterSpacing",
		get label() { return t("effects.params.letterSpacing"); },
		type: "number",
		default: DEFAULTS.text.letterSpacing,
		min: -100,
		step: 0.1,
	},
	{
		key: "lineHeight",
		get label() { return t("effects.params.lineHeight"); },
		type: "number",
		default: DEFAULTS.text.lineHeight,
		min: 0.1,
		step: 0.1,
	},
	{
		key: "background.enabled",
		get label() { return t("effects.params.backgroundEnabled"); },
		type: "boolean",
		default: DEFAULTS.text.background.enabled,
		keyframable: false,
	},
	{
		key: "background.color",
		get label() { return t("effects.params.backgroundColor"); },
		type: "color",
		default: DEFAULTS.text.background.color,
		dependencies: [{ param: "background.enabled", equals: true }],
	},
	{
		key: "background.cornerRadius",
		get label() { return t("effects.params.backgroundCornerRadius"); },
		type: "number",
		default: DEFAULTS.text.background.cornerRadius,
		min: CORNER_RADIUS_MIN,
		max: CORNER_RADIUS_MAX,
		step: 1,
		dependencies: [{ param: "background.enabled", equals: true }],
	},
	{
		key: "background.paddingX",
		get label() { return t("effects.params.backgroundPaddingX"); },
		type: "number",
		default: DEFAULTS.text.background.paddingX,
		min: 0,
		step: 1,
		dependencies: [{ param: "background.enabled", equals: true }],
	},
	{
		key: "background.paddingY",
		get label() { return t("effects.params.backgroundPaddingY"); },
		type: "number",
		default: DEFAULTS.text.background.paddingY,
		min: 0,
		step: 1,
		dependencies: [{ param: "background.enabled", equals: true }],
	},
	{
		key: "background.offsetX",
		get label() { return t("effects.params.backgroundOffsetX"); },
		type: "number",
		default: DEFAULTS.text.background.offsetX,
		min: -100_000,
		step: 1,
		dependencies: [{ param: "background.enabled", equals: true }],
	},
	{
		key: "background.offsetY",
		get label() { return t("effects.params.backgroundOffsetY"); },
		type: "number",
		default: DEFAULTS.text.background.offsetY,
		min: -100_000,
		step: 1,
		dependencies: [{ param: "background.enabled", equals: true }],
	},
];

export const elementParamRegistry = new DefinitionRegistry<
	ElementType,
	readonly ElementParamDefinition[]
>("element params");

elementParamRegistry.register({
	key: "video",
	definition: [...visualElementParams, ...audioElementParams],
});
elementParamRegistry.register({ key: "image", definition: visualElementParams });
elementParamRegistry.register({
	key: "text",
	definition: [...textElementParams, ...visualElementParams],
});
elementParamRegistry.register({
	key: "sticker",
	definition: visualElementParams,
});
elementParamRegistry.register({
	key: "graphic",
	definition: visualElementParams,
});
elementParamRegistry.register({ key: "audio", definition: audioElementParams });
elementParamRegistry.register({ key: "effect", definition: [] });

export function getElementParams({
	element,
}: {
	element: TimelineElement;
}): readonly ElementParamDefinition[] {
	return elementParamRegistry.has(element.type)
		? elementParamRegistry.get(element.type)
		: [];
}

export function getBuiltInElementParams({
	type,
}: {
	type: ElementType;
}): readonly ElementParamDefinition[] {
	return elementParamRegistry.has(type) ? elementParamRegistry.get(type) : [];
}

export function getElementParam({
	element,
	key,
}: {
	element: TimelineElement;
	key: string;
}): ElementParamDefinition | null {
	return (
		getElementParams({ element }).find((param) => param.key === key) ?? null
	);
}

export function readElementParamValue({
	element,
	param,
}: {
	element: TimelineElement;
	param: ElementParamDefinition;
}): ParamValue | null {
	if (param.read) {
		return param.read({ element });
	}
	if ("params" in element) {
		return element.params[param.key] ?? param.default;
	}
	return null;
}

export function writeElementParamValue({
	element,
	param,
	value,
}: {
	element: TimelineElement;
	param: ElementParamDefinition;
	value: ParamValue;
}): TimelineElement {
	if (param.write) {
		return param.write({ element, value });
	}
	if ("params" in element) {
		return {
			...element,
			params: {
				...element.params,
				[param.key]: value,
			},
		};
	}
	return element;
}

export function buildElementParamValues({
	element,
}: {
	element: TimelineElement;
}): ParamValues {
	const values: ParamValues = {};
	for (const param of getElementParams({ element })) {
		const value = readElementParamValue({ element, param });
		if (value !== null) {
			values[param.key] = value;
		}
	}
	return values;
}

