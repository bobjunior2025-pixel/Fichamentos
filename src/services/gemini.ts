// Client-side wrappers that call our secure audio transcription backend APIs.

async function handleResponse(response: Response, defaultError: string): Promise<any> {
  if (!response.ok) {
    let errMessage = defaultError;
    try {
      // Check if server returned a JSON error payload
      const errJson = await response.json();
      if (errJson && errJson.error) {
        errMessage = errJson.error;
      }
    } catch (e) {
      // Not JSON (could be Nginx/Cloud Run HTML fallback page on timeout or payload issues)
      if (response.status === 413) {
        errMessage = "O arquivo de áudio enviado é muito grande para o servidor processar. Tente realizar gravações mais curtas ou reduzir a qualidade do arquivo.";
      } else if (response.status === 504 || response.status === 502) {
        errMessage = "Conexão expirada (Timeout) ao fazer o upload do áudio para a IA. Tente segmentar o arquivo em partes menores ou use uma rede mais estável.";
      } else {
        errMessage = `Erro inesperado do servidor comercial (${response.status}). Falha ao obter resposta da Inteligência Artificial.`;
      }
    }
    throw new Error(errMessage);
  }

  try {
    return await response.json();
  } catch (jsonErr) {
    throw new Error("Resposta inválida recebida do servidor. O formato de resposta não pôde ser decodificado.");
  }
}

export async function transcribeAudio(base64Data: string, mimeType: string, signal?: AbortSignal): Promise<string> {
  try {
    const response = await fetch("/api/audio/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64Data, mimeType }),
      signal,
    });
    
    const data = await handleResponse(response, "Erro de processamento na transcrição com Gemini.");
    if (data.error) throw new Error(data.error);
    return data.transcription || "";
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new Error("Transmissão cancelada pelo usuário.");
    }
    console.error("Client Error transcribing audio:", error);
    throw error;
  }
}

export async function summarizeTranscription(text: string, signal?: AbortSignal): Promise<{ summary: string; keyTopics: string[] }> {
  try {
    const response = await fetch("/api/audio/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    });
    
    const data = await handleResponse(response, "Erro ao tentar resumir a transcrição.");
    if (data.error) throw new Error(data.error);
    return {
      summary: data.summary || "",
      keyTopics: data.keyTopics || []
    };
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new Error("Resumo cancelado pelo usuário.");
    }
    console.error("Client Error summarizing transcription:", error);
    throw error;
  }
}

export async function generateTranscriptionTitle(text: string, signal?: AbortSignal): Promise<string> {
  try {
    const response = await fetch("/api/audio/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    });
    
    const data = await handleResponse(response, "Erro ao gerar título para o áudio.");
    if (data.error) throw new Error(data.error);
    return data.title || "Minha Gravação";
  } catch (error: any) {
    if (error.name === "AbortError") {
      return "Minha Gravação";
    }
    console.error("Client Error generating transcription title:", error);
    return "Minha Gravação";
  }
}
