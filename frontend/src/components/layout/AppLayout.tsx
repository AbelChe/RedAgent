'use client';

import { IconSidebar } from '@/components/IconSidebar';
import { ContentSidebar } from '@/components/ContentSidebar';

interface AppLayoutProps {
    children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
    return (
        <div className="flex h-screen bg-gray-950 overflow-hidden">
            {/* Icon Sidebar - Fixed 60px */}
            <IconSidebar />

            {/* Content Sidebar - Dynamic based on route */}
            <ContentSidebar />

            {/* Main Content Area */}
            <main className="flex-1 overflow-hidden">
                {children}
            </main>
        </div>
    );
}
