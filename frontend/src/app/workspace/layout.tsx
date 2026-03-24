'use client';

import { AppLayout } from "@/components/layout/AppLayout";
import ToastContainer from "@/components/ToastContainer";

export default function WorkspaceLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <ToastContainer />
            <AppLayout>
                {children}
            </AppLayout>
        </>
    );
}
