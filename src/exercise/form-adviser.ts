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
  private requested: FormReview | null = null;
  private busy = false;
  private latencyMs: number | undefined;
  private httpStatus: number | undefined;
  private nextAt = 0;
  private controller: AbortController | null = null;
  reset() {
    this.epoch++;
    this.attempts = 0;
    this.advice = null;
    this.reviewed = null;
    this.requested = null;
    this.latencyMs = undefined;
    this.httpStatus = undefined;
    this.controller?.abort();
    this.status = 'Jev review not ready';
  }
  async request(review: FormReview | null, now = Date.now()) {
    if (!review || this.attempts >= 2 || this.busy) return;
    if (now < this.nextAt) {
      if (!this.attempts)
        this.status = 'Not requested: waiting for the previous request cooldown';
      return;
    }
    // Reserve the second request for a fresher late-ascent snapshot.
    if (this.attempts > 0 && review.stage !== 'late-ascent') return;
    this.requested = review;
    this.busy = true;
    this.attempts++;
    this.nextAt = now + 500;
    const epoch = this.epoch;
    const controller = new AbortController();
    this.controller = controller;
    const started = Date.now();
    const timeout = setTimeout(() => controller.abort(), 2200);
    this.status = 'Jev reviewing ascent';
    try {
      const response = await fetch('/api/squat-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(review),
      });
      if (epoch !== this.epoch) return;
      this.httpStatus = response.status;
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const messages: Record<string, string> = {
          notConfigured: 'Jev key is not configured on this computer',
          invalidSummary: 'Jev summary was rejected by the local service',
          authentication: 'TypeSafe rejected the API key',
          rateLimited: 'TypeSafe rate limit reached',
          timeout: 'TypeSafe request timed out',
          upstream: 'TypeSafe service could not complete the review',
          invalidResponse: 'TypeSafe returned an invalid review',
        };
        throw new Error(
          messages[body.code] ?? `Jev request failed (HTTP ${response.status})`
        );
      }
      const advice: FormAdvice = await response.json();
      if (
        !validFormAdvice(advice) ||
        advice.rep !== review.rep ||
        advice.at !== review.at
      )
        throw new Error('Invalid review');
      if (epoch !== this.epoch) return;
      if (Date.now() - advice.at < 0 || Date.now() - advice.at > 5000) {
        this.status = 'Jev review arrived too late';
        return;
      }
      this.advice = advice;
      this.reviewed = review;
      this.status = 'Jev review ready';
    } catch (error) {
      if (epoch === this.epoch) {
        this.status = controller.signal.aborted
          ? 'Jev request timed out'
          : error instanceof Error
            ? error.message
            : 'Jev unavailable';
        this.nextAt = Date.now() + 5000;
      }
    } finally {
      if (epoch === this.epoch) this.latencyMs = Date.now() - started;
      clearTimeout(timeout);
      this.busy = false;
      if (this.controller === controller) this.controller = null;
    }
  }
  finalize(rep: FormRep) {
    const result = blendFormAdvice(rep, this.advice, this.status);
    if (result.jev) {
      result.jev.attempts = this.attempts;
      result.jev.latencyMs = this.latencyMs;
      result.jev.httpStatus = this.httpStatus;
      if (this.reviewed ?? this.requested)
        result.jev.summary = (this.reviewed ?? this.requested)!;
      if (
        !this.attempts &&
        rep.score != null &&
        !this.status.startsWith('Not requested:')
      )
        result.jev.reason =
          'Not requested: no ascent snapshot with 85% coverage in every factor before Ready';
    }
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
  if (rep.completedAt < advice.at || rep.completedAt - advice.at > 5000)
    return {
      ...rep,
      jev: { ...base, reason: 'Jev review expired before Ready; measurements only' },
    };
  let eligibleWeight = 0;
  const factors: NonNullable<FormRep['jev']>['factors'] = [];
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
      if (f)
        factors.push({
          id: g.id,
          proposedSeverity: f.severity,
          applied: Boolean(eligible),
          reason: eligible
            ? 'Applied'
            : f.uncertain
              ? 'Uncertain'
              : f.confidence < 0.8 || f.probability < 0.7
                ? 'Below confidence threshold'
                : 'Measurements changed since review',
        });
      return sum + g.weight * (eligible ? f.severity : g.severity);
    }, 0);
  if (!eligibleWeight)
    return {
      ...rep,
      jev: {
        ...base,
        proposedScore: Math.round(proposedScore * 10) / 10,
        factors,
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
      factors,
      proposedScore: Math.round(proposedScore * 10) / 10,
      weight: JEV_FORM_WEIGHT,
      reason:
        '95% measurements + 5% Jev review; uncertain factors retain measured values',
    },
  };
}
