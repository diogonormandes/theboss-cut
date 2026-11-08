// Ponte segura entre o editor (página) e o programa do Windows: só o que a atualização precisa
// e o caminho de um arquivo escolhido (apenas para mostrar; nada aqui lê o disco).
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("theBossCut", {
  // recebe { fase, versao, pct } sempre que a situação da atualização muda (e uma vez na hora)
  aoMudarAtualizacao(callback) {
    const ouvinte = (_evento, estado) => callback(estado);
    ipcRenderer.on("atualizacao", ouvinte);
    ipcRenderer.send("atualizacao-pedir");
    return () => ipcRenderer.removeListener("atualizacao", ouvinte);
  },
  // salva, fecha, instala e reabre
  atualizarAgora() {
    return ipcRenderer.invoke("atualizacao-agora");
  },
  // caminho no PC de um arquivo que a pessoa escolheu ou arrastou (ex.: "D:\Lives\live.mkv").
  // Só para mostrar onde a live está; devolve "" se não for um arquivo do disco.
  caminhoDoArquivo(file) {
    try {
      return webUtils.getPathForFile(file) || "";
    } catch {
      return "";
    }
  },
});
