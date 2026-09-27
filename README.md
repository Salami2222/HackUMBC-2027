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

Choose a physical **Node**, select its **Body position**, then choose **Save assignment**. Positions are chest, head, and left/right elbows, hands (wrists), knees, and ankles. The service saves the body role and its display name; the node dropdown shows that role alongside the hardware identifier and online/offline status. Changes are shown after server confirmation. Saved offline nodes can also be assigned. Occupied positions are blocked: choose **Unassigned** on the previous node before moving that position to another node.

The **Your nodes** connection manager shows each physical node separately, with current online/offline status, body position, and incoming packet rate. **Configure** selects that exact node for assignment. Online unassigned nodes also appear in an assignment notice. Wi-Fi setup completion is a historical result; the live feed determines current connection status. The skeleton counter distinguishes assigned online nodes from the total online count.

Use **Auto-orient trackers** at the top to run the service's automatic mounting calibration. The dialog guides you through an upright full reset followed by the ski-pose mounting reset, with server-confirmed countdowns and completion. Wear and assign all nodes first; one calibration applies individual mounting corrections to the assigned online trackers. Repeat when you change how the nodes are worn. The node list also shows reported battery percentages and remaining-runtime estimates when available. Offline or unreported battery levels are shown as unavailable.

Placement matters because an IMU measures a rigid body segment. Elbow nodes go just above the elbow (upper-arm role), wrist nodes just above the wrist (lower-arm role), knee nodes just above the knee (upper-leg role), and ankle nodes on the lower leg (lower-leg role). Wrist nodes measure forearm orientation rather than independent hand flexion. These mappings follow the backend's segment model and [tracker placement guidance](https://docs.slimevr.dev/server/putting-on-trackers.html). Left and right refer to the wearer's body. Placement hints appear beside the assignment selector.

Attach the nodes securely, stand upright facing forward, then choose **Reset upright pose** to send a real full reset. The orientation panel follows the selected node. The skeleton uses all assigned online nodes independently of which node is selected, and stops displaying a live pose if the connection or data feed is lost. Missing segments remain estimated. Knee angles, rep counts, and form scores are not yet calculated in live mode.

## Checks

The Tracking page also plots each physical node's calibrated pitch, yaw, and roll in degrees over the last ten seconds. These are IMU orientations (YZX Euler convention), not joint angles or form scores. Missing/invalid rotations, offline nodes, and zero packet rates do not produce angle values. Readouts become unavailable after three seconds without a fresh sample. Graphs break at missing samples, gaps over half a second, and angle wrapping; calibration resets and reconnects clear their history. Samples stay in page memory only.

```sh
npm run typecheck
npm run lint
npm run build
```

## Architecture

- `src/components/sports/` contains the dashboard and styling.
- `src/components/sports/LiveMovementDashboard.tsx` uses the existing SolarXR data feeds, body assignment/name RPC, and reset hook for physical trackers. `node-positions.ts` defines the ten supported positions and their segment mappings.
- `src/components/sports/NodeSetup.tsx` uses serial discovery and Wi-Fi provisioning RPCs. The password is visible and retained in page memory through setup, stopping, and tab switching; reloading the page clears it. `NodePicker.tsx` supplies the keyboard-accessible node selectors, including saved offline nodes.
- `src/components/widgets/SkeletonVisualizerWidget.tsx` remains SlimeVR's renderer. Both tabs use the server-fed `bonesAtom` path. The Tracking page requires a connected service, an assigned online physical IMU, nonempty bones, and tracker and bone feeds received within the last three seconds. Missing segments are estimated by the tracking service.
- `solarxr-protocol/` is the local protocol package used by the frontend. Its dependency path points within this repository.
- Only `/#/` (Tracking) and `/#/calibration` (Sensor Calibration) are exposed; legacy dashboard, settings, and onboarding URLs redirect to Tracking.

Kinetiq currently provides hardware setup, calibration, and live skeleton viewing. It does not detect reps or assess lifting form. Tracker orientation and inferred skeleton positions are not validated biomechanics measurements.

This project reuses code from [SlimeVR Server](https://github.com/SlimeVR/SlimeVR-Server) at commit `83941fd38e91cc91ca6b360deab5c2ae986dd1b6`. Its MIT and Apache 2.0 licenses and trademark notice are included here. The separate SlimeVR Server checkout is not modified.
