import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.donationhub.app',
  appName: 'DonationHub',
  webDir: 'dist',
  server: {
    url: 'https://donationhub-gamma.vercel.app',
    cleartext: false,
  },
};

export default config;