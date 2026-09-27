# Kinetiq

Kinetiq uses SlimeVR's React frontend and its existing skeleton visualizer. The default **Tracking** tab displays the live skeleton from assigned physical trackers and offers independent three-rep Form Test and eight-rep Working Set sessions. It requires fresh tracker and bone feeds and shows a waiting state when tracking is unavailable; it has no simulated tracking source. Completed reps receive experimental measured-movement scores. **Sensor Calibration** connects to the local tracking service for live body-node assignment, automatic mounting calibration, battery levels, and a live skeleton preview.

## Run locally

```sh
cd ~/HackUMBC-2027
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run dev` builds the local SolarXR protocol package before starting Vite.

## Sensor Calibration

Start SlimeVR Server as the local tracking service on the same computer (the frontend defaults to `ws://localhost:21110`). Kinetiq exposes node setup directly; the original server dashboard and onboarding routes redirect to Kinetiq.

Open **Connect nodes**, enter the 2.4 GHz Wi-Fi network and password, and choose **Start USB setup**. Plug in and power on one ESP node at a time using a data-capable cable. Automatic detection selects its serial port; the USB selector also supports choosing a specific attached node. Setup reports USB detection, Wi-Fi connection, server discovery, and actionable errors. Choose **Stop USB setup** when finished or before changing credentials. Credentials remain in page memory through setup and tab switching until the page is reloaded, are not stored in browser storage, and the node remembers its network. The computer must use the same network; iPhone hotspots need **Maximize Compatibility** enabled.

Previously configured nodes reconnect when powered on. New wireless nodes found on the network show a **Connect node** action inside Kinetiq. USB is for setup or charging; motion arrives over Wi-Fi. The local tracking service must remain running. A web page cannot start that service by itself.

If the receiver stops, connect the laptop to the nodes' network and choose **Restart tracking service** at the top of Sensor Calibration. The local development server restarts the existing Java service with its saved configuration and waits for both the dashboard API and UDP receiver to listen. This does not switch Wi-Fi, reflash nodes, or change credentials. After a restart, repeat auto-orientation and reference capture. Receiver readiness does not prove that any node has connected; use the node list to check that.

The restart control currently requires Windows, PowerShell 7 (`pwsh.exe`), Java, and `npm run dev`. By default it uses `../work/slimevr-runtime` with `slimevr.jar` and `server.pid`. Set the launch environment variables `KINETIQ_TRACKING_RUNTIME`, `KINETIQ_JAVA`, or `KINETIQ_POWERSHELL` for another installation. The runtime must contain the server JAR and its existing configuration. The control checks the saved process identity before stopping it and refuses unrelated port owners. Requests are restricted to loopback, the same origin, and a per-server restart token. Static builds and hosted sites cannot restart a local process and show the control as unavailable.

Choose a physical **Node**, select its **Body position**, then choose **Save assignment**. Positions are chest, head, and left/right elbows, hands/wrists, knees, and ankles. Existing wrist assignments remain supported. The service saves the body role and its display name; the node dropdown shows that role alongside the hardware identifier and online/offline status. Changes are shown after server confirmation. Saved offline nodes can also be assigned. Occupied positions are blocked: choose **Unassigned** on the previous node before moving that position to another node.

The **Your nodes** connection manager shows each physical node separately, with current online/offline status, body position, and incoming packet rate. **Configure** selects that exact node for assignment. Online unassigned nodes also appear in an assignment notice. Wi-Fi setup completion is a historical result; the live feed determines current connection status. The skeleton counter distinguishes assigned online nodes from the total online count.

Use **Auto-orient** in the header to run the service's automatic mounting calibration. Start upright with arms relaxed at your sides, then hold the bent-arm ski pose shown in the dialog. T-pose selection has been removed. The backend arm-reset setting is set to BACK and read back before calibration begins; all other settings are preserved. Both steps use server-confirmed countdowns. Repeat after changing how a node is worn. The node table shows reported battery percentages and remaining-runtime estimates when available. Offline or unreported battery levels are shown as unavailable.

Placement matters because an IMU measures a rigid body segment. Elbow nodes go just above the elbow (upper-arm role), hand/wrist nodes just above the wrist (lower-arm role, measuring forearm orientation), knee nodes just above the knee (upper-leg role), and ankle nodes on the lower leg (lower-leg role). These mappings follow the backend's segment model and [tracker placement guidance](https://docs.slimevr.dev/server/putting-on-trackers.html). Left and right refer to the wearer's body. Placement hints appear beside the assignment selector.

Attach the nodes securely, stand upright facing forward, then choose **Reset upright pose** to send a real full reset. This invalidates any measurement reference; complete auto-orientation again before capturing a new reference. The orientation panel follows the selected node. The skeleton uses all assigned online nodes independently of which node is selected, and stops displaying a live pose if the connection or data feed is lost. Missing segments remain estimated.

