export const WARMUP_REP_COUNT = 3;
export const ACCEPTABLE_DEPTH_MIN_DEG = 75;
export const VERY_SHALLOW_THRESHOLD_DEG = 60;
export const SQUAT_BASELINE_KEY = 'kinetiq/squat-baseline-v1';

export type SquatDepthClassification = 'acceptable' | 'shallow' | 'very-shallow';

export interface SquatRepPeaks {
  maxLeftKneeFlexion: number;
  maxRightKneeFlexion: number;
  maxBilateralKneeFlexion: number;
}

export interface CompletedSquatRep extends SquatRepPeaks {
  rep: number;
  completedAt: number;
  achievedKneeFlexion: number;
  depthClassification: SquatDepthClassification;
  depthValid: boolean;
}

export interface SquatBaseline {
  version: 1;
  sampleSize: typeof WARMUP_REP_COUNT;
  averageKneeFlexion: number;
  averageLeftKneeFlexion: number;
  averageRightKneeFlexion: number;
  createdAt: number;
}

export interface WarmupAnalysis {
  reps: CompletedSquatRep[];
  failedDepthRepCount: number;
  accepted: boolean;
}

// Knee bend is an unsigned change from the upright reference: 0° is straight,
// and greater values mean more flexion. This rule checks only minimum depth.
export function classifySquatDepth(kneeFlexion: number): SquatDepthClassification {
  if (kneeFlexion >= ACCEPTABLE_DEPTH_MIN_DEG) return 'acceptable';
  if (kneeFlexion >= VERY_SHALLOW_THRESHOLD_DEG) return 'shallow';
  return 'very-shallow';
}

export function validateSquatDepth(peaks: SquatRepPeaks) {
  const achievedKneeFlexion = Math.min(
    peaks.maxBilateralKneeFlexion,
    peaks.maxLeftKneeFlexion,
    peaks.maxRightKneeFlexion
  );
  const depthClassification = classifySquatDepth(achievedKneeFlexion);
  return {
    achievedKneeFlexion,
    depthClassification,
    depthValid: depthClassification === 'acceptable',
  };
}

export function completeSquatRep(
  rep: number,
  peaks: SquatRepPeaks,
  completedAt: number
): CompletedSquatRep {
  return { rep, ...peaks, completedAt, ...validateSquatDepth(peaks) };
}

export function analyzeWarmup(reps: CompletedSquatRep[]): WarmupAnalysis {
  if (reps.length !== WARMUP_REP_COUNT)
    throw new Error('Analyze the warm-up only after all three reps.');
  const failedDepthRepCount = reps.filter(
    (rep) => rep.depthClassification !== 'acceptable'
  ).length;
  return {
    reps,
    failedDepthRepCount,
    accepted: failedDepthRepCount === 0,
  };
}

export function createSquatBaseline(
  analysis: WarmupAnalysis,
  createdAt: number
): SquatBaseline {
  if (!analysis.accepted || analysis.reps.length !== WARMUP_REP_COUNT)
    throw new Error('Only an accepted three-rep warm-up can create a baseline.');
  const average = (get: (rep: CompletedSquatRep) => number) =>
    analysis.reps.reduce((total, rep) => total + get(rep), 0) / WARMUP_REP_COUNT;
  return {
    version: 1,
    sampleSize: WARMUP_REP_COUNT,
    averageKneeFlexion: average((rep) => rep.achievedKneeFlexion),
    averageLeftKneeFlexion: average((rep) => rep.maxLeftKneeFlexion),
    averageRightKneeFlexion: average((rep) => rep.maxRightKneeFlexion),
    createdAt,
  };
}

type BaselineStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function loadSquatBaseline(storage: BaselineStorage): SquatBaseline | null {
  try {
    const raw = storage.getItem(SQUAT_BASELINE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as SquatBaseline;
    if (
      value.version !== 1 ||
      value.sampleSize !== WARMUP_REP_COUNT ||
      ![
        value.averageKneeFlexion,
        value.averageLeftKneeFlexion,
        value.averageRightKneeFlexion,
        value.createdAt,
      ].every((item) => typeof item === 'number' && Number.isFinite(item))
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

export function saveSquatBaseline(storage: BaselineStorage, baseline: SquatBaseline) {
  storage.setItem(SQUAT_BASELINE_KEY, JSON.stringify(baseline));
}

const MIN_SAMPLE_MS = 35;
const MAX_SAMPLE_GAP_MS = 500;
const RECENT_SAMPLE_COUNT = 5;
const START_FLEXION_DEG = 15;
const END_FLEXION_DEG = 10;
const MIN_REP_PEAK_DEG = 20;
const MIN_REP_MS = 600;
const MAX_REP_MS = 8000;
const CONFIRM_MS = 160;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Detect a down-and-up cycle from live calibrated knee bend. A five-sample
// median prevents one noisy packet from becoming the recorded rep peak.
export class SquatRepDetector {
  private recent: { left: number; right: number }[] = [];
  private lastAt = 0;
  private startedAt = 0;
  private bendSince = 0;
  private uprightSince = 0;
  private maxLeft = 0;
  private maxRight = 0;
  private maxBilateral = 0;
  private armed = false;

  reset() {
    this.recent = [];
    this.lastAt = 0;
    this.startedAt = 0;
    this.bendSince = 0;
    this.uprightSince = 0;
    this.maxLeft = 0;
    this.maxRight = 0;
    this.maxBilateral = 0;
    this.armed = false;
  }

  ingest(left: number, right: number, at: number): SquatRepPeaks | null {
    if (
      ![left, right, at].every(Number.isFinite) ||
      left < 0 ||
      right < 0 ||
      at <= this.lastAt
    )
      return null;
    if (this.lastAt && at - this.lastAt > MAX_SAMPLE_GAP_MS) this.reset();
    if (this.lastAt && at - this.lastAt < MIN_SAMPLE_MS) return null;
    this.lastAt = at;
    this.recent.push({ left, right });
    this.recent = this.recent.slice(-RECENT_SAMPLE_COUNT);
    if (this.recent.length < RECENT_SAMPLE_COUNT) return null;

    const stableLeft = median(this.recent.map((sample) => sample.left));
    const stableRight = median(this.recent.map((sample) => sample.right));
    const movement = (stableLeft + stableRight) / 2;
    // Require a stable upright start, including after a data gap or reset.
    if (!this.armed) {
      if (Math.max(stableLeft, stableRight) <= END_FLEXION_DEG) {
        if (!this.uprightSince) this.uprightSince = at;
        if (at - this.uprightSince >= CONFIRM_MS) {
          this.armed = true;
          this.uprightSince = 0;
        }
      } else {
        this.uprightSince = 0;
      }
      return null;
    }
    if (!this.startedAt) {
      if (movement >= START_FLEXION_DEG) {
        if (!this.bendSince) this.bendSince = at;
        if (at - this.bendSince >= CONFIRM_MS) {
          this.startedAt = this.bendSince;
          this.maxLeft = stableLeft;
          this.maxRight = stableRight;
          this.maxBilateral = Math.min(stableLeft, stableRight);
        }
      } else {
        this.bendSince = 0;
      }
      return null;
    }

    this.maxLeft = Math.max(this.maxLeft, stableLeft);
    this.maxRight = Math.max(this.maxRight, stableRight);
    // Both legs must reach depth together, not at separate points in the rep.
    this.maxBilateral = Math.max(this.maxBilateral, Math.min(stableLeft, stableRight));
    if (at - this.startedAt > MAX_REP_MS) {
      this.reset();
      return null;
    }
    if (Math.max(stableLeft, stableRight) <= END_FLEXION_DEG) {
      if (!this.uprightSince) this.uprightSince = at;
      if (at - this.uprightSince >= CONFIRM_MS) {
        const peaks = {
          maxLeftKneeFlexion: this.maxLeft,
          maxRightKneeFlexion: this.maxRight,
          maxBilateralKneeFlexion: this.maxBilateral,
        };
        const complete =
          at - this.startedAt >= MIN_REP_MS &&
          (this.maxLeft + this.maxRight) / 2 >= MIN_REP_PEAK_DEG;
        this.reset();
        this.armed = true;
        return complete ? peaks : null;
      }
    } else {
      this.uprightSince = 0;
    }
    return null;
  }
}
