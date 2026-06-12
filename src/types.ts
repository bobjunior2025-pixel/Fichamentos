export interface TranscriptionItem {
  id: string;
  title: string;
  text: string;
  summary?: string;
  keyTopics?: string[];
  audioDuration?: string;
  fileSize?: string;
  createdAt: number;
  updatedAt: number;
}