## Milestone 1: calibrated measurements

Kinetiq uses headset-free floor tracking. On connection it enables and reads back the service's self-localization, foot planting, floor clipping, and skating correction settings while preserving other model settings. Both previews translate the complete skeleton so its lowest foot endpoint meets the floor; a raised foot remains raised. If foot bones are absent, the lower-leg endpoint is used. Camera framing follows segment lengths instead of changing head height, so crouching does not zoom the view. This floor contact is inferred, not measured foot pressure or verified heel contact; it must not be used as evidence of good form. After changing placement, run auto-orientation and capture a fresh upright reference.

Eight measurement nodes are required: head, chest, both thighs (knee positions), both shins (ankle positions), and both feet. Elbows are optional. Saved hand/wrist assignments remain visible but must be explicitly reassigned after physically moving those nodes to the feet. A streaming legacy hand/wrist node blocks measurement readiness and calibration with a migration message; the app never silently changes its assignment. The three-step setup checklist identifies missing, duplicate, offline, stale, or invalid readings. Run **Auto-orient**, completing the upright and ski-pose steps, then return upright and choose **Capture reference**. Auto-orientation works with any supported assigned online nodes; it does not require the complete eight-node measurement setup or a hip node. The separate reference capture still requires all eight measurement nodes. The wizard waits for matching server completion messages; a connection or assignment change interrupts it. Server confirmation does not establish physical alignment: visually check the skeleton.

Reference capture requires at least 20 samples spanning three seconds, with all eight nodes within three degrees of their first sample and no sample gap over 350 ms. Head, chest, thigh and shin up axes must be within 20 degrees of vertical; foot nodes may lie flat but must remain stable. These are adjustable acquisition guards, not lifting-form thresholds. Movement restarts the hold; missing data or a 15-second timeout stops capture. The reference stays in page memory and is invalidated by service reconnection, calibration resets, core-node identity/assignment changes, or mounting-setting changes. Recalibrate manually after moving a strap.

The Tracking page then shows unsigned left/right knee-bend estimates, their difference, and head-to-chest pitch/turn. These use calibrated physical tracker quaternions, relative segment rotations, and changes from the captured stance. Shared world heading cancels out. Knee bend is the angle between neutral and current segment up axes; pitch/turn use YXZ Euler decomposition, with near-singular readings withheld. Values are not clinical anatomical measurements, eye gaze, or a form score. Missing sensors suppress only measurements that depend on them; unavailable values stay blank with a reason.

Measurement freshness requires a feed received within one second plus a positive backend packet rate and an OK tracker status. SolarXR does not provide a per-sample hardware timestamp here, so this cannot independently prove each sensor sample's age. Physical alignment, drift, and accuracy still require real tracker testing.

## Live squat sessions

After auto-orientation and upright reference capture, select **Form Test** or **Working Set** on Tracking or Presentation. Both use the same live calibrated knee measurements, phase detector, skeleton, and graphs. A stable upright return completes each rep; a data gap discards only an unfinished rep. The selector stays on the chosen mode while the page is open and is disabled during an active session. No baseline or other session is required to start either mode. Reloading starts a fresh in-memory session.

**Form Test** ends after three reps and evaluates squat depth only. Each rep uses the lesser of its smoothed left and right maximum knee flexion. At least 75° of bend from the upright reference (0° = straight) is acceptable; 60° to under 75° is shallow, and under 60° is very shallow. There is no upper depth limit. All three reps are recorded even when an earlier rep is shallow. The result passes the depth criterion only if all three reps are acceptable, and **Run Form Test Again** starts a fresh attempt. It does not assess overall squat safety or gate Working Set.

**Working Set** retains its eight-rep count, measured-form scoring, chart, and set feedback. It can start directly without a Form Test. Calibrated head up/down has an inclusive target range of -35° to +35° relative to the upright reference: positive is up, negative is down. These are experimental engineering targets, not medical judgments.

## Checks

Tracking keeps two movement-debugging graphs visible: head up/down and left/right upper-to-lower-leg bend. Head up/down is the change in the calibrated head forward-axis inclination relative to the floor (positive up, negative down). A dashed head/chest trace distinguishes neck motion from torso lean. Knee bend uses the existing unsigned, neutral-relative segment-angle estimate; its supplementary inner-angle estimate is `180 - bend` (straight reference = 180 degrees). Neither value is a validated form threshold or squat-depth score. The debug cards show current readings, ten-second minima/maxima, plotted sample counts, per-trace availability, reference status, ready-node count, and feed age. History uses actual feed arrival times, breaks across unavailable data or gaps over 500 ms, and clears when the reference changes. **Show sensor graphs / Hide sensor graphs** controls the individual IMU charts independently; their collection continues while hidden. These charts show measurements independently of the demo squat-depth classifier.

