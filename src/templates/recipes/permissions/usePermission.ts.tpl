import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { check, openSettings, request, RESULTS } from 'react-native-permissions';
import type { Permission, PermissionStatus } from 'react-native-permissions'; <!-- ts -->

// The status of one permission, and a function to ask for it.
//   granted  the app can use it (or 'limited': iOS lets the user share only some photos)
//   blocked  the user said no for good: only the Settings app can change it, so call openSettings()
export function usePermission(permission{: Permission}) {
  const [status, setStatus] = useState<PermissionStatus | null>(null); <!-- ts -->
  const [status, setStatus] = useState(null); <!-- js -->

  useEffect(() => {
    check(permission).then(setStatus);
    // Check again when the user comes back from the Settings app.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check(permission).then(setStatus);
    });
    return () => subscription.remove();
  }, [permission]);

  // Shows the system dialog (only the first time on iOS; after that it returns the saved answer).
  const ask = useCallback(async () => {
    const result = await request(permission);
    setStatus(result);
    return result;
  }, [permission]);

  return {
    status,
    granted: status === RESULTS.GRANTED || status === RESULTS.LIMITED,
    blocked: status === RESULTS.BLOCKED,
    request: ask,
    openSettings,
  };
}
