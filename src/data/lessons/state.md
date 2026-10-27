# State

Local state, shared state and server data: where each kind of value should live, and when a store helps.

## Three kinds of state

1. **Local state**: belongs to one component. Text in an input, whether a modal is open.
   Use `useState`. Most state is local.
2. **Shared app state**: needed by screens far apart. The logged-in user, a cart, settings.
3. **Server data**: a copy of what's on your API. A list of posts, a user profile. It can be loading,
   failed or stale, and someone else can change it.

## Start local, move up when needed

When two components need the same value, move the `useState` to their closest common parent and pass
the value down as props ("lifting state up"). That's enough more often than you'd think.

When props have to travel through many screens that don't use them, share the value instead:

- **React Context**: built into React. Fine for a few values that rarely change (user, theme, language).
  Every component using the context re-renders when the value changes.
- **A store** like Zustand: a small library for state that changes often or is used in many places.
  Components re-render only for the part they read:

```ts
const count = useCounterStore((state) => state.count);
```

## Server data is different

Don't copy API responses into a store by hand with `useEffect`. A data library like TanStack Query
loads, caches, refreshes and retries for you:

```ts
const { data, isLoading, error } = useQuery({ queryKey: ['todos'], queryFn: getTodos });
```

## A quick rule

- Used by one component → `useState`
- Used by a parent and its children → lift it up, pass props
- Used everywhere, changes rarely → Context
- Used everywhere, changes often → Zustand (or another store)
- Comes from an API → TanStack Query

## Related

- `rn-buddy add state` installs Zustand with an example store
- `rn-buddy add api` installs TanStack Query with an example hook
- `rn-buddy structure src` shows how your `src/` folders are organized
