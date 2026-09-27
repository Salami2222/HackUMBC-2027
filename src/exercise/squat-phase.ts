export type SquatPhase =
  | 'unavailable'
  | 'ready'
  | 'descending'
  | 'bottom'
  | 'ascending';
export type PhaseChoice = SquatPhase | 'uncertain';
export interface PhaseSample {
  at: number;
  left: number;
  right: number;
  headHeight: number | null;
}
export interface PhaseAdvice {
  at: number;
  phase: PhaseChoice;
  probability: number;
  confidence: number;
}
export interface PhasePeaks {
  maxLeftKneeFlexion: number;
  maxRightKneeFlexion: number;
  maxBilateralKneeFlexion: number;
}
export interface PhaseState {
  phase: SquatPhase;
  changedAt: number;
  paused: boolean;
  reason: string;
  kneeSpeed: number;
  headSpeed: number | null;
  headDrop: number | null;
}

export const PHASE_LABELS: Record<SquatPhase, string> = {
  unavailable: 'Stand upright',
  ready: 'Ready',
  descending: 'Descending',
  bottom: 'Bottom',
  ascending: 'Ascending',
};
export const SESSION_REPS = 8;
export const PHASE_MAX_GAP_MS = 500;
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const initial = (): PhaseState => ({
  phase: 'unavailable',
  changedAt: 0,
  paused: false,
  reason: 'Stand upright to begin.',
  kneeSpeed: 0,
  headSpeed: null,
  headDrop: null,
});

// Velocity uses real sample times, not the display refresh rate.
function slope(samples: PhaseSample[], read: (s: PhaseSample) => number) {
  const origin = samples[0].at;
  const times = samples.map((s) => (s.at - origin) / 1000);
  const meanTime = times.reduce((a, b) => a + b, 0) / times.length;
  const meanValue = samples.reduce((sum, s) => sum + read(s), 0) / samples.length;
  let numerator = 0,
    denominator = 0;
  samples.forEach((s, i) => {
    numerator += (times[i] - meanTime) * (read(s) - meanValue);
    denominator += (times[i] - meanTime) ** 2;
  });
  return denominator > 0 ? numerator / denominator : 0;
}

/** Monotonic phase sequence. Bottom is confirmed on reversal, never on a pause alone. */
export class SquatPhaseDetector {
  state: PhaseState = initial();
  private raw: PhaseSample[] = [];
  private history: PhaseSample[] = [];
  private lastAt = 0;
  private candidate = '';
  private candidateAt = 0;
  private startedAt = 0;
  private bottomAt = 0;
  private minAscent = Infinity;
  private standingHead: number | null = null;
  private peaks: PhasePeaks = {
    maxLeftKneeFlexion: 0,
    maxRightKneeFlexion: 0,
    maxBilateralKneeFlexion: 0,
  };

  reset(reason = 'Stand upright to begin.') {
    this.state = { ...initial(), reason };
    this.raw = [];
    this.history = [];
    this.lastAt = 0;
    this.candidate = '';
    this.candidateAt = 0;
    this.startedAt = 0;
    this.bottomAt = 0;
    this.minAscent = Infinity;
    this.standingHead = null;
    this.peaks = {
      maxLeftKneeFlexion: 0,
      maxRightKneeFlexion: 0,
      maxBilateralKneeFlexion: 0,
    };
  }

  private confirm(key: string, condition: boolean, at: number, duration: number) {
    if (!condition) {
      this.candidate = '';
      this.candidateAt = 0;
      return false;
    }
    if (this.candidate !== key) {
      this.candidate = key;
      this.candidateAt = at;
    }
    return at - this.candidateAt >= duration;
  }

  private enter(phase: SquatPhase, at: number) {
    this.state = { ...this.state, phase, changedAt: at, paused: false, reason: '' };
    this.candidate = '';
    this.candidateAt = 0;
  }

