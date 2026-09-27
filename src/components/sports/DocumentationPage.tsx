import { Link } from 'react-router-dom';
import { GROUPS } from '@/exercise/form-quality';
import './DocumentationPage.scss';

const ranges: Record<string, { range: string; meaning: string }> = {
  symmetry: {
    range: '12–30° difference',
    meaning:
      'Left versus right knee bend. This does not measure inward knee collapse.',
  },
  torso: {
    range: '10–25° sideways tilt',
    meaning:
      'Also checks an extra 8–20° chest drop over about 300 ms while rising. Ordinary forward lean is allowed.',
  },
  control: {
    range: '140–260°/s lowering',
    meaning:
      'Filtered knee-bend speed on the way down. Fast ascent and deliberate pauses are not penalized on their own.',
  },
  depth: {
    range: '98° knee bend',
    meaning:
      'Both legs must reach the target together. Standing straight is 0°; deeper bends have no upper cutoff in this rule.',
  },
  feet: {
    range: '12–28° foot roll',
    meaning:
      'Also checks 15–35° left/right ankle-angle difference. Foot pressure and heel contact are unknown.',
  },
  head: {
    range: '±35° up / down',
    meaning:
      'Tilt severity rises from 35° to 55°. Sideways roll uses 15–35°; head-to-chest turn uses 30–60°.',
  },
};

