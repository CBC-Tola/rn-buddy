import { useQuery } from '@tanstack/react-query';
import { getJson } from '../services/api';

type Todo = { id: number; title: string; completed: boolean }; <!-- ts -->
<!-- ts -->
// An example query: loads 10 todos. Every component that calls useTodos() shares the same cached data.
export function useTodos() {
  return useQuery({
    queryKey: ['todos'],
    queryFn: () => getJson<Todo[]>('/todos?_limit=10'), <!-- ts -->
    queryFn: () => getJson('/todos?_limit=10'), <!-- js -->
  });
}
