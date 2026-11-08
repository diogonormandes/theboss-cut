"use client";

// Aba "Cortes" da barra lateral (Etapa 3): corte de silêncio, melhores momentos e exportar os cortes em fila.
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExportQueueSection } from "./export-queue-section";
import { MomentsSection } from "./moments-section";
import { SilenceSection } from "./silence-section";

export function LiveToolsPanel() {
	return (
		<ScrollArea className="h-full">
			<div className="flex flex-col gap-4 p-3">
				<SilenceSection />
				<MomentsSection />
				<ExportQueueSection />
			</div>
		</ScrollArea>
	);
}
