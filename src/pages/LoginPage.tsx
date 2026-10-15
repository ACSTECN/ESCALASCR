import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { CalendarDays, Mail, Lock, Loader2 } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const from = (location.state as { from?: string })?.from || '/';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await refreshProfile();
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err?.message || (err && typeof err === 'object' ? JSON.stringify(err) : 'Erro ao entrar'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      setError('Informe email e senha para cadastrar');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nome: email.split('@')[0], perfil: 'operador' } },
      });
      if (error) throw error;
      setError('Cadastro criado! Verifique seu email para confirmar.');
    } catch (err: any) {
      setError(err?.message || (err && typeof err === 'object' ? JSON.stringify(err) : 'Erro ao cadastrar'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-600 mb-4">
            <CalendarDays className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-white">Escalas CR</h1>
          <p className="text-slate-300 mt-1">Gestão de Coletas por HUB</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-6">Acessar sistema</h2>

          {!isSupabaseConfigured && (
            <div className="mb-4 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm border border-amber-200">
              ⚠️ Supabase não configurado. Crie um arquivo <code className="bg-amber-100 px-1 rounded">.env</code> com <code className="bg-amber-100 px-1 rounded">VITE_SUPABASE_URL</code> e <code className="bg-amber-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code>.
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="email"
                  className="input pl-10"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="label">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="password"
                  className="input pl-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" size={18} /> : 'Entrar'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handleSignUp}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium"
              disabled={loading}
            >
              Criar nova conta
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100 text-xs text-slate-400 text-center">
            <p>
              Após criar a conta, peça a um administrador para elevar seu perfil.
              <br />
              Para tornar um usuário admin, execute no Supabase SQL:
            </p>
            <code className="block mt-2 p-2 bg-slate-50 rounded text-slate-600">
              update usuarios set perfil = 'admin' where email = 'seu@email.com';
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
