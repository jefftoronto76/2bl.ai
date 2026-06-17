// Active transcription provider — swap this import to change providers.
export type { TranscriptionResult } from './types';
export { transcribeAudio } from './providers/deepgram';
