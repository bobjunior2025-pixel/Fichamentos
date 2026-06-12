import React, { useState, useEffect } from 'react';
import { TranscriptionItem } from '../types';
import { 
  FileText, Sparkles, Copy, Download, Trash2, Check, 
  ChevronRight, Calendar, Clock, HardDrive, Edit3, Loader2, ArrowLeft, RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { summarizeTranscription, generateTranscriptionTitle } from '../services/gemini';
import { exportTranscriptionToPdf, exportTranscriptionToTxt } from '../services/exportService';
import { cn } from '../lib/utils';

interface TranscriptionViewProps {
  item: TranscriptionItem;
  onUpdate: (id: string, updates: Partial<TranscriptionItem>) => void;
  onDelete: (id: string) => void;
  onBackToList?: () => void;
}

export function TranscriptionView({
  item,
  onUpdate,
  onDelete,
  onBackToList
}: TranscriptionViewProps) {
  const [activeTab, setActiveTab] = useState<'text' | 'ai'>('text');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(item.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateSummary = async () => {
    if (!item.text) return;
    setIsSummarizing(true);
    setError(null);
    try {
      const result = await summarizeTranscription(item.text);
      onUpdate(item.id, {
        summary: result.summary,
        keyTopics: result.keyTopics
      });
      setActiveTab('ai');
    } catch (err: any) {
      console.error(err);
      setError('Não foi possível gerar o resumo automático. Tente novamente mais tarde.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleAutoRename = async () => {
    if (!item.text) return;
    setIsRenaming(true);
    try {
      const newTitle = await generateTranscriptionTitle(item.text);
      onUpdate(item.id, { title: newTitle });
    } catch (e) {
      console.error(e);
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden h-full shadow-inner">
      {/* Header bar and controls */}
      <div className="h-16 shrink-0 border-b border-stone-200 bg-white flex items-center justify-between px-4 sm:px-6 z-10 gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          {onBackToList && (
            <button
              onClick={onBackToList}
              className="md:hidden p-2 text-stone-600 hover:bg-stone-100 rounded-lg transition-colors flex items-center justify-center shrink-0"
              title="Voltar para a lista"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-center gap-1 text-stone-400 shrink-0">
            <Calendar className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium text-stone-500">
              {format(item.createdAt, 'dd MMM yyyy, HH:mm', { locale: ptBR })}
            </span>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={handleCopy}
            className={cn(
              "p-2 text-stone-600 hover:bg-stone-50 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold border border-stone-200/85",
              copied && "bg-green-50 border-green-200 text-green-700 hover:bg-green-50"
            )}
            title="Copiar texto completo"
          >
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-stone-500" />}
            <span className="hidden sm:inline">{copied ? "Copiado!" : "Copiar"}</span>
          </button>

          <div className="relative group/export">
            <button
              className="p-2 text-stone-600 hover:bg-stone-50 border border-stone-200/85 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold"
              title="Exportar transcrição"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Exportar</span>
            </button>
            
            {/* Export Dropdown Menu */}
            <div className="absolute right-0 top-full mt-1.5 bg-white border border-stone-200 rounded-xl shadow-lg py-1.5 w-44 opacity-0 pointer-events-none group-hover/export:opacity-100 group-hover/export:pointer-events-auto transition-all z-50">
              <button
                onClick={() => exportTranscriptionToPdf(item)}
                className="w-full text-left px-3.5 py-2 hover:bg-stone-50 text-xs font-medium text-stone-700 flex items-center gap-1.5"
              >
                <div className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                Salvar como PDF (A4)
              </button>
              <button
                onClick={() => exportTranscriptionToTxt(item)}
                className="w-full text-left px-3.5 py-2 hover:bg-stone-50 text-xs font-medium text-stone-700 flex items-center gap-1.5"
              >
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                Salvar em Bloco de Notas (.txt)
              </button>
            </div>
          </div>

          <button
            onClick={() => onDelete(item.id)}
            className="p-2 text-red-500 hover:bg-red-50 hover:text-red-650 border border-transparent hover:border-red-150 rounded-lg transition-all"
            title="Excluir gravação"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-stone-50/20">
        <div className="max-w-4xl mx-auto p-4 sm:p-6 md:p-8 space-y-6">
          
          {/* Editable Title Section */}
          <div className="bg-white border border-stone-200/80 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex-1 w-full">
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => onUpdate(item.id, { title: e.target.value })}
                  placeholder="Nomeie esta gravação..."
                  className="w-full text-lg sm:text-2xl font-bold text-stone-800 placeholder:text-stone-300 border-none focus:ring-0 p-0"
                />
              </div>
              
              <button
                onClick={handleAutoRename}
                disabled={isRenaming}
                className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50/60 hover:bg-indigo-100/60 px-2.5 py-1.5 rounded-full transition-all border border-indigo-100 disabled:opacity-50"
                title="Sugerir título científico com IA"
              >
                {isRenaming ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-indigo-505 animate-pulse" />
                )}
                Sugerir Título IA
              </button>
            </div>

            {/* Meta Tags (Size, duration) */}
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-stone-400 pt-1 border-t border-stone-100">
              {item.audioDuration && (
                <div className="flex items-center gap-1 bg-stone-100/70 px-2.5 py-1 rounded-md text-stone-600">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Duração: {item.audioDuration}</span>
                </div>
              )}
              {item.fileSize && (
                <div className="flex items-center gap-1 bg-stone-100/70 px-2.5 py-1 rounded-md text-stone-600">
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>Tamanho: {item.fileSize}</span>
                </div>
              )}
            </div>
          </div>

          {/* Navigation/Toggle Tabs for details */}
          <div className="space-y-4">
            <div className="flex border-b border-stone-200 overflow-x-auto gap-2">
              <button
                onClick={() => setActiveTab('text')}
                className={cn(
                  "px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-all shrink-0 flex items-center gap-2",
                  activeTab === 'text' ? "border-indigo-600 text-indigo-600" : "border-transparent text-stone-400 hover:text-stone-600"
                )}
              >
                <FileText className="w-4 h-4" />
                Transcrição Completa
              </button>
              
              <button
                onClick={() => setActiveTab('ai')}
                className={cn(
                  "px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-all shrink-0 flex items-center gap-2",
                  activeTab === 'ai' ? "border-indigo-600 text-indigo-600" : "border-transparent text-stone-400 hover:text-stone-600"
                )}
              >
                <Sparkles className="w-4 h-4 text-indigo-500" />
                Resumo Inteligente & Tópicos
              </button>
            </div>

            {/* Tab content panel */}
            <div className="min-h-[300px]">
              {activeTab === 'text' ? (
                <div className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-stone-50">
                    <span className="text-[10px] font-bold text-stone-400 tracking-widest uppercase">Editor do Conversado</span>
                    <span className="text-xs text-stone-400 italic">O texto salva automaticamente</span>
                  </div>
                  
                  <textarea
                    value={item.text}
                    onChange={(e) => onUpdate(item.id, { text: e.target.value })}
                    placeholder="Cole ou digite texto aqui se preferir..."
                    className="w-full min-h-[350px] bg-white border-0 focus:ring-0 p-0 text-sm sm:text-base text-stone-700 leading-relaxed resize-none custom-scrollbar"
                  />
                </div>
              ) : (
                <div className="space-y-6">
                  {item.summary ? (
                    <div className="space-y-6">
                      {/* AI Summary Block */}
                      <div className="bg-indigo-50/30 border border-indigo-150/45 rounded-2xl p-5 md:p-6 shadow-sm space-y-3">
                        <div className="flex items-center gap-2 pb-2 border-b border-indigo-100/60">
                          <Sparkles className="w-4 h-4 text-indigo-600" />
                          <h4 className="font-bold text-indigo-950 text-xs tracking-wider uppercase">Resumo da Gravação</h4>
                        </div>
                        <p className="text-sm sm:text-base text-indigo-900/90 leading-relaxed whitespace-pre-line">
                          {item.summary}
                        </p>
                      </div>

                      {/* AI Key Topics */}
                      {item.keyTopics && item.keyTopics.length > 0 && (
                        <div className="bg-white border border-stone-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-3">
                          <div className="flex items-center gap-2 pb-2 border-b border-stone-100">
                            <ChevronRight className="w-4 h-4 text-stone-400" />
                            <h4 className="font-bold text-stone-700 text-[10px] tracking-widest uppercase">Principais Assuntos Abordados</h4>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            {item.keyTopics.map((topic, i) => (
                              <div 
                                key={i}
                                className="flex items-start gap-2.5 p-3 rounded-xl bg-stone-50 border border-stone-100 text-stone-700 text-xs sm:text-sm font-medium"
                              >
                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold leading-none shrink-0 mt-0.5">
                                  {i + 1}
                                </span>
                                <span>{topic}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Regen alert */}
                      <button
                        onClick={handleGenerateSummary}
                        disabled={isSummarizing}
                        className="w-full py-3 border border-stone-200 hover:bg-stone-50 text-stone-600 hover:text-stone-800 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
                      >
                        <RefreshCw className={cn("w-3.5 h-3.5", isSummarizing && "animate-spin")} />
                        Recriar Resumo Inteligente com Gemini
                      </button>
                    </div>
                  ) : (
                    /* Summary placeholder call to action */
                    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-4">
                      <div className="w-12 h-12 bg-indigo-50/70 border border-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
                        <Sparkles className="w-6 h-6 animate-pulse" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-bold text-stone-805 text-sm">Resumo inteligente do Áudio</h3>
                        <p className="text-xs text-stone-500 max-w-sm">
                          Deseja que os modelos Gemini IA analisem a transcrição desta aula/gravação para organizar um resumo executivo e separar os principais temas estruturados?
                        </p>
                      </div>

                      <button
                        onClick={handleGenerateSummary}
                        disabled={isSummarizing}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2"
                      >
                        {isSummarizing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Analisando áudio...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Gerar Resumo por IA
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-150 rounded-xl text-xs text-red-700 font-medium leading-relaxed">
              {error}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
