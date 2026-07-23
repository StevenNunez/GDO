'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Bot, Send, Loader2, Sparkles, X, Trash2, ArrowRight, MessageSquare } from 'lucide-react';
import { useAppState } from '@/modules/core/contexts/app-provider';
import { askAssistant } from '@/actions/ask-assistant';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const SUGGESTED_QUESTIONS = [
  '¿Qué materiales tienen stock crítico?',
  '¿Hay solicitudes de compra pendientes?',
  '¿Cuál es el avance por fase?',
  '¿Quién es el Jefe de Terreno?',
];

/**
 * Construye un RESUMEN compacto de la obra activa para enviar al modelo.
 *
 * Antes se serializaba la base entera (todos los materiales/herramientas/usuarios
 * + el árbol EDT completo) como JSON en CADA mensaje → miles de tokens por
 * pregunta. Ahora se manda texto plano con: stock (compacto), solo lo pendiente
 * de las solicitudes, el avance a nivel de fase (no cada partida hoja) y el
 * equipo. Mucho más barato y suficiente para las consultas del día a día.
 */
function buildCompactContext(state: {
  materials: any[];
  tools: any[];
  users: any[];
  purchaseRequests: any[];
  requests: any[];
  workItems: any[];
  projects: any[];
  currentProjectId: string | null;
}): string {
  const { materials, tools, users, purchaseRequests, requests, workItems, projects, currentProjectId } = state;
  const nameOf = (id: string | undefined | null) => users.find((u) => u.id === id)?.name;
  const L: string[] = [];

  const project = projects.find((p) => p.id === currentProjectId);
  L.push(`FECHA: ${new Date().toLocaleDateString('es-CL')}`);
  L.push(`OBRA ACTIVA: ${project?.name ?? 'ninguna seleccionada'}`);

  // Materiales (compacto, uno por línea implícita; los críticos aparte)
  const mats = materials.filter((m) => !m.archived);
  const criticos = mats.filter((m) => m.stock <= 10);
  L.push('');
  L.push(`MATERIALES (${mats.length} en total, ${criticos.length} con stock crítico ≤10):`);
  if (criticos.length) {
    L.push('  CRÍTICOS: ' + criticos.map((m) => `${m.name} ${m.stock} ${m.unit}`).join('; '));
  }
  if (mats.length) {
    L.push('  STOCK: ' + mats.map((m) => `${m.name} ${m.stock} ${m.unit}`).join('; '));
  }

  // Herramientas — resumen por estado (los detalles por nombre casi no se consultan)
  const disp = tools.filter((t) => t.status === 'available').length;
  const enUso = tools.filter((t) => t.status === 'in-use');
  const mant = tools.filter((t) => t.status === 'maintenance');
  L.push('');
  L.push(`HERRAMIENTAS: ${tools.length} (${disp} disponibles, ${enUso.length} en uso, ${mant.length} en mantención).`);
  const noDisp = [...enUso, ...mant];
  if (noDisp.length) {
    L.push('  No disponibles: ' + noDisp.map((t) => `${t.name} (${t.status === 'in-use' ? 'en uso' : 'mantención'})`).join('; '));
  }

  // Solicitudes de compra activas (no las recibidas/rechazadas)
  const prActivas = purchaseRequests.filter((pr) => ['pending', 'approved', 'ordered', 'batched'].includes(pr.status));
  L.push('');
  L.push(`SOLICITUDES DE COMPRA ACTIVAS (${prActivas.length}):`);
  prActivas.slice(0, 40).forEach((pr) => {
    const who = nameOf(pr.supervisorId) ?? pr.requesterName ?? 'Desconocido';
    L.push(`  - ${pr.materialName} x${pr.quantity} ${pr.unit} — ${who} [${pr.status}]${pr.phase ? ` · ${pr.phase}` : ''}`);
  });

  // Solicitudes de material pendientes
  const reqPend = requests.filter((r) => r.status === 'pending');
  L.push('');
  L.push(`SOLICITUDES DE MATERIAL PENDIENTES (${reqPend.length}):`);
  reqPend.slice(0, 40).forEach((r) => {
    const who = nameOf(r.supervisorId) ?? r.userName ?? 'Desconocido';
    L.push(`  - área ${r.area}, ${r.items?.length ?? 0} ítems — ${who}`);
  });

  // Avance solo a nivel de fase/subfase (no cada partida hoja: eso inflaba todo)
  const fases = workItems.filter((wi) => wi.type === 'phase' || wi.type === 'subphase');
  L.push('');
  L.push(`AVANCE POR FASE (${fases.length}):`);
  fases.forEach((wi) => {
    const indent = wi.type === 'subphase' ? '    · ' : '  - ';
    L.push(`${indent}${wi.name}: ${wi.progress ?? 0}%`);
  });

  // Equipo
  L.push('');
  L.push(`EQUIPO (${users.length}):`);
  users.forEach((u) => {
    L.push(`  - ${u.name} — ${u.cargo ?? u.role} (${u.role})`);
  });

  return L.join('\n');
}

