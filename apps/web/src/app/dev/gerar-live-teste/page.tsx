"use client";

/**
 * Ferramenta INTERNA da Etapa 3 (só em desenvolvimento, sem links no app):
 * gera uma live falsa longa no OPFS, com gabarito, e abre num projeto novo.
 * Textos em português direto de propósito: o público nunca vê esta página.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { testarMemoriaDaExportacao } from "./teste-memoria";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { PROJECT_FORMATS } from "@/project/formats";
import { mediaTimeFromSeconds, ZERO_MEDIA_TIME } from "@/wasm";
import {
	formatBytes,
	type MemorySnapshot,
	watchMemory,
} from "@/diagnostics/memory";
import {
	abrirArquivoGerado,
	ALTURA,
	type ArquivoGerado,
	apagarLiveGerada,
	FPS,
	type FormatoSaida,
	GeracaoCancelada,
	gerarLiveTeste,
	LARGURA,
	listarLivesGeradas,
	type ProgressoGeracao,
	type ResultadoGeracao,
} from "./gerador";
import { SEMENTE_PADRAO } from "./roteiro";

export default function GerarLiveTestePage() {
	if (process.env.NODE_ENV === "production") {
		return (
			<main className="text-muted-foreground flex min-h-screen items-center justify-center p-6 text-sm">
				Esta ferramenta interna só funciona no modo de desenvolvimento.
			</main>
		);
	}
	return <GeradorLiveTeste />;
}

function formatarDuracao(ms: number): string {
	const total = Math.max(0, Math.round(ms / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	return h > 0 ? `${h}h ${m}min ${s}s` : m > 0 ? `${m}min ${s}s` : `${s}s`;
}

type Estado =
	| { tipo: "parado" }
	| { tipo: "gerando"; progresso: ProgressoGeracao }
	| { tipo: "pronto"; resultado: ResultadoGeracao }
	| { tipo: "erro"; mensagem: string }
	| { tipo: "cancelado" };

function GeradorLiveTeste() {
	const editor = useEditor();
	const router = useRouter();
	const [minutos, setMinutos] = useState(240);
	const [formato, setFormato] = useState<FormatoSaida>("mp4");
	const [taxa, setTaxa] = useState(48000);
	const [estado, setEstado] = useState<Estado>({ tipo: "parado" });
	const [arquivos, setArquivos] = useState<ArquivoGerado[]>([]);
	const [abrindo, setAbrindo] = useState<string | null>(null);
	const [avisoAbrir, setAvisoAbrir] = useState<string | null>(null);
	const cancelarRef = useRef(false);

	const atualizarLista = useCallback(async () => {
		try {
			setArquivos(await listarLivesGeradas());
		} catch (erro) {
			console.error("Não deu para listar o OPFS:", erro);
		}
	}, []);

	// teste de memória da exportação: chamado pelo console (window.__testeMemoria)
	useEffect(() => {
		(window as Window & { __testeMemoria?: typeof testarMemoriaDaExportacao }).__testeMemoria =
			testarMemoriaDaExportacao;
	}, []);

	useEffect(() => {
		void atualizarLista();
	}, [atualizarLista]);

	const gerando = estado.tipo === "gerando";

	const gerar = async () => {
		if (gerando) return;
		const min = Math.round(minutos);
		if (!Number.isFinite(min) || min < 1 || min > 600) {
			setEstado({ tipo: "erro", mensagem: "Escolha de 1 a 600 minutos." });
			return;
		}
		cancelarRef.current = false;
		setEstado({
			tipo: "gerando",
			progresso: {
				pct: 0,
				segundosGerados: 0,
				segundosTotais: min * 60,
				decorridoMs: 0,
				bytes: 0,
				fase: "preparando",
			},
		});
		try {
			const resultado = await gerarLiveTeste({
				minutos: min,
				formato,
				taxa,
				semente: SEMENTE_PADRAO,
				aoProgredir: (progresso) => setEstado({ tipo: "gerando", progresso }),
				deveCancelar: () => cancelarRef.current,
			});
			setEstado({ tipo: "pronto", resultado });
		} catch (erro) {
			if (erro instanceof GeracaoCancelada) {
				setEstado({ tipo: "cancelado" });
			} else {
				console.error("Falha ao gerar a live de teste:", erro);
				setEstado({
					tipo: "erro",
					mensagem: erro instanceof Error ? erro.message : String(erro),
				});
			}
		} finally {
			void atualizarLista();
		}
	};

	const abrirNumProjetoNovo = async (nome: string, formatoId = "horizontal") => {
		if (abrindo) return;
		setAbrindo(nome);
		setAvisoAbrir(null);
		try {
			const file = await abrirArquivoGerado(nome);
			const formato = PROJECT_FORMATS.find((f) => f.id === formatoId);
			const projectId = await editor.project.createNewProject({
				name: nome.replace(/\.(mp4|mkv)$/, ""),
				canvasSize: formato?.canvasSize ?? { width: 1920, height: 1080 },
			});
			// mesmo caminho da importação do painel de mídia
			const [processado] = await processMediaAssets({ files: [file] });
			if (!processado) throw new Error("O app não aceitou o arquivo.");
			const asset = await editor.media.addMediaAsset({
				projectId,
				asset: processado,
			});
			if (!asset) throw new Error("Não deu para guardar o arquivo no projeto.");
			if (asset.duration == null) {
				throw new Error("O app não conseguiu ler a duração do vídeo.");
			}
			const element = buildElementFromMedia({
				mediaId: asset.id,
				mediaType: asset.type,
				name: asset.name,
				duration: mediaTimeFromSeconds({ seconds: asset.duration }),
				startTime: ZERO_MEDIA_TIME,
			});
			editor.timeline.insertElement({ element, placement: { mode: "auto" } });
			const salvou = await editor.project.saveCurrentProject();
			if (!salvou) throw new Error("Não deu para salvar o projeto.");
			router.push(`/editor/${projectId}`);
		} catch (erro) {
			console.error("Falha ao abrir a live de teste:", erro);
			setAvisoAbrir(erro instanceof Error ? erro.message : String(erro));
			setAbrindo(null);
		}
	};

	// abre um vídeo REAL já guardado no OPFS (ex.: replay de live): pelo console,
	// window.__abrirVideoOpfs("nome.mp4", "vertical")
	const abrirRef = useRef(abrirNumProjetoNovo);
	abrirRef.current = abrirNumProjetoNovo;
	useEffect(() => {
		(window as Window & { __abrirVideoOpfs?: (nome: string, formatoId?: string) => Promise<void> }).__abrirVideoOpfs =
			(nome, formatoId) => abrirRef.current(nome, formatoId);
	}, []);

	const apagar = async (nome: string) => {
		try {
			await apagarLiveGerada(nome);
		} catch (erro) {
			console.error("Falha ao apagar:", erro);
		}
		void atualizarLista();
	};

	return (
		<main className="bg-background text-foreground min-h-screen p-6">
			<div className="mx-auto flex max-w-3xl flex-col gap-6">
				<header className="flex flex-col gap-1">
					<h1 className="text-xl font-semibold">Gerar live de teste (interno)</h1>
					<p className="text-muted-foreground text-sm">
						Vídeo {LARGURA}×{ALTURA} a {FPS} fps com contador e uma "facecam"
						desenhada; áudio mono com roteiro fixo (silêncio, fala, grito,
						música). Grava direto no armazenamento do navegador (OPFS), junto com
						o gabarito JSON.
					</p>
				</header>

				<PainelMemoria />

				<section className="border-border flex flex-col gap-4 rounded-lg border p-4">
					<div className="flex flex-wrap items-end gap-4">
						<label className="flex flex-col gap-1 text-sm">
							Duração (minutos)
							<input
								type="number"
								min={1}
								max={600}
								value={minutos}
								disabled={gerando}
								onChange={(e) => setMinutos(Number(e.target.value))}
								className="border-border bg-background w-28 rounded-md border px-2 py-1"
							/>
						</label>
						<div className="flex gap-2">
							{[1, 10, 240].map((m) => (
								<Button
									key={m}
									size="sm"
									variant={minutos === m ? "default" : "outline"}
									disabled={gerando}
									onClick={() => setMinutos(m)}
								>
									{m} min
								</Button>
							))}
						</div>
						<label className="flex flex-col gap-1 text-sm">
							Arquivo
							<select
								value={formato}
								disabled={gerando}
								onChange={(e) => setFormato(e.target.value as FormatoSaida)}
								className="border-border bg-background rounded-md border px-2 py-1"
							>
								<option value="mp4">MP4 (1 faixa de áudio)</option>
								<option value="mkv">MKV (2 faixas: mistura + microfone)</option>
							</select>
						</label>
						<label className="flex flex-col gap-1 text-sm">
							Áudio
							<select
								value={taxa}
								disabled={gerando}
								onChange={(e) => setTaxa(Number(e.target.value))}
								className="border-border bg-background rounded-md border px-2 py-1"
							>
								<option value={48000}>48 kHz</option>
								<option value={16000}>16 kHz</option>
							</select>
						</label>
					</div>

					<div className="flex gap-2">
						<Button onClick={gerar} disabled={gerando}>
							Gerar
						</Button>
						{gerando && (
							<Button
								variant="outline"
								onClick={() => {
									cancelarRef.current = true;
								}}
							>
								Cancelar
							</Button>
						)}
					</div>

					<StatusGeracao estado={estado} />
				</section>

				<section className="border-border flex flex-col gap-3 rounded-lg border p-4">
					<div className="flex items-center justify-between">
						<h2 className="font-medium">Lives geradas (OPFS)</h2>
						<Button size="sm" variant="outline" onClick={() => atualizarLista()}>
							Atualizar
						</Button>
					</div>
					{avisoAbrir && <p className="text-sm text-red-400">{avisoAbrir}</p>}
					{arquivos.length === 0 ? (
						<p className="text-muted-foreground text-sm">Nenhuma ainda.</p>
					) : (
						<ul className="flex flex-col gap-2">
							{arquivos.map((a) => (
								<li
									key={a.nome}
									className="border-border flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
								>
									<span>
										<span className="font-mono">{a.nome}</span>{" "}
										<span className="text-muted-foreground">
											({formatBytes(a.bytes)}
											{a.gabarito ? " + gabarito" : ", sem gabarito"})
										</span>
									</span>
									<span className="flex gap-2">
										<Button
											size="sm"
											disabled={gerando || abrindo !== null}
											onClick={() => abrirNumProjetoNovo(a.nome)}
										>
											{abrindo === a.nome ? "Abrindo…" : "Abrir num projeto novo"}
										</Button>
										<Button
											size="sm"
											variant="outline"
											disabled={gerando || abrindo !== null}
											onClick={() => apagar(a.nome)}
										>
											Apagar
										</Button>
									</span>
								</li>
							))}
						</ul>
					)}
				</section>
			</div>
		</main>
	);
}

function StatusGeracao({ estado }: { estado: Estado }) {
	if (estado.tipo === "parado") return null;
	if (estado.tipo === "cancelado") {
		return <p className="text-muted-foreground text-sm">Cancelado (arquivo apagado).</p>;
	}
	if (estado.tipo === "erro") {
		return <p className="text-sm text-red-400">Erro: {estado.mensagem}</p>;
	}
	if (estado.tipo === "pronto") {
		const r = estado.resultado;
		return (
			<p className="text-sm">
				Pronto: <span className="font-mono">{r.arquivo}</span> ({formatBytes(r.bytes)})
				em {formatarDuracao(r.decorridoMs)}. Vídeo {r.videoCodec}, áudio{" "}
				{r.audioCodec}. Gabarito: <span className="font-mono">{r.arquivoGabarito}</span>
			</p>
		);
	}
	const p = estado.progresso;
	const velocidade = p.decorridoMs > 0 ? p.segundosGerados / (p.decorridoMs / 1000) : 0;
	const restanteMs =
		velocidade > 0 ? ((p.segundosTotais - p.segundosGerados) / velocidade) * 1000 : 0;
	return (
		<div className="flex flex-col gap-2 text-sm">
			<div className="bg-muted h-2 w-full overflow-hidden rounded">
				<div
					className="bg-primary h-full transition-[width]"
					style={{ width: `${p.pct.toFixed(1)}%` }}
				/>
			</div>
			<p className="text-muted-foreground font-mono">
				{p.fase === "preparando"
					? "Preparando…"
					: p.fase === "finalizando"
						? "Finalizando o arquivo…"
						: `${p.pct.toFixed(1)}% · ${formatarDuracao(p.segundosGerados * 1000)} de ${formatarDuracao(p.segundosTotais * 1000)}`}
				{" · "}decorrido {formatarDuracao(p.decorridoMs)}
				{velocidade > 0 && ` · ${velocidade.toFixed(0)}× tempo real · falta ~${formatarDuracao(restanteMs)}`}
				{" · "}arquivo {formatBytes(p.bytes)}
			</p>
		</div>
	);
}

function PainelMemoria() {
	const [atual, setAtual] = useState<MemorySnapshot | null>(null);
	const [pico, setPico] = useState(0);
	const [disponivel, setDisponivel] = useState(true);

	useEffect(
		() =>
			watchMemory({
				intervalMs: 1000,
				onSample: ({ current, peakUsed }) => {
					setDisponivel(current !== null);
					setAtual(current);
					setPico(peakUsed);
				},
			}),
		[],
	);

	return (
		<section className="border-border rounded-lg border p-3 font-mono text-xs">
			<div className="mb-1 font-sans text-sm font-medium">Memória (JavaScript desta aba)</div>
			{!disponivel || !atual ? (
				<span className="text-muted-foreground">
					Este navegador não informa a memória (performance.memory só existe no
					Chrome/Edge/Electron).
				</span>
			) : (
				<span>
					em uso {formatBytes(atual.usedJSHeapSize)} · reservado{" "}
					{formatBytes(atual.totalJSHeapSize)} · limite{" "}
					{formatBytes(atual.jsHeapSizeLimit)} · pico {formatBytes(pico)}
				</span>
			)}
		</section>
	);
}
