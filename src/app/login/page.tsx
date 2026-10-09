'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

    if (error) {
      setErro(
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : error.message
      );
      setCarregando(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <main className="flex-1 grid place-items-center px-4">
      <div className="w-full max-w-sm">
      <div className="mb-8 flex justify-center">
        <Image src="/logo-resili-sevenn.png" alt="Resili Sevenn" width={384} height={40} className="h-10 w-auto" priority />
      </div>
      <form onSubmit={entrar} className="card w-full p-6">
        <h1 className="font-display text-2xl">Tráfego</h1>
        <p className="text-sm text-muted mt-1 mb-6">Entre para acessar o painel.</p>

        <div className="mb-3">
          <label className="label" htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div className="mb-5">
          <label className="label" htmlFor="senha">Senha</label>
          <input
            id="senha"
            type="password"
            className="input"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {erro && (
          <p className="text-sm text-bad mb-4" role="alert">{erro}</p>
        )}

        <button type="submit" className="btn btn-primary w-full" disabled={carregando}>
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      </div>
    </main>
  );
}
