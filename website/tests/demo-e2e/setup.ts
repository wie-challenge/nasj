import { runBrowserSetup } from '../e2e/setup';
export default async function setup() {
  return runBrowserSetup({ demo: true });
}
