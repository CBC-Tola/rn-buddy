// The variables in .env, so TypeScript knows Config.API_URL. Add a line for each new variable.
declare module 'react-native-config' {
  export interface NativeConfig {
    API_URL?: string;
  }

  export const Config: NativeConfig;
  export default Config;
}
