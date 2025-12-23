import { Bot } from 'lucide-react';

export default function EmptyWorkspace() {
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-950 text-gray-500">
            <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mb-6 shadow-xl border border-gray-800">
                <Bot className="w-8 h-8 text-blue-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-200 mb-2">RedAgent</h2>
            <p className="max-w-md text-center text-gray-500 text-sm">
                Select a conversation from the sidebar to continue, or start a new session to begin a security assessment.
            </p>
        </div>
    );
}
