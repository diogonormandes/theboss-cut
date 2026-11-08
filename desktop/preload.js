// Ponte segura entre o editor (página) e o programa do Windows: só o que a atualização precisa.
const { contextBridge, ipcRenderer } = require("electron");

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
});
