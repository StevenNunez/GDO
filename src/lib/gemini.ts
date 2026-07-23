'use server';

import 'server-only';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODEL = 'gemini-2.5-flash'; // Última versión estable recomendada para agentes (Febrero 2026)
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

export async function askGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY no definida en el entorno');
    throw new Error('La configuración de IA está incompleta.');
  }

  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error('❌ Error Gemini:', res.status, errorBody);
      throw new Error(`Error en la API de Gemini (${res.status})`);
    }

    const data = await res.json();

    // Log de uso (opcional, útil para monitoreo de cuotas)
    if (data.usageMetadata) {
      console.log(`📊 Uso de Tokens: Entrada: ${data.usageMetadata.promptTokenCount}, Salida: ${data.usageMetadata.candidatesTokenCount}, Total: ${data.usageMetadata.totalTokenCount}`);
    }

    if (data.promptFeedback?.blockReason) {
      console.warn('⚠️ Gemini bloqueó la respuesta:', data.promptFeedback);
      return `Mi política de seguridad me impide responder. Razón: ${data.promptFeedback.blockReason}`;
    }

    if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content?.parts?.[0]?.text) {
      console.warn('⚠️ Gemini respondió sin candidatos o texto:', data);
      return 'No pude generar una respuesta válida en este momento.';
    }

    return data.candidates[0].content.parts[0].text;

  } catch (error) {
    console.error("Error fatal en fetch a Gemini:", error);
    throw new Error("No se pudo conectar con el servicio de IA.");
  }
}
