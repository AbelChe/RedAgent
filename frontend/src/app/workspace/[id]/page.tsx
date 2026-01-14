'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { conversationService } from '@/services/conversations';
import { Loader2 } from 'lucide-react';
import moment from 'moment';

export default function WorkspaceRedirect() {
    const params = useParams();
    const router = useRouter();
    const workspaceId = params.id as string;

    useEffect(() => {
        if (!workspaceId) return;

        const init = async () => {
            try {
                // Fetch recent conversations
                const list = await conversationService.list(workspaceId);

                if (list.length > 0) {
                    // Redirect to most recent
                    router.replace(`/workspace/${workspaceId}/c/${list[0].id}`);
                } else {
                    // Create new conversation
                    const title = `Conversation ${moment().format('MM-DD HH:mm')}`;
                    const newConv = await conversationService.create(workspaceId, { title });
                    router.replace(`/workspace/${workspaceId}/c/${newConv.id}`);
                }
            } catch (error) {
                console.error('Failed to initialize workspace:', error);
            }
        };

        init();
    }, [workspaceId, router]);

    return (
        <div className="flex h-screen w-full items-center justify-center bg-gray-950 text-gray-400 flex-col gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm font-medium">Loading workspace...</p>
        </div>
    );
}
