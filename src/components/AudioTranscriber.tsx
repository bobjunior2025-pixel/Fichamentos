import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, Upload, Volume2, Play, Pause, RefreshCw, 
  Sparkles, FileText, Check, AlertCircle, Loader2, Info, CheckCircle, Radio
} from 'lucide-react';
import { transcribeAudio } from '../services/gemini';
import { cn } from '../lib/utils';

// Helper functions for browser-side audio downsampling (monochannel 16kHz WAV compression)
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function bufferToWav(buffer: AudioBuffer, bitDepth: number = 16): Blob {
  const numOfChan = 1; // force mono
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM 16-bit or 8-bit
  const result = buffer.getChannelData(0);

  const bytesPerSample = bitDepth / 8;
  const bufferLength = result.length * bytesPerSample;
  const wavBuffer = new ArrayBuffer(44 + bufferLength);
  const view = new DataView(wavBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + bufferLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numOfChan * bytesPerSample, true);
  view.setUint16(32, numOfChan * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, bufferLength, true);

  let offset = 44;
  if (bitDepth === 16) {
    for (let i = 0; i < result.length; i++) {
      let s = Math.max(-1, Math.min(1, result[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  } else {
    // 8-bit PCM is unsigned: sound waves are mapped 0 to 255, silence is 128
    for (let i = 0; i < result.length; i++) {
      let s = Math.max(-1, Math.min(1, result[i]));
      let sample8 = Math.round((s + 1) * 127.5);
      view.setUint8(offset, Math.max(0, Math.min(255, sample8)));
      offset += 1;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}

async function compressAudioFile(
  fileOrBlob: Blob,
  onProgress?: (msg: string) => void
): Promise<Blob> {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    return fileOrBlob;
  }

  try {
    onProgress?.("Otimizador: Lendo arquivo de áudio...");
    const audioCtx = new AudioContextClass();
    const arrayBuffer = await fileOrBlob.arrayBuffer();
    
    onProgress?.("Passo 1/3: Decodificando canais de áudio na memória...");
    const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    const duration = decodedBuffer.duration;
    let targetSampleRate = 16000;
    let bitDepth = 16;

    // We want the resulting file to be strictly under 7.5 MB (7,864,320 bytes) to guarantee no Nginx or Cloud Run 413 Payload Too Large errors.
    // Size estimation in bytes = duration * targetSampleRate * (bitDepth / 8).
    const maxTargetBytes = 7.5 * 1024 * 1024;
    const allowedBytesPerSecond = duration > 0 ? (maxTargetBytes / duration) : 32000;

    if (allowedBytesPerSecond >= 32000) { // 16kHz, 16-bit Mono (32000 bytes/sec)
      targetSampleRate = 16000;
      bitDepth = 16;
      onProgress?.(`Passo 2/3: Áudio otimizado em alta clareza (16kHz Mono 16-bit, ~${Math.round(duration)}s)...`);
    } else if (allowedBytesPerSecond >= 24000) { // 12kHz, 16-bit Mono (24000 bytes/sec)
      targetSampleRate = 12000;
      bitDepth = 16;
      onProgress?.(`Passo 2/3: Otimizando áudio (12kHz Mono 16-bit, ~${Math.round(duration/60)} min)...`);
    } else if (allowedBytesPerSecond >= 16000) { // 8kHz, 16-bit Mono (16000 bytes/sec)
      targetSampleRate = 8000;
      bitDepth = 16;
      onProgress?.(`Passo 2/3: Otimizando áudio (8kHz Mono 16-bit, ~${Math.round(duration/60)} min)...`);
    } else if (allowedBytesPerSecond >= 8000) { // 8kHz, 8-bit Mono (8000 bytes/sec)
      targetSampleRate = 8000;
      bitDepth = 8;
      onProgress?.(`Passo 2/3: Compactando áudio longo para tráfego seguro (8kHz Mono 8-bit)...`);
    } else {
      // Extremely long audios (e.g. over 16 minutes): Calculate dynamic lower sample rate to minimize tráfego.
      // Most browsers require OfflineAudioContext to operate at least at 8000Hz (Safari limit).
      // Let's target 6000Hz or 8000Hz, but if browser throws we catch and fallback to 8000Hz Mono 8-bit (8KB/s).
      bitDepth = 8;
      targetSampleRate = Math.max(6000, Math.min(8000, Math.floor(allowedBytesPerSecond)));
      onProgress?.(`Passo 2/3: Áudio muito longo (~${Math.round(duration/60)} min). Compactando intensivamente para vocal (${targetSampleRate}Hz Mono 8-bit)...`);
    }

    let offlineCtx: OfflineAudioContext;
    try {
      offlineCtx = new OfflineAudioContext(
        1,
        Math.round(duration * targetSampleRate),
        targetSampleRate
      );
    } catch (offlineErr) {
      console.warn(`Browser rejected ${targetSampleRate}Hz sample rate, falling back to 8000Hz standard support:`, offlineErr);
      targetSampleRate = 8000;
      offlineCtx = new OfflineAudioContext(
        1,
        Math.round(duration * targetSampleRate),
        targetSampleRate
      );
    }

    const source = offlineCtx.createBufferSource();
    source.buffer = decodedBuffer;
    source.connect(offlineCtx.destination);
    source.start();

    const renderedBuffer = await offlineCtx.startRendering();
    
    onProgress?.(`Passo 3/3: Compactando áudio estruturado em WAV (${bitDepth}-bit)...`);
    const compressedBlob = bufferToWav(renderedBuffer, bitDepth);
    audioCtx.close();
    return compressedBlob;
  } catch (err) {
    console.warn("Seu navegador não pôde decodificar e simplificar este áudio. Enviando com qualidade padrão da rede...", err);
    return fileOrBlob;
  }
}

interface AudioTranscriberProps {
  onTranscriptionCompleted: (data: {
    title: string;
    text: string;
    audioDuration?: string;
    fileSize?: string;
  }) => void;
}

export function AudioTranscriber({ onTranscriptionCompleted }: AudioTranscriberProps) {
  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  
  // File Upload State
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<string | null>(null);
  
  // Status State
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState<string | null>(null);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isDiscardingRef = useRef(false);

  // Countdown / Loading messages for transcription engagement
  const [loaderMessageIndex, setLoaderMessageIndex] = useState(0);
  const loaderMessages = [
    "Analisando arquivos de áudio nos servidores...",
    "Gemini está processando a faixa vocal com IA...",
    "Corrigindo ruídos de fundo e murmúrios...",
    "Dividindo áudio em parágrafos coerentes em Português...",
    "Quase lá! Transcrevendo termos técnicos e formatando..."
  ];

  useEffect(() => {
    let interval: any;
    if (isTranscribing) {
      interval = setInterval(() => {
        setLoaderMessageIndex((prev) => (prev + 1) % loaderMessages.length);
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [isTranscribing]);

  // Audio recording timer effect
  useEffect(() => {
    if (isRecording && !isPaused) {
      recordingIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    };
  }, [isRecording, isPaused]);

  const startRecording = async () => {
    setTranscriptionError(null);
    setAudioFile(null);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordingSeconds(0);
    setIsPaused(false);
    isDiscardingRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const options = { mimeType: 'audio/webm' };
      
      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, options);
      } catch (e) {
        // Fallback for browsers that don't support audio/webm natively
        mediaRecorder = new MediaRecorder(stream);
      }

      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (isDiscardingRef.current) {
          console.log("Recording discard requested. Ignoring audio blocks.");
          return;
        }
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: mimeType });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        
        // Stop all tracks to turn off mic light
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        } else {
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error('Error opening microphone:', err);
      setTranscriptionError('Não foi possível acessar o seu microfone. Verifique as configurações de segurança do navegador ou as permissões de gravação.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.error("Error stopping mediaRecorder:", err);
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
  };

  const discardRecording = () => {
    isDiscardingRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.error("Error stopping mediaRecorder on discard:", err);
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setRecordedBlob(null);
    setRecordedUrl(null);
    setAudioFile(null);
    setRecordingSeconds(0);
    setIsRecording(false);
    setIsPaused(false);
    setTranscriptionError(null);
    setTimeout(() => {
      isDiscardingRef.current = false;
    }, 100);
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      try {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
      } catch (err) {
        console.error("Error pausing mediaRecorder:", err);
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      try {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
      } catch (err) {
        console.error("Error resuming mediaRecorder:", err);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedExtensions = ['.mp3', '.wav', '.m4a', '.webm', '.ogg', '.aac', '.mp4'];
      const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      const isAudio = file.type.startsWith('audio/') || allowedExtensions.includes(fileExt);
      
      if (!isAudio) {
        setTranscriptionError('Por favor, selecione um arquivo de áudio ou vídeo compatível (MP3, M4A, WAV, etc.).');
        return;
      }
      
      setAudioFile(file);
      setRecordedBlob(null);
      setRecordedUrl(URL.createObjectURL(file));
      setTranscriptionError(null);

      // Extract file duration instantly in browser!
      try {
        const audioHelper = new Audio(URL.createObjectURL(file));
        audioHelper.addEventListener('loadedmetadata', () => {
          if (audioHelper.duration && !isNaN(audioHelper.duration)) {
            setFileDuration(formatTime(Math.round(audioHelper.duration)));
          }
        });
      } catch (e) {
        console.error("Failed to estimate audio duration.", e);
      }
    }
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const cancelTranscription = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const processTranscription = async () => {
    const targetBlob = recordedBlob || audioFile;
    if (!targetBlob) {
      setTranscriptionError('Selecione um arquivo de áudio ou faça uma gravação de voz primeiro.');
      return;
    }

    setIsTranscribing(true);
    setTranscriptionError(null);
    setLoaderMessageIndex(0);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Offline local compression for large files and recordings
      let finalBlob = targetBlob;
      try {
        finalBlob = await compressAudioFile(targetBlob, (msg) => {
          setCompressionProgress(msg);
        });
      } catch (compressionErr) {
        console.warn("Local compression had an issue, proceeding with original audio:", compressionErr);
      } finally {
        setCompressionProgress(null);
      }

      if (controller.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      // Convert optimized audio blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const res = reader.result as string;
          const base64 = res.split(',')[1] || res;
          resolve(base64);
        };
        reader.onerror = reject;
        controller.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
      reader.readAsDataURL(finalBlob);
      const base64AudioData = await base64Promise;

      if (controller.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const mimeType = finalBlob.type || 'audio/wav';
      const resultText = await transcribeAudio(base64AudioData, mimeType, controller.signal);

      // Capture metadata for list creation
      const generatedTitle = audioFile 
        ? audioFile.name.substring(0, audioFile.name.lastIndexOf('.')) 
        : `Gravação de Voz ${new Date().toLocaleDateString('pt-BR')}`;
      
      const durationFormatted = audioFile 
        ? (fileDuration || "Áudio Upload") 
        : formatTime(recordingSeconds);

      // Show original file size to the user to highlight how large of a file was processed!
      const sizeFormatted = audioFile 
        ? `${(audioFile.size / (1024 * 1024)).toFixed(2)} MB`
        : `${(targetBlob.size / 1024).toFixed(0)} KB (Gravação)`;

      onTranscriptionCompleted({
        title: generatedTitle,
        text: resultText,
        audioDuration: durationFormatted,
        fileSize: sizeFormatted
      });

      setSuccessMessage('Transcrição resolvida com sucesso!');
      setTimeout(() => setSuccessMessage(null), 3000);
      
      // Cleanup States
      setRecordedBlob(null);
      setRecordedUrl(null);
      setAudioFile(null);
      setRecordingSeconds(0);
    } catch (error: any) {
      if (error.name === "AbortError" || error.message?.includes("cancelada") || error.message?.includes("Cancelado")) {
        console.log("Transcription aborted by user request.");
        setTranscriptionError("Operação de transcrição cancelada pelo usuário.");
      } else {
        console.error('Erro na transcrição:', error);
        setTranscriptionError(error.message || 'Falha ao transcrever com Gemini. Certifique-se de que o áudio não está corrompido e contém fala legível.');
      }
    } finally {
      setIsTranscribing(false);
      setCompressionProgress(null);
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      
      {/* Intro Header */}
      <div className="text-center space-y-2 py-4">
        <div className="w-16 h-16 bg-indigo-50/70 border border-indigo-100 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-3 shadow-sm">
          <Mic className="w-8 h-8 animate-pulse text-indigo-600" />
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-stone-850 tracking-tight">
          O que deseja transcrever hoje?
        </h2>
        <p className="text-xs sm:text-sm text-stone-550 max-w-md mx-auto leading-relaxed">
          Grave palestras, aulas e áudios em tempo real de forma profissional ou carregue arquivos armazenados no seu celular.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Record Microfone Option */}
        <div className={cn(
          "bg-white border rounded-2xl p-5 flex flex-col items-center justify-center text-center space-y-4 shadow-sm relative overflow-hidden transition-all",
          isRecording ? "border-red-200 ring-2 ring-red-100/60" : "border-stone-200"
        )}>
          <span className="text-[10px] font-bold text-stone-400 tracking-widest uppercase">Grave pelo Microfone</span>

          {isRecording ? (
            <div className="flex flex-col items-center space-y-4 w-full">
              {/* Dynamic responsive audio waves (active only when not paused) */}
              <div className="flex items-end gap-1 h-9 px-2 animate-fade-in">
                <div className={cn("w-1.5 bg-red-500 rounded-full h-5 transition-all", !isPaused && "animate-bounce")} style={{ animationDelay: '0.1s' }} />
                <div className={cn("w-1.5 bg-red-400 rounded-full h-8 transition-all", !isPaused && "animate-bounce")} style={{ animationDelay: '0.3s' }} />
                <div className={cn("w-1.5 bg-red-600 rounded-full h-6 transition-all", !isPaused && "animate-bounce")} style={{ animationDelay: '0.5s' }} />
                <div className={cn("w-1.5 bg-red-500 rounded-full h-9 transition-all", !isPaused && "animate-bounce")} style={{ animationDelay: '0.2s' }} />
                <div className={cn("w-1.5 bg-red-400 rounded-full h-7 transition-all", !isPaused && "animate-bounce")} style={{ animationDelay: '0.4s' }} />
              </div>
              
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-extrabold text-red-600 animate-pulse mb-1">
                  {isPaused ? "GRAVAÇÃO PAUSADA" : "GRAVANDO EM TEMPO REAL"}
                </span>
                <span className="text-sm font-mono font-bold text-red-600 block bg-red-50 px-3 py-1 rounded-full border border-red-100">
                  {formatTime(recordingSeconds)}
                </span>
              </div>

              <div className="flex gap-2 w-full mt-2">
                {/* Pause/Resume Button */}
                <button
                  type="button"
                  onClick={isPaused ? resumeRecording : pauseRecording}
                  className="flex-1 py-2 bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm active:scale-95"
                  title={isPaused ? "Retomar gravação" : "Pausar gravação temporariamente"}
                >
                  {isPaused ? (
                    <>
                      <Play className="w-3 h-3 text-green-600 fill-current" />
                      Retomar
                    </>
                  ) : (
                    <>
                      <Pause className="w-3 h-3 text-stone-600" />
                      Pausar
                    </>
                  )}
                </button>

                {/* Stop & Discard Button */}
                <button
                  type="button"
                  onClick={discardRecording}
                  className="flex-1 py-2 bg-stone-100 hover:bg-red-50 border border-stone-200 hover:border-red-200 hover:text-red-600 text-stone-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm active:scale-95"
                  title="Descartar gravação atual"
                >
                  Descartar
                </button>

                {/* Stop & Save Button */}
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm active:scale-95"
                  title="Parar gravação e preparar para transcrever"
                >
                  <MicOff className="w-3.5 h-3.5" />
                  Finalizar áudio
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-3 w-full">
              <button
                onClick={startRecording}
                disabled={isTranscribing}
                className="w-16 h-16 bg-red-50 hover:bg-red-100/60 text-red-600 rounded-full flex items-center justify-center transition-all shadow-sm hover:scale-105 active:scale-95 disabled:opacity-50 border border-red-100"
                title="Iniciar gravação de voz"
              >
                <Mic className="w-7 h-7 text-red-500" />
              </button>
              <div className="text-xs font-bold text-stone-700">Capturar Voz em Tempo Real</div>
              <p className="text-[10px] text-stone-400 max-w-[160px] mx-auto leading-relaxed">
                Clique para abrir o microfone do celular e gravar palestras ou falas.
              </p>
              
              {recordedBlob && (
                <span className="text-[10px] bg-green-50 text-green-700 font-bold px-3 py-1.5 rounded-full border border-green-200/80 flex items-center gap-1.5 mt-2 animate-bounce">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Áudio Pronto ({formatTime(recordingSeconds)})
                </span>
              )}
            </div>
          )}
        </div>

        {/* Upload Arquivo Option */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col items-center justify-center text-center space-y-4 shadow-sm relative transition-all">
          <span className="text-[10px] font-bold text-stone-400 tracking-widest uppercase">Envie seu arquivo</span>
          
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isRecording || isTranscribing}
            className="w-16 h-16 bg-stone-50 hover:bg-stone-100 text-stone-600 rounded-full flex items-center justify-center transition-all shadow-sm hover:scale-105 active:scale-95 disabled:opacity-50 border border-stone-150"
            title="Importar áudio de reuniões"
          >
            <Upload className="w-7 h-7 text-stone-500" />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="audio/*,video/*"
            className="hidden"
          />
          <div className="text-xs font-bold text-stone-700">
            {audioFile ? audioFile.name : "Selecionar Áudio de Arquivo"}
          </div>
          <p className="text-[10px] text-stone-400 max-w-[165px] mx-auto leading-relaxed">
            Compatível com MP3, M4A, WAV, OGG, WEBM e MP4.
          </p>

          {audioFile && (
            <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-3 py-1.5 rounded-full border border-indigo-150 flex items-center gap-1 mt-2">
              <Check className="w-3.5 h-3.5 text-indigo-600" />
              Pronto ({(audioFile.size / (1024 * 1024)).toFixed(2)} MB)
            </span>
          )}
        </div>
      </div>

      {/* Audio Pre-player and Submit Button */}
      {recordedUrl && (
        <div className="p-4 bg-stone-100/50 border border-stone-200 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-in shadow-inner">
          <div className="flex items-center gap-2.5 w-full md:w-auto">
            <Volume2 className="w-4 h-4 text-stone-450 shrink-0" />
            <audio src={recordedUrl} controls className="h-8 w-full md:w-60" />
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            {/* Clear components state */}
            <button
              onClick={discardRecording}
              disabled={isTranscribing}
              className="px-4 py-2 bg-stone-200 hover:bg-stone-300 border border-stone-300 text-stone-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm active:scale-95"
              title="Excluir gravação ou arquivo selecionado"
            >
              Excluir
            </button>

            <button
              onClick={processTranscription}
              disabled={isTranscribing}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
            >
              {isTranscribing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-indigo-200 animate-pulse" />
                  Iniciar Transcrição Profissional
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Modern dynamic custom transcription progress display */}
      {(isTranscribing || compressionProgress) && (
        <div className="bg-indigo-50/90 border border-indigo-150/45 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-4 shadow-sm animate-pulse">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <h3 className="font-bold text-indigo-950 text-sm">
            {compressionProgress ? "Compactação e Otimização Local" : "Transcrevendo áudio com Inteligência Artificial"}
          </h3>
          <p className="text-xs text-indigo-705 px-3.5 py-1.5 bg-indigo-100/65 border border-indigo-200 rounded-full font-medium transition-all">
            {compressionProgress || `"${loaderMessages[loaderMessageIndex]}"`}
          </p>
          <p className="text-[10px] text-indigo-700/80 max-w-sm mt-1 leading-relaxed">
            {compressionProgress 
              ? "Re-amostrando canais para Mono a 16kHz. Isso reduz o tamanho do áudio em até 20x mantendo 100% da clareza vocal para o Gemini!" 
              : "Suas palavras estão sendo decodificadas em Português-BR fluido, estruturando os blocos lógicos automaticamente."}
          </p>
          
          {/* Real-time transcription cancellation button */}
          <button
            type="button"
            onClick={cancelTranscription}
            className="mt-2 px-5 py-1.5 bg-white border border-red-200 hover:border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-sm active:scale-95"
            title="Abortar envio e processamento"
          >
            Cancelar Transcrição
          </button>
        </div>
      )}

      {/* Success / Error notification fields */}
      {transcriptionError && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5 mt-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs text-red-700 font-medium leading-relaxed">
              {transcriptionError}
            </p>
            <p className="text-[10px] text-stone-500 leading-normal">
              Dica: Se o arquivo for excessivamente grande (ex. palestras com horas de duração), tente dividi-lo em pequenos trechos menores ou garanta que o sinal de conexão de rede está forte para completar o envio dos pacotes.
            </p>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-150 rounded-xl flex items-start gap-2.5">
          <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
          <p className="text-xs text-green-700 font-bold leading-none">
            {successMessage}
          </p>
        </div>
      )}

    </div>
  );
}
