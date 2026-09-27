import type { FormRep, FormReview } from './form-quality';

export const JEV_FORM_WEIGHT = 0.05;
export interface FormAdvice {
  rep: number;
  at: number;
  measuredSeverities: Record<string, number>;
  factors: Record<
    string,
    { severity: number; confidence: number; probability: number; uncertain: boolean }
  >;
}
const factorIds = ['symmetry', 'torso', 'control', 'feet', 'head'];
export function validFormAdvice(value: FormAdvice): boolean {
  return (
    !!value &&
    Number.isInteger(value.rep) &&
    Number.isFinite(value.at) &&
    !!value.measuredSeverities &&
    !!value.factors &&
    factorIds.every((id) => {
      const f = value.factors[id];
      return (
        !!f &&
        typeof f.uncertain === 'boolean' &&
        [f.severity, f.confidence, f.probability, value.measuredSeverities[id]].every(
          (n) => Number.isFinite(n) && n >= 0 && n <= 1
        )
      );
    })
  );
}

/** Advice never crosses a rep, reset, or finalization boundary. */
export class FormAdviser {
  advice: FormAdvice | null = null;
  status = 'Jev review not ready';
  private epoch = 0;
  private attempts = 0;
  private reviewed: FormReview | null = null;
  private busy = false;
  private nextAt = 0;
  private controller: AbortController | null = null;
  reset() {
    this.epoch++;
    this.attempts = 0;
    this.advice = null;
    this.reviewed = null;
    this.controller?.abort();
    this.status = 'Jev review not ready';
  }
  async request(review: FormReview | null, now = Date.now()) {
    if (!review || this.attempts >= 2 || this.busy || now < this.nextAt) return;
    this.busy = true;
    this.attempts++;
    this.nextAt = now + 500;
    const epoch = this.epoch;
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 1200);
    this.status = 'Jev reviewing ascent';
    try {
      const response = await fetch('/api/squat-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(review),
      });
      if (!response.ok) throw new Error('Review unavailable');
      const advice: FormAdvice = await response.json();
      if (
        !validFormAdvice(advice) ||
        advice.rep !== review.rep ||
        advice.at !== review.at
      )
        throw new Error('Invalid review');
      if (epoch !== this.epoch) return;
      if (Date.now() - advice.at < 0 || Date.now() - advice.at > 1000) {
        this.status = 'Jev review arrived too late';
        return;
      }
      this.advice = advice;
      this.reviewed = review;
      this.status = 'Jev review ready';
    } catch {
      if (epoch === this.epoch) {
        this.status = 'Jev unavailable';
        this.nextAt = Date.now() + 5000;
      }
    } finally {
      clearTimeout(timeout);
      this.busy = false;
      if (this.controller === controller) this.controller = null;
    }
  }
  finalize(rep: FormRep) {
    const result = blendFormAdvice(rep, this.advice, this.status);
    if (result.jev && this.reviewed) result.jev.summary = this.reviewed;
    this.reset();
    return result;
  }
}

export function blendFormAdvice(
  rep: FormRep,
  advice: FormAdvice | null,
  fallback = 'No timely Jev review'
): FormRep {
  const base = {
    measuredScore: rep.score,
    proposedScore: null,
    weight: 0,
    reason:
      fallback === 'Jev reviewing ascent'
        ? 'Jev review was not ready at rep completion; measurements only'
        : fallback,
  };
  if (rep.score == null)
    return { ...rep, jev: { ...base, reason: 'Insufficient measurement data' } };
  if (!advice || !validFormAdvice(advice) || advice.rep !== rep.rep)
    return { ...rep, jev: base };
  if (rep.completedAt < advice.at || rep.completedAt - advice.at > 1000)
    return {
      ...rep,
      jev: { ...base, reason: 'Jev review expired before Ready; measurements only' },
    };
  let eligibleWeight = 0;
  const proposedScore =
    100 -
    rep.groups.reduce((sum, g) => {
      const f = advice.factors[g.id];
      // Depth remains numeric. An uncertain factor keeps its measured severity.
      const eligible =
        g.id !== 'depth' &&
        g.coverage >= 0.85 &&
        f &&
        !f.uncertain &&
        f.confidence >= 0.8 &&
        f.probability >= 0.7 &&
        Math.abs(g.severity - advice.measuredSeverities[g.id]) <= 0.15;
      if (eligible) eligibleWeight += g.weight;
      return sum + g.weight * (eligible ? f.severity : g.severity);
    }, 0);
  if (!eligibleWeight)
    return {
      ...rep,
      jev: {
        ...base,
        reason:
          'No eligible Jev factors: uncertain or changed evidence; measurements only',
      },
    };
  const score =
    Math.round(
      (rep.score * (1 - JEV_FORM_WEIGHT) + proposedScore * JEV_FORM_WEIGHT) * 10
    ) / 10;
  return {
    ...rep,
    score,
    // Measured category gates remain authoritative, particularly Needs attention.
    jev: {
      measuredScore: rep.score,
      proposedScore: Math.round(proposedScore * 10) / 10,
      weight: JEV_FORM_WEIGHT,
      reason:
        '95% measurements + 5% Jev review; uncertain factors retain measured values',
    },
  };
}
