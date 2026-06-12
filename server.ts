import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Increase parcel body limits for audio file uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("Aviso: GEMINI_API_KEY não foi encontrada nas variáveis de ambiente.");
}

const ai = new GoogleGenAI({
  apiKey: apiKey || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const MODEL_NAME = "gemini-3.5-flash";

/**
 * Transcribe general audio using Gemini Multimodal Content Generation
 */
app.post("/api/audio/transcribe", async (req, res) => {
  const { base64Data, mimeType } = req.body;
  if (!base64Data || !mimeType) {
    return res.status(400).json({ error: "Dados do áudio e tipo MIME são obrigatórios." });
  }
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
        {
          text: "Transcreva este áudio em Português do Brasil exatamente como falado. Seja altamente preciso, preserve a originalidade das ideias, corrija ruídos ou murmúrios irrelevantes, e estruture o texto em parágrafos bem definidos e fáceis de ler.",
        },
      ],
    });
    res.json({ transcription: response.text || "Não foi possível transcrever do áudio fornecido." });
  } catch (error: any) {
    console.error("Transcription error:", error);
    res.status(500).json({ error: error.message || "Erro ao transcrever áudio com Gemini." });
  }
});

/**
 * Generate a smart summary and core topics from transcribed text
 */
app.post("/api/audio/summarize", async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "O texto para resumo é obrigatório." });
  }
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Analise a seguinte transcrição de áudio em Português e gere uma resposta formatada em JSON com os seguintes campos:
      - summary: Um resumo executivo claro, descritivo e coeso (cerca de 2 a 3 parágrafos).
      - keyTopics: Uma lista (array de strings) contendo até 6 tópicos ou pontos-chave discutidos na gravação.

      Texto da transcrição:
      ${text}

      Retorne APENAS o JSON válido.`,
      config: { responseMimeType: "application/json" }
    });
    
    res.json(JSON.parse(response.text || "{}"));
  } catch (error: any) {
    console.error("Summarization error:", error);
    res.status(500).json({ error: error.message || "Erro ao processar resumo do áudio." });
  }
});

/**
 * Generate a concise title for a transcription
 */
app.post("/api/audio/title", async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Texto da transcrição é obrigatório para gerar título." });
  }
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Crie um título curto, direto e profissional para uma gravação de voz que contém o seguinte texto em Português. Use no máximo 5 palavras e não adicione pontuação ou aspas:\n\n${text}`,
    });
    const title = response.text?.replace(/["']/g, "").trim() || "Gravação Sem Título";
    res.json({ title });
  } catch (error: any) {
    console.error("Title generation error:", error);
    res.status(500).json({ error: error.message || "Erro ao criar título para áudio." });
  }
});

// Vite or Static assets serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
