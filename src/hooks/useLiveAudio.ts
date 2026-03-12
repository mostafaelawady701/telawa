import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useLiveAudio(roomId: string | undefined, userId: string, isHost: boolean) {
  const [isLive, setIsLive] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!roomId) return;

    socketRef.current = io();

    socketRef.current.emit('join-room', roomId, userId);

    socketRef.current.on('live-status-changed', async (status: boolean) => {
      setIsLive(status);
      if (status && !isHost) {
        // Automatically join if live starts? Or just show a button?
        // For now, let's just update the status so the UI can show a "Join Live" button
      } else if (!status) {
        stopLive();
      }
    });

    socketRef.current.on('request-connection', (requestingUserId: string) => {
      if (isLive && isHost) {
        initiateCall(requestingUserId);
      }
    });

    socketRef.current.on('user-connected', (connectedUserId: string) => {
      if (isLive) {
        initiateCall(connectedUserId);
      }
    });

    socketRef.current.on('offer', async ({ sdp, sender }: { sdp: RTCSessionDescriptionInit, sender: string }) => {
      const pc = createPeerConnection(sender);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit('answer', { target: sender, sdp: answer, sender: userId });
    });

    socketRef.current.on('answer', async ({ sdp, sender }: { sdp: RTCSessionDescriptionInit, sender: string }) => {
      const pc = peersRef.current.get(sender);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      }
    });

    socketRef.current.on('ice-candidate', async ({ candidate, sender }: { candidate: RTCIceCandidateInit, sender: string }) => {
      const pc = peersRef.current.get(sender);
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    return () => {
      socketRef.current?.disconnect();
      peersRef.current.forEach(pc => pc.close());
      localStreamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, [roomId, userId]);

  const createPeerConnection = (targetUserId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('ice-candidate', { target: targetUserId, candidate: event.candidate, sender: userId });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.set(targetUserId, event.streams[0]);
        return next;
      });
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    peersRef.current.set(targetUserId, pc);
    return pc;
  };

  const initiateCall = async (targetUserId: string) => {
    const pc = createPeerConnection(targetUserId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketRef.current?.emit('offer', { target: targetUserId, sdp: offer, sender: userId });
  };

  const startLive = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setIsLive(true);
      socketRef.current?.emit('toggle-live', roomId, true);
      // In a real implementation, we'd need to signal all existing users to connect
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  const stopLive = () => {
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    setIsLive(false);
    socketRef.current?.emit('toggle-live', roomId, false);
    peersRef.current.forEach(pc => pc.close());
    peersRef.current.clear();
    setRemoteStreams(new Map());
  };

  const joinLive = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setIsLive(true);
      socketRef.current?.emit('request-connection', { roomId, userId });
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  return { isLive, startLive, stopLive, joinLive, remoteStreams };
}
