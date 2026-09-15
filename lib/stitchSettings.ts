export const STITCH_SETTING_VALUES = {
  featureQuality: ["lowest", "low", "medium", "high", "ultra"],
  pcQuality: ["lowest", "low", "medium", "high", "ultra"],
  orthophotoResolution: [2, 5, 10, 20],
} as const;

export type StitchSettings = {
  featureQuality: (typeof STITCH_SETTING_VALUES.featureQuality)[number];
  pcQuality: (typeof STITCH_SETTING_VALUES.pcQuality)[number];
  orthophotoResolution: (typeof STITCH_SETTING_VALUES.orthophotoResolution)[number];
};

export const DEFAULT_STITCH_SETTINGS: StitchSettings = {
  featureQuality: "medium",
  pcQuality: "medium",
  orthophotoResolution: 5,
};
