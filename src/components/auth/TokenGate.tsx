import { useState } from 'react';
import { useArenaStore } from '../../store/useArenaStore';
import { validateToken } from '../../api/arena';

export default function TokenGate() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setToken } = useArenaStore();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = input.trim();
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const me = await validateToken(token);
      setToken(token, me.slug);
    } catch {
      setError('Invalid token — please check and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-md">
        <h1 className="text-2xl font-semibold text-stone-900 mb-1">Arena Zine Maker</h1>
        <p className="text-stone-500 text-sm mb-8">
          Connect your Are.na account to start building zines from your channels.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Personal Access Token
            </label>
            <input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste your token here"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-500"
              autoFocus
            />
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-full bg-stone-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Connecting…' : 'Connect'}
          </button>
        </form>

        <p className="text-xs text-stone-400 mt-6">
          Generate a token at{' '}
          <a
            href="https://dev.are.na/oauth/applications"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-stone-600"
          >
            dev.are.na/oauth/applications
          </a>
          . Your token is stored locally and never sent anywhere except Are.na.
        </p>
      </div>
    </div>
  );
}