  ingest(sample: PhaseSample, advice: PhaseAdvice | null = null): PhasePeaks | null {
    const { at, left, right } = sample;
    if (
      ![at, left, right].every(Number.isFinite) ||
      left < 0 ||
      right < 0 ||
      left > 180 ||
      right > 180
    ) {
      this.reset('Invalid tracking data. Stand upright to restart.');
      return null;
    }
    if (at <= this.lastAt) return null;
    if (this.lastAt && at - this.lastAt > PHASE_MAX_GAP_MS)
      this.reset('Tracking interrupted. Stand upright to restart.');
    if (this.lastAt && at - this.lastAt < 40) return null;
    this.lastAt = at;
    const validHead =
      sample.headHeight != null &&
      Number.isFinite(sample.headHeight) &&
      sample.headHeight > 0.2 &&
      sample.headHeight < 2.8;
    this.raw.push({ ...sample, headHeight: validHead ? sample.headHeight : null });
    this.raw = this.raw.slice(-3);
    if (this.raw.length < 3) return null;
    const current: PhaseSample = {
      at,
      left: median(this.raw.map((s) => s.left)),
      right: median(this.raw.map((s) => s.right)),
      headHeight: this.raw.every((s) => s.headHeight != null)
        ? median(this.raw.map((s) => s.headHeight!))
        : null,
    };
    this.history.push(current);
    this.history = this.history.filter((s) => at - s.at <= 300);
    if (this.history.length < 3 || at - this.history[0].at < 150) return null;
    const leftSpeed = slope(this.history, (s) => s.left);
    const rightSpeed = slope(this.history, (s) => s.right);
    const kneeSpeed = (leftSpeed + rightSpeed) / 2;
    const headValues = this.history.map((s) => s.headHeight);
    // Abrupt floor/IK jumps are not trustworthy supporting evidence.
    const headSpeed =
      headValues.every((v) => v != null) &&
      Math.max(...(headValues as number[])) - Math.min(...(headValues as number[])) <
        0.18
        ? slope(this.history, (s) => s.headHeight!)
        : null;
    const movement = (current.left + current.right) / 2;
    const kneeRange =
      Math.max(...this.history.map((s) => (s.left + s.right) / 2)) -
      Math.min(...this.history.map((s) => (s.left + s.right) / 2));
    const upright =
      Math.max(current.left, current.right) <= 10 &&
      (Math.abs(kneeSpeed) < 5 || kneeRange <= 4);
    const down = leftSpeed > 2 && rightSpeed > 2 && kneeSpeed > 5;
    const up = leftSpeed < -2 && rightSpeed < -2 && kneeSpeed < -5;
    const freshAdvice =
      advice &&
      at - advice.at >= 0 &&
      at - advice.at <= 500 &&
      advice.probability >= 0.8 &&
      advice.confidence >= 0.65
        ? advice
        : null;
    const dwell = (phase: 'descending' | 'ascending') => {
      const headOpposes =
        headSpeed != null &&
        (phase === 'descending' ? headSpeed > 0.04 : headSpeed < -0.04);
      const modelOpposes =
        freshAdvice && freshAdvice.phase !== 'uncertain' && freshAdvice.phase !== phase;
      const supported =
        freshAdvice?.phase === phase ||
        (headSpeed != null &&
          (phase === 'descending' ? headSpeed < -0.02 : headSpeed > 0.02));
      // Support can shorten confirmation slightly, but never supplies the movement itself.
      return headOpposes || modelOpposes ? 360 : supported ? 160 : 240;
    };
    this.state = {
      ...this.state,
      kneeSpeed,
      headSpeed,
      headDrop:
        this.standingHead != null && current.headHeight != null
          ? this.standingHead - current.headHeight
          : null,
      paused:
        ['descending', 'ascending'].includes(this.state.phase) &&
        Math.abs(kneeSpeed) < 3,
    };

    if (this.state.phase === 'unavailable') {
      if (this.confirm('arm', upright, at, 350)) {
        this.standingHead = current.headHeight;
        this.enter('ready', at);
      }
      return null;
    }
    if (this.state.phase === 'ready') {
      if (
        this.confirm(
          'down',
          down && Math.min(current.left, current.right) >= 12,
          at,
          dwell('descending')
        )
      ) {
        this.startedAt = at;
        this.peaks = {
          maxLeftKneeFlexion: current.left,
          maxRightKneeFlexion: current.right,
          maxBilateralKneeFlexion: Math.min(current.left, current.right),
        };
        this.enter('descending', at);
      }
      return null;
    }
    this.peaks.maxLeftKneeFlexion = Math.max(
      this.peaks.maxLeftKneeFlexion,
      current.left
    );
    this.peaks.maxRightKneeFlexion = Math.max(
      this.peaks.maxRightKneeFlexion,
      current.right
    );
    this.peaks.maxBilateralKneeFlexion = Math.max(
      this.peaks.maxBilateralKneeFlexion,
      Math.min(current.left, current.right)
    );
    if (at - this.startedAt > 30000) {
      this.reset('Rep timed out. Stand upright to restart.');
      return null;
    }
    if (this.state.phase === 'descending') {
      const peak = (this.peaks.maxLeftKneeFlexion + this.peaks.maxRightKneeFlexion) / 2;
      if (this.confirm('reverse', up && peak - movement >= 6, at, dwell('ascending'))) {
        this.bottomAt = at;
        this.minAscent = movement;
        this.enter('bottom', at);
      }
      return null;
    }
    if (this.state.phase === 'bottom') {
      // One latched turning point, held briefly for a readable phase transition.
      if (at - this.bottomAt >= 180 && (up || upright)) this.enter('ascending', at);
      return null;
    }
    this.minAscent = Math.min(this.minAscent, movement);
    if (down && movement - this.minAscent > 12) {
      if (this.confirm('abort', true, at, 350))
        this.reset('Movement reversed. Stand upright to restart.');
      return null;
    }
    if (this.confirm('complete', upright, at, 250)) {
      const complete =
        at - this.startedAt >= 700 && this.peaks.maxBilateralKneeFlexion >= 20;
      const result = { ...this.peaks };
      this.enter('ready', at);
      this.startedAt = 0;
      return complete ? result : null;
    }
    return null;
  }
}
