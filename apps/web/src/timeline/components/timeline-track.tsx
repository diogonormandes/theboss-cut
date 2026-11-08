"use client";

import { t } from "@/i18n";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { TimelineElement } from "./timeline-element";
import type { TimelineTrack } from "@/timeline";
import type { TimelineElement as TimelineElementType } from "@/timeline";
import { TIMELINE_LAYERS } from "./layers";
import type { ElementDragView } from "@/timeline";
import { useMemo, useRef } from "react";
import { useEditor } from "@/editor/use-editor";
import { findTrackInSceneTracks } from "@/timeline";
import {
	filterVisibleElements,
	getPageTimeRange,
	getPinnedSelectedIds,
	useScrollPage,
} from "./use-visible-elements";

interface TimelineTrackContentProps {
	track: TimelineTrack;
	zoomLevel: number;
	dragView: ElementDragView;
	onResizeStart: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrack;
		side: "left" | "right";
	}) => void;
	onElementMouseDown: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrack;
	}) => void;
	onElementClick: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrack;
	}) => void;
	onTrackMouseDown?: (event: React.MouseEvent) => void;
	onTrackMouseUp?: (event: React.MouseEvent) => void;
	shouldIgnoreClick?: () => boolean;
	targetElementId?: string | null;
}

export function TimelineTrackContent({
	track,
	zoomLevel,
	dragView,
	onResizeStart,
	onElementMouseDown,
	onElementClick,
	onTrackMouseDown,
	onTrackMouseUp,
	shouldIgnoreClick,
	targetElementId = null,
}: TimelineTrackContentProps) {
	const { isElementSelected, selectedElements } = useElementSelection();

	// Virtualização: só desenha os pedaços que cruzam a tela (+ folga).
	const rootRef = useRef<HTMLDivElement>(null);
	const { ready, page, viewportWidth } = useScrollPage({
		anchorRef: rootRef,
		zoomLevel,
	});
	const previewTracks = useEditor((e) => e.timeline.getPreviewTracks());
	const previewTrack = useMemo(
		() =>
			previewTracks
				? findTrackInSceneTracks({ tracks: previewTracks, trackId: track.id })
				: null,
		[previewTracks, track.id],
	);
	const visibleElements = useMemo(() => {
		// Antes da primeira medida (feita antes da pintura) não monta nada:
		// evita montar a faixa inteira só para desmontar no render seguinte.
		if (!ready) return [] as readonly TimelineElementType[];
		const range = getPageTimeRange({ page, viewportWidth, zoomLevel });
		const trackElements: readonly TimelineElementType[] = track.elements;
		if (!range) return trackElements;
		// Selecionados fora da tela só ficam desenhados quando são poucos.
		const alwaysIncludeIds = new Set<string>(
			getPinnedSelectedIds({ selectedElements, trackId: track.id }),
		);
		if (dragView.kind === "dragging") {
			for (const id of dragView.memberTimeOffsets.keys()) alwaysIncludeIds.add(id);
			alwaysIncludeIds.add(dragView.anchorElementId);
		}
		if (targetElementId) alwaysIncludeIds.add(targetElementId);
		// Em prévia (redimensionar, sliders), a posição mostrada é a da prévia.
		if (previewTrack && previewTrack !== track) {
			for (const element of filterVisibleElements({
				elements: previewTrack.elements as readonly TimelineElementType[],
				range,
			})) {
				alwaysIncludeIds.add(element.id);
			}
		}
		return filterVisibleElements({
			elements: trackElements,
			range,
			alwaysIncludeIds,
		});
	}, [
		track,
		ready,
		page,
		viewportWidth,
		zoomLevel,
		selectedElements,
		dragView,
		targetElementId,
		previewTrack,
	]);

	return (
		<div ref={rootRef} className="relative size-full">
			<button
				type="button"
				className="absolute inset-0 m-0 size-full appearance-none border-0 bg-transparent p-0"
				aria-label={t("timeline.track.select", { name: track.name })}
				onMouseUp={(event) => {
					if (shouldIgnoreClick?.()) return;
					onTrackMouseUp?.(event);
				}}
				onMouseDown={(event) => {
					event.preventDefault();
					onTrackMouseDown?.(event);
				}}
			/>
			{/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- spatial gesture surface; the wrapping <button> handles keyboard track selection, this <div> only forwards background clicks for box-select / deselect. */}
			<div
				className="relative h-full min-w-full"
				style={{ zIndex: TIMELINE_LAYERS.trackContent }}
				onMouseUp={(event) => {
					if (event.target !== event.currentTarget) return;
					if (shouldIgnoreClick?.()) return;
					onTrackMouseUp?.(event);
				}}
				onMouseDown={(event) => {
					if (event.target !== event.currentTarget) return;
					event.preventDefault();
					onTrackMouseDown?.(event);
				}}
			>
				{track.elements.length === 0 ? (
					<div className="text-muted-foreground border-muted/30 pointer-events-none flex size-full items-center justify-center rounded-sm border-2 border-dashed text-xs" />
				) : (
					visibleElements.map((element) => {
						const isSelected = isElementSelected({
							trackId: track.id,
							elementId: element.id,
						});

						return (
							<TimelineElement
								key={element.id}
								element={element}
								track={track}
								zoomLevel={zoomLevel}
								isSelected={isSelected}
								onResizeStart={({ event, element, side }) =>
									onResizeStart({ event, element, track, side })
								}
								onElementMouseDown={({ event, element }) =>
									onElementMouseDown({ event, element, track })
								}
								onElementClick={({ event, element }) =>
									onElementClick({ event, element, track })
								}
								dragView={dragView}
								isDropTarget={element.id === targetElementId}
							/>
						);
					})
				)}
			</div>
		</div>
	);
}
