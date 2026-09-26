# MotionLab

MotionLab is a local sports motion-analysis demo built with SlimeVR's React frontend and its existing skeleton visualizer. Squat and deadlift sessions use mock exercise data and simulated trackers, so the demo runs without a SlimeVR server or IMU hardware.

## Run locally

```sh
cd ~/HackUMBC-2027
npm install
npm run dev
```

Open the local URL printed by Vite. The dashboard is the root page. Choose an exercise and select **Start Warm-Up**. After eight mock reps, the app averages all eight into a personal baseline and enables **Start Training Session**. The ten training reps are compared with that baseline. **Redo Warm-Up** clears the previous baseline and training results. The calibration countdown is an optional mock demonstration. `npm run dev` builds the local SolarXR protocol package before starting Vite.

## Checks

```sh
npm run typecheck
npm run lint
npm run build
```

## Architecture

- `src/components/sports/` contains the dashboard and styling.
- `src/analysis/` contains normalized exercise frames, the mock 30 Hz provider, the warm-up baseline calculator, training comparison calculations, and mock SolarXR bones. Warm-up reps, training reps, and the calculated baseline are held separately in React state; refreshing the page clears them.
- `src/components/widgets/SkeletonVisualizerWidget.tsx` remains SlimeVR's renderer. MotionLab passes mock `BoneT` values through its optional `bonesOverride` input; other SlimeVR pages retain the existing server-fed `bonesAtom` path.
- `solarxr-protocol/` is the local protocol package used by the frontend. Its dependency path points within this repository.
- The original SlimeVR home page remains available at `/#/slimevr` when a server is connected.

The sample motion and scores demonstrate a product concept; they are not validated biomechanics measurements. Calibration is a mock countdown and does not call SlimeVR reset APIs.

This project reuses code from [SlimeVR Server](https://github.com/SlimeVR/SlimeVR-Server) at commit `83941fd38e91cc91ca6b360deab5c2ae986dd1b6`. Its MIT and Apache 2.0 licenses and trademark notice are included here. The separate SlimeVR Server checkout is not modified.
