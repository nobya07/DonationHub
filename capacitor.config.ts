import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.donationhub.app',
  appName: 'DonationHub',
  webDir: 'frontend/dist',
  server: {
    url: 'https://donationhub-gamma.vercel.app',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#ffffff',
  },
};

export default config;
