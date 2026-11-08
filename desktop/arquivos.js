// Ponte de arquivos dos cortes: o editor manda os pedaços do vídeo e o programa
// grava direto em Vídeos\THEBOSS CUT\<projeto>, sem janela "Salvar como".
// Regras: só grava dentro dessa pasta, limpa os nomes e NUNCA sobrescreve
// (acrescenta " (2)", " (3)"...). As funções puras ficam exportadas para teste.

const path = require("path");
const fs = require("fs");

const PASTA_RAIZ = "THEBOSS CUT";
const EXTENSOES = new Set([".mp4", ".webm"]);
const RESERVADOS = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
const LIMITE_NOME = 120;
const LIMITE_PEDACO = 64 * 1024 * 1024; // 64 MB por escrita

// Tira o que o Windows não aceita, pontos e espaços nas pontas e nomes reservados.
function sanearNome(nome, padrao = "Sem nome") {
  let limpo = String(nome ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "");
  if (limpo.length > LIMITE_NOME) limpo = limpo.slice(0, LIMITE_NOME).replace(/[.\s]+$/g, "");
  const base = limpo.split(".")[0];
  if (!limpo || RESERVADOS.test(base)) return padrao;
  return limpo;
}

// Nome de arquivo limpo, com extensão permitida (.mp4 ou .webm). null se a extensão não valer.
function sanearNomeArquivo(nomeArquivo) {
  const texto = String(nomeArquivo ?? "");
  const ext = path.extname(texto).toLowerCase();
  if (!EXTENSOES.has(ext)) return null;
  const base = sanearNome(texto.slice(0, texto.length - ext.length), "Corte");
  return base + ext;
}

// Caminho que ainda não existe: "Corte.mp4", "Corte (2).mp4", "Corte (3).mp4"...
function caminhoLivre(pasta, nomeArquivo, existe) {
  const ext = path.extname(nomeArquivo);
  const base = nomeArquivo.slice(0, nomeArquivo.length - ext.length);
  for (let n = 1; n < 10000; n++) {
    const nome = n === 1 ? nomeArquivo : `${base} (${n})${ext}`;
    const alvo = path.join(pasta, nome);
    if (!existe(alvo)) return alvo;
  }
  return null;
}

