import type { NextConfig } from "next";
import path from "node:path";

// THEBOSS CUT: roda no PC da pessoa (dentro do programa), servido pelo próprio Next em modo "standalone".
const nextConfig: NextConfig = {
	compiler: {
		removeConsole: process.env.NODE_ENV === "production",
	},
	reactStrictMode: true,
	typescript: { ignoreBuildErrors: true },
	output: "standalone",
	// as dependências ficam na raiz do projeto (pasta com várias partes): o "standalone" precisa levar elas junto
	outputFileTracingRoot: path.join(__dirname, "../../"),
	images: { unoptimized: true },
};

export default nextConfig;
