// Keep the supplied mesh, textures and skin, without exporting any animation.
// Usage: node scripts/prepare-mascot.mjs input.glb output.glb
import fs from 'node:fs';
import path from 'node:path';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Provide input and output GLB paths.');
if (path.resolve(input) === path.resolve(output))
  throw new Error('Export to a separate file to preserve the original.');
const source = fs.readFileSync(input);
if (source.readUInt32LE(0) !== 0x46546c67 || source.readUInt32LE(4) !== 2)
  throw new Error('Expected a glTF 2 GLB.');
const jsonLength = source.readUInt32LE(12);
const asset = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
const binary = source.subarray(28 + jsonLength);
if (!asset.skins?.length) throw new Error('A skinned rig is required.');
delete asset.animations;
const accessors = new Set();
for (const mesh of asset.meshes ?? [])
  for (const primitive of mesh.primitives) {
    Object.values(primitive.attributes).forEach((id) => accessors.add(id));
    if (primitive.indices != null) accessors.add(primitive.indices);
    for (const target of primitive.targets ?? [])
      Object.values(target).forEach((id) => accessors.add(id));
  }
for (const skin of asset.skins)
  if (skin.inverseBindMatrices != null) accessors.add(skin.inverseBindMatrices);
const accessorMap = new Map([...accessors].map((id, index) => [id, index]));
for (const mesh of asset.meshes ?? [])
  for (const primitive of mesh.primitives) {
    for (const attributes of [
      primitive.attributes,
      ...(primitive.targets ?? []),
    ])
      for (const key of Object.keys(attributes))
        attributes[key] = accessorMap.get(attributes[key]);
    if (primitive.indices != null)
      primitive.indices = accessorMap.get(primitive.indices);
  }
for (const skin of asset.skins)
  if (skin.inverseBindMatrices != null)
    skin.inverseBindMatrices = accessorMap.get(skin.inverseBindMatrices);
asset.accessors = [...accessors].map((id) => asset.accessors[id]);
const views = new Set();
for (const accessor of asset.accessors) {
  if (accessor.sparse)
    throw new Error('Sparse accessors need a separate export.');
  if (accessor.bufferView != null) views.add(accessor.bufferView);
}
for (const image of asset.images ?? [])
  if (image.bufferView != null) views.add(image.bufferView);
const viewMap = new Map([...views].map((id, index) => [id, index]));
const chunks = [];
let offset = 0;
asset.bufferViews = [...views].map((id) => {
  const view = asset.bufferViews[id];
  if (view.buffer !== 0) throw new Error('Expected one embedded buffer.');
  const bytes = binary.subarray(
    view.byteOffset ?? 0,
    (view.byteOffset ?? 0) + view.byteLength
  );
  const padded = Buffer.alloc(Math.ceil(bytes.length / 4) * 4);
  bytes.copy(padded);
  chunks.push(padded);
  const next = { ...view, byteOffset: offset };
  offset += padded.length;
  return next;
});
for (const accessor of asset.accessors)
  if (accessor.bufferView != null)
    accessor.bufferView = viewMap.get(accessor.bufferView);
for (const image of asset.images ?? [])
  if (image.bufferView != null)
    image.bufferView = viewMap.get(image.bufferView);
asset.buffers = [{ byteLength: offset }];
const json = Buffer.from(JSON.stringify(asset));
const paddedJson = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
json.copy(paddedJson);
const result = Buffer.alloc(28 + paddedJson.length + offset);
result.writeUInt32LE(0x46546c67, 0);
result.writeUInt32LE(2, 4);
result.writeUInt32LE(result.length, 8);
result.writeUInt32LE(paddedJson.length, 12);
result.writeUInt32LE(0x4e4f534a, 16);
paddedJson.copy(result, 20);
result.writeUInt32LE(offset, 20 + paddedJson.length);
result.writeUInt32LE(0x004e4942, 24 + paddedJson.length);
Buffer.concat(chunks).copy(result, 28 + paddedJson.length);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, result);
console.log(
  `Exported ${result.length} bytes, ${asset.skins[0].joints.length} joints, no animation clips.`
);