The Tracking page also plots each physical node's calibrated pitch, yaw, and roll in degrees over the last ten seconds. These are IMU orientations (YZX Euler convention), not joint angles or form scores. Missing/invalid rotations, offline nodes, and zero packet rates do not produce angle values. Readouts become unavailable after three seconds without a fresh sample. Graphs break at missing samples, gaps over half a second, and angle wrapping; calibration resets and reconnects clear their history. Samples stay in page memory only.

```sh
npm run typecheck
npm run test:measurements
npm run test:service
npm run test:floor
npm run test:squat
npm run lint
npm run build
```

The measurement test command requires Node.js 22.6 or newer and exercises quaternion math, calibration gates, motion/data gaps, and invalidation. Test data is confined to the test script; the application has no simulated tracking source.

## Architecture

- `src/components/sports/` contains the dashboard and styling.
- `src/components/sports/LiveMovementDashboard.tsx` uses the existing SolarXR data feeds, body assignment/name RPC, and reset hook for physical trackers. `node-positions.ts` defines the ten supported positions and their segment mappings.
- `src/measurement/` contains the shared live measurement engine, reference capture, data-quality gates, and provider. `MeasurementPanel.tsx` exposes setup and measurements on the two tabs.
- `src/exercise/SquatSessionProvider.tsx` shares the live phase detector and session state across Tracking and Presentation. `session-config.ts` defines the independent 3/8-rep targets, and `form-test.ts` evaluates only Form Test depth. `SquatSessionPanel.tsx` displays either mode on Tracking. Legacy depth/baseline helpers remain in `squat.ts` but are not used by the session UI.
- `src/components/sports/NodeSetup.tsx` uses serial discovery and Wi-Fi provisioning RPCs. The password is visible and retained in page memory through setup, stopping, and tab switching; reloading the page clears it. `NodePicker.tsx` supplies the keyboard-accessible node selectors, including saved offline nodes.
- `src/components/widgets/SkeletonVisualizerWidget.tsx` remains SlimeVR's renderer. Both tabs use the server-fed `bonesAtom` path. The Tracking page requires a connected service, an assigned online physical IMU, nonempty bones, and tracker and bone feeds received within the last three seconds. Missing segments are estimated by the tracking service.
- `solarxr-protocol/` is the local protocol package used by the frontend. Its dependency path points within this repository.
- `/#/` (Tracking), `/#/calibration` (Sensor Calibration), `/#/presentation`, and `/#/feedback` are exposed; legacy dashboard, settings, and onboarding URLs redirect to Tracking.

Kinetiq currently provides hardware setup, calibration, live skeleton viewing, and demo squat-depth validation. It does not provide a validated lifting-form or injury assessment. Tracker orientation and inferred skeleton positions are not validated biomechanics measurements.

