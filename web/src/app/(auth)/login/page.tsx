"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, Lock, Mail, Target, User } from "lucide-react";

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const router = useRouter();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLogin && password !== confirmPassword) {
      setError("Passwords do not match. Please enter them again.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: username,
            }
          }
        });
        if (error) throw error;
        await supabase.auth.signOut();
        const confirmationMessage = `Account created. We sent a confirmation link to ${email}. Confirm your email address, then log in.`;
        setSuccess(confirmationMessage);
        setIsLogin(true);
        setPassword("");
        setConfirmPassword("");
        router.replace("/login");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred during authentication.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (loginMode: boolean) => {
    setIsLogin(loginMode);
    setError(null);
    setSuccess(null);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4 text-[var(--foreground)]">
      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-[var(--color-primary)] to-[var(--color-success)] text-white shadow-xl shadow-[var(--color-primary)]/20">
            <Target size={36} />
          </div>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight">OneStep</h1>
          <p className="mt-2 text-zinc-400">Level up your productivity.</p>
        </div>

        <div className="rounded-3xl border border-[var(--surface-border)] bg-[var(--surface)]/50 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-8 flex rounded-xl bg-zinc-900/50 p-1">
            <button
              type="button"
              onClick={() => switchMode(true)}
              className={`w-1/2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                isLogin ? "bg-[var(--surface-border)] text-white shadow-sm" : "text-zinc-400 hover:text-white"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => switchMode(false)}
              className={`w-1/2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                !isLogin ? "bg-[var(--surface-border)] text-white shadow-sm" : "text-zinc-400 hover:text-white"
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-400">Username</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                    <User size={18} />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required={!isLogin}
                    className="w-full rounded-xl border border-[var(--surface-border)] bg-zinc-900/50 py-3 pl-10 pr-4 text-white placeholder-zinc-500 transition-colors focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    placeholder="hero_player_1"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-400">Email Address</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--surface-border)] bg-zinc-900/50 py-3 pl-10 pr-4 text-white placeholder-zinc-500 transition-colors focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-400">Password</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--surface-border)] bg-zinc-900/50 py-3 pl-10 pr-12 text-white placeholder-zinc-500 transition-colors focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 hover:text-white"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {!isLogin && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-zinc-400">Confirm Password</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                    <Lock size={18} />
                  </div>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full rounded-xl border border-[var(--surface-border)] bg-zinc-900/50 py-3 pl-10 pr-12 text-white placeholder-zinc-500 transition-colors focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    placeholder="Re-enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((visible) => !visible)}
                    aria-label={showConfirmPassword ? "Hide confirmed password" : "Show confirmed password"}
                    aria-pressed={showConfirmPassword}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 hover:text-white"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {success && (
              <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-success)] py-3 font-bold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-70 disabled:hover:scale-100"
            >
              {loading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                isLogin ? "Enter the Arena" : "Create Account"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
