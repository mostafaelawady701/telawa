import React, { useEffect, useRef, useState } from 'react';

export default function Waveform({ audioUrl }: { audioUrl: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    const generateWaveform = async () => {
      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const channelData = audioBuffer.getChannelData(0);
        
        const samples = 100;
        const blockSize = Math.floor(channelData.length / samples);
        const newPeaks = [];
        for (let i = 0; i < samples; i++) {
          let start = blockSize * i;
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(channelData[start + j]);
          }
          newPeaks.push(sum / blockSize);
        }
        
        const maxPeak = Math.max(...newPeaks);
        const normalizedPeaks = newPeaks.map(p => p / maxPeak);
        setPeaks(normalizedPeaks);
      } catch (error) {
        console.error("Error generating waveform:", error);
      }
    };
    generateWaveform();
  }, [audioUrl]);

  useEffect(() => {
    if (!canvasRef.current || peaks.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#059669'; // emerald-600
    
    const barWidth = canvas.width / peaks.length;
    peaks.forEach((peak, i) => {
      const barHeight = Math.max(2, peak * canvas.height); // min height 2px
      ctx.fillRect(i * barWidth, canvas.height / 2 - barHeight / 2, barWidth - 1, barHeight);
    });
  }, [peaks]);

  return (
    <div className="w-full h-16 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center">
      {peaks.length === 0 ? (
        <span className="text-xs text-slate-400 animate-pulse">جاري تحليل الصوت...</span>
      ) : (
        <canvas ref={canvasRef} width={600} height={64} className="w-full h-full opacity-80" />
      )}
    </div>
  );
}
