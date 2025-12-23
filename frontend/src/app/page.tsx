'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { workspaceService } from '@/services/api';
import { Loader2, Plus } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const ws = await workspaceService.create(name, 'agent');
      router.push(`/workspace/${ws.id}`);
    } catch (err) {
      console.error(err);
      alert('Failed to create workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-blue-500 mb-2">
            RedAgent
          </h1>
          <p className="text-gray-400">
            AI-Powered Penetration Testing Platform
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 shadow-xl">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-400" />
            New Session
          </h2>

          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-400 mb-1">
                Workspace Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Target-Alpha-Scan"
                className="w-full bg-gray-950 border border-gray-800 rounded-md px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Initializing Sandbox...
                </>
              ) : (
                'Start Session'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