// true quando `alvo` fica dentro de `raiz` (ou é a própria raiz). Sem "..", sem outro disco.
function dentroDe(raiz, alvo) {
  if (typeof raiz !== "string" || typeof alvo !== "string" || !raiz || !alvo) return false;
  const r = path.resolve(raiz);
  const a = path.resolve(alvo);
  const rel = path.relative(r, a);
  if (rel === "") return true;
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

function registrar({ ipcMain, app, shell, ehDoEditor }) {
  const raiz = () => path.join(app.getPath("videos"), PASTA_RAIZ);
  const abertos = new Map(); // id -> { handle, caminho, dono }
  let proximoId = 1;
  const vigiados = new Set(); // janelas cujo fechamento/recarga já fecha os arquivos abertos

  const doEditor = (e) => {
    const url = (e.senderFrame && e.senderFrame.url) || e.sender.getURL();
    return ehDoEditor(url);
  };

  // Limpezas em andamento: o programa espera por elas antes de sair.
  const limpando = new Set();

  // A janela recarregou, navegou, caiu ou fechou: todo arquivo ainda aberto
  // está pela metade (sem o índice final), então fecha E apaga.
  const fecharDoDono = (donoId) => {
    for (const [id, item] of abertos) {
      if (item.dono !== donoId) continue;
      abertos.delete(id);
      const tarefa = item.handle
        .close()
        .catch(() => {})
        .then(() =>
          dentroDe(raiz(), item.caminho)
            ? fs.promises.unlink(item.caminho).catch(() => {})
            : undefined,
        )
        .finally(() => limpando.delete(tarefa));
      limpando.add(tarefa);
    }
  };

  // Ao sair do programa no meio de uma exportação, termina de apagar antes.
  let saindo = false;
  app.on("will-quit", (evento) => {
    if (saindo || limpando.size === 0) return;
    evento.preventDefault();
    saindo = true;
    Promise.allSettled([...limpando]).finally(() => app.quit());
  });

  ipcMain.handle("arquivos-pasta-cortes", async (e, nomeProjeto) => {
    if (!doEditor(e)) throw new Error("negado");
    const pasta = path.join(raiz(), sanearNome(nomeProjeto, "Projeto"));
    if (!dentroDe(raiz(), pasta)) throw new Error("negado");
    await fs.promises.mkdir(pasta, { recursive: true });
    return pasta;
  });

  ipcMain.handle("arquivos-abrir", async (e, nomeArquivo, pasta) => {
    if (!doEditor(e)) throw new Error("negado");
    const destino = typeof pasta === "string" && pasta ? pasta : raiz();
    if (!dentroDe(raiz(), destino)) throw new Error("pasta fora de Vídeos\\THEBOSS CUT");
    const nome = sanearNomeArquivo(nomeArquivo);
    if (!nome) throw new Error("tipo de arquivo não permitido");
    await fs.promises.mkdir(destino, { recursive: true });
    // "wx" falha se o arquivo já existir: mesmo numa corrida, nada é sobrescrito.
    for (let tentativa = 0; tentativa < 20; tentativa++) {
      const caminho = caminhoLivre(destino, nome, (alvo) => fs.existsSync(alvo));
      if (!caminho || !dentroDe(destino, caminho)) throw new Error("sem nome livre");
      try {
        const handle = await fs.promises.open(caminho, "wx");
        const id = proximoId++;
        const dono = e.sender.id;
        abertos.set(id, { handle, caminho, dono });
        if (!vigiados.has(dono)) {
          vigiados.add(dono);
          const sender = e.sender;
          sender.on("did-navigate", () => fecharDoDono(dono));
          sender.on("render-process-gone", () => fecharDoDono(dono));
          sender.once("destroyed", () => {
            vigiados.delete(dono);
            fecharDoDono(dono);
          });
        }
        return { id, caminho };
      } catch (erro) {
        if (erro && erro.code === "EEXIST") continue;
        throw erro;
      }
    }
    throw new Error("sem nome livre");
  });

  ipcMain.handle("arquivos-escrever", async (e, id, posicao, bytes) => {
    const item = abertos.get(id);
    if (!item || item.dono !== e.sender.id) throw new Error("arquivo não está aberto");
    if (!Number.isSafeInteger(posicao) || posicao < 0) throw new Error("posição inválida");
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > LIMITE_PEDACO) {
      throw new Error("pedaço inválido");
    }
    let escrito = 0;
    while (escrito < bytes.byteLength) {
      const { bytesWritten } = await item.handle.write(
        bytes,
        escrito,
        bytes.byteLength - escrito,
        posicao + escrito,
      );
      if (bytesWritten <= 0) throw new Error("falha ao gravar");
      escrito += bytesWritten;
    }
    return escrito;
  });

  // descartar = true (cancelado ou deu erro): fecha e apaga o arquivo pela metade.
  ipcMain.handle("arquivos-fechar", async (e, id, descartar) => {
    const item = abertos.get(id);
    if (!item || item.dono !== e.sender.id) return false;
    abertos.delete(id);
    await item.handle.close().catch(() => {});
    if (descartar === true && dentroDe(raiz(), item.caminho)) {
      await fs.promises.unlink(item.caminho).catch(() => {});
    }
    return true;
  });

  ipcMain.handle("arquivos-mostrar", async (e, caminho) => {
    if (!doEditor(e)) throw new Error("negado");
    if (!dentroDe(raiz(), caminho)) return false;
    if (!fs.existsSync(caminho)) return false;
    if (fs.statSync(caminho).isDirectory()) {
      const erro = await shell.openPath(caminho);
      return !erro;
    }
    shell.showItemInFolder(caminho);
    return true;
  });
}

module.exports = { sanearNome, sanearNomeArquivo, caminhoLivre, dentroDe, registrar, PASTA_RAIZ };
