# MotionLab

MotionLab uses SlimeVR's React frontend and its existing skeleton visualizer. The root dashboard shows live chest orientation from a SlimeVR server. The separate demo at `/#/demo` offers squat and deadlift sessions with mock exercise data and simulated trackers.

## Run locally

```sh
cd ~/HackUMBC-2027
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run dev` builds the local SolarXR protocol package before starting Vite.

## Live chest tracking

Start SlimeVR Server on the same computer (the frontend defaults to `ws://localhost:21110`). Power on the tracker and connect it to the same network as the computer. ESP tracker USB connections are used for setup; motion arrives over Wi-Fi. Newly discovered trackers use SlimeVR's existing device approval dialog.

Select the physical tracker and choose **Assign to chest**. The UI waits for the server to confirm the assignment. Attach it to your chest, stand upright facing forward, then choose **Reset upright pose** to send a real SlimeVR full reset. Live mode uses the server's bone feed and adjusted tracker orientation, and stops displaying a live pose if the connection or data feed is lost. Other skeleton segments are inferred by SlimeVR. Knee angles, rep counts, and form scores remain unavailable with this single-tracker setup.

For the hardware-free demo, open `/#/demo`, choose an exercise, and select **Start Warm-Up**. After eight mock reps, the app averages all eight into a personal baseline and enables **Start Training Session**. The ten training reps are compared with that baseline. **Redo Warm-Up** clears the previous baseline and training results. The calibration countdown is an optional mock demonstration.

## Checks

```sh
npm run typecheck
npm run lint
npm run build
```

## Architecture

- `src/components/sports/` contains the dashboard and styling.
- `src/components/sports/LiveMovementDashboard.tsx` uses the existing SolarXR data feeds, chest assignment RPC, and reset hook for physical trackers.
- `src/analysis/` contains normalized exercise frames, the mock 30 Hz provider, the warm-up baseline calculator, training comparison calculations, and mock SolarXR bones. Warm-up reps, training reps, and the calculated baseline are held separately in React state; refreshing the page clears them.
- `src/components/widgets/SkeletonVisualizerWidget.tsx` remains SlimeVR's renderer. MotionLab passes mock `BoneT` values through its optional `bonesOverride` input; other SlimeVR pages retain the existing server-fed `bonesAtom` path.
- `solarxr-protocol/` is the local protocol package used by the frontend. Its dependency path points within this repository.
- The original SlimeVR home page remains available at `/#/slimevr` when a server is connected.

The demo's sample motion and scores demonstrate a product concept; they are not validated biomechanics measurements. Its calibration is a mock countdown. The live dashboard's upright reset calls SlimeVR's reset API; live orientation is not a validated lifting score.

This project reuses code from [SlimeVR Server](https://github.com/SlimeVR/SlimeVR-Server) at commit `83941fd38e91cc91ca6b360deab5c2ae986dd1b6`. Its MIT and Apache 2.0 licenses and trademark notice are included here. The separate SlimeVR Server checkout is not modified.
