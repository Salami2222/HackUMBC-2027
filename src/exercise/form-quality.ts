import type { SquatPhase } from './squat-phase';

export type FormRating = 'optimal' | 'suboptimal' | 'attention' | 'unknown';
export const FORM_LABELS: Record<FormRating, string> = {
  optimal: 'Optimal',
  suboptimal: 'Sub-optimal',
  attention: 'Needs attention',
  unknown: 'Insufficient data',
};
// Engineering defaults for the measured-movement profile, not clinical risk thresholds.
export const FORM_PROFILE = 'measured-movement-v2';
export const UNASSESSED =
  'Knee collapse, hip / spine posture, heel contact, foot pressure, load and core bracing are not assessed.';
export const GROUPS = [
  {
    id: 'symmetry',
    label: 'Knee symmetry',
    weight: 25,
    critical: true,
    cue: 'Aim for both knees to bend and straighten together.',
  },
  {
    id: 'torso',
    label: 'Torso control',
    weight: 20,
    critical: true,
    cue: 'Keep your chest from tipping sideways or dropping further as you rise.',
  },
  {
    id: 'control',
    label: 'Lowering control',
    weight: 20,
    critical: true,
    cue: 'Try a smoother, more controlled lowering phase.',
  },
  {
    id: 'depth',
    label: 'Depth target',
    weight: 20,
    critical: false,
    cue: 'Review the depth trace against the configured 98° knee-bend target.',
  },
  {
    id: 'feet',
    label: 'Foot orientation',
    weight: 10,
    critical: true,
    cue: 'Review foot rolling and ankle asymmetry; check foot straps before the next set.',
  },
  {
    id: 'head',
    label: 'Head control',
    weight: 5,
    critical: false,
    cue: 'Keep your head steadier, without a sustained tilt or turn.',
  },
] as const;
export type GroupId = (typeof GROUPS)[number]['id'];
export type FormValues = Record<string, number | null | undefined>;
export interface FormSample {
  at: number;
  phase: SquatPhase;
  values: FormValues;
}
export interface GroupResult {
  id: GroupId;
  label: string;
  weight: number;
  severity: number;
  coverage: number;
  issueMs: number;
  evidence: string;
  cue: string;
}
export interface FormRep {
  rep: number;
  score: number | null;
  rating: FormRating;
  coverage: number;
  groups: GroupResult[];
  reason: string;
  completedAt: number;
  jev?: {
    measuredScore: number | null;
    proposedScore: number | null;
    weight: number;
    reason: string;
    summary?: FormReview;
    attempts?: number;
    latencyMs?: number;
    httpStatus?: number;
    factors?: {
      id: string;
      proposedSeverity: number;
      applied: boolean;
      reason: string;
    }[];
  };
}
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const excess = (v: number, acceptable: number, severe: number) =>
  clamp((v - acceptable) / (severe - acceptable));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Compare by elapsed time, not frame count: feeds can run from 10 to 100 Hz. */
function motionWindow(samples: FormSample[], i: number) {
  const current = samples[i];
  let j = i;
  while (j > 0 && current.at - samples[j].at < 300) j--;
  const previous = samples[j];
  const seconds = (current.at - previous.at) / 1000;
  const contiguous = samples
    .slice(j + 1, i + 1)
    .every(
      (s, k) =>
        s.at - samples[j + k].at <= 250 &&
        finite(s.values.leftKnee) &&
        finite(s.values.rightKnee)
    );
  const speed =
    seconds >= 0.15 &&
    seconds <= 0.5 &&
    contiguous &&
    [
      current.values.leftKnee,
      current.values.rightKnee,
      previous.values.leftKnee,
      previous.values.rightKnee,
    ].every(finite)
      ? (current.values.leftKnee! +
          current.values.rightKnee! -
          previous.values.leftKnee! -
          previous.values.rightKnee!) /
        (2 * seconds)
      : null;
  return { previous, speed };
}

