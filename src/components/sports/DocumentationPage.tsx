import { Link } from 'react-router-dom';
import { GROUPS } from '@/exercise/form-quality';
import './DocumentationPage.scss';

const ranges: Record<string, { range: string; meaning: string }> = {
  collapse: {
    range: '8–20° inward · experimental',
    meaning:
      'Signed thigh/shin deviation from the upright reference, checked separately per knee while bent at least 20°. The worse sustained side sets the deduction; both sides share one cap. Negative/outward movement is not penalized here.',
  },
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
  depth: {
    range: '98° knee bend',
    meaning:
      'Both legs must reach the target together. Standing straight is 0°; deeper bends have no upper cutoff in this rule.',
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
              you. Upright reset keeps this mounting correction; capture a new
              reference afterwards. Repeat auto-orient after moving a strap,
              changing assignments, or losing required tracking for over a
              minute.
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
            <span>
              Both knees at 0–15° bend. Stand steady initially to start.
            </span>
          </li>
          <li>
            <strong>Descending</strong>
            <span>Both knees bend increasingly, to at least 18°.</span>
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
              Two recent readings with both knees in the top range complete the
              rep. You do not need to pause before descending again.
            </span>
          </li>
        </ol>
        <p>
          Knee motion leads. Estimated head-height movement and fresh Jev advice
          can adjust confirmation timing, but cannot create a rep. Filtering and
          brief confirmation checks prevent phase flicker; a 2° exit tolerance
          handles top-out noise. Stillness is required only to arm tracking
          initially. A pause halfway down is not the bottom. A tracking gap over
          0.5 seconds discards the unfinished rep.
        </p>
        <p>
          Choose a three-rep Form Test or eight-rep Working Set from{' '}
          <Link to="/presentation">Presentation</Link>. Each score appears at
          Ready and stays fixed in its equally spaced graph slot. A counted rep
          can still miss the depth target. After the set,{' '}
          <Link to="/feedback">Feedback</Link> shows repeated issues and
          improvement cues and each rep’s weighted breakdown. Both modes use the
          same five factors, targets and Jev review. Neither requires a baseline
          or passing the other mode.
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
          moderate sustained deviations meaningful weight. Rep speed and foot
          position are excluded from scoring and Jev review. Depth uses the
          completed rep’s peak bend instead. These are current experimental
          targets, not universal lifting standards.
        </p>
        <p className="docs-note">
          Inward deviation assumes SlimeVR’s calibrated segment axes match your
          legs. Mounting errors and tracker drift can mix forward bending into
          this estimate. After calibration, check both traces against your
          movement in Tracking diagnostics, available from Presentation’s …
          menu. The 8°, 18° and 20° limits are experimental testing settings,
          not established safety limits. Equal inward movement of both knees can
          trigger this factor even when knee symmetry is good.
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
              Measured score below 65, with at least two of inward-knee
              deviation, symmetry and torso at 65% severity or higher. A
              pronounced inward estimate of at least 18° on the same knee for
              600 ms can also qualify with a score below 65. Head or depth alone
              cannot trigger this rating.
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
          For form scoring, Jev reviews 28 curated values and five factor
          summaries during ascent, with a second opportunity near the
          end—angles, durations, asymmetry and control—not the raw tracker
          stream. It can interpret patterns within the measured factors; the 98°
          depth rule and experimental inward-knee factor stay measurement-based.
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
          Confirmed anatomical knee collapse, hip/spine posture, heel contact,
          foot pressure, load and core bracing are not assessed. IMU angles and
          IK positions are estimates. The ratings describe the measured movement
          against our configured targets; they are not an injury-risk
          prediction.
        </p>
      </footer>
    </main>
  );
}
