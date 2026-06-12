import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Increase parcel body limits for audio file uploads
app.use(express.json({ limit: "300mb" }));
app.use(express.urlencoded({ limit: "300mb", extended: true }));

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
 * Robust content generation helper with automatic dynamic fallback to alternative models
 * and built-in exponential backoff retries per model to tolerate transient 503/429 spikes.
 */
async function generateContentWithFallback(params: {
  contents: any;
  config?: any;
}) {
  const modelsToTry = [
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
    "gemini-3.1-pro-preview"
  ];
  let lastError: any = null;

  for (const model of modelsToTry) {
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Gemini Engine] Tentando gerar conteúdo com o modelo: ${model} (Tentativa ${attempt}/${maxRetries})`);
        const response = await ai.models.generateContent({
          model: model,
          contents: params.contents,
          config: params.config,
        });
        return response;
      } catch (error: any) {
        lastError = error;
        
        // Robust error parsing
        let errorMsg = "";
        let code = "";
        let status = "";
        
        if (error && typeof error === "object") {
          const rawMessage = String(error.message || "");
          errorMsg = rawMessage;
          try {
            const parsed = JSON.parse(rawMessage);
            if (parsed && parsed.error) {
              errorMsg = String(parsed.error.message || errorMsg);
              code = String(parsed.error.code || "");
              status = String(parsed.error.status || "");
            }
          } catch (e) {
            // Not stringified JSON, keep rawMessage
          }
          if (error.status) status = String(error.status);
          if (error.code) code = String(error.code);
        } else {
          errorMsg = String(error || "");
        }
        
        console.error(`[Error Engine] Falha no modelo ${model} (Tentativa ${attempt}/${maxRetries}): Code=${code} Status=${status} Msg=${errorMsg}`);
        
        const isRecoverable = 
          code === "503" ||
          code === "429" ||
          status === "UNAVAILABLE" ||
          status === "RESOURCE_EXHAUSTED" ||
          errorMsg.includes("503") || 
          errorMsg.includes("429") || 
          errorMsg.includes("UNAVAILABLE") || 
          errorMsg.toLowerCase().includes("demand") || 
          errorMsg.toLowerCase().includes("overloaded") ||
          errorMsg.toLowerCase().includes("limit") ||
          errorMsg.toLowerCase().includes("busy") ||
          errorMsg.toLowerCase().includes("quota");
          
        if (isRecoverable && attempt < maxRetries) {
          // Smarter jittered exponential backoff (e.g. 1.5s -> 3s) to let server spikes clear
          const backoffTime = attempt * 1500 + Math.floor(Math.random() * 500);
          console.warn(`[Retry Engine] Modelo ${model} indisponível ou sobrecarregado. Aguardando ${backoffTime}ms para nova tentativa...`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
          continue;
        } else {
          // Instead of throwing immediately for random or unhandled model errors (e.g. 403 Forbidden because of missing paid key),
          // we transition to the next backup model in the loop! Only if ALL models fail, we throw back to the client.
          console.warn(`[Fallback Engine] Modelo ${model} falhou na tentativa final ou apresentou erro não-recuperável de forma direta. Transicionando para o próximo modelo de backup...`);
          await new Promise(resolve => setTimeout(resolve, 250));
          break; 
        }
      }
    }
  }

  // Clean form of error message so the user doesn't see raw stack traces or complex objects
  let cleanErrorMessage = "Nossos servidores de Inteligência Artificial estão extremamente sobrecarregados sob alta demanda no momento. Por favor, clique em tentar novamente ou mude o arquivo para que possamos processá-lo.";
  if (lastError) {
    let rawMsg = String(lastError.message || "");
    try {
      const parsed = JSON.parse(rawMsg);
      if (parsed && parsed.error && parsed.error.message) {
        rawMsg = parsed.error.message;
      }
    } catch (_) {}
    
    // Check for quota exceed or rate limits and provide highly actionable feedback
    const isQuotaError = 
      rawMsg.toLowerCase().includes("quota") || 
      rawMsg.toLowerCase().includes("limit") || 
      rawMsg.toLowerCase().includes("rate") || 
      String(lastError).toLowerCase().includes("429") ||
      String(lastError).toLowerCase().includes("quota");

    if (isQuotaError) {
      cleanErrorMessage = "Erro de Cota Excedida (429): O limite de uso gratuito do servidor foi atingido temporariamente. Para usar sem interrupções e garantir o perfeito funcionamento após o deploy, adicione sua própria chave de API em: Configurações do AI Studio (ícone de engrenagem no canto inferior esquerdo) > Secrets (Segredos) com o nome de variável GEMINI_API_KEY.";
    } else {
      cleanErrorMessage = `Erro nos servidores de Inteligência Artificial: ${rawMsg || lastError}`;
    }
  }
  throw new Error(cleanErrorMessage);
}

/**
 * Transcribe general audio using Gemini Multimodal Content Generation
 */
app.post("/api/audio/transcribe", async (req, res) => {
  const { base64Data, mimeType } = req.body;
  if (!base64Data || !mimeType) {
    return res.status(400).json({ error: "Dados do áudio e tipo MIME são obrigatórios." });
  }
  try {
    // Sanitize the mimeType so Gemini accepts it cleanly (filtering out codecs descriptors like ;codecs=opus)
    let cleanMimeType = mimeType.split(";")[0].trim();
    if (cleanMimeType === "audio/x-m4a" || cleanMimeType === "audio/m4a") {
      cleanMimeType = "audio/mp4";
    }

    const response = await generateContentWithFallback({
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: cleanMimeType,
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
    const response = await generateContentWithFallback({
      contents: `Analise a seguinte transcrição de áudio em Português e gere uma resposta formatada em JSON com os seguintes campos:
      - summary: Um resumo executivo claro, descritivo e coeso (cerca de 2 a 3 parágrafos).
      - keyTopics: Uma lista (array de strings) contendo até 6 tópicos ou pontos-chave discutidos na gravação.

      Texto da transcrição:
      ${text}

      Retorne APENAS o JSON válido.`,
      config: { responseMimeType: "application/json" }
    });
    
    let rawText = (response.text || "{}").trim();
    if (rawText.startsWith("```")) {
      rawText = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }
    res.json(JSON.parse(rawText));
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
    const response = await generateContentWithFallback({
      contents: `Crie um título curto, direto e profissional para uma gravação de voz que contém o seguinte texto em Português. Use no máximo 5 palavras e não adicione pontuação ou aspas:\n\n${text}`,
    });
    const title = response.text?.replace(/["']/g, "").trim() || "Gravação Sem Título";
    res.json({ title });
  } catch (error: any) {
    console.error("Title generation error:", error);
    res.status(500).json({ error: error.message || "Erro ao criar título para áudio." });
  }
});

// Error handler middleware to catch payload too large or general express translation errors
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Internal Express Server Error Caught:", err);
  const status = err.status || err.statusCode || 500;
  
  if (err.type === "entity.too.large" || err.message?.includes("too large")) {
    return res.status(413).json({
      error: "O arquivo de áudio carregado é muito grande. O limite máximo permitido para envio direto é de 300MB."
    });
  }
  
  res.status(status).json({
    error: err.message || "Ocorreu um erro interno de processamento nas APIs de áudio."
  });
});

// Vite or Static assets serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
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
