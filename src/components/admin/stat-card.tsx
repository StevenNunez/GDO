'use client';

import { StatTile, type StatTone } from '@/components/ui/stat-tile';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  tone?: StatTone;
}

/** @deprecated Usar `StatTile` de `@/components/ui/stat-tile` directamente. */
export function StatCard({ title, value, icon, tone }: StatCardProps) {
  return <StatTile label={title} value={value} icon={icon} tone={tone} />;
}
