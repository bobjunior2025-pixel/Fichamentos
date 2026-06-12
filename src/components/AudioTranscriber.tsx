import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, Upload, Volume2, Play, Pause, RefreshCw, 
  Sparkles, FileText, Check, AlertCircle, Loader2, Info, CheckCircle, Radio
} from 'lucide-react';
import { transcribeAudio } from '../services/gemini';
import { cn } from '../lib/utils';

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
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  
  // File Upload State
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<string | null>(null);
  
  // Status State
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (isRecording) {
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
  }, [isRecording]);

  const startRecording = async () => {
    setTranscriptionError(null);
    setAudioFile(null);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordingSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: mimeType });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        
        // Stop all tracks to turn off mic light
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error('Error opening microphone:', err);
      setTranscriptionError('Não foi possível acessar o seu microfone. Verifique as configurações de segurança do navegador.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
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

  const processTranscription = async () => {
    const targetBlob = recordedBlob || audioFile;
    if (!targetBlob) {
      setTranscriptionError('Selecione um arquivo de áudio ou faça uma gravação de voz primeiro.');
      return;
    }

    setIsTranscribing(true);
    setTranscriptionError(null);
    setLoaderMessageIndex(0);

    try {
      // Convert audio blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const res = reader.result as string;
          const base64 = res.split(',')[1] || res;
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(targetBlob);
      const base64AudioData = await base64Promise;

      const mimeType = targetBlob.type || 'audio/webm';
      const resultText = await transcribeAudio(base64AudioData, mimeType);

      // Capture metadata for list creation
      const generatedTitle = audioFile 
        ? audioFile.name.substring(0, audioFile.name.lastIndexOf('.')) 
        : `Gravação de Voz ${new Date().toLocaleDateString('pt-BR')}`;
      
      const durationFormatted = audioFile 
        ? (fileDuration || "Áudio Upload") 
        : formatTime(recordingSeconds);

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
      console.error('Erro na transcrição:', error);
      setTranscriptionError(error.message || 'Falha ao transcrever com Gemini. Certifique-se de que o áudio não está corrompido e contém fala legível.');
    } finally {
      setIsTranscribing(false);
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
              {/* Dynamic responsive audio waves */}
              <div className="flex items-end gap-1 h-9 px-2">
                <div className="w-1.5 bg-red-500 rounded-full animate-bounce h-5" style={{ animationDelay: '0.1s' }} />
                <div className="w-1.5 bg-red-400 rounded-full animate-bounce h-8" style={{ animationDelay: '0.3s' }} />
                <div className="w-1.5 bg-red-650 rounded-full animate-bounce h-6" style={{ animationDelay: '0.5s' }} />
                <div className="w-1.5 bg-red-500 rounded-full animate-bounce h-9" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 bg-red-400 rounded-full animate-bounce h-7" style={{ animationDelay: '0.4s' }} />
              </div>
              
              <span className="text-sm font-mono font-bold text-red-550 block bg-red-50 px-3 py-1 rounded-full border border-red-100">
                {formatTime(recordingSeconds)}
              </span>

              <button
                onClick={stopRecording}
                className="w-full py-2.5 bg-red-550 hover:bg-red-600 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
              >
                <MicOff className="w-4 h-4" /> Parar Gravação
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-3 w-full">
              <button
                onClick={startRecording}
                disabled={isTranscribing}
                className="w-16 h-16 bg-red-50 hover:bg-red-100/60 text-red-650 rounded-full flex items-center justify-center transition-all shadow-sm hover:scale-105 active:scale-95 disabled:opacity-50 border border-red-100"
                title="Iniciar gravação de voz"
              >
                <Mic className="w-7 h-7 text-red-500" />
              </button>
              <div className="text-xs font-bold text-stone-700">Capturar Voz em Tempo Real</div>
              <p className="text-[10px] text-stone-400 max-w-[160px] mx-auto leading-relaxed">
                Clique para abrir o microfone do celular e palestrar.
              </p>
              
              {recordedBlob && (
                <span className="text-[10px] bg-green-50 text-green-700 font-bold px-3 py-1.5 rounded-full border border-green-200/80 flex items-center gap-1.5 mt-2 animate-bounce">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Gravado ({formatTime(recordingSeconds)})
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

          <button
            onClick={processTranscription}
            disabled={isTranscribing}
            className="w-full md:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
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
      )}

      {/* Modern dynamic custom transcription progress display */}
      {isTranscribing && (
        <div className="bg-indigo-50/90 border border-indigo-150/45 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-4 shadow-sm animate-pulse">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <h3 className="font-bold text-indigo-950 text-sm">Transcrevendo áudio com Inteligência Artificial</h3>
          <p className="text-xs text-indigo-705 px-3 py-1 bg-indigo-100/60 rounded-full font-medium transition-all">
            "{loaderMessages[loaderMessageIndex]}"
          </p>
        </div>
      )}

      {/* Success / Error notification fields */}
      {transcriptionError && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 font-medium leading-relaxed">
            {transcriptionError}
          </p>
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
