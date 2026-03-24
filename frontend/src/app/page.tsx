'use client';

import { WorkspaceDashboard } from '@/components/WorkspaceDashboard';
import { AppLayout } from '@/components/layout/AppLayout';

export default function Home() {
  return (
    <AppLayout>
      <WorkspaceDashboard />
    </AppLayout>
  );
}
