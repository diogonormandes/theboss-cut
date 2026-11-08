# Modelos locais

## face_detection_yunet_2023mar.onnx

- O que é: detector de rosto YuNet (usado no enquadramento 9:16 "Dividido" e "Seguir rosto").
- Origem: repositório oficial OpenCV Zoo
  https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
  (arquivo `face_detection_yunet_2023mar.onnx`, baixado em 2026-11-08).
- Licença: MIT (OpenCV Zoo / autores do YuNet: Shiqi Yu e colaboradores).
- Tamanho: 232.589 bytes.
- SHA-256: 8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4
- Entrada fixa: `input` [1, 3, 640, 640], BGR, valores 0–255 (sem normalizar).
- Saídas: `cls_{8,16,32}`, `obj_{8,16,32}`, `bbox_{8,16,32}`, `kps_{8,16,32}`.

## ../ort/

Arquivos do onnxruntime-web 1.22 (licença MIT, Microsoft), copiados de
`node_modules/onnxruntime-web/dist/` para o detector funcionar sem internet.
