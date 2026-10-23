import LogoSvg from '../assets/logo.svg';

// An .svg file imported as a component (thanks to react-native-svg-transformer).
// Width, height and fill can be changed with props, like any react-native-svg element.
export function Logo({ size = 120 }: { size?: number }) { <!-- ts -->
export function Logo({ size = 120 }) { <!-- js -->
  return <LogoSvg width={size} height={size} />;
}
