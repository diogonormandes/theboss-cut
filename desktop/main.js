// THEBOSS CUT para Windows: liga o editor (Next "standalone", em resources/app) no próprio PC e abre a janela.
// Porta fixa para os projetos (guardados no navegador interno) continuarem no mesmo lugar sempre.
// Nada sai do computador: os vídeos e projetos ficam aqui.

const { app, BrowserWindow, shell, Menu } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");

const PORTA = 47210;
const ENDERECO = `http://127.0.0.1:${PORTA}`;
let janela = null;
let servidor = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (janela) {
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  }
});

function pastaApp() {
  return app.isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "app");
}

// o Next "standalone" de um projeto com várias pastas (apps/web) põe o server.js em app/apps/web/;
// num projeto simples, em app/. Usa o que existir.
function acharServidor() {
  const base = pastaApp();
  for (const pasta of [path.join(base, "apps", "web"), base]) {
    if (fs.existsSync(path.join(pasta, "server.js"))) return pasta;
  }
  return null;
}

function ligarServidor() {
  const pasta = acharServidor();
  if (!pasta) return;
  const arquivo = path.join(pasta, "server.js");
  servidor = spawn(process.execPath, [arquivo], {
    cwd: pasta,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_ENV: "production", PORT: String(PORTA), HOSTNAME: "127.0.0.1" },
    windowsHide: true,
    stdio: "ignore",
  });
  servidor.on("exit", () => {
    servidor = null;
  });
}

function esperarServidor(tentativas = 120) {
  return new Promise((ok) => {
    const tentar = (n) => {
      const r = http.get(`${ENDERECO}/projects`, (res) => {
        res.resume();
        ok(true);
      });
      r.on("error", () => (n > 0 ? setTimeout(() => tentar(n - 1), 250) : ok(false)));
      r.setTimeout(2000, () => r.destroy());
    };
    tentar(tentativas);
  });
}

async function criarJanela() {
  Menu.setApplicationMenu(null);
  janela = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "THEBOSS CUT",
    backgroundColor: "#0a0a0b",
    icon: path.join(__dirname, "icone.png"),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  janela.on("page-title-updated", (e) => e.preventDefault());
  // antes de fechar: o editor salva o projeto (e a miniatura). Se passar de 4 segundos, fecha mesmo assim.
  let podeFechar = false;
  janela.on("close", (e) => {
    if (podeFechar) return;
    e.preventDefault();
    const salvar = janela.webContents
      .executeJavaScript("window.__thebosscutBeforeClose ? window.__thebosscutBeforeClose() : true", true)
      .catch(() => false);
    const limite = new Promise((ok) => setTimeout(ok, 4000));
    Promise.race([salvar, limite]).finally(() => {
      podeFechar = true;
      if (janela && !janela.isDestroyed()) janela.close();
    });
  });
  janela.once("ready-to-show", () => janela.show());
  await janela.loadFile(path.join(__dirname, "carregando.html"));
  // links de fora abrem no navegador da pessoa
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(ENDERECO)) shell.openExternal(url);
    return { action: "deny" };
  });
  janela.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith(ENDERECO) || url.startsWith("file:")) return;
    e.preventDefault();
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
  const pronto = await esperarServidor();
  if (pronto) janela.loadURL(`${ENDERECO}/projects`);
  else janela.webContents.executeJavaScript("document.body.dataset.erro='1'").catch(() => {});
}

app.whenReady().then(() => {
  ligarServidor();
  criarJanela();
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  try {
    servidor?.kill();
  } catch {}
});
