import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, deleteDoc, collection, getDocs, writeBatch } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function deleteRoomFromFirestore(roomId: string) {
  try {
    // Delete room document
    await deleteDoc(doc(db, "rooms", roomId));
    
    // Delete subcollections (rounds, recordings)
    const roundsRef = collection(db, "rooms", roomId, "rounds");
    const roundsSnapshot = await getDocs(roundsRef);
    const batch = writeBatch(db);
    roundsSnapshot.docs.forEach(d => batch.delete(d.ref));
    
    const recsRef = collection(db, "rooms", roomId, "recordings");
    const recsSnapshot = await getDocs(recsRef);
    recsSnapshot.docs.forEach(d => batch.delete(d.ref));
    
    await batch.commit();
    console.log(`Room ${roomId} deleted.`);
  } catch (error) {
    console.error(`Error deleting room ${roomId}:`, error);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;
  
  const roomEmptyTimers = new Map<string, NodeJS.Timeout>();

  // Socket.io signaling logic
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", (roomId, userId) => {
      socket.join(roomId);
      socket.data.roomId = roomId;
      console.log(`User ${userId} joined room ${roomId}`);
      
      // Clear timer if it exists
      if (roomEmptyTimers.has(roomId)) {
        clearTimeout(roomEmptyTimers.get(roomId)!);
        roomEmptyTimers.delete(roomId);
        console.log(`Timer cleared for room ${roomId}`);
      }
      
      socket.to(roomId).emit("user-connected", userId);
    });

    socket.on("offer", (payload) => {
      io.to(payload.target).emit("offer", {
        sdp: payload.sdp,
        sender: payload.sender
      });
    });

    socket.on("answer", (payload) => {
      io.to(payload.target).emit("answer", {
        sdp: payload.sdp,
        sender: payload.sender
      });
    });

    socket.on("ice-candidate", (payload) => {
      io.to(payload.target).emit("ice-candidate", {
        candidate: payload.candidate,
        sender: payload.sender
      });
    });

    socket.on("request-connection", (payload) => {
      socket.to(payload.roomId).emit("request-connection", payload.userId);
    });

    socket.on("toggle-live", (roomId, isLive) => {
      io.to(roomId).emit("live-status-changed", isLive);
    });

    socket.on("disconnect", () => {
      console.log(`User ${socket.id} disconnected.`);
      const roomId = socket.data.roomId;
      if (roomId) {
        const room = io.sockets.adapter.rooms.get(roomId);
        const roomSize = room ? room.size : 0;
        console.log(`Room ${roomId} size after disconnect: ${roomSize}`);
        
        if (roomSize === 0) {
          console.log(`Room ${roomId} is empty. Starting 30s inactivity timer.`);
          const timer = setTimeout(async () => {
            console.log(`Inactivity timer expired for room ${roomId}. Proceeding to delete.`);
            await deleteRoomFromFirestore(roomId);
            roomEmptyTimers.delete(roomId);
            console.log(`Room ${roomId} deletion process completed.`);
          }, 30000);
          roomEmptyTimers.set(roomId, timer);
        }
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
