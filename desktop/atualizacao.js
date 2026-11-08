// Atualização automática do THEBOSS CUT.
//  - Uns 20 s depois de abrir (e a cada 6 horas) confere na página de versões do GitHub se existe versão mais nova.
//  - Se existir, baixa o instalador em segundo plano (sem atrapalhar a edição).
//  - Quando termina, avisa o editor: "Atualizar agora" (salva, instala em silêncio e reabre) ou "Depois"
//    (instala sozinho quando a pessoa fechar o programa).
// O repositório é público: não precisa de senha nem de chave.
const { app } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = "diogonormandes/theboss-cut";
const ARQUIVO = "THEBOSS-CUT-Instalador.exe";
const PRIMEIRA_CONFERIDA_MS = 20 * 1000;
const INTERVALO_MS = 6 * 60 * 60 * 1000;

const num = (v) =>
  String(v || "")
    .replace(/^v/i, "")
    .split(".")
    .map((x) => parseInt(x, 10) || 0);
const maior = (a, b) => {
  const x = num(a);
  const y = num(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

function criar({ registrar = () => {} } = {}) {
  // fase: "nada" | "baixando" | "pronta" | "instalando"
  let estado = { fase: "nada", versao: null, pct: 0 };
  let arquivoPronto = null;
  let ouvintes = new Set();
  let timer = null;
  let ocupado = false;

  const mudar = (novo) => {
    estado = { ...estado, ...novo };
    for (const f of ouvintes) {
      try {
        f(estado);
      } catch {}
    }
  };

  async function ultima() {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "theboss-cut-programa" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    let melhor = null;
    for (const x of await r.json()) {
      if (x.draft || x.prerelease) continue;
      const a = (x.assets || []).find((f) => f.name === ARQUIVO);
      if (!a) continue;
      const v = String(x.tag_name || "").replace(/^v/i, "");
      if (!melhor || maior(v, melhor.versao)) melhor = { versao: v, url: a.browser_download_url, tamanho: a.size || 0 };
    }
    return melhor;
  }

  async function baixar(u) {
    const destino = path.join(os.tmpdir(), `theboss-cut-atualizacao-${u.versao}.exe`);
    // já baixado antes (e completo)? usa
    try {
      if (u.tamanho && fs.statSync(destino).size === u.tamanho) return destino;
    } catch {}
    const r = await fetch(u.url, { headers: { "User-Agent": "theboss-cut-programa" }, redirect: "follow" });
    if (!r.ok || !r.body) throw new Error(`download recusado (${r.status})`);
    const total = Number(r.headers.get("content-length")) || u.tamanho || 0;
    const parcial = `${destino}.parcial`;
    const arq = fs.createWriteStream(parcial);
    let feito = 0;
    let ultimoAviso = 0;
    const leitor = r.body.getReader();
    try {
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        feito += value.length;
        if (!arq.write(Buffer.from(value))) await new Promise((ok) => arq.once("drain", ok));
        if (Date.now() - ultimoAviso > 500) {
          ultimoAviso = Date.now();
          mudar({ pct: total ? Math.min(99, Math.round((feito / total) * 100)) : 0 });
        }
      }
    } finally {
      await new Promise((ok) => arq.end(ok));
    }
    if (total && feito < total * 0.98) throw new Error("download incompleto");
    try {
      fs.rmSync(destino, { force: true });
    } catch {}
    fs.renameSync(parcial, destino);
    return destino;
  }

  async function conferir() {
    if (ocupado || estado.fase === "pronta" || estado.fase === "instalando") return;
    ocupado = true;
    try {
      const u = await ultima();
      if (!u || !maior(u.versao, app.getVersion())) return;
      registrar(`atualização: versão ${u.versao} encontrada (atual ${app.getVersion()})`);
      mudar({ fase: "baixando", versao: u.versao, pct: 0 });
      arquivoPronto = await baixar(u);
      mudar({ fase: "pronta", pct: 100 });
      registrar(`atualização: versão ${u.versao} baixada`);
    } catch (e) {
      registrar(`atualização: não deu para conferir/baixar (${e?.message || e})`);
      // sem internet ou GitHub fora do ar: tenta de novo na próxima conferida, sem incomodar ninguém
      if (estado.fase === "baixando") mudar({ fase: "nada", pct: 0 });
    } finally {
      ocupado = false;
    }
  }

  function iniciar() {
    // só no programa instalado (no teste do código não há o que atualizar)
    if (!app.isPackaged) return;
    setTimeout(conferir, PRIMEIRA_CONFERIDA_MS);
    timer = setInterval(conferir, INTERVALO_MS);
  }

  // Roda o instalador em silêncio, num processo separado que continua depois que o programa fecha.
  // reabrir = true: abre o THEBOSS CUT de novo quando a instalação terminar.
  function instalar({ reabrir }) {
    if (!arquivoPronto || estado.fase === "instalando") return false;
    mudar({ fase: "instalando" });
    if (timer) clearInterval(timer);
    const exe = process.execPath;
    const roteiro = path.join(os.tmpdir(), "theboss-cut-atualizar.cmd");
    const linhas = [
      "@echo off",
      // espera o programa fechar
      "timeout /t 3 /nobreak >nul",
      `start "" /wait "${arquivoPronto}" /S`,
      reabrir ? `start "" "${exe}"` : "",
      `del "${arquivoPronto}" >nul 2>&1`,
    ].filter(Boolean);
    try {
      fs.writeFileSync(roteiro, linhas.join("\r\n"), "utf8");
      const p = spawn("cmd.exe", ["/d", "/c", roteiro], { detached: true, stdio: "ignore", windowsHide: true });
      p.unref();
      registrar(`atualização: instalando ${estado.versao}${reabrir ? " e reabrindo" : ""}`);
      return true;
    } catch (e) {
      registrar(`atualização: não deu para iniciar o instalador (${e?.message || e})`);
      mudar({ fase: "pronta" });
      return false;
    }
  }

  return {
    iniciar,
    instalar,
    estado: () => estado,
    temPronta: () => estado.fase === "pronta" && Boolean(arquivoPronto),
    ouvir: (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
  };
}

module.exports = { criar };