/** Missing samples contribute no evidence. They never become zero-severity observations. */
function sustained(
  samples: FormSample[],
  read: (s: FormSample, i: number) => number | null
) {
  let validMs = 0,
    runMs = 0,
    runSeverity = 0,
    severity = 0,
    issueMs = 0;
  const duration = Math.max(100, samples.at(-1)!.at - samples[0].at + 100);
  const finishRun = () => {
    if (runMs >= 350) {
      // Concave ramp makes persistent moderate deviations matter, without lowering targets.
      severity = Math.max(severity, Math.sqrt(runSeverity / runMs));
      issueMs += runMs;
    }
    runMs = 0;
    runSeverity = 0;
  };
  samples.forEach((s, i) => {
    const gap = i ? s.at - samples[i - 1].at : 100;
    const dt = Math.max(0, Math.min(150, gap));
    if (gap > 250) finishRun();
    const value = read(s, i);
    if (value == null || !finite(value)) {
      finishRun();
      return;
    }
    validMs += dt;
    if (value >= 0.02) {
      runMs += dt;
      runSeverity += value * dt;
    } else finishRun();
  });
  finishRun();
  return { severity, coverage: clamp(validMs / duration), issueMs };
}

export function evaluateFormRep(
  samples: FormSample[],
  rep: number,
  depth: number,
  at: number
): FormRep {
  if (samples.length < 8 || samples.at(-1)!.at - samples[0].at < 700)
    return {
      rep,
      score: null,
      rating: 'unknown',
      coverage: 0,
      groups: [],
      reason: 'Not enough fresh movement samples.',
      completedAt: at,
    };
  const has = (s: FormSample, keys: string[]) => keys.every((k) => finite(s.values[k]));
  const num = (s: FormSample, k: string) => s.values[k] as number;
  const peak = (keys: string[], f: (s: FormSample) => number) =>
    Math.max(0, ...samples.filter((s) => has(s, keys)).map(f));
  const windows = samples.map((_, i) => motionWindow(samples, i));
  const kneeSpeed = (i: number) => windows[i].speed;
  const gap = peak(['leftKnee', 'rightKnee'], (s) =>
    Math.abs(num(s, 'leftKnee') - num(s, 'rightKnee'))
  );
  const roll = peak(['chestRoll'], (s) => Math.abs(num(s, 'chestRoll')));
  const head = peak(['headInclination'], (s) => Math.abs(num(s, 'headInclination')));
  const footRoll = peak(['leftFootRoll', 'rightFootRoll'], (s) =>
    Math.max(Math.abs(num(s, 'leftFootRoll')), Math.abs(num(s, 'rightFootRoll')))
  );
  const lowering = Math.max(0, ...samples.map((_, i) => kneeSpeed(i) ?? 0));
  const riseDrops = samples.map((s, i) => {
    const { previous, speed } = windows[i];
    return speed != null &&
      speed < -8 &&
      finite(s.values.chestTilt) &&
      finite(previous.values.chestTilt)
      ? Math.max(0, Math.abs(s.values.chestTilt) - Math.abs(previous.values.chestTilt))
      : 0;
  });
  const ankleGap = peak(['leftAnkle', 'rightAnkle'], (s) =>
    Math.abs(num(s, 'leftAnkle') - num(s, 'rightAnkle'))
  );
  const headRoll = peak(['headRoll'], (s) => Math.abs(num(s, 'headRoll')));
  const headTurn = peak(['headTurn'], (s) => Math.abs(num(s, 'headTurn')));

  const observations: Record<
    GroupId,
    { severity: number; coverage: number; issueMs: number; evidence: string }
  > = {
    symmetry: {
      ...sustained(samples, (s) =>
        has(s, ['leftKnee', 'rightKnee'])
          ? excess(Math.abs(num(s, 'leftKnee') - num(s, 'rightKnee')), 12, 30)
          : null
      ),
      evidence: `Peak knee-bend difference ${gap.toFixed(1)}°`,
    },
    torso: {
      ...sustained(samples, (s, i) => {
        if (!has(s, ['chestRoll', 'chestTilt'])) return null;
        // Ordinary forward lean is allowed; extra chest drop while rising is assessed.
        const drop = excess(riseDrops[i], 8, 20);
        return Math.max(excess(Math.abs(num(s, 'chestRoll')), 10, 25), drop);
      }),
      evidence: `Peak sideways chest tilt ${roll.toFixed(1)}°; extra chest drop while rising ${Math.max(...riseDrops).toFixed(1)}°`,
    },
    control: {
      ...sustained(samples, (s, i) => {
        if (!has(s, ['leftKnee', 'rightKnee'])) return null;
        const speed = kneeSpeed(i);
        // Fast ascent and a deliberate pause are not automatically poor form.
        return speed == null ? 0 : excess(speed, 140, 260);
      }),
      evidence: `Peak filtered lowering speed ${lowering.toFixed(0)}°/s`,
    },
    depth: {
      ...sustained(samples, (s) => (has(s, ['leftKnee', 'rightKnee']) ? 0 : null)),
      severity: depth >= 98 ? 0 : Math.sqrt(clamp((98 - depth) / 38)),
      evidence: `Bilateral knee bend ${depth.toFixed(1)}° / 98° target`,
    },
    feet: {
      ...sustained(samples, (s) =>
        has(s, ['leftFootRoll', 'rightFootRoll', 'leftAnkle', 'rightAnkle'])
          ? Math.max(
              excess(
                Math.max(
                  Math.abs(num(s, 'leftFootRoll')),
                  Math.abs(num(s, 'rightFootRoll'))
                ),
                12,
                28
              ),
              excess(Math.abs(num(s, 'leftAnkle') - num(s, 'rightAnkle')), 15, 35)
            )
          : null
      ),
      evidence: `Peak foot roll ${footRoll.toFixed(1)}°; ankle difference ${ankleGap.toFixed(1)}°. Contact is unknown.`,
    },
    head: {
      ...sustained(samples, (s) =>
        has(s, ['headInclination', 'headRoll', 'headTurn'])
          ? Math.max(
              excess(Math.abs(num(s, 'headInclination')), 35, 55),
              excess(Math.abs(num(s, 'headRoll')), 15, 35),
              excess(Math.abs(num(s, 'headTurn')), 30, 60)
            )
          : null
      ),
      evidence: `Peak head inclination ${head.toFixed(1)}° / ±35° target; side tilt ${headRoll.toFixed(1)}°; turn ${headTurn.toFixed(1)}°`,
    },
  };
  const groups = GROUPS.map((g) => ({ ...g, ...observations[g.id] }));
  const coverage = Math.min(...groups.map((g) => g.coverage));
  if (coverage < 0.85)
    return {
      rep,
      score: null,
      rating: 'unknown',
      coverage,
      groups,
      reason:
        'One or more measurement groups had less than 85% usable sample coverage.',
      completedAt: at,
    };
  const score =
    Math.round((100 - groups.reduce((sum, g) => sum + g.weight * g.severity, 0)) * 10) /
    10;
  const issues = groups.filter((g) => g.severity >= 0.15);
  const severeGroups = groups.filter((g) => g.critical && g.severity >= 0.65);
  // Cap each group, and require separate substantial issues before the red band.
  const attention = score < 65 && severeGroups.length >= 2;
  return {
    rep,
    score,
    rating: attention
      ? 'attention'
      : issues.length || score < 85
        ? 'suboptimal'
        : 'optimal',
    coverage,
    groups,
    reason: '',
    completedAt: at,
  };
}

