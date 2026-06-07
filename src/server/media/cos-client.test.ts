import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTencentCosEndpoint } from './cos-client';

test('buildTencentCosEndpoint uses region host without bucket prefix by default', () => {
  assert.equal(
    buildTencentCosEndpoint('ap-shanghai'),
    'https://cos.ap-shanghai.myqcloud.com',
  );
});

test('buildTencentCosEndpoint honors explicit override', () => {
  assert.equal(
    buildTencentCosEndpoint('ap-shanghai', 'https://cos.ap-shanghai.tencentcos.com'),
    'https://cos.ap-shanghai.tencentcos.com',
  );
});
