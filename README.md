# Kinetiq

Kinetiq uses SlimeVR's React frontend and its existing skeleton visualizer. The default **Tracking** tab displays the live skeleton from assigned physical trackers. It requires fresh tracker and bone feeds and shows a waiting state when tracking is unavailable; it has no simulated sessions, sample metrics, or form scoring. **Sensor Calibration** connects to the local tracking service for live body-node assignment, automatic mounting calibration, battery levels, and a live skeleton preview.

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

Use **Auto-orient trackers** at the top to run the service's automatic mounting calibration. Choose T-pose arms (the default) or bent ski-pose arms. Both start with an upright full reset with arms down. For the second step, T-pose mode extends your arms sideways 90 degrees from the torso; knee and torso trackers still require ski-pose legs and a forward torso lean. Ski mode uses bent arms instead. The selected backend arm-reset setting is saved and read back before calibration begins; other reset settings are preserved. Both steps have server-confirmed countdowns and completion. Wear and assign all nodes first; one calibration applies individual mounting corrections to the assigned online trackers. Repeat when you change how the nodes are worn. The node list also shows reported battery percentages and remaining-runtime estimates when available. Offline or unreported battery levels are shown as unavailable.

Placement matters because an IMU measures a rigid body segment. Elbow nodes go just above the elbow (upper-arm role), hand/wrist nodes just above the wrist (lower-arm role, measuring forearm orientation), knee nodes just above the knee (upper-leg role), and ankle nodes on the lower leg (lower-leg role). These mappings follow the backend's segment model and [tracker placement guidance](https://docs.slimevr.dev/server/putting-on-trackers.html). Left and right refer to the wearer's body. Placement hints appear beside the assignment selector.

Attach the nodes securely, stand upright facing forward, then choose **Reset upright pose** to send a real full reset. This invalidates any measurement reference; complete auto-orientation again before capturing a new reference. The orientation panel follows the selected node. The skeleton uses all assigned online nodes independently of which node is selected, and stops displaying a live pose if the connection or data feed is lost. Missing segments remain estimated.

## Milestone 1: calibrated measurements

Kinetiq uses headset-free floor tracking. On connection it enables and reads back the service's self-localization, foot planting, floor clipping, and skating correction settings while preserving other model settings. Both previews translate the complete skeleton so its lowest foot endpoint meets the floor; a raised foot remains raised. If foot bones are absent, the lower-leg endpoint is used. Camera framing follows segment lengths instead of changing head height, so crouching does not zoom the view. This floor contact is inferred, not measured foot pressure or verified heel contact; it must not be used as evidence of good form. After changing placement, run auto-orientation and capture a fresh upright reference.

Six measurement nodes are required: head, chest, both thighs (knee positions), and both shins (ankle positions). Elbows and hands/wrists are optional for these measurements. The **Upright reference** checklist identifies missing, duplicate, offline, stale, or invalid readings. Run **Auto-orient trackers**, completing the upright and ski-pose steps, then return upright and choose **Capture upright reference**. Auto-orientation works with any supported assigned online nodes; it does not require the complete six-node measurement setup or a hip node. The separate reference capture still requires all six measurement nodes. The wizard waits for matching server completion messages; a connection or assignment change interrupts it. Server confirmation does not establish physical alignment: visually check the skeleton.

Reference capture requires at least 20 samples spanning three seconds, with all six nodes within three degrees of their first sample and no sample gap over 350 ms. Segment up axes must be within 20 degrees of vertical. These are adjustable acquisition guards, not lifting-form thresholds. Movement restarts the hold; missing data or a 15-second timeout stops capture. The reference stays in page memory and is invalidated by service reconnection, calibration resets, core-node identity/assignment changes, or mounting-setting changes. Recalibrate manually after moving a strap.

The Tracking page then shows unsigned left/right knee-bend estimates, their difference, and head-to-chest pitch/turn. These use calibrated physical tracker quaternions, relative segment rotations, and changes from the captured stance. Shared world heading cancels out. Knee bend is the angle between neutral and current segment up axes; pitch/turn use YXZ Euler decomposition, with near-singular readings withheld. Values are not clinical anatomical measurements, eye gaze, or a form score. Missing sensors suppress only measurements that depend on them; unavailable values stay blank with a reason.

Measurement freshness requires a feed received within one second plus a positive backend packet rate and an OK tracker status. SolarXR does not provide a per-sample hardware timestamp here, so this cannot independently prove each sensor sample's age. Physical alignment, drift, and accuracy still require real tracker testing. Rep counting, squat phases, form rules, recording, and Jev integration are outside this milestone.

## Checks

The Tracking page also plots each physical node's calibrated pitch, yaw, and roll in degrees over the last ten seconds. These are IMU orientations (YZX Euler convention), not joint angles or form scores. Missing/invalid rotations, offline nodes, and zero packet rates do not produce angle values. Readouts become unavailable after three seconds without a fresh sample. Graphs break at missing samples, gaps over half a second, and angle wrapping; calibration resets and reconnects clear their history. Samples stay in page memory only.

```sh
npm run typecheck
npm run test:measurements
npm run test:service
npm run test:floor
npm run lint
npm run build
```

The measurement test command requires Node.js 22.6 or newer and exercises quaternion math, calibration gates, motion/data gaps, and invalidation. Test data is confined to the test script; the application has no simulated tracking source.

## Architecture

- `src/components/sports/` contains the dashboard and styling.
- `src/components/sports/LiveMovementDashboard.tsx` uses the existing SolarXR data feeds, body assignment/name RPC, and reset hook for physical trackers. `node-positions.ts` defines the ten supported positions and their segment mappings.
- `src/measurement/` contains the shared live measurement engine, reference capture, data-quality gates, and provider. `MeasurementPanel.tsx` exposes setup and measurements on the two tabs.
- `src/components/sports/NodeSetup.tsx` uses serial discovery and Wi-Fi provisioning RPCs. The password is visible and retained in page memory through setup, stopping, and tab switching; reloading the page clears it. `NodePicker.tsx` supplies the keyboard-accessible node selectors, including saved offline nodes.
- `src/components/widgets/SkeletonVisualizerWidget.tsx` remains SlimeVR's renderer. Both tabs use the server-fed `bonesAtom` path. The Tracking page requires a connected service, an assigned online physical IMU, nonempty bones, and tracker and bone feeds received within the last three seconds. Missing segments are estimated by the tracking service.
- `solarxr-protocol/` is the local protocol package used by the frontend. Its dependency path points within this repository.
- Only `/#/` (Tracking) and `/#/calibration` (Sensor Calibration) are exposed; legacy dashboard, settings, and onboarding URLs redirect to Tracking.

Kinetiq currently provides hardware setup, calibration, and live skeleton viewing. It does not detect reps or assess lifting form. Tracker orientation and inferred skeleton positions are not validated biomechanics measurements.

This project reuses code from [SlimeVR Server](https://github.com/SlimeVR/SlimeVR-Server) at commit `83941fd38e91cc91ca6b360deab5c2ae986dd1b6`. Its MIT and Apache 2.0 licenses and trademark notice are included here. The separate SlimeVR Server checkout is not modified.
