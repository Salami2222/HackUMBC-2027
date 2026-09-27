import { ExerciseBaseline } from '@/analysis/baseline';
import { Exercise, ExerciseFrame } from '@/analysis/types';

export const HISTORY_LIMIT = 150;

type Series = {
  key: keyof Pick<
    ExerciseFrame,
    'leftKneeAngle' | 'rightKneeAngle' | 'hipAngle' | 'torsoLean' | 'depth'
  >;
  label: string;
  color: string;
};

const graphs: { title: string; min: number; max: number; series: Series[] }[] =
  [
    {
      title: 'Knee angle',
      min: 60,
      max: 180,
      series: [
        { key: 'leftKneeAngle', label: 'Left', color: '#b79aff' },
        { key: 'rightKneeAngle', label: 'Right', color: '#75d6d0' },
      ],
    },
    {
      title: 'Hip angle',
      min: 50,
      max: 180,
      series: [{ key: 'hipAngle', label: 'Hip', color: '#b79aff' }],
    },
    {
      title: 'Torso lean',
      min: 0,
      max: 55,
      series: [{ key: 'torsoLean', label: 'Torso', color: '#b79aff' }],
    },
    {
      title: 'Squat depth',
      min: 0,
      max: 110,
      series: [{ key: 'depth', label: 'Depth', color: '#b79aff' }],
    },
  ];

export function MovementGraphs({
  frames,
  baseline,
  exercise,
}: {
  frames: ExerciseFrame[];
  baseline: ExerciseBaseline | null;
  exercise: Exercise;
}) {
  return (
    <section className="movement-graphs" aria-label="Live movement graphs">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Movement over time</span>
          <h2>Live motion</h2>
        </div>
        <span className="graph-caption">
          Latest 5 seconds · dashed line is warm-up benchmark
        </span>
      </div>
      <div className="graph-grid">
        {graphs.map((graph) => {
          const title =
            exercise === 'deadlift' && graph.title === 'Squat depth'
              ? 'Lift travel'
              : graph.title;
          const y = (value: number) =>
            94 -
            ((Math.min(graph.max, Math.max(graph.min, value)) - graph.min) /
              (graph.max - graph.min)) *
              78;
          const x = (index: number) => 8 + (index / (HISTORY_LIMIT - 1)) * 304;
          return (
            <div className="movement-graph" key={graph.title}>
              <div className="graph-header">
                <h3>{title}</h3>
                <div className="graph-legend">
                  {graph.series.map((series) => (
                    <span key={series.key}>
                      <i style={{ background: series.color }} />
                      {series.label}
                    </span>
                  ))}
                </div>
              </div>
              <svg
                viewBox="0 0 320 110"
                preserveAspectRatio="none"
                role="img"
                aria-label={`${title} movement trace${baseline ? ' and warm-up baseline' : ''}`}
              >
                <line
                  x1="8"
                  x2="312"
                  y1="16"
                  y2="16"
                  className="graph-gridline"
                />
                <line
                  x1="8"
                  x2="312"
                  y1="55"
                  y2="55"
                  className="graph-gridline"
                />
                <line
                  x1="8"
                  x2="312"
                  y1="94"
                  y2="94"
                  className="graph-gridline"
                />
                {baseline &&
                  graph.series.map((series) => (
                    <line
                      key={series.key}
                      x1="8"
                      x2="312"
                      y1={y(baseline[series.key])}
                      y2={y(baseline[series.key])}
                      className="graph-baseline"
                      style={{ stroke: series.color }}
                    />
                  ))}
                {frames.length > 1 &&
                  graph.series.map((series) => (
                    <polyline
                      key={series.key}
                      points={frames
                        .map(
                          (frame, index) =>
                            `${x(index)},${y(frame[series.key])}`
                        )
                        .join(' ')}
                      fill="none"
                      stroke={series.color}
                      strokeDasharray={
                        series.key === 'rightKneeAngle' ? '5 4' : undefined
                      }
                      strokeWidth="2.5"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
              </svg>
              {!frames.length && (
                <span className="graph-empty">Record a baseline to begin</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
