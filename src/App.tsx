import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import RoomView from './pages/RoomView';
import { User } from './types';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              uid: currentUser.uid,
              displayName: currentUser.displayName || (currentUser.isAnonymous ? 'ضيف' : 'مستخدم'),
              photoURL: currentUser.photoURL || '',
              isAnonymous: currentUser.isAnonymous,
              createdAt: Date.now()
            });
          }
          setUser(currentUser);
        } catch (error) {
          console.error("Error saving user:", error);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-emerald-600">جاري التحميل...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Login />} />
        <Route path="/dashboard" element={user ? <Dashboard user={user} /> : <Navigate to="/" />} />
        <Route path="/room/:roomId" element={user ? <RoomView user={user} /> : <Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
