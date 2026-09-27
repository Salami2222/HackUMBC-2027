# MotionLab

MotionLab uses SlimeVR's React frontend and its existing skeleton visualizer. The default **Tracking** tab shows a simulated squat session with a personal warm-up baseline and live movement graphs. **Sensor Calibration** connects to a local SlimeVR server for live chest tracker setup and pose preview.

## Run locally

```sh
cd ~/HackUMBC-2027
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run dev` builds the local SolarXR protocol package before starting Vite.

## Sensor Calibration

Start SlimeVR Server as the local tracking service on the same computer (the frontend defaults to `ws://localhost:21110`). MotionLab exposes node setup directly; the original server dashboard and onboarding routes redirect to MotionLab.

Open **Connect nodes**, enter the 2.4 GHz Wi-Fi network and password, and choose **Start USB setup**. Plug in and power on one ESP node at a time using a data-capable cable. Automatic detection selects its serial port; the USB selector also supports choosing a specific attached node. Setup reports USB detection, Wi-Fi connection, server discovery, and actionable errors. Choose **Stop USB setup** when finished or before changing credentials. Credentials are kept only for the active setup session, not stored in browser storage, and the node remembers its network. The computer must use the same network; iPhone hotspots need **Maximize Compatibility** enabled.

Previously configured nodes reconnect when powered on. New wireless nodes found on the network show a **Connect node** action inside MotionLab. USB is for setup or charging; motion arrives over Wi-Fi. The local tracking service must remain running. A web page cannot start that service by itself.

Select the physical tracker and choose **Assign to chest**. The UI waits for the server to confirm the assignment. Attach it to your chest, stand upright facing forward, then choose **Reset upright pose** to send a real SlimeVR full reset. Live mode uses the server's bone feed and adjusted tracker orientation, and stops displaying a live pose if the connection or data feed is lost. Other skeleton segments are inferred by SlimeVR. Knee angles, rep counts, and form scores remain unavailable with this single-tracker setup.

For the hardware-free demo, open the default **Tracking** tab, leave **Squat** selected (or choose **Deadlift**), and select **Record Baseline**. After eight mock reps, the app averages them into a personal baseline and enables **Start Session**. The ten session reps are compared with that baseline. **Record Baseline Again** clears the previous baseline and session results; **Stop Session** stops the current mock stream. The four graphs show the latest five seconds of frame data. Their dashed benchmarks are the averaged warm-up rep values.

## Checks

```sh
npm run typecheck
npm run lint
npm run build
```

## Architecture

- `src/components/sports/` contains the dashboard and styling.
- `src/components/sports/MovementGraphs.tsx` renders four rolling frame traces for knee angle, hip angle, torso lean, and squat depth.
- `src/components/sports/LiveMovementDashboard.tsx` uses the existing SolarXR data feeds, chest assignment RPC, and reset hook for physical trackers.
- `src/analysis/` contains normalized exercise frames, the mock 30 Hz provider, the warm-up baseline calculator, training comparison calculations, and mock SolarXR bones. Warm-up reps, training reps, and the calculated baseline are held separately in React state; refreshing the page clears them.
- `src/components/sports/NodeSetup.tsx` uses serial discovery and Wi-Fi provisioning RPCs. The password is masked and cleared from the form after submission. `NodePicker.tsx` supplies the keyboard-accessible node selectors, including saved offline nodes.
- `src/components/widgets/SkeletonVisualizerWidget.tsx` remains SlimeVR's renderer. The demo passes mock `BoneT` values through `bonesOverride`; live mode uses the server-fed `bonesAtom` path.
- `solarxr-protocol/` is the local protocol package used by the frontend. Its dependency path points within this repository.
- Only `/#/` (Tracking) and `/#/calibration` (Sensor Calibration) are exposed; legacy dashboard, settings, and onboarding URLs redirect to Tracking.

The Tracking tab's sample motion and scores demonstrate a product concept; they are not validated biomechanics measurements. The Sensor Calibration tab's upright reset calls SlimeVR's reset API; live orientation is not a validated lifting score or the source of the Tracking tab's squat metrics.

This project reuses code from [SlimeVR Server](https://github.com/SlimeVR/SlimeVR-Server) at commit `83941fd38e91cc91ca6b360deab5c2ae986dd1b6`. Its MIT and Apache 2.0 licenses and trademark notice are included here. The separate SlimeVR Server checkout is not modified.
