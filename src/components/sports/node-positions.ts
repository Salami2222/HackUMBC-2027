import { BodyPart, TrackerDataT } from 'solarxr-protocol';

// These names describe strap locations. The IK roles describe the rigid
// segment measured there: above the knee is upper leg, at the ankle lower leg.
export const NODE_POSITIONS = [
  { part: BodyPart.CHEST, label: 'Chest', hint: 'Attach securely to your chest.' },
  { part: BodyPart.HEAD, label: 'Head', hint: 'Attach securely to a head strap.' },
  {
    part: BodyPart.LEFT_UPPER_ARM,
    label: 'Left elbow',
    hint: 'Place on your left upper arm, just above the elbow.',
  },
  {
    part: BodyPart.RIGHT_UPPER_ARM,
    label: 'Right elbow',
    hint: 'Place on your right upper arm, just above the elbow.',
  },
  {
    part: BodyPart.LEFT_LOWER_ARM,
    label: 'Left hand (wrist)',
    hint: 'Place on your left forearm, just above the wrist. This measures forearm orientation.',
  },
  {
    part: BodyPart.RIGHT_LOWER_ARM,
    label: 'Right hand (wrist)',
    hint: 'Place on your right forearm, just above the wrist. This measures forearm orientation.',
  },
  {
    part: BodyPart.LEFT_UPPER_LEG,
    label: 'Left knee',
    hint: 'Place on your left thigh, just above the knee.',
  },
  {
    part: BodyPart.RIGHT_UPPER_LEG,
    label: 'Right knee',
    hint: 'Place on your right thigh, just above the knee.',
  },
  {
    part: BodyPart.LEFT_LOWER_LEG,
    label: 'Left ankle',
    hint: 'Place on your left lower leg at the ankle.',
  },
  {
    part: BodyPart.RIGHT_LOWER_LEG,
    label: 'Right ankle',
    hint: 'Place on your right lower leg at the ankle.',
  },
];

export function nodePosition(part: BodyPart | undefined) {
  return NODE_POSITIONS.find((position) => position.part === part);
}

export function nodeKey(tracker: TrackerDataT) {
  return `${tracker.trackerId?.deviceId?.id}:${tracker.trackerId?.trackerNum}`;
}

export function nodeHardwareName(tracker: TrackerDataT) {
  return String(tracker.info?.displayName || `Node ${nodeKey(tracker)}`).replace(
    /^Tracker\s+/,
    'Node '
  );
}

export function nodeLabel(tracker: TrackerDataT) {
  return (
    nodePosition(tracker.info?.bodyPart)?.label ??
    (!tracker.info?.bodyPart ? 'Unassigned' : 'Other position')
  );
}
