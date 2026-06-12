import jsPDF from 'jspdf';
import { TranscriptionItem } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export async function exportTranscriptionToPdf(item: TranscriptionItem) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - (margin * 2);
  let y = margin;

  // Helper for text wrapping and adding to Y with page break checks
  const addText = (text: string, fontSize: number, isBold = false, spacing = 6, color = 0) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(text, contentWidth);
    
    // Check if printing lines will exceed page height
    const expectedHeight = lines.length * (fontSize * 0.3527) + spacing;
    if (y + expectedHeight > 275) {
      doc.addPage();
      y = margin;
    }
    
    doc.text(lines, margin, y);
    y += expectedHeight;
  };

  // Header banner info
  doc.setFontSize(9);
  doc.setTextColor(150);
  doc.text(`Transcrição gerada em ${format(item.createdAt, 'dd/MM/yyyy HH:mm', { locale: ptBR })} com Gemini IA`, margin, y);
  y += 10;

  // Title
  addText(item.title || 'Gravação de Voz', 20, true, 8, 0);

  // Stats (Size/Dur)
  if (item.audioDuration || item.fileSize) {
    const stats: string[] = [];
    if (item.audioDuration) stats.push(`Duração: ${item.audioDuration}`);
    if (item.fileSize) stats.push(`Tamanho: ${item.fileSize}`);
    addText(stats.join(' • '), 10, false, 8, 120);
  }

  // Divider
  doc.setDrawColor(230);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  // AI Summary if available
  if (item.summary) {
    addText('RESUMO INTELIGENTE (IA)', 13, true, 5, 79); // Indico-ish/slate tone
    addText(item.summary, 10, false, 8, 50);
    
    if (item.keyTopics && item.keyTopics.length > 0) {
      addText('PRINCIPAIS TÓPICOS', 11, true, 5, 79);
      item.keyTopics.forEach((topic) => {
        addText(`• ${topic}`, 10, false, 4, 60);
      });
      y += 4;
    }
    
    // Divider
    doc.setDrawColor(240);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;
  }

  // Full Transcription Content
  addText('TRANSCRIÇÃO COMPLETA', 13, true, 6, 30);
  addText(item.text || 'Nenhuma transcrição disponível.', 10, false, 6, 40);

  // Footer page numbers
  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
  }

  const cleanName = (item.title || 'transcricao')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
    
  doc.save(`transcricao-${cleanName}.pdf`);
}

export function exportTranscriptionToTxt(item: TranscriptionItem) {
  const dateFormatted = format(item.createdAt, 'dd/MM/yyyy HH:mm', { locale: ptBR });
  
  let content = `================================================================================
TRANSCRITOR DE ÁUDIO IA - RELATÓRIO DE TRANSCRIÇÃO
================================================================================
Título: ${item.title || 'Gravação Sem Título'}
Data: ${dateFormatted}
${item.audioDuration ? `Duração: ${item.audioDuration}\n` : ''}${item.fileSize ? `Tamanho: ${item.fileSize}\n` : ''}
================================================================================
`;

  if (item.summary) {
    content += `
--------------------------------------------------------------------------------
RESUMO INTELIGENTE
--------------------------------------------------------------------------------
${item.summary}

--------------------------------------------------------------------------------
PRINCIPAIS TÓPICOS DISCUTIDOS
--------------------------------------------------------------------------------
${item.keyTopics && item.keyTopics.length > 0 
  ? item.keyTopics.map(t => `• ${t}`).join('\n') 
  : 'Nenhum tópico listado.'}

================================================================================
`;
  }

  content += `
--------------------------------------------------------------------------------
TRANSCRIÇÃO COMPLETA
--------------------------------------------------------------------------------
${item.text || 'Nenhum texto disponível.'}

--------------------------------------------------------------------------------
Gerado automaticamente com assistência de IA de Alta Precisão (Gemini).
`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  
  const cleanName = (item.title || 'transcricao')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
    
  link.download = `transcricao-${cleanName}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
