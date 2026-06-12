import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { AudioTranscriber } from './components/AudioTranscriber';
import { TranscriptionView } from './components/TranscriptionView';
import { TranscriptionItem } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Radio, Plus, Smartphone, Share2, PlusSquare, Sparkles, 
  X, Compass, ArrowLeft, Heart, User, Check, CloudLightning
} from 'lucide-react';

const STORAGE_KEY = 'transcritor-ia-data-v2';

// Safe UUID generator supporting non-secure contexts (HTTP), iframes, and legacy mobile browsers
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function App() {
  const [items, setItems] = useState<TranscriptionItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(true);

  // PWA Install Prompt events
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  // Listen to beforeinstallprompt event for Chromium browsers
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if running inside PWA standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setItems(parsed);
        if (parsed.length > 0) {
          setSelectedId(parsed[0].id);
          setShowMobileSidebar(false);
        }
      } catch (e) {
        console.error("Failed to parse transcription data", e);
      }
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  }, [items, isLoaded]);

  // Handle selected item selection
  const handleSelectItem = (id: string) => {
    setSelectedId(id);
    setShowMobileSidebar(false);
  };

  // Trigger New/Active recording workspace
  const handleNewTranscription = () => {
    setSelectedId(null);
    setShowMobileSidebar(false);
  };

  // Delete a recording
  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setShowMobileSidebar(true);
    }
  };

  // Update transcription item properties (like summary, title, or body text edits)
  const handleUpdateItem = (id: string, updates: Partial<TranscriptionItem>) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, ...updates, updatedAt: Date.now() } : item
      )
    );
  };

  // Add newly transcribed item to state
  const handleTranscriptionCompleted = (data: {
    title: string;
    text: string;
    audioDuration?: string;
    fileSize?: string;
  }) => {
    const newItem: TranscriptionItem = {
      id: generateUUID(),
      title: data.title,
      text: data.text,
      audioDuration: data.audioDuration,
      fileSize: data.fileSize,
      summary: '',
      keyTopics: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setItems([newItem, ...items]);
    setSelectedId(newItem.id);
    setShowMobileSidebar(false);
  };

  // Interactive 1-click trigger for PWA prompt
  const handleNativeInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallModal(false);
  };

  const selectedItem = items.find((n) => n.id === selectedId) || null;

  if (!isLoaded) return null;

  return (
    <div className="flex h-screen w-full bg-stone-50 overflow-hidden font-sans antialiased text-stone-850">
      
      {/* Sidebar history lists */}
      <Sidebar
        items={items}
        selectedId={selectedId}
        onSelect={handleSelectItem}
        onNew={handleNewTranscription}
        onDelete={handleDeleteItem}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onShowInstallGuide={() => setShowInstallModal(true)}
        className={showMobileSidebar ? "w-full md:w-80 flex" : "hidden md:flex"}
      />
      
      {/* Central Content Area */}
      <main className={`flex-1 relative flex flex-col overflow-hidden h-full bg-white md:bg-stone-50/20 ${showMobileSidebar ? "hidden md:flex" : "w-full flex"}`}>
        
        {/* Responsive Desktop header navigation with Install alerts */}
        <div className="h-16 shrink-0 border-b border-stone-200 px-6 flex items-center justify-between bg-white z-10 sticky top-0">
          <div className="flex items-center gap-3">
            {/* Back button for mobile view screens */}
            {!showMobileSidebar && (
              <button
                onClick={() => setShowMobileSidebar(true)}
                className="md:hidden p-2 text-stone-605 bg-stone-50 hover:bg-stone-100 rounded-xl transition-all"
                title="Voltar para a lista salvos"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}

            <div className="flex items-center gap-2">
              <span className="w-7 h-7 bg-indigo-650 rounded-xl flex items-center justify-center text-white text-xs font-black shadow-sm tracking-tighter shrink-0 select-none">
                🎙️
              </span>
              <div className="hidden sm:block">
                <h1 className="text-sm font-black text-stone-900 tracking-tight leading-none mb-0.5">Transcritor de Voz IA</h1>
                <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Alta Precisão Gemini</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Install PWA Button if available */}
            {!isInstalled && (
              <button
                onClick={() => setShowInstallModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100/70 text-indigo-700 hover:text-indigo-805 text-xs font-bold rounded-full transition-all"
                title="Instalar em seu celular/tablet"
              >
                <Smartphone className="w-3.5 h-3.5 text-indigo-600 animate-bounce" />
                <span>Instalar App</span>
              </button>
            )}

            <button
              onClick={handleNewTranscription}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
              title="Iniciar nova gravação"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Áudio</span>
            </button>
          </div>
        </div>

        {/* Dynamic content area transitions based on active/inactive states */}
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {selectedItem ? (
              <motion.div
                key={selectedItem.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 flex flex-col"
              >
                <TranscriptionView
                  item={selectedItem}
                  onUpdate={handleUpdateItem}
                  onDelete={handleDeleteItem}
                  onBackToList={() => setShowMobileSidebar(true)}
                />
              </motion.div>
            ) : (
              <motion.div
                key="transcriber-workspace"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 flex flex-col justify-center overflow-y-auto"
              >
                <AudioTranscriber
                  onTranscriptionCompleted={handleTranscriptionCompleted}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* PWA Mobile/Safari/Android Installation Guide Drawer Modal Dialog */}
      <AnimatePresence>
        {showInstallModal && (
          <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white border border-stone-250 w-full max-w-md rounded-2xl shadow-2xl p-6 relative overflow-hidden"
            >
              {/* Close Button */}
              <button
                onClick={() => setShowInstallModal(false)}
                className="absolute right-4 top-4 p-1.5 text-stone-400 hover:text-stone-605 bg-stone-100 hover:bg-stone-200/60 rounded-full transition-all"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="text-center space-y-3 mb-6">
                <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <Smartphone className="w-6 h-6 text-indigo-600 animate-pulse" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-stone-850">Instalar Aplicativo no Celular</h3>
                <p className="text-xs text-stone-500 leading-relaxed max-w-sm mx-auto">
                  Deixe o transcritor de áudio sempre acessível na tela inicial do seu celular, sem precisar de navegador, funcionando como um app de verdade!
                </p>
              </div>

              {/* Dynamic OS check instructions */}
              {deferredPrompt ? (
                // Android/Chrome Google Native Install Dialog available
                <div className="space-y-4">
                  <div className="p-4 bg-indigo-50/40 border border-indigo-100 rounded-2xl flex items-center gap-3">
                    <CloudLightning className="w-5 h-5 text-indigo-600 shrink-0" />
                    <span className="text-xs text-indigo-900 font-medium">Instalação direta de 1 clique compatível com seu aparelho Android!</span>
                  </div>
                  
                  <button
                    onClick={handleNativeInstall}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
                  >
                    Adicionar à Tela Principal do Aparelho
                  </button>
                </div>
              ) : (
                // iOS Safari/Manual alternative instructions guide layout
                <div className="space-y-4 text-left">
                  <span className="text-[10px] font-bold text-stone-400 tracking-wider uppercase block border-b border-stone-100 pb-1.5">No celular Apple (iPhone / iPad)</span>
                  
                  <div className="space-y-3 text-stone-700 text-xs leading-relaxed">
                    <div className="flex items-start gap-2.5">
                      <span className="flex items-center justify-center w-5 h-5 bg-stone-100 text-stone-700 font-bold text-[10px] rounded-full shrink-0">1</span>
                      <p>
                        Abra esta página no navegador <strong className="text-stone-800">Safari</strong> do iPhone.
                      </p>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <span className="flex items-center justify-center w-5 h-5 bg-stone-100 text-stone-700 font-bold text-[10px] rounded-full shrink-0">2</span>
                      <p className="flex flex-wrap items-center gap-1">
                        Toque no botão de <strong>Compartilhar</strong> 
                        <Share2 className="w-4 h-4 text-indigo-600 mx-0.5 inline shrink-0" />
                        na barra inferior do Safari.
                      </p>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <span className="flex items-center justify-center w-5 h-5 bg-stone-100 text-stone-700 font-bold text-[10px] rounded-full shrink-0">3</span>
                      <p className="flex flex-wrap items-center gap-1">
                        Role a lista para baixo e toque em <strong>Adicionar à Tela de Início</strong>
                        <PlusSquare className="w-4 h-4 text-indigo-600 mx-0.5 inline shrink-0" />.
                      </p>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <span className="flex items-center justify-center w-5 h-5 bg-stone-100 text-stone-700 font-bold text-[10px] rounded-full shrink-0">4</span>
                      <p>
                        Confirme clicando em <strong className="text-stone-800">Adicionar</strong> no canto superior direito. Pronto! O app estará na tela de aplicativos.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowInstallModal(false)}
                    className="w-full mt-2 py-3 bg-stone-150 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition-all"
                  >
                    Entendi, obrigado!
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
