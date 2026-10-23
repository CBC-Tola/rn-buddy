import { QueryClient } from '@tanstack/react-query';

// One client for the whole app. It caches query results, so screens share data
// instead of fetching it again.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2, // try failed requests 2 more times
      staleTime: 60 * 1000, // data stays fresh for a minute before it is fetched again
    },
  },
});
