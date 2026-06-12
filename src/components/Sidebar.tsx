import React from 'react';
import { Search, Plus, Radio, Mic, FileDown, Clock, MessageSquare, AlertCircle, Trash2 } from 'lucide-react';
import { TranscriptionItem } from '../types';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SidebarProps {
  items: TranscriptionItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  className?: string;
  onShowInstallGuide?: () => void;
}

export function Sidebar({
  items,
  selectedId,
  onSelect,
  onNew,
  onDelete,
  searchQuery,
  onSearchChange,
  className,
  onShowInstallGuide,
}: SidebarProps) {

  const filteredItems = items
    .filter((item) => {
      const search = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(search) ||
        item.text.toLowerCase().includes(search) ||
        (item.summary && item.summary.toLowerCase().includes(search))
      );
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className={cn("w-80 h-full border-r border-stone-200 bg-stone-50/60 flex flex-col overflow-hidden shrink-0", className)}>
      {/* Sidebar Header Title */}
      <div className="p-4 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-bold text-stone-850 flex items-center gap-1.5 leading-none">
            <Radio className="w-4.5 h-4.5 text-indigo-600 animate-pulse" />
            Transcrições Salvas
          </h1>
          
          {/* Quick Create New Button */}
          <button
            onClick={onNew}
            className="p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all shadow-sm flex items-center justify-center gap-1 text-[11px] font-bold px-2.5 active:scale-95"
            title="Nova gravação ou arquivo de áudio"
          >
            <Plus className="w-3.5 h-3.5" />
            Criar Nova
          </button>
        </div>

        {/* Live Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
          <input
            type="text"
            placeholder="Pesquisar textos ou termos..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-white border border-stone-200 rounded-xl text-xs sm:text-xs leading-normal focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder:text-stone-400"
          />
        </div>
      </div>

      {/* Conversation/Notes List */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1 custom-scrollbar">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-stone-400 text-center px-4">
            <Mic className="w-10 h-10 mb-2 opacity-15 text-stone-550" />
            <span className="text-xs font-bold text-stone-605">Nenhuma Transcrição</span>
            <p className="text-[10px] text-stone-400 max-w-[200px] mt-1">
              {searchQuery ? "Nenhum termo corresponde à sua busca." : "Suas notas de áudio e aulas aparecerão listadas aqui."}
            </p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={cn(
                "group relative p-3 rounded-xl cursor-pointer transition-all border text-left",
                selectedId === item.id
                  ? "bg-white border-stone-200 shadow-sm"
                  : "hover:bg-stone-200/40 border-transparent"
              )}
            >
              <div className="flex justify-between items-start mb-0.5">
                <h3 className={cn(
                  "text-xs sm:text-[13px] font-bold truncate pr-3 flex-1",
                  selectedId === item.id ? "text-stone-900" : "text-stone-700"
                )}>
                  {item.title || "Gravação Sem Título"}
                </h3>
                
                {/* Duration Badge */}
                {item.audioDuration && (
                  <span className="text-[9px] bg-stone-100 text-stone-650 font-mono px-1.5 py-0.5 rounded leading-none">
                    {item.audioDuration}
                  </span>
                )}
              </div>
              
              {/* Short transcript preview snippet */}
              <p className="text-[11px] text-stone-400 line-clamp-2 leading-relaxed mb-2.5">
                {item.text || "Vazio... Clique para transcrever ou preencher."}
              </p>

              <div className="flex items-center justify-between border-t border-stone-100 pt-2 shrink-0">
                <span className="text-[9px] text-stone-400 font-bold uppercase tracking-wider">
                  {format(item.createdAt, 'dd MMM yy • HH:mm', { locale: ptBR })}
                </span>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Quer mesmo excluir esta transcrição?")) {
                      onDelete(item.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-stone-400 hover:text-red-500 rounded transition-all ml-auto shrink-0 touch-opacity"
                  title="Excluir"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Installed mobile bottom alert indicator if guide exists */}
      {onShowInstallGuide && (
        <div className="p-3 bg-indigo-50/60 border-t border-indigo-100 shrink-0">
          <button
            onClick={onShowInstallGuide}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Instalar no Celular
          </button>
        </div>
      )}
    </div>
  );
}
