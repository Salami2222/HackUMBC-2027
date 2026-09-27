# School mascot

`kinetiq-mascot.glb` is the supplied Meshy bulldog model with its textures and
28-joint skinned rig. Both `360_Power_Spin_Jump` clips and their unused buffers
have been removed. The original download is not modified.

To reproduce the export:

```sh
node scripts/prepare-mascot.mjs path/to/Meshy_AI_Angry_Bulldog_Mascot_360_Power_Spin_Jump.glb public/models/kinetiq-mascot.glb
```

Presentation's **School mascot** switch loads this file on demand in the existing
SlimeVR viewport. `src/utils/mascotRig.ts` maps this asset's joints to SolarXR
global rotations, restores the bind pose, and grounds the rendered soles. No
animation mixer or prerecorded motion is used. Hands and toes retain their
local rest poses and follow their parent segments. The mascot keeps its own
proportions; the scoring system continues to use the original sensor data.

This mapping is specific to this rig's joint names and axes. Replacing the model
requires checking that mapping. `npm run test:mascot` checks the exported asset,
pose retargeting, and invalid-input handling without loading textures in Node.
