import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, Star } from 'lucide-react';
import { Recording, User } from '../types';

interface RecordingsCarouselProps {
  recordings: Recording[];
  participants: User[];
}

export default function RecordingsCarousel({ recordings, participants }: RecordingsCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const topRecordings = recordings
    .filter(r => r.score !== undefined)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5);

  if (topRecordings.length === 0) return null;

  return (
    <div className="relative w-full max-w-4xl mx-auto py-8">
      <h3 className="text-2xl font-black text-white mb-6 text-center">أفضل التلاوات</h3>
      <div className="relative h-[400px] flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="absolute w-full max-w-md glass-dark p-8 rounded-[2.5rem] border border-white/10 shadow-2xl"
          >
            <div className="flex flex-col items-center gap-6">
              <img
                src={participants.find(p => p.uid === topRecordings[currentIndex].userId)?.photoURL}
                className="w-32 h-32 rounded-[2rem] object-cover border-4 border-amber-500"
                referrerPolicy="no-referrer"
              />
              <div className="text-center">
                <p className="font-black text-2xl text-white">{topRecordings[currentIndex].userName}</p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <Star className="w-6 h-6 text-amber-400 fill-amber-400" />
                  <p className="text-amber-400 font-black text-4xl">{topRecordings[currentIndex].score}</p>
                </div>
              </div>
              <button 
                className="w-full py-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold transition-all flex items-center justify-center gap-2"
                onClick={() => {/* Add play functionality */}}
              >
                <Play className="w-5 h-5" />
                استمع للتلاوة
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex justify-center gap-2 mt-4">
        {topRecordings.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`w-3 h-3 rounded-full transition-all ${index === currentIndex ? 'bg-amber-500 w-8' : 'bg-white/20'}`}
          />
        ))}
      </div>
    </div>
  );
}
