import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc, deleteDoc, collection, addDoc, query, orderBy, getDocs, arrayUnion, arrayRemove } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import { Room, Round, Recording, User } from '../types';
import { Mic, Square, Play, Download, Users, Settings, Loader2, Trophy, Clock, Sparkles, X, Heart, Volume2, Star, Share2, Check, Shuffle, BookOpen, Radio, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Waveform from '../components/Waveform';
import RatingModal from '../components/RatingModal';
import confetti from 'canvas-confetti';

import { useLiveAudio } from '../hooks/useLiveAudio';

export default function RoomView({ user }: { user: FirebaseUser }) {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const latestRoomRef = useRef<Room | null>(null);

  useEffect(() => {
    latestRoomRef.current = room;
  }, [room]);
  const [round, setRound] = useState<Round | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [participants, setParticipants] = useState<User[]>([]);

  // Fetch Room Data
  useEffect(() => {
    if (!roomId) return;
    const roomRef = doc(db, 'rooms', roomId);
    
    // Join Room & Save Profile
    const joinRoom = async () => {
      try {
        await updateDoc(roomRef, {
          participants: arrayUnion(user.uid)
        });
        // Save/Update user profile in a global users collection
        await updateDoc(doc(db, 'users', user.uid), {
          displayName: user.displayName || 'ضيف',
          photoURL: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
          lastSeen: Date.now()
        }).catch(async (err) => {
          // If doc doesn't exist, create it
          if (err.code === 'not-found') {
            await addDoc(collection(db, 'users'), {
              uid: user.uid,
              displayName: user.displayName || 'ضيف',
              photoURL: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
              createdAt: Date.now()
            });
          }
        });
      } catch (error) {
        console.error("Error joining room:", error);
      }
    };
    joinRoom();

    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        setRoom({ id: docSnap.id, ...docSnap.data() } as Room);
      } else {
        navigate('/dashboard');
      }
      setLoading(false);
    }, (error) => {
      console.error("Error listening to room:", error);
    });

    return () => {
      unsubscribe();
      // Leave Room
      if (latestRoomRef.current && latestRoomRef.current.participants.length <= 1) {
        deleteDoc(roomRef).catch(console.error);
      } else {
        updateDoc(roomRef, {
          participants: arrayRemove(user.uid),
          readyUsers: arrayRemove(user.uid)
        }).catch(console.error);
      }
    };
  }, [roomId, user.uid, navigate, user.displayName, user.photoURL]);

  // Fetch Participant Details
  useEffect(() => {
    if (!room?.participants || room.participants.length === 0) return;
    
    const fetchParticipants = async () => {
      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef);
        const querySnapshot = await getDocs(q);
        const allUsers = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        
        const roomParticipants = room.participants.map(uid => {
          const found = allUsers.find(u => u.uid === uid);
          return found || { uid, displayName: 'مشارك', photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}` };
        });
        
        setParticipants(roomParticipants);
      } catch (error) {
        console.error("Error fetching participants:", error);
      }
    };
    fetchParticipants();
  }, [room?.participants]);

  // Fetch Round Data
  useEffect(() => {
    if (!room?.currentRoundId || !roomId) {
      setRound(null);
      return;
    }
    const roundRef = doc(db, 'rooms', roomId, 'rounds', room.currentRoundId);
    const unsubscribe = onSnapshot(roundRef, (docSnap) => {
      if (docSnap.exists()) {
        setRound({ id: docSnap.id, ...docSnap.data() } as Round);
      }
    }, (error) => {
      console.error("Error listening to round:", error);
    });
    return unsubscribe;
  }, [room?.currentRoundId, roomId]);

  // Fetch Recordings Data
  useEffect(() => {
    if (!room?.currentRoundId || !roomId) {
      setRecordings([]);
      return;
    }
    const recsRef = collection(db, 'rooms', roomId, 'recordings');
    const q = query(recsRef, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recs = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Recording))
        .filter(r => r.roundId === room.currentRoundId);
      setRecordings(recs);
    }, (error) => {
      console.error("Error listening to recordings:", error);
    });
    return unsubscribe;
  }, [room?.currentRoundId, roomId]);

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);
  const [editMaxParticipants, setEditMaxParticipants] = useState(10);
  const [editRecordingDuration, setEditRecordingDuration] = useState(60);
  const [editThemeColor, setEditThemeColor] = useState('emerald');
  const [editThemeBg, setEditThemeBg] = useState('');
  const [echoEnabled, setEchoEnabled] = useState(true);
  const [copied, setCopied] = useState(false);
  const [sortBy, setSortBy] = useState<'time' | 'likes' | 'score'>('time');
  
  // Verse Selection State
  const [verseSelectionMode, setVerseSelectionMode] = useState<'random' | 'manual'>('random');
  const [manualSurah, setManualSurah] = useState(1);
  const [manualAyah, setManualAyah] = useState(1);
  const [isStartingRound, setIsStartingRound] = useState(false);

  // Visualizer State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (room) {
      setEditMaxParticipants(room.maxParticipants || 10);
      setEditRecordingDuration(room.recordingDuration || 60);
      setEditThemeColor(room.theme?.color || 'emerald');
      setEditThemeBg(room.theme?.backgroundImage || '');
    }
  }, [room, isSettingsOpen]);

  const saveSettings = async () => {
    if (!roomId) return;
    try {
      await updateDoc(doc(db, 'rooms', roomId), {
        maxParticipants: editMaxParticipants,
        recordingDuration: editRecordingDuration,
        theme: {
          color: editThemeColor,
          backgroundImage: editThemeBg
        }
      });
      setIsSettingsOpen(false);
    } catch (error) {
      console.error("Error saving settings:", error);
      if (error instanceof Error) {
        alert(`فشل حفظ الإعدادات: ${error.message}`);
      } else {
        alert("فشل حفظ الإعدادات.");
      }
    }
  };

  const getColorClasses = (color: string) => {
    switch(color) {
      case 'blue': return { text: 'text-blue-500', bg: 'bg-blue-600', hoverBg: 'hover:bg-blue-500', border: 'border-blue-500', glow: 'shadow-blue-900/20', lightBg: 'bg-blue-500/20', lightText: 'text-blue-400' };
      case 'purple': return { text: 'text-purple-500', bg: 'bg-purple-600', hoverBg: 'hover:bg-purple-500', border: 'border-purple-500', glow: 'shadow-purple-900/20', lightBg: 'bg-purple-500/20', lightText: 'text-purple-400' };
      case 'rose': return { text: 'text-rose-500', bg: 'bg-rose-600', hoverBg: 'hover:bg-rose-500', border: 'border-rose-500', glow: 'shadow-rose-900/20', lightBg: 'bg-rose-500/20', lightText: 'text-rose-400' };
      case 'amber': return { text: 'text-amber-500', bg: 'bg-amber-600', hoverBg: 'hover:bg-amber-500', border: 'border-amber-500', glow: 'shadow-amber-900/20', lightBg: 'bg-amber-500/20', lightText: 'text-amber-400' };
      default: return { text: 'text-emerald-500', bg: 'bg-emerald-600', hoverBg: 'hover:bg-emerald-500', border: 'border-emerald-500', glow: 'shadow-emerald-900/20', lightBg: 'bg-emerald-500/20', lightText: 'text-emerald-400' };
    }
  };

  const theme = getColorClasses(room?.theme?.color || 'emerald');

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const handleGetFeedback = async (recording: Recording) => {
    if (!roomId) return;
    setAnalyzingId(recording.id);
    try {
      // Extract mimeType from base64 string
      const mimeTypeMatch = recording.audioData.match(/data:(.*?);base64/);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'audio/webm';
      
      const feedback = "تمت التلاوة بنجاح.";
      
      await updateDoc(doc(db, 'rooms', roomId, 'recordings', recording.id), {
        feedback
      });
    } catch (error) {
      console.error("Error getting feedback:", error);
      alert("فشل الحصول على التقييم. يرجى المحاولة مرة أخرى.");
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleLike = async (recording: Recording) => {
    if (!roomId) return;
    try {
      const recRef = doc(db, 'rooms', roomId, 'recordings', recording.id);
      const hasLiked = recording.likes?.includes(user.uid);
      
      if (hasLiked) {
        await updateDoc(recRef, {
          likes: arrayRemove(user.uid)
        });
      } else {
        await updateDoc(recRef, {
          likes: arrayUnion(user.uid)
        });
      }
    } catch (error) {
      console.error("Error liking recording:", error);
    }
  };

  const handleScore = async (recording: Recording, score: number) => {
    if (!roomId || !isHost) return;
    try {
      const recRef = doc(db, 'rooms', roomId, 'recordings', recording.id);
      await updateDoc(recRef, { score });
    } catch (error) {
      console.error("Error scoring recording:", error);
    }
  };

  const handleSubmitRating = async (rating: number) => {
    if (!roomId || !activeRecordingId) return;
    try {
      await updateDoc(doc(db, 'rooms', roomId, 'recordings', activeRecordingId), {
        rating
      });
      setIsRatingModalOpen(false);
      setActiveRecordingId(null);
    } catch (error) {
      console.error("Error saving rating:", error);
    }
  };

  const isHost = room?.hostId === user.uid;

  const { isLive, startLive, stopLive, joinLive, remoteStreams } = useLiveAudio(roomId, user.uid, isHost);

  // Calculate Leaderboard
  const leaderboard = useMemo(() => {
    const userScores: Record<string, { name: string, totalScore: number, recCount: number }> = {};
    
    recordings.forEach(rec => {
      if (rec.score !== undefined) {
        if (!userScores[rec.userId]) {
          userScores[rec.userId] = { name: rec.userName, totalScore: 0, recCount: 0 };
        }
        userScores[rec.userId].totalScore += rec.score;
        userScores[rec.userId].recCount += 1;
      }
    });

    return Object.values(userScores)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 5); // Top 5
  }, [recordings]);

  // Calculate Round Results (Top 3 for current round)
  const roundResults = useMemo(() => {
    if (!round || (round.status !== 'reviewing' && round.status !== 'finished')) return [];
    
    const roundRecs = recordings.filter(r => r.roundId === round.id && r.score !== undefined);
    return roundRecs
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 3);
  }, [recordings, round]);

  const finishRound = async () => {
    if (!roomId || !room?.currentRoundId || !isHost) return;
    await updateDoc(doc(db, 'rooms', roomId, 'rounds', room.currentRoundId), {
      status: 'finished'
    });
  };

  // Confetti effect when round finishes
  useEffect(() => {
    if (round?.status === 'finished') {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);

      return () => clearInterval(interval);
    }
  }, [round?.status]);

  const sortedRecordings = useMemo(() => {
    return [...recordings].sort((a, b) => {
      if (sortBy === 'likes') {
        const aLikes = a.likes?.length || 0;
        const bLikes = b.likes?.length || 0;
        if (bLikes !== aLikes) return bLikes - aLikes;
      }
      if (sortBy === 'score') {
        const aScore = a.score || 0;
        const bScore = b.score || 0;
        if (bScore !== aScore) return bScore - aScore;
      }
      // default: time (already sorted by createdAt desc from firestore)
      return b.createdAt - a.createdAt;
    });
  }, [recordings, sortBy]);

  const handleReady = async () => {
    if (!roomId) return;
    try {
      const roomRef = doc(db, 'rooms', roomId);
      const isReady = room?.readyUsers?.includes(user.uid);
      if (isReady) {
        await updateDoc(roomRef, { readyUsers: arrayRemove(user.uid) });
      } else {
        await updateDoc(roomRef, { readyUsers: arrayUnion(user.uid) });
      }
    } catch (error) {
      console.error("Error toggling ready state:", error);
    }
  };

  const startNewRound = async () => {
    if (!roomId || !isHost) return;
    setIsStartingRound(true);
    try {
      let verses = [];
      let surahName = '';
      let ayahNumber = 0;

      if (verseSelectionMode === 'random') {
        const randomAyah = Math.floor(Math.random() * 6236) + 1;
        const res = await fetch(`https://api.alquran.cloud/v1/ayah/${randomAyah}/quran-uthmani`);
        const data = await res.json();
        verses.push(data.data.text);
        surahName = data.data.surah.name;
        ayahNumber = data.data.numberInSurah;

        // If the verse is short, fetch the next one too
        if (data.data.text.length < 100 && randomAyah < 6236) {
          const res2 = await fetch(`https://api.alquran.cloud/v1/ayah/${randomAyah + 1}/quran-uthmani`);
          const data2 = await res2.json();
          verses.push(data2.data.text);
        }
      } else {
        const res = await fetch(`https://api.alquran.cloud/v1/ayah/${manualSurah}:${manualAyah}/quran-uthmani`);
        const data = await res.json();
        if (data.code !== 200) throw new Error("الآية غير موجودة");
        verses.push(data.data.text);
        surahName = data.data.surah.name;
        ayahNumber = data.data.numberInSurah;
      }

      const roundRef = await addDoc(collection(db, 'rooms', roomId, 'rounds'), {
        roomId,
        verseText: verses.join(' * '),
        surahName,
        ayahNumber,
        status: 'countdown',
        countdownStartTime: Date.now() + 5000, // 5 seconds from now
        createdAt: Date.now()
      });

      await updateDoc(doc(db, 'rooms', roomId), {
        status: 'playing',
        currentRoundId: roundRef.id,
        readyUsers: [] // Reset ready state for next round
      });

    } catch (error) {
      console.error("Error starting round:", error);
      alert("حدث خطأ أثناء جلب الآية. تأكد من صحة رقم السورة والآية.");
    } finally {
      setIsStartingRound(false);
    }
  };

  const endRound = async () => {
    if (!roomId || !room?.currentRoundId || !isHost) return;
    await updateDoc(doc(db, 'rooms', roomId, 'rounds', room.currentRoundId), {
      status: 'reviewing'
    });
  };

  // Countdown Logic
  const [localCountdown, setLocalCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (round?.status === 'countdown' && round.countdownStartTime) {
      const interval = setInterval(async () => {
        const remaining = Math.max(0, Math.ceil((round.countdownStartTime! - Date.now()) / 1000));
        setLocalCountdown(remaining);
        
        if (remaining === 0 && isHost) {
          clearInterval(interval);
          await updateDoc(doc(db, 'rooms', roomId!, 'rounds', round.id), {
            status: 'recording'
          });
        }
      }, 500);
      return () => clearInterval(interval);
    } else {
      setLocalCountdown(null);
    }
  }, [round?.status, round?.countdownStartTime, isHost, roomId, round?.id]);

  const claimRecording = async () => {
    if (!roomId || !round || round.status !== 'recording' || round.activeRecorderId) return;
    try {
      await updateDoc(doc(db, 'rooms', roomId, 'rounds', round.id), {
        activeRecorderId: user.uid
      });
      startRecording();
    } catch (error) {
      console.error("Failed to claim recording:", error);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      let finalStream = stream;
      let audioCtx: AudioContext | null = null;
      let analyser: AnalyserNode | null = null;

      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      if (echoEnabled) {
        const destination = audioCtx.createMediaStreamDestination();
        
        // Professional Mosque Reverb using ConvolverNode
        const convolver = audioCtx.createConvolver();
        
        // Generate a synthetic impulse response for a large hall/mosque
        const duration = 2.5; // 2.5 seconds reverb tail
        const decay = 2.0;
        const sampleRate = audioCtx.sampleRate;
        const length = sampleRate * duration;
        const impulse = audioCtx.createBuffer(2, length, sampleRate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);
        
        for (let i = 0; i < length; i++) {
          const multiplier = Math.pow(1 - i / length, decay);
          left[i] = (Math.random() * 2 - 1) * multiplier;
          right[i] = (Math.random() * 2 - 1) * multiplier;
        }
        convolver.buffer = impulse;
        
        const wetGain = audioCtx.createGain();
        wetGain.gain.value = 0.25; // 25% reverb volume
        
        const dryGain = audioCtx.createGain();
        dryGain.gain.value = 1.0; // 100% original voice
        
        // Lowpass filter to make the reverb sound warm and natural (not harsh)
        const filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.value = 2000; 

        // Routing
        const masterGain = audioCtx.createGain();
        
        source.connect(dryGain);
        dryGain.connect(masterGain);
        
        source.connect(filterNode);
        filterNode.connect(convolver);
        convolver.connect(wetGain);
        wetGain.connect(masterGain);
        
        // Connect to analyser for visualization and destination for recording
        masterGain.connect(analyser);
        masterGain.connect(destination);

        finalStream = destination.stream;
      } else {
        source.connect(analyser);
      }

      // Start visualizer
      const drawVisualizer = () => {
        if (!canvasRef.current || !analyserRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = dataArray[i] / 2;
          ctx.fillStyle = `rgb(${barHeight + 100}, 200, 150)`;
          ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
          x += barWidth + 1;
        }

        animationRef.current = requestAnimationFrame(drawVisualizer);
      };
      drawVisualizer();

      const options: MediaRecorderOptions = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 64000 } 
        : { audioBitsPerSecond: 64000 };
      const mediaRecorder = new MediaRecorder(finalStream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          
          // Check size before saving (Firestore limit is 1MB, ~1,048,576 bytes)
          // base64 string size is roughly 4/3 of the original size
          const sizeInBytes = new Blob([base64Audio]).size;
          if (sizeInBytes > 1000000) {
            alert("حجم التسجيل كبير جداً. يرجى تسجيل مقطع أقصر.");
            return;
          }

          if (roomId && round) {
            try {
              const docRef = await addDoc(collection(db, 'rooms', roomId, 'recordings'), {
                roomId,
                roundId: round.id,
                userId: user.uid,
                userName: user.displayName || 'ضيف',
                audioData: base64Audio,
                duration: recordingTime,
                likes: [],
                createdAt: Date.now()
              });
              setActiveRecordingId(docRef.id);
              setIsRatingModalOpen(true);
            } catch (err) {
              console.error("Error saving recording:", err);
              alert("حدث خطأ أثناء حفظ التسجيل. قد يكون حجم الملف كبيراً جداً.");
            }
          }
          // Stop all tracks
          stream.getTracks().forEach(track => track.stop());
          if (audioCtx) audioCtx.close();
          if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      const maxDuration = room?.recordingDuration || 60;
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= maxDuration) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("الوصول إلى الميكروفون مرفوض أو غير متاح.");
      // Release claim if failed
      if (roomId && round) {
        await updateDoc(doc(db, 'rooms', roomId, 'rounds', round.id), {
          activeRecorderId: null
        });
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  if (loading || !room) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-emerald-500"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div 
      className="min-h-screen bg-slate-50 text-slate-900 flex flex-col relative selection:bg-emerald-500/30 overflow-x-hidden"
    >
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className={`absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-100 blur-[150px] rounded-full opacity-20`} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-100 blur-[150px] rounded-full opacity-20" />
      </div>

      <div className="relative z-10 flex flex-col flex-1">
        {/* Header */}
        <header className="sticky top-0 z-50 glass border-b border-slate-200 h-20">
          <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl ${theme.bg} flex items-center justify-center shadow-lg ${theme.glow}`}>
                <Radio className="text-white w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gradient">{room.name}</h1>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Users className="w-3 h-3" />
                  <span>{participants.length} مشاركين</span>
                  {isHost && <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">المضيف</span>}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={isHost ? (isLive ? stopLive : startLive) : joinLive}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-300 ${
                  isLive 
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse' 
                    : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
                }`}
                title={isHost ? (isLive ? "إيقاف البث المباشر" : "بدء بث مباشر") : "انضمام للبث المباشر"}
              >
                <Radio className={`w-4 h-4 ${isLive ? 'animate-pulse' : ''}`} />
                <span className="text-xs font-bold">{isLive ? 'مباشر' : 'بث مباشر'}</span>
              </button>
              <button
                onClick={handleShare}
                className="p-2.5 rounded-xl glass hover:bg-white/10 text-slate-300 transition-all duration-300"
                title="مشاركة المجلس"
              >
                {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Share2 className="w-5 h-5" />}
              </button>
              {isHost && (
                <button 
                  onClick={() => setIsSettingsOpen(true)} 
                  className="p-2.5 rounded-xl glass hover:bg-white/10 text-slate-300 transition-all duration-300"
                >
                  <Settings className="w-5 h-5" />
                </button>
              )}
              <button 
                onClick={() => navigate('/dashboard')} 
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-white/10 transition-all duration-300 text-sm font-medium"
              >
                مغادرة
              </button>
            </div>
          </div>
        </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 flex flex-col gap-8">
        
        {/* Participant List & Ready Bar */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-[2rem] p-4 flex items-center justify-between overflow-hidden relative"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent pointer-events-none" />
          
          <div className="flex items-center gap-4 overflow-x-auto no-scrollbar relative z-10">
            <div className="flex -space-x-3">
              {participants.map((p) => (
                <motion.div 
                  key={p.uid} 
                  layout
                  className="relative group"
                >
                  <div className={`relative p-0.5 rounded-full transition-all duration-500 ${room?.readyUsers?.includes(p.uid) ? 'bg-gradient-to-tr from-emerald-500 to-teal-400 scale-110 shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-white/10'}`}>
                    <img 
                      src={p.photoURL} 
                      alt={p.displayName} 
                      className={`w-10 h-10 rounded-full border-2 border-slate-900 object-cover ${room?.readyUsers?.includes(p.uid) ? 'animate-pulse' : ''}`}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="absolute -bottom-1 -right-1">
                    {room?.readyUsers?.includes(p.uid) ? (
                      <div className="bg-emerald-500 rounded-full p-1 border-2 border-slate-900 shadow-lg">
                        <Check className="w-2 h-2 text-white" />
                      </div>
                    ) : (
                      <div className="bg-slate-700 rounded-full p-1 border-2 border-slate-900">
                        <Clock className="w-2 h-2 text-white" />
                      </div>
                    )}
                  </div>
                  
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-3 py-1.5 glass-dark text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap z-50 pointer-events-none translate-y-2 group-hover:translate-y-0">
                    {p.displayName} {room?.readyUsers?.includes(p.uid) ? '(مستعد)' : ''}
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="text-sm font-medium text-slate-400 whitespace-nowrap">
              <span className="text-white font-bold">{participants.length}</span> مشارك في المجلس
            </div>
          </div>

          {room?.status === 'waiting' && (
            <button
              onClick={handleReady}
              className={`relative z-10 px-8 py-3 rounded-2xl font-bold transition-all duration-500 transform hover:scale-105 active:scale-95 flex items-center gap-3 ${
                room?.readyUsers?.includes(user.uid) 
                  ? 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]' 
                  : 'bg-white/10 text-white border border-white/10 hover:bg-white/20'
              }`}
            >
              {room?.readyUsers?.includes(user.uid) ? (
                <>
                  <Check className="w-5 h-5" />
                  <span>أنا مستعد</span>
                </>
              ) : (
                <>
                  <Clock className="w-5 h-5 animate-pulse" />
                  <span>تأكيد الاستعداد</span>
                </>
              )}
            </button>
          )}
        </motion.div>
        
        {/* Game Area */}
        <motion.div 
          layout
          className="glass rounded-[2.5rem] p-8 min-h-[450px] flex flex-col items-center justify-center relative overflow-hidden group"
        >
          {/* Background Decoration */}
          <div className={`absolute top-0 left-0 w-full h-1.5 ${theme.bg} opacity-30 group-hover:opacity-60 transition-opacity duration-500`}></div>
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/5 blur-[100px] rounded-full" />
          <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-white/5 blur-[100px] rounded-full" />
          
          {room?.status === 'waiting' ? (
            <div className="text-center space-y-8 max-w-md relative z-10 w-full">
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`w-24 h-24 mx-auto rounded-3xl ${theme.lightBg} flex items-center justify-center mb-6 shadow-2xl rotate-3 relative`}
              >
                <Users className={`w-12 h-12 ${theme.text}`} />
                {room.readyUsers && room.readyUsers.length > 0 && (
                  <div className="absolute -top-2 -right-2 bg-emerald-500 text-white text-xs font-black w-8 h-8 rounded-full flex items-center justify-center border-4 border-slate-900 shadow-xl">
                    {room.readyUsers.length}
                  </div>
                )}
              </motion.div>
              <div className="space-y-4">
                <h2 className="text-4xl font-black text-gradient">بانتظار المجموعة</h2>
                
                {/* Readiness Progress Bar */}
                <div className="w-full max-w-xs mx-auto space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <span>نسبة الاستعداد</span>
                    <span>{Math.round(((room.readyUsers?.length || 0) / participants.length) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${((room.readyUsers?.length || 0) / participants.length) * 100}%` }}
                      className={`h-full ${theme.bg} shadow-[0_0_10px_rgba(255,255,255,0.2)]`}
                    />
                  </div>
                </div>

                <p className="text-slate-400 font-medium">
                  {isHost 
                    ? `استعد لبدء الجولة. ${room.readyUsers?.length || 0} من ${participants.length} مستعدون.`
                    : room?.readyUsers?.includes(user.uid)
                      ? "أنت مستعد! بانتظار بقية اللاعبين والمضيف..."
                      : "يرجى الضغط على زر الاستعداد ليعرف المضيف أنك جاهز."
                  }
                </p>
              </div>

              {isHost && (
                <div className="space-y-6 w-full pt-4">
                  <div className="glass-dark p-6 rounded-[2rem] border border-white/5 text-right space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">إعدادات الجولة</span>
                      <Sparkles className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex gap-2 p-1 bg-black/40 rounded-2xl border border-white/5">
                      <button
                        onClick={() => setVerseSelectionMode('random')}
                        className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${verseSelectionMode === 'random' ? 'bg-white/10 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        عشوائي
                      </button>
                      <button
                        onClick={() => setVerseSelectionMode('manual')}
                        className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${verseSelectionMode === 'manual' ? 'bg-white/10 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        يدوي
                      </button>
                    </div>
                    {verseSelectionMode === 'manual' && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="flex gap-4 pt-2"
                      >
                        <div className="flex-1 space-y-1.5">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">رقم السورة</label>
                          <input 
                            type="number" 
                            min="1" max="114" 
                            value={manualSurah}
                            onChange={(e) => setManualSurah(Number(e.target.value))}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white text-center text-sm focus:ring-2 focus:ring-white/10 outline-none transition-all"
                          />
                        </div>
                        <div className="flex-1 space-y-1.5">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">رقم الآية</label>
                          <input 
                            type="number" 
                            min="1" 
                            value={manualAyah}
                            onChange={(e) => setManualAyah(Number(e.target.value))}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white text-center text-sm focus:ring-2 focus:ring-white/10 outline-none transition-all"
                          />
                        </div>
                      </motion.div>
                    )}
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={startNewRound}
                    disabled={isStartingRound || (room.readyUsers?.length || 0) < 1}
                    className={`w-full py-5 rounded-[2rem] font-black text-xl shadow-2xl transition-all duration-500 flex items-center justify-center gap-3 group/btn ${
                      isStartingRound || (room.readyUsers?.length || 0) < 1
                        ? 'bg-white/5 text-slate-600 cursor-not-allowed border border-white/5'
                        : `bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-900/40`
                    }`}
                  >
                    {isStartingRound ? <Loader2 className="w-6 h-6 animate-spin" /> : <Play className="w-6 h-6 group-hover/btn:scale-110 transition-transform" />}
                    بدء الجولة
                  </motion.button>
                </div>
              )}
            </div>
          ) : round ? (
            <div className="w-full space-y-10 relative z-10">
              {/* Verse Display */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center space-y-6"
              >
                <div className="inline-flex items-center gap-3 px-5 py-2 glass-dark rounded-full border border-white/10">
                  <BookOpen className={`w-4 h-4 ${theme.text}`} />
                  <span className="text-xs font-bold tracking-widest text-slate-300 uppercase">سورة {round.surahName} • آية {round.ayahNumber}</span>
                </div>
                <h2 className="text-4xl md:text-6xl font-arabic leading-[3] text-white text-center px-4 drop-shadow-2xl" dir="rtl" style={{ fontFamily: '"Amiri", serif' }}>
                  {round.verseText}
                </h2>
              </motion.div>

              {/* Game State UI */}
              <div className="flex flex-col items-center justify-center gap-8">
                {round.status === 'countdown' && (
                  <div className="text-center space-y-6">
                    <motion.div 
                      key={localCountdown}
                      initial={{ scale: 1.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-9xl font-black text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]"
                    >
                      {localCountdown}
                    </motion.div>
                    <p className="text-2xl font-black gold-gradient animate-pulse tracking-widest uppercase">استعد للتسجيل!</p>
                  </div>
                )}

                {round.status === 'recording' && (
                  <div className="w-full max-w-lg space-y-8">
                    {!round.activeRecorderId ? (
                      <div className="text-center space-y-6">
                        <p className="text-slate-400 font-medium">كن أول من يضغط على الزر لبدء التلاوة!</p>
                        <button
                          onClick={claimRecording}
                          className={`w-full py-8 rounded-[2.5rem] font-black text-3xl shadow-2xl transition-all duration-500 flex items-center justify-center gap-4 group/rec ${theme.bg} text-white hover:scale-105 active:scale-95 ${theme.glow}`}
                        >
                          <Mic className="w-10 h-10 group-hover/rec:scale-125 transition-transform duration-500" />
                          سجل الآن!
                        </button>
                      </div>
                    ) : (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="space-y-8"
                      >
                        <div className="flex items-center justify-center gap-6 glass-dark p-6 rounded-[2.5rem] border border-white/10">
                          <div className="relative">
                            <div className="absolute inset-0 bg-emerald-500 blur-2xl opacity-20 animate-pulse rounded-full" />
                            <img 
                              src={participants.find(p => p.uid === round.activeRecorderId)?.photoURL} 
                              alt="Recorder" 
                              className="w-24 h-24 rounded-[2rem] border-4 border-emerald-500/50 object-cover relative z-10"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute -bottom-2 -right-2 bg-emerald-500 p-2.5 rounded-xl shadow-xl z-20 animate-bounce">
                              <Mic className="w-5 h-5 text-white" />
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-1">جاري التلاوة الآن</p>
                            <p className="text-3xl font-black text-white">
                              {participants.find(p => p.uid === round.activeRecorderId)?.displayName}
                            </p>
                          </div>
                        </div>

                        {round.activeRecorderId === user.uid ? (
                          <div className="space-y-6">
                            <div className="flex items-center justify-between px-6 py-4 glass-dark rounded-2xl border border-white/10">
                              <div className="flex items-center gap-3">
                                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
                                <span className="text-red-500 font-mono text-2xl font-black">
                                  {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                                </span>
                              </div>
                              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">أنت تقرأ الآن • الجميع يسمعك</span>
                            </div>
                            <div className="glass-dark p-4 rounded-3xl border border-white/5 overflow-hidden">
                              <canvas ref={canvasRef} className="w-full h-32 rounded-2xl" />
                            </div>
                            <button
                              onClick={stopRecording}
                              className="w-full py-5 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-[2rem] font-black text-xl hover:from-red-500 hover:to-rose-500 transition-all duration-300 shadow-xl shadow-red-900/20 flex items-center justify-center gap-3 group/stop"
                            >
                              <Square className="w-6 h-6 group-hover/stop:scale-110 transition-transform" />
                              إنهاء التلاوة
                            </button>
                          </div>
                        ) : (
                          <div className="p-12 glass-dark rounded-[3rem] border border-white/5 flex flex-col items-center gap-6">
                            <div className="relative">
                              <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-20 animate-pulse" />
                              <Activity className={`w-16 h-16 ${theme.text} animate-pulse relative z-10`} />
                            </div>
                            <p className="text-slate-400 text-center font-medium text-lg leading-relaxed">
                              استمع بإنصات لتلاوة <br />
                              <span className="text-white font-black">{participants.find(p => p.uid === round.activeRecorderId)?.displayName}</span>
                            </p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                )}

                {round.status === 'reviewing' && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center space-y-8"
                  >
                    <div className="w-24 h-24 mx-auto rounded-[2rem] bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shadow-2xl shadow-amber-900/20">
                      <Star className="w-12 h-12 text-amber-400 animate-spin-slow" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-4xl font-black text-gradient">مرحلة التقييم</h2>
                      <p className="text-slate-400 font-medium">المضيف يقوم بتقييم التلاوات الآن.</p>
                    </div>
                    {isHost && (
                      <div className="flex flex-wrap justify-center gap-4">
                        <button
                          onClick={finishRound}
                          className="px-10 py-4 rounded-2xl font-black text-lg bg-emerald-600 text-white hover:scale-105 transition-all shadow-2xl shadow-emerald-900/20"
                        >
                          إعلان النتائج
                        </button>
                        <button
                          onClick={startNewRound}
                          className={`px-10 py-4 rounded-2xl font-black text-lg ${theme.bg} text-white hover:scale-105 transition-all shadow-2xl ${theme.glow}`}
                        >
                          جولة جديدة
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}

                {round.status === 'finished' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center space-y-12 py-10"
                    onAnimationComplete={() => {
                      confetti({
                        particleCount: 150,
                        spread: 70,
                        origin: { y: 0.6 },
                        colors: ['#f59e0b', '#10b981', '#ffffff']
                      });
                    }}
                  >
                    <div className="space-y-4">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', damping: 12 }}
                        className="w-24 h-24 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto border-2 border-amber-500/20"
                      >
                        <Trophy className="w-12 h-12 text-amber-500" />
                      </motion.div>
                      <div className="space-y-2">
                        <h2 className="text-6xl font-black text-gradient">نتائج الجولة</h2>
                        <p className="text-slate-400 font-bold text-lg tracking-wide">تم الانتهاء من تقييم جميع التلاوات</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto items-end px-4">
                      {/* Second Place */}
                      {roundResults[1] && (
                        <motion.div
                          initial={{ opacity: 0, x: -50 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.4 }}
                          className="relative p-8 rounded-[3rem] glass-dark border border-white/5 flex flex-col items-center gap-4 h-[300px] justify-center order-2 md:order-1"
                        >
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-4 py-1 bg-slate-400 text-slate-900 rounded-full text-[10px] font-black uppercase tracking-widest">المركز الثاني</div>
                          <img 
                            src={participants.find(p => p.uid === roundResults[1].userId)?.photoURL} 
                            className="w-24 h-24 rounded-3xl object-cover border-4 border-slate-400"
                            referrerPolicy="no-referrer"
                          />
                          <div className="text-center">
                            <p className="font-black text-xl text-white">{roundResults[1].userName}</p>
                            <p className="text-slate-400 font-black text-4xl mt-1">{roundResults[1].score}</p>
                          </div>
                        </motion.div>
                      )}

                      {/* First Place */}
                      {roundResults[0] && (
                        <motion.div
                          initial={{ opacity: 0, y: 50 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2, type: 'spring' }}
                          className="relative p-10 rounded-[3.5rem] glass-dark border-2 border-amber-500/30 flex flex-col items-center gap-6 h-[380px] justify-center z-10 shadow-2xl shadow-amber-500/10 order-1 md:order-2"
                        >
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center shadow-xl shadow-amber-900/40 rotate-12">
                            <Trophy className="w-8 h-8 text-white -rotate-12" />
                          </div>
                          <img 
                            src={participants.find(p => p.uid === roundResults[0].userId)?.photoURL} 
                            className="w-32 h-32 rounded-[2.5rem] object-cover border-4 border-amber-500 shadow-2xl shadow-amber-500/20"
                            referrerPolicy="no-referrer"
                          />
                          <div className="text-center">
                            <p className="font-black text-2xl text-white">{roundResults[0].userName}</p>
                            <p className="text-amber-400 font-black text-6xl mt-2">{roundResults[0].score}</p>
                          </div>
                        </motion.div>
                      )}

                      {/* Third Place */}
                      {roundResults[2] && (
                        <motion.div
                          initial={{ opacity: 0, x: 50 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.6 }}
                          className="relative p-8 rounded-[3rem] glass-dark border border-white/5 flex flex-col items-center gap-4 h-[260px] justify-center order-3"
                        >
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-4 py-1 bg-amber-700 text-white rounded-full text-[10px] font-black uppercase tracking-widest">المركز الثالث</div>
                          <img 
                            src={participants.find(p => p.uid === roundResults[2].userId)?.photoURL} 
                            className="w-20 h-20 rounded-3xl object-cover border-4 border-amber-700"
                            referrerPolicy="no-referrer"
                          />
                          <div className="text-center">
                            <p className="font-black text-lg text-white">{roundResults[2].userName}</p>
                            <p className="text-amber-700 font-black text-3xl mt-1">{roundResults[2].score}</p>
                          </div>
                        </motion.div>
                      )}
                    </div>

                    <div className="flex flex-col items-center gap-8 pt-10">
                      <div className="flex items-center gap-6 px-8 py-4 glass-dark rounded-3xl border border-white/5">
                        <div className="text-center px-6 border-r border-white/10">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">إجمالي المشاركين</p>
                          <p className="text-2xl font-black text-white">{recordings.filter(r => r.roundId === round.id).length}</p>
                        </div>
                        <div className="text-center px-6">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">متوسط الدرجات</p>
                          <p className="text-2xl font-black text-emerald-400">
                            {Math.round(recordings.filter(r => r.roundId === round.id && r.score !== undefined).reduce((acc, curr) => acc + (curr.score || 0), 0) / (recordings.filter(r => r.roundId === round.id && r.score !== undefined).length || 1))}
                          </p>
                        </div>
                      </div>

                      {isHost && (
                        <button
                          onClick={startNewRound}
                          className={`px-16 py-6 rounded-[2.5rem] font-black text-2xl ${theme.bg} text-white hover:scale-105 transition-all shadow-2xl ${theme.glow} flex items-center gap-4 group`}
                        >
                          <span>بدء جولة جديدة</span>
                          <Shuffle className="w-6 h-6 group-hover:rotate-180 transition-transform duration-500" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          ) : null}
        </motion.div>

        {/* Leaderboard Section */}
        {leaderboard.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-[2.5rem] p-8 mt-8"
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-black flex items-center gap-3 text-amber-400">
                <Trophy className="w-8 h-8" />
                لوحة الشرف
              </h3>
              <div className="px-4 py-1.5 glass-dark rounded-full border border-white/5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                أفضل القراء
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {leaderboard.map((user, idx) => (
                <motion.div 
                  key={idx} 
                  whileHover={{ y: -5 }}
                  className="flex items-center gap-4 glass-dark p-5 rounded-3xl border border-white/5 relative overflow-hidden group"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${
                    idx === 0 ? 'from-amber-500/10 to-transparent' :
                    idx === 1 ? 'from-slate-400/10 to-transparent' :
                    idx === 2 ? 'from-amber-700/10 to-transparent' :
                    'from-white/5 to-transparent'
                  } opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                  
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-2xl relative z-10 ${
                    idx === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-amber-900/40' :
                    idx === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-500 text-slate-900' :
                    idx === 2 ? 'bg-gradient-to-br from-amber-700 to-amber-900 text-white' :
                    'bg-white/10 text-slate-400'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 relative z-10">
                    <p className="font-black text-white text-lg leading-tight">{user.name}</p>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">{user.recCount} تلاوة</p>
                  </div>
                  <div className="text-3xl font-black text-amber-400 relative z-10">
                    {user.totalScore}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Recordings List */}
        {recordings.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-[2.5rem] p-8"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <h3 className="text-2xl font-black flex items-center gap-3">
                <Mic className={`w-8 h-8 ${theme.text}`} />
                تسجيلات الجولة
              </h3>
              <div className="flex items-center gap-2 p-1.5 glass-dark rounded-2xl border border-white/5">
                {[
                  { id: 'time', label: 'الأحدث' },
                  { id: 'likes', label: 'الإعجابات' },
                  { id: 'score', label: 'التقييم' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setSortBy(tab.id as any)}
                    className={`px-5 py-2 rounded-xl text-xs font-bold transition-all duration-300 ${sortBy === tab.id ? 'bg-white/10 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="space-y-6">
              <AnimatePresence mode="popLayout">
                {sortedRecordings.map((rec, idx) => {
                  const isTopRated = (sortBy === 'score' || sortBy === 'likes') && idx === 0 && (rec.score || (rec.likes && rec.likes.length > 0));
                  return (
                    <motion.div 
                      key={rec.id} 
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`flex flex-col p-6 rounded-[2rem] transition-all duration-500 relative overflow-hidden group ${
                        isTopRated 
                          ? 'bg-amber-500/5 border border-amber-500/20 shadow-2xl shadow-amber-900/10' 
                          : 'glass-dark border border-white/5 hover:bg-white/[0.04]'
                      }`}
                    >
                      {isTopRated && (
                        <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
                      )}
                      
                      <div className="flex items-center justify-between mb-6 relative z-10">
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <img 
                              src={participants.find(p => p.uid === rec.userId)?.photoURL} 
                              alt="User" 
                              className="w-14 h-14 rounded-2xl object-cover border-2 border-white/10"
                              referrerPolicy="no-referrer"
                            />
                            {isTopRated && (
                              <div className="absolute -top-2 -right-2 bg-amber-500 p-1.5 rounded-lg shadow-lg">
                                <Trophy className="w-3 h-3 text-white" />
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-black text-white text-lg">{rec.userName}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                {new Date(rec.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                <Clock className="w-3 h-3" />
                                {rec.duration}s
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {rec.score !== undefined && (
                            <motion.div
                              key={rec.score}
                              initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl"
                            >
                              <Star className="w-4 h-4 fill-current" />
                              <span className="text-sm font-black">{rec.score}/100</span>
                            </motion.div>
                          )}
                          <button
                            onClick={() => handleLike(rec)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 ${
                              rec.likes?.includes(user.uid) 
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                                : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10'
                            }`}
                          >
                            <Heart className={`w-4 h-4 ${rec.likes?.includes(user.uid) ? 'fill-current' : ''}`} />
                            <span className="text-sm font-bold">{rec.likes?.length || 0}</span>
                          </button>
                          
                          <a 
                            href={rec.audioData} 
                            download={`tilaawa-${rec.userName}-${Date.now()}.webm`}
                            className="p-2.5 glass-dark text-slate-400 hover:text-white rounded-xl border border-white/5 transition-all"
                            title="تحميل التسجيل"
                          >
                            <Download className="w-5 h-5" />
                          </a>
                        </div>
                      </div>

                      <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
                        <div className="flex-1 w-full">
                          <audio src={rec.audioData} controls className="w-full h-12 rounded-xl" />
                        </div>
                        
                        {isHost && round?.status === 'reviewing' && (
                          <div className="flex flex-col gap-4 p-5 glass-dark rounded-3xl border border-white/10 relative z-10">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Star className="w-4 h-4 text-amber-400" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">تقييم المضيف</span>
                              </div>
                              <div className="flex items-center gap-1">
                                {[...Array(5)].map((_, i) => {
                                  const scoreValue = (i + 1) * 20;
                                  const isActive = (rec.score || 0) >= scoreValue;
                                  return (
                                    <button
                                      key={i}
                                      onClick={() => handleScore(rec, scoreValue)}
                                      className={`p-1 transition-all duration-300 hover:scale-110 ${isActive ? 'text-amber-400' : 'text-slate-700 hover:text-amber-400/50'}`}
                                      title={`${scoreValue} نقطة`}
                                    >
                                      <Star className={`w-6 h-6 ${isActive ? 'fill-current' : ''}`} />
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 pt-3 border-t border-white/5">
                              <div className="relative flex-1">
                                <input 
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={rec.score || ''}
                                  onChange={(e) => handleScore(rec, Number(e.target.value))}
                                  placeholder="درجة من 100"
                                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:ring-2 focus:ring-amber-500/50 outline-none transition-all"
                                />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-600 uppercase">درجة</div>
                              </div>
                              <div className="px-3 py-2 glass-dark rounded-xl border border-white/5 text-amber-400 font-black text-lg min-w-[3rem] text-center">
                                {rec.score || 0}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {isHost && round?.status === 'reviewing' && (
                        <div className="mt-6 pt-6 border-t border-white/5">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">الموجة الصوتية للتسجيل</p>
                          <div className="glass-dark p-4 rounded-2xl border border-white/5">
                            <Waveform audioUrl={rec.audioData} />
                          </div>
                        </div>
                      )}

                      <div className="mt-6 pt-6 border-t border-white/5">
                        {rec.feedback ? (
                          <div className="flex gap-4">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                              <Sparkles className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">تقييم الذكاء الاصطناعي</p>
                              <p className="text-slate-300 text-sm leading-relaxed font-medium">{rec.feedback}</p>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleGetFeedback(rec)}
                            disabled={analyzingId === rec.id}
                            className={`flex items-center gap-3 px-6 py-3 rounded-2xl text-sm font-bold transition-all duration-300 ${
                              analyzingId === rec.id 
                                ? 'bg-white/5 text-slate-500 cursor-not-allowed' 
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                            }`}
                          >
                            {analyzingId === rec.id ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                جاري تحليل التلاوة...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4" />
                                احصل على تقييم الذكاء الاصطناعي
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

      </main>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 max-w-2xl w-full shadow-2xl relative overflow-hidden"
            >
              {/* Modal Background Glow */}
              <div className={`absolute top-0 left-0 w-full h-1 ${theme.bg}`} />
              
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${theme.lightBg} flex items-center justify-center`}>
                    <Settings className={`w-6 h-6 ${theme.text}`} />
                  </div>
                  <h2 className="text-2xl font-black">إعدادات المجلس</h2>
                </div>
                <button 
                  onClick={() => setIsSettingsOpen(false)} 
                  className="p-2 hover:bg-white/5 rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* General Settings */}
                <div className="space-y-8">
                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                      <Users className="w-3 h-3" />
                      إعدادات عامة
                    </h3>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <label className="text-sm font-bold text-slate-300">الحد الأقصى للمشاركين</label>
                          <span className={`${theme.text} font-black`}>{editMaxParticipants}</span>
                        </div>
                        <input 
                          type="range" min="2" max="50" 
                          value={editMaxParticipants}
                          onChange={(e) => setEditMaxParticipants(parseInt(e.target.value))}
                          className={`w-full accent-emerald-500`}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <label className="text-sm font-bold text-slate-300">مدة التسجيل (ثانية)</label>
                          <span className={`${theme.text} font-black`}>{editRecordingDuration}</span>
                        </div>
                        <input 
                          type="range" min="10" max="300" step="10"
                          value={editRecordingDuration}
                          onChange={(e) => setEditRecordingDuration(parseInt(e.target.value))}
                          className={`w-full accent-emerald-500`}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                      <Volume2 className="w-3 h-3" />
                      إعدادات الصوت
                    </h3>
                    <div className="flex items-center justify-between p-4 glass-dark rounded-2xl border border-white/5">
                      <div>
                        <p className="text-sm font-bold text-white">تأثير الصدى (Reverb)</p>
                        <p className="text-[10px] text-slate-500">محاكاة صوت المسجد الكبير</p>
                      </div>
                      <button 
                        onClick={() => setEchoEnabled(!echoEnabled)}
                        className={`w-12 h-6 rounded-full transition-all relative ${echoEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${echoEnabled ? 'right-7' : 'right-1'}`} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Visual Settings */}
                <div className="space-y-8">
                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                      <Sparkles className="w-3 h-3" />
                      المظهر والسمات
                    </h3>
                    
                    <div className="space-y-4">
                      <div className="space-y-3">
                        <label className="text-sm font-bold text-slate-300">لون السمة</label>
                        <div className="flex flex-wrap gap-3">
                          {['emerald', 'blue', 'purple', 'rose', 'amber'].map(color => (
                            <button
                              key={color}
                              onClick={() => setEditThemeColor(color)}
                              className={`w-10 h-10 rounded-xl border-2 transition-all ${
                                editThemeColor === color ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'
                              } ${
                                color === 'emerald' ? 'bg-emerald-500' :
                                color === 'blue' ? 'bg-blue-500' :
                                color === 'purple' ? 'bg-purple-500' :
                                color === 'rose' ? 'bg-rose-500' :
                                'bg-amber-500'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-10 pt-8 border-t border-white/5 flex gap-4">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="flex-1 py-4 rounded-2xl bg-white/5 text-slate-400 font-bold hover:bg-white/10 transition-all"
                >
                  إلغاء
                </button>
                <button 
                  onClick={saveSettings}
                  className={`flex-[2] py-4 rounded-2xl ${theme.bg} text-white font-black text-lg shadow-2xl ${theme.glow} hover:scale-[1.02] active:scale-95 transition-all`}
                >
                  حفظ التغييرات
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Remote Audio Streams */}
      <div className="hidden">
        {(Array.from(remoteStreams.keys()) as string[]).map((userId) => (
          <RemoteAudio key={userId} stream={remoteStreams.get(userId)!} />
        ))}
      </div>
      <RatingModal 
        isOpen={isRatingModalOpen} 
        onClose={() => setIsRatingModalOpen(false)} 
        onSubmit={handleSubmitRating} 
      />
    </div>
  );
}

function RemoteAudio({ stream }: { stream: MediaStream; key?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay />;
}
