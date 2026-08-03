// 4 tarjetas de resumen por bucket de aging.

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { AgingBucket } from '../types';

const BUCKET_META: Record<
  string,
  { label: string; accentClass: string; textClass: string; borderClass: string }
> = {
  '0-30': {
    label: '0 – 30 días',
    accentClass: 'bg-emerald-500',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    borderClass: 'border-l-emerald-500',
  },
  '31-60': {
    label: '31 – 60 días',
    accentClass: 'bg-amber-500',
    textClass: 'text-amber-600 dark:text-amber-400',
    borderClass: 'border-l-amber-500',
  },
  '61-90': {
    label: '61 – 90 días',
    accentClass: 'bg-orange-500',
    textClass: 'text-orange-600 dark:text-orange-400',
    borderClass: 'border-l-orange-500',
  },
  '90+': {
    label: '90+ días',
    accentClass: 'bg-rose-500',
    textClass: 'text-rose-600 dark:text-rose-400',
    borderClass: 'border-l-rose-500',
  },
};

function fmtMXN(n: number): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  buckets: AgingBucket[];
  loading: boolean;
}

function BucketSkeleton() {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

export function AgingBuckets({ buckets, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <BucketSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {buckets.map((bucket) => {
        const meta = BUCKET_META[bucket.rango] ?? {
          label: bucket.rango,
          accentClass: 'bg-muted-foreground',
          textClass: 'text-muted-foreground',
          borderClass: 'border-l-muted-foreground',
        };
        return (
          <Card
            key={bucket.rango}
            className={`border-l-4 ${meta.borderClass}`}
          >
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                {meta.label}
              </p>
              <p className={`text-xl font-bold tabular-nums ${meta.textClass}`}>
                ${fmtMXN(bucket.monto)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {bucket.count} cargo{bucket.count !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
