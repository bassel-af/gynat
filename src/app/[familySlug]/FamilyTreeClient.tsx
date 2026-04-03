'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { TreeProvider } from '@/context/TreeContext';
import { useTree } from '@/context/TreeContext';
import { useGedcomData } from '@/hooks/useGedcomData';
import { useTreeColorOverrides } from '@/hooks/useTreeColorOverrides';
import { FamilyTree } from '@/components/tree';
import { Sidebar } from '@/components/ui';
import { Playground } from '@/components/dev/Playground';
import type { FamilyConfig } from '@/config/families';

interface FamilyTreeClientProps {
  familyConfig: FamilyConfig;
}

interface MainAppProps {
  gedcomFile: string;
  showSidebar: boolean;
  showMinimap: boolean;
  showControls: boolean;
}

function MainApp({ gedcomFile, showSidebar, showMinimap, showControls }: MainAppProps) {
  const { isLoading, error } = useTree();

  // Load GEDCOM data
  useGedcomData(gedcomFile);
  useTreeColorOverrides();

  if (error) {
    return (
      <div className="error">
        خطأ في تحميل شجرة العائلة: {error}
      </div>
    );
  }

  if (isLoading) {
    return <div className="loading">جاري تحميل شجرة العائلة...</div>;
  }

  return (
    <div className="app-layout">
      {showSidebar && <Sidebar />}
      <main className="main-content">
        <FamilyTree hideMiniMap={!showMinimap} hideControls={!showControls} />
      </main>
    </div>
  );
}

function FamilyContent({ familyConfig }: FamilyTreeClientProps) {
  const searchParams = useSearchParams();
  const isPlayground = searchParams.has('playground');

  if (isPlayground) {
    return <Playground />;
  }

  // Test mode visibility flags
  const onlyCanvas = searchParams.get('only') === 'canvas';
  const showSidebar = !searchParams.has('no-sidebar') && !onlyCanvas;
  const showMinimap = false; // Disabled — was: !searchParams.has('no-minimap') && !onlyCanvas;
  const showControls = !searchParams.has('no-controls') && !onlyCanvas;

  return (
    <MainApp
      gedcomFile={familyConfig.gedcomFile}
      showSidebar={showSidebar}
      showMinimap={showMinimap}
      showControls={showControls}
    />
  );
}

export function FamilyTreeClient({ familyConfig }: FamilyTreeClientProps) {
  return (
    <TreeProvider key={familyConfig.slug} forcedRootId={familyConfig.rootId}>
      <Suspense fallback={<div className="loading">جاري التحميل...</div>}>
        <FamilyContent familyConfig={familyConfig} />
      </Suspense>
    </TreeProvider>
  );
}
