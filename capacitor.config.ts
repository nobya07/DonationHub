import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.donationhub.app',
  appName: 'Astavinayak',
  webDir: 'frontend/dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#ffffff',
  },
};

export default config;