export function GdoAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: '¡Hola! Soy el **Asistente GDO**. Puedo ayudarte con el stock, las solicitudes pendientes, el avance de la obra y el equipo. ¿Qué necesitas?' },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const { materials, tools, users, purchaseRequests, requests, workItems, projects, currentProjectId } = useAppState();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, isOpen]);

  const context = useMemo(
    () =>
      buildCompactContext({
        materials: materials ?? [],
        tools: tools ?? [],
        users: users ?? [],
        purchaseRequests: purchaseRequests ?? [],
        requests: requests ?? [],
        workItems: workItems ?? [],
        projects: projects ?? [],
        currentProjectId: currentProjectId ?? null,
      }),
    [materials, tools, users, purchaseRequests, requests, workItems, projects, currentProjectId],
  );

  const handleQuery = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userQuery = text;
    setQuery('');
    setMessages((prev) => [...prev, { role: 'user', content: userQuery }]);
    setIsLoading(true);

    try {
      const res = await askAssistant(userQuery, context);
      if (res.ok && res.answer) {
        setMessages((prev) => [...prev, { role: 'assistant', content: res.answer! }]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: `❌ **Error:** ${res.error || 'No se recibió respuesta.'}` }]);
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => [...prev, { role: 'assistant', content: '⚠️ Hubo un problema de conexión. Por favor, intenta de nuevo.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleQuery(query);
  };

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: 'Chat reiniciado. ¿En qué te ayudo?' }]);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Abrir Asistente GDO"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-2xl hover:shadow-primary/50 hover:scale-110 transition-all duration-300 flex items-center justify-center z-50 group border-2 border-white/20"
      >
        <Sparkles className="h-6 w-6 group-hover:rotate-12 transition-transform" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-[90vw] md:w-[400px] h-[600px] max-h-[80vh] z-50 flex flex-col shadow-2xl rounded-2xl overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300 ring-1 ring-black/10 font-sans">
      <Card className="h-full flex flex-col border-0">
        <CardHeader className="bg-primary text-primary-foreground p-4 flex flex-row items-center justify-between space-y-0 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md shadow-inner">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-white tracking-tight">Asistente GDO</CardTitle>
              <div className="flex items-center gap-1.5 opacity-90">
                <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]"></span>
                <span className="text-xs font-medium">Asistente de Obra</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={clearChat}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/80 hover:text-white"
              title="Limpiar chat"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Cerrar asistente"
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/80 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 p-0 flex flex-col bg-muted/30 dark:bg-slate-900 overflow-hidden relative">
          <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-1 ${
                    msg.role === 'assistant'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-blue-600 text-white'
                }`}>
                  {msg.role === 'assistant' ? <Bot className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                </div>

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-none'
                      : 'bg-background text-foreground border rounded-tl-none'
                  }`}
                >
                  <div className="prose prose-sm max-w-none dark:prose-invert
                    prose-p:m-0 prose-ul:m-0 prose-ul:pl-4 prose-li:m-0
                    prose-headings:font-bold prose-headings:text-sm prose-headings:mb-1 prose-headings:mt-2
                    prose-table:text-xs prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-tr:border-b
                    prose-th:text-left prose-th:font-bold prose-th:text-slate-700 dark:prose-th:text-slate-300">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start gap-2 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                   <Bot className="h-4 w-4" />
                </div>
                <div className="bg-background border rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center">
                  <div className="flex gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/80 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {!isLoading && messages.length <= 1 && (
            <div className="px-4 pb-2 flex flex-wrap gap-2 justify-center">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleQuery(q)}
                  className="px-3 py-1.5 bg-background border hover:border-primary/50 hover:bg-primary/10 text-foreground/80 text-xs rounded-full transition-all shadow-sm flex items-center gap-1"
                >
                  {q} <ArrowRight className="h-3 w-3 opacity-50" />
                </button>
              ))}
            </div>
          )}

          <div className="p-4 bg-background border-t">
            <form onSubmit={handleSubmit} className="flex gap-2 relative">
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pregunta sobre la obra..."
                className="flex-1 pr-10 rounded-xl border-border focus-visible:ring-primary"
                autoFocus
                disabled={isLoading}
              />
              <Button
                type="submit"
                size="icon"
                disabled={isLoading || !query.trim()}
                className={`shrink-0 rounded-xl transition-all duration-300 ${
                    query.trim()
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30'
                        : 'bg-muted text-muted-foreground'
                }`}
              >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