export interface FormReview {
  schema: 'form-summary-v1';
  rep: number;
  at: number;
  stage: 'ascent' | 'late-ascent';
  reference: 'upright-relative';
  metrics: Record<string, number | null>;
  groups: { id: GroupId; coverage: number; severity: number; issueMs: number }[];
}

/** Only fixed, derived scalar features leave the browser; raw samples stay local. */
export function summarizeFormReview(
  samples: FormSample[],
  assessment: FormRep
): FormReview {
  const last = samples.at(-1)!;
  const round = (v: number) => Math.round(v * 100) / 100;
  const values = (key: string) => samples.map((s) => s.values[key]).filter(finite);
  const extreme = (key: string, kind: 'min' | 'max' | 'abs' = 'abs') => {
    const list = values(key);
    return list.length
      ? round(
          kind === 'min'
            ? Math.min(...list)
            : kind === 'max'
              ? Math.max(...list)
              : Math.max(...list.map(Math.abs))
        )
      : null;
  };
  const dt = (i: number) =>
    i === 0 ? 0 : Math.min(150, samples[i].at - samples[i - 1].at);
  const elapsed = (test: (s: FormSample) => boolean) =>
    round(samples.reduce((sum, s, i) => sum + (test(s) ? dt(i) : 0), 0));
  const joint = (a: string, b: string) =>
    samples.filter((s) => finite(s.values[a]) && finite(s.values[b]));
  const gap = (a: string, b: string) => {
    const list = joint(a, b);
    return list.length
      ? round(Math.max(...list.map((s) => Math.abs(s.values[a]! - s.values[b]!))))
      : null;
  };
  const windows = samples.map((_, i) => motionWindow(samples, i));
  const speeds = windows.map((w) => w.speed);
  const lowering = speeds.filter(
    (v, i) => finite(v) && samples[i].phase === 'descending'
  ) as number[];
  const rising = speeds.filter(
    (v, i) => finite(v) && samples[i].phase === 'ascending'
  ) as number[];
  const drops = samples.flatMap((s, i) => {
    const prev = windows[i].previous;
    return speeds[i] != null &&
      speeds[i]! < -8 &&
      finite(s.values.chestTilt) &&
      finite(prev.values.chestTilt)
      ? [Math.max(0, Math.abs(s.values.chestTilt) - Math.abs(prev.values.chestTilt))]
      : [];
  });
  const knees = joint('leftKnee', 'rightKnee');
  const bilateralPeak = knees.length
    ? Math.max(...knees.map((s) => Math.min(s.values.leftKnee!, s.values.rightKnee!)))
    : null;
  return {
    schema: 'form-summary-v1',
    rep: assessment.rep,
    at: last.at,
    stage:
      Math.max(last.values.leftKnee ?? 180, last.values.rightKnee ?? 180) <= 30
        ? 'late-ascent'
        : 'ascent',
    reference: 'upright-relative',
    metrics: {
      observedDurationMs: last.at - samples[0].at,
      descentObservedMs: elapsed((s) => s.phase === 'descending'),
      bottomObservedMs: elapsed((s) => s.phase === 'bottom'),
      ascentObservedMs: elapsed((s) => s.phase === 'ascending'),
      sampleCount: samples.length,
      largestGapMs: Math.max(
        0,
        ...samples.slice(1).map((s, i) => s.at - samples[i].at)
      ),
      leftKneePeakDeg: extreme('leftKnee', 'max'),
      rightKneePeakDeg: extreme('rightKnee', 'max'),
      bilateralPeakDeg: bilateralPeak == null ? null : round(bilateralPeak),
      currentLeftKneeDeg: finite(last.values.leftKnee)
        ? round(last.values.leftKnee)
        : null,
      currentRightKneeDeg: finite(last.values.rightKnee)
        ? round(last.values.rightKnee)
        : null,
      kneeDifferencePeakDeg: gap('leftKnee', 'rightKnee'),
      kneeDifferenceOver12Ms: knees.length
        ? elapsed(
            (s) =>
              finite(s.values.leftKnee) &&
              finite(s.values.rightKnee) &&
              Math.abs(s.values.leftKnee - s.values.rightKnee) > 12
          )
        : null,
      chestSideTiltPeakDeg: extreme('chestRoll'),
      chestSideTiltOver10Ms: values('chestRoll').length
        ? elapsed(
            (s) => finite(s.values.chestRoll) && Math.abs(s.values.chestRoll) > 10
          )
        : null,
      chestForwardTiltPeakDeg: extreme('chestTilt'),
      chestDropDuringRisePeakDeg: drops.length ? round(Math.max(...drops)) : null,
      loweringSpeedPeakDegPerSec: lowering.length
        ? round(Math.max(0, ...lowering))
        : null,
      risingSpeedPeakDegPerSec: rising.length
        ? round(Math.max(0, ...rising.map((v) => -v)))
        : null,
      headUpPeakDeg: extreme('headInclination', 'max'),
      headDownPeakDeg: extreme('headInclination', 'min'),
      headOutside35Ms: values('headInclination').length
        ? elapsed(
            (s) =>
              finite(s.values.headInclination) &&
              Math.abs(s.values.headInclination) > 35
          )
        : null,
      headRollPeakDeg: extreme('headRoll'),
      headTurnPeakDeg: extreme('headTurn'),
      leftFootRollPeakDeg: extreme('leftFootRoll'),
      rightFootRollPeakDeg: extreme('rightFootRoll'),
      ankleDifferencePeakDeg: gap('leftAnkle', 'rightAnkle'),
    },
    groups: assessment.groups.map(({ id, coverage, severity, issueMs }) => ({
      id,
      coverage: round(coverage),
      severity: round(severity),
      issueMs: round(issueMs),
    })),
  };
}

