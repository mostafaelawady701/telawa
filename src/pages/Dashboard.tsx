import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, logout } from '../firebase';
import { collection, addDoc, onSnapshot, query, orderBy, limit, updateDoc, doc, arrayUnion, getDocs, deleteDoc } from 'firebase/firestore';
import { Plus, LogOut, Users, Mic, Shuffle, Sparkles, Radio, Trophy, Search, BookOpen, Settings, X, Loader2, Copy, Check } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { Room } from '../types';
import { motion, AnimatePresence } from 'motion/react';

export default function Dashboard({ user }: { user: FirebaseUser }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // New Room State
  const [newRoomName, setNewRoomName] = useState('');
  const [newMaxParticipants, setNewMaxParticipants] = useState(10);
  const [newRecordingDuration, setNewRecordingDuration] = useState(60);
  const [newThemeColor, setNewThemeColor] = useState('emerald');
  const [newThemeBg, setNewThemeBg] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const themePresets = [
    { id: 'emerald', name: 'زمردي', color: 'bg-emerald-500', glow: 'shadow-emerald-500/20' },
    { id: 'blue', name: 'ياقوتي', color: 'bg-blue-500', glow: 'shadow-blue-500/20' },
    { id: 'purple', name: 'بنفسجي', color: 'bg-purple-500', glow: 'shadow-purple-500/20' },
    { id: 'rose', name: 'وردي', color: 'bg-rose-500', glow: 'shadow-rose-500/20' },
    { id: 'amber', name: 'ذهبي', color: 'bg-amber-500', glow: 'shadow-amber-500/20' },
  ];

  const bgPresets = [
    { name: 'محراب', url: 'https://images.unsplash.com/photo-1507692049790-de58290a4334?q=80&w=2070&auto=format&fit=crop' },
    { name: 'زخارف', url: 'https://images.unsplash.com/photo-1591604021695-0c69b7c05981?q=80&w=2070&auto=format&fit=crop' },
    { name: 'مسجد', url: 'https://images.unsplash.com/photo-1542810634-71277d95dcbb?q=80&w=2070&auto=format&fit=crop' },
    { name: 'ليلي', url: 'https://images.unsplash.com/photo-1519817650390-64a93db51149?q=80&w=2070&auto=format&fit=crop' },
  ];

  useEffect(() => {
    const q = query(collection(db, 'rooms'), orderBy('createdAt', 'desc'), limit(20));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roomsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Room[];
      setRooms(roomsData);
    });
    return unsubscribe;
  }, []);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    
    setIsCreating(true);
    try {
      const roomRef = await addDoc(collection(db, 'rooms'), {
        name: newRoomName,
        hostId: user.uid,
        status: 'waiting',
        participants: [user.uid],
        maxParticipants: newMaxParticipants,
        recordingDuration: newRecordingDuration,
        createdAt: Date.now(),
        theme: {
          color: newThemeColor,
          backgroundImage: newThemeBg || bgPresets[0].url
        }
      });
      navigate(`/room/${roomRef.id}`);
    } catch (error) {
      console.error("Error creating room:", error);
      alert("فشل إنشاء الغرفة.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (roomId: string) => {
    try {
      const roomRef = doc(db, 'rooms', roomId);
      await updateDoc(roomRef, {
        participants: arrayUnion(user.uid)
      });
      navigate(`/room/${roomId}`);
    } catch (error) {
      console.error("Error joining room:", error);
    }
  };

  const handleCopyLink = (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    const link = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(roomId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const deleteAllRooms = async () => {
    if (!confirm("هل أنت متأكد من حذف جميع الغرف؟ هذا الإجراء لا يمكن التراجع عنه.")) return;
    try {
      const roomsSnapshot = await getDocs(collection(db, 'rooms'));
      const deletePromises = roomsSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      alert("تم حذف جميع الغرف بنجاح.");
    } catch (error) {
      console.error("Error deleting rooms:", error);
      alert("حدث خطأ أثناء حذف الغرف.");
    }
  };

  const deleteRoom = async (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    if (!confirm("هل أنت متأكد من حذف هذه الغرفة؟")) return;
    try {
      await deleteDoc(doc(db, 'rooms', roomId));
      alert("تم حذف الغرفة بنجاح.");
    } catch (error) {
      console.error("Error deleting room:", error);
      alert("حدث خطأ أثناء حذف الغرفة.");
    }
  };

  const handleRandomJoin = async () => {
    try {
      const q = query(collection(db, 'rooms'), limit(20));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        alert("لا توجد غرف متاحة حالياً. قم بإنشاء غرفة جديدة!");
        return;
      }
      const availableRooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Room[];
      const openRooms = availableRooms.filter(r => (r.participants?.length || 0) < (r.maxParticipants || 10));
      
      if (openRooms.length === 0) {
        alert("جميع الغرف ممتلئة حالياً.");
        return;
      }

      const randomRoom = openRooms[Math.floor(Math.random() * openRooms.length)];
      await handleJoinRoom(randomRoom.id);
    } catch (error) {
      console.error("Error joining random room:", error);
      alert("حدث خطأ أثناء الانضمام العشوائي.");
    }
  };

  const filteredRooms = rooms.filter(room => 
    room.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-emerald-500/30 overflow-x-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-100 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-100 blur-[120px] rounded-full" />
      </div>

      <header className="sticky top-0 z-50 glass border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Mic className="text-white w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gradient">تلاوة</h1>
          </motion.div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-4 px-4 py-2 rounded-full bg-white/5 border border-white/10">
              <img 
                src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
                alt="Profile" 
                className="w-8 h-8 rounded-full border border-white/20"
              />
              <span className="text-sm font-medium text-slate-300">
                {user.displayName || 'ضيف'}
              </span>
            </div>
            {(user.email === 'waleedelawady3@gmail.com' || user.email === 'waleedelawady32gamil.comm' || user.email === 'waleedelawady3@gamil.com') && (
              <button 
                onClick={deleteAllRooms}
                className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 rounded-xl transition-all duration-300"
                title="حذف جميع الغرف"
              >
                <X className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={logout}
              className="p-2.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all duration-300"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 relative z-10">
        {/* Hero Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="text-5xl md:text-6xl font-extrabold leading-tight mb-6">
              ارتقِ بتلاوتك <br />
              <span className="gold-gradient">في مجالس النور</span>
            </h2>
            <p className="text-lg text-slate-400 mb-8 max-w-lg leading-relaxed">
              انضم إلى غرف التلاوة الجماعية، شارك في المسابقات، واحصل على تقييمات احترافية لتطوير مهاراتك في تجويد القرآن الكريم.
            </p>
            
            <div className="flex flex-wrap gap-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleRandomJoin}
                className="px-8 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-3 transition-all duration-300 shadow-xl shadow-emerald-900/40"
              >
                <Shuffle className="w-5 h-5" />
                <span>دخول سريع</span>
              </motion.button>
              <div className="flex items-center gap-4 px-6 py-4 rounded-2xl bg-white/5 border border-white/10">
                <Users className="text-emerald-400 w-5 h-5" />
                <span className="text-slate-300 font-medium">+{rooms.reduce((acc, r) => acc + (r.participants?.length || 0), 0)} متواجد الآن</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="relative"
          >
            <div className="glass rounded-[2.5rem] p-10 relative overflow-hidden group flex flex-col items-center text-center">
              <div className="absolute top-0 right-0 p-6">
                <Sparkles className="text-amber-400 w-8 h-8 animate-pulse" />
              </div>
              <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
                <Plus className="text-emerald-400 w-10 h-10" />
              </div>
              <h3 className="text-3xl font-black mb-4">أنشئ مجلسك الخاص</h3>
              <p className="text-slate-400 mb-8 max-w-xs">خصص إعدادات المجلس، اختر السمة المناسبة، وابدأ رحلة التلاوة مع الآخرين.</p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsCreateModalOpen(true)}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white py-5 rounded-2xl font-black text-xl transition-all duration-300 shadow-2xl shadow-emerald-900/40"
              >
                إنشاء مجلس جديد
              </motion.button>
            </div>
          </motion.div>
        </div>

        {/* Create Room Modal */}
        <AnimatePresence>
          {isCreateModalOpen && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 max-w-2xl w-full shadow-2xl relative overflow-hidden"
              >
                {/* Modal Background Glow */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
                
                <div className="flex justify-between items-center mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <Settings className="w-6 h-6 text-emerald-400" />
                    </div>
                    <h2 className="text-2xl font-black">تخصيص المجلس الجديد</h2>
                  </div>
                  <button 
                    onClick={() => setIsCreateModalOpen(false)} 
                    className="p-2 hover:bg-white/5 rounded-full transition-colors"
                  >
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>

                <form onSubmit={handleCreateRoom} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left Column: General Info */}
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">اسم المجلس</label>
                        <input
                          type="text"
                          placeholder="مثال: تدبر سورة الكهف"
                          value={newRoomName}
                          onChange={(e) => setNewRoomName(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all"
                          required
                        />
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">الحد الأقصى للمشاركين</label>
                          <span className="text-emerald-400 font-bold">{newMaxParticipants}</span>
                        </div>
                        <input 
                          type="range" min="2" max="50" 
                          value={newMaxParticipants}
                          onChange={(e) => setNewMaxParticipants(parseInt(e.target.value))}
                          className="w-full accent-emerald-500"
                        />
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">مدة التسجيل (ثانية)</label>
                          <span className="text-emerald-400 font-bold">{newRecordingDuration}</span>
                        </div>
                        <input 
                          type="range" min="10" max="300" step="10"
                          value={newRecordingDuration}
                          onChange={(e) => setNewRecordingDuration(parseInt(e.target.value))}
                          className="w-full accent-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Right Column: Visuals */}
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">لون السمة</label>
                        <div className="flex flex-wrap gap-3">
                          {themePresets.map(preset => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => setNewThemeColor(preset.id)}
                              className={`w-10 h-10 rounded-xl border-2 transition-all ${
                                newThemeColor === preset.id ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'
                              } ${preset.color}`}
                              title={preset.name}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">صورة الخلفية</label>
                        <div className="grid grid-cols-2 gap-3">
                          {bgPresets.map(bg => (
                            <button
                              key={bg.url}
                              type="button"
                              onClick={() => setNewThemeBg(bg.url)}
                              className={`h-20 rounded-xl border-2 overflow-hidden transition-all ${
                                newThemeBg === bg.url ? 'border-emerald-500 scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                              }`}
                            >
                              <img src={bg.url} alt={bg.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={isCreating || !newRoomName.trim()}
                      className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white py-5 rounded-2xl font-black text-xl transition-all duration-300 shadow-2xl shadow-emerald-900/40"
                    >
                      {isCreating ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'ابدأ المجلس الآن'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Rooms Section */}
        <section>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-10 gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                <Radio className="text-indigo-400 w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">المجالس النشطة</h2>
                <p className="text-slate-500 text-sm">استمع وشارك في التلاوات الجارية</p>
              </div>
            </div>

            <div className="relative w-full md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
              <input 
                type="text"
                placeholder="ابحث عن مجلس..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
              />
            </div>
          </div>
          
          <AnimatePresence mode="popLayout">
            {filteredRooms.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20 glass rounded-3xl border-dashed border-white/10"
              >
                <div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center mx-auto mb-6">
                  <Search className="text-slate-600 w-10 h-10" />
                </div>
                <p className="text-slate-400 text-lg">لا توجد مجالس تطابق بحثك حالياً.</p>
                <button 
                  onClick={() => setSearchQuery('')}
                  className="text-emerald-400 font-medium mt-2 hover:underline"
                >
                  عرض جميع المجالس
                </button>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredRooms.map((room, index) => (
                  <motion.div 
                    key={room.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleJoinRoom(room.id)}
                    className="group relative glass rounded-3xl p-6 hover:bg-white/10 transition-all duration-500 cursor-pointer border border-white/5 hover:border-emerald-500/30 overflow-hidden"
                  >
                    {/* Card Background Glow */}
                    <div className="absolute -right-10 -top-10 w-32 h-32 bg-emerald-500/10 blur-[50px] group-hover:bg-emerald-500/20 transition-all duration-500" />
                    
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center group-hover:scale-110 transition-transform duration-500 overflow-hidden">
                          <img 
                            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${room.hostId}`} 
                            alt="Host" 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg truncate max-w-[150px] group-hover:text-emerald-400 transition-colors">
                            {room.name}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Trophy className="w-3 h-3 text-amber-500" />
                            <span>مسابقة نشطة</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          room.status === 'waiting' 
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {room.status === 'waiting' ? 'انتظار' : 'جارية'}
                        </div>
                        <button
                          onClick={(e) => handleCopyLink(e, room.id)}
                          className={`p-2 rounded-lg transition-all duration-300 flex items-center gap-2 ${
                            copiedId === room.id 
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                              : 'bg-white/5 text-slate-500 hover:text-white border border-white/5 hover:bg-white/10'
                          }`}
                          title="نسخ رابط الغرفة"
                        >
                          {copiedId === room.id ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-bold uppercase">تم النسخ</span>
                            </>
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {(user.email === 'waleedelawady3@gmail.com' || user.email === 'waleedelawady32gamil.comm' || user.email === 'waleedelawady3@gamil.com') && (
                          <button
                            onClick={(e) => deleteRoom(e, room.id)}
                            className="p-2 rounded-lg bg-rose-500/10 text-rose-500 hover:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-all duration-300"
                            title="حذف الغرفة"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex -space-x-2">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="w-8 h-8 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center text-[10px] font-bold">
                            {i === 3 ? `+${(room.participants?.length || 0)}` : <Users className="w-3 h-3 text-slate-500" />}
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-sm font-bold text-emerald-400 group-hover:gap-4 transition-all duration-300">
                        <span>انضمام</span>
                        <Plus className="w-4 h-4" />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </section>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-white/5 mt-20">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3 opacity-50">
            <Mic className="w-5 h-5" />
            <span className="font-bold tracking-tight">تلاوة</span>
          </div>
          <div className="flex gap-8 text-sm text-slate-500">
            <a href="#" className="hover:text-white transition-colors">عن المنصة</a>
            <a href="#" className="hover:text-white transition-colors">الشروط والأحكام</a>
            <a href="#" className="hover:text-white transition-colors">تواصل معنا</a>
          </div>
          <p className="text-xs text-slate-600">© 2026 منصة تلاوة. جميع الحقوق محفوظة.</p>
        </div>
      </footer>
    </div>
  );
}
