import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isUserCenterPath,
  shouldRefreshUserCenterOnEntry,
  shouldRefreshUserCenterOnResume,
} from './refresh';

test('isUserCenterPath only matches the user-center route', () => {
  assert.equal(isUserCenterPath('/user-center'), true);
  assert.equal(isUserCenterPath('/chat'), false);
  assert.equal(isUserCenterPath(null), false);
});

test('shouldRefreshUserCenterOnEntry requires logged-in user on the user-center route', () => {
  assert.equal(
    shouldRefreshUserCenterOnEntry({
      pathname: '/user-center',
      isLoggedIn: true,
      hasUser: true,
    }),
    true,
  );

  assert.equal(
    shouldRefreshUserCenterOnEntry({
      pathname: '/user-center',
      isLoggedIn: false,
      hasUser: true,
    }),
    false,
  );

  assert.equal(
    shouldRefreshUserCenterOnEntry({
      pathname: '/membership',
      isLoggedIn: true,
      hasUser: true,
    }),
    false,
  );
});

test('shouldRefreshUserCenterOnResume only refreshes visible focused user-center sessions', () => {
  assert.equal(
    shouldRefreshUserCenterOnResume({
      pathname: '/user-center',
      isLoggedIn: true,
      hasUser: true,
      visibilityState: 'visible',
      hasFocus: true,
    }),
    true,
  );

  assert.equal(
    shouldRefreshUserCenterOnResume({
      pathname: '/user-center',
      isLoggedIn: true,
      hasUser: true,
      visibilityState: 'hidden',
      hasFocus: true,
    }),
    false,
  );

  assert.equal(
    shouldRefreshUserCenterOnResume({
      pathname: '/user-center',
      isLoggedIn: true,
      hasUser: true,
      visibilityState: 'visible',
      hasFocus: false,
    }),
    false,
  );
});
