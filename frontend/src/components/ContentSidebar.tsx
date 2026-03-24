'use client';

import { usePathname } from 'next/navigation';
import { WorkspaceList } from './WorkspaceList';
import { ConversationSidebar } from './ConversationSidebar';

export function ContentSidebar() {
    const pathname = usePathname();

    // Determine which content to show based on current route
    const getContent = () => {
        // Hide sidebar on home page
        if (pathname === '/') {
            return null;
        }

        // If in a specific workspace conversation view
        if (pathname.match(/^\/workspace\/[^/]+\/c\//)) {
            return <ConversationSidebar />;
        }

        // If in workspace settings
        if (pathname.match(/^\/workspace\/[^/]+\/settings/)) {
            return <ConversationSidebar />;
        }

        // If in a specific workspace (but not conversation or settings)
        if (pathname.match(/^\/workspace\/[^/]+$/)) {
            return <ConversationSidebar />;
        }

        // Default: show workspace list (home, workspace list page, etc.)
        return <WorkspaceList />;
    };

    return getContent();
}
