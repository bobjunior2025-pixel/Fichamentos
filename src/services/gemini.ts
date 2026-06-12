// Client-side wrappers that call our secure audio transcription backend APIs.

export async function transcribeAudio(base64Data: string, mimeType: string): Promise<string> {
  try {
    const response = await fetch("/api/audio/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64Data, mimeType }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data.transcription || "";
  } catch (error) {
    console.error("Client Error transcribing audio:", error);
    throw error;
  }
}

export async function summarizeTranscription(text: string): Promise<{ summary: string; keyTopics: string[] }> {
  try {
    const response = await fetch("/api/audio/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return {
      summary: data.summary || "",
      keyTopics: data.keyTopics || []
    };
  } catch (error) {
    console.error("Client Error summarizing transcription:", error);
    throw error;
  }
}

export async function generateTranscriptionTitle(text: string): Promise<string> {
  try {
    const response = await fetch("/api/audio/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data.title || "Minha Gravação";
  } catch (error) {
    console.error("Client Error generating transcription title:", error);
    return "Minha Gravação";
  }
}
