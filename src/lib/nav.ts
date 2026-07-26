// Navigation rules, in one place.
//
// The app opens on the camera because a camera should be instant. But the
// camera is a launch screen, not a home. Everything else hangs off TODAY, which
// is the home screen in the navigation sense: it is what a back press falls
// back to when there is nothing else behind you.
//
// The bug this replaces: the tab bar used `router.replace()`, which throws away
// history. Landing on Photos or Stats left an empty back stack, so the header
// arrow did nothing and Android's back gesture fell through to the OS and
// closed the app. The camera's own quick actions used `push()`, which is why
// those always worked — the inconsistency was the tell.
import { router } from 'expo-router';

export const HOME = '/today' as const;
export const CAMERA = '/' as const;

/**
 * Switch to a main destination. `navigate` keeps history and pops back to an
 * existing instance instead of stacking duplicates, so tabbing around does not
 * grow the stack forever and back still means something.
 */
export function goToTab(route: string) {
  router.navigate(route as never);
}

/** Back to the camera without piling up screens behind it. */
export function goToCamera() {
  if (router.canGoBack()) {
    router.dismissTo(CAMERA as never);
  } else {
    router.replace(CAMERA as never);
  }
}

/**
 * What every header back arrow should call. Falls back to home rather than
 * doing nothing (or dropping out of the app) when the stack is empty — e.g.
 * after a deep link, or a screen opened as the first route.
 */
export function goBackOrHome() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(HOME as never);
  }
}
