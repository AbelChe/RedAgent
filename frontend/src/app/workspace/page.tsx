'use client';

import { useState } from 'react';
import { CreateWorkspaceModal } from '@/components/CreateWorkspaceModal';
import { Plus, Terminal, ArrowLeft } from 'lucide-react';
import { Workspace } from '@/types';

export default function WorkspaceWelcome() {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const handleCreateSuccess = (newWorkspace: Workspace) => {
        setIsCreateModalOpen(false);
        // Navigation is handled by the sidebar or explicit user action, 
        // but typically we might want to redirect to the new workspace here if desired.
        // For now, just close modal to keep context.
        window.location.href = `/workspace/${newWorkspace.id}`;
    };

    return (
        <main className="flex-1 bg-gray-950 flex flex-col items-center justify-center p-6 h-screen text-center">
            <div className="max-w-md w-full space-y-8">
                <div className="relative w-24 h-24 mx-auto">
                    <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl animate-pulse" />
                    <div className="relative bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-2xl">
                        <Terminal className="w-full h-full text-blue-400" />
                    </div>
                </div>

                <div className="space-y-3">
                    <h1 className="text-3xl font-bold text-white tracking-tight">
                        Select a Workspace
                    </h1>
                    <p className="text-gray-400 text-lg">
                        Choose a workspace from the sidebar on the left to start working, or create a new one.
                    </p>
                </div>

                <div className="pt-4 flex flex-col gap-4 items-center">
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="group relative flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 hover:-translate-y-0.5"
                    >
                        <Plus className="w-5 h-5" />
                        <span className="text-lg">Create New Workspace</span>
                    </button>

                    <div className="flex items-center gap-2 text-sm text-gray-500 animate-bounce mt-8">
                        <ArrowLeft className="w-4 h-4" />
                        <span>Use the sidebar to navigate</span>
                    </div>
                </div>
            </div>

            <CreateWorkspaceModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSuccess={handleCreateSuccess}
            />
        </main>
    );
}
