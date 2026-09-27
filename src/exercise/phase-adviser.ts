import type { PhaseAdvice, PhaseSample, SquatPhase } from './squat-phase';

/** Single flight, no queued catch-up calls, and no advice crossing a reset/phase boundary. */
export class PhaseAdviser {
  advice: PhaseAdvice | null = null;
  status = 'Jev waiting';
  private epoch = 0;
  private busy = false;
  private nextAt = 0;
  private controller: AbortController | null = null;

  reset() {
    this.epoch++;
    this.advice = null;
    this.controller?.abort();
  }

  async request(samples: PhaseSample[], phase: SquatPhase, now = Date.now()) {
    if (this.busy || now < this.nextAt || samples.length < 4 || phase === 'unavailable')
      return;
    this.busy = true;
    this.nextAt = now + 250;
    const epoch = this.epoch;
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetch('/api/squat-phase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ phase, samples }),
      });
      if (!response.ok) throw new Error('Advice unavailable');
      const advice: PhaseAdvice = await response.json();
      if (
        !['ready', 'descending', 'bottom', 'ascending', 'uncertain'].includes(
          advice.phase
        ) ||
        !Number.isFinite(advice.probability) ||
        advice.probability < 0 ||
        advice.probability > 1 ||
        !Number.isFinite(advice.confidence) ||
        advice.confidence < 0 ||
        advice.confidence > 1
      )
        throw new Error('Invalid advice');
      if (epoch !== this.epoch) return;
      const age = Date.now() - advice.at;
      if (advice.at !== samples.at(-1)?.at || age < 0 || age > 500) {
        this.advice = null;
        this.status = 'Jev delayed · local detection';
        return;
      }
      this.advice = advice;
      this.status = 'Jev connected';
    } catch {
      if (epoch === this.epoch) {
        this.advice = null;
        this.status = 'Jev unavailable · local detection';
        this.nextAt = Date.now() + 5000;
      }
    } finally {
      clearTimeout(timeout);
      this.busy = false;
      if (this.controller === controller) this.controller = null;
    }
  }
}