This project reuses code from [SlimeVR Server](https://github.com/SlimeVR/SlimeVR-Server) at commit `83941fd38e91cc91ca6b360deab5c2ae986dd1b6`. Its MIT and Apache 2.0 licenses and trademark notice are included here. The separate SlimeVR Server checkout is not modified.

The calibration workspace has a header toolbar, compact node inspector and a connected-node table with optional arm rows. Restart and upright reset controls are in the header overflow menu; detailed setup reasons remain under Setup details. The preview uses the original SlimeVR line skeleton renderer. Front, Side and 3D presets share a floor-centered target and fit the body height and viewport aspect ratio. No additional body model or rendering engine is used.


### Live squat phases and Jev

Tracking and Presentation share one in-memory session with a mode selector. The selected mode determines whether recording stops after three Form Test reps or eight Working Set reps. Switching modes while idle preserves each mode’s results; switching during recording is disabled. Form Test uses only its 75-degree depth criterion. Working Set still scores measured form at the confirmed return to Ready and shows the eight-slot chart; an unfinished rep never moves its score. Navigation preserves the count, while reloading starts a new session.

The detector uses both calibrated knee-bend angles (zero at upright). A three-sample median and a 300 ms velocity window suppress noise. Sustained bilateral movement enters descent; a reversal of at least six degrees confirms the bottom, followed by ascent. A stable upright return completes a rep. A mid-descent pause does not declare bottom, so the bottom label necessarily appears just after the turn. Confirmation takes approximately 160–360 ms plus filtering. Phases do not switch backwards. Larger repeat descents, invalid readings, gaps over 500 ms, or a rep exceeding 30 seconds discard the unfinished rep. Completed set reps survive a temporary feed interruption; changing the calibration reference stops recording.

Head height is the SolarXR head position plus the same floor offset used by the IK viewport. It is an estimate, not a measured position. Only fresh, aligned head samples support transitions; missing head data falls back to bilateral knee motion. These initial timing thresholds need validation with worn trackers and representative squat speeds.

Jev is an asynchronous adviser, never the counter's authority. During a started Form Test or Working Set, it receives up to two seconds of knee angles, estimated head heights, timestamps, and the current phase. Requests are limited to one in flight and at most one per 250 ms. Responses older than 500 ms or from a previous phase/reference/session are discarded. High-confidence advice may adjust the confirmation delay but cannot supply missing knee movement, reverse the state sequence, or create a rep. Errors back off for five seconds while local detection continues. Diagnostics on Tracking and the Presentation options menu show its status.

Configure the local Vite development/preview server with `TYPESAFE_API_KEY`, or put `KINETIQ_JEV_KEY_FILE=C:/path/to/jev.txt` in ignored `.env.local`. The file should contain only the key. These settings must never use a `VITE_` prefix: the key is read only by the local proxy. The fixed endpoint uses `jev-1.13.0`; API reference: https://docs.typesafe.ai/api. A static deployment without this local proxy continues with local phase detection. Run `npm run test:phase` for phase and adviser regression tests.

### Completed-rep form feedback

The `measured-movement-v1` profile weights knee symmetry 25%, torso control 20%, lowering control 20%, depth 20%, foot orientation 10%, and head control 5%. Each family is capped so correlated signals cannot multiply its weight. The measured score is 100 minus the weighted severity deductions. Eligible Jev form reviews contribute 5% to the final numeric score, with 95% from measurements; category gates remain measurement-controlled. The chart bands are categorical, not a numeric vertical scale: a sustained issue can be Sub-optimal even with a high overall score. Needs attention requires a score below 65 plus substantial issues in at least two separate control families; depth or head position alone cannot cause it.

Time-weighted evidence must persist for at least 350 ms. Every required family needs at least 85% usable sample coverage; missing or corrupt inputs produce Insufficient data, never a healthy default. Coverage describes usable samples, not a probability of correct form. Normal forward torso lean and fast ascent are not penalized. These are experimental engineering thresholds requiring real-tracker validation. Knee collapse, hip/spine posture, heel contact, foot pressure, load and core bracing are not assessed. Jev advises phase timing and can make a bounded contribution to the numeric form score, as described below. Model agreement is not independent sensor corroboration.

The Feedback tab follows Presentation. Finishing eight reps or stopping a partial set with completed reps opens its report, except while on Calibration. It lists each completed rep, weighted score, coverage, repeated improvement cues and a first-three versus last-three trend when enough scored reps exist. Scores are finalized once per rep at Ready and remain fixed through the set. Starting a new set clears this in-memory report; reloading also clears it. Run `npm run test:form` for scoring regressions.

### Curated Jev form review

The separate `/api/squat-form` endpoint receives `form-summary-v1`: 27 named numeric/null metrics plus six factor records containing coverage, measured severity and sustained-issue duration. Metrics include observed phase durations, sample count/gaps, bilateral peak bend and return angle, knee asymmetry, sideways chest tilt, additional chest drop during ascent, filtered lowering/rising speeds, signed head-tilt extrema and time outside ±35°, foot roll and ankle asymmetry. Raw samples, quaternions, tracker identifiers, credentials and free-text notes are not part of this payload. The proxy enforces the exact schema and sends only these curated fields. The existing phase adviser remains separate.

During a started set, form review becomes eligible late in ascent (both knees at most 30° bend), after descent, bottom and ascent evidence with at least 85% coverage per factor. At most two review calls per rep are made, at least 500 ms apart, with only one form request in flight. The five typed questions assess symmetry, torso control, lowering control, foot orientation and head control; depth retains the measured 98° rule. Jev cannot move configured thresholds or infer unmeasured posture/contact/pressure.

At the confirmed Ready transition, eligible factors need confidence >=0.8, chosen-option probability >=0.7, response age <=1 second and a matching rep/reset epoch. A factor whose measured severity changed by more than 0.15 after the request falls back to its measured value. Uncertain factors also retain measured values. The proposed score uses the same factor weights; final score = 0.95 × measured + 0.05 × proposed, rounded to one decimal. Missing data remains unknown, and Jev cannot create or remove the measured Needs attention category. These confidence cutoffs are engineering defaults, not validated squat accuracy estimates.

The score freezes at Ready. Late responses, outages and absent reviews do not delay completion or retroactively move graph points. Feedback includes the measured score, Jev proposal, fallback reason and an expandable copy of the curated review inputs when a response was received. Neither review inputs nor reports survive a new set or page reload. Synthetic contract, blending, timing and failure tests are included in `npm run test:form`; real movement accuracy still requires recorded, reviewed tracker testing.
