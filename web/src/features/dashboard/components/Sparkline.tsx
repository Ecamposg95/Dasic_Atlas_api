import { Area, AreaChart, ResponsiveContainer } from 'recharts';

const TONES: Record<string, string> = {
  emerald: '#10b981',
  cyan: '#2ee6a8',
  rose: '#f43f5e',
  slate: '#94a3b8',
};

export function Sparkline({
  data,
  tone = 'cyan',
}: {
  data: number[];
  tone?: 'emerald' | 'cyan' | 'rose' | 'slate';
}) {
  if (!data || data.length < 2) return null;
  const color = TONES[tone] ?? TONES.cyan;
  const points = data.map((v, i) => ({ i, v }));
  const id = `spark-${tone}`;
  return (
    <div className="h-9 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${id})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