export class FormAnalyzer {
  private samples: FormSample[] = [];
  private previous: FormSample[] = [];
  private lastPhase: SquatPhase = 'unavailable';
  reset() {
    this.samples = [];
    this.previous = [];
    this.lastPhase = 'unavailable';
  }
  observe(sample: FormSample) {
    if (sample.at <= (this.previous.at(-1)?.at ?? 0)) return;
    if (
      sample.phase === 'unavailable' ||
      (this.previous.length && sample.at - this.previous.at(-1)!.at > 500)
    )
      this.reset();
    if (sample.phase === 'descending' && this.lastPhase === 'ready')
      this.samples = this.previous.filter((s) => sample.at - s.at <= 300);
    if (
      ['descending', 'bottom', 'ascending'].includes(sample.phase) ||
      this.samples.length
    )
      this.samples.push(sample);
    this.samples = this.samples.filter((s) => sample.at - s.at <= 31000).slice(-6000);
    this.previous = [...this.previous.filter((s) => sample.at - s.at <= 400), sample];
    this.lastPhase = sample.phase;
  }
  review(rep: number) {
    const last = this.samples.at(-1);
    if (
      !last ||
      last.phase !== 'ascending' ||
      !finite(last.values.leftKnee) ||
      !finite(last.values.rightKnee) ||
      !this.samples.some((s) => s.phase === 'descending') ||
      !this.samples.some((s) => s.phase === 'bottom') ||
      last.at - (this.samples.find((s) => s.phase === 'ascending')?.at ?? last.at) < 150
    )
      return null;
    const depth = Math.max(
      ...this.samples.map((s) =>
        finite(s.values.leftKnee) && finite(s.values.rightKnee)
          ? Math.min(s.values.leftKnee, s.values.rightKnee)
          : 0
      )
    );
    const assessment = evaluateFormRep(this.samples, rep, depth, last.at);
    if (assessment.score == null) return null;
    return summarizeFormReview(this.samples, assessment);
  }
  finish(rep: number, depth: number, at: number) {
    const result = evaluateFormRep(this.samples, rep, depth, at);
    this.samples = [];
    return result;
  }
}

