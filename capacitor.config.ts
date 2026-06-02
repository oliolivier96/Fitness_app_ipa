import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.system.fitness",
  appName: "SoloFit",
  webDir: "www",
  bundledWebRuntime: false,
  ios: {
    contentInset: "automatic",
  },
};

export default config;
