import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.saltonlinestore.saltstoreios",
  appName: "S.A.L.T.",
  webDir: "../dist",
  bundledWebRuntime: false,
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchFadeOutDuration: 280,
      backgroundColor: "#FFFDF9",
      showSpinner: false,
    },
  },
  ios: {
    handleApplicationNotifications: false,
  },
};

export default config;
