'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Home, Briefcase, User } from 'lucide-react';
import clsx from 'clsx';

interface NavItem {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    path: string;
}

const navItems: NavItem[] = [
    {
        id: 'home',
        label: 'Home',
        icon: Home,
        path: '/'
    },
    {
        id: 'workspaces',
        label: 'Workspaces',
        icon: Briefcase,
        path: '/workspace'
    },
    {
        id: 'settings',
        label: 'User Settings',
        icon: User,
        path: '/settings'
    }
];

export function IconSidebar() {
    const router = useRouter();
    const pathname = usePathname();

    const isActive = (item: NavItem) => {
        if (item.path === '/') {
            return pathname === '/';
        }
        return pathname.startsWith(item.path);
    };

    return (
        <div className="w-16 bg-gray-950 border-r border-gray-800 flex flex-col items-center py-4">
            {/* Logo */}
            <div className="mb-8">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                    R
                </div>
            </div>

            {/* Navigation Items */}
            <nav className="flex-1 flex flex-col gap-2 w-full px-2">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item);

                    return (
                        <button
                            key={item.id}
                            onClick={() => router.push(item.path)}
                            className={clsx(
                                'relative w-12 h-12 rounded-lg flex items-center justify-center transition-all group',
                                active
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                            )}
                            title={item.label}
                        >
                            {/* Active indicator */}
                            {active && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-400 rounded-r-full" />
                            )}

                            <Icon className="w-5 h-5" />

                            {/* Tooltip */}
                            <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                                {item.label}
                            </div>
                        </button>
                    );
                })}
            </nav>

            {/* User Avatar (Bottom) */}
            <div className="mt-auto">
                <button
                    className="w-10 h-10 rounded-full bg-gray-800 border-2 border-gray-700 flex items-center justify-center text-gray-400 hover:border-blue-500 transition-colors"
                    title="User Profile"
                >
                    <User className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
