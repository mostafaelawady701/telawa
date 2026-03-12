export interface User {
  uid: string;
  displayName?: string;
  photoURL?: string;
  isAnonymous?: boolean;
  createdAt: number;
}

export interface Room {
  id: string;
  name: string;
  hostId: string;
  status: 'waiting' | 'playing';
  currentRoundId?: string;
  participants: string[];
  readyUsers?: string[]; // New field
  maxParticipants?: number;
  recordingDuration?: number;
  theme?: {
    color?: string;
    backgroundImage?: string;
  };
  createdAt: number;
}

export interface Round {
  id: string;
  roomId: string;
  verseText: string;
  surahName: string;
  ayahNumber: number;
  status: 'countdown' | 'recording' | 'reviewing' | 'finished';
  activeRecorderId?: string;
  countdownStartTime?: number; // New field
  createdAt: number;
}

export interface Recording {
  id: string;
  roomId: string;
  roundId: string;
  userId: string;
  userName: string;
  audioData: string;
  duration?: number;
  feedback?: string;
  likes?: string[];
  score?: number;
  createdAt: number;
}
