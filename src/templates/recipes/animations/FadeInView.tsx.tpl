import { useEffect } from 'react';
import type { ReactNode } from 'react'; <!-- ts -->
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

// An example animation: its children fade in and slide up when it appears.
// The animation runs on the UI thread, so it stays smooth even when JavaScript is busy.
export function FadeInView({ children }: { children: ReactNode }) { <!-- ts -->
export function FadeInView({ children }) { <!-- js -->
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: 500 });
  }, [progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 20 }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
