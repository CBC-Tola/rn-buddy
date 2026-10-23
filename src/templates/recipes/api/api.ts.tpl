// Your API's address. jsonplaceholder is a free fake API to practice with: replace it with yours.
const BASE_URL = 'https://jsonplaceholder.typicode.com';

// GETs a path and returns the JSON body. Throws on HTTP errors, so TanStack Query reports them as errors.
export async function getJson<T>(path: string): Promise<T> { <!-- ts -->
export async function getJson(path) { <!-- js -->
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) throw new Error(`Request to ${path} failed: ${response.status}`);
  return response.json();
}