export function summarizeForm(reps: FormRep[]) {
  const feedback = GROUPS.map((g) => {
    const affected = reps.filter((r) =>
      r.groups.some((v) => v.id === g.id && v.coverage >= 0.85 && v.severity >= 0.15)
    );
    const severity = affected.reduce(
      (sum, r) => sum + r.groups.find((v) => v.id === g.id)!.severity,
      0
    );
    return {
      ...g,
      reps: affected.map((r) => r.rep),
      priority: severity * g.weight,
      evidence: affected
        .map((r) => `Rep ${r.rep}: ${r.groups.find((v) => v.id === g.id)!.evidence}`)
        .join('; '),
    };
  })
    .filter((g) => g.reps.length)
    .sort((a, b) => b.reps.length - a.reps.length || b.priority - a.priority)
    .slice(0, 3);
  const scored = reps.filter((r) => r.score != null);
  const first = reps.slice(0, 3),
    last = reps.slice(-3);
  const comparable =
    reps.length >= 6 && [...first, ...last].every((r) => r.score != null);
  const change = comparable
    ? last.reduce((s, r) => s + r.score!, 0) / 3 -
      first.reduce((s, r) => s + r.score!, 0) / 3
    : null;
  return {
    feedback,
    assessed: scored.length,
    unknown: reps.length - scored.length,
    trend:
      change == null
        ? 'Not enough comparable reps for a trend.'
        : change < -10
          ? 'Measured form scores fell in the last three reps. Review the repeated cues below.'
          : change > 10
            ? 'Measured form scores improved in the last three reps.'
            : 'Measured form scores were fairly consistent across the set.',
  };
}
