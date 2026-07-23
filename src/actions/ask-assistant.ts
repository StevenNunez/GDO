'use server';

import 'server-only';
import { askGemini } from '@/lib/gemini';

export type AssistantResponse = {
  ok: boolean;
  answer?: string;
  error?: string;
};

/**
 * "Asistente GDO" — asistente de solo consulta de la app de gestión de obras.
 *
 * Recibe una pregunta y un CONTEXTO ya compactado por el cliente (resumen de la
 * obra activa: stock, solicitudes pendientes, avance por fase, equipo). No manda
 * la base de datos completa ni pide bloques JSON internos: eso mantiene bajo el
 * gasto de tokens. Es de solo lectura — responde, no ejecuta acciones.
 */
export async function askAssistant(
  question: string,
  context: string,
): Promise<AssistantResponse> {
  if (!question?.trim()) {
    return { ok: false, error: 'La pregunta no puede estar vacía.' };
  }

  try {
    const prompt = `Eres "Asistente GDO", el asistente de una aplicación de gestión de obras de construcción en Chile. Ayudas al equipo con consultas del día a día sobre la obra activa.

REGLAS:
- Usa ÚNICAMENTE los datos del CONTEXTO. Si un dato no está ahí, dilo con claridad ("No tengo ese dato en el sistema"). Nunca inventes cifras, nombres ni fechas.
- Responde en español, breve y directo, en Markdown. Usa listas o una tabla solo cuando ayuden a leer.
- Responde SOLO lo que se preguntó; no repitas todo el contexto.
- Prioriza los riesgos cuando vengan al caso: stock crítico, solicitudes pendientes, atrasos de avance.

CONTEXTO DE LA OBRA:
${context}

PREGUNTA DEL USUARIO:
${question}`;

    const answer = await askGemini(prompt);
    return { ok: true, answer };
  } catch (error: any) {
    console.error('Error en askAssistant:', error);
    return {
      ok: false,
      error: error?.message || 'Ocurrió un error al procesar la solicitud.',
    };
  }
}

/** Sugiere un tema para la charla de seguridad de 5 minutos (usado en safety/daily-talk). */
export async function suggestSafetyTalkTopic(): Promise<AssistantResponse> {
  try {
    const prompt = `Eres un experto en prevención de riesgos para la construcción en Chile.
Sugiere un tema específico y conciso para una "charla de 5 minutos", relevante y práctico para un equipo en terreno.
Dame solo el título del tema, sin explicaciones. Máximo 15 palabras.
Ejemplo: "Uso correcto del arnés de seguridad en altura" o "Riesgos eléctricos en zonas húmedas".`;
    const topic = await askGemini(prompt);
    return { ok: true, answer: topic.replace(/"/g, '') };
  } catch (error: any) {
    return { ok: false, error: error.message || 'No se pudo generar un tema.' };
  }
}