export function DocumentationPage() {
  return (
    <main className="documentation-page" aria-labelledby="docs-title">
      <header className="docs-intro">
        <span className="eyebrow">Kinetiq guide</span>
        <h1 id="docs-title">How it works</h1>
        <p>
          Connect, calibrate, then record a set. Here’s what the numbers mean.
        </p>
      </header>

      <section
        className="docs-foundation"
        aria-labelledby="docs-foundation-title"
      >
        <h2 id="docs-foundation-title">Built on SlimeVR</h2>
        <p>
          Kinetiq starts with{' '}
          <a href="https://github.com/SlimeVR/SlimeVR-Server">
            SlimeVR’s inverse-kinematics (IK) and calibration framework
          </a>{' '}
          to turn tracker orientations into a live body pose. We add squat
          phases, rep counting, measured form scores and set feedback. The
          viewport shows the live estimated pose, not a prerecorded animation.
        </p>
      </section>

      <section className="docs-section" aria-labelledby="docs-setup-title">
        <div className="docs-section-heading">
          <span>01</span>
          <h2 id="docs-setup-title">Sensor calibration</h2>
        </div>
        <ol className="docs-steps">
          <li>
            <strong>Connect & assign</strong>
            <p>
              Put the computer and nodes on the same Wi-Fi. Use USB setup for
              new nodes; configured nodes reconnect when powered on. Assign
              eight measurement nodes: head, chest, both thighs (knees), both
              shins (ankles), and both feet. Elbows are optional.
            </p>
          </li>
          <li>
            <strong>Auto-orient</strong>
            <p>
              In <Link to="/calibration">Sensor Calibration</Link>, follow the
              upright reset and ski-pose instructions. Each node receives its
              own mounting correction. Check that the displayed pose follows
              you.
            </p>
          </li>
          <li>
            <strong>Capture reference</strong>
            <p>
              Return upright and hold still for three seconds. This records your
              neutral angles. Recalibrate after moving a strap or changing an
              assignment. Former hand/wrist nodes must be moved to the feet and
              explicitly reassigned; keep the ankle nodes.
            </p>
          </li>
        </ol>
        <p className="docs-note">
          Feet are grounded using an estimated floor because there is no
          headset. This is not a measurement of floor contact. If nodes stay
          offline, check the shared network and use Restart tracking service in
          the calibration options menu.
        </p>
      </section>

      <section className="docs-section" aria-labelledby="docs-phase-title">
        <div className="docs-section-heading">
          <span>02</span>
          <h2 id="docs-phase-title">How a rep is counted</h2>
        </div>
        <ol className="docs-phases">
          <li>
            <strong>Ready</strong>
            <span>Upright and steady; both knees at 10° bend or less.</span>
          </li>
          <li>
            <strong>Descending</strong>
            <span>Both knees bend increasingly, past 12°.</span>
          </li>
          <li>
            <strong>Bottom</strong>
            <span>
              A sustained reversal of at least 6° confirms the turning point.
            </span>
          </li>
          <li>
            <strong>Ascending</strong>
            <span>
              The legs straighten until a stable return to Ready completes the
              rep.
            </span>
          </li>
        </ol>
        <p>
          Knee motion leads. Estimated head-height movement and fresh Jev advice
          can adjust confirmation timing, but cannot create a rep. Filtering and
          brief confirmation holds prevent phase flicker; a pause halfway down
          is not the bottom. A tracking gap over 0.5 seconds discards the
          unfinished rep.
        </p>
        <p>
          Start an eight-rep set from{' '}
          <Link to="/presentation">Presentation</Link>. Each score appears at
          Ready and stays fixed in its equally spaced graph slot. A counted rep
          can still miss the depth target. After the set,{' '}
          <Link to="/feedback">Feedback</Link> shows repeated issues and
          improvement cues. Tracking’s optional three-rep baseline is separate;
          Presentation does not need it.
        </p>
      </section>

      <section className="docs-section" aria-labelledby="docs-score-title">
        <div className="docs-section-heading">
          <span>03</span>
          <h2 id="docs-score-title">Measured form & weights</h2>
        </div>
        <p>
          Each factor contributes a capped deduction from 100. A factor’s weight
          is the maximum number of points it can deduct; several related signals
          cannot multiply that weight.
        </p>
        <div className="docs-table-wrap">
          <table>
            <caption>Current scoring factors and configured targets</caption>
            <thead>
              <tr>
                <th scope="col">Factor</th>
                <th scope="col">Weight</th>
                <th scope="col">Target / penalty range</th>
                <th scope="col">What we look for</th>
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => (
                <tr key={g.id}>
                  <th scope="row">{g.label}</th>
                  <td>{g.weight}%</td>
                  <td>{ranges[g.id].range}</td>
                  <td>{ranges[g.id].meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="docs-note">
          Ranges run from the start of a penalty to its full severity. Movement
          deviations must persist for 350 ms beyond a small noise margin; a
          brief spike does not become a flag. A square-root penalty ramp gives
          moderate sustained deviations meaningful weight. Speed uses a 300 ms
          time window, independent of sensor frame rate. Depth uses the
          completed rep’s peak bend instead. These are current experimental
          targets, not universal lifting standards.
        </p>
        <div className="docs-ratings">
          <article className="docs-optimal">
            <h3>Optimal</h3>
            <p>
              No qualifying sustained issues and a measured score of at least
              85.
            </p>
          </article>
          <article className="docs-suboptimal">
            <h3>Sub-optimal</h3>
            <p>
              A qualifying issue or missed depth target, without meeting the
              Needs attention rule. A high score can still have one improvement
              cue.
            </p>
          </article>
          <article className="docs-attention">
            <h3>Needs attention</h3>
            <p>
              Measured score below 65, plus at least two control factors at 65%
              severity or higher: knee symmetry, torso, lowering control or
              feet. Head or depth alone cannot trigger this rating.
            </p>
          </article>
        </div>
        <p>
          Each factor needs at least <strong>85% usable data</strong>. Otherwise
          the rep is marked Insufficient data, not Optimal. Coverage describes
          available measurements, not confidence that the form is correct.
        </p>
      </section>

      <section className="docs-section" aria-labelledby="docs-jev-title">
        <div className="docs-section-heading">
          <span>04</span>
          <h2 id="docs-jev-title">Where Jev contributes</h2>
        </div>
        <p>
          For form scoring, Jev reviews 27 curated values and six factor
          summaries during ascent, with a second opportunity near the
          end—angles, durations, asymmetry and control—not the raw tracker
          stream. It can interpret patterns within the measured factors; the 98°
          depth rule stays measurement-based.
        </p>
        <div className="docs-formula">
          <strong>Final score = 95% measured + 5% Jev proposal</strong>
          <span>Example: measured 80 + Jev proposal 60 → final 79</span>
        </div>
        <p>
          Only timely, sufficiently confident reviews contribute. Uncertain
          factors keep their measured values; missing, late or unavailable
          reviews leave the measured score unchanged. Scores freeze at Ready,
          and category flags remain controlled by measurements. Open a rep’s
          breakdown in Feedback to see factor scores, points lost, coverage,
          request status and review inputs. Reviews begin after 150 ms of
          ascent; up to two requests are allowed per rep. Advice must be under
          five seconds old at Ready, and changed or uncertain factors retain
          their measured values.
        </p>
      </section>

      <footer className="docs-footer">
        <strong>What the system cannot tell you yet</strong>
        <p>
          Knee collapse, hip/spine posture, heel contact, foot pressure, load
          and core bracing are not assessed. IMU angles and IK positions are
          estimates. The ratings describe the measured movement against our
          configured targets; they are not an injury-risk prediction.
        </p>
      </footer>
    </main>
  );
}
