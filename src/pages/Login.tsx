import { loginWithGoogle } from '../firebase';
import { BookOpen, LogIn } from 'lucide-react';

export default function Login() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-slate-200 shadow-xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">مسابقات تلاوة</h1>
          <p className="text-slate-500 text-center mt-2">انضم إلى غرف تلاوة القرآن المباشرة، تنافس، وحسّن تلاوتك.</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={loginWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white py-3 px-4 rounded-xl font-medium hover:bg-slate-800 transition-colors"
          >
            <LogIn className="w-5 h-5" />
            المتابعة باستخدام جوجل
          </button>
        </div>
        
        <p className="text-xs text-slate-400 text-center mt-8">
          بالمتابعة، أنت توافق على شروط الخدمة وسياسة الخصوصية.
        </p>
      </div>
    </div>
  );
}
